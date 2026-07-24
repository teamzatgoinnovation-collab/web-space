import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { rateLimitOk } from "@/lib/bench";
import { assertPaidCheckout } from "@/lib/billing";
import { startProvisionJob } from "@/lib/provision";

export const runtime = "nodejs";

const Body = z.object({
  slug: z.string().min(1).max(63),
  adminPassword: z.string().min(8).max(128),
  apps: z.array(z.string()).default(["frappe", "erpnext"]),
  plan: z.string().min(1),
  checkoutSessionId: z.string().min(8).max(128),
  paymentMethod: z.enum(["Stripe"]).optional(),
});

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  if (!rateLimitOk(ip, 5)) {
    return NextResponse.json({ ok: false, error: "Rate limit exceeded" }, { status: 429 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message || "Invalid body" },
      { status: 400 },
    );
  }

  const paid = assertPaidCheckout({
    sessionId: parsed.data.checkoutSessionId,
    plan: parsed.data.plan,
    purpose: "provision",
  });
  if (!paid.ok) {
    return NextResponse.json({ ok: false, error: paid.error }, { status: 402 });
  }

  const jobId = startProvisionJob({
    slug: parsed.data.slug,
    adminPassword: parsed.data.adminPassword,
    apps: parsed.data.apps,
    plan: parsed.data.plan,
    paymentMethod: "Stripe",
    checkoutSessionId: paid.session.id,
  });

  return NextResponse.json({ ok: true, jobId, checkoutSessionId: paid.session.id });
}
