import { NextRequest, NextResponse } from "next/server";
import { frappeControlEnabled } from "@/lib/frappe-space";
import { callMethod, FrappeAuthError } from "@/lib/frappe-customer";
import { getSid } from "@/lib/require-sid";
import { getSiteDetail, hostnameFromSlug } from "@/lib/site-manage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const { slug } = await ctx.params;

    if (frappeControlEnabled()) {
      const sid = await getSid();
      if (!sid) {
        return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
      }
      try {
        const data = await callMethod<Record<string, unknown>>(
          "space.api.v1.space.get_site",
          { name: slug },
          sid,
        );
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
      } catch (err) {
        if (err instanceof FrappeAuthError) {
          return NextResponse.json({ ok: false, error: err.message }, { status: 401 });
        }
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
