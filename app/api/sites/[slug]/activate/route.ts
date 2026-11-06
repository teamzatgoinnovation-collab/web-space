import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertPaidCheckout } from "@/lib/billing";
import { callMethod, FrappeAuthError } from "@/lib/frappe-customer";
import { frappeRecordPayment } from "@/lib/frappe-space";
import { getSid } from "@/lib/require-sid";
import { priceCents } from "@/lib/payments/pricing";
import { splitSessionId } from "@/lib/payments/registry";
import type { Currency } from "@/lib/payments/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  plan: z.string().min(1).max(64),
  sessionId: z.string().min(1).max(256),
  currency: z.enum(["SAR", "INR", "USD"]).optional(),
});

/**
 * Activate (or renew) a site's monthly subscription. The browser paid the provider; this route verifies that
 * payment itself (amount, currency, plan and site binding), then records it on the platform with the service
 * credential. The caller must own the site (checked by Frappe with THEIR session); a payment id can only ever
 * count once (idempotent on the platform side).
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const sid = await getSid();
  if (!sid) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  const { plan, sessionId } = parsed.data;

  try {
    // Ownership: the customer's own session must be allowed to see this site's lifecycle.
    await callMethod("space.api.lifecycle.get_lifecycle", { site: slug }, sid);

    const paid = await assertPaidCheckout({ sessionId, plan, purpose: "activate", hostname: slug, currency: parsed.data.currency });
    if (!paid.ok) return NextResponse.json({ ok: false, error: paid.error }, { status: 402 });
    if (paid.session.id.startsWith("free_")) {
      return NextResponse.json({ ok: false, error: "A free checkout cannot activate a subscription." }, { status: 400 });
    }

    const { provider, payload: paymentId } = splitSessionId(paid.session.id);
    const currency = (parsed.data.currency || "SAR") as Currency;
    const cents = priceCents(plan, currency) ?? 0;
    const result = await frappeRecordPayment({ site: slug, provider, paymentId, amount: cents / 100, currency });
    return NextResponse.json({ ok: true, data: result });
  } catch (e) {
    if (e instanceof FrappeAuthError) return NextResponse.json({ ok: false, error: e.message }, { status: 403 });
    return NextResponse.json({ ok: false, error: "Could not record the payment. If you were charged, contact support." }, { status: 502 });
  }
}
