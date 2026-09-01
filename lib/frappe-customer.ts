/**
 * Per-customer session client for space-web.
 *
 * Customers sign up / log in with their own Frappe account (role "Space
 * Customer") on the Space Frappe control plane, then every subsequent call forwards
 * their own Frappe `sid` — this is what lets the backend's
 * customer_for_user()/_ensure_site_access() scope sites, subscriptions,
 * and jobs to the signed-in customer instead of leaking everyone's data
 * through one shared service credential.
 */
import { frappeBaseUrl } from "./session";

export class FrappeAuthError extends Error {}

function extractSid(res: Response): string | null {
  const cookies =
    typeof (res.headers as { getSetCookie?: () => string[] }).getSetCookie === "function"
      ? (res.headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
      : (res.headers.get("set-cookie") || "").split(/,(?=[^;]+?=)/);
  for (const raw of cookies) {
    const match = raw.match(/(?:^|;\s*)sid=([^;]+)/);
    if (match && match[1] && match[1] !== "Guest") return match[1];
  }
  return null;
}

/** Unwrap space.api ok({data}) envelopes; pass raw payloads through untouched. */
function unwrap(message: unknown): unknown {
  if (message == null) return null;
  if (typeof message === "object" && "ok" in (message as Record<string, unknown>)) {
    const envelope = message as { ok: boolean; data?: unknown; error?: string; message?: string };
    if (envelope.ok === false) {
      throw new Error(envelope.error || envelope.message || "Request failed");
    }
    if ("data" in envelope) return envelope.data;
  }
  return message;
}

/** Log in against Frappe with usr/pwd, returning the session id (sid). */
export async function customerLogin(usr: string, pwd: string): Promise<string> {
  const res = await fetch(`${frappeBaseUrl()}/api/method/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ usr, pwd }).toString(),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new FrappeAuthError("Invalid email or password.");
  }
  const sid = extractSid(res);
  if (!sid) {
    throw new FrappeAuthError("Login succeeded but no session was returned.");
  }
  return sid;
}

/** Create a Space Customer account. Does not log in — call customerLogin after. */
export async function customerSignup(payload: {
  email: string;
  password: string;
  full_name: string;
  company?: string;
  phone?: string;
}): Promise<{ customer: string; email: string }> {
  const res = await fetch(`${frappeBaseUrl()}/api/method/space.api.core.signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as { message?: unknown };
  const data = unwrap(json.message ?? json);
  if (!res.ok) {
    throw new Error((data as { error?: string })?.error || `Signup failed (${res.status})`);
  }
  return data as { customer: string; email: string };
}

/** Call a whitelisted Frappe method as the customer identified by `sid`. */
export async function callMethod<T = unknown>(
  method: string,
  args: Record<string, unknown> | undefined,
  sid: string,
): Promise<T> {
  const res = await fetch(`${frappeBaseUrl()}/api/method/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `sid=${sid}`,
    },
    body: JSON.stringify(args || {}),
    cache: "no-store",
  });
  if (res.status === 403) {
    throw new FrappeAuthError("Not permitted for this account.");
  }
  if (res.status === 401) {
    throw new FrappeAuthError("Session expired. Please log in again.");
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${method} failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as { message?: unknown };
  return unwrap(json.message) as T;
}
