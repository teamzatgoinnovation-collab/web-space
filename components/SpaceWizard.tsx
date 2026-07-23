"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { DevActivityConsole } from "@/components/DevActivityConsole";
import { isDevConsoleEnabled } from "@/lib/dev-console";
import { formatMb } from "@/lib/format";
import Link from "next/link";

type Catalog = {
  domainSuffix: string;
  apps: { package: string; title: string; required?: boolean }[];
  plans: {
    code: string;
    title: string;
    mock_price: string;
    features: string[];
    ramLimitMb?: number;
    diskLimitMb?: number;
  }[];
  pool?: {
    ramPoolMb: number;
    diskPoolMb: number;
    allocatedRamMb: number;
    allocatedDiskMb: number;
    freeRamMb: number;
    freeDiskMb: number;
    siteCount: number;
  };
};

type JobView = {
  id: string;
  status: string;
  stages: { id: string; label: string; status: string }[];
  error?: string;
  result?: { deskUrl?: string; hostname?: string };
};

const STEPS = ["Site", "Apps", "Plan", "Install"] as const;

/** Friendly install checklist — labels only, no ops/workflow secrets. */
const INSTALL_STEPS = [
  { id: "validate", label: "Checking your site name", typicalMs: 20_000 },
  { id: "dns", label: "Connecting your subdomain", typicalMs: 30_000 },
  { id: "new-site", label: "Creating your ERPNext site", typicalMs: 15 * 60_000 },
  { id: "apps", label: "Installing selected apps", typicalMs: 8 * 60_000 },
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
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--space-accent)] text-white"
        aria-label="Done"
      >
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden>
          <path
            d="M4.5 10.5 8 14l7.5-8"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    );
  }
  if (status === "running") {
    return (
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-[var(--space-accent)] border-t-transparent animate-spin"
        aria-label="In progress"
      />
    );
  }
  if (status === "failed") {
    return (
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-600 text-white text-sm font-bold"
        aria-label="Failed"
      >
        !
      </span>
    );
  }
  return (
    <span
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-[var(--space-ink)]/20"
      aria-label="Waiting"
    />
  );
}

