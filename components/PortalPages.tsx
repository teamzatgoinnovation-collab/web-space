"use client";

import { useEffect, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

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
