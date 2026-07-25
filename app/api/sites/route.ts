import { NextRequest, NextResponse } from "next/server";
import { frappeControlEnabled } from "@/lib/frappe-space";
import { callMethod, FrappeAuthError } from "@/lib/frappe-customer";
import { getSid } from "@/lib/require-sid";
import { collectSitesUsage } from "@/lib/sites-usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const refresh = req.nextUrl.searchParams.get("refresh") === "1";
  try {
    if (frappeControlEnabled()) {
      const sid = await getSid();
      if (!sid) {
        return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
      }
      const result = await callMethod<Array<Record<string, unknown>>>(
        "space.api.v1.space.list_sites",
        undefined,
        sid,
      );
      const rows = Array.isArray(result) ? result : [];
      const sites = rows.map((r) => {
        const domain = String(r.domain || "");
        const slug = String(r.site_name || r.name || "");
        return {
          name: String(r.name || slug),
          slug,
          hostname: domain,
          status: String(r.status || "Active"),
          plan: String(r.plan || ""),
          planTitle: String(r.plan || ""),
          deskUrl: domain ? `https://${domain}` : "",
          ramLimitMb: 0,
          diskLimitMb: 0,
          ramUsedMb: 0,
          diskUsedMb: Number(r.storage_used_mb || 0),
          apps: [],
          usageUpdatedAt: null,
          kind: "space" as const,
          inPool: true,
          onDocker: ["Active", "Suspended", "Provisioning"].includes(String(r.status)),
        };
      });
      return NextResponse.json({
        ok: true,
        pool: {
          ramPoolMb: 0,
          diskPoolMb: 0,
          allocatedRamMb: 0,
          allocatedDiskMb: 0,
          usedRamMb: 0,
          usedDiskMb: sites.reduce((s, x) => s + x.diskUsedMb, 0),
          freeRamMb: 0,
          freeDiskMb: 0,
          siteCount: sites.length,
        },
        measured: {
          ramUsedMb: 0,
          ramLimitMb: 0,
          diskUsedMb: sites.reduce((s, x) => s + x.diskUsedMb, 0),
          siteCount: sites.length,
        },
        sites,
        controlPlane: "space",
        source: "frappe",
      });
    }

    const payload = await collectSitesUsage({ refreshMetrics: refresh });
    const status = payload.ok ? 200 : 502;
    return NextResponse.json(payload, {
      status,
      headers: {
        "Cache-Control": refresh ? "private, max-age=30" : "private, max-age=10",
      },
    });
  } catch (err) {
    if (err instanceof FrappeAuthError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 401 });
    }
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Failed to collect site usage",
        pool: {
          ramPoolMb: 0,
          diskPoolMb: 0,
          allocatedRamMb: 0,
          allocatedDiskMb: 0,
          usedRamMb: 0,
          usedDiskMb: 0,
          freeRamMb: 0,
          freeDiskMb: 0,
          siteCount: 0,
        },
        measured: {
          ramUsedMb: 0,
          ramLimitMb: 0,
          diskUsedMb: 0,
          siteCount: 0,
        },
        sites: [],
        source: "docker",
      },
      { status: 500 },
    );
  }
}
