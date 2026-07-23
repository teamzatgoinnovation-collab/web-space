"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatMb, pct } from "@/lib/format";
import type { PoolSummary, SiteUsageRow } from "@/lib/sites-usage";

function ProgressBar({
  value,
  tone = "accent",
}: {
  value: number;
  tone?: "accent" | "warn" | "ink";
}) {
  const color =
    tone === "warn"
      ? "bg-amber-600"
      : tone === "ink"
        ? "bg-[var(--space-ink)]"
        : "bg-[var(--space-accent)]";
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--space-ink)]/10">
      <div
        className={`h-full rounded-full transition-all duration-500 ${color}`}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

function PoolCard({
  title,
  allocated,
  used,
  pool,
}: {
  title: string;
  allocated: number;
  used: number;
  pool: number;
}) {
  const allocatedPct = pct(allocated, pool);
  const usedPct = pct(used, pool);
  const free = Math.max(0, pool - allocated);
  return (
    <div className="rounded-2xl border border-[var(--space-ink)]/10 bg-white/70 p-5 backdrop-blur">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-wide text-[var(--space-ink)]/70">{title}</h2>
        <span className="text-xs text-[var(--space-ink)]/50">{formatMb(free)} free</span>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums">
        {formatMb(allocated)}
        <span className="text-base font-normal text-[var(--space-ink)]/40"> / {formatMb(pool)}</span>
      </p>
      <p className="mt-1 text-xs text-[var(--space-ink)]/55">Allocated soft quota (Space Orders)</p>
      <div className="mt-3">
        <ProgressBar value={allocatedPct} />
      </div>
      <div className="mt-4">
        <div className="mb-1 flex justify-between text-xs text-[var(--space-ink)]/55">
          <span>Measured use (Space sites)</span>
          <span>
            {formatMb(used)} · {usedPct}%
          </span>
        </div>
        <ProgressBar value={usedPct} tone="ink" />
      </div>
    </div>
  );
}

function kindBadge(site: SiteUsageRow): { label: string; className: string } {
  if (site.kind === "erp") {
    return {
      label: "Bench / ERP",
      className: "bg-[var(--space-ink)]/10 text-[var(--space-ink)]/70",
    };
  }
  if (site.kind === "unmanaged") {
    return {
      label: "Unmanaged",
      className: "bg-amber-100 text-amber-900",
    };
  }
  return {
    label: site.planTitle || site.plan || "Space",
    className: "bg-[var(--space-accent-soft)] text-[var(--space-accent)]",
  };
}

export function SitesDashboard() {
  const [pool, setPool] = useState<PoolSummary | null>(null);
  const [sites, setSites] = useState<SiteUsageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);

  const load = useCallback(async (opts?: { soft?: boolean }) => {
    if (opts?.soft) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/sites?refresh=1", { cache: "no-store" });
      const data = await res.json();
      if (!data.ok && (!data.sites || data.sites.length === 0)) {
        throw new Error(data.error || "Failed to load sites");
      }
      setPool(data.pool);
      setSites(data.sites || []);
      setSource(data.metricsSource || null);
      if (data.error) setError(data.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto flex min-h-screen max-w-4xl flex-col px-4 py-10 sm:px-6">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium tracking-wide text-[var(--space-accent)]">ZatGo</p>
          <h1 className="mt-1 text-4xl font-semibold tracking-tight text-[var(--space-ink)] sm:text-5xl">
            Sites
          </h1>
          <p className="mt-3 max-w-xl text-base text-[var(--space-ink)]/70">
            Sites on the shared Docker bench. Soft quotas apply to Space Orders only —
            erp is one bench site, not the control plane.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/"
            className="rounded-xl border border-[var(--space-ink)]/15 bg-white/70 px-4 py-2 text-sm font-medium hover:bg-white"
          >
            New site
          </Link>
          <button
            type="button"
            disabled={loading || refreshing}
            onClick={() => void load({ soft: true })}
            className="rounded-xl bg-[var(--space-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </header>

      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {loading && !pool ? (
        <p className="text-sm text-[var(--space-ink)]/60">Loading Docker sites…</p>
      ) : pool ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <PoolCard
              title="RAM pool"
              allocated={pool.allocatedRamMb}
              used={pool.usedRamMb}
              pool={pool.ramPoolMb}
            />
            <PoolCard
              title="Disk pool"
              allocated={pool.allocatedDiskMb}
              used={pool.usedDiskMb}
              pool={pool.diskPoolMb}
            />
          </div>
          <p className="mt-3 text-xs text-[var(--space-ink)]/45">
            {pool.siteCount} Space order{pool.siteCount === 1 ? "" : "s"} in pool · {sites.length}{" "}
            site{sites.length === 1 ? "" : "s"} on Docker
            {source ? ` · metrics: ${source}` : ""}
          </p>

          <section className="mt-10">
            <h2 className="text-lg font-semibold">Docker bench sites</h2>
            {sites.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-dashed border-[var(--space-ink)]/20 bg-white/40 px-6 py-10 text-center">
                <p className="text-sm text-[var(--space-ink)]/65">No sites found on the Docker bench.</p>
                <Link
                  href="/"
                  className="mt-4 inline-block text-sm font-medium text-[var(--space-accent)] underline-offset-2 hover:underline"
                >
                  Create your first site
                </Link>
              </div>
            ) : (
              <ul className="mt-4 space-y-3">
                {sites.map((site) => {
                  const badge = kindBadge(site);
                  const hasLimits = site.inPool && site.ramLimitMb > 0;
                  const ramPct = hasLimits ? pct(site.ramUsedMb, site.ramLimitMb) : 0;
                  const diskPct = hasLimits ? pct(site.diskUsedMb, site.diskLimitMb) : 0;
                  return (
                    <li
                      key={site.name}
                      className="rounded-2xl border border-[var(--space-ink)]/10 bg-white/70 p-5 backdrop-blur"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <a
                            href={site.deskUrl || `https://${site.hostname}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-base font-semibold text-[var(--space-ink)] hover:text-[var(--space-accent)]"
                          >
                            {site.hostname}
                          </a>
                          <p className="mt-0.5 text-xs text-[var(--space-ink)]/55">
                            {site.status}
                            {site.inPool ? " · in Space pool" : " · outside Space pool"}
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-medium ${badge.className}`}
                        >
                          {hasLimits
                            ? `${formatMb(site.ramLimitMb)} RAM · ${formatMb(site.diskLimitMb)} disk`
                            : badge.label}
                        </span>
                      </div>
                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <div>
                          <div className="mb-1 flex justify-between text-xs">
                            <span>RAM (soft)</span>
                            <span>
                              {formatMb(site.ramUsedMb)}
                              {hasLimits ? ` / ${formatMb(site.ramLimitMb)}` : ""}
                            </span>
                          </div>
                          <ProgressBar
                            value={hasLimits ? ramPct : Math.min(100, site.ramUsedMb > 0 ? 35 : 0)}
                            tone={hasLimits && ramPct >= 90 ? "warn" : "accent"}
                          />
                        </div>
                        <div>
                          <div className="mb-1 flex justify-between text-xs">
                            <span>Disk</span>
                            <span>
                              {formatMb(site.diskUsedMb)}
                              {hasLimits ? ` / ${formatMb(site.diskLimitMb)}` : ""}
                            </span>
                          </div>
                          <ProgressBar
                            value={hasLimits ? diskPct : Math.min(100, site.diskUsedMb > 0 ? 35 : 0)}
                            tone={hasLimits && diskPct >= 90 ? "warn" : "accent"}
                          />
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
