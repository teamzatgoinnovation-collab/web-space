/**
 * Read-only health checks for one tenant site. The only host ever probed is the
 * site's own `<slug>.<domain suffix>` name (no user-supplied hosts, no redirects
 * followed) so the endpoint can't be used to scan arbitrary addresses.
 */

import dns from "node:dns/promises";

export type CheckStatus = "pass" | "fail" | "pending";
export type Check = { id: string; label: string; status: CheckStatus; detail?: string };

export function isOwnSiteHost(hostname: string, suffix: string): boolean {
  const s = suffix.trim().toLowerCase().replace(/^\./, "");
  if (!s) return false;
  const re = new RegExp(`^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
  return re.test(hostname.trim().toLowerCase());
}

export type DiagDeps = {
  resolve4: (host: string) => Promise<string[]>;
  fetch: typeof fetch;
  env: Record<string, string | undefined>;
};

export const defaultDiagDeps = (): DiagDeps => ({
  resolve4: (h) => dns.resolve4(h),
  fetch: (...a) => fetch(...a),
  env: process.env,
});

const TLS_HINT = /cert|ssl|tls|self.signed|expired|altname/i;

export async function runDiagnostics(
  site: { hostname: string; status: string },
  deps: DiagDeps = defaultDiagDeps(),
): Promise<Check[]> {
  const suffix = deps.env.SPACE_DOMAIN_SUFFIX || "";
  const host = site.hostname.trim().toLowerCase();
  if (!isOwnSiteHost(host, suffix)) {
    return [{ id: "host", label: "Site address", status: "fail", detail: "Not a platform address." }];
  }

  const checks: Check[] = [];
  const state = site.status;
  checks.push({
    id: "record",
    label: "Site record",
    status: state === "Active" ? "pass" : state === "Provisioning" || state === "Draft" ? "pending" : "fail",
    detail: state,
  });

  const expectedIp = deps.env.SPACE_DROPLET_IP?.trim();
  try {
    const ips = await deps.resolve4(host);
    const ok = !expectedIp || ips.includes(expectedIp);
    checks.push({ id: "dns", label: "DNS points to the platform", status: ok ? "pass" : "fail", detail: ips.join(", ") });
  } catch {
    checks.push({ id: "dns", label: "DNS points to the platform", status: "fail", detail: "Address does not resolve." });
  }

  try {
    const res = await deps.fetch(`https://${host}/api/method/ping`, {
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    checks.push({ id: "https", label: "HTTPS certificate valid", status: "pass", detail: "Secure connection established." });
    checks.push({
      id: "ping",
      label: "Site responds",
      status: res.status === 200 ? "pass" : "fail",
      detail: `HTTP ${res.status}`,
    });
  } catch (err) {
    const msg = err instanceof Error ? `${err.message} ${(err as { cause?: { code?: string } }).cause?.code ?? ""}` : "";
    const tls = TLS_HINT.test(msg);
    checks.push({
      id: "https",
      label: "HTTPS certificate valid",
      status: "fail",
      detail: tls ? "The certificate is missing or invalid." : "Could not connect.",
    });
    checks.push({ id: "ping", label: "Site responds", status: "fail", detail: tls ? "Skipped" : "No response." });
  }
  return checks;
}
