/**
 * Site management actions (install/uninstall apps, plan change, clear cache).
 */

import {
  assertPackageName,
  assertSiteName,
  benchEnv,
  clearCache,
  domainSuffix,
  getBackendMemStats,
  getSiteDiskMb,
  installApp,
  listBenchApps,
  listInstalledAppsOnSite,
  listSites,
  refreshSiteAfterChange,
  uninstallApp,
} from "./bench";
import { attributeRamEqual } from "./sites-usage";
import {
  getOrderByHostname,
  listPlans,
  planQuotas,
  setHostnamePlan,
  titleForApp,
  updateOrder,
} from "./control-plane";
import { assertPaidCheckout } from "./billing";
import { sitesLog } from "./sites-activity";
import { isDevConsoleEnabled } from "./dev-console";

const PROTECTED_APPS = new Set(["frappe"]);
const HIDDEN_INSTALL = new Set(["zatgo_space"]);

export function hostnameFromSlug(slug: string): string {
  const s = slug.trim().toLowerCase();
  if (s.includes(".")) return assertSiteName(s);
  return assertSiteName(`${s}.${domainSuffix()}`);
}

export function slugFromHostname(hostname: string): string {
  const suffix = domainSuffix();
  if (hostname === `erp.${suffix}`) return "erp";
  if (hostname.endsWith(`.${suffix}`)) return hostname.slice(0, -(suffix.length + 1));
  return hostname;
}

export type SiteDetail = {
  hostname: string;
  slug: string;
  deskUrl: string;
  onDocker: boolean;
  kind: "erp" | "space" | "unmanaged";
  orderName?: string;
  plan?: string;
  planTitle?: string;
  ramLimitMb: number;
  diskLimitMb: number;
  diskUsedMb: number;
  /** Soft share of shared platform memory for this site. */
  ramUsedMb: number;
  installedApps: { package: string; title: string; canUninstall: boolean }[];
  availableApps: { package: string; title: string }[];
  plans: {
    code: string;
    title: string;
    mock_price: string;
    priceCents: number;
    dueTodayCents: number;
    ramLimitMb: number;
    diskLimitMb: number;
    features: string[];
  }[];
};

export async function getSiteDetail(hostname: string): Promise<SiteDetail> {
  const env = benchEnv();
  const host = assertSiteName(hostname);
  const log = isDevConsoleEnabled();
  if (log) sitesLog(`manage: load ${host}`);

  const [listed, installed, benchApps, diskUsedMb, mem] = await Promise.all([
    listSites(env),
    listInstalledAppsOnSite(env, host),
    listBenchApps(env),
    getSiteDiskMb(env, host),
    getBackendMemStats(env),
  ]);

  const onDocker = listed.sites.includes(host);
  const order = getOrderByHostname(host);
  const suffix = domainSuffix();
  const kind =
    host === `erp.${suffix}` ? "erp" : order ? "space" : ("unmanaged" as const);
  const q = order ? planQuotas(order.plan) : { ramLimitMb: 0, diskLimitMb: 0 };

  const dockerCount = Math.max(1, listed.sites.length);
  const ramShares = attributeRamEqual(mem.usedMb, dockerCount);
  const dockerIndex = listed.sites.indexOf(host);
  const ramUsedMb =
    onDocker && dockerIndex >= 0 ? ramShares[dockerIndex] ?? 0 : 0;

  const installedSet = new Set(installed);
  const installedApps = installed.map((pkg) => ({
    package: pkg,
    title: titleForApp(pkg),
    canUninstall: !PROTECTED_APPS.has(pkg),
  }));

  const availableApps = benchApps
    .filter((pkg) => !installedSet.has(pkg) && !HIDDEN_INSTALL.has(pkg))
    .map((pkg) => ({ package: pkg, title: titleForApp(pkg) }));

  if (log) {
    sitesLog(
      `manage: ${host} onDocker=${onDocker} apps=${installed.join(",") || "(none)"} disk=${diskUsedMb}MB ram~${ramUsedMb}MB`,
    );
  }

  return {
    hostname: host,
    slug: slugFromHostname(host),
    deskUrl: `https://${host}`,
    onDocker,
    kind,
    orderName: order?.name,
    plan: order?.plan,
    planTitle: order ? listPlans().find((p) => p.code === order.plan)?.title || order.plan : undefined,
    ramLimitMb: q.ramLimitMb,
    diskLimitMb: q.diskLimitMb,
    diskUsedMb,
    ramUsedMb,
    installedApps,
    availableApps,
    plans: listPlans().map((p) => ({
      code: p.code,
      title: p.title,
      mock_price: p.mock_price,
      priceCents: p.priceCents ?? 0,
      dueTodayCents: 0,
      ramLimitMb: p.ramLimitMb,
      diskLimitMb: p.diskLimitMb,
      features: p.features,
    })),
  };
}

