import { NextRequest, NextResponse } from "next/server";
import { checkoutOptions } from "@/lib/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Currencies, prices and payment methods currently available for a plan. */
export async function GET(req: NextRequest) {
  const plan = req.nextUrl.searchParams.get("plan")?.trim();
  if (!plan) return NextResponse.json({ ok: false, error: "plan is required" }, { status: 400 });
  return NextResponse.json({ ok: true, ...checkoutOptions(plan) });
}
