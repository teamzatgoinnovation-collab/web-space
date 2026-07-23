import { NextResponse } from "next/server";
import { getJob } from "@/lib/jobs";

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
  return NextResponse.json({
    ok: true,
    job: {
      id: job.id,
      status: job.status,
      stages: job.stages,
      log: job.log,
      error: job.error,
      result: job.result,
    },
  });
}
