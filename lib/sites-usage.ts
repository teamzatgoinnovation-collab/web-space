import {
  benchEnv,
  domainSuffix,
  getBackendMemMb,
  getSiteDiskMb,
  listSites,
} from "./bench";
import {
  allocatedPool,
  listSitesUsageSnapshot,
  updateOrder,
  type PoolSummary,
} from "./control-plane";

export type SiteKind = "space" | "erp" | "unmanaged";

export type SiteUsageRow = {
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
  /** space = Space Order; erp = erp.zatgo.online; unmanaged = on bench without order */
  kind: SiteKind;
  /** Counts toward soft Space pool (Space Orders only). */
  inPool: boolean;
};

export type { PoolSummary };

export type SitesUsagePayload = {
  ok: boolean;
  pool: PoolSummary;
  sites: SiteUsageRow[];
  metricsSource?: "live" | "snapshot" | "mixed";
  error?: string;
  controlPlane?: "space-web";
  source?: "docker";
};

/** Plan-weighted soft RAM share of measured backend container RSS. */
export function attributeRam(
  totalMemMb: number,
  sites: { ramLimitMb: number; inPool?: boolean }[],
): number[] {
  if (sites.length === 0) return [];
  // Weight by plan limit when present; otherwise equal share weight of 1024
  const weights = sites.map((s) => Math.max(1, s.ramLimitMb || 1024));
  const weightSum = weights.reduce((a, b) => a + b, 0);
  return weights.map((w) => Math.round((totalMemMb * w) / weightSum));
}

function erpHostname(): string {
  return `erp.${domainSuffix()}`;
}

function isDomainSite(hostname: string, suffix: string): boolean {
  if (hostname === `erp.${suffix}`) return true;
  return hostname.endsWith(`.${suffix}`) && hostname.length > suffix.length + 1;
}

function slugFromHostname(hostname: string, suffix: string): string {
  if (hostname === `erp.${suffix}`) return "erp";
  if (hostname.endsWith(`.${suffix}`)) {
    return hostname.slice(0, -(suffix.length + 1));
  }
  return hostname;
}

function buildMergedRows(
  benchHostnames: string[],
  orderRows: ReturnType<typeof listSitesUsageSnapshot>["sites"],
): SiteUsageRow[] {
  const suffix = domainSuffix();
  const erp = erpHostname();
  const byHost = new Map<string, SiteUsageRow>();

  for (const order of orderRows) {
    byHost.set(order.hostname, {
      ...order,
      kind: "space",
      inPool: true,
    });
  }

  for (const hostname of benchHostnames) {
    if (!isDomainSite(hostname, suffix)) continue;
    const existing = byHost.get(hostname);
    if (hostname === erp) {
      byHost.set(hostname, {
        name: existing?.name || "bench:erp",
        slug: "erp",
        hostname,
        status: "Bench",
        plan: "",
        planTitle: "Bench / ERP",
        deskUrl: `https://${hostname}`,
        ramLimitMb: 0,
        diskLimitMb: 0,
        ramUsedMb: existing?.ramUsedMb || 0,
        diskUsedMb: existing?.diskUsedMb || 0,
        usageUpdatedAt: existing?.usageUpdatedAt || null,
        kind: "erp",
        inPool: false,
      });
      continue;
    }
    if (existing) {
      // keep Space order metadata; site exists on Docker
      continue;
    }
    byHost.set(hostname, {
      name: `bench:${hostname}`,
      slug: slugFromHostname(hostname, suffix),
      hostname,
      status: "Unmanaged",
      plan: "",
      planTitle: "Unmanaged",
      deskUrl: `https://${hostname}`,
      ramLimitMb: 0,
      diskLimitMb: 0,
      ramUsedMb: 0,
      diskUsedMb: 0,
      usageUpdatedAt: null,
      kind: "unmanaged",
      inPool: false,
    });
  }

  const rows = [...byHost.values()];
  rows.sort((a, b) => {
    const rank = (k: SiteKind) => (k === "erp" ? 0 : k === "space" ? 1 : 2);
    return rank(a.kind) - rank(b.kind) || a.hostname.localeCompare(b.hostname);
  });
  return rows;
}

export async function collectSitesUsage(opts?: {
  refreshMetrics?: boolean;
}): Promise<SitesUsagePayload> {
  const refresh = opts?.refreshMetrics !== false;
  const env = benchEnv();
  const poolBase = allocatedPool();
  const snapshot = listSitesUsageSnapshot();

  let benchHostnames: string[] = [];
  let listError: string | undefined;
  try {
    const listed = await listSites(env);
    if (!listed.result.ok && listed.sites.length === 0) {
      listError = listed.result.stderr || "Could not list Docker sites";
    }
    benchHostnames = listed.sites;
  } catch (err) {
    listError = err instanceof Error ? err.message : String(err);
  }

  let sites = buildMergedRows(benchHostnames, snapshot.sites);

  // Fallback: orders only if Docker list failed entirely
  if (sites.length === 0 && snapshot.sites.length > 0) {
    sites = snapshot.sites.map((s) => ({ ...s, kind: "space" as const, inPool: true }));
  }

  if (!refresh || sites.length === 0) {
    return {
      ok: true,
      pool: {
        ...poolBase,
        usedRamMb: snapshot.pool.usedRamMb,
        usedDiskMb: snapshot.pool.usedDiskMb,
      },
      sites,
      metricsSource: "snapshot",
      controlPlane: "space-web",
      source: "docker",
      error: listError,
    };
  }

  const [backendMem, diskSizes] = await Promise.all([
    getBackendMemMb(env),
    Promise.all(sites.map((s) => getSiteDiskMb(env, s.hostname))),
  ]);

  const ramShares = attributeRam(backendMem, sites);
  const now = new Date().toISOString();
  const enriched: SiteUsageRow[] = sites.map((site, i) => ({
    ...site,
    ramUsedMb: ramShares[i] ?? site.ramUsedMb ?? 0,
    diskUsedMb: diskSizes[i] ?? site.diskUsedMb ?? 0,
    usageUpdatedAt: now,
  }));

  for (const s of enriched) {
    if (s.kind === "space" && !s.name.startsWith("bench:")) {
      updateOrder(s.name, {
        ramUsedMb: s.ramUsedMb,
        diskUsedMb: s.diskUsedMb,
        usageUpdatedAt: now,
      });
    }
  }

  // Pool "used" = Space Orders only (erp/unmanaged excluded from pool accounting)
  const usedRamMb = enriched.filter((s) => s.inPool).reduce((sum, s) => sum + s.ramUsedMb, 0);
  const usedDiskMb = enriched.filter((s) => s.inPool).reduce((sum, s) => sum + s.diskUsedMb, 0);

  return {
    ok: true,
    pool: {
      ...poolBase,
      usedRamMb,
      usedDiskMb,
    },
    sites: enriched,
    metricsSource: "live",
    controlPlane: "space-web",
    source: "docker",
    error: listError,
  };
}
