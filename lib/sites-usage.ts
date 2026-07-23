import { benchEnv, getBackendMemMb, getSiteDiskMb } from "./bench";
import {
  allocatedPool,
  listSitesUsageSnapshot,
  updateOrder,
  type PoolSummary,
} from "./control-plane";

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
};

export type { PoolSummary };

export type SitesUsagePayload = {
  ok: boolean;
  pool: PoolSummary;
  sites: SiteUsageRow[];
  metricsSource?: "live" | "snapshot" | "mixed";
  error?: string;
  controlPlane?: "space-web";
};

/** Plan-weighted soft RAM share of measured backend container RSS. */
export function attributeRam(
  totalMemMb: number,
  sites: { ramLimitMb: number }[],
): number[] {
  if (sites.length === 0) return [];
  const weightSum = sites.reduce((s, x) => s + Math.max(1, x.ramLimitMb || 1), 0);
  return sites.map((site) => {
    const w = Math.max(1, site.ramLimitMb || 1);
    return Math.round((totalMemMb * w) / weightSum);
  });
}

export async function collectSitesUsage(opts?: {
  refreshMetrics?: boolean;
}): Promise<SitesUsagePayload> {
  const refresh = opts?.refreshMetrics !== false;
  const snapshot = listSitesUsageSnapshot();
  const { sites } = snapshot;
  const pool = allocatedPool();

  if (!refresh || sites.length === 0) {
    return {
      ok: true,
      pool: { ...pool, usedRamMb: snapshot.pool.usedRamMb, usedDiskMb: snapshot.pool.usedDiskMb },
      sites,
      metricsSource: "snapshot",
      controlPlane: "space-web",
    };
  }

  const env = benchEnv();
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
    updateOrder(s.name, {
      ramUsedMb: s.ramUsedMb,
      diskUsedMb: s.diskUsedMb,
      usageUpdatedAt: now,
    });
  }

  const usedRamMb = enriched.reduce((sum, s) => sum + s.ramUsedMb, 0);
  const usedDiskMb = enriched.reduce((sum, s) => sum + s.diskUsedMb, 0);

  return {
    ok: true,
    pool: {
      ...pool,
      usedRamMb,
      usedDiskMb,
    },
    sites: enriched,
    metricsSource: "live",
    controlPlane: "space-web",
  };
}
