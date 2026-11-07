"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Check, X as XIcon } from "lucide-react";
import { DevActivityConsole } from "@/components/DevActivityConsole";
import { WizardStepper } from "@/components/wizard/WizardStepper";
import { InstallChecklist } from "@/components/wizard/InstallChecklist";
import { isDevConsoleEnabled } from "@/lib/dev-console";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { validateSiteStep } from "@/lib/site-step";

type Catalog = {
  domainSuffix: string;
};

type JobView = {
  id: string;
  status: string;
  stages: { id: string; label: string; status: string; hint?: string; durationMs?: number; log?: string[] }[];
  percent?: number;
  elapsedMs?: number;
  log?: { level: "info" | "warn" | "error"; text: string; stage?: string }[];
  error?: string;
  result?: { deskUrl?: string; hostname?: string };
};

const STEPS = ["Site", "Install"] as const;

/** Friendly install checklist — labels only, no ops/workflow secrets. */
const INSTALL_STEPS = [
  { id: "validate", label: "Checking your site name", typicalMs: 20_000 },
  { id: "dns", label: "Connecting your subdomain", typicalMs: 30_000 },
  { id: "new-site", label: "Creating your ERP site", typicalMs: 15 * 60_000 },
  { id: "apps", label: "Installing your ZatGo apps", typicalMs: 8 * 60_000 },
  { id: "cache", label: "Finishing setup", typicalMs: 60_000 },
] as const;

/** Soft mid-levels while a step is still running (real finish = 100%). */
const RUNNING_LEVELS = [20, 50, 80, 92] as const;

function softPercentForElapsed(elapsedMs: number, typicalMs: number): number {
  const t = Math.min(1, Math.max(0, elapsedMs / typicalMs));
  // Ease toward 92% over the typical duration — never 100 until server says done
  if (t < 0.15) return 20;
  if (t < 0.4) return 50;
  if (t < 0.75) return 80;
  return 92;
}

function StageIcon({ status }: { status: string }) {
  if (status === "succeeded" || status === "skipped") {
    return (
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground" aria-label="Done">
        <Check className="size-4" />
      </span>
    );
  }
  if (status === "running") {
    return (
      <span
        className="size-8 shrink-0 animate-spin rounded-full border-2 border-primary border-t-transparent"
        aria-label="In progress"
      />
    );
  }
  if (status === "failed") {
    return (
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-destructive text-sm font-bold text-white" aria-label="Failed">
        <XIcon className="size-4" />
      </span>
    );
  }
  return <span className="size-8 shrink-0 rounded-full border-2 border-border" aria-label="Waiting" />;
}

function resolveStageStatus(
  stepId: string,
  stepIndex: number,
  job: JobView | null,
  jobId?: string | null,
): string {
  const live = job?.stages.find((s) => s.id === stepId);
  if (job?.status === "failed") {
    if (live?.status === "running") return "failed";
    if (live?.status === "failed") return "failed";
    if (live?.status === "succeeded" || live?.status === "skipped") return live.status;
    const failedIdx = INSTALL_STEPS.findIndex(
      (s) => job.stages.find((x) => x.id === s.id)?.status === "failed",
    );
    if (failedIdx >= 0 && stepIndex > failedIdx) return "pending";
    if (failedIdx >= 0 && stepIndex < failedIdx) return "succeeded";
  }
  if (live?.status) return live.status;
  if (job?.status === "succeeded") return "succeeded";
  if (job?.status === "failed" && stepIndex === 0 && (!job.stages || job.stages.length === 0)) {
    return "failed";
  }
  if (job?.status === "running" && job.stages.some((s) => s.status === "running")) {
    const runningIdx = INSTALL_STEPS.findIndex(
      (s) => job.stages.find((x) => x.id === s.id)?.status === "running",
    );
    if (stepIndex < runningIdx) return "succeeded";
  }
  // Soft "running" on first step until real stages arrive
  if (jobId && stepIndex === 0 && (!job || job.stages.length === 0) && job?.status !== "failed") {
    return "running";
  }
  return "pending";
}

