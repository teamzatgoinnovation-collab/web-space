import { NextRequest, NextResponse } from "next/server";
import { rateLimitOk } from "@/lib/bench";
import { frappeControlEnabled } from "@/lib/frappe-space";
import { callMethod, FrappeAuthError } from "@/lib/frappe-customer";
import { getSid } from "@/lib/require-sid";
import { parseProvisionRequest } from "@/lib/provision-request";
import { startProvisionJob } from "@/lib/provision";

export const runtime = "nodejs";

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

  // No payment and no plan choice at creation: the first month is free and every site starts on the trial plan
  // (lib/trial.ts). The plan is fixed by the parser, so nothing the browser sends can change it.
  const parsed = parseProvisionRequest(json);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }
  const request = parsed.data;

  try {
    if (frappeControlEnabled()) {
      const sid = await getSid();
      if (!sid) {
        return NextResponse.json({ ok: false, error: "Login required" }, { status: 401 });
      }
      const useV4 = Boolean(request.preferredRegion);
      const customSetup = {
        ...(request.companyName ? { company_name: request.companyName } : {}),
      };
      const data = await callMethod<{ job?: string; site?: string; domain?: string }>(
        useV4 ? "space.api.v4.space.create_site_v4" : "space.api.v1.space.create_site",
        useV4
          ? {
              site_name: request.slug,
              plan: request.plan,
              admin_password: request.adminPassword,
              preferred_region: request.preferredRegion,
              ...customSetup,
            }
          : {
              site_name: request.slug,
              plan: request.plan,
              admin_password: request.adminPassword,
              ...customSetup,
            },
        sid,
      );
      return NextResponse.json({
        ok: true,
        jobId: data?.job,
        site: data?.site,
        controlPlane: "space",
        api: useV4 ? "v4" : "v1",
      });
    }

    const jobId = startProvisionJob({
      slug: request.slug,
      adminPassword: request.adminPassword,
      apps: ["frappe", "erpnext"],
      plan: request.plan,
      paymentMethod: "Stripe",
      checkoutSessionId: "trial",
    });

    return NextResponse.json({ ok: true, jobId });
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
