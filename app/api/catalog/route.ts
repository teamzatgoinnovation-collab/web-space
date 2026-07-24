import { NextResponse } from "next/server";
import { buildCatalog } from "@/lib/control-plane";
import { frappeControlEnabled, frappeListCatalog } from "@/lib/frappe-space";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Catalog from Space Frappe control plane (preferred) or local fallback. */
export async function GET() {
  try {
    if (frappeControlEnabled()) {
      const message = (await frappeListCatalog()) as {
        ok?: boolean;
        data?: Record<string, unknown>;
      };
      const data = message?.data || message;
      if (data && typeof data === "object") {
        return NextResponse.json({ ok: true, ...(data as object), controlPlane: "space" });
      }
    }
    const catalog = await buildCatalog();
    return NextResponse.json(catalog);
  } catch (err) {
    // Fallback to local if Frappe unavailable during transition
    try {
      const catalog = await buildCatalog();
      return NextResponse.json({
        ...catalog,
        warning: err instanceof Error ? err.message : "Frappe catalog unavailable",
      });
    } catch {
      return NextResponse.json(
        {
          ok: false,
          error: err instanceof Error ? err.message : "Failed to load catalog",
        },
        { status: 500 },
      );
    }
  }
}
