import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { rateLimitOk } from "@/lib/bench";
import { confirmCheckoutSession } from "@/lib/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  sessionId: z.string().min(8).max(128),
  email: z.string().email().max(200),
  name: z.string().min(2).max(120),
  cardNumber: z.string().min(12).max(30),
  expMonth: z.string().min(1).max(2),
  expYear: z.string().min(2).max(4),
  cvc: z.string().min(3).max(4),
});

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  if (!rateLimitOk(ip, 30)) {
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
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message || "Invalid card details" },
      { status: 400 },
    );
  }

  // Brief delay so the UI feels like a real processor
  await new Promise((r) => setTimeout(r, 900));

  const result = confirmCheckoutSession(parsed.data);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, code: result.code },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    session: {
      id: result.session.id,
      status: result.session.status,
      plan: result.session.plan,
      planTitle: result.session.planTitle,
      amountDueCents: result.session.amountDueCents,
      listPriceCents: result.session.listPriceCents,
      cardBrand: result.session.cardBrand,
      cardLast4: result.session.cardLast4,
      customerEmail: result.session.customerEmail,
      completedAt: result.session.completedAt,
    },
    receipt: {
      charged: "$0.00",
      note: "Space is free — no charge was made.",
    },
  });
}
