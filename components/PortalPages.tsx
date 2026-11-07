"use client";

import { useEffect, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { describeLifecycle, type Lifecycle } from "@/lib/lifecycle";

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
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">{title}</h1>
        <p className="mt-2 text-muted-foreground">{subtitle}</p>
      </header>
      {loading && <Skeleton className="h-40 w-full" />}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!loading && !error && (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.map((c) => (
                    <TableHead key={c.key}>{c.label}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, i) => (
                  <TableRow key={String(row.name || i)}>
                    {columns.map((c) => (
                      <TableCell key={c.key} className="text-muted-foreground">
                        {String(row[c.key] ?? "—")}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
                {!rows.length && (
                  <TableRow>
                    <TableCell className="py-6 text-center text-muted-foreground" colSpan={columns.length}>
                      No records yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

type PlanSite = { name: string; slug: string; hostname: string; plan: string; lifecycle?: Lifecycle | null };

export function PlanPageClient() {
  const [sites, setSites] = useState<PlanSite[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/sites", { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok || j.ok === false) throw new Error(j.error || "Failed to load");
        setSites(j.sites || []);
      })
      .catch((e) => setError(String(e.message || e)));
  }, []);

  return (
    <div>
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Plan</h1>
        <p className="mt-2 text-muted-foreground">
          Your free trial and subscription for each site. The first month is free; after that you pay monthly.
        </p>
      </header>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!sites && !error && <Skeleton className="h-32 w-full" />}
      {sites && sites.length === 0 && <p className="text-sm text-muted-foreground">You have no sites yet.</p>}
      <div className="grid gap-4">
        {(sites || []).map((s) => {
          const d = describeLifecycle(s.lifecycle ?? null, Date.now());
          const lc = s.lifecycle;
          return (
            <Card key={s.name}>
              <CardContent className="grid gap-1.5 pt-6 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold break-all">{s.hostname || s.slug}</span>
                  {d && <span className="rounded-full border px-2 py-0.5 text-xs">{d.label}</span>}
                </div>
                {d && lc ? (
                  <>
                    <p className="text-muted-foreground">{d.headline}</p>
                    <p>
                      Plan: {s.plan}
                      {lc.period_price
                        ? ` · ${lc.period_price} SAR / ${lc.billing_period === "Yearly" ? "year" : "month"}${lc.lifecycle_status === "TRIAL" ? " after the trial" : ""}`
                        : ""}
                    </p>
                    <p>Billing: {lc.billing_period === "Yearly" ? "Yearly" : "Monthly"}</p>
                    {lc.trial_started_at && <p>Trial: {lc.trial_started_at.slice(0, 10)} to {(lc.trial_ends_at || "-").slice(0, 10)}</p>}
                    {lc.remaining_days !== null && <p>Days left: {lc.remaining_days}</p>}
                    <p>Next billing: {lc.next_billing_date || "-"}</p>
                    <a className="mt-1 font-semibold text-primary hover:underline" href={`/sites/${encodeURIComponent(s.slug)}`}>
                      Manage subscription
                    </a>
                  </>
                ) : (
                  <p className="text-muted-foreground">Subscription details are not available for this site yet.</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
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
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Profile</h1>
        <p className="mt-2 text-muted-foreground">Customer and portal identity.</p>
      </header>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {profile && (
        <Card>
          <CardContent>
            <pre className="overflow-x-auto text-xs text-muted-foreground">{JSON.stringify(profile, null, 2)}</pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
