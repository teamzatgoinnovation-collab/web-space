"use client";

import { useEffect, useRef, useState } from "react";

type DevJob = {
  id: string;
  status: string;
  kind?: string;
  stages?: { id: string; label: string; status: string }[];
  log?: string[];
  error?: string;
  meta?: Record<string, string>;
  createdAt?: number;
  updatedAt?: number;
  result?: { deskUrl?: string; hostname?: string };
};

export function DevActivityConsole({
  jobId,
  openDefault = true,
}: {
  jobId?: string | null;
  openDefault?: boolean;
}) {
  const [open, setOpen] = useState(openDefault);
  const [job, setJob] = useState<DevJob | null>(null);
  const [enabled, setEnabled] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!jobId || !open) return;
    let alive = true;
    const poll = () => {
      void fetch(`/api/jobs/${jobId}`)
        .then((r) => r.json())
        .then((d) => {
          if (!alive) return;
          setEnabled(Boolean(d.dev));
          if (d.ok && d.job) setJob(d.job);
        })
        .catch(() => undefined);
    };
    poll();
    const t = setInterval(poll, 1500);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [jobId, open]);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [job?.log?.length, open]);

  if (!jobId) return null;

  return (
    <div className="mt-6 overflow-hidden rounded-xl border border-[var(--space-ink)]/15 bg-[var(--space-ink)] text-[var(--space-mist)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-xs font-medium tracking-wide uppercase"
      >
        <span>Dev activity console</span>
        <span className="opacity-60">{open ? "Hide" : "Show"}</span>
      </button>
      {open && (
        <div className="border-t border-white/10 px-4 py-3">
          {!enabled && (
            <p className="text-xs text-amber-200/90">
              Console waiting for job data… (enable NEXT_PUBLIC_SPACE_DEV_CONSOLE=1 if empty)
            </p>
          )}
          {job && (
            <div className="mb-3 space-y-1 text-xs opacity-80">
              <div>
                job <code className="text-[var(--space-accent-soft)]">{job.id}</code> · {job.status}
                {job.meta?.hostname ? ` · ${job.meta.hostname}` : ""}
              </div>
              <div className="flex flex-wrap gap-2">
                {(job.stages || []).map((s) => (
                  <span
                    key={s.id}
                    className="rounded bg-white/10 px-2 py-0.5"
                  >
                    {s.id}:{s.status}
                  </span>
                ))}
              </div>
              {job.error && <div className="text-red-300">error: {job.error}</div>}
            </div>
          )}
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-[var(--space-mist)]/90">
            {(job?.log || []).length
              ? (job?.log || []).join("\n")
              : "No activity lines yet…"}
            <div ref={endRef} />
          </pre>
          <div className="mt-3 text-right">
            <a href="/dev" className="text-xs text-[var(--space-accent-soft)] underline">
              Open full activity screen
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
