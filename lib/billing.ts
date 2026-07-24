/**
 * Stripe-like billing for Space — real checkout UX, always $0 (free service).
 * No Stripe SDK / keys; sessions persist under data/control/checkouts.json.
 */

import { randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getPlan, type SpacePlan } from "./control-plane";

export type CheckoutPurpose = "provision" | "upgrade";

export type CheckoutSession = {
  id: string;
  status: "open" | "complete" | "expired";
  mode: "subscription";
  purpose: CheckoutPurpose;
  plan: string;
  planTitle: string;
  currency: "usd";
  /** Catalog list price (cents / month). */
  listPriceCents: number;
  /** Always 0 — Space is free. */
  amountDueCents: number;
  hostname?: string;
  customerEmail?: string;
  customerName?: string;
  cardBrand?: string;
  cardLast4?: string;
  createdAt: string;
  completedAt?: string;
  expiresAt: string;
};

type CheckoutStore = {
  version: 1;
  sessions: CheckoutSession[];
};

const SESSION_TTL_MS = 60 * 60 * 1000;

function controlDir(): string {
  return path.join(process.cwd(), "data", "control");
}

function storePath(): string {
  return path.join(controlDir(), "checkouts.json");
}

type Mem = { store: CheckoutStore | null };

function mem(): Mem {
  const g = globalThis as typeof globalThis & { __zatgoSpaceBilling?: Mem };
  if (!g.__zatgoSpaceBilling) g.__zatgoSpaceBilling = { store: null };
  return g.__zatgoSpaceBilling;
}

function ensureDir() {
  fs.mkdirSync(controlDir(), { recursive: true });
}

function readStore(): CheckoutStore {
  const cached = mem().store;
  if (cached) return cached;
  ensureDir();
  const file = storePath();
  if (!fs.existsSync(file)) {
    const fresh: CheckoutStore = { version: 1, sessions: [] };
    writeStore(fresh);
    return fresh;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as CheckoutStore;
    if (!Array.isArray(raw.sessions)) throw new Error("bad shape");
    mem().store = raw;
    return raw;
  } catch {
    const fresh: CheckoutStore = { version: 1, sessions: [] };
    writeStore(fresh);
    return fresh;
  }
}

