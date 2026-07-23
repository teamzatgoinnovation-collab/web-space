import { NextResponse } from "next/server";
import { listJobs } from "@/lib/jobs";
import { isDevConsoleEnabled } from "@/lib/dev-console";

export const runtime = "nodejs";

export async function GET() {
  if (!isDevConsoleEnabled()) {
    return NextResponse.json({ ok: false, error: "Dev console disabled" }, { status: 403 });
  }

  const jobs = listJobs(50).map((j) => ({
    id: j.id,
    kind: j.kind,
    status: j.status,
    createdAt: j.createdAt,
    updatedAt: j.updatedAt,
    meta: j.meta,
    stages: j.stages,
    error: j.error,
    result: j.result,
    logTail: j.log.slice(-30),
    logCount: j.log.length,
  }));

  return NextResponse.json({ ok: true, jobs });
}
