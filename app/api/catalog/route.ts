import { NextResponse } from "next/server";
import { buildCatalog } from "@/lib/control-plane";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Catalog from space-web control plane + live Docker bench apps. */
export async function GET() {
  try {
    const catalog = await buildCatalog();
    return NextResponse.json(catalog);
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Failed to load catalog",
      },
      { status: 500 },
    );
  }
}
