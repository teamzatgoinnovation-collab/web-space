import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { rateLimitOk } from "@/lib/bench";
import { createCheckoutSession } from "@/lib/billing";
import { billingPeriodForSite } from "@/lib/site-period";
import { getSid } from "@/lib/require-sid";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  plan: z.string().min(1).max(64),
  purpose: z.enum(["provision", "upgrade", "activate"]),
  hostname: z.string().min(1).max(253).optional(),
  provider: z.enum(["moyasar", "razorpay", "stripe", "paypal"]).optional(),
  currency: z.enum(["SAR", "INR", "USD"]).optional(),
});

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  if (!rateLimitOk(ip, 40)) {
    return NextResponse.json({ ok: false, error: "Too many requests" }, { status: 429 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  // An activation is priced for the site's billing period, read from the platform with the customer's session.
  let period: "Monthly" | "Yearly" = "Monthly";
  if (parsed.data.purpose === "activate" && parsed.data.hostname) {
    const sid = await getSid();
    if (!sid) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
    period = await billingPeriodForSite(parsed.data.hostname, sid).catch(() => "Monthly" as const);
  }
  const result = await createCheckoutSession({ ...parsed.data, period });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, session: result.session });
}
