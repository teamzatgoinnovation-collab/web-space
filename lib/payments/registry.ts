import { moyasar } from "./moyasar.ts";
import { razorpay } from "./razorpay.ts";
import { priceCents } from "./pricing.ts";
import {
  defaultDeps,
  type Currency,
  type Deps,
  type Expected,
  type PaymentProvider,
  type ProviderId,
  type VerifyResult,
} from "./types.ts";

const ALL: PaymentProvider[] = [moyasar, razorpay];

/** Providers that are switched on (PAYMENT_PROVIDERS allow-list, default all) and have keys. */
export function activeProviders(deps: Deps = defaultDeps()): PaymentProvider[] {
  const allow = (deps.env.PAYMENT_PROVIDERS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return ALL.filter((p) => (allow.length === 0 || allow.includes(p.id)) && p.isConfigured(deps));
}

export function getProvider(id: string): PaymentProvider | undefined {
  return ALL.find((p) => p.id === id);
}

/** Currencies a plan can be bought in right now: priced, and some active provider takes it. */
export function availableCurrencies(planCode: string, deps: Deps = defaultDeps()): Currency[] {
  const active = activeProviders(deps);
  const set = new Set<Currency>();
  for (const p of active) for (const c of p.currencies) if (priceCents(planCode, c, deps.env) !== undefined) set.add(c);
  return [...set];
}

/** Session ids are `<provider>:<payload>`; bare ids from before the registry are Moyasar's. */
export function splitSessionId(id: string): { provider: ProviderId; payload: string } {
  const i = id.indexOf(":");
  if (i > 0) {
    const provider = id.slice(0, i) as ProviderId;
    if (getProvider(provider)) return { provider, payload: id.slice(i + 1) };
  }
  return { provider: "moyasar", payload: id };
}

export async function verifySession(
  sessionId: string,
  expected: Expected,
  deps: Deps = defaultDeps(),
): Promise<VerifyResult & { sessionId?: string }> {
  const { provider, payload } = splitSessionId(sessionId);
  const p = getProvider(provider);
  if (!p || !p.currencies.includes(expected.currency)) return { ok: false, error: "Unexpected payment currency." };
  if (!activeProviders(deps).some((a) => a.id === p.id)) {
    return { ok: false, error: "Payments are not configured yet. Try again later." };
  }
  const r = await p.verify(payload, expected, deps);
  return r.ok ? { ...r, sessionId: `${provider}:${r.paymentId}` } : r;
}
