"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { SitesDevConsole } from "@/components/SitesDevConsole";
import { formatMb, pct } from "@/lib/format";
import { isDevConsoleEnabled } from "@/lib/dev-console";
import type { MeasuredBench, PoolSummary, SiteUsageRow } from "@/lib/sites-usage";

const APP_LABELS: Record<string, string> = {
  frappe: "Framework",
  erpnext: "ERPNext",
  hrms: "HR",
  crm: "CRM",
  helpdesk: "Helpdesk",
  telephony: "Telephony",
  chat_ai: "Chat AI",
  tracker: "Tracker",
  zatgo_core: "ZatGo Core",
  zatgo_space: "ZatGo Space",
};

/** Hide internal/platform packages from the customer view. */
const HIDDEN_APPS = new Set(["frappe", "zatgo_space"]);

function appLabel(pkg: string): string {
  return APP_LABELS[pkg] || pkg.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function visibleApps(apps: string[]): string[] {
  return apps.filter((a) => !HIDDEN_APPS.has(a)).map(appLabel);
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--space-ink)]/10">
      <div
        className="h-full rounded-full bg-[var(--space-accent)] transition-all duration-500"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

function SummaryCard({
  title,
  value,
  detail,
}: {
  title: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--space-ink)]/10 bg-white/70 p-5 backdrop-blur">
      <h2 className="text-sm font-semibold tracking-wide text-[var(--space-ink)]/70">{title}</h2>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-[var(--space-ink)]/55">{detail}</p>
    </div>
  );
}

function siteBadge(site: SiteUsageRow): { label: string; className: string } {
  if (site.kind === "erp") {
    return {
      label: "Main ERP",
      className: "bg-[var(--space-ink)]/10 text-[var(--space-ink)]/70",
    };
  }
  if (site.kind === "space" && site.planTitle) {
    return {
      label: site.planTitle,
      className: "bg-[var(--space-accent-soft)] text-[var(--space-accent)]",
    };
  }
  if (!site.onDocker || site.status === "Provisioning") {
    return {
      label: "Setting up",
      className: "bg-amber-100 text-amber-900",
    };
  }
  return {
    label: "Ready",
    className: "bg-[var(--space-accent-soft)] text-[var(--space-accent)]",
  };
}

function siteHelpLine(site: SiteUsageRow): string {
  if (!site.onDocker || site.status === "Provisioning") {
    return "Your site is still being prepared. This can take several minutes.";
  }
  if (site.kind === "erp") {
    return "Your main company ERP site.";
  }
  if (site.inPool && site.planTitle) {
    return `${site.planTitle} plan · Open Desk to sign in as Administrator.`;
  }
  return "Open Desk to sign in as Administrator.";
}

function SkeletonBlock({ className }: { className?: string }) {
  return (
    <span
      className={`inline-block animate-pulse rounded-lg bg-[var(--space-ink)]/[0.08] ${className || ""}`}
      aria-hidden
    />
  );
}

function SitesSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite">
      <p className="mb-4 text-sm text-[var(--space-ink)]/55">Loading your sites…</p>
      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="rounded-2xl border border-[var(--space-ink)]/10 bg-white/70 p-5 backdrop-blur"
          >
            <SkeletonBlock className="h-3 w-16" />
            <SkeletonBlock className="mt-3 h-8 w-24" />
            <SkeletonBlock className="mt-2 h-3 w-32" />
            {i === 1 ? <SkeletonBlock className="mt-3 h-2 w-full rounded-full" /> : null}
          </div>
        ))}
      </div>
      <div className="mt-10">
        <SkeletonBlock className="h-5 w-28" />
        <ul className="mt-4 space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <li
              key={i}
              className="rounded-2xl border border-[var(--space-ink)]/10 bg-white/70 p-5 backdrop-blur"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <SkeletonBlock className="h-5 w-48 max-w-full" />
                  <SkeletonBlock className="mt-2 h-3 w-64 max-w-full" />
                </div>
                <SkeletonBlock className="h-6 w-16 shrink-0 rounded-full" />
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <SkeletonBlock className="h-5 w-14" />
                <SkeletonBlock className="h-5 w-16" />
                <SkeletonBlock className="h-5 w-12" />
              </div>
              <div className="mt-4 flex items-center justify-between gap-3">
                <SkeletonBlock className="h-4 w-36" />
                <SkeletonBlock className="h-7 w-24 rounded-lg" />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function SitesDashboard() {
  const [pool, setPool] = useState<PoolSummary | null>(null);
  const [measured, setMeasured] = useState<MeasuredBench | null>(null);
  const [sites, setSites] = useState<SiteUsageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const showDevConsole = isDevConsoleEnabled();

  const applyPayload = useCallback((data: {
    pool?: PoolSummary;
    measured?: MeasuredBench | null;
    sites?: SiteUsageRow[];
    error?: string;
    ok?: boolean;
  }) => {
    if (data.pool) setPool(data.pool);
    if (data.measured) setMeasured(data.measured);
    if (Array.isArray(data.sites)) setSites(data.sites);
    if (data.error) {
      setError("Some site details could not be refreshed. Try again in a moment.");
    }
  }, []);

  const load = useCallback(
    async (opts?: { soft?: boolean; details?: boolean }) => {
      const soft = Boolean(opts?.soft);
      const wantDetails = Boolean(opts?.details);
      if (soft) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        // Fast path only by default — avoids docker/bench storms on every page view
        const quick = await fetch("/api/sites?refresh=0", { cache: "no-store" });
        const quickData = await quick.json();
        if (!quickData.ok && (!quickData.sites || quickData.sites.length === 0)) {
          const msg =
            /timed out|timeout|unreachable|Connection/i.test(String(quickData.error || ""))
              ? "Could not reach the server to list sites. Check your connection and try again."
              : quickData.error || "Could not load your sites. Try again.";
          throw new Error(msg);
        }
        applyPayload(quickData);
        setLoading(false);

        if (!wantDetails) {
          return;
        }

        if (!quickData.sites?.length && quickData.error) {
          setError("Could not reach the server to list sites. Try Refresh in a moment.");
          return;
        }

        setDetailsLoading(true);
        setRefreshing(true);
        const full = await fetch("/api/sites?refresh=1", { cache: "no-store" });
        const fullData = await full.json();
        if (fullData.ok || (fullData.sites && fullData.sites.length > 0)) {
          applyPayload(fullData);
        } else if (!soft) {
          setError("Could not update storage and apps. Site list is still shown.");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load your sites.");
      } finally {
        setLoading(false);
        setRefreshing(false);
        setDetailsLoading(false);
      }
    },
    [applyPayload],
  );

  useEffect(() => {
    void load({ details: false });
  }, [load]);

  const readyCount = sites.filter((s) => s.onDocker).length;
  const memPct =
    measured && measured.ramLimitMb > 0 ? pct(measured.ramUsedMb, measured.ramLimitMb) : 0;
  const showSkeleton = loading && sites.length === 0;
  const busy = loading || refreshing || detailsLoading;

  return (
    <div className="mx-auto flex min-h-screen max-w-4xl flex-col px-4 py-10 sm:px-6">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium tracking-wide text-[var(--space-accent)]">ZatGo</p>
          <h1 className="mt-1 text-4xl font-semibold tracking-tight text-[var(--space-ink)] sm:text-5xl">
            Your sites
          </h1>
          <p className="mt-3 max-w-xl text-base text-[var(--space-ink)]/70">
            See each site’s address, storage, and apps. Manage apps and plans, or open Desk to
            sign in.
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <div className="flex flex-wrap gap-2">
            <Link
              href="/new"
              className="rounded-xl border border-[var(--space-ink)]/15 bg-white/70 px-4 py-2 text-sm font-medium hover:bg-white"
            >
              New site
            </Link>
            <button
              type="button"
              disabled={busy}
              onClick={() => void load({ soft: true, details: true })}
              className="rounded-xl bg-[var(--space-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy && !showSkeleton ? "Updating…" : "Refresh"}
            </button>
          </div>
          {showDevConsole && (
            <span className="rounded-lg border border-[var(--space-ink)]/15 bg-white/60 px-3 py-1.5 text-xs font-medium text-[var(--space-ink)]/50">
              Dev logs: bottom-right
            </span>
          )}
        </div>
      </header>

      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {showSkeleton ? (
        <SitesSkeleton />
      ) : (
        <>
          {detailsLoading && (
            <p className="mb-4 text-sm text-[var(--space-ink)]/55">
              Updating storage and apps…
            </p>
          )}
          <div
            className={`grid gap-4 sm:grid-cols-3 ${detailsLoading ? "opacity-70 transition-opacity" : ""}`}
          >
            <SummaryCard
              title="Sites"
              value={String(readyCount)}
              detail={readyCount === 1 ? "Active site" : "Active sites"}
            />
            <div className="rounded-2xl border border-[var(--space-ink)]/10 bg-white/70 p-5 backdrop-blur">
              <h2 className="text-sm font-semibold tracking-wide text-[var(--space-ink)]/70">
                Memory
              </h2>
              <p className="mt-2 text-2xl font-semibold tabular-nums">
                {measured ? formatMb(measured.ramUsedMb) : "—"}
                {measured && measured.ramLimitMb > 0 ? (
                  <span className="text-base font-normal text-[var(--space-ink)]/40">
                    {" "}
                    / {formatMb(measured.ramLimitMb)}
                  </span>
                ) : null}
              </p>
              <p className="mt-1 text-xs text-[var(--space-ink)]/55">Shared across all sites</p>
              <div className="mt-3">
                <ProgressBar value={memPct} />
              </div>
            </div>
            <SummaryCard
              title="Storage"
              value={measured ? formatMb(measured.diskUsedMb) : "—"}
              detail="Total used by your sites"
            />
          </div>

          {pool && pool.siteCount > 0 && (
            <p className="mt-4 text-sm text-[var(--space-ink)]/60">
              Plan capacity left: {formatMb(pool.freeRamMb)} memory · {formatMb(pool.freeDiskMb)}{" "}
              storage
            </p>
          )}

          <section className={`mt-10 ${detailsLoading ? "opacity-80 transition-opacity" : ""}`}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">All sites</h2>
              {detailsLoading ? (
                <span className="text-xs text-[var(--space-ink)]/45">Updating details…</span>
              ) : null}
            </div>
            {sites.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-dashed border-[var(--space-ink)]/20 bg-white/40 px-6 py-10 text-center">
                <p className="text-sm text-[var(--space-ink)]/65">You don’t have any sites yet.</p>
                <Link
                  href="/new"
                  className="mt-4 inline-block text-sm font-medium text-[var(--space-accent)] underline-offset-2 hover:underline"
                >
                  Create your first site
                </Link>
              </div>
            ) : (
              <ul className="mt-4 space-y-3">
                {sites.map((site) => {
                  const badge = siteBadge(site);
                  const apps = visibleApps(site.apps || []);
                  const hasPlanLimits = site.inPool && site.diskLimitMb > 0;
                  return (
                    <li
                      key={site.name}
                      className="rounded-2xl border border-[var(--space-ink)]/10 bg-white/70 p-5 backdrop-blur"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <a
                            href={site.deskUrl || `https://${site.hostname}`}
                            target="_blank"
                            rel="noreferrer"
                            className="break-all text-base font-semibold text-[var(--space-ink)] hover:text-[var(--space-accent)]"
                          >
                            {site.hostname}
                          </a>
                          <p className="mt-1 text-sm text-[var(--space-ink)]/60">
                            {siteHelpLine(site)}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                      </div>

                      {detailsLoading && (site.apps || []).length === 0 ? (
                        <div className="mt-3 flex flex-wrap gap-1.5" aria-hidden>
                          <SkeletonBlock className="h-5 w-14" />
                          <SkeletonBlock className="h-5 w-16" />
                          <SkeletonBlock className="h-5 w-12" />
                        </div>
                      ) : apps.length > 0 ? (
                        <div className="mt-3">
                          <p className="mb-1.5 text-xs font-medium text-[var(--space-ink)]/50">
                            Apps
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {apps.map((label) => (
                              <span
                                key={label}
                                className="rounded-md bg-[var(--space-ink)]/5 px-2 py-0.5 text-xs text-[var(--space-ink)]/80"
                              >
                                {label}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                        <p className="text-sm text-[var(--space-ink)]/70">
                          Storage used:{" "}
                          {detailsLoading && !site.diskUsedMb ? (
                            <SkeletonBlock className="inline-block h-4 w-16 align-middle" />
                          ) : (
                            <span className="font-medium tabular-nums text-[var(--space-ink)]">
                              {formatMb(site.diskUsedMb)}
                            </span>
                          )}
                          {hasPlanLimits ? (
                            <span className="text-[var(--space-ink)]/45">
                              {" "}
                              of {formatMb(site.diskLimitMb)} included
                            </span>
                          ) : null}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <Link
                            href={`/sites/${encodeURIComponent(site.slug)}`}
                            className="rounded-lg border border-[var(--space-ink)]/15 bg-white px-3 py-1.5 text-xs font-medium text-[var(--space-ink)] hover:bg-white"
                          >
                            Manage
                          </Link>
                          <a
                            href={site.deskUrl || `https://${site.hostname}`}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-lg bg-[var(--space-accent)] px-3 py-1.5 text-xs font-medium text-white"
                          >
                            Open Desk
                          </a>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}

      {showDevConsole && <SitesDevConsole active={busy} />}
    </div>
  );
}
