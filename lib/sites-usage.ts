import {
  benchEnv,
  getBackendMemMb,
  getSiteDiskMb,
} from "./bench";

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

export type SitesUsagePayload = {
  ok: boolean;
  pool: PoolSummary;
  sites: SiteUsageRow[];
  metricsSource?: "live" | "snapshot" | "mixed";
  error?: string;
};

type FrappeMessage<T> = {
  message?: { success?: boolean; data?: T; error?: { message?: string } };
};

function authHeaders(): HeadersInit {
  const headers: Record<string, string> = {};
  const token = process.env.SPACE_INTERNAL_TOKEN?.trim();
  if (token) headers["X-Space-Token"] = token;
  if (process.env.FRAPPE_API_KEY && process.env.FRAPPE_API_SECRET) {
    headers.Authorization = `token ${process.env.FRAPPE_API_KEY}:${process.env.FRAPPE_API_SECRET}`;
  }
  return headers;
}

async function fetchControlUsage(): Promise<{
  pool: PoolSummary;
  sites: SiteUsageRow[];
} | null> {
  const base = process.env.FRAPPE_BASE_URL?.replace(/\/$/, "");
  if (!base) return null;
  try {
    const res = await fetch(`${base}/api/method/zatgo_space.api.v1.space.list_sites_usage`, {
      cache: "no-store",
    });
    const json = (await res.json()) as FrappeMessage<{
      pool: PoolSummary;
      sites: SiteUsageRow[];
    }>;
    if (json.message?.success && json.message.data) {
      return {
        pool: json.message.data.pool,
        sites: json.message.data.sites || [],
      };
    }
  } catch {
    // fall through
  }
  return null;
}

async function pushUsageSnapshot(name: string, ramUsedMb: number, diskUsedMb: number) {
  const base = process.env.FRAPPE_BASE_URL?.replace(/\/$/, "");
  const token = process.env.SPACE_INTERNAL_TOKEN?.trim();
  if (!base || !token) return;
  try {
    await fetch(`${base}/api/method/zatgo_space.api.v1.space.update_order_usage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
      },
      body: JSON.stringify({
        name,
        ram_used_mb: ramUsedMb,
        disk_used_mb: diskUsedMb,
      }),
    });
  } catch {
    // best-effort
  }
}

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
  const control = await fetchControlUsage();

  if (!control) {
    return {
      ok: false,
      pool: {
        ramPoolMb: 10240,
        diskPoolMb: 102400,
        allocatedRamMb: 0,
        allocatedDiskMb: 0,
        usedRamMb: 0,
        usedDiskMb: 0,
        freeRamMb: 10240,
        freeDiskMb: 102400,
        siteCount: 0,
      },
      sites: [],
      error: "Could not load sites from control site",
    };
  }

  const { pool, sites } = control;
  if (!refresh || sites.length === 0) {
    return { ok: true, pool, sites, metricsSource: "snapshot" };
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

  // Persist snapshots best-effort (non-blocking)
  void Promise.all(
    enriched.map((s) => pushUsageSnapshot(s.name, s.ramUsedMb, s.diskUsedMb)),
  );

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
  };
}
