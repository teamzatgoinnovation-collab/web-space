import { NextRequest, NextResponse } from "next/server";
import { collectSitesUsage } from "@/lib/sites-usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const refresh = req.nextUrl.searchParams.get("refresh") !== "0";
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
          ramPoolMb: 10240,
          diskPoolMb: 102400,
          allocatedRamMb: 0,
          allocatedDiskMb: 0,
          usedRamMb: 0,
          usedDiskMb: 0,
          freeRamMb: 10240,
          freeDiskMb: 102400,
          siteCount: 0,
        },
        sites: [],
      },
      { status: 500 },
    );
  }
}
