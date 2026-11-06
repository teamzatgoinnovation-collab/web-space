import { NextRequest, NextResponse } from "next/server";
import { getSid } from "@/lib/require-sid";
import { frappeBaseUrl } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Stream a backup file to the signed-in owner. Frappe decides access; this only forwards the customer's session. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string; name: string }> }) {
  const { name } = await ctx.params;
  const sid = await getSid();
  if (!sid) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(name)) return NextResponse.json({ ok: false, error: "Invalid backup" }, { status: 400 });

  const upstream = await fetch(
    `${frappeBaseUrl()}/api/method/space_cloud.api.v1.backups.download_backup?backup=${encodeURIComponent(name)}`,
    { headers: { Cookie: `sid=${sid}` }, cache: "no-store" },
  );
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ ok: false, error: "This backup cannot be downloaded." }, { status: upstream.status === 403 ? 403 : 502 });
  }
  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": "application/gzip",
      "Content-Disposition": upstream.headers.get("content-disposition") || `attachment; filename="backup-${name}.sql.gz"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
