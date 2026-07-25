import { NextResponse } from "next/server";
import { customerLogin, customerSignup } from "@/lib/frappe-customer";
import { SESSION_COOKIE } from "@/lib/session";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    email?: string;
    password?: string;
    fullName?: string;
    company?: string;
    phone?: string;
  };
  const { email, password, fullName, company, phone } = body;
  if (!email || !password || !fullName) {
    return NextResponse.json({ ok: false, error: "Name, email, and password are required." }, { status: 400 });
  }

  try {
    await customerSignup({ email, password, full_name: fullName, company, phone });
    // Signup doesn't start a session itself — log in right after with the same credentials.
    const sid = await customerLogin(email, password);
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
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Could not create account." },
      { status: 400 },
    );
  }
}
