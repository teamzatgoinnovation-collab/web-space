"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatMb, pct } from "@/lib/format";
import type { MeasuredBench, PoolSummary, SiteUsageRow } from "@/lib/sites-usage";

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

function MeasuredCard({
  title,
  used,
  limit,
  unitHint,
}: {
  title: string;
  used: number;
  limit: number;
  unitHint: string;
}) {
  const usedPct = limit > 0 ? pct(used, limit) : used > 0 ? 35 : 0;
  return (
    <div className="rounded-2xl border border-[var(--space-ink)]/10 bg-white/70 p-5 backdrop-blur">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-wide text-[var(--space-ink)]/70">{title}</h2>
        <span className="text-xs text-[var(--space-ink)]/50">{unitHint}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums">
        {formatMb(used)}
        {limit > 0 ? (
          <span className="text-base font-normal text-[var(--space-ink)]/40">
            {" "}
            / {formatMb(limit)}
          </span>
        ) : null}
      </p>
      <p className="mt-1 text-xs text-[var(--space-ink)]/55">Live from Docker</p>
      <div className="mt-3">
        <ProgressBar value={usedPct} />
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
  if (site.kind === "space" && site.inPool) {
    return {
      label: site.planTitle || site.plan || "Space",
      className: "bg-[var(--space-accent-soft)] text-[var(--space-accent)]",
    };
  }
  return {
    label: "On Docker",
    className: "bg-[var(--space-mist)] text-[var(--space-ink)]/70",
  };
}

export function SitesDashboard() {
  const [pool, setPool] = useState<PoolSummary | null>(null);
  const [measured, setMeasured] = useState<MeasuredBench | null>(null);
  const [sites, setSites] = useState<SiteUsageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

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
      setMeasured(data.measured || null);
      setSites(data.sites || []);
      const firstTs = (data.sites || []).find(
        (s: SiteUsageRow) => s.usageUpdatedAt,
      )?.usageUpdatedAt;
      setUpdatedAt(firstTs || new Date().toISOString());
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
            Live sites, disk, and installed apps from the Docker bench — refreshed on load.
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

      {loading && !measured && !pool ? (
        <p className="text-sm text-[var(--space-ink)]/60">Loading live Docker data…</p>
      ) : (
        <>
          {measured && (
            <div className="grid gap-4 sm:grid-cols-2">
              <MeasuredCard
                title="Container RAM"
                used={measured.ramUsedMb}
                limit={measured.ramLimitMb}
                unitHint="docker stats"
              />
              <MeasuredCard
                title="Sites disk"
                used={measured.diskUsedMb}
                limit={0}
                unitHint={`${measured.siteCount} site${measured.siteCount === 1 ? "" : "s"} · du`}
              />
            </div>
          )}

          {pool && pool.siteCount > 0 && (
            <p className="mt-3 text-xs text-[var(--space-ink)]/45">
              Soft Space pool: {formatMb(pool.allocatedRamMb)} / {formatMb(pool.ramPoolMb)} RAM
              allocated across {pool.siteCount} order
              {pool.siteCount === 1 ? "" : "s"}
            </p>
          )}

          {updatedAt && (
            <p className="mt-2 text-xs text-[var(--space-ink)]/40">
              Updated {new Date(updatedAt).toLocaleString()}
            </p>
          )}

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
                            {site.onDocker ? "On Docker" : "Provisioning"} · {site.status}
                            {hasLimits
                              ? ` · plan ${formatMb(site.ramLimitMb)} RAM / ${formatMb(site.diskLimitMb)} disk`
                              : ""}
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-medium ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                      </div>

                      {site.apps.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {site.apps.map((app) => (
                            <span
                              key={app}
                              className="rounded-md bg-[var(--space-ink)]/5 px-2 py-0.5 text-xs text-[var(--space-ink)]/75"
                            >
                              {app}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                        <div className="rounded-xl bg-[var(--space-ink)]/[0.03] px-3 py-2">
                          <div className="text-xs text-[var(--space-ink)]/50">Disk (live du)</div>
                          <div className="mt-0.5 font-medium tabular-nums">
                            {formatMb(site.diskUsedMb)}
                            {hasLimits ? (
                              <span className="font-normal text-[var(--space-ink)]/45">
                                {" "}
                                / {formatMb(site.diskLimitMb)} plan
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <div className="rounded-xl bg-[var(--space-ink)]/[0.03] px-3 py-2">
                          <div className="text-xs text-[var(--space-ink)]/50">
                            RAM share (soft · shared container)
                          </div>
                          <div className="mt-0.5 font-medium tabular-nums">
                            {formatMb(site.ramUsedMb)}
                            {hasLimits ? (
                              <span className="font-normal text-[var(--space-ink)]/45">
                                {" "}
                                / {formatMb(site.ramLimitMb)} plan
                              </span>
                            ) : null}
                          </div>
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
    </div>
  );
}
