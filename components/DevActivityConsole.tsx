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
};

type JobRow = {
  id: string;
  status: string;
  meta?: Record<string, string>;
  updatedAt: number;
  logTail: string[];
  stages: { id: string; status: string }[];
  error?: string;
};

export function DevActivityConsole({
  jobId,
  compact = true,
}: {
  jobId?: string | null;
  /** Small dock panel (default). */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [live, setLive] = useState<DevJob | null>(null);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  const activeId = jobId || picked || jobs[0]?.id || null;

  useEffect(() => {
    if (!open) return;
    let alive = true;

    const loadList = () => {
      void fetch("/api/jobs")
        .then((r) => r.json())
        .then((d) => {
          if (!alive) return;
          if (d.ok) {
            setEnabled(true);
            setJobs(d.jobs || []);
          } else {
            setEnabled(false);
          }
        })
        .catch(() => undefined);
    };

    const loadJob = () => {
      if (!activeId) return;
      void fetch(`/api/jobs/${activeId}`)
        .then((r) => r.json())
        .then((d) => {
          if (!alive) return;
          if (d.dev) setEnabled(true);
          if (d.ok && d.job) setLive(d.job);
        })
        .catch(() => undefined);
    };

    loadList();
    loadJob();
    const t = setInterval(() => {
      loadList();
      loadJob();
    }, 1500);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [open, activeId]);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [live?.log?.length, open]);

  const lines = live?.log?.length
    ? live.log
    : jobs.find((j) => j.id === activeId)?.logTail || [];

  if (!compact) {
    // fallback unused — keep API stable
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      {open && (
        <div className="flex w-[min(100vw-2rem,22rem)] flex-col overflow-hidden rounded-xl border border-[var(--space-ink)]/20 bg-[var(--space-ink)] text-[var(--space-mist)] shadow-xl">
          <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide">
              Dev activity
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[11px] opacity-60 hover:opacity-100"
            >
              Close
            </button>
          </div>

          {!enabled && (
            <p className="px-3 py-2 text-[11px] text-amber-200/90">
              Console off — set NEXT_PUBLIC_SPACE_DEV_CONSOLE=1
            </p>
          )}

          {jobs.length > 0 && (
            <div className="flex gap-1 overflow-x-auto border-b border-white/10 px-2 py-1.5">
              {jobs.slice(0, 6).map((j) => (
                <button
                  key={j.id}
                  type="button"
                  onClick={() => setPicked(j.id)}
                  className={`shrink-0 rounded px-2 py-0.5 text-[10px] ${
                    activeId === j.id ? "bg-[var(--space-accent)] text-white" : "bg-white/10"
                  }`}
                  title={j.id}
                >
                  {(j.meta?.hostname || j.id).replace(".zatgo.online", "")}
                </button>
              ))}
            </div>
          )}

          {live && (
            <div className="space-y-1 border-b border-white/10 px-3 py-1.5 text-[10px] opacity-80">
              <div>
                {live.status}
                {live.meta?.hostname ? ` · ${live.meta.hostname}` : ""}
              </div>
              <div className="flex flex-wrap gap-1">
                {(live.stages || []).map((s) => (
                  <span key={s.id} className="rounded bg-white/10 px-1.5 py-0.5">
                    {s.id}:{s.status}
                  </span>
                ))}
              </div>
              {live.error && <div className="text-red-300">{live.error}</div>}
            </div>
          )}

          <pre className="h-40 overflow-auto whitespace-pre-wrap break-all px-3 py-2 font-mono text-[10px] leading-snug text-[var(--space-mist)]/90">
            {lines.length ? lines.slice(-80).join("\n") : "No activity yet…"}
            <div ref={endRef} />
          </pre>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-full bg-[var(--space-ink)] px-4 py-2 text-xs font-medium text-white shadow-lg ring-1 ring-white/10 hover:bg-[var(--space-ink)]/90"
      >
        {open ? "Hide logs" : "Dev logs"}
      </button>
    </div>
  );
}
