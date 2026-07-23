"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type JobRow = {
  id: string;
  kind: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  meta?: Record<string, string>;
  stages: { id: string; label: string; status: string }[];
  error?: string;
  result?: { deskUrl?: string; hostname?: string };
  logTail: string[];
  logCount: number;
};

export default function DevActivityPage() {
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const load = () => {
      void fetch("/api/jobs")
        .then(async (r) => {
          const d = await r.json();
          if (!d.ok) throw new Error(d.error || "Failed to load jobs");
          setJobs(d.jobs || []);
          setError(null);
        })
        .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    };
    load();
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, []);

  const active = jobs.find((j) => j.id === selected) || jobs[0] || null;

  return (
    <div className="min-h-screen bg-[var(--space-ink)] px-4 py-8 text-[var(--space-mist)] sm:px-6">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-[var(--space-accent-soft)]">
              Development
            </p>
            <h1 className="text-2xl font-semibold">Space activity console</h1>
            <p className="mt-1 text-sm opacity-70">
              Live provision jobs, stages, and logs (local / env-gated).
            </p>
          </div>
          <Link href="/" className="text-sm text-[var(--space-accent-soft)] underline">
            ← Back to wizard
          </Link>
        </header>

        {error && (
          <div className="mb-4 rounded-lg border border-red-400/40 bg-red-950/40 px-4 py-3 text-sm text-red-200">
            {error}
            <div className="mt-1 opacity-70">
              Set <code>NEXT_PUBLIC_SPACE_DEV_CONSOLE=1</code> in `.env.local` if needed.
            </div>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <aside className="rounded-xl border border-white/10 bg-white/5 p-3">
            <p className="mb-2 text-xs uppercase tracking-wide opacity-60">Jobs</p>
            <ul className="max-h-[70vh] space-y-2 overflow-auto">
              {jobs.map((j) => (
                <li key={j.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(j.id)}
                    className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
                      active?.id === j.id ? "bg-[var(--space-accent)] text-white" : "bg-white/5 hover:bg-white/10"
                    }`}
                  >
                    <div className="font-medium">{j.meta?.hostname || j.id.slice(0, 8)}</div>
                    <div className="text-xs opacity-80">
                      {j.status} · {new Date(j.updatedAt).toLocaleTimeString()}
                    </div>
                  </button>
                </li>
              ))}
              {!jobs.length && !error && (
                <li className="px-2 py-6 text-center text-sm opacity-50">No jobs yet</li>
              )}
            </ul>
          </aside>

          <section className="rounded-xl border border-white/10 bg-black/30 p-4">
            {!active ? (
              <p className="text-sm opacity-60">Select a job to inspect activity.</p>
            ) : (
              <>
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">{active.meta?.hostname || active.id}</h2>
                    <p className="text-xs opacity-70">
                      {active.kind} · {active.status} · {active.logCount} log lines
                    </p>
                    <p className="mt-1 break-all font-mono text-[11px] opacity-50">{active.id}</p>
                  </div>
                  {active.result?.deskUrl && (
                    <a
                      href={active.result.deskUrl}
                      className="rounded-lg bg-[var(--space-accent)] px-3 py-1.5 text-sm text-white"
                    >
                      Open desk
                    </a>
                  )}
                </div>

                <div className="mb-4 flex flex-wrap gap-2">
                  {active.stages.map((s) => (
                    <span key={s.id} className="rounded bg-white/10 px-2 py-1 text-xs">
                      {s.label || s.id}: <strong>{s.status}</strong>
                    </span>
                  ))}
                </div>

                {active.error && (
                  <p className="mb-3 rounded-lg bg-red-950/50 px-3 py-2 text-sm text-red-200">
                    {active.error}
                  </p>
                )}

                <pre className="max-h-[55vh] overflow-auto whitespace-pre-wrap break-all rounded-lg bg-black/50 p-3 font-mono text-[11px] leading-relaxed text-[var(--space-mist)]/90">
                  {active.logTail.length ? active.logTail.join("\n") : "No logs yet"}
                </pre>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
