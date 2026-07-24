import {
  benchEnv,
  domainSuffix,
  getBackendMemStats,
  getSiteDiskMb,
  listInstalledAppsOnSite,
  listSites,
} from "./bench";
import {
  allocatedPool,
  listSitesUsageSnapshot,
  updateOrder,
  type PoolSummary,
} from "./control-plane";
import { sitesLog } from "./sites-activity";
import { isDevConsoleEnabled } from "./dev-console";

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
  /** Soft share of live container RSS (sites share one Docker process). */
  ramUsedMb: number;
  /** Live `du -sm sites/<hostname>` from Docker. */
  diskUsedMb: number;
  /** Live `bench list-apps` on this site. */
  apps: string[];
  usageUpdatedAt: string | null;
  kind: SiteKind;
  inPool: boolean;
  onDocker: boolean;
};

export type MeasuredBench = {
  /** Live docker stats used MB */
  ramUsedMb: number;
  /** Live docker stats limit MB */
  ramLimitMb: number;
  /** Sum of live site directory sizes */
  diskUsedMb: number;
  siteCount: number;
  containerMemRaw?: string;
};

export type { PoolSummary };

export type SitesUsagePayload = {
  ok: boolean;
  pool: PoolSummary;
  /** Live Docker measurements (not soft-quota bookkeeping). */
  measured: MeasuredBench;
  sites: SiteUsageRow[];
  metricsSource?: "live" | "snapshot" | "mixed";
  error?: string;
  controlPlane?: "space-web";
  source?: "docker";
};

type UsageCacheEntry = { at: number; payload: SitesUsagePayload };

const usageCache = new Map<string, UsageCacheEntry>();
const usageInflight = new Map<string, Promise<SitesUsagePayload>>();

