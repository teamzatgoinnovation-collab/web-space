import { NextResponse } from "next/server";
import { callMethod, FrappeAuthError } from "@/lib/frappe-customer";
import { getSid } from "@/lib/require-sid";
import { runDiagnostics } from "@/lib/diagnostics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Read-only health checks for the signed-in customer's own site. */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const sid = await getSid();
  if (!sid) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  try {
    // get_site enforces ownership: another customer's site is refused here, before any probe.
    const site = await callMethod<{ domain?: string; status?: string }>("space.api.v1.space.get_site", { name: slug }, sid);
    const checks = await runDiagnostics({ hostname: String(site?.domain || ""), status: String(site?.status || "") });
    return NextResponse.json({ ok: true, hostname: site?.domain, checks, checkedAt: new Date().toISOString() });
  } catch (err) {
    if (err instanceof FrappeAuthError) return NextResponse.json({ ok: false, error: err.message }, { status: 401 });
    return NextResponse.json({ ok: false, error: "Could not run checks." }, { status: 502 });
  }
}
