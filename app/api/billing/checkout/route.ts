import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { rateLimitOk } from "@/lib/bench";
import { createCheckoutSession } from "@/lib/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  plan: z.string().min(1).max(64),
  purpose: z.enum(["provision", "upgrade"]),
  hostname: z.string().min(1).max(253).optional(),
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

  const result = createCheckoutSession(parsed.data);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    session: result.session,
    billing: { mode: "free", amountDueCents: 0 },
  });
}