function writeStore(store: CheckoutStore) {
  ensureDir();
  const tmp = `${storePath()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2), "utf8");
  fs.renameSync(tmp, storePath());
  mem().store = store;
}

function mutate(fn: (store: CheckoutStore) => void): CheckoutStore {
  const store = structuredClone(readStore());
  fn(store);
  writeStore(store);
  return store;
}

function newSessionId(): string {
  return `cs_test_${randomBytes(12).toString("hex")}`;
}

export function planListPriceCents(plan: SpacePlan): number {
  if (typeof plan.priceCents === "number") return plan.priceCents;
  // Fallback parse from legacy mock_price
  const m = plan.mock_price.match(/\$(\d+)/);
  return m ? Number(m[1]) * 100 : 0;
}

export function formatUsd(cents: number): string {
  return `$${(Math.max(0, cents) / 100).toFixed(2)}`;
}

export function createCheckoutSession(input: {
  plan: string;
  purpose: CheckoutPurpose;
  hostname?: string;
}): { ok: true; session: CheckoutSession } | { ok: false; error: string } {
  const plan = getPlan(input.plan);
  if (!plan || !plan.isActive) {
    return { ok: false, error: "Unknown or inactive plan" };
  }
  if (input.purpose === "upgrade" && !input.hostname?.trim()) {
    return { ok: false, error: "Hostname required for plan upgrades" };
  }

  const now = Date.now();
  const session: CheckoutSession = {
    id: newSessionId(),
    status: "open",
    mode: "subscription",
    purpose: input.purpose,
    plan: plan.code,
    planTitle: plan.title,
    currency: "usd",
    listPriceCents: planListPriceCents(plan),
    amountDueCents: 0,
    hostname: input.hostname?.trim().toLowerCase() || undefined,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_TTL_MS).toISOString(),
  };

  mutate((s) => {
    s.sessions = s.sessions.filter((x) => x.status === "complete").slice(-200);
    s.sessions.push(session);
  });

  return { ok: true, session };
}

export function getCheckoutSession(id: string): CheckoutSession | undefined {
  const s = readStore().sessions.find((x) => x.id === id);
  if (!s) return undefined;
  if (s.status === "open" && Date.parse(s.expiresAt) < Date.now()) {
    mutate((store) => {
      const row = store.sessions.find((x) => x.id === id);
      if (row && row.status === "open") row.status = "expired";
    });
    return { ...s, status: "expired" };
  }
  return s;
}

function detectBrand(digits: string): string {
  if (/^4/.test(digits)) return "visa";
  if (/^5[1-5]/.test(digits) || /^2[2-7]/.test(digits)) return "mastercard";
  if (/^3[47]/.test(digits)) return "amex";
  if (/^6(?:011|5)/.test(digits)) return "discover";
  return "card";
}

function luhnOk(num: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = num.length - 1; i >= 0; i--) {
    let n = Number(num[i]);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

export function confirmCheckoutSession(input: {
  sessionId: string;
  email: string;
  name: string;
  cardNumber: string;
  expMonth: string;
  expYear: string;
  cvc: string;
}):
  | { ok: true; session: CheckoutSession }
  | { ok: false; error: string; code?: string } {
  const session = getCheckoutSession(input.sessionId);
  if (!session) return { ok: false, error: "Checkout session not found", code: "NOT_FOUND" };
  if (session.status === "complete") return { ok: true, session };
  if (session.status !== "open") {
    return { ok: false, error: "Checkout session expired. Start again.", code: "EXPIRED" };
  }

  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Enter a valid email", code: "INVALID_EMAIL" };
  }
  if (name.length < 2) {
    return { ok: false, error: "Enter the name on the card", code: "INVALID_NAME" };
  }

  const digits = input.cardNumber.replace(/\D/g, "");
  if (digits.length < 13 || digits.length > 19 || !luhnOk(digits)) {
    return { ok: false, error: "Enter a valid card number", code: "INVALID_CARD" };
  }

  const mm = Number(input.expMonth);
  const yyRaw = input.expYear.trim();
  const yy = yyRaw.length === 2 ? 2000 + Number(yyRaw) : Number(yyRaw);
  if (!Number.isFinite(mm) || mm < 1 || mm > 12 || !Number.isFinite(yy) || yy < 2026) {
    return { ok: false, error: "Enter a valid expiry date", code: "INVALID_EXP" };
  }
  const cvc = input.cvc.replace(/\D/g, "");
  if (cvc.length < 3 || cvc.length > 4) {
    return { ok: false, error: "Enter a valid CVC", code: "INVALID_CVC" };
  }

  // Simulate Stripe processing latency
  // (caller may await a short delay; we keep confirm sync)

  const completed: CheckoutSession = {
    ...session,
    status: "complete",
    amountDueCents: 0,
    customerEmail: email,
    customerName: name,
    cardBrand: detectBrand(digits),
    cardLast4: digits.slice(-4),
    completedAt: new Date().toISOString(),
  };

  mutate((s) => {
    const i = s.sessions.findIndex((x) => x.id === input.sessionId);
    if (i >= 0) s.sessions[i] = completed;
  });

  return { ok: true, session: completed };
}

/** Require a completed checkout for the given plan (and hostname for upgrades). */
export function assertPaidCheckout(opts: {
  sessionId: string | undefined;
  plan: string;
  purpose: CheckoutPurpose;
  hostname?: string;
}): { ok: true; session: CheckoutSession } | { ok: false; error: string } {
  if (!opts.sessionId?.trim()) {
    return { ok: false, error: "Complete checkout before continuing." };
  }
  const session = getCheckoutSession(opts.sessionId.trim());
  if (!session || session.status !== "complete") {
    return { ok: false, error: "Payment not completed. Finish checkout first." };
  }
  if (session.plan !== opts.plan) {
    return { ok: false, error: "Checkout plan does not match the selected plan." };
  }
  if (session.purpose !== opts.purpose) {
    return { ok: false, error: "Checkout session type mismatch." };
  }
  if (
    opts.purpose === "upgrade" &&
    opts.hostname &&
    session.hostname &&
    session.hostname !== opts.hostname.toLowerCase()
  ) {
    return { ok: false, error: "Checkout was for a different site." };
  }
  return { ok: true, session };
}

export function newIdempotencyKey(): string {
  return `ikey_${randomUUID().replace(/-/g, "")}`;
}
