import { NextResponse } from "next/server";
import { callMethod, FrappeAuthError } from "@/lib/frappe-customer";
import { getSid } from "@/lib/require-sid";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = {
  name: string;
  job_type?: string;
  status?: string;
  progress?: number;
  started_at?: string;
  finished_at?: string;
  creation?: string;
};

function ms(s?: string): number | undefined {
  if (!s) return undefined;
  const t = Date.parse(s.replace(" ", "T"));
  return Number.isNaN(t) ? undefined : t;
}

/** A site's deployment history (own sites only; the backend enforces access). */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const sid = await getSid();
  if (!sid) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  try {
    const rows = await callMethod<Row[]>("space_cloud.api.v1.space.list_jobs", { site: slug }, sid);
    const jobs = (Array.isArray(rows) ? rows : []).map((r) => {
      const a = ms(r.started_at);
      const b = ms(r.finished_at);
      return {
        id: r.name,
        type: r.job_type || "Job",
        status: String(r.status || "Queued").toLowerCase(),
        progress: Number(r.progress || 0),
        startedAt: r.started_at,
        finishedAt: r.finished_at,
        createdAt: r.creation,
        durationMs: a !== undefined && b !== undefined && b >= a ? b - a : undefined,
      };
    });
    return NextResponse.json({ ok: true, jobs });
  } catch (err) {
    if (err instanceof FrappeAuthError) return NextResponse.json({ ok: false, error: err.message }, { status: 401 });
    return NextResponse.json({ ok: false, error: "Could not load deployments." }, { status: 502 });
  }
}
