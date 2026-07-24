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
    return <p className="text-sm text-red-700">{error}</p>;
  }
  if (!data) {
    return <p className="text-sm text-[var(--space-ink)]/55">Loading dashboard…</p>;
  }

  const sites = data.sites || [];
  const notifs = data.notifications || [];
  const plan = data.plan;

  return (
    <div>
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-2 text-[var(--space-ink)]/65">Sites, plan, usage, and alerts at a glance.</p>
      </header>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-[var(--space-ink)]/10 bg-white/70 p-5">
          <p className="text-sm text-[var(--space-ink)]/60">My sites</p>
          <p className="mt-2 text-2xl font-semibold">{data.usage?.site_count ?? sites.length}</p>
          <Link href="/" className="mt-3 inline-block text-sm text-[var(--space-accent)]">
            View sites
          </Link>
        </div>
        <div className="rounded-2xl border border-[var(--space-ink)]/10 bg-white/70 p-5">
          <p className="text-sm text-[var(--space-ink)]/60">Storage used</p>
          <p className="mt-2 text-2xl font-semibold">{Math.round(data.usage?.storage_mb || 0)} MB</p>
          <Link href="/usage" className="mt-3 inline-block text-sm text-[var(--space-accent)]">
            Usage detail
          </Link>
        </div>
        <div className="rounded-2xl border border-[var(--space-ink)]/10 bg-white/70 p-5">
          <p className="text-sm text-[var(--space-ink)]/60">Current plan</p>
          <p className="mt-2 text-2xl font-semibold">{String(plan?.plan || "—")}</p>
          <p className="mt-1 text-xs text-[var(--space-ink)]/55">
            {String(plan?.payment_status || "")} · {String(plan?.status || "")}
          </p>
        </div>
      </div>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Deployment status</h2>
        <ul className="mt-3 space-y-2">
          {sites.slice(0, 8).map((s) => (
            <li
              key={String(s.name)}
              className="flex items-center justify-between rounded-xl border border-[var(--space-ink)]/10 bg-white/60 px-4 py-3"
            >
              <div>
                <p className="font-medium">{String(s.domain || s.site_name)}</p>
                <p className="text-xs text-[var(--space-ink)]/55">{String(s.status)}</p>
              </div>
              <Link className="text-sm text-[var(--space-accent)]" href={`/sites/${s.site_name || s.name}`}>
                Manage
              </Link>
            </li>
          ))}
          {!sites.length && <p className="text-sm text-[var(--space-ink)]/55">No sites yet.</p>}
        </ul>
      </section>

      <section className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Notifications</h2>
          <Link href="/notifications" className="text-sm text-[var(--space-accent)]">
            All alerts
          </Link>
        </div>
        <ul className="mt-3 space-y-2">
          {notifs.map((n) => (
            <li key={String(n.name)} className="rounded-xl border border-[var(--space-ink)]/10 bg-white/60 px-4 py-3">
              <p className="font-medium">{String(n.title)}</p>
              <p className="text-xs text-[var(--space-ink)]/55">{String(n.event_type)}</p>
            </li>
          ))}
          {!notifs.length && <p className="text-sm text-[var(--space-ink)]/55">No unread alerts.</p>}
        </ul>
      </section>
    </div>
  );
}