function resolveStageStatus(
  stepId: string,
  stepIndex: number,
  job: JobView | null,
  jobId?: string | null,
): string {
  const live = job?.stages.find((s) => s.id === stepId);
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
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [step, setStep] = useState(0);
  const [slug, setSlug] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [selectedApps, setSelectedApps] = useState<string[]>(["frappe", "erpnext"]);
  const [plan, setPlan] = useState("basic");
  const [payment, setPayment] = useState<"Mock" | "Stripe" | "PayPal">("Mock");
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
            setJob(d.job);
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

  const toggleApp = (pkg: string, required?: boolean) => {
    if (required || pkg === "frappe") return;
    setSelectedApps((prev) =>
      prev.includes(pkg) ? prev.filter((p) => p !== pkg) : [...prev, pkg],
    );
  };

  const next = () => {
    setError(null);
    if (step === 0) {
      if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(slug.trim().toLowerCase())) {
        setError("Enter a valid subdomain (lowercase, numbers, hyphens)");
        return;
      }
    }
    if (step === 1) {
      if (password.length < 8) {
        setError("Administrator password must be at least 8 characters");
        return;
      }
      if (password !== confirm) {
        setError("Passwords do not match");
        return;
      }
    }
    setStep((s) => Math.min(s + 1, 3));
  };

  const back = () => {
    setError(null);
    setStep((s) => Math.max(s - 1, 0));
  };

  const startInstall = useCallback(async () => {
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
          apps: selectedApps,
          plan,
          paymentMethod: payment,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Could not start installation");
      setJobId(data.jobId);
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [slug, password, selectedApps, plan, payment]);

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
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-4 py-10 sm:px-6">
      <header className="mb-10">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium tracking-wide text-[var(--space-accent)]">ZatGo</p>
            <h1 className="mt-1 text-4xl font-semibold tracking-tight text-[var(--space-ink)] sm:text-5xl">
              Space
            </h1>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <Link
              href="/sites"
              className="rounded-lg border border-[var(--space-ink)]/15 bg-white/60 px-3 py-1.5 text-xs font-medium text-[var(--space-ink)]/70 hover:bg-white"
            >
              Sites dashboard
            </Link>
            {showDevConsole && (
              <span className="rounded-lg border border-[var(--space-ink)]/15 bg-white/60 px-3 py-1.5 text-xs font-medium text-[var(--space-ink)]/50">
                Dev logs: bottom-right
              </span>
            )}
          </div>
        </div>
        <p className="mt-3 max-w-xl text-base text-[var(--space-ink)]/70">
          Create an ERPNext site on the shared Docker bench as a zatgo.online subdomain — pick
          apps from the bench, choose a plan, and go.
        </p>
      </header>

      <nav className="mb-8 flex gap-2" aria-label="Steps">
        {STEPS.map((label, i) => (
          <div
            key={label}
            className={`flex-1 rounded-full py-2 text-center text-xs font-medium sm:text-sm ${
              i === step
                ? "bg-[var(--space-ink)] text-white"
                : i < step
                  ? "bg-[var(--space-accent-soft)] text-[var(--space-accent)]"
                  : "bg-white/50 text-[var(--space-ink)]/40"
            }`}
          >
            {label}
          </div>
        ))}
      </nav>

      <div className="relative overflow-hidden rounded-2xl border border-[var(--space-ink)]/10 bg-white/70 p-6 shadow-sm backdrop-blur sm:p-8">
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
                <h2 className="text-xl font-semibold">Choose your subdomain</h2>
                <p className="mt-1 text-sm text-[var(--space-ink)]/60">
                  Other URLs are set automatically from this name.
                </p>
                <label className="mt-6 block text-sm font-medium">Site name</label>
                <div className="mt-2 flex items-center gap-2 rounded-xl border border-[var(--space-ink)]/15 bg-white px-3 py-2">
                  <input
                    className="min-w-0 flex-1 bg-transparent outline-none"
                    placeholder="acme"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value.toLowerCase())}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <span className="shrink-0 text-sm text-[var(--space-ink)]/50">
                    .{catalog?.domainSuffix || "zatgo.online"}
                  </span>
                </div>
                {hostname && (
                  <ul className="mt-4 space-y-1 text-sm text-[var(--space-ink)]/70">
                    <li>
                      Desk: <strong className="font-medium">https://{hostname}</strong>
                    </li>
                    <li>
                      Site name: <strong className="font-medium">{hostname}</strong>
                    </li>
                  </ul>
                )}
              </section>
            )}

            {step === 1 && (
              <section>
                <h2 className="text-xl font-semibold">Apps & Administrator</h2>
                <p className="mt-1 text-sm text-[var(--space-ink)]/60">
                  Apps listed from the Docker bench (<code className="text-xs">get-app</code> /{" "}
                  <code className="text-xs">apps/</code>). Username is fixed as{" "}
                  <strong>Administrator</strong>.
                </p>
                <div className="mt-6 grid gap-2 sm:grid-cols-2">
                  {(catalog?.apps || []).map((app) => {
                    const on = selectedApps.includes(app.package);
                    return (
                      <button
                        key={app.package}
                        type="button"
                        disabled={app.required || app.package === "frappe"}
                        onClick={() => toggleApp(app.package, app.required)}
                        className={`rounded-xl border px-4 py-3 text-left text-sm transition ${
                          on
                            ? "border-[var(--space-accent)] bg-[var(--space-accent-soft)]"
                            : "border-[var(--space-ink)]/10 bg-white hover:border-[var(--space-ink)]/25"
                        }`}
                      >
                        <div className="font-medium">{app.title}</div>
                        <div className="text-xs opacity-60">{app.package}</div>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium">Password</label>
                    <input
                      type="password"
                      className="mt-2 w-full rounded-xl border border-[var(--space-ink)]/15 bg-white px-3 py-2 outline-none"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium">Confirm</label>
                    <input
                      type="password"
                      className="mt-2 w-full rounded-xl border border-[var(--space-ink)]/15 bg-white px-3 py-2 outline-none"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                    />
                  </div>
                </div>
              </section>
            )}

            {step === 2 && (
              <section>
                <h2 className="text-xl font-semibold">Billing plan</h2>
                <p className="mt-1 text-sm text-[var(--space-ink)]/60">
                  Soft quotas on the shared Docker bench — mock billing, no charge
                  {catalog?.pool
                    ? ` (${formatMb(catalog.pool.ramPoolMb)} RAM pool).`
                    : " (10 GB RAM pool)."}
                </p>
                {catalog?.pool && (
                  <p className="mt-2 text-xs text-[var(--space-ink)]/50">
                    Pool free: {formatMb(catalog.pool.freeRamMb)} RAM ·{" "}
                    {formatMb(catalog.pool.freeDiskMb)} disk
                    {catalog.pool.siteCount
                      ? ` · ${catalog.pool.siteCount} site${catalog.pool.siteCount === 1 ? "" : "s"} allocated`
                      : ""}
                  </p>
                )}
                <div className="mt-6 grid gap-3">
                  {(catalog?.plans || []).map((p) => {
                    const ram = p.ramLimitMb ?? 0;
                    const disk = p.diskLimitMb ?? 0;
                    const fitsRam =
                      !catalog?.pool || catalog.pool.freeRamMb >= ram;
                    const fitsDisk =
                      !catalog?.pool || catalog.pool.freeDiskMb >= disk;
                    const fits = fitsRam && fitsDisk;
                    return (
                      <button
                        key={p.code}
                        type="button"
                        disabled={!fits}
                        onClick={() => setPlan(p.code)}
                        className={`rounded-xl border px-4 py-4 text-left transition ${
                          plan === p.code
                            ? "border-[var(--space-accent)] bg-[var(--space-accent-soft)]"
                            : "border-[var(--space-ink)]/10 bg-white"
                        } ${!fits ? "cursor-not-allowed opacity-50" : ""}`}
                      >
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="font-semibold">{p.title}</span>
                          <span className="text-sm opacity-70">{p.mock_price}</span>
                        </div>
                        {(ram > 0 || disk > 0) && (
                          <p className="mt-1.5 text-sm font-medium text-[var(--space-accent)]">
                            {formatMb(ram)} RAM · {formatMb(disk)} disk
                          </p>
                        )}
                        {!fits && (
                          <p className="mt-1 text-xs text-amber-800">
                            Does not fit remaining pool capacity
                          </p>
                        )}
                        <ul className="mt-2 list-inside list-disc text-xs opacity-70">
                          {p.features.map((f) => (
                            <li key={f}>{f}</li>
                          ))}
                        </ul>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-6">
                  <p className="text-sm font-medium">Payment method</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(["Mock", "Stripe", "PayPal"] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        disabled={m !== "Mock"}
                        onClick={() => setPayment(m)}
                        className={`rounded-full px-4 py-1.5 text-sm ${
                          payment === m
                            ? "bg-[var(--space-ink)] text-white"
                            : "bg-[var(--space-ink)]/5 text-[var(--space-ink)]/40"
                        }`}
                        title={m !== "Mock" ? "Coming soon" : undefined}
                      >
                        {m}
                        {m !== "Mock" ? " (soon)" : ""}
                      </button>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {step === 3 && (
              <section>
                <h2 className="text-xl font-semibold">Installing</h2>
                <p className="mt-1 text-sm text-[var(--space-ink)]/60">
                  {hostname
                    ? `Setting up ${hostname}`
                    : "We will set up your site and open ERPNext when ready."}
                </p>
                {!jobId && !job && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void startInstall()}
                    className="mt-6 rounded-xl bg-[var(--space-accent)] px-5 py-3 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {busy ? "Starting…" : "Start installation"}
                  </button>
                )}
                {(jobId || job) && (
                  <div className="mt-6 space-y-4">
                    {(!job || job.status === "queued" || job.status === "running") && (
                      <div className="rounded-xl bg-[var(--space-accent-soft)] px-4 py-3 text-sm text-[var(--space-ink)]">
                        <div className="flex items-center justify-between gap-3">
                          <span>{activeHint}</span>
                          <span className="tabular-nums font-semibold text-[var(--space-accent)]">
                            {overallPercent}%
                          </span>
                        </div>
                        <div
                          className="mt-2 h-2 overflow-hidden rounded-full bg-white/70"
                          role="progressbar"
                          aria-valuenow={overallPercent}
                          aria-valuemin={0}
                          aria-valuemax={100}
                        >
                          <div
                            className="h-full rounded-full bg-[var(--space-accent)] transition-[width] duration-700 ease-out"
                            style={{ width: `${overallPercent}%` }}
                          />
                        </div>
                      </div>
                    )}
                    {job?.status === "succeeded" && (
                      <p className="rounded-xl bg-[var(--space-accent-soft)] px-4 py-3 text-sm font-medium text-[var(--space-accent)]">
                        Your site is ready — 100%
                      </p>
                    )}
                    <ol className="space-y-4">
                      {INSTALL_STEPS.map((stepDef, index) => {
                        const status = resolveStageStatus(stepDef.id, index, job, jobId);
                        const pct = stepPercents[index] ?? 0;
                        return (
                          <li key={stepDef.id} className="flex gap-3 text-sm">
                            <StageIcon status={status} />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <span
                                  className={
                                    status === "succeeded"
                                      ? "font-medium text-[var(--space-ink)]"
                                      : status === "running"
                                        ? "font-medium text-[var(--space-accent)]"
                                        : status === "failed"
                                          ? "font-medium text-red-700"
                                          : "text-[var(--space-ink)]/50"
                                  }
                                >
                                  {stepDef.label}
                                  {status === "failed" ? " — failed" : ""}
                                </span>
                                <span
                                  className={`tabular-nums text-xs font-semibold ${
                                    status === "succeeded"
                                      ? "text-[var(--space-accent)]"
                                      : status === "running"
                                        ? "text-[var(--space-accent)]"
                                        : status === "failed"
                                          ? "text-red-700"
                                          : "text-[var(--space-ink)]/35"
                                  }`}
                                >
                                  {pct}%
                                </span>
                              </div>
                              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--space-ink)]/10">
                                <div
                                  className={`h-full rounded-full transition-[width] duration-700 ease-out ${
                                    status === "failed"
                                      ? "bg-red-600"
                                      : "bg-[var(--space-accent)]"
                                  }`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                    {job?.status === "succeeded" && job.result?.deskUrl && (
                      <a
                        href={job.result.deskUrl}
                        className="inline-flex rounded-xl bg-[var(--space-accent)] px-5 py-3 text-sm font-medium text-white"
                      >
                        Open ERPNext login
                      </a>
                    )}
                    {job?.status === "failed" && (
                      <div
                        role="alert"
                        className="rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-900"
                      >
                        <p className="font-semibold">Installation could not finish</p>
                        {failedStepLabel && (
                          <p className="mt-1 opacity-80">Stopped at: {failedStepLabel}</p>
                        )}
                        <p className="mt-2">
                          {job.error ||
                            "Something went wrong while creating your site. Please try again."}
                        </p>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={retryInstall}
                          className="mt-4 rounded-xl bg-red-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                        >
                          {busy ? "Starting…" : "Try again"}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}
          </motion.div>
        </AnimatePresence>

        {error && <p className="mt-4 text-sm text-red-700">{error}</p>}

        <div className="mt-8 flex justify-between gap-3">
          <button
            type="button"
            onClick={back}
            disabled={
              step === 0 ||
              busy ||
              (Boolean(jobId) && job?.status !== "failed" && job?.status !== "succeeded")
            }
            className="rounded-xl px-4 py-2 text-sm font-medium text-[var(--space-ink)]/70 disabled:opacity-30"
          >
            Back
          </button>
          {step < 2 && (
            <button
              type="button"
              onClick={next}
              className="rounded-xl bg-[var(--space-ink)] px-5 py-2 text-sm font-medium text-white"
            >
              Continue
            </button>
          )}
          {step === 2 && (
            <button
              type="button"
              onClick={() => {
                setError(null);
                setStep(3);
              }}
              className="rounded-xl bg-[var(--space-ink)] px-5 py-2 text-sm font-medium text-white"
            >
              Review & install
            </button>
          )}
        </div>
      </div>
      {showDevConsole && <DevActivityConsole jobId={jobId} />}
    </div>
  );
}
