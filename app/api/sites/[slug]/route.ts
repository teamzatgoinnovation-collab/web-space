import { NextRequest, NextResponse } from "next/server";
import { getSiteDetail, hostnameFromSlug } from "@/lib/site-manage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const { slug } = await ctx.params;
    const hostname = hostnameFromSlug(slug);
    const detail = await getSiteDetail(hostname);
    return NextResponse.json({ ok: true, site: detail });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Could not load site",
      },
      { status: 400 },
    );
  }
}
