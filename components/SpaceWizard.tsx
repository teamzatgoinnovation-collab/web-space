"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

type Catalog = {
  domainSuffix: string;
  apps: { package: string; title: string; required?: boolean }[];
  plans: { code: string; title: string; mock_price: string; features: string[] }[];
  inviteRequired: boolean;
};

type JobView = {
  id: string;
  status: string;
  stages: { id: string; label: string; status: string }[];
  log: string[];
  error?: string;
  result?: { deskUrl?: string; hostname?: string };
};

const STEPS = ["Site", "Apps", "Plan", "Install"] as const;

export function SpaceWizard() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [step, setStep] = useState(0);
  const [slug, setSlug] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [selectedApps, setSelectedApps] = useState<string[]>(["frappe", "erpnext"]);
  const [plan, setPlan] = useState("basic");
  const [payment, setPayment] = useState<"Mock" | "Stripe" | "PayPal">("Mock");
  const [inviteCode, setInviteCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobView | null>(null);

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
    const t = setInterval(() => {
      void fetch(`/api/jobs/${jobId}`)
        .then((r) => r.json())
        .then((d) => {
          if (d.ok) setJob(d.job);
        });
    }, 1500);
    return () => clearInterval(t);
  }, [jobId]);

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
          inviteCode: inviteCode || undefined,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Provisioning failed");
      setJobId(data.jobId);
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [slug, password, selectedApps, plan, payment, inviteCode]);

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-4 py-10 sm:px-6">
      <header className="mb-10">
        <p className="text-sm font-medium tracking-wide text-[var(--space-accent)]">ZatGo</p>
        <h1 className="mt-1 text-4xl font-semibold tracking-tight text-[var(--space-ink)] sm:text-5xl">
          Space
        </h1>
        <p className="mt-3 max-w-xl text-base text-[var(--space-ink)]/70">
          Create your ERPNext site on a zatgo.online subdomain — pick apps, choose a plan, and go.
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
                {catalog?.inviteRequired && (
                  <div className="mt-6">
                    <label className="block text-sm font-medium">Invite code</label>
                    <input
                      className="mt-2 w-full rounded-xl border border-[var(--space-ink)]/15 bg-white px-3 py-2 outline-none"
                      value={inviteCode}
                      onChange={(e) => setInviteCode(e.target.value)}
                    />
                  </div>
                )}
              </section>
            )}

            {step === 1 && (
              <section>
                <h2 className="text-xl font-semibold">Apps & Administrator</h2>
                <p className="mt-1 text-sm text-[var(--space-ink)]/60">
                  Username is fixed as <strong>Administrator</strong>.
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
                  Mock billing for MVP — no charge. Stripe / PayPal coming soon.
                </p>
                <div className="mt-6 grid gap-3">
                  {(catalog?.plans || []).map((p) => (
                    <button
                      key={p.code}
                      type="button"
                      onClick={() => setPlan(p.code)}
                      className={`rounded-xl border px-4 py-4 text-left transition ${
                        plan === p.code
                          ? "border-[var(--space-accent)] bg-[var(--space-accent-soft)]"
                          : "border-[var(--space-ink)]/10 bg-white"
                      }`}
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="font-semibold">{p.title}</span>
                        <span className="text-sm opacity-70">{p.mock_price}</span>
                      </div>
                      <ul className="mt-2 list-inside list-disc text-xs opacity-70">
                        {p.features.map((f) => (
                          <li key={f}>{f}</li>
                        ))}
                      </ul>
                    </button>
                  ))}
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
                  {hostname || "Your site"} — DNS → new-site → apps → ready
                </p>
                {!jobId && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void startInstall()}
                    className="mt-6 rounded-xl bg-[var(--space-accent)] px-5 py-3 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {busy ? "Starting…" : "Start installation"}
                  </button>
                )}
                {job && (
                  <div className="mt-6 space-y-4">
                    <ol className="space-y-2">
                      {job.stages.map((s) => (
                        <li
                          key={s.id}
                          className="flex items-center justify-between rounded-lg bg-[var(--space-mist)]/80 px-3 py-2 text-sm"
                        >
                          <span>{s.label}</span>
                          <span className="font-medium capitalize opacity-70">{s.status}</span>
                        </li>
                      ))}
                    </ol>
                    <pre className="max-h-48 overflow-auto rounded-lg bg-[var(--space-ink)] p-3 text-xs text-[var(--space-mist)]">
                      {(job.log || []).slice(-40).join("\n") || "Waiting for logs…"}
                    </pre>
                    {job.status === "succeeded" && job.result?.deskUrl && (
                      <a
                        href={job.result.deskUrl}
                        className="inline-flex rounded-xl bg-[var(--space-accent)] px-5 py-3 text-sm font-medium text-white"
                      >
                        Open ERPNext login
                      </a>
                    )}
                    {job.status === "failed" && (
                      <p className="text-sm text-red-700">{job.error || "Installation failed"}</p>
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
            disabled={step === 0 || Boolean(jobId)}
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
    </div>
  );
}
