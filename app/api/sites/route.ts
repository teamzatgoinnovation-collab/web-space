import { NextRequest, NextResponse } from "next/server";
import { collectSitesUsage } from "@/lib/sites-usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Default light: only run live docker metrics when ?refresh=1
  const refresh = req.nextUrl.searchParams.get("refresh") === "1";
  try {
    const payload = await collectSitesUsage({ refreshMetrics: refresh });
    const status = payload.ok ? 200 : 502;
    return NextResponse.json(payload, { status });
  } catch (err) {
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
