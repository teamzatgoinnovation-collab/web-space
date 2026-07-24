import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { rateLimitOk } from "@/lib/bench";
import {
  frappeControlEnabled,
  frappeDeleteSite,
  frappeResumeSite,
  frappeSuspendSite,
} from "@/lib/frappe-space";
import {
  hostnameFromSlug,
  manageClearCache,
  manageInstallApp,
  manageMigrate,
  manageSetPlan,
  manageUninstallApp,
} from "@/lib/site-manage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

const Body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("install-app"),
    package: z.string().min(1).max(64),
  }),
  z.object({
    action: z.literal("uninstall-app"),
    package: z.string().min(1).max(64),
  }),
  z.object({
    action: z.literal("set-plan"),
    plan: z.string().min(1).max(64),
    checkoutSessionId: z.string().min(8).max(128),
  }),
  z.object({
    action: z.literal("clear-cache"),
  }),
  z.object({
    action: z.literal("migrate"),
  }),
  z.object({
    action: z.literal("suspend"),
  }),
  z.object({
    action: z.literal("resume"),
  }),
  z.object({
    action: z.literal("delete"),
  }),
]);

export async function POST(req: NextRequest, ctx: Ctx) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  if (!rateLimitOk(ip, 20)) {
    return NextResponse.json({ ok: false, error: "Too many requests. Please wait." }, { status: 429 });
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

  try {
    const { slug } = await ctx.params;
    const hostname = hostnameFromSlug(slug);
    const body = parsed.data;

    if (
      frappeControlEnabled() &&
      (body.action === "suspend" || body.action === "resume" || body.action === "delete")
    ) {
      const call =
        body.action === "suspend"
          ? frappeSuspendSite
          : body.action === "resume"
            ? frappeResumeSite
            : frappeDeleteSite;
      const message = (await call(slug)) as { ok?: boolean; data?: unknown; error?: string };
      if (message && message.ok === false) {
        return NextResponse.json(
          { ok: false, error: message.error || "Action failed" },
          { status: 400 },
        );
      }
      return NextResponse.json({
        ok: true,
        action: body.action,
        data: message?.data ?? message,
        controlPlane: "space",
      });
    }

    if (body.action === "suspend" || body.action === "resume" || body.action === "delete") {
      return NextResponse.json(
        { ok: false, error: "Lifecycle actions require SPACE_CONTROL_PLANE=frappe" },
        { status: 400 },
      );
    }

    if (body.action === "install-app") {
      const result = await manageInstallApp(hostname, body.package);
      if (!result.ok) return NextResponse.json(result, { status: 400 });
      return NextResponse.json(result);
    }
    if (body.action === "uninstall-app") {
      const result = await manageUninstallApp(hostname, body.package);
      if (!result.ok) return NextResponse.json(result, { status: 400 });
      return NextResponse.json(result);
    }
    if (body.action === "set-plan") {
      const result = manageSetPlan(hostname, body.plan, body.checkoutSessionId);
      if (!result.ok) return NextResponse.json(result, { status: 400 });
      return NextResponse.json(result);
    }
    if (body.action === "migrate") {
      const result = await manageMigrate(hostname);
      if (!result.ok) return NextResponse.json(result, { status: 400 });
      return NextResponse.json(result);
    }
    const result = await manageClearCache(hostname);
    if (!result.ok) return NextResponse.json(result, { status: 400 });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Action failed",
      },
      { status: 500 },
    );
  }
}
