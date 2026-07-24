/**
 * Client for Space Frappe control plane APIs on space.zatgo.online.
 */

const baseUrl = () =>
  (process.env.FRAPPE_BASE_URL || process.env.SPACE_FRAPPE_URL || "https://space.zatgo.online").replace(
    /\/$/,
    "",
  );

function authHeaders(): Record<string, string> {
  const key = process.env.FRAPPE_API_KEY?.trim();
  const secret = process.env.FRAPPE_API_SECRET?.trim();
  const token = process.env.SPACE_INTERNAL_TOKEN?.trim();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (key && secret) {
    headers.Authorization = `token ${key}:${secret}`;
  }
  if (token) {
    headers["X-Space-Token"] = token;
  }
  return headers;
}

export function frappeControlEnabled(): boolean {
  const mode = (process.env.SPACE_CONTROL_PLANE || "frappe").toLowerCase();
  if (mode === "local") return false;
  return Boolean(baseUrl());
}

async function callMethod(method: string, body?: Record<string, unknown>): Promise<unknown> {
  const url = `${baseUrl()}/api/method/${method}`;
  const res = await fetch(url, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body || {}),
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      (json as { message?: string; exc?: string })?.message ||
      (json as { _error_message?: string })?._error_message ||
      `Frappe ${res.status}`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  // Frappe wraps whitelist returns in { message: ... }
  return (json as { message?: unknown }).message ?? json;
}

export async function frappeListCatalog() {
  return callMethod("space.api.v1.space.list_catalog");
}

export async function frappeListSites() {
  return callMethod("space.api.v1.space.list_sites");
}

export async function frappeGetSite(name: string) {
  return callMethod("space.api.v1.space.get_site", { name });
}

export async function frappeCreateSite(payload: {
  site_name: string;
  plan: string;
  admin_password: string;
  customer?: string;
}) {
  return callMethod("space.api.v1.space.create_site", payload);
}

export async function frappeSuspendSite(name: string) {
  return callMethod("space.api.v1.space.suspend_site", { name });
}

export async function frappeResumeSite(name: string) {
  return callMethod("space.api.v1.space.resume_site", { name });
}

export async function frappeDeleteSite(name: string) {
  return callMethod("space.api.v1.space.delete_site", { name });
}

export async function frappeGetJob(name: string) {
  return callMethod("space.api.v1.space.get_job", { name });
}

export async function frappeMonitoringSummary() {
  return callMethod("space.api.v1.space.monitoring_summary");
}

export async function frappeListSubscriptions() {
  return callMethod("space.api.v1.space.list_subscriptions");
}

/** Phase 2 v2 methods */
async function callV2(method: string, body?: Record<string, unknown>) {
  return callMethod(`space.api.v2.space.${method}`, body);
}

export async function frappePortalDashboard() {
  return callV2("portal_dashboard");
}

export async function frappeAdminDashboard() {
  return callV2("admin_dashboard");
}

export async function frappeListJobs(site?: string) {
  return callV2("list_jobs", site ? { site } : {});
}

export async function frappeGetJobDetail(name: string) {
  return callV2("get_job_detail", { name });
}

export async function frappeListBackups(site?: string) {
  return callV2("list_backups", site ? { site } : {});
}

export async function frappeBackupNow(site: string) {
  return callV2("backup_now", { site });
}

export async function frappeListDomains(site?: string) {
  return callV2("list_domains", site ? { site } : {});
}

export async function frappeAttachDomain(site: string, domain: string, primary = 0) {
  return callV2("attach_domain", { site, domain, primary });
}

export async function frappeListInvoices() {
  return callV2("list_invoices");
}

export async function frappeListUsage(site?: string) {
  return callV2("list_usage", site ? { site } : {});
}

export async function frappeListPaymentHistory() {
  return callV2("list_payment_history");
}

export async function frappeListNotifications(unreadOnly = 0) {
  return callV2("list_notifications", { unread_only: unreadOnly });
}

export async function frappeMarkNotificationRead(name: string) {
  return callV2("mark_notification_read", { name });
}

export async function frappeGetProfile() {
  return callV2("get_profile");
}