export async function manageInstallApp(
  hostname: string,
  pkg: string,
): Promise<{ ok: true; apps: string[] } | { ok: false; error: string }> {
  const env = benchEnv();
  const host = assertSiteName(hostname);
  const app = assertPackageName(pkg);
  if (HIDDEN_INSTALL.has(app)) {
    return { ok: false, error: "That app cannot be installed from Space." };
  }
  if (isDevConsoleEnabled()) sitesLog(`manage: install-app ${app} on ${host}`);
  const r = await installApp(env, host, app);
  if (!r.ok) {
    if (isDevConsoleEnabled()) sitesLog(`manage: install FAILED ${r.stderr.slice(0, 200)}`);
    return { ok: false, error: benchUserError(r.stderr, "Could not install that app.") };
  }
  // install-app → migrate → clear-cache (bench ops)
  if (isDevConsoleEnabled()) sitesLog(`manage: migrate + clear-cache ${host}`);
  const refresh = await refreshSiteAfterChange(env, host);
  if (!refresh.ok && isDevConsoleEnabled()) {
    sitesLog(`manage: refresh after install WARN ${refresh.stderr.slice(0, 200)}`);
  }
  const apps = await listInstalledAppsOnSite(env, host);
  const order = getOrderByHostname(host);
  if (order) {
    updateOrder(order.name, {
      apps: apps.map((p) => ({ package: p, title: titleForApp(p) })),
    });
  }
  if (isDevConsoleEnabled()) sitesLog(`manage: install ok · ${apps.join(",")}`);
  return { ok: true, apps };
}

export async function manageUninstallApp(
  hostname: string,
  pkg: string,
): Promise<{ ok: true; apps: string[] } | { ok: false; error: string }> {
  const env = benchEnv();
  const host = assertSiteName(hostname);
  const app = assertPackageName(pkg);
  if (PROTECTED_APPS.has(app)) {
    return { ok: false, error: "The framework app cannot be removed." };
  }
  if (isDevConsoleEnabled()) sitesLog(`manage: uninstall-app ${app} on ${host}`);
  const r = await uninstallApp(env, host, app);
  if (!r.ok) {
    if (isDevConsoleEnabled()) sitesLog(`manage: uninstall FAILED ${r.stderr.slice(0, 200)}`);
    return { ok: false, error: benchUserError(r.stderr, "Could not remove that app.") };
  }
  // uninstall-app → clear-cache (and migrate if schema leftovers)
  if (isDevConsoleEnabled()) sitesLog(`manage: migrate + clear-cache ${host}`);
  const refresh = await refreshSiteAfterChange(env, host);
  if (!refresh.ok && isDevConsoleEnabled()) {
    sitesLog(`manage: refresh after uninstall WARN ${refresh.stderr.slice(0, 200)}`);
  }
  const apps = await listInstalledAppsOnSite(env, host);
  const order = getOrderByHostname(host);
  if (order) {
    updateOrder(order.name, {
      apps: apps.map((p) => ({ package: p, title: titleForApp(p) })),
    });
  }
  if (isDevConsoleEnabled()) sitesLog(`manage: uninstall ok · ${apps.join(",") || "(none)"}`);
  return { ok: true, apps };
}

export async function manageClearCache(
  hostname: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const env = benchEnv();
  const host = assertSiteName(hostname);
  if (isDevConsoleEnabled()) sitesLog(`manage: clear-cache ${host}`);
  const r = await clearCache(env, host);
  if (!r.ok) {
    return { ok: false, error: benchUserError(r.stderr, "Could not refresh the site.") };
  }
  return { ok: true };
}

/** Full bench refresh: migrate + clear-cache. */
export async function manageMigrate(
  hostname: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const env = benchEnv();
  const host = assertSiteName(hostname);
  if (isDevConsoleEnabled()) sitesLog(`manage: migrate ${host}`);
  const r = await refreshSiteAfterChange(env, host);
  if (!r.ok) {
    return { ok: false, error: benchUserError(r.stderr, "Could not update the site.") };
  }
  return { ok: true };
}

function benchUserError(stderr: string, fallback: string): string {
  const s = (stderr || "").toLowerCase();
  if (/timed out|timeout|connection timed out|unreachable|no route/.test(s)) {
    return "Could not reach the server. Try again in a moment.";
  }
  if (/permission|not permitted|access denied/.test(s)) {
    return "That action is not allowed on this site.";
  }
  return `${fallback} Try again later.`;
}

export function manageSetPlan(
  hostname: string,
  planCode: string,
  checkoutSessionId?: string,
): { ok: true; plan: string; planTitle: string } | { ok: false; error: string } {
  const host = assertSiteName(hostname);
  if (isDevConsoleEnabled()) sitesLog(`manage: set plan ${planCode} for ${host}`);

  const paid = assertPaidCheckout({
    sessionId: checkoutSessionId,
    plan: planCode,
    purpose: "upgrade",
    hostname: host,
  });
  if (!paid.ok) return { ok: false, error: paid.error };

  const result = setHostnamePlan(host, planCode, {
    paymentMethod: "Stripe",
    checkoutSessionId: paid.session.id,
  });
  if (!result.ok) {
    return { ok: false, error: result.message };
  }
  const title =
    listPlans().find((p) => p.code === result.order.plan)?.title || result.order.plan;
  return { ok: true, plan: result.order.plan, planTitle: title };
}

// re-export titleForApp for callers - need to export from control-plane
export { titleForApp } from "./control-plane";