export function SpaceWizard() {
  const searchParams = useSearchParams();
  const isTrialFlow = searchParams.get("trial") === "1";
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [step, setStep] = useState(0);
  const [slug, setSlug] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [preferredRegion, setPreferredRegion] = useState("");
  const [regions, setRegions] = useState<{ name?: string; title?: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobView | null>(null);
  /** Soft % for the currently running step (20 / 50 / 80 / 92). */
  const [runningLevel, setRunningLevel] = useState<(typeof RUNNING_LEVELS)[number]>(20);
  const [activeRunningId, setActiveRunningId] = useState<string | null>(null);
  const runningStartedAt = useRef<number>(Date.now());
  const showDevConsole = isDevConsoleEnabled();

  useEffect(() => {
    void fetch("/api/catalog")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setCatalog(d);
      })
      .catch(() => setError("Failed to load catalog"));
    void fetch("/api/regions")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && Array.isArray(d.data)) setRegions(d.data);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!jobId) return;
    let misses = 0;
    const t = setInterval(() => {
      void fetch(`/api/jobs/${jobId}`)
        .then(async (r) => {
          const d = await r.json();
          if (d.ok && d.job) {
            misses = 0;
            setJob({ ...d.job, stages: Array.isArray(d.job.stages) ? d.job.stages : [] });
            return;
          }
          misses += 1;
          if (r.status === 404 && misses >= 3) {
            setJob({
              id: jobId,
              status: "failed",
              stages: [{ id: "validate", label: "Checking your site name", status: "failed" }],
              error:
                "Installation lost connection to the server job. Please click Try again.",
            });
          }
        })
        .catch(() => {
          misses += 1;
        });
    }, 1500);
    return () => clearInterval(t);
  }, [jobId]);

  // Track which stage is active (stable across job poll updates)
  const runningStageId = useMemo(() => {
    if (!jobId) return null;
    if (job?.status === "failed" || job?.status === "succeeded") return null;
    const running = job?.stages.find((s) => s.status === "running");
    if (running) return running.id;
    if (!job || job.stages.length === 0 || job.status === "queued") return "__queued__";
    return null;
  }, [job, jobId]);

  useEffect(() => {
    if (!runningStageId) return;
    if (runningStageId !== activeRunningId) {
      setActiveRunningId(runningStageId);
      runningStartedAt.current = Date.now();
      setRunningLevel(20);
    }
  }, [runningStageId, activeRunningId]);

  // Advance soft % from elapsed time — not reset by job polling
  useEffect(() => {
    if (!activeRunningId || !jobId) return;
    if (job?.status === "failed" || job?.status === "succeeded") return;

    const stepDef =
      INSTALL_STEPS.find((s) => s.id === activeRunningId) || INSTALL_STEPS[0];
    const typicalMs = stepDef.typicalMs;

    const tick = () => {
      const elapsed = Date.now() - runningStartedAt.current;
      setRunningLevel(softPercentForElapsed(elapsed, typicalMs) as (typeof RUNNING_LEVELS)[number]);
    };
    tick();
    const t = setInterval(tick, 2000);
    return () => clearInterval(t);
  }, [activeRunningId, jobId, job?.status]);

  const stepPercents = useMemo(() => {
    return INSTALL_STEPS.map((stepDef, index) => {
      const status = resolveStageStatus(stepDef.id, index, job, jobId);
      if (status === "succeeded" || status === "skipped") return 100;
      if (status === "failed") return Math.max(runningLevel, 20);
      if (status === "running") return runningLevel;
      return 0;
    });
  }, [job, jobId, runningLevel]);

  const overallPercent = useMemo(() => {
    if (job?.status === "succeeded") return 100;
    const sum = stepPercents.reduce((a, b) => a + b, 0);
    return Math.min(99, Math.round(sum / INSTALL_STEPS.length));
  }, [job, stepPercents]);

  const activeHint = useMemo(() => {
    if (activeRunningId === "new-site") {
      return "Creating the site can take 10–20 minutes. Progress moves 20% → 50% → 80% while it works.";
    }
    if (activeRunningId === "apps") {
      return "Installing apps can take several minutes.";
    }
    return "Still installing — keep this page open.";
  }, [activeRunningId]);

  const hostname = useMemo(() => {
    const s = slug.trim().toLowerCase();
    if (!s || !catalog) return "";
    return `${s}.${catalog.domainSuffix}`;
  }, [slug, catalog]);

  /** One click: validate the Site step, then start the installation (no plan, apps or payment to choose). */
  const startInstall = useCallback(async () => {
    const problem = validateSiteStep({ slug, password, confirm });
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    setJob(null);
    setJobId(null);
    setRunningLevel(20);
    setActiveRunningId(null);
    runningStartedAt.current = Date.now();
    try {
      const res = await fetch("/api/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: slug.trim().toLowerCase(),
          adminPassword: password,
          ...(preferredRegion ? { preferredRegion } : {}),
          ...(companyName.trim() ? { companyName: companyName.trim() } : {}),
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Could not start installation");
      setJobId(data.jobId);
      setStep(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [slug, password, confirm, preferredRegion, companyName]);

  const retryInstall = () => {
    setError(null);
    setJob(null);
    setJobId(null);
    void startInstall();
  };

  const failedStepLabel = useMemo(() => {
    if (!job || job.status !== "failed") return null;
    const failed = job.stages.find((s) => s.status === "failed");
    if (!failed) return null;
    return INSTALL_STEPS.find((s) => s.id === failed.id)?.label || failed.label;
  }, [job]);

  return (
    <div className="flex flex-col">
      <header className="mb-10">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium tracking-wide text-primary">ZatGo</p>
            <h1 className="mt-1 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">Create Your Business ERP</h1>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <Button variant="secondary" size="sm" nativeButton={false} render={<Link href="/">Your sites</Link>} />
            {showDevConsole && (
              <span className="rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-muted-foreground">
                Dev logs: bottom-right
              </span>
            )}
          </div>
        </div>
        <p className="mt-3 max-w-xl text-base text-muted-foreground">
          Choose your site name and set your administrator password. Your first month is free and every ZatGo app is
          included.
        </p>
        {isTrialFlow && (
          <p className="mt-3 inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            🎉 Pick a site name to start your 1 month free trial
          </p>
        )}
      </header>

      <WizardStepper
        steps={STEPS}
        current={step}
        canGoTo={(i) => !jobId && !busy && i < 1}
        onGoTo={(i) => {
          setError(null);
          setStep(i);
        }}
      />

      <Card className="relative overflow-hidden p-6 sm:p-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -40, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            {step === 0 && (
              <section>
                <h2 className="text-xl font-semibold text-foreground">Create your site</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Your web address is set from the site name. You sign in as <strong>Administrator</strong> with the
                  password you choose here.
                </p>
                <Label className="mt-6 block">Site name</Label>
                <div className="mt-2 flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2">
                  <input
                    className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
                    placeholder="acme"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value.toLowerCase())}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <span className="shrink-0 text-sm text-muted-foreground">.{catalog?.domainSuffix || "zatgoinnovation.com"}</span>
                </div>
                {hostname && (
                  <p className="mt-3 text-sm text-muted-foreground">
                    Your site: <strong className="font-medium text-foreground">https://{hostname}</strong>
                  </p>
                )}
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label>Administrator password</Label>
                    <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Confirm password</Label>
                    <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                  </div>
                </div>
                <div className="mt-6 grid gap-1.5 sm:max-w-md">
                  <Label>Company name (optional)</Label>
                  <Input
                    placeholder="e.g. Acme Trading Co"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                  />
                </div>
                {regions.length > 0 && (
                  <div className="mt-6">
                    <Label className="mb-2 block">Preferred region (optional)</Label>
                    <Select value={preferredRegion} onValueChange={(v) => setPreferredRegion(v ?? "")}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Auto (nearest available)" />
                      </SelectTrigger>
                      <SelectContent>
                        {regions.map((r) => (
                          <SelectItem key={r.name} value={r.name || ""}>
                            {r.title || r.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </section>
            )}

            {step === 1 && (
              <section>
                <h2 className="text-xl font-semibold text-foreground">Installing</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {hostname ? `Setting up ${hostname}` : "We will set up your site and open your ERP when ready."}
                </p>
                {(jobId || job) && (
                  <div className="mt-6 space-y-4">
                    <InstallChecklist job={job} onRetry={retryInstall} busy={busy} />
                    {slug.trim() && (
                      <Link
                        href={`/sites/${encodeURIComponent(slug.trim().toLowerCase())}/deployments`}
                        className="inline-block text-sm text-primary hover:underline"
                      >
                        View full deployment details →
                      </Link>
                    )}
                    {job?.status === "succeeded" && job.result?.deskUrl && (
                      <Button nativeButton={false} render={<a href={job.result.deskUrl}>Open your ERP login</a>} />
                    )}

                  </div>
                )}
              </section>
            )}
          </motion.div>
        </AnimatePresence>

        {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

        <CardContent className="mt-8 flex justify-between gap-3 px-0 pb-0">
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setError(null);
              setJob(null);
              setJobId(null);
              setStep(0);
            }}
            disabled={step === 0 || busy || (Boolean(jobId) && job?.status !== "failed" && job?.status !== "succeeded")}
          >
            Back
          </Button>
          {step === 0 && (
            <Button type="button" onClick={() => void startInstall()} disabled={busy}>
              {busy ? "Starting…" : "Create my site"}
            </Button>
          )}
        </CardContent>
      </Card>
      {showDevConsole && <DevActivityConsole jobId={jobId} />}
    </div>
  );
}
