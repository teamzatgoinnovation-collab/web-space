import { NextRequest, NextResponse } from "next/server";
import { frappeControlEnabled, frappeGetSite } from "@/lib/frappe-space";
import { getSiteDetail, hostnameFromSlug } from "@/lib/site-manage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const { slug } = await ctx.params;

    if (frappeControlEnabled()) {
      try {
        const message = (await frappeGetSite(slug)) as {
          ok?: boolean;
          data?: Record<string, unknown>;
        };
        const data = (message?.data || message) as Record<string, unknown>;
        if (data && typeof data === "object" && (data.site_name || data.name)) {
          const domain = String(data.domain || `${slug}.zatgo.online`);
          const apps = Array.isArray(data.installed_apps)
            ? (data.installed_apps as { app_package?: string }[]).map((a) =>
                String(a.app_package || ""),
              ).filter(Boolean)
            : [];
          return NextResponse.json({
            ok: true,
            site: {
              name: String(data.name || slug),
              slug: String(data.site_name || slug),
              hostname: domain,
              status: String(data.status || "Active"),
              plan: String(data.plan || ""),
              deskUrl: `https://${domain}`,
              apps,
              diskUsedMb: Number(data.storage_used_mb || 0),
              sslStatus: String(data.ssl_status || "wildcard"),
            },
            controlPlane: "space",
          });
        }
      } catch {
        // fall through to local detail
      }
    }

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
