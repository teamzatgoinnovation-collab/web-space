import { NextResponse } from "next/server";
import { frappeControlEnabled } from "@/lib/frappe-space";
import { callMethod, FrappeAuthError } from "@/lib/frappe-customer";
import { getSid } from "@/lib/require-sid";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    if (!frappeControlEnabled()) {
      return NextResponse.json({ ok: false, error: "Frappe disabled" }, { status: 503 });
    }
    const sid = await getSid();
    if (!sid) {
      return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
    }
    const data = await callMethod("space.api.v2.space.get_profile", undefined, sid);
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    if (e instanceof FrappeAuthError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: String((e as Error).message || e) }, { status: 500 });
  }
}
