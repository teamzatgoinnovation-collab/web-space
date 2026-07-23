import { NextResponse } from "next/server";
import { getLocalCatalog } from "@/lib/provision";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const base = process.env.FRAPPE_BASE_URL?.replace(/\/$/, "");
  if (base) {
    try {
      const res = await fetch(`${base}/api/method/zatgo_space.api.v1.space.list_catalog`, {
        cache: "no-store",
      });
      const json = (await res.json()) as {
        message?: { success?: boolean; data?: Record<string, unknown> };
      };
      if (json.message?.success && json.message.data) {
        return NextResponse.json({ ok: true, ...json.message.data });
      }
    } catch {
      // fall through to live bench listing
    }
  }
  return NextResponse.json(await getLocalCatalog());
}
