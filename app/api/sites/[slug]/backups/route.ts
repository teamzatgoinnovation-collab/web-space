import { NextRequest, NextResponse } from "next/server";
import { callMethod, FrappeAuthError } from "@/lib/frappe-customer";
import { getSid } from "@/lib/require-sid";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

/** The customer's downloadable database backups for their own site (Frappe checks ownership with their session). */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const { slug } = await ctx.params;
  const sid = await getSid();
  if (!sid) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  try {
    const data = await callMethod("space_cloud.api.v1.backups.list_downloadable", { site: slug }, sid);
    return NextResponse.json({ ok: true, backups: data });
  } catch (e) {
    if (e instanceof FrappeAuthError) return NextResponse.json({ ok: false, error: e.message }, { status: 403 });
    return NextResponse.json({ ok: false, error: "Could not list backups." }, { status: 502 });
  }
}

/** Ask for a fresh backup now (runs as a background job; the list shows it when ready). */
export async function POST(_req: NextRequest, ctx: Ctx) {
  const { slug } = await ctx.params;
  const sid = await getSid();
  if (!sid) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  try {
    await callMethod("space_cloud.api.v2.space.backup_now", { site: slug }, sid);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof FrappeAuthError) return NextResponse.json({ ok: false, error: e.message }, { status: 403 });
    return NextResponse.json({ ok: false, error: "Could not start the backup." }, { status: 502 });
  }
}
