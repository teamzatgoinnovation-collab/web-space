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

const HIDDEN_APPS = new Set(["frappe", "zatgo_space"]);

function appLabel(pkg: string): string {
  return APP_LABELS[pkg] || pkg.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function visibleApps(apps: string[]): string[] {
  return apps.filter((a) => !HIDDEN_APPS.has(a)).map(appLabel);
}

/* ── Design helpers ── */
const card: React.CSSProperties = {
  background: "var(--sp-surface)",
  border: "1px solid var(--sp-border)",
  borderRadius: "var(--sp-radius)",
  padding: "20px",
};

function StatusBadge({ status }: { status?: string }) {
  const s = String(status || "").toLowerCase();
  let bg = "rgba(100,116,139,.15)";
  let color = "var(--sp-muted)";
  let pulse = false;

  if (["active", "healthy", "ready"].includes(s)) {
    bg = "rgba(34,197,94,.12)";
    color = "#22c55e";
  } else if (["provisioning", "setting up", "installing"].includes(s)) {
    bg = "rgba(59,130,246,.12)";
    color = "#3b82f6";
    pulse = true;
  } else if (["suspended", "paused"].includes(s)) {
    bg = "rgba(245,158,11,.12)";
    color = "#f59e0b";
  } else if (["failed", "error"].includes(s)) {
    bg = "rgba(239,68,68,.12)";
    color = "#ef4444";
  }

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 10px",
        borderRadius: 20,
        fontSize: "0.72rem",
        fontWeight: 600,
        background: bg,
        color,
        letterSpacing: "0.03em",
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: color,
          flexShrink: 0,
          animation: pulse ? "sp-pulse 1.4s ease-in-out infinite" : "none",
        }}
      />
      {status}
      <style>{`@keyframes sp-pulse{0%,100%{opacity:1}50%{opacity:.3}}`}</style>
    </span>
  );
}

function ProgressBar({ value, color = "var(--sp-accent)" }: { value: number; color?: string }) {
  return (
    <div
      style={{
        height: 5,
        width: "100%",
        background: "rgba(255,255,255,.07)",
        borderRadius: 3,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${Math.min(100, Math.max(0, value))}%`,
          background: color,
          borderRadius: 3,
          transition: "width .5s ease",
        }}
      />
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  detail,
  bar,
  iconBg,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
  bar?: number;
  iconBg: string;
}) {
  return (
    <div style={{ ...card, display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 9,
          background: iconBg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {icon}
      </div>
      <div>
        <p style={{ fontSize: "0.72rem", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--sp-muted)", margin: 0 }}>
          {label}
        </p>
        <p style={{ fontSize: "1.9rem", fontWeight: 700, color: "var(--sp-text)", margin: "4px 0 0", lineHeight: 1 }}>
          {value}
        </p>
        <p style={{ fontSize: "0.75rem", color: "var(--sp-muted)", margin: "4px 0 0" }}>{detail}</p>
      </div>
      {bar !== undefined && <ProgressBar value={bar} />}
    </div>
  );
}

function SkeletonBlock({ w, h }: { w: string | number; h: string | number }) {
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block",
        width: w,
        height: h,
        borderRadius: 6,
        background: "rgba(255,255,255,.07)",
        animation: "sp-shimmer 1.4s ease-in-out infinite",
      }}
    >
      <style>{`@keyframes sp-shimmer{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
    </span>
  );
}

function SitesSkeleton() {
  return (
    <div aria-busy="true">
      <p style={{ fontSize: "0.85rem", color: "var(--sp-muted)", marginBottom: 16 }}>Loading your sites…</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 16, marginBottom: 32 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={card}>
            <SkeletonBlock w={32} h={32} />
            <br /><br />
            <SkeletonBlock w="60%" h={12} />
            <br /><br />
            <SkeletonBlock w="40%" h={28} />
            {i === 1 && <><br /><br /><SkeletonBlock w="100%" h={5} /></>}
          </div>
        ))}
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{ ...card, marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <SkeletonBlock w={180} h={16} />
            <br /><SkeletonBlock w={120} h={11} />
          </div>
          <SkeletonBlock w={72} h={28} />
        </div>
      ))}
    </div>
  );
}

