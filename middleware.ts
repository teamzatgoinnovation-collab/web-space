import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/login") || pathname.startsWith("/signup") || pathname.startsWith("/api/auth/")) {
    return NextResponse.next();
  }

  const sid = req.cookies.get(SESSION_COOKIE)?.value;
  if (!sid) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?redirect-to=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
