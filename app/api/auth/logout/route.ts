import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { frappeBaseUrl, SESSION_COOKIE } from "@/lib/session";

export async function POST() {
  const sid = (await cookies()).get(SESSION_COOKIE)?.value;
  if (sid) {
    await fetch(`${frappeBaseUrl()}/api/method/logout`, {
      method: "POST",
      headers: { Cookie: `sid=${sid}` },
      cache: "no-store",
    }).catch(() => {});
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
