import { NextResponse } from "next/server";
import { frappeControlEnabled } from "@/lib/frappe-space";
import { callMethod, FrappeAuthError } from "@/lib/frappe-customer";
import { getSid } from "@/lib/require-sid";
import { getJob } from "@/lib/jobs";
import { isDevConsoleEnabled } from "@/lib/dev-console";

export const runtime = "nodejs";

/** Map Space Deployment Job progress → wizard stage checklist. */
function stagesFromProgress(progress: number, status: string) {
  const steps = [
    { id: "validate", label: "Checking your site name", at: 5 },
    { id: "dns", label: "Connecting your subdomain", at: 15 },
    { id: "new-site", label: "Creating your ERPNext site", at: 25 },
    { id: "apps", label: "Installing selected apps", at: 40 },
    { id: "cache", label: "Finishing setup", at: 85 },
  ] as const;

  if (status === "Queued" || status === "queued") {
    return steps.map((s, i) => ({
      id: s.id,
      label: s.label,
      status: i === 0 ? "running" : "pending",
    }));
  }

  const failed = status === "Failed" || status === "failed";
  const done = status === "Succeeded" || status === "succeeded";
  let runningIdx = -1;
  for (let i = 0; i < steps.length; i++) {
    if (progress >= steps[i].at) runningIdx = i;
  }
  if (done) {
    return steps.map((s) => ({ id: s.id, label: s.label, status: "succeeded" }));
  }
  return steps.map((s, i) => {
    if (i < runningIdx) return { id: s.id, label: s.label, status: "succeeded" };
    if (i === runningIdx) {
      return { id: s.id, label: s.label, status: failed ? "failed" : "running" };
    }
    return { id: s.id, label: s.label, status: "pending" };
  });
}

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
    site.includes(".") ? site : site ? `${site}.zatgo.online` : undefined;

  return {
    id,
    status,
    stages: stagesFromProgress(progress, statusRaw),
    error: status === "failed" ? safeJobError(raw.error_log, devConsole) : undefined,
    result:
      status === "succeeded" && domain
        ? { deskUrl: `https://${domain}`, hostname: domain }
        : undefined,
    progress,
    output: raw.output,
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
