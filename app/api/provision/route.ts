import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { rateLimitOk } from "@/lib/bench";
import { assertPaidCheckout } from "@/lib/billing";
import { frappeControlEnabled } from "@/lib/frappe-space";
import { callMethod, FrappeAuthError } from "@/lib/frappe-customer";
import { getSid } from "@/lib/require-sid";
import { startProvisionJob } from "@/lib/provision";

export const runtime = "nodejs";

const Body = z.object({
  slug: z.string().min(1).max(63),
  adminPassword: z.string().min(8).max(128),
  apps: z.array(z.string()).default(["frappe", "erpnext"]),
  plan: z.string().min(1),
  checkoutSessionId: z.string().min(8).max(128),
  paymentMethod: z.enum(["Stripe"]).optional(),
  preferredRegion: z.string().min(1).max(64).optional(),
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

  const paid = await assertPaidCheckout({
    sessionId: parsed.data.checkoutSessionId,
    plan: parsed.data.plan,
    purpose: "provision",
  });
  if (!paid.ok) {
    return NextResponse.json({ ok: false, error: paid.error }, { status: 402 });
  }

  try {
    if (frappeControlEnabled()) {
      const sid = await getSid();
      if (!sid) {
        return NextResponse.json({ ok: false, error: "Login required" }, { status: 401 });
      }
      const useV4 = Boolean(parsed.data.preferredRegion);
      const data = await callMethod<{ job?: string; site?: string; domain?: string }>(
        useV4 ? "space.api.v4.space.create_site_v4" : "space.api.v1.space.create_site",
        useV4
          ? {
              site_name: parsed.data.slug,
              plan: parsed.data.plan,
              admin_password: parsed.data.adminPassword,
              preferred_region: parsed.data.preferredRegion,
            }
          : {
              site_name: parsed.data.slug,
              plan: parsed.data.plan,
              admin_password: parsed.data.adminPassword,
            },
        sid,
      );
      return NextResponse.json({
        ok: true,
        jobId: data?.job,
        site: data?.site,
        checkoutSessionId: paid.session.id,
        controlPlane: "space",
        api: useV4 ? "v4" : "v1",
      });
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
  } catch (err) {
    if (err instanceof FrappeAuthError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 401 });
    }
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Provision failed" },
      { status: 500 },
    );
  }
}
