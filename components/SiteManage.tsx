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

/* ── Shared styles ── */
const card: React.CSSProperties = {
  background: "var(--sp-surface)",
  border: "1px solid var(--sp-border)",
  borderRadius: "var(--sp-radius)",
  padding: "22px",
};

function Btn({
  children,
  onClick,
  disabled,
  variant = "ghost",
  size = "md",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "ghost" | "danger";
  size?: "md" | "sm";
}) {
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    borderRadius: size === "sm" ? 8 : "var(--sp-radius-sm)",
    border: "none",
    cursor: disabled ? "not-allowed" : "pointer",
    fontFamily: "inherit",
    fontWeight: 600,
    fontSize: size === "sm" ? "0.76rem" : "0.83rem",
    padding: size === "sm" ? "5px 12px" : "9px 18px",
    transition: "all .15s ease",
    opacity: disabled ? 0.5 : 1,
  };

  const variants: Record<string, React.CSSProperties> = {
    primary: {
      background: "linear-gradient(135deg, var(--sp-accent), #6046d4)",
      color: "#fff",
      boxShadow: "0 2px 12px rgba(124,92,252,.35)",
    },
    ghost: {
      background: "var(--sp-surface2)",
      color: "var(--sp-text)",
      border: "1px solid var(--sp-border)",
    },
    danger: {
      background: "rgba(239,68,68,.1)",
      color: "var(--sp-red)",
      border: "1px solid rgba(239,68,68,.25)",
    },
  };

  return (
    <button type="button" onClick={onClick} disabled={disabled} style={{ ...base, ...variants[variant] }}>
      {children}
    </button>
  );
}

function SectionCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section style={{ ...card, marginTop: 20 }}>
      <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--sp-text)", margin: 0 }}>{title}</h2>
      {subtitle && <p style={{ margin: "4px 0 0", fontSize: "0.82rem", color: "var(--sp-muted)" }}>{subtitle}</p>}
      <div style={{ marginTop: 16 }}>{children}</div>
    </section>
  );
}

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
      if (!data.ok || !data.site) throw new Error(data.error || "Could not load site");
      setSite(data.site as SiteDetail);
      setSelectedPlan((data.site as SiteDetail).plan || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load site");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => { void load(); }, [load]);

  async function runAction(key: string, body: Record<string, unknown>, successMsg: string) {
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
      if (!data.ok) throw new Error(data.error || "Action failed");
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
      <div style={{ padding: "60px 0", textAlign: "center" }}>
        <p style={{ color: "var(--sp-muted)", fontSize: "0.88rem" }}>Loading site…</p>
      </div>
    );
  }

  if (!site) {
    return (
      <div style={{ padding: "60px 0", textAlign: "center" }}>
        <p style={{ color: "var(--sp-red)", fontSize: "0.88rem" }}>{error || "Site not found"}</p>
        <Link href="/" style={{ marginTop: 16, display: "inline-block", color: "var(--sp-accent)", fontSize: "0.85rem" }}>
          ← Back to sites
        </Link>
      </div>
    );
  }

  const showPlan = site.kind !== "erp";
  const locked = !site.onDocker;

  return (
    <div>
      {/* ── Header ── */}
      <header style={{ marginBottom: 28 }}>
        <Link
          href="/"
          style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--sp-accent)", display: "inline-flex", alignItems: "center", gap: 4 }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
          All sites
        </Link>
        <p style={{ margin: "12px 0 0", fontSize: "0.73rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--sp-accent)" }}>
          Site management
        </p>
        <h1
          style={{
            margin: "6px 0 0",
            fontSize: "clamp(1.6rem, 4vw, 2.4rem)",
            fontWeight: 800,
            letterSpacing: "-0.02em",
            wordBreak: "break-all",
            background: "linear-gradient(135deg, var(--sp-text) 0%, var(--sp-muted) 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          {site.hostname}
        </h1>
        <p style={{ margin: "6px 0 0", fontSize: "0.84rem", color: "var(--sp-muted)" }}>
          Install or remove apps, change plan, clear cache, or update the site schema.
        </p>
        <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 10 }}>
          <a
            href={site.deskUrl}
            target="_blank"
            rel="noreferrer"
            style={{
              padding: "9px 18px",
              borderRadius: "var(--sp-radius-sm)",
              background: "linear-gradient(135deg, var(--sp-accent), #6046d4)",
              color: "#fff",
              fontSize: "0.83rem",
              fontWeight: 600,
              boxShadow: "0 2px 12px rgba(124,92,252,.35)",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            Open Desk
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
          </a>
          <Btn
            disabled={!!busy || locked}
            onClick={() => void runAction("clear-cache", { action: "clear-cache" }, "Site cache cleared.")}
          >
            {busy === "clear-cache" ? "Clearing…" : "Clear cache"}
          </Btn>
          <Btn
            disabled={!!busy || locked}
            onClick={() => void runAction("migrate", { action: "migrate" }, "Site updated (migrate + clear cache).")}
          >
            {busy === "migrate" ? "Updating…" : "Update site"}
          </Btn>
        </div>
      </header>

      {/* ── Alerts ── */}
      {error && (
        <div style={{ marginBottom: 14, padding: "12px 16px", borderRadius: "var(--sp-radius-sm)", border: "1px solid rgba(239,68,68,.3)", background: "rgba(239,68,68,.08)", color: "#fca5a5", fontSize: "0.85rem" }}>
          {error}
        </div>
      )}
      {notice && (
        <div style={{ marginBottom: 14, padding: "12px 16px", borderRadius: "var(--sp-radius-sm)", border: "1px solid rgba(34,197,94,.3)", background: "rgba(34,197,94,.08)", color: "#86efac", fontSize: "0.85rem" }}>
          {notice}
        </div>
      )}
      {locked && (
        <div style={{ marginBottom: 14, padding: "12px 16px", borderRadius: "var(--sp-radius-sm)", border: "1px solid rgba(245,158,11,.3)", background: "rgba(245,158,11,.08)", color: "#fcd34d", fontSize: "0.85rem" }}>
          This site is still setting up. Actions will be available once it is ready.
        </div>
      )}

      {/* ── Usage ── */}
      <SectionCard
        title="Usage"
        subtitle={`Storage and memory for this site${site.planTitle ? ` · ${site.planTitle}` : ""}.`}
      >
        <SiteUsageGraph
          diskUsedMb={site.diskUsedMb}
          diskLimitMb={site.diskLimitMb}
          ramUsedMb={site.ramUsedMb}
          ramLimitMb={site.ramLimitMb}
          appCount={site.installedApps.filter((a) => a.package !== "frappe").length}
        />
      </SectionCard>

      {/* ── Installed apps ── */}
      <SectionCard
        title="Installed apps"
        subtitle="Remove an app you no longer need. The framework app stays installed."
      >
        {site.installedApps.length === 0 ? (
          <p style={{ fontSize: "0.84rem", color: "var(--sp-muted)" }}>No apps listed yet.</p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {site.installedApps.map((app) => (
              <li
                key={app.package}
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  padding: "10px 14px",
                  borderRadius: 10,
                  background: "rgba(255,255,255,.04)",
                  border: "1px solid var(--sp-border)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      background: "rgba(124,92,252,.15)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7c5cfc" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /></svg>
                  </div>
                  <span style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--sp-text)" }}>{app.title}</span>
                </div>
                {app.canUninstall ? (
                  <Btn
                    size="sm"
                    variant="danger"
                    disabled={!!busy || locked}
                    onClick={() => {
                      if (!window.confirm(`Remove ${app.title} from this site? You can install it again later.`)) return;
                      void runAction(`uninstall:${app.package}`, { action: "uninstall-app", package: app.package }, `${app.title} removed.`);
                    }}
                  >
                    {busy === `uninstall:${app.package}` ? "Removing…" : "Uninstall"}
                  </Btn>
                ) : (
                  <span style={{ fontSize: "0.72rem", color: "var(--sp-muted)", fontWeight: 500 }}>Required</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {/* ── Install app ── */}
      <SectionCard
        title="Install app"
        subtitle="Choose an app available on the platform and add it to this site."
      >
        {site.availableApps.length === 0 ? (
          <p style={{ fontSize: "0.84rem", color: "var(--sp-muted)" }}>All available apps are already installed.</p>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 12 }}>
            <label style={{ minWidth: "12rem", flex: 1 }}>
              <span style={{ display: "block", fontSize: "0.78rem", color: "var(--sp-muted)", marginBottom: 6, fontWeight: 500 }}>App</span>
              <select
                value={selectedInstall}
                onChange={(e) => setSelectedInstall(e.target.value)}
                disabled={!!busy || locked}
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: "var(--sp-radius-sm)",
                  border: "1px solid var(--sp-border)",
                  background: "var(--sp-surface2)",
                  color: "var(--sp-text)",
                  fontSize: "0.85rem",
                  fontFamily: "inherit",
                }}
              >
                <option value="">Select an app…</option>
                {site.availableApps.map((app) => (
                  <option key={app.package} value={app.package}>{app.title}</option>
                ))}
              </select>
            </label>
            <Btn
              variant="primary"
              disabled={!selectedInstall || !!busy || locked}
              onClick={() => {
                const app = site.availableApps.find((a) => a.package === selectedInstall);
                void runAction("install", { action: "install-app", package: selectedInstall }, `${app?.title || "App"} installed.`);
              }}
            >
              {busy === "install" ? "Installing…" : "Install"}
            </Btn>
          </div>
        )}
      </SectionCard>

      {/* ── Plan ── */}
      {showPlan && (
        <SectionCard
          title="Plan"
          subtitle="Upgrade or change the plan. Checkout is free — $0.00 charged."
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {site.plans.map((plan) => {
              const current = site.plan === plan.code;
              const selected = selectedPlan === plan.code;
              return (
                <label
                  key={plan.code}
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "flex-start",
                    gap: 12,
                    padding: "14px 16px",
                    borderRadius: 12,
                    border: selected ? "1px solid var(--sp-accent)" : "1px solid var(--sp-border)",
                    background: selected ? "rgba(124,92,252,.08)" : "rgba(255,255,255,.03)",
                    cursor: "pointer",
                    transition: "all .15s ease",
                  }}
                >
                  <input
                    type="radio"
                    name="plan"
                    value={plan.code}
                    checked={selected}
                    onChange={() => setSelectedPlan(plan.code)}
                    disabled={!!busy}
                    style={{ marginTop: 3, accentColor: "var(--sp-accent)" }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 8 }}>
                      <span style={{ fontWeight: 700, color: "var(--sp-text)", fontSize: "0.95rem" }}>{plan.title}</span>
                      {(plan.priceCents ?? 0) > 0 ? (
                        <>
                          <span style={{ fontSize: "0.8rem", color: "var(--sp-muted)", textDecoration: "line-through" }}>{plan.mock_price}</span>
                          <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--sp-green)" }}>Free</span>
                        </>
                      ) : (
                        <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--sp-green)" }}>Free</span>
                      )}
                      {current && (
                        <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: "0.68rem", fontWeight: 600, background: "rgba(124,92,252,.15)", color: "var(--sp-accent)" }}>
                          Current
                        </span>
                      )}
                    </div>
                    <p style={{ margin: "4px 0 0", fontSize: "0.78rem", color: "var(--sp-muted)" }}>
                      {formatMb(plan.ramLimitMb)} memory · {formatMb(plan.diskLimitMb)} storage
                    </p>
                    {plan.features?.length ? (
                      <p style={{ margin: "3px 0 0", fontSize: "0.75rem", color: "var(--sp-muted)" }}>
                        {plan.features.join(" · ")}
                      </p>
                    ) : null}
                  </div>
                </label>
              );
            })}
          </div>

          <div style={{ marginTop: 16 }}>
            <Btn
              variant="primary"
              disabled={!selectedPlan || selectedPlan === site.plan || !!busy}
              onClick={() => { setError(null); setNotice(null); setShowCheckout(true); }}
            >
              Continue to payment
            </Btn>
          </div>

          {showCheckout && selectedPlan && selectedPlan !== site.plan && (
            <div style={{ marginTop: 20 }}>
              <FreeCheckout
                plan={selectedPlan}
                planTitle={site.plans.find((p) => p.code === selectedPlan)?.title || selectedPlan}
                listPriceCents={site.plans.find((p) => p.code === selectedPlan)?.priceCents ?? 0}
                purpose="upgrade"
                hostname={site.hostname}
                onCancel={() => setShowCheckout(false)}
                onSuccess={(result: CheckoutSuccess) => {
                  setShowCheckout(false);
                  void runAction(
                    "set-plan",
                    { action: "set-plan", plan: selectedPlan, checkoutSessionId: result.sessionId },
                    `Plan updated to ${result.planTitle}. Charged $0.00.`,
                  );
                }}
              />
            </div>
          )}
        </SectionCard>
      )}
    </div>
  );
}
