import { NextResponse } from "next/server";
import { frappeControlEnabled } from "@/lib/frappe-space";
import { callMethod, FrappeAuthError } from "@/lib/frappe-customer";
import { getSid } from "@/lib/require-sid";
import { getJob } from "@/lib/jobs";
import { isDevConsoleEnabled } from "@/lib/dev-console";

export const runtime = "nodejs";

const GENERIC_JOB_ERROR = "Something went wrong while setting this up. Please try again, or contact support if this keeps happening.";

/** Customers never see raw tracebacks/internal paths; the full error_log stays
 * on the Space Deployment Job for support/admin use via Desk. */
function safeJobError(rawErrorLog: unknown, devConsole: boolean): string {
	if (devConsole) {
		return String(rawErrorLog || "Job failed").slice(0, 500);
	}
	return GENERIC_JOB_ERROR;
}

function mapFrappeJob(raw: Record<string, unknown>, id: string, devConsole: boolean) {
  const statusRaw = String(raw.status || "Queued");
  const progress = Number(raw.progress || 0);
  const statusMap: Record<string, string> = {
    Queued: "queued",
    Running: "running",
    Succeeded: "succeeded",
    Failed: "failed",
  };
  const status = statusMap[statusRaw] || statusRaw.toLowerCase();
  const site = String(raw.site || "");
  const domain =
    site.includes(".") ? site : site ? `${site}.zatgoinnovation.com` : undefined;

  return {
    id,
    status,
    error: status === "failed" ? safeJobError(raw.error_log, devConsole) : undefined,
    result:
      status === "succeeded" && domain
        ? { deskUrl: `https://${domain}`, hostname: domain }
        : undefined,
    progress,
    // The wizard indexes job.stages; the Frappe control plane reports progress/output only.
    stages: [] as { id: string; label: string; status: string }[],
    // Developer-authored progress checkpoints ("[25%] Creating site X") — safe by
    // construction, no commands/credentials — powers the customer-facing activity log.
    output: typeof raw.output === "string" ? raw.output : undefined,
    startedAt: typeof raw.started_at === "string" ? raw.started_at : undefined,
    estimatedMinutes: raw.estimated_minutes ? Number(raw.estimated_minutes) : undefined,
    canRetry: raw.can_retry != null ? Boolean(Number(raw.can_retry)) : status === "failed",
  };
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  if (frappeControlEnabled()) {
    const sid = await getSid();
    if (!sid) {
      return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
    }
    try {
      const data = await callMethod<Record<string, unknown>>("space.api.v1.space.get_job", { name: id }, sid);
      if (!data || typeof data !== "object") {
        return NextResponse.json({ ok: false, error: "Job not found" }, { status: 404 });
      }
      const job = mapFrappeJob(data, id, isDevConsoleEnabled());
      return NextResponse.json({
        ok: true,
        job: isDevConsoleEnabled()
          ? { ...job, kind: "space:provision", log: String(data.output || "").split("\n").filter(Boolean) }
          : job,
        controlPlane: "space",
        dev: isDevConsoleEnabled(),
      });
    } catch (err) {
      if (err instanceof FrappeAuthError) {
        return NextResponse.json({ ok: false, error: err.message }, { status: 401 });
      }
      const msg = err instanceof Error ? err.message : "Job fetch failed";
      if (/not found|does not exist|404/i.test(msg)) {
        return NextResponse.json({ ok: false, error: "Job not found" }, { status: 404 });
      }
      return NextResponse.json({ ok: false, error: msg }, { status: 502 });
    }
  }

  const job = getJob(id);
  if (!job) {
    return NextResponse.json({ ok: false, error: "Job not found" }, { status: 404 });
  }

  const base = {
    id: job.id,
    status: job.status,
    stages: job.stages,
    error: job.error,
    result: job.result,
  };

  if (!isDevConsoleEnabled()) {
    return NextResponse.json({ ok: true, job: base, dev: false });
  }

  return NextResponse.json({
    ok: true,
    dev: true,
    job: {
      ...base,
      kind: job.kind,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      meta: job.meta,
      log: job.log,
    },
  });
}
