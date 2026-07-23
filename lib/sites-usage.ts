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

  const emptyMeasured: MeasuredBench = {
    ramUsedMb: 0,
    ramLimitMb: 0,
    diskUsedMb: 0,
    siteCount: sites.filter((s) => s.onDocker).length,
  };

  if (!refresh) {
    return {
      ok: true,
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
    const mem = await getBackendMemStats(env);
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
  const [mem, diskSizes, appsLists] = await Promise.all([
    getBackendMemStats(env),
    Promise.all(sites.map((s) => (s.onDocker ? getSiteDiskMb(env, s.hostname) : Promise.resolve(0)))),
    Promise.all(
      sites.map((s) => (s.onDocker ? listInstalledAppsOnSite(env, s.hostname) : Promise.resolve([]))),
    ),
  ]);

  const ramShares = attributeRamEqual(mem.usedMb, Math.max(1, dockerSites.length));
  let dockerIdx = 0;
  const now = new Date().toISOString();

  const enriched: SiteUsageRow[] = sites.map((site, i) => {
    const diskUsedMb = diskSizes[i] ?? 0;
    const apps = appsLists[i] ?? [];
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
      // Prefer live status when site exists on Docker
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

  // Soft pool "used" for Space Orders only (bookkeeping)
  const poolUsedRam = enriched.filter((s) => s.inPool).reduce((sum, s) => sum + s.ramUsedMb, 0);
  const poolUsedDisk = enriched.filter((s) => s.inPool).reduce((sum, s) => sum + s.diskUsedMb, 0);

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
