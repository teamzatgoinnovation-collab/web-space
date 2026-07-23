import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { rateLimitOk } from "@/lib/bench";
import {
  hostnameFromSlug,
  manageClearCache,
  manageInstallApp,
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
  }),
  z.object({
    action: z.literal("clear-cache"),
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
      const result = manageSetPlan(hostname, body.plan);
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
