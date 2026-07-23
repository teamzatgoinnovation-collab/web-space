/**
 * Space control plane owned by space-web (no erp.zatgo.online required).
 * Persists plans, pool settings, and orders under data/control/store.json.
 */

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { benchEnv, domainSuffix, listBenchApps } from "./bench";

export type SpacePlan = {
  code: string;
  title: string;
  mock_price: string;
  features: string[];
  ramLimitMb: number;
  diskLimitMb: number;
  isActive: boolean;
  sortOrder: number;
};

export type SpaceOrderStatus = "Draft" | "Provisioning" | "Active" | "Failed";

export type SpaceOrderApp = { package: string; title: string };

export type SpaceOrder = {
  name: string;
  slug: string;
  hostname: string;
  status: SpaceOrderStatus;
  plan: string;
  paymentMethod: string;
  apps: SpaceOrderApp[];
  jobId?: string;
  deskUrl: string;
  errorMessage?: string;
  adminPasswordSet?: boolean;
  ramUsedMb: number;
  diskUsedMb: number;
  usageUpdatedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SpaceSettings = {
  ramPoolMb: number;
  diskPoolMb: number;
};

export type PoolSummary = {
  ramPoolMb: number;
  diskPoolMb: number;
  allocatedRamMb: number;
  allocatedDiskMb: number;
  usedRamMb: number;
  usedDiskMb: number;
  freeRamMb: number;
  freeDiskMb: number;
  siteCount: number;
};

type ControlStore = {
  version: 1;
  settings: SpaceSettings;
  plans: SpacePlan[];
  orders: SpaceOrder[];
};

const POOL_STATUSES: SpaceOrderStatus[] = ["Draft", "Provisioning", "Active"];

const DEFAULT_PLANS: SpacePlan[] = [
  {
    code: "basic",
    title: "Basic",
    mock_price: "$0 / mo (mock)",
    features: ["1 site", "ERPNext core", "1 GB RAM", "5 GB disk", "Community support"],
    ramLimitMb: 1024,
    diskLimitMb: 5120,
    isActive: true,
    sortOrder: 1,
  },
  {
    code: "pro",
    title: "Pro",
    mock_price: "$49 / mo (mock)",
    features: ["1 site", "ERPNext + HRMS", "3 GB RAM", "15 GB disk", "Priority email support"],
    ramLimitMb: 3072,
    diskLimitMb: 15360,
    isActive: true,
    sortOrder: 2,
  },
  {
    code: "enterprise",
    title: "Enterprise",
    mock_price: "$199 / mo (mock)",
    features: ["Multi-site ready", "Custom apps", "5 GB RAM", "30 GB disk", "Dedicated onboarding"],
    ramLimitMb: 5120,
    diskLimitMb: 30720,
    isActive: true,
    sortOrder: 3,
  },
];

const APP_TITLE_OVERRIDES: Record<string, string> = {
  frappe: "Framework (required)",
  erpnext: "ERPNext",
  hrms: "HR",
  zatgo_core: "ZatGo Core",
  chat_ai: "Chat AI",
  crm: "CRM",
  helpdesk: "Helpdesk",
  telephony: "Telephony",
  tracker: "Tracker",
};

/** Platform / ops apps — not offered in the customer wizard. */
const CATALOG_HIDDEN_APPS = new Set(["zatgo_space"]);

export function titleForApp(pkg: string): string {
  return (
    APP_TITLE_OVERRIDES[pkg] ||
    pkg.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

function controlDir(): string {
  return path.join(process.cwd(), "data", "control");
}

function storePath(): string {
  return path.join(controlDir(), "store.json");
}

function defaultStore(): ControlStore {
  return {
    version: 1,
    settings: {
      ramPoolMb: Number(process.env.SPACE_RAM_POOL_MB) || 10240,
      diskPoolMb: Number(process.env.SPACE_DISK_POOL_MB) || 102400,
    },
    plans: structuredClone(DEFAULT_PLANS),
    orders: [],
  };
}

type Mem = { store: ControlStore | null };

function mem(): Mem {
  const g = globalThis as typeof globalThis & { __zatgoSpaceControl?: Mem };
  if (!g.__zatgoSpaceControl) g.__zatgoSpaceControl = { store: null };
  return g.__zatgoSpaceControl;
}

function ensureDir() {
  fs.mkdirSync(controlDir(), { recursive: true });
}

function readStore(): ControlStore {
  const cached = mem().store;
  if (cached) return cached;

  ensureDir();
  const file = storePath();
  if (!fs.existsSync(file)) {
    const fresh = defaultStore();
    writeStore(fresh);
    return fresh;
  }

  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as ControlStore;
    if (!raw.settings || !Array.isArray(raw.plans) || !Array.isArray(raw.orders)) {
      throw new Error("invalid store shape");
    }
    // Keep seeded plan quotas if plans empty
    if (raw.plans.length === 0) raw.plans = structuredClone(DEFAULT_PLANS);
    mem().store = raw;
    return raw;
  } catch {
    const fresh = defaultStore();
    writeStore(fresh);
    return fresh;
  }
}

function writeStore(store: ControlStore) {
  ensureDir();
  const tmp = `${storePath()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2), "utf8");
  fs.renameSync(tmp, storePath());
  mem().store = store;
}

function mutate(fn: (store: ControlStore) => void): ControlStore {
  const store = structuredClone(readStore());
  fn(store);
  writeStore(store);
  return store;
}

export function listPlans(): SpacePlan[] {
  return readStore()
    .plans.filter((p) => p.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function getPlan(code: string): SpacePlan | undefined {
  return readStore().plans.find((p) => p.code === code);
}

export function getSettings(): SpaceSettings {
  return { ...readStore().settings };
}

export function planQuotas(code: string): { ramLimitMb: number; diskLimitMb: number } {
  const plan = getPlan(code);
  if (plan) return { ramLimitMb: plan.ramLimitMb, diskLimitMb: plan.diskLimitMb };
  const fallback = DEFAULT_PLANS.find((p) => p.code === code);
  return {
    ramLimitMb: fallback?.ramLimitMb || 0,
    diskLimitMb: fallback?.diskLimitMb || 0,
  };
}

export function allocatedPool(excludeName?: string): PoolSummary {
  const store = readStore();
  const settings = store.settings;
  let allocatedRam = 0;
  let allocatedDisk = 0;
  let usedRam = 0;
  let usedDisk = 0;
  let count = 0;

  for (const order of store.orders) {
    if (excludeName && order.name === excludeName) continue;
    if (!POOL_STATUSES.includes(order.status)) continue;
    const q = planQuotas(order.plan);
    allocatedRam += q.ramLimitMb;
    allocatedDisk += q.diskLimitMb;
    usedRam += order.ramUsedMb || 0;
    usedDisk += order.diskUsedMb || 0;
    count += 1;
  }

  return {
    ramPoolMb: settings.ramPoolMb,
    diskPoolMb: settings.diskPoolMb,
    allocatedRamMb: allocatedRam,
    allocatedDiskMb: allocatedDisk,
    usedRamMb: usedRam,
    usedDiskMb: usedDisk,
    freeRamMb: Math.max(0, settings.ramPoolMb - allocatedRam),
    freeDiskMb: Math.max(0, settings.diskPoolMb - allocatedDisk),
    siteCount: count,
  };
}

function nextOrderName(): string {
  const year = new Date().getFullYear();
  const prefix = `SO-${year}-`;
  const existing = readStore().orders.filter((o) => o.name.startsWith(prefix));
  const max = existing.reduce((m, o) => {
    const n = Number.parseInt(o.name.slice(prefix.length), 10);
    return Number.isFinite(n) ? Math.max(m, n) : m;
  }, 0);
  return `${prefix}${String(max + 1).padStart(5, "0")}`;
}

export type CreateOrderInput = {
  slug: string;
  plan: string;
  apps: string[];
  paymentMethod?: string;
};

export type CreateOrderResult =
  | { ok: true; order: SpaceOrder }
  | { ok: false; code: string; message: string };

export function createOrder(input: CreateOrderInput): CreateOrderResult {
  const slug = input.slug.trim().toLowerCase();
  const suffix = domainSuffix();
  const hostname = `${slug}.${suffix}`;
  const plan = getPlan(input.plan);
  if (!plan) {
    return { ok: false, code: "INVALID_PLAN", message: `Unknown plan: ${input.plan}` };
  }

  const store = readStore();
  const taken = store.orders.some(
    (o) =>
      o.hostname === hostname &&
      (o.status === "Draft" || o.status === "Provisioning" || o.status === "Active"),
  );
  if (taken) {
    return { ok: false, code: "HOSTNAME_TAKEN", message: `Hostname already ordered: ${hostname}` };
  }

  const pool = allocatedPool();
  if (pool.allocatedRamMb + plan.ramLimitMb > pool.ramPoolMb) {
    return {
      ok: false,
      code: "POOL_RAM_EXCEEDED",
      message: `Not enough RAM in the server pool (${pool.allocatedRamMb} + ${plan.ramLimitMb} MB needed, ${pool.ramPoolMb} MB total).`,
    };
  }
  if (pool.allocatedDiskMb + plan.diskLimitMb > pool.diskPoolMb) {
    return {
      ok: false,
      code: "POOL_DISK_EXCEEDED",
      message: `Not enough disk in the server pool (${pool.allocatedDiskMb} + ${plan.diskLimitMb} MB needed, ${pool.diskPoolMb} MB total).`,
    };
  }

  const packages = [...new Set(input.apps.filter(Boolean))];
  if (!packages.includes("frappe")) packages.unshift("frappe");

  const now = new Date().toISOString();
  const order: SpaceOrder = {
    name: nextOrderName(),
    slug,
    hostname,
    status: "Draft",
    plan: plan.code,
    paymentMethod: input.paymentMethod || "Mock",
    apps: packages.map((pkg) => ({ package: pkg, title: titleForApp(pkg) })),
    deskUrl: `https://${hostname}`,
    ramUsedMb: 0,
    diskUsedMb: 0,
    usageUpdatedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  mutate((s) => {
    s.orders.push(order);
  });

  return { ok: true, order };
}

export function updateOrder(
  name: string,
  patch: Partial<
    Pick<
      SpaceOrder,
      | "status"
      | "jobId"
      | "errorMessage"
      | "adminPasswordSet"
      | "ramUsedMb"
      | "diskUsedMb"
      | "usageUpdatedAt"
      | "deskUrl"
      | "plan"
      | "apps"
    >
  >,
): SpaceOrder | null {
  let updated: SpaceOrder | null = null;
  mutate((s) => {
    const order = s.orders.find((o) => o.name === name);
    if (!order) return;
    Object.assign(order, patch);
    order.updatedAt = new Date().toISOString();
    updated = structuredClone(order);
  });
  return updated;
}

export function getOrder(name: string): SpaceOrder | undefined {
  return readStore().orders.find((o) => o.name === name);
}

export function getOrderByHostname(hostname: string): SpaceOrder | undefined {
  const active = readStore().orders.filter(
    (o) =>
      o.hostname === hostname &&
      (o.status === "Draft" || o.status === "Provisioning" || o.status === "Active"),
  );
  return active.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
}

/**
 * Upgrade or assign a plan for a hostname.
 * Pool check uses delta for upgrades (new − old).
 */
export function setHostnamePlan(
  hostname: string,
  planCode: string,
): { ok: true; order: SpaceOrder } | { ok: false; code: string; message: string } {
  const plan = getPlan(planCode);
  if (!plan) {
    return { ok: false, code: "INVALID_PLAN", message: `Unknown plan: ${planCode}` };
  }

  const existing = getOrderByHostname(hostname);
  const oldRam = existing ? planQuotas(existing.plan).ramLimitMb : 0;
  const oldDisk = existing ? planQuotas(existing.plan).diskLimitMb : 0;
  const pool = allocatedPool(existing?.name);
  const needRam = pool.allocatedRamMb + plan.ramLimitMb;
  const needDisk = pool.allocatedDiskMb + plan.diskLimitMb;
  // allocatedPool(exclude) already excludes existing; add new plan sizes
  if (needRam > pool.ramPoolMb) {
    return {
      ok: false,
      code: "POOL_RAM_EXCEEDED",
      message: `Not enough memory capacity for this plan (${formatFree(pool.freeRamMb + oldRam)} available after change).`,
    };
  }
  if (needDisk > pool.diskPoolMb) {
    return {
      ok: false,
      code: "POOL_DISK_EXCEEDED",
      message: `Not enough storage capacity for this plan.`,
    };
  }

  if (existing) {
    const updated = updateOrder(existing.name, { plan: plan.code, status: "Active" });
    if (!updated) {
      return { ok: false, code: "UPDATE_FAILED", message: "Could not update plan" };
    }
    return { ok: true, order: updated };
  }

  const suffix = domainSuffix();
  const slug = hostname.endsWith(`.${suffix}`)
    ? hostname.slice(0, -(suffix.length + 1))
    : hostname.split(".")[0] || hostname;
  const now = new Date().toISOString();
  const order: SpaceOrder = {
    name: nextOrderName(),
    slug,
    hostname,
    status: "Active",
    plan: plan.code,
    paymentMethod: "Mock",
    apps: [{ package: "frappe", title: titleForApp("frappe") }],
    deskUrl: `https://${hostname}`,
    ramUsedMb: 0,
    diskUsedMb: 0,
    usageUpdatedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  mutate((s) => {
    s.orders.push(order);
  });
  return { ok: true, order };
}

function formatFree(mb: number): string {
  if (mb >= 1024) return `${Math.round((mb / 1024) * 10) / 10} GB`;
  return `${Math.round(mb)} MB`;
}

export function listActiveSites(): SpaceOrder[] {
  return readStore().orders.filter(
    (o) => o.status === "Provisioning" || o.status === "Active",
  );
}

export function listSitesUsageSnapshot(): {
  pool: PoolSummary;
  sites: {
    name: string;
    slug: string;
    hostname: string;
    status: string;
    plan: string;
    planTitle: string;
    deskUrl: string;
    ramLimitMb: number;
    diskLimitMb: number;
    ramUsedMb: number;
    diskUsedMb: number;
    usageUpdatedAt: string | null;
  }[];
} {
  const pool = allocatedPool();
  const sites = listActiveSites().map((order) => {
    const q = planQuotas(order.plan);
    const plan = getPlan(order.plan);
    return {
      name: order.name,
      slug: order.slug,
      hostname: order.hostname,
      status: order.status,
      plan: order.plan,
      planTitle: plan?.title || order.plan,
      deskUrl: order.deskUrl,
      ramLimitMb: q.ramLimitMb,
      diskLimitMb: q.diskLimitMb,
      ramUsedMb: order.ramUsedMb || 0,
      diskUsedMb: order.diskUsedMb || 0,
      usageUpdatedAt: order.usageUpdatedAt || null,
    };
  });
  return { pool, sites };
}

export async function listCatalogApps(): Promise<
  { package: string; title: string; required: boolean }[]
> {
  let packages: string[] = [];
  try {
    packages = await listBenchApps(benchEnv());
  } catch {
    packages = [];
  }

  const priority: Record<string, number> = { frappe: 0, erpnext: 1 };
  const sorted = [...new Set(packages)]
    .filter((p) => !CATALOG_HIDDEN_APPS.has(p))
    .sort((a, b) => (priority[a] ?? 50) - (priority[b] ?? 50) || a.localeCompare(b));

  if (sorted.length === 0) {
    return [{ package: "frappe", title: "Framework (required)", required: true }];
  }

  return sorted.map((pkg) => ({
    package: pkg,
    title: titleForApp(pkg),
    required: pkg === "frappe",
  }));
}

export async function buildCatalog() {
  const pool = allocatedPool();
  return {
    ok: true as const,
    domainSuffix: domainSuffix(),
    apps: await listCatalogApps(),
    plans: listPlans().map((p) => ({
      code: p.code,
      title: p.title,
      mock_price: p.mock_price,
      features: p.features,
      ramLimitMb: p.ramLimitMb,
      diskLimitMb: p.diskLimitMb,
    })),
    pool: {
      ramPoolMb: pool.ramPoolMb,
      diskPoolMb: pool.diskPoolMb,
      allocatedRamMb: pool.allocatedRamMb,
      allocatedDiskMb: pool.allocatedDiskMb,
      freeRamMb: pool.freeRamMb,
      freeDiskMb: pool.freeDiskMb,
      siteCount: pool.siteCount,
    },
    controlPlane: "space-web" as const,
  };
}

/** Optional dual-write to Frappe — off unless SPACE_FRAPPE_SYNC=1. */
export function frappeSyncEnabled(): boolean {
  return process.env.SPACE_FRAPPE_SYNC === "1" || process.env.SPACE_FRAPPE_SYNC === "true";
}

export async function optionalFrappeNotify(body: Record<string, unknown>) {
  if (!frappeSyncEnabled()) return;
  const base = process.env.FRAPPE_BASE_URL?.replace(/\/$/, "");
  const token = process.env.SPACE_INTERNAL_TOKEN?.trim();
  if (!base || !token) return;
  try {
    await fetch(`${base}/api/method/zatgo_space.api.v1.space.update_order_status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Space-Token": token,
        ...(process.env.FRAPPE_API_KEY && process.env.FRAPPE_API_SECRET
          ? {
              Authorization: `token ${process.env.FRAPPE_API_KEY}:${process.env.FRAPPE_API_SECRET}`,
            }
          : {}),
      },
      body: JSON.stringify(body),
    });
  } catch {
    // best-effort
  }
}

/** Keep DEFAULT_PLANS export for provision plan validation. */
export { DEFAULT_PLANS };

/** Unused UUID helper kept for future job correlation. */
export function newId(): string {
  return randomUUID();
}
