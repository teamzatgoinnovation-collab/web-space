"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatMb } from "@/lib/format";
import { SiteUsageGraph } from "@/components/SiteUsageGraph";
import { FreeCheckout, type CheckoutSuccess } from "@/components/FreeCheckout";

type SiteDetail = {
  hostname: string;
  slug: string;
  deskUrl: string;
  onDocker: boolean;
  kind: "erp" | "space" | "unmanaged";
  orderName?: string;
  plan?: string;
  planTitle?: string;
  ramLimitMb: number;
  diskLimitMb: number;
  diskUsedMb: number;
  ramUsedMb: number;
  installedApps: { package: string; title: string; canUninstall: boolean }[];
  availableApps: { package: string; title: string }[];
  plans: {
    code: string;
    title: string;
    mock_price: string;
    priceCents?: number;
    dueTodayCents?: number;
    ramLimitMb: number;
    diskLimitMb: number;
    features: string[];
  }[];
};

type Props = { slug: string };

export function SiteManage({ slug }: Props) {
  const [site, setSite] = useState<SiteDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [selectedInstall, setSelectedInstall] = useState("");
  const [selectedPlan, setSelectedPlan] = useState("");
  const [showCheckout, setShowCheckout] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/sites/${encodeURIComponent(slug)}`, { cache: "no-store" });
      const data = await res.json();
      if (!data.ok || !data.site) {
        throw new Error(data.error || "Could not load site");
      }
      setSite(data.site as SiteDetail);
      setSelectedPlan((data.site as SiteDetail).plan || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load site");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runAction(
    key: string,
    body: Record<string, unknown>,
    successMsg: string,
  ) {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/sites/${encodeURIComponent(slug)}/manage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.ok) {
        throw new Error(data.error || "Action failed");
      }
      setNotice(successMsg);
      await load();
      if (body.action === "install-app") setSelectedInstall("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  if (loading && !site) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <p className="text-sm text-[var(--space-ink)]/55">Loading site…</p>
      </div>
    );
  }

  if (!site) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <p className="text-sm text-red-800">{error || "Site not found"}</p>
        <Link href="/" className="mt-4 inline-block text-sm text-[var(--space-accent)]">
          ← Back to sites
        </Link>
      </div>
    );
  }

  const showPlan = site.kind !== "erp";
  const locked = !site.onDocker;

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-4 py-10 sm:px-6">
      <header className="mb-8">
        <Link
          href="/"
          className="text-sm font-medium text-[var(--space-accent)] hover:underline"
        >
          ← All sites
        </Link>
        <p className="mt-4 text-sm font-medium tracking-wide text-[var(--space-accent)]">
          Site management
        </p>
        <h1 className="mt-1 break-all text-3xl font-semibold tracking-tight text-[var(--space-ink)] sm:text-4xl">
          {site.hostname}
        </h1>
        <p className="mt-2 text-sm text-[var(--space-ink)]/65">
          Install or remove apps with bench, change plan, clear cache, or update the site schema.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href={site.deskUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-xl bg-[var(--space-accent)] px-4 py-2 text-sm font-medium text-white"
          >
            Open Desk
          </a>
          <button
            type="button"
            disabled={!!busy || locked}
            onClick={() =>
              void runAction("clear-cache", { action: "clear-cache" }, "Site cache cleared.")
            }
            className="rounded-xl border border-[var(--space-ink)]/15 bg-white/70 px-4 py-2 text-sm font-medium hover:bg-white disabled:opacity-50"
          >
            {busy === "clear-cache" ? "Clearing…" : "Clear cache"}
          </button>
          <button
            type="button"
            disabled={!!busy || locked}
            onClick={() =>
              void runAction(
                "migrate",
                { action: "migrate" },
                "Site updated (migrate + clear cache).",
              )
            }
            className="rounded-xl border border-[var(--space-ink)]/15 bg-white/70 px-4 py-2 text-sm font-medium hover:bg-white disabled:opacity-50"
          >
            {busy === "migrate" ? "Updating…" : "Update site"}
          </button>
        </div>
      </header>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {notice}
        </div>
      )}
      {locked && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          This site is still setting up. App and refresh actions will work once it is ready.
        </div>
      )}

      <section className="rounded-2xl border border-[var(--space-ink)]/10 bg-white/70 p-5 backdrop-blur">
        <h2 className="text-lg font-semibold">Usage</h2>
        <p className="mt-1 text-sm text-[var(--space-ink)]/60">
          Storage and memory for this site
          {site.planTitle ? ` · ${site.planTitle}` : ""}.
        </p>
        <div className="mt-5">
          <SiteUsageGraph
            diskUsedMb={site.diskUsedMb}
            diskLimitMb={site.diskLimitMb}
            ramUsedMb={site.ramUsedMb}
            ramLimitMb={site.ramLimitMb}
            appCount={site.installedApps.filter((a) => a.package !== "frappe").length}
          />
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-[var(--space-ink)]/10 bg-white/70 p-5 backdrop-blur">
        <h2 className="text-lg font-semibold">Installed apps</h2>
        <p className="mt-1 text-sm text-[var(--space-ink)]/60">
          Remove an app you no longer need. The framework app stays installed.
        </p>
        {site.installedApps.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--space-ink)]/55">No apps listed yet.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {site.installedApps.map((app) => (
              <li
                key={app.package}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[var(--space-ink)]/[0.04] px-3 py-2.5"
              >
                <span className="text-sm font-medium">{app.title}</span>
                {app.canUninstall ? (
                  <button
                    type="button"
                    disabled={!!busy || locked}
                    onClick={() => {
                      if (
                        !window.confirm(
                          `Remove ${app.title} from this site? You can install it again later.`,
                        )
                      ) {
                        return;
                      }
                      void runAction(
                        `uninstall:${app.package}`,
                        { action: "uninstall-app", package: app.package },
                        `${app.title} removed.`,
                      );
                    }}
                    className="rounded-lg border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-800 disabled:opacity-50"
                  >
                    {busy === `uninstall:${app.package}` ? "Removing…" : "Uninstall"}
                  </button>
                ) : (
                  <span className="text-xs text-[var(--space-ink)]/40">Required</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6 rounded-2xl border border-[var(--space-ink)]/10 bg-white/70 p-5 backdrop-blur">
        <h2 className="text-lg font-semibold">Install app</h2>
        <p className="mt-1 text-sm text-[var(--space-ink)]/60">
          Choose an app available on the platform and add it to this site.
        </p>
        {site.availableApps.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--space-ink)]/55">
            All available apps are already installed.
          </p>
        ) : (
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="min-w-[12rem] flex-1 text-sm">
              <span className="mb-1.5 block text-[var(--space-ink)]/55">App</span>
              <select
                value={selectedInstall}
                onChange={(e) => setSelectedInstall(e.target.value)}
                disabled={!!busy || locked}
                className="w-full rounded-xl border border-[var(--space-ink)]/15 bg-white px-3 py-2 text-sm"
              >
                <option value="">Select an app…</option>
                {site.availableApps.map((app) => (
                  <option key={app.package} value={app.package}>
                    {app.title}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={!selectedInstall || !!busy || locked}
              onClick={() => {
                const app = site.availableApps.find((a) => a.package === selectedInstall);
                void runAction(
                  "install",
                  { action: "install-app", package: selectedInstall },
                  `${app?.title || "App"} installed.`,
                );
              }}
              className="rounded-xl bg-[var(--space-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy === "install" ? "Installing…" : "Install"}
            </button>
          </div>
        )}
      </section>

      {showPlan && (
        <section className="mt-6 rounded-2xl border border-[var(--space-ink)]/10 bg-white/70 p-5 backdrop-blur">
          <h2 className="text-lg font-semibold">Plan</h2>
          <p className="mt-1 text-sm text-[var(--space-ink)]/60">
            Upgrade or change the plan. Checkout is Stripe-style and free — $0.00 charged.
          </p>
          <div className="mt-4 space-y-3">
            {site.plans.map((plan) => {
              const current = site.plan === plan.code;
              const listCents = plan.priceCents ?? 0;
              return (
                <label
                  key={plan.code}
                  className={`flex cursor-pointer flex-wrap items-start gap-3 rounded-xl border px-4 py-3 ${
                    selectedPlan === plan.code
                      ? "border-[var(--space-accent)] bg-[var(--space-accent-soft)]/40"
                      : "border-[var(--space-ink)]/10 bg-white/50"
                  }`}
                >
                  <input
                    type="radio"
                    name="plan"
                    value={plan.code}
                    checked={selectedPlan === plan.code}
                    onChange={() => setSelectedPlan(plan.code)}
                    disabled={!!busy}
                    className="mt-1"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="font-semibold">{plan.title}</span>
                      {listCents > 0 ? (
                        <>
                          <span className="text-sm text-[var(--space-ink)]/40 line-through">
                            {plan.mock_price}
                          </span>
                          <span className="text-sm font-semibold text-[var(--space-accent)]">
                            Free
                          </span>
                        </>
                      ) : (
                        <span className="text-sm font-semibold text-[var(--space-accent)]">
                          Free
                        </span>
                      )}
                      {current ? (
                        <span className="rounded-full bg-[var(--space-ink)]/10 px-2 py-0.5 text-xs">
                          Current
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-[var(--space-ink)]/55">
                      {formatMb(plan.ramLimitMb)} memory · {formatMb(plan.diskLimitMb)} storage
                    </p>
                    {plan.features?.length ? (
                      <p className="mt-1 text-xs text-[var(--space-ink)]/50">
                        {plan.features.join(" · ")}
                      </p>
                    ) : null}
                  </div>
                </label>
              );
            })}
          </div>
          <button
            type="button"
            disabled={!selectedPlan || selectedPlan === site.plan || !!busy}
            onClick={() => {
              setError(null);
              setNotice(null);
              setShowCheckout(true);
            }}
            className="mt-4 rounded-xl bg-[var(--space-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Continue to payment
          </button>

          {showCheckout && selectedPlan && selectedPlan !== site.plan && (
            <div className="mt-5">
              <FreeCheckout
                plan={selectedPlan}
                planTitle={
                  site.plans.find((p) => p.code === selectedPlan)?.title || selectedPlan
                }
                listPriceCents={
                  site.plans.find((p) => p.code === selectedPlan)?.priceCents ?? 0
                }
                purpose="upgrade"
                hostname={site.hostname}
                onCancel={() => setShowCheckout(false)}
                onSuccess={(result: CheckoutSuccess) => {
                  setShowCheckout(false);
                  void runAction(
                    "set-plan",
                    {
                      action: "set-plan",
                      plan: selectedPlan,
                      checkoutSessionId: result.sessionId,
                    },
                    `Plan updated to ${result.planTitle}. Charged $0.00.`,
                  );
                }}
              />
            </div>
          )}
        </section>
      )}
    </div>
  );
}
