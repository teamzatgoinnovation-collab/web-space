import { NextRequest, NextResponse } from "next/server";
import { frappeControlEnabled, frappeListCatalog } from "@/lib/frappe-space";
import { callMethod, FrappeAuthError } from "@/lib/frappe-customer";
import { getSid } from "@/lib/require-sid";
import { getSiteDetail, hostnameFromSlug } from "@/lib/site-manage";
import { titleForApp } from "@/lib/control-plane";

/** Platform / ops apps — never offered as installable on a customer's own
 * site. Mirrors CATALOG_HIDDEN_APPS (control-plane.ts) and HIDDEN_INSTALL
 * (site-manage.ts) — this is the third, Frappe-backed copy of the same
 * concern, since space_cloud's own list_catalog doesn't filter these out
 * either. */
const HIDDEN_APPS = new Set(["zatgo_space", "zatgo_hub", "space", "space_cloud"]);

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
          const domain = String(data.domain || `${slug}.zatgoinnovation.com`);
          const installedPkgs = Array.isArray(data.installed_apps)
            ? (data.installed_apps as { app_package?: string }[])
                .map((a) => String(a.app_package || ""))
                .filter(Boolean)
            : [];
          const installedSet = new Set(installedPkgs);
          const installedApps = installedPkgs.map((pkg) => ({
            package: pkg,
            title: titleForApp(pkg),
            canUninstall: pkg !== "frappe",
          }));

          // Best-effort: the site detail itself must render even if the
          // catalog call fails (e.g. guest/permission hiccup) — plan limits
          // and "available apps to add" are enrichment, not core data.
          let planLimits = { ramLimitMb: 0, diskLimitMb: 0 };
          let planTitle: string | undefined;
          let availableApps: { package: string; title: string }[] = [];
          let plans: Record<string, unknown>[] = [];
          try {
            const catalog = (await frappeListCatalog()) as {
              data?: { plans?: Record<string, unknown>[]; apps?: { package?: string }[] };
            };
            const catalogData = catalog?.data || (catalog as unknown as typeof catalog.data);
            plans = catalogData?.plans || [];
            const sitePlan = plans.find((p) => p.code === data.plan);
            if (sitePlan) {
              planLimits = {
                ramLimitMb: Number(sitePlan.ramLimitMb ?? sitePlan.ram_mb ?? 0),
                diskLimitMb: Number(sitePlan.diskLimitMb ?? sitePlan.storage_mb ?? 0),
              };
              planTitle = typeof sitePlan.title === "string" ? sitePlan.title : undefined;
            }
            availableApps = (catalogData?.apps || [])
              .map((a) => String(a.package || ""))
              .filter((pkg) => pkg && !installedSet.has(pkg) && !HIDDEN_APPS.has(pkg))
              .map((pkg) => ({ package: pkg, title: titleForApp(pkg) }));
          } catch {
            // enrichment only — site detail below still renders without it
          }

          return NextResponse.json({
            ok: true,
            site: {
              name: String(data.name || slug),
              slug: String(data.site_name || slug),
              hostname: domain,
              status: String(data.status || "Active"),
              plan: String(data.plan || ""),
              planTitle,
              deskUrl: `https://${domain}`,
              onDocker: true,
              kind: "space" as const,
              ramLimitMb: planLimits.ramLimitMb,
              diskLimitMb: planLimits.diskLimitMb,
              diskUsedMb: Number(data.storage_used_mb || 0),
              ramUsedMb: 0,
              installedApps,
              availableApps,
              plans: plans.map((p) => ({
                code: String(p.code || ""),
                title: String(p.title || p.code || ""),
                mock_price: String(p.mock_price || ""),
                priceCents: Number(p.priceCents || 0),
                dueTodayCents: Number(p.dueTodayCents || 0),
                ramLimitMb: Number(p.ramLimitMb ?? p.ram_mb ?? 0),
                diskLimitMb: Number(p.diskLimitMb ?? p.storage_mb ?? 0),
                features: Array.isArray(p.features) ? p.features : [],
              })),
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
