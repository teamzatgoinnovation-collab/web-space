import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE } from "./session";
import { FrappeAuthError } from "./frappe-customer";

export async function getSid(): Promise<string | null> {
  return (await cookies()).get(SESSION_COOKIE)?.value || null;
}

export async function requireSid(): Promise<string> {
  const sid = await getSid();
  if (!sid) redirect("/login");
  return sid;
}

/** Run a page's data-loading call; bounce to /login if the session is dead. */
export async function withAuth<T>(load: (sid: string) => Promise<T>): Promise<T> {
  const sid = await requireSid();
  try {
    return await load(sid);
  } catch (err) {
    if (err instanceof FrappeAuthError) redirect("/login");
    throw err;
  }
}