/** Equal soft RAM share of measured backend container RSS across listed sites. */
export function attributeRamEqual(totalMemMb: number, siteCount: number): number[] {
  if (siteCount <= 0) return [];
  const each = Math.round(totalMemMb / siteCount);
  return Array.from({ length: siteCount }, () => each);
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
  const onDocker = new Set(benchHostnames.filter((h) => isDomainSite(h, suffix)));
  const byHost = new Map<string, SiteUsageRow>();

  // Prefer Docker as source of truth for which sites exist
  for (const hostname of onDocker) {
    if (hostname === erp) {
      byHost.set(hostname, {
        name: "bench:erp",
        slug: "erp",
        hostname,
        status: "Active",
        plan: "",
        planTitle: "Bench / ERP",
        deskUrl: `https://${hostname}`,
        ramLimitMb: 0,
        diskLimitMb: 0,
        ramUsedMb: 0,
        diskUsedMb: 0,
        apps: [],
        usageUpdatedAt: null,
        kind: "erp",
        inPool: false,
        onDocker: true,
      });
      continue;
    }
    const order = orderRows.find((o) => o.hostname === hostname);
    if (order) {
      byHost.set(hostname, {
        ...order,
        apps: [],
        kind: "space",
        inPool: true,
        onDocker: true,
      });
    } else {
      byHost.set(hostname, {
        name: `bench:${hostname}`,
        slug: slugFromHostname(hostname, suffix),
        hostname,
        status: "Active",
        plan: "",
        planTitle: "On Docker",
        deskUrl: `https://${hostname}`,
        ramLimitMb: 0,
        diskLimitMb: 0,
        ramUsedMb: 0,
        diskUsedMb: 0,
        apps: [],
        usageUpdatedAt: null,
        kind: "unmanaged",
        inPool: false,
        onDocker: true,
      });
    }
  }

  // Provisioning Space Orders not on disk yet
  for (const order of orderRows) {
    if (byHost.has(order.hostname)) continue;
    byHost.set(order.hostname, {
      ...order,
      apps: [],
      kind: "space",
      inPool: true,
      onDocker: false,
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
  const cacheKey = refresh ? "live" : "snap";
  const ttlMs = refresh ? 60_000 : 20_000;
  const hit = usageCache.get(cacheKey);
  if (hit && Date.now() - hit.at < ttlMs) {
    return { ...hit.payload, metricsSource: refresh ? "live" : "snapshot" };
  }

  // Single-flight: avoid stampeding the bench on concurrent page loads
  const existing = usageInflight.get(cacheKey);
  if (existing) return existing;

  const promise = collectSitesUsageUncached({ refreshMetrics: refresh })
    .then((payload) => {
      usageCache.set(cacheKey, { at: Date.now(), payload });
      // Warm snap cache from live results too
      if (refresh && payload.ok) {
        usageCache.set("snap", {
          at: Date.now(),
          payload: {
            ...payload,
            metricsSource: "snapshot",
          },
        });
      }
      return payload;
    })
    .finally(() => {
      usageInflight.delete(cacheKey);
    });
  usageInflight.set(cacheKey, promise);
  return promise;
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, Math.max(1, items.length)) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
  return out;
}

async function collectSitesUsageUncached(opts?: {
  refreshMetrics?: boolean;
}): Promise<SitesUsagePayload> {
  const refresh = opts?.refreshMetrics !== false;
  const env = benchEnv();
  const poolBase = allocatedPool();
  const snapshot = listSitesUsageSnapshot();
  const t0 = Date.now();
  const log = isDevConsoleEnabled();

  if (log) {
    sitesLog(`── sites refresh start (env=${env}, refresh=${refresh}) ──`);
  }

  let benchHostnames: string[] = [];
  let listError: string | undefined;
  try {
    if (log) sitesLog("listing site directories…");
    const listed = await listSites(env);
    if (!listed.result.ok && listed.sites.length === 0) {
      listError = listed.result.stderr || "Could not list Docker sites";
      if (log) {
        sitesLog(`list sites FAILED (${Date.now() - t0}ms): ${listError.slice(0, 240)}`);
        if (/timed out|timeout|Connection timed out|Connection refused/i.test(listError)) {
          sitesLog("hint: SSH to droplet unreachable — check network / DO_SSH_HOST");
        }
      }
    } else {
      benchHostnames = listed.sites;
      if (log) {
        sitesLog(`list sites ok · ${benchHostnames.length} entries · ${Date.now() - t0}ms`);
        for (const h of benchHostnames) sitesLog(`  dir ${h}`);
      }
    }
  } catch (err) {
    listError = err instanceof Error ? err.message : String(err);
    if (log) sitesLog(`list sites error (${Date.now() - t0}ms): ${listError}`);
  }

  let sites = buildMergedRows(benchHostnames, snapshot.sites);
  if (log) {
    sitesLog(
      `merged ${sites.length} rows · orders=${snapshot.sites.length} · poolAllocatedRam=${poolBase.allocatedRamMb}MB`,
    );
  }

  const emptyMeasured: MeasuredBench = {
    ramUsedMb: 0,
    ramLimitMb: 0,
    diskUsedMb: 0,
    siteCount: sites.filter((s) => s.onDocker).length,
  };

  if (!refresh) {
    if (log) sitesLog(`snapshot only · ${Date.now() - t0}ms`);
    return {
      ok: !(listError && sites.length === 0),
      pool: poolBase,
      measured: emptyMeasured,
      sites,
      metricsSource: "snapshot",
      controlPlane: "space-web",
      source: "docker",
      error: listError,
    };
  }

  if (sites.length === 0) {
    if (log) sitesLog("no sites — sampling container memory only…");
    const mem = await getBackendMemStats(env);
    if (log) sitesLog(`memory ${mem.raw || `${mem.usedMb}/${mem.limitMb} MB`} · ${Date.now() - t0}ms`);
    return {
      ok: !listError,
      pool: poolBase,
      measured: {
        ramUsedMb: mem.usedMb,
        ramLimitMb: mem.limitMb,
        diskUsedMb: 0,
        siteCount: 0,
        containerMemRaw: mem.raw,
      },
      sites: [],
      metricsSource: "live",
      controlPlane: "space-web",
      source: "docker",
      error: listError,
    };
  }

  const dockerSites = sites.filter((s) => s.onDocker);
  if (log) sitesLog(`sampling memory, disk, apps for ${dockerSites.length} live sites…`);

  const mem = await getBackendMemStats(env);
  if (log) sitesLog(`container memory: ${mem.raw || `${mem.usedMb} / ${mem.limitMb} MB`}`);

  // Low concurrency — parallel docker exec storms the 1-vCPU droplet
  const metrics = await mapPool(sites, 2, async (s) => {
    if (!s.onDocker) return { diskUsedMb: 0, apps: [] as string[] };
    const diskUsedMb = await getSiteDiskMb(env, s.hostname);
    const apps = await listInstalledAppsOnSite(env, s.hostname);
    if (log) {
      sitesLog(`${s.hostname} disk=${diskUsedMb} MB apps=${apps.join(",") || "(none)"}`);
    }
    return { diskUsedMb, apps };
  });

  const ramShares = attributeRamEqual(mem.usedMb, Math.max(1, dockerSites.length));
  let dockerIdx = 0;
  const now = new Date().toISOString();

  const enriched: SiteUsageRow[] = sites.map((site, i) => {
    const diskUsedMb = metrics[i]?.diskUsedMb ?? 0;
    const apps = metrics[i]?.apps ?? [];
    let ramUsedMb = 0;
    if (site.onDocker) {
      ramUsedMb = ramShares[dockerIdx] ?? 0;
      dockerIdx += 1;
    }
    return {
      ...site,
      ramUsedMb,
      diskUsedMb,
      apps,
      usageUpdatedAt: now,
      status: site.onDocker
        ? site.kind === "space"
          ? site.status || "Active"
          : "Active"
        : site.status,
    };
  });

  for (const s of enriched) {
    if (s.kind === "space" && !s.name.startsWith("bench:")) {
      updateOrder(s.name, {
        ramUsedMb: s.ramUsedMb,
        diskUsedMb: s.diskUsedMb,
        usageUpdatedAt: now,
      });
    }
  }

  const measuredDisk = enriched
    .filter((s) => s.onDocker)
    .reduce((sum, s) => sum + s.diskUsedMb, 0);

  const poolUsedRam = enriched.filter((s) => s.inPool).reduce((sum, s) => sum + s.ramUsedMb, 0);
  const poolUsedDisk = enriched.filter((s) => s.inPool).reduce((sum, s) => sum + s.diskUsedMb, 0);

  if (log) {
    sitesLog(
      `done · sites=${enriched.length} diskTotal=${measuredDisk}MB mem=${mem.usedMb}MB · ${Date.now() - t0}ms`,
    );
  }

  return {
    ok: true,
    pool: {
      ...poolBase,
      usedRamMb: poolUsedRam,
      usedDiskMb: poolUsedDisk,
    },
    measured: {
      ramUsedMb: mem.usedMb,
      ramLimitMb: mem.limitMb,
      diskUsedMb: measuredDisk,
      siteCount: dockerSites.length,
      containerMemRaw: mem.raw,
    },
    sites: enriched,
    metricsSource: "live",
    controlPlane: "space-web",
    source: "docker",
    error: listError,
  };
}
