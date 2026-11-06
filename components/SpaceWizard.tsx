"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Check, X as XIcon } from "lucide-react";
import { DevActivityConsole } from "@/components/DevActivityConsole";
import { MoyasarCheckout, type CheckoutSuccess } from "@/components/MoyasarCheckout";
import { isDevConsoleEnabled } from "@/lib/dev-console";
import { formatMb } from "@/lib/format";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

type Catalog = {
  domainSuffix: string;
  apps: { package: string; title: string; required?: boolean }[];
  plans: {
    code: string;
    title: string;
    mock_price: string;
    priceCents?: number;
    dueTodayCents?: number;
    features: string[];
    ramLimitMb?: number;
    diskLimitMb?: number;
    allowed_apps?: { package: string; title: string }[];
  }[];
  pool?: {
    ramPoolMb?: number;
    diskPoolMb?: number;
    allocatedRamMb?: number;
    allocatedDiskMb?: number;
    freeRamMb?: number;
    freeDiskMb?: number;
    siteCount?: number;
  };
  billing?: { mode?: string; message?: string };
};

type JobView = {
  id: string;
  status: string;
  stages: { id: string; label: string; status: string }[];
  error?: string;
  result?: { deskUrl?: string; hostname?: string };
};

const STEPS = ["Site", "Plan", "Apps", "Pay", "Install"] as const;

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
  const [warehouseName, setWarehouseName] = useState("");
  const [adminFullName, setAdminFullName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [plan, setPlan] = useState(() => searchParams.get("plan") || "basic");
  const [preferredRegion, setPreferredRegion] = useState("");
  const [regions, setRegions] = useState<{ name?: string; title?: string }[]>([]);
  const [checkoutSessionId, setCheckoutSessionId] = useState<string | null>(null);
  const [paidCard, setPaidCard] = useState<string | null>(null);
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

  /** The plan decides which apps get installed — narrow the catalog's full
   * app list down to what the chosen plan allows (plus the always-on core).
   * Every app here is installed automatically; there's no per-app opt-out at
   * creation time (the provisioning job always installs the plan's full
   * allowed-apps list, not a client-picked subset) — so this list is
   * informational, not a set of checkboxes. */
  const selectedPlan = useMemo(() => catalog?.plans.find((p) => p.code === plan), [catalog, plan]);
  const scopedApps = useMemo(() => {
    const allowed = new Set((selectedPlan?.allowed_apps || []).map((a) => a.package));
    return (catalog?.apps || []).filter((app) => app.required || app.package === "frappe" || allowed.has(app.package));
  }, [catalog, selectedPlan]);
  const selectedApps = useMemo(() => scopedApps.map((app) => app.package), [scopedApps]);

  const next = () => {
    setError(null);
    if (step === 0) {
      if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(slug.trim().toLowerCase())) {
        setError("Enter a valid subdomain (lowercase, numbers, hyphens)");
        return;
      }
    }
    if (step === 2) {
      const hasName = adminFullName.trim().length > 0;
      const hasEmail = adminEmail.trim().length > 0;
      if (hasName !== hasEmail) {
        setError("Enter both your name and email to add a second sign-in, or leave both blank");
        return;
      }
      if (hasEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail.trim())) {
        setError("Enter a valid email address");
        return;
      }
    }
    setStep((s) => Math.min(s + 1, 4));
  };

  const back = () => {
    setError(null);
    setStep((s) => Math.max(s - 1, 0));
  };

  const startInstall = useCallback(async (sessionId: string) => {
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
          checkoutSessionId: sessionId,
          paymentMethod: "Stripe",
          ...(preferredRegion ? { preferredRegion } : {}),
          ...(companyName.trim() ? { companyName: companyName.trim() } : {}),
          ...(warehouseName.trim() ? { warehouseName: warehouseName.trim() } : {}),
          ...(adminFullName.trim() ? { adminFullName: adminFullName.trim() } : {}),
          ...(adminEmail.trim() ? { adminEmail: adminEmail.trim() } : {}),
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Could not start installation");
      setJobId(data.jobId);
      setStep(4);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [slug, password, selectedApps, plan, preferredRegion, companyName, warehouseName, adminFullName, adminEmail]);

  const onCheckoutSuccess = (result: CheckoutSuccess) => {
    setCheckoutSessionId(result.sessionId);
    setPaidCard(result.planTitle);
    void startInstall(result.sessionId);
  };

  const retryInstall = () => {
    setError(null);
    setJob(null);
    setJobId(null);
    if (checkoutSessionId) {
      void startInstall(checkoutSessionId);
    } else {
      setStep(3);
    }
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
            <h1 className="mt-1 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">Space</h1>
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
          Create your ERPNext site on a zatgoinnovation.com address — choose apps, pick a plan, and open Desk when it&apos;s
          ready.
        </p>
        {isTrialFlow && (
          <p className="mt-3 inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            🎉 Trying SpaceCloud — pick a site name to start your free trial
          </p>
        )}
      </header>

      <nav className="mb-8 flex gap-2" aria-label="Steps">
        {STEPS.map((label, i) => (
          <div
            key={label}
            className={cn(
              "flex-1 rounded-full py-2 text-center text-xs font-medium sm:text-sm",
              i === step
                ? "bg-foreground text-background"
                : i < step
                  ? "bg-primary/15 text-primary"
                  : "bg-secondary text-muted-foreground",
            )}
          >
            {label}
          </div>
        ))}
      </nav>

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
                <h2 className="text-xl font-semibold text-foreground">Choose your subdomain</h2>
                <p className="mt-1 text-sm text-muted-foreground">Other URLs are set automatically from this name.</p>
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
                  <ul className="mt-4 space-y-1 text-sm text-muted-foreground">
                    <li>
                      Desk: <strong className="font-medium text-foreground">https://{hostname}</strong>
                    </li>
                    <li>
                      Site name: <strong className="font-medium text-foreground">{hostname}</strong>
                    </li>
                  </ul>
                )}
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

            {step === 2 && (
              <section>
                <h2 className="text-xl font-semibold text-foreground">Apps &amp; Administrator</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  These apps are included in your {selectedPlan?.title || "selected"} plan and will be installed
                  automatically. You always sign in as <strong>Administrator</strong>; add your own account below if
                  you'd like a second, named login too.
                </p>
                <div className="mt-6 grid gap-2 sm:grid-cols-2">
                  {scopedApps.map((app) => (
                    <div
                      key={app.package}
                      className="flex items-center gap-3 rounded-xl border border-primary bg-primary/10 px-4 py-3 text-left text-sm"
                    >
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check className="size-3.5" />
                      </span>
                      <div>
                        <div className="font-medium text-foreground">{app.title}</div>
                        <div className="text-xs text-muted-foreground">{app.package}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label>Password</Label>
                    <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Confirm</Label>
                    <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                  </div>
                </div>

                <div className="mt-8 border-t border-border pt-6">
                  <h3 className="text-sm font-semibold text-foreground">Custom setup (optional)</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Leave blank for sensible defaults — Saudi Arabia / SAR, a "Stores" warehouse, and Administrator
                    as the only sign-in user.
                  </p>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-1.5">
                      <Label>Company name</Label>
                      <Input
                        placeholder="e.g. Acme Trading Co"
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label>Default warehouse name</Label>
                      <Input
                        placeholder="e.g. Main Warehouse"
                        value={warehouseName}
                        onChange={(e) => setWarehouseName(e.target.value)}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label>Your name (adds a second sign-in)</Label>
                      <Input
                        placeholder="Full name"
                        value={adminFullName}
                        onChange={(e) => setAdminFullName(e.target.value)}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label>Your email</Label>
                      <Input
                        type="email"
                        placeholder="you@example.com"
                        value={adminEmail}
                        onChange={(e) => setAdminEmail(e.target.value)}
                      />
                    </div>
                  </div>
                  {(adminFullName.trim() || adminEmail.trim()) && (!adminFullName.trim() || !adminEmail.trim()) && (
                    <p className="mt-2 text-xs text-amber-500">
                      Enter both your name and email to add a second sign-in — otherwise only Administrator is
                      created.
                    </p>
                  )}
                </div>
              </section>
            )}

            {step === 1 && (
              <section>
                <h2 className="text-xl font-semibold text-foreground">Billing plan</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Choose capacity for your site. Free plans activate immediately; paid plans are billed monthly via
                  Moyasar.
                </p>
                {catalog?.pool && catalog.pool.freeRamMb != null && catalog.pool.freeDiskMb != null && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Available: {formatMb(catalog.pool.freeRamMb)} memory · {formatMb(catalog.pool.freeDiskMb)} storage
                  </p>
                )}
                <div className="mt-6 grid gap-3">
                  {(catalog?.plans || []).map((p) => {
                    const ram = p.ramLimitMb ?? 0;
                    const disk = p.diskLimitMb ?? 0;
                    // Only enforce capacity limits when the catalog actually reports free capacity —
                    // treat missing/unknown pool numbers as "don't block", never as "zero available".
                    const fitsRam = catalog?.pool?.freeRamMb == null || catalog.pool.freeRamMb >= ram;
                    const fitsDisk = catalog?.pool?.freeDiskMb == null || catalog.pool.freeDiskMb >= disk;
                    const fits = fitsRam && fitsDisk;
                    const listCents = p.priceCents ?? 0;
                    return (
                      <button
                        key={p.code}
                        type="button"
                        disabled={!fits}
                        onClick={() => {
                          setPlan(p.code);
                          setCheckoutSessionId(null);
                          setPaidCard(null);
                        }}
                        className={cn(
                          "rounded-xl border px-4 py-4 text-left transition",
                          plan === p.code ? "border-primary bg-primary/10" : "border-border bg-background",
                          !fits && "cursor-not-allowed opacity-50",
                        )}
                      >
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="font-semibold text-foreground">{p.title}</span>
                          <span className="text-right text-sm">
                            {listCents > 0 ? (
                              <span className="font-semibold text-primary">{(listCents / 100).toFixed(2)} SAR/mo</span>
                            ) : (
                              <span className="font-semibold text-primary">Free</span>
                            )}
                          </span>
                        </div>
                        {(ram > 0 || disk > 0) && (
                          <p className="mt-1.5 text-sm font-medium text-primary">
                            {formatMb(ram)} RAM · {formatMb(disk)} disk
                          </p>
                        )}
                        {!fits && (
                          <p className="mt-1 text-xs text-amber-500">
                            Not enough capacity left — pick a smaller plan or free a site
                          </p>
                        )}
                        <ul className="mt-2 list-inside list-disc text-xs text-muted-foreground">
                          {p.features.map((f) => (
                            <li key={f}>{f}</li>
                          ))}
                        </ul>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {step === 3 && (
              <section>
                <h2 className="text-xl font-semibold text-foreground">Payment</h2>
                <p className="mt-1 mb-5 text-sm text-muted-foreground">Enter card details to start your subscription.</p>
                {(() => {
                  const selected = (catalog?.plans || []).find((p) => p.code === plan);
                  return (
                    <MoyasarCheckout
                      plan={plan}
                      planTitle={selected?.title || plan}
                      listPriceCents={selected?.priceCents ?? 0}
                      purpose="provision"
                      onSuccess={onCheckoutSuccess}
                      onCancel={() => setStep(1)}
                    />
                  );
                })()}
                {paidCard && <p className="mt-3 text-sm text-primary">Payment confirmed — {paidCard} plan.</p>}
              </section>
            )}

            {step === 4 && (
              <section>
                <h2 className="text-xl font-semibold text-foreground">Installing</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {hostname ? `Setting up ${hostname}` : "We will set up your site and open ERPNext when ready."}
                </p>
                {!jobId && !job && (
                  <Button
                    disabled={busy || !checkoutSessionId}
                    onClick={() => {
                      if (checkoutSessionId) void startInstall(checkoutSessionId);
                      else setStep(3);
                    }}
                    className="mt-6"
                  >
                    {busy ? "Starting…" : "Start installation"}
                  </Button>
                )}
                {(jobId || job) && (
                  <div className="mt-6 space-y-4">
                    {(!job || job.status === "queued" || job.status === "running") && (
                      <div className="rounded-xl bg-primary/10 px-4 py-3 text-sm text-foreground">
                        <div className="flex items-center justify-between gap-3">
                          <span>{activeHint}</span>
                          <span className="font-semibold text-primary tabular-nums">{overallPercent}%</span>
                        </div>
                        <Progress value={overallPercent} className="mt-2" />
                      </div>
                    )}
                    {job?.status === "succeeded" && (
                      <p className="rounded-xl bg-primary/10 px-4 py-3 text-sm font-medium text-primary">
                        Your site is ready — 100%
                      </p>
                    )}
                    <ol className="space-y-4">
                      {INSTALL_STEPS.map((stepDef, index) => {
                        const status = resolveStageStatus(stepDef.id, index, job, jobId);
                        const pctVal = stepPercents[index] ?? 0;
                        return (
                          <li key={stepDef.id} className="flex gap-3 text-sm">
                            <StageIcon status={status} />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <span
                                  className={cn(
                                    status === "succeeded" && "font-medium text-foreground",
                                    status === "running" && "font-medium text-primary",
                                    status === "failed" && "font-medium text-destructive",
                                    status === "pending" && "text-muted-foreground",
                                  )}
                                >
                                  {stepDef.label}
                                  {status === "failed" ? " — failed" : ""}
                                </span>
                                <span
                                  className={cn(
                                    "text-xs font-semibold tabular-nums",
                                    (status === "succeeded" || status === "running") && "text-primary",
                                    status === "failed" && "text-destructive",
                                    status === "pending" && "text-muted-foreground/60",
                                  )}
                                >
                                  {pctVal}%
                                </span>
                              </div>
                              <Progress value={pctVal} className={cn("mt-1.5 h-1.5", status === "failed" && "[&>div]:bg-destructive")} />
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                    {job?.status === "succeeded" && job.result?.deskUrl && (
                      <Button nativeButton={false} render={<a href={job.result.deskUrl}>Open ERPNext login</a>} />
                    )}
                    {job?.status === "failed" && (
                      <Alert variant="destructive">
                        <AlertDescription>
                          <p className="font-semibold">Installation could not finish</p>
                          {failedStepLabel && <p className="mt-1 opacity-80">Stopped at: {failedStepLabel}</p>}
                          <p className="mt-2">
                            {job.error || "Something went wrong while creating your site. Please try again."}
                          </p>
                          <Button variant="destructive" disabled={busy} onClick={retryInstall} className="mt-3">
                            {busy ? "Starting…" : "Try again"}
                          </Button>
                        </AlertDescription>
                      </Alert>
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
            onClick={back}
            disabled={
              step === 0 ||
              busy ||
              step === 3 ||
              (Boolean(jobId) && job?.status !== "failed" && job?.status !== "succeeded")
            }
          >
            Back
          </Button>
          {step < 2 && (
            <Button type="button" onClick={next}>
              Continue
            </Button>
          )}
          {step === 2 && (
            <Button
              type="button"
              onClick={() => {
                setError(null);
                if (password.length < 8) {
                  setError("Administrator password must be at least 8 characters");
                  return;
                }
                if (password !== confirm) {
                  setError("Passwords do not match");
                  return;
                }
                setStep(3);
              }}
            >
              Continue to payment
            </Button>
          )}
        </CardContent>
      </Card>
      {showDevConsole && <DevActivityConsole jobId={jobId} />}
    </div>
  );
}