function siteBadgeStatus(site: SiteUsageRow): string {
  if (!site.onDocker || site.status === "Provisioning") return "Provisioning";
  if (site.status === "Suspended") return "Suspended";
  return "Active";
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
    if (data.error) setError("Some site details could not be refreshed. Try again in a moment.");
  }, []);

  const load = useCallback(
    async (opts?: { soft?: boolean; details?: boolean }) => {
      const soft = Boolean(opts?.soft);
      const wantDetails = Boolean(opts?.details);
      if (soft) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const quick = await fetch("/api/sites?refresh=0", { cache: "no-store" });
        const quickData = await quick.json();
        if (!quickData.ok && (!quickData.sites || quickData.sites.length === 0)) {
          const msg = /timed out|timeout|unreachable|Connection/i.test(String(quickData.error || ""))
            ? "Could not reach the server. Check your connection and try again."
            : quickData.error || "Could not load your sites. Try again.";
          throw new Error(msg);
        }
        applyPayload(quickData);
        setLoading(false);
        if (!quickData.sites?.length && quickData.error) {
          setError("Could not reach the server. Try Refresh in a moment.");
          return;
        }
        if (!wantDetails) return;
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

  useEffect(() => { void load({ details: false }); }, [load]);

  const readyCount = sites.filter((s) => s.onDocker).length;
  const memPct = measured && measured.ramLimitMb > 0 ? pct(measured.ramUsedMb, measured.ramLimitMb) : 0;
  const diskPct = measured && measured.diskUsedMb > 0 && pool ? pct(measured.diskUsedMb, measured.diskUsedMb + pool.freeDiskMb) : 0;
  const showSkeleton = loading && sites.length === 0;
  const busy = loading || refreshing || detailsLoading;

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {/* ── Hero header ── */}
      <header style={{ marginBottom: 32, display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div>
          <p style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--sp-accent)", margin: 0 }}>
            ZatGo Space
          </p>
          <h1
            style={{
              margin: "6px 0 0",
              fontSize: "clamp(2rem, 5vw, 3.2rem)",
              fontWeight: 800,
              letterSpacing: "-0.02em",
              background: "linear-gradient(135deg, var(--sp-text) 0%, var(--sp-muted) 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              lineHeight: 1.15,
            }}
          >
            Your sites
          </h1>
          <p style={{ margin: "10px 0 0", maxWidth: 480, fontSize: "0.9rem", color: "var(--sp-muted)", lineHeight: 1.6 }}>
            See each site's address, storage, and apps. Manage apps and plans, or open Desk to sign in.
          </p>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <Link
            href="/new"
            style={{
              padding: "9px 18px",
              borderRadius: "var(--sp-radius-sm)",
              border: "1px solid var(--sp-border)",
              background: "var(--sp-surface2)",
              color: "var(--sp-text)",
              fontSize: "0.83rem",
              fontWeight: 500,
            }}
          >
            + New site
          </Link>
          <button
            type="button"
            disabled={busy}
            onClick={() => void load({ soft: true, details: true })}
            style={{
              padding: "9px 18px",
              borderRadius: "var(--sp-radius-sm)",
              border: "none",
              background: busy ? "rgba(124,92,252,.5)" : "linear-gradient(135deg, var(--sp-accent), #6046d4)",
              color: "#fff",
              fontSize: "0.83rem",
              fontWeight: 600,
              cursor: busy ? "not-allowed" : "pointer",
              boxShadow: "0 2px 12px rgba(124,92,252,.35)",
            }}
          >
            {busy && !showSkeleton ? "Updating…" : "Refresh"}
          </button>
        </div>
      </header>

      {/* ── Error banner ── */}
      {error && (
        <div
          style={{
            marginBottom: 20,
            padding: "12px 16px",
            borderRadius: "var(--sp-radius-sm)",
            border: "1px solid rgba(239,68,68,.3)",
            background: "rgba(239,68,68,.08)",
            color: "#fca5a5",
            fontSize: "0.85rem",
            display: "flex",
            gap: 8,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, marginTop: 1 }}>
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {error}
        </div>
      )}

      {showSkeleton ? (
        <SitesSkeleton />
      ) : (
        <>
          {/* ── Stat cards ── */}
          {detailsLoading && (
            <p style={{ fontSize: "0.82rem", color: "var(--sp-muted)", marginBottom: 12 }}>Updating storage and apps…</p>
          )}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))",
              gap: 14,
              marginBottom: 28,
              opacity: detailsLoading ? 0.75 : 1,
              transition: "opacity .3s",
            }}
          >
            <StatCard
              iconBg="rgba(124,92,252,.15)"
              icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7c5cfc" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /></svg>}
              label="Sites"
              value={String(readyCount)}
              detail={readyCount === 1 ? "Active site" : "Active sites"}
            />
            <StatCard
              iconBg="rgba(34,211,238,.12)"
              icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2" /><line x1="6" y1="4" x2="6" y2="20" /><line x1="10" y1="4" x2="10" y2="20" /><line x1="14" y1="4" x2="14" y2="20" /><line x1="18" y1="4" x2="18" y2="20" /></svg>}
              label="Memory"
              value={measured ? formatMb(measured.ramUsedMb) : "—"}
              detail={measured && measured.ramLimitMb > 0 ? `of ${formatMb(measured.ramLimitMb)} total` : "Shared across all sites"}
              bar={memPct}
            />
            <StatCard
              iconBg="rgba(34,197,94,.12)"
              icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>}
              label="Storage"
              value={measured ? formatMb(measured.diskUsedMb) : "—"}
              detail="Total used by your sites"
              bar={diskPct}
            />
          </div>

          {pool && pool.siteCount > 0 && (
            <p style={{ fontSize: "0.78rem", color: "var(--sp-muted)", marginBottom: 20 }}>
              Plan capacity left: {formatMb(pool.freeRamMb)} memory · {formatMb(pool.freeDiskMb)} storage
            </p>
          )}

          {/* ── Sites list ── */}
          <section style={{ opacity: detailsLoading ? 0.85 : 1, transition: "opacity .3s" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--sp-text)", margin: 0 }}>
                All sites
                <span style={{ marginLeft: 10, padding: "2px 9px", borderRadius: 20, fontSize: "0.72rem", background: "var(--sp-surface2)", border: "1px solid var(--sp-border)", color: "var(--sp-muted)", fontWeight: 500 }}>
                  {sites.length}
                </span>
              </h2>
              {detailsLoading && (
                <span style={{ fontSize: "0.76rem", color: "var(--sp-muted)" }}>Updating details…</span>
              )}
            </div>

            {sites.length === 0 ? (
              <div
                style={{
                  ...card,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  padding: "56px 24px",
                  gap: 12,
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: "50%",
                    background: "var(--sp-surface2)",
                    border: "1px solid var(--sp-border)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--sp-muted)" strokeWidth="1.5"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
                </div>
                <p style={{ fontWeight: 600, color: "var(--sp-text)", margin: 0 }}>No sites yet</p>
                <p style={{ fontSize: "0.84rem", color: "var(--sp-muted)", margin: 0 }}>Create your first site to get started.</p>
                <Link
                  href="/new"
                  style={{
                    marginTop: 8,
                    padding: "9px 20px",
                    borderRadius: "var(--sp-radius-sm)",
                    background: "linear-gradient(135deg, var(--sp-accent), #6046d4)",
                    color: "#fff",
                    fontSize: "0.83rem",
                    fontWeight: 600,
                  }}
                >
                  Create site
                </Link>
              </div>
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 12 }}>
                {sites.map((site) => {
                  const apps = visibleApps(site.apps || []);
                  const hasPlanLimits = site.inPool && site.diskLimitMb > 0;
                  const diskPctSite = hasPlanLimits ? pct(site.diskUsedMb, site.diskLimitMb) : 0;
                  const status = siteBadgeStatus(site);

                  return (
                    <li key={site.name} style={card}>
                      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <a
                            href={site.deskUrl || `https://${site.hostname}`}
                            target="_blank"
                            rel="noreferrer"
                            style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--sp-text)", wordBreak: "break-all" }}
                          >
                            {site.hostname}
                          </a>
                          <p style={{ margin: "4px 0 0", fontSize: "0.8rem", color: "var(--sp-muted)" }}>
                            {site.planTitle ? `${site.planTitle} plan` : site.kind === "erp" ? "Main company ERP" : "Open Desk to sign in."}
                          </p>
                        </div>
                        <StatusBadge status={status} />
                      </div>

                      {/* App pills */}
                      {detailsLoading && apps.length === 0 ? (
                        <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
                          <SkeletonBlock w={52} h={20} />
                          <SkeletonBlock w={60} h={20} />
                          <SkeletonBlock w={48} h={20} />
                        </div>
                      ) : apps.length > 0 ? (
                        <div style={{ marginTop: 12 }}>
                          <p style={{ fontSize: "0.7rem", fontWeight: 600, color: "var(--sp-muted)", letterSpacing: "0.06em", textTransform: "uppercase", margin: "0 0 6px" }}>Apps</p>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                            {apps.map((label) => (
                              <span
                                key={label}
                                style={{
                                  padding: "2px 10px",
                                  borderRadius: 20,
                                  fontSize: "0.72rem",
                                  fontWeight: 500,
                                  background: "rgba(255,255,255,.06)",
                                  border: "1px solid var(--sp-border)",
                                  color: "var(--sp-text)",
                                }}
                              >
                                {label}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {/* Storage bar */}
                      {hasPlanLimits && (
                        <div style={{ marginTop: 14 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                            <span style={{ fontSize: "0.75rem", color: "var(--sp-muted)" }}>Storage used</span>
                            <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--sp-text)" }}>
                              {detailsLoading && !site.diskUsedMb ? "—" : formatMb(site.diskUsedMb)}
                              <span style={{ color: "var(--sp-muted)", fontWeight: 400 }}>
                                {" / "}{formatMb(site.diskLimitMb)}
                              </span>
                            </span>
                          </div>
                          <ProgressBar value={diskPctSite} color={diskPctSite > 85 ? "var(--sp-red)" : diskPctSite > 65 ? "var(--sp-yellow)" : "var(--sp-accent)"} />
                        </div>
                      )}

                      {/* Actions */}
                      <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "flex-end" }}>
                        <Link
                          href={`/sites/${encodeURIComponent(site.slug)}`}
                          style={{
                            padding: "7px 14px",
                            borderRadius: 8,
                            border: "1px solid var(--sp-border)",
                            background: "var(--sp-surface2)",
                            color: "var(--sp-text)",
                            fontSize: "0.78rem",
                            fontWeight: 500,
                          }}
                        >
                          Manage
                        </Link>
                        <a
                          href={site.deskUrl || `https://${site.hostname}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            padding: "7px 14px",
                            borderRadius: 8,
                            background: "linear-gradient(135deg, var(--sp-accent), #6046d4)",
                            color: "#fff",
                            fontSize: "0.78rem",
                            fontWeight: 600,
                            boxShadow: "0 2px 8px rgba(124,92,252,.3)",
                          }}
                        >
                          Open Desk ↗
                        </a>
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
