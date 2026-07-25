import { NextResponse } from "next/server";
import { frappeControlEnabled, frappeListRegions } from "@/lib/frappe-space";

export const runtime = "nodejs";

export async function GET() {
  try {
    if (!frappeControlEnabled()) {
      return NextResponse.json({
        ok: true,
        data: [
          { name: "sa", title: "Saudi Arabia" },
          { name: "ae", title: "UAE" },
          { name: "sg", title: "Singapore" },
          { name: "eu", title: "Europe" },
          { name: "us", title: "USA" },
        ],
      });
    }
    const message = (await frappeListRegions()) as { ok?: boolean; data?: unknown };
    return NextResponse.json({ ok: true, data: message?.data ?? message });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "regions failed" },
      { status: 500 },
    );
  }
}
