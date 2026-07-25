import { NextResponse } from "next/server";
import { customerLogin, FrappeAuthError } from "@/lib/frappe-customer";
import { SESSION_COOKIE } from "@/lib/session";

export async function POST(req: Request) {
  const { usr, pwd } = (await req.json().catch(() => ({}))) as { usr?: string; pwd?: string };
  if (!usr || !pwd) {
    return NextResponse.json({ ok: false, error: "Email and password are required." }, { status: 400 });
  }

  try {
    const sid = await customerLogin(usr, pwd);
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, sid, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return res;
  } catch (err) {
    const message = err instanceof FrappeAuthError ? err.message : "Login failed. Please try again.";
    return NextResponse.json({ ok: false, error: message }, { status: 401 });
  }
}
