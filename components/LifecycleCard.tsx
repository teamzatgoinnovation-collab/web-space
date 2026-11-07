"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { CheckoutPanel, type CheckoutSuccess } from "@/components/CheckoutPanel";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { describeLifecycle, inactivityPhrase, type Lifecycle, type Tone } from "@/lib/lifecycle";

const TONE_CLASS: Record<Tone, string> = {
  info: "border-blue-500/30 bg-blue-500/10 text-blue-600",
  success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600",
  warning: "border-amber-500/30 bg-amber-500/10 text-amber-600",
  danger: "border-red-500/30 bg-red-500/10 text-red-600",
};

const fmtDate = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : "-");

/** Compact badge + one line, for the sites list. */
export function LifecycleBadge({ lifecycle }: { lifecycle: Lifecycle | null | undefined }) {
  const d = describeLifecycle(lifecycle, Date.now());
  if (!d) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
      <Badge variant="outline" className={TONE_CLASS[d.tone]}>{d.label}</Badge>
      <span className="text-muted-foreground">{d.headline}</span>
    </div>
  );
}

type Backup = { name: string; backup_type: string; file_size_mb: number | null; finished_at: string | null };

/** Everything about this site's subscription: dates, price, activity, and the actions. */
export function LifecycleCard({
  slug,
  hostname,
  plan,
  planTitle,
  lifecycle,
  onChanged,
}: {
  slug: string;
  hostname: string;
  plan: string;
  planTitle: string;
  lifecycle: Lifecycle | null | undefined;
  onChanged: () => void;
}) {
  const [showCheckout, setShowCheckout] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [backups, setBackups] = useState<Backup[] | null>(null);

  const loadBackups = useCallback(async () => {
    try {
      const res = await fetch(`/api/sites/${encodeURIComponent(slug)}/backups`, { cache: "no-store" });
      const data = await res.json();
      setBackups(data.ok ? (data.backups?.data ?? data.backups ?? []) : []);
    } catch {
      setBackups([]);
    }
  }, [slug]);

  useEffect(() => { void loadBackups(); }, [loadBackups]);

  const d = describeLifecycle(lifecycle, Date.now());
  if (!lifecycle || !d) return null;

  async function activate(result: CheckoutSuccess) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/sites/${encodeURIComponent(slug)}/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, sessionId: result.sessionId, currency: result.currency }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Could not activate");
      setShowCheckout(false);
      // A site an admin suspended keeps its suspension: the payment is credited, nothing is lost, support reactivates it.
      setNotice(
        data.data?.suspended
          ? "Payment received. This site was suspended by our team, so it stays suspended until support reactivates it."
          : "Thank you. Your subscription is active.",
      );
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not activate");
    } finally {
      setBusy(false);
    }
  }

  async function backupNow() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/sites/${encodeURIComponent(slug)}/backups`, { method: "POST" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Could not start the backup");
      setNotice("Backup started. It appears below when it is ready.");
      setTimeout(() => void loadBackups(), 15000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the backup");
    } finally {
      setBusy(false);
    }
  }

  const rows: [string, string][] = [
    ["Site", hostname],
    ["Status", d.label],
    ["Plan", `${planTitle || plan}${lifecycle.period_price ? ` · ${lifecycle.period_price} SAR / ${lifecycle.billing_period === "Yearly" ? "year" : "month"}` : ""}`],
    ["Billing", lifecycle.billing_period === "Yearly" ? "Yearly" : "Monthly"],
    ...(lifecycle.trial_started_at ? ([["Trial", `${fmtDate(lifecycle.trial_started_at)} to ${fmtDate(lifecycle.trial_ends_at)}`]] as [string, string][]) : []),
    ...(lifecycle.remaining_days !== null ? ([["Days left", String(lifecycle.remaining_days)]] as [string, string][]) : []),
    ["Next billing", lifecycle.next_billing_date || "-"],
    ["Last activity", `${fmtDate(lifecycle.last_activity_at)} (${inactivityPhrase(lifecycle)})`],
    ...(lifecycle.deletion_scheduled_at ? ([["Scheduled deletion", fmtDate(lifecycle.deletion_scheduled_at)]] as [string, string][]) : []),
  ];

  return (
    <Card className="mt-5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Subscription <Badge variant="outline" className={TONE_CLASS[d.tone]}>{d.label}</Badge>
        </CardTitle>
        <CardDescription>{d.headline}</CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert className="mb-3 border-red-500/30 bg-red-500/10"><AlertDescription className="text-red-600">{error}</AlertDescription></Alert>
        )}
        {notice && (
          <Alert className="mb-3 border-emerald-500/30 bg-emerald-500/10"><AlertDescription className="text-emerald-600">{notice}</AlertDescription></Alert>
        )}

        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 border-b border-border/60 py-1.5">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="text-right font-medium">{v}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-4 flex flex-wrap gap-2">
          {d.canActivate && !lifecycle.protected && (
            <Button onClick={() => { setError(null); setNotice(null); setShowCheckout(true); }} disabled={busy}>
              {d.actionLabel}
            </Button>
          )}
          <Button variant="secondary" onClick={backupNow} disabled={busy}>
            <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden /> Create backup
          </Button>
        </div>

        {showCheckout && (
          <div className="mt-5">
            <CheckoutPanel
              plan={plan}
              planTitle={planTitle || plan}
              purpose="activate"
              hostname={slug}
              onCancel={() => setShowCheckout(false)}
              onSuccess={(r: CheckoutSuccess) => void activate(r)}
            />
          </div>
        )}

        <div className="mt-5">
          <h3 className="text-sm font-semibold">Download a backup</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Your site's database. Download one before any change you are unsure about: a deleted site cannot be recovered.
          </p>
          {backups === null ? (
            <p className="mt-2 text-xs text-muted-foreground">Loading…</p>
          ) : backups.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">No backup is ready yet. Press "Create backup".</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {backups.map((b) => (
                <li key={b.name} className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-1.5 text-sm">
                  <span>{fmtDate(b.finished_at)} · {b.backup_type}{b.file_size_mb ? ` · ${b.file_size_mb} MB` : ""}</span>
                  <a
                    className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                    href={`/api/sites/${encodeURIComponent(slug)}/backups/${encodeURIComponent(b.name)}/download`}
                  >
                    <Download className="h-4 w-4" aria-hidden /> Download
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
