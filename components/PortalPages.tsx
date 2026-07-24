"use client";

import { useEffect, useState } from "react";

function SimpleListPage({
  title,
  subtitle,
  endpoint,
  columns,
}: {
  title: string;
  subtitle: string;
  endpoint: string;
  columns: Array<{ key: string; label: string }>;
}) {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(endpoint, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok || j.ok === false) throw new Error(j.error || "Failed");
        const data = j.data ?? j;
        setRows(Array.isArray(data) ? data : []);
      })
      .catch((e) => setError(String(e.message || e)))
      .finally(() => setLoading(false));
  }, [endpoint]);

  return (
    <div>
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-[var(--space-ink)]/65">{subtitle}</p>
      </header>
      {loading && <p className="text-sm text-[var(--space-ink)]/55">Loading…</p>}
      {error && <p className="text-sm text-red-700">{error}</p>}
      {!loading && !error && (
        <div className="overflow-x-auto rounded-2xl border border-[var(--space-ink)]/10 bg-white/70">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-[var(--space-ink)]/10 text-[var(--space-ink)]/60">
              <tr>
                {columns.map((c) => (
                  <th key={c.key} className="px-4 py-3 font-medium">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={String(row.name || i)} className="border-b border-[var(--space-ink)]/5">
                  {columns.map((c) => (
                    <td key={c.key} className="px-4 py-3">
                      {String(row[c.key] ?? "—")}
                    </td>
                  ))}
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td className="px-4 py-6 text-[var(--space-ink)]/55" colSpan={columns.length}>
                    No records yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function UsagePageClient() {
  return (
    <SimpleListPage
      title="Usage"
      subtitle="Weekly storage and resource rollups from Space."
      endpoint="/api/portal/usage"
      columns={[
        { key: "site", label: "Site" },
        { key: "period_start", label: "From" },
        { key: "period_end", label: "To" },
        { key: "storage_mb", label: "Storage MB" },
        { key: "database_mb", label: "DB MB" },
      ]}
    />
  );
}

export function PlanPageClient() {
  return (
    <SimpleListPage
      title="Plan"
      subtitle="Your subscriptions and payment status (gateway disabled)."
      endpoint="/api/portal/subscriptions"
      columns={[
        { key: "plan", label: "Plan" },
        { key: "status", label: "Status" },
        { key: "payment_status", label: "Payment" },
        { key: "start_date", label: "Start" },
        { key: "end_date", label: "End" },
        { key: "renewal_date", label: "Renewal" },
        { key: "trial_ends_on", label: "Trial ends" },
      ]}
    />
  );
}

export function InvoicesPageClient() {
  return (
    <SimpleListPage
      title="Invoices"
      subtitle="Status-only invoices — payment gateway remains disabled."
      endpoint="/api/portal/invoices"
      columns={[
        { key: "name", label: "Invoice" },
        { key: "period_start", label: "Period start" },
        { key: "period_end", label: "Period end" },
        { key: "amount", label: "Amount" },
        { key: "status", label: "Status" },
        { key: "payment_status", label: "Payment" },
      ]}
    />
  );
}

export function DeploymentsPageClient() {
  return (
    <SimpleListPage
      title="Deployments"
      subtitle="Job timeline, progress, and outcomes."
      endpoint="/api/portal/deployments"
      columns={[
        { key: "name", label: "Job" },
        { key: "site", label: "Site" },
        { key: "job_type", label: "Type" },
        { key: "status", label: "Status" },
        { key: "progress", label: "Progress %" },
        { key: "estimated_minutes", label: "Est. min" },
        { key: "started_at", label: "Started" },
      ]}
    />
  );
}

export function BackupsPageClient() {
  return (
    <SimpleListPage
      title="Backups"
      subtitle="Manual and automatic restore points."
      endpoint="/api/portal/backups"
      columns={[
        { key: "name", label: "Backup" },
        { key: "site", label: "Site" },
        { key: "backup_type", label: "Type" },
        { key: "status", label: "Status" },
        { key: "file_size_mb", label: "Size MB" },
        { key: "finished_at", label: "Finished" },
      ]}
    />
  );
}

export function DomainsPageClient() {
  return (
    <SimpleListPage
      title="Domains"
      subtitle="Primary and custom domains with DNS / SSL status."
      endpoint="/api/portal/domains"
      columns={[
        { key: "domain", label: "Domain" },
        { key: "site", label: "Site" },
        { key: "is_primary", label: "Primary" },
        { key: "dns_status", label: "DNS" },
        { key: "ssl_status", label: "SSL" },
      ]}
    />
  );
}

export function NotificationsPageClient() {
  return (
    <SimpleListPage
      title="Notifications"
      subtitle="Desk notification center events for your account."
      endpoint="/api/portal/notifications"
      columns={[
        { key: "title", label: "Title" },
        { key: "event_type", label: "Event" },
        { key: "is_read", label: "Read" },
        { key: "creation", label: "When" },
      ]}
    />
  );
}

export function ProfilePageClient() {
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/portal/profile", { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok || j.ok === false) throw new Error(j.error || "Failed");
        setProfile(j.data || j);
      })
      .catch((e) => setError(String(e.message || e)));
  }, []);

  return (
    <div>
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Profile</h1>
        <p className="mt-2 text-[var(--space-ink)]/65">Customer and portal identity.</p>
      </header>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {profile && (
        <pre className="overflow-x-auto rounded-2xl border border-[var(--space-ink)]/10 bg-white/70 p-5 text-xs">
          {JSON.stringify(profile, null, 2)}
        </pre>
      )}
    </div>
  );
}
