"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { InstallChecklist, type ChecklistJob } from "@/components/wizard/InstallChecklist";
import { cn } from "@/lib/utils";

type HistoryRow = {
  id: string;
  type: string;
  status: string;
  progress: number;
  startedAt?: string;
  durationMs?: number;
  createdAt?: string;
};
type JobView = ChecklistJob & { id: string; admin?: boolean; log?: { level: "info" | "warn" | "error"; text: string }[] };
type Check = { id: string; label: string; status: "pass" | "fail" | "pending"; detail?: string };

const fmt = (ms?: number) => {
  if (ms === undefined) return "—";
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
};
const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  succeeded: "default",
  failed: "destructive",
  running: "secondary",
  queued: "outline",
};

export function DeploymentDashboard({ slug }: { slug: string }) {
  const [history, setHistory] = useState<HistoryRow[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [job, setJob] = useState<JobView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState<"all" | "warn" | "error">("all");
  const [follow, setFollow] = useState(true);
  const logRef = useRef<HTMLPreElement>(null);

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch(`/api/sites/${encodeURIComponent(slug)}/deployments`, { cache: "no-store" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Could not load deployments");
      setHistory(data.jobs);
      setSelected((cur) => cur ?? data.jobs[0]?.id ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load deployments");
    }
  }, [slug]);
  useEffect(() => void loadHistory(), [loadHistory]);

  // Poll the selected job every 2 s while it is still running.
  const live = !job || job.status === "queued" || job.status === "running";
  useEffect(() => {
    if (!selected) return;
    let stop = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/jobs/${selected}`, { cache: "no-store" });
        const data = await res.json();
        if (!stop && data.ok) setJob(data.job);
      } catch {
        /* keep the last good view */
      }
    };
    void tick();
    const t = setInterval(() => {
      if (live) void tick();
    }, 2000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [selected, live]);

  const lines = useMemo(
    () =>
      (job?.log ?? []).filter(
        (l) => (level === "all" || l.level === level) && (!query || l.text.toLowerCase().includes(query.toLowerCase())),
      ),
    [job?.log, level, query],
  );
  useEffect(() => {
    if (follow && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [lines, follow]);

  const runChecks = async () => {
    setChecking(true);
    try {
      const res = await fetch(`/api/sites/${encodeURIComponent(slug)}/diagnostics`, { cache: "no-store" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Could not run checks");
      setChecks(data.checks);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not run checks");
    } finally {
      setChecking(false);
    }
  };

  const text = lines.map((l) => l.text).join("\n");

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <Link href={`/sites/${encodeURIComponent(slug)}`} className="text-sm text-muted-foreground hover:underline">
        ← Back to site
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-foreground">Deployments</h1>
      <p className="text-sm text-muted-foreground">{slug}</p>
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <h2 className="text-base font-semibold">{job ? `Status: ${job.status}` : "Loading…"}</h2>
              {job && <span className="text-sm tabular-nums text-muted-foreground">{job.percent ?? 0}% · {fmt(job.elapsedMs)}</span>}
            </CardHeader>
            <CardContent>
              {history && history.length === 0 && <p className="text-sm text-muted-foreground">No deployments yet for this site.</p>}
              {job && <InstallChecklist job={job} />}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold">Log {job?.admin && <Badge variant="outline">admin: raw</Badge>}</h2>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search log"
                  aria-label="Search log"
                  className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                />
                <select
                  value={level}
                  onChange={(e) => setLevel(e.target.value as typeof level)}
                  aria-label="Filter by level"
                  className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="all">All</option>
                  <option value="warn">Warnings</option>
                  <option value="error">Errors</option>
                </select>
                <label className="flex items-center gap-1 text-xs text-muted-foreground">
                  <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} /> Follow
                </label>
                <Button size="sm" variant="outline" onClick={() => void navigator.clipboard?.writeText(text)}>Copy</Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const a = document.createElement("a");
                    a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
                    a.download = `${slug}-deployment.log`;
                    a.click();
                  }}
                >
                  Download
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <pre
                ref={logRef}
                tabIndex={0}
                aria-label="Deployment log"
                className="max-h-72 overflow-auto rounded-lg bg-secondary/60 p-3 font-mono text-xs leading-relaxed"
              >
                {lines.length ? (
                  lines.map((l, i) => (
                    <div key={i} className={cn(l.level === "warn" && "text-amber-600", l.level === "error" && "text-destructive")}>
                      {l.text}
                    </div>
                  ))
                ) : (
                  <span className="text-muted-foreground">No log lines.</span>
                )}
              </pre>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <h2 className="text-base font-semibold">Diagnostics</h2>
              <Button size="sm" onClick={runChecks} disabled={checking}>{checking ? "Checking…" : "Run checks"}</Button>
            </CardHeader>
            <CardContent>
              {!checks && <p className="text-sm text-muted-foreground">Checks the site record, DNS, HTTPS and response.</p>}
              <ul className="space-y-2 text-sm">
                {checks?.map((c) => (
                  <li key={c.id} className="flex items-start gap-2">
                    <span
                      aria-label={c.status}
                      className={cn(
                        "mt-1 size-2.5 shrink-0 rounded-full",
                        c.status === "pass" && "bg-emerald-500",
                        c.status === "fail" && "bg-destructive",
                        c.status === "pending" && "bg-amber-500",
                      )}
                    />
                    <span>
                      {c.label}
                      {c.detail && <span className="block text-xs text-muted-foreground">{c.detail}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><h2 className="text-base font-semibold">History</h2></CardHeader>
            <CardContent>
              <ul className="space-y-1">
                {history?.map((h) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setJob(null);
                        setSelected(h.id);
                      }}
                      aria-current={h.id === selected ? "true" : undefined}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-secondary/60",
                        h.id === selected && "bg-secondary",
                      )}
                    >
                      <span>
                        {h.type}
                        <span className="block text-xs text-muted-foreground">{h.createdAt?.slice(0, 16)} · {fmt(h.durationMs)}</span>
                      </span>
                      <Badge variant={STATUS_VARIANT[h.status] ?? "outline"}>{h.status}</Badge>
                    </button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
