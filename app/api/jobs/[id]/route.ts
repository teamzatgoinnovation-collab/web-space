import { NextResponse } from "next/server";
import { frappeControlEnabled, frappeGetJob } from "@/lib/frappe-space";
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

function mapFrappeJob(raw: Record<string, unknown>, id: string) {
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
    error: status === "failed" ? String(raw.error_log || "Job failed").slice(0, 500) : undefined,
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
    try {
      const message = (await frappeGetJob(id)) as {
        ok?: boolean;
        data?: Record<string, unknown>;
        error?: string;
      };
      if (message && message.ok === false) {
        return NextResponse.json(
          { ok: false, error: message.error || "Job not found" },
          { status: 404 },
        );
      }
      const data = (message?.data || message) as Record<string, unknown>;
      if (!data || typeof data !== "object") {
        return NextResponse.json({ ok: false, error: "Job not found" }, { status: 404 });
      }
      const job = mapFrappeJob(data, id);
      return NextResponse.json({
        ok: true,
        job: isDevConsoleEnabled()
          ? { ...job, kind: "space:provision", log: String(data.output || "").split("\n").filter(Boolean) }
          : job,
        controlPlane: "space",
        dev: isDevConsoleEnabled(),
      });
    } catch (err) {
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
