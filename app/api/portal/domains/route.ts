import { NextResponse } from "next/server";
import { frappeControlEnabled, frappeListDomains } from "@/lib/frappe-space";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    if (!frappeControlEnabled()) {
      return NextResponse.json({ ok: false, error: "Frappe disabled" }, { status: 503 });
    }
    const message = (await frappeListDomains()) as { ok?: boolean; data?: unknown };
    return NextResponse.json({ ok: true, data: message?.data ?? message });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String((e as Error).message || e) }, { status: 500 });
  }
}
