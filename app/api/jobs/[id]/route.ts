import { NextResponse } from "next/server";
import { getJob } from "@/lib/jobs";
import { isDevConsoleEnabled } from "@/lib/dev-console";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
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
