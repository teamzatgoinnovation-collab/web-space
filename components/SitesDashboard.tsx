"use client";

import { LifecycleBadge } from "@/components/LifecycleCard";
import type { Lifecycle } from "@/lib/lifecycle";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Boxes, HardDrive, MemoryStick, AlertCircle, Globe } from "lucide-react";
import { SitesDevConsole } from "@/components/SitesDevConsole";
import { formatMb, pct } from "@/lib/format";
import { isDevConsoleEnabled } from "@/lib/dev-console";
import type { MeasuredBench, PoolSummary, SiteUsageRow } from "@/lib/sites-usage";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

export const APP_LABELS: Record<string, string> = {
  frappe: "Framework",
  erpnext: "ZatGo ERP",
  hrms: "HR",
  crm: "CRM",
  helpdesk: "Helpdesk",
  telephony: "Telephony",
  chat_ai: "Chat AI",
  tracker: "Tracker",
  zatgo_core: "ZatGo Core",
  zatgo_space: "ZatGo Space",
};

const HIDDEN_APPS = new Set(["frappe", "zatgo_hub", "space", "space_cloud"]);

function appLabel(pkg: string): string {
  return APP_LABELS[pkg] || pkg.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function visibleApps(apps: string[]): string[] {
  return apps.filter((a) => !HIDDEN_APPS.has(a)).map(appLabel);
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default",
  provisioning: "secondary",
  suspended: "outline",
  failed: "destructive",
};

function StatusBadge({ status }: { status?: string }) {
  const s = String(status || "").toLowerCase();
  const variant = STATUS_VARIANT[s] || "secondary";
  return (
    <Badge variant={variant} className="whitespace-nowrap">
      {status}
    </Badge>
  );
}

function StatCard({
  icon,
  label,
  value,
  detail,
  bar,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
  bar?: number;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex size-9 items-center justify-center rounded-lg bg-secondary text-primary">{icon}</div>
        <div>
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{label}</p>
          <p className="mt-1 text-3xl leading-none font-bold text-foreground">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
        </div>
        {bar !== undefined && <Progress value={Math.min(100, Math.max(0, bar))} />}
      </CardContent>
    </Card>
  );
}

function SitesSkeleton() {
  return (
    <div aria-busy="true">
      <p className="mb-4 text-sm text-muted-foreground">Loading your sites…</p>
      <div className="mb-8 grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
        {[0, 1, 2].map((i) => (
          <Card key={i}>
            <CardContent className="flex flex-col gap-3">
              <Skeleton className="size-8 rounded-lg" />
              <Skeleton className="h-3 w-3/5" />
              <Skeleton className="h-7 w-2/5" />
              {i === 1 && <Skeleton className="h-1.5 w-full" />}
            </CardContent>
          </Card>
        ))}
      </div>
      {[0, 1, 2].map((i) => (
        <Card key={i} className="mb-3">
          <CardContent className="flex items-center justify-between">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-44" />
              <Skeleton className="h-2.5 w-28" />
            </div>
            <Skeleton className="h-7 w-18" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function siteBadgeStatus(site: SiteUsageRow): string {
  if (site.status === "Failed") return "Failed";
  if (site.status === "Suspended") return "Suspended";
  if (!site.onDocker || site.status === "Provisioning" || site.status === "Draft") return "Provisioning";
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

  const readyCount = sites.filter((s) => s.onDocker && s.status !== "Failed").length;
  const memPct = measured && measured.ramLimitMb > 0 ? pct(measured.ramUsedMb, measured.ramLimitMb) : 0;
  const diskPct = measured && measured.diskUsedMb > 0 && pool ? pct(measured.diskUsedMb, measured.diskUsedMb + pool.freeDiskMb) : 0;
  const showSkeleton = loading && sites.length === 0;
  const busy = loading || refreshing || detailsLoading;

  return (
    <div className="flex flex-col">
      {/* ── Hero header ── */}
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold tracking-[0.12em] text-primary uppercase">ZatGo Space</p>
          <h1 className="mt-1.5 text-[clamp(2rem,5vw,3.2rem)] leading-tight font-extrabold tracking-tight text-foreground">
            Your sites
          </h1>
          <p className="mt-2.5 max-w-md text-sm leading-relaxed text-muted-foreground">
            See each site&apos;s address, storage, and apps. Manage apps and plans, or open Desk to sign in.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Button nativeButton={false} render={<Link href="/new?plan=pro&trial=1">Try SpaceCloud</Link>} />
          <Button variant="secondary" nativeButton={false} render={<Link href="/new">+ New site</Link>} />
          <Button variant="secondary" disabled={busy} onClick={() => void load({ soft: true, details: true })}>
            {busy && !showSkeleton ? "Updating…" : "Refresh"}
          </Button>
        </div>
      </header>

      {/* ── Error banner ── */}
      {error && (
        <Alert variant="destructive" className="mb-5">
          <AlertCircle />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {showSkeleton ? (
        <SitesSkeleton />
      ) : (
        <>
          {/* ── Stat cards ── */}
          {detailsLoading && <p className="mb-3 text-sm text-muted-foreground">Updating storage and apps…</p>}
          <div
            className={cn(
              "mb-7 grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3.5 transition-opacity",
              detailsLoading && "opacity-75",
            )}
          >
            <StatCard
              icon={<Boxes className="size-4.5" />}
              label="Sites"
              value={String(readyCount)}
              detail={readyCount === 1 ? "Active site" : "Active sites"}
            />
            <StatCard
              icon={<MemoryStick className="size-4.5" />}
              label="Memory"
              value={measured ? formatMb(measured.ramUsedMb) : "—"}
              detail={measured && measured.ramLimitMb > 0 ? `of ${formatMb(measured.ramLimitMb)} total` : "Shared across all sites"}
              bar={memPct}
            />
            <StatCard
              icon={<HardDrive className="size-4.5" />}
              label="Storage"
              value={measured ? formatMb(measured.diskUsedMb) : "—"}
              detail="Total used by your sites"
              bar={diskPct}
            />
          </div>

          {pool && pool.siteCount > 0 && (
            <p className="mb-5 text-xs text-muted-foreground">
              Plan capacity left: {formatMb(pool.freeRamMb)} memory · {formatMb(pool.freeDiskMb)} storage
            </p>
          )}

          {/* ── Sites list ── */}
          <section className={cn("transition-opacity", detailsLoading && "opacity-85")}>
            <div className="mb-3.5 flex items-center justify-between">
              <h2 className="flex items-center gap-2.5 text-base font-bold text-foreground">
                All sites
                <Badge variant="secondary">{sites.length}</Badge>
              </h2>
              {detailsLoading && <span className="text-xs text-muted-foreground">Updating details…</span>}
            </div>

            {sites.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
                  <div className="flex size-14 items-center justify-center rounded-full border border-border bg-secondary">
                    <Globe className="size-6 text-muted-foreground" />
                  </div>
                  <p className="font-semibold text-foreground">No sites yet</p>
                  <p className="text-sm text-muted-foreground">Try SpaceCloud free for 14 days to get started.</p>
                  <Button className="mt-1" nativeButton={false} render={<Link href="/new?plan=pro&trial=1">Try SpaceCloud</Link>} />
                </CardContent>
              </Card>
            ) : (
              <ul className="flex list-none flex-col gap-3 p-0">
                {sites.map((site) => {
                  const apps = visibleApps(site.apps || []);
                  const hasPlanLimits = site.inPool && site.diskLimitMb > 0;
                  const diskPctSite = hasPlanLimits ? pct(site.diskUsedMb, site.diskLimitMb) : 0;
                  const status = siteBadgeStatus(site);

                  return (
                    <Card key={site.name}>
                      <CardContent>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <a
                              href={site.deskUrl || `https://${site.hostname}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[0.95rem] font-bold break-all text-foreground hover:underline"
                            >
                              {site.hostname}
                            </a>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {status === "Failed"
                                ? "Setup failed. Open Manage, delete this site, and try again."
                                : site.planTitle
                                  ? `${site.planTitle} plan`
                                  : site.kind === "erp"
                                    ? "Main company ERP"
                                    : "Open Desk to sign in."}
                            </p>
                          </div>
                          <StatusBadge status={status} />
                        </div>

                        <LifecycleBadge lifecycle={(site as { lifecycle?: Lifecycle | null }).lifecycle ?? null} />

                        {/* App pills */}
                        {detailsLoading && apps.length === 0 ? (
                          <div className="mt-3 flex gap-1.5">
                            <Skeleton className="h-5 w-13" />
                            <Skeleton className="h-5 w-15" />
                            <Skeleton className="h-5 w-12" />
                          </div>
                        ) : apps.length > 0 ? (
                          <div className="mt-3">
                            <p className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Apps</p>
                            <div className="flex flex-wrap gap-1.5">
                              {apps.map((label) => (
                                <Badge key={label} variant="outline">
                                  {label}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {/* Storage bar */}
                        {hasPlanLimits && (
                          <div className="mt-3.5">
                            <div className="mb-1 flex justify-between">
                              <span className="text-xs text-muted-foreground">Storage used</span>
                              <span className="text-xs font-semibold text-foreground">
                                {detailsLoading && !site.diskUsedMb ? "—" : formatMb(site.diskUsedMb)}
                                <span className="font-normal text-muted-foreground">
                                  {" / "}
                                  {formatMb(site.diskLimitMb)}
                                </span>
                              </span>
                            </div>
                            <Progress value={diskPctSite} />
                          </div>
                        )}

                        {/* Actions */}
                        <div className="mt-4 flex flex-wrap justify-end gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            nativeButton={false}
                            render={<Link href={`/sites/${encodeURIComponent(site.slug)}`}>Manage</Link>}
                          />
                          <Button
                            variant="secondary"
                            size="sm"
                            nativeButton={false}
                            render={<Link href={`/sites/${encodeURIComponent(site.slug)}/deployments`}>Deployments</Link>}
                          />
                          {status !== "Failed" && (
                          <Button
                            size="sm"
                            nativeButton={false}
                            render={
                              <a href={site.deskUrl || `https://${site.hostname}`} target="_blank" rel="noreferrer">
                                Open Desk ↗
                              </a>
                            }
                          />
                          )}
                        </div>
                      </CardContent>
                    </Card>
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
