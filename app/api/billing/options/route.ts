import { NextRequest, NextResponse } from "next/server";
import { checkoutOptions } from "@/lib/billing";
import { billingPeriodForSite } from "@/lib/site-period";
import { getSid } from "@/lib/require-sid";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Currencies, prices and payment methods currently available for a plan. */
export async function GET(req: NextRequest) {
  const plan = req.nextUrl.searchParams.get("plan")?.trim();
  if (!plan) return NextResponse.json({ ok: false, error: "plan is required" }, { status: 400 });
  // For an existing site the period (Monthly / Yearly) is the platform's setting for that site.
  const site = req.nextUrl.searchParams.get("site")?.trim();
  let period: "Monthly" | "Yearly" = "Monthly";
  if (site) {
    const sid = await getSid();
    if (sid) period = await billingPeriodForSite(site, sid).catch(() => "Monthly" as const);
  }
  return NextResponse.json({ ok: true, ...checkoutOptions(plan, period) });
}
