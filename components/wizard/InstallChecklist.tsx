"use client";

import { useState } from "react";
import { Check, ChevronDown, X as XIcon } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { deriveStages } from "@/lib/job-stages";

export type ChecklistStage = {
  id: string;
  label: string;
  hint?: string;
  status: string;
  durationMs?: number;
  log?: string[];
};
export type ChecklistLog = { level: "info" | "warn" | "error"; text: string; stage?: string };
export type ChecklistJob = {
  status: string;
  stages: ChecklistStage[];
  percent?: number;
  elapsedMs?: number;
  error?: string;
  log?: ChecklistLog[];
};

function fmt(ms?: number): string {
  if (ms === undefined) return "";
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

function Icon({ status }: { status: string }) {
  if (status === "succeeded" || status === "skipped")
    return (
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground" aria-label="Done">
        <Check className="size-4" />
      </span>
    );
  if (status === "running")
    return <span className="size-7 shrink-0 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-label="In progress" />;
  if (status === "failed")
    return (
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-destructive text-white" aria-label="Failed">
        <XIcon className="size-4" />
      </span>
    );
  return <span className="size-7 shrink-0 rounded-full border-2 border-border" aria-label="Waiting" />;
}

const CHIP: Record<string, string> = {
  succeeded: "Done",
  skipped: "Not needed",
  running: "In progress",
  failed: "Failed",
  pending: "Waiting",
};

/** Real, backend-driven install tasks; click a row for its detail and log lines. */
export function InstallChecklist({
  job,
  onRetry,
  busy,
}: {
  job: ChecklistJob | null;
  onRetry?: () => void;
  busy?: boolean;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const stages: ChecklistStage[] = job?.stages?.length ? job.stages : deriveStages({ status: "queued" });
  const running = !job || job.status === "queued" || job.status === "running";
  const pct = job?.status === "succeeded" ? 100 : Math.round(job?.percent ?? 0);

  return (
    <div className="space-y-4">
      {running && (
        <div className="rounded-xl bg-primary/10 px-4 py-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span>{job ? "Setting up your site — keep this page open." : "Waiting for the server to pick this up…"}</span>
            <span className="font-semibold text-primary tabular-nums">
              {pct}%{job?.elapsedMs !== undefined ? ` · ${fmt(job.elapsedMs)}` : ""}
            </span>
          </div>
          <Progress value={pct} className="mt-2" />
        </div>
      )}
      {job?.status === "succeeded" && (
        <p className="rounded-xl bg-primary/10 px-4 py-3 text-sm font-medium text-primary">
          Your site is ready{job.elapsedMs !== undefined ? ` — took ${fmt(job.elapsedMs)}` : ""}.
        </p>
      )}

      <ol className="divide-y divide-border rounded-xl border border-border">
        {stages.map((s) => {
          const expanded = open === s.id;
          return (
            <li key={s.id}>
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? null : s.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-secondary/50 focus-visible:outline-2 focus-visible:outline-ring"
              >
                <Icon status={s.status} />
                <span
                  className={cn(
                    "min-w-0 flex-1",
                    s.status === "running" && "font-medium text-primary",
                    s.status === "failed" && "font-medium text-destructive",
                    s.status === "pending" && "text-muted-foreground",
                  )}
                >
                  {s.label}
                </span>
                {s.durationMs !== undefined && <span className="text-xs tabular-nums text-muted-foreground">{fmt(s.durationMs)}</span>}
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-medium",
                    s.status === "failed" ? "bg-destructive/10 text-destructive" : s.status === "pending" ? "bg-secondary text-muted-foreground" : "bg-primary/10 text-primary",
                  )}
                >
                  {CHIP[s.status] ?? s.status}
                </span>
                <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", expanded && "rotate-180")} aria-hidden="true" />
              </button>
              {expanded && (
                <div className="space-y-2 bg-secondary/30 px-4 py-3 pl-14 text-xs text-muted-foreground">
                  {s.hint && <p>{s.hint}</p>}
                  {s.log && s.log.length > 0 ? (
                    <ul className="space-y-1 font-mono text-[11px] text-foreground">
                      {s.log.map((l, i) => (
                        <li key={i}>{l}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>No activity yet.</p>
                  )}
                  {(job?.log ?? []).filter((l) => l.stage === s.id && l.level === "warn").map((l, i) => (
                    <p key={`w${i}`} className="text-amber-600">{l.text}</p>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {job?.status === "failed" && (
        <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <p className="font-semibold text-destructive">Installation could not finish</p>
          <p className="mt-1">{job.error || "Something went wrong while creating your site. Please try again."}</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              disabled={busy}
              className="mt-3 rounded-lg bg-destructive px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy ? "Starting…" : "Try again"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
