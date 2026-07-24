"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Dash = {
  sites?: Array<Record<string, unknown>>;
  subscriptions?: Array<Record<string, unknown>>;
  notifications?: Array<Record<string, unknown>>;
  usage?: { storage_mb?: number; site_count?: number };
  plan?: Record<string, unknown> | null;
};

const card: React.CSSProperties = {
  background: "var(--sp-surface)",
  border: "1px solid var(--sp-border)",
  borderRadius: "var(--sp-radius)",
  padding: "20px",
};

function statusColor(s: string) {
  const sl = s.toLowerCase();
  if (["active", "installed", "running"].includes(sl)) return "#22c55e";
  if (["provisioning", "pending", "installing"].includes(sl)) return "#3b82f6";
  if (["suspended", "paused"].includes(sl)) return "#f59e0b";
  if (["failed", "error"].includes(sl)) return "#ef4444";
  return "var(--sp-muted)";
}

export function PortalDashboard() {
  const [data, setData] = useState<Dash | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/portal/dashboard", { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok || j.ok === false) throw new Error(j.error || "Failed");
        setData(j.data || j);
      })
      .catch((e) => setError(String(e.message || e)));
  }, []);

  if (error) {
    return (
      <div style={{ padding: "12px 16px", borderRadius: "var(--sp-radius-sm)", border: "1px solid rgba(239,68,68,.3)", background: "rgba(239,68,68,.08)", color: "#fca5a5", fontSize: "0.85rem" }}>
        {error}
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ padding: "60px 0", textAlign: "center" }}>
        <p style={{ color: "var(--sp-muted)", fontSize: "0.88rem" }}>Loading dashboard…</p>
      </div>
    );
  }

  const sites = data.sites || [];
  const notifs = data.notifications || [];
  const plan = data.plan;

  return (
    <div>
      {/* ── Header ── */}
      <header style={{ marginBottom: 28 }}>
        <p style={{ fontSize: "0.73rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--sp-accent)", margin: 0 }}>
          ZatGo Space
        </p>
        <h1
          style={{
            margin: "6px 0 8px",
            fontSize: "clamp(1.8rem, 4vw, 2.8rem)",
            fontWeight: 800,
            letterSpacing: "-0.02em",
            background: "linear-gradient(135deg, var(--sp-text) 0%, var(--sp-muted) 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          Dashboard
        </h1>
        <p style={{ fontSize: "0.88rem", color: "var(--sp-muted)" }}>Sites, plan, usage, and alerts at a glance.</p>
      </header>

      {/* ── Stat strip ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px,1fr))", gap: 14, marginBottom: 28 }}>
        {/* Sites */}
        <div style={{ ...card, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: "rgba(124,92,252,.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7c5cfc" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
          </div>
          <p style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--sp-muted)", margin: 0, fontWeight: 600 }}>My Sites</p>
          <p style={{ fontSize: "2rem", fontWeight: 700, color: "var(--sp-text)", margin: 0, lineHeight: 1 }}>{data.usage?.site_count ?? sites.length}</p>
          <Link href="/" style={{ fontSize: "0.78rem", color: "var(--sp-accent)", fontWeight: 600 }}>View sites →</Link>
        </div>

        {/* Storage */}
        <div style={{ ...card, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: "rgba(34,197,94,.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>
          </div>
          <p style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--sp-muted)", margin: 0, fontWeight: 600 }}>Storage</p>
          <p style={{ fontSize: "2rem", fontWeight: 700, color: "var(--sp-text)", margin: 0, lineHeight: 1 }}>
            {Math.round(data.usage?.storage_mb || 0)} MB
          </p>
          <Link href="/usage" style={{ fontSize: "0.78rem", color: "var(--sp-accent)", fontWeight: 600 }}>Usage detail →</Link>
        </div>

        {/* Plan */}
        <div style={{ ...card, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: "rgba(34,211,238,.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
          </div>
          <p style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--sp-muted)", margin: 0, fontWeight: 600 }}>Current Plan</p>
          <p style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--sp-text)", margin: 0, lineHeight: 1 }}>{String(plan?.plan || "—")}</p>
          <p style={{ fontSize: "0.75rem", color: "var(--sp-muted)", margin: 0 }}>
            {String(plan?.payment_status || "")} {plan?.status ? `· ${String(plan.status)}` : ""}
          </p>
        </div>
      </div>

      {/* ── Deployment status ── */}
      <section style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--sp-text)", margin: 0 }}>Deployment status</h2>
          <Link href="/" style={{ fontSize: "0.78rem", color: "var(--sp-accent)", fontWeight: 600 }}>All sites →</Link>
        </div>
        {sites.length === 0 ? (
          <p style={{ fontSize: "0.84rem", color: "var(--sp-muted)" }}>No sites yet.</p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {sites.slice(0, 8).map((s) => {
              const status = String(s.status || "Unknown");
              const col = statusColor(status);
              return (
                <li
                  key={String(s.name)}
                  style={{
                    ...card,
                    padding: "12px 16px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: col,
                        flexShrink: 0,
                        boxShadow: `0 0 6px ${col}`,
                      }}
                    />
                    <div style={{ minWidth: 0 }}>
                      <p style={{ margin: 0, fontWeight: 600, fontSize: "0.88rem", color: "var(--sp-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {String(s.domain || s.site_name || s.name)}
                      </p>
                      <p style={{ margin: 0, fontSize: "0.75rem", color: col }}>{status}</p>
                    </div>
                  </div>
                  <Link
                    href={`/sites/${String(s.site_name || s.name)}`}
                    style={{
                      padding: "5px 12px",
                      borderRadius: 8,
                      border: "1px solid var(--sp-border)",
                      background: "var(--sp-surface2)",
                      color: "var(--sp-text)",
                      fontSize: "0.76rem",
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                    }}
                  >
                    Manage
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── Notifications ── */}
      <section>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--sp-text)", margin: 0 }}>
            Notifications
            {notifs.length > 0 && (
              <span style={{ marginLeft: 8, padding: "2px 8px", borderRadius: 20, fontSize: "0.68rem", background: "rgba(239,68,68,.15)", color: "var(--sp-red)", fontWeight: 700 }}>
                {notifs.length}
              </span>
            )}
          </h2>
          <Link href="/notifications" style={{ fontSize: "0.78rem", color: "var(--sp-accent)", fontWeight: 600 }}>All alerts →</Link>
        </div>
        {notifs.length === 0 ? (
          <div
            style={{
              ...card,
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "18px",
            }}
          >
            <div style={{ width: 32, height: 32, borderRadius: 9, background: "rgba(34,197,94,.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
            </div>
            <p style={{ fontSize: "0.84rem", color: "var(--sp-muted)", margin: 0 }}>No unread alerts. Everything looks good.</p>
          </div>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {notifs.map((n) => (
              <li
                key={String(n.name)}
                style={{ ...card, padding: "14px 16px", display: "flex", alignItems: "flex-start", gap: 12 }}
              >
                <div style={{ width: 32, height: 32, borderRadius: 9, background: "rgba(245,158,11,.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
                </div>
                <div>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: "0.88rem", color: "var(--sp-text)" }}>{String(n.title)}</p>
                  <p style={{ margin: "3px 0 0", fontSize: "0.75rem", color: "var(--sp-muted)" }}>{String(n.event_type)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
