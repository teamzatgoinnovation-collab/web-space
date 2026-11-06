"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Boxes } from "lucide-react";
import { formatMb } from "@/lib/format";
import { SiteUsageGraph } from "@/components/SiteUsageGraph";
import { CheckoutPanel, type CheckoutSuccess } from "@/components/CheckoutPanel";
import { LifecycleCard } from "@/components/LifecycleCard";
import type { Lifecycle } from "@/lib/lifecycle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

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
  lifecycle?: Lifecycle | null;
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

function SectionCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <Card className="mt-5">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {subtitle && <CardDescription>{subtitle}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function SiteManage({ slug }: Props) {
  const router = useRouter();
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
      if (body.action === "delete") {
        router.push("/");
        return;
      }
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
      <div className="py-16 text-center">
        <p className="text-sm text-muted-foreground">Loading site…</p>
      </div>
    );
  }

  if (!site) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-destructive">{error || "Site not found"}</p>
        <Link href="/" className="mt-4 inline-block text-sm text-primary hover:underline">
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
      <header className="mb-7">
        <Link href="/" className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
          <ArrowLeft className="size-3.5" />
          All sites
        </Link>
        <p className="mt-3 text-xs font-bold tracking-[0.1em] text-primary uppercase">Site management</p>
        <h1 className="mt-1.5 text-[clamp(1.6rem,4vw,2.4rem)] font-extrabold tracking-tight break-all text-foreground">
          {site.hostname}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Install or remove apps, change plan, clear cache, or update the site schema.
        </p>
        <div className="mt-4 flex flex-wrap gap-2.5">
          <Button variant="secondary" nativeButton={false} render={<Link href={`/sites/${encodeURIComponent(site.slug)}/deployments`}>Deployments</Link>} />
          <Button nativeButton={false} render={
            <a href={site.deskUrl} target="_blank" rel="noreferrer">
              Open Desk
              <ExternalLink className="size-3" />
            </a>
          } />
          <Button
            variant="secondary"
            disabled={!!busy || locked}
            onClick={() => void runAction("clear-cache", { action: "clear-cache" }, "Site cache cleared.")}
          >
            {busy === "clear-cache" ? "Clearing…" : "Clear cache"}
          </Button>
          <Button
            variant="secondary"
            disabled={!!busy || locked}
            onClick={() => void runAction("migrate", { action: "migrate" }, "Site updated (migrate + clear cache).")}
          >
            {busy === "migrate" ? "Updating…" : "Update site"}
          </Button>
        </div>
      </header>

      {/* ── Alerts ── */}
      {error && (
        <Alert variant="destructive" className="mb-3.5">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {notice && (
        <Alert className="mb-3.5 border-emerald-500/30 bg-emerald-500/10 text-emerald-600 [&>svg]:text-emerald-600">
          <AlertDescription className="text-emerald-600">{notice}</AlertDescription>
        </Alert>
      )}
      {locked && (
        <Alert className="mb-3.5 border-amber-500/30 bg-amber-500/10 text-amber-600 [&>svg]:text-amber-600">
          <AlertDescription className="text-amber-600">
            This site is still setting up. Actions will be available once it is ready.
          </AlertDescription>
        </Alert>
      )}

      {/* ── Subscription ── */}
      <LifecycleCard
        slug={site.slug}
        hostname={site.hostname}
        plan={site.plan || ""}
        planTitle={site.planTitle || site.plan || ""}
        lifecycle={site.lifecycle ?? null}
        onChanged={() => void load()}
      />

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
      <SectionCard title="Installed apps" subtitle="Remove an app you no longer need. The framework app stays installed.">
        {site.installedApps.length === 0 ? (
          <p className="text-sm text-muted-foreground">No apps listed yet.</p>
        ) : (
          <ul className="flex list-none flex-col gap-2 p-0">
            {site.installedApps.map((app) => (
              <li
                key={app.package}
                className="flex flex-wrap items-center justify-between gap-2.5 rounded-lg border border-border bg-muted/50 px-3.5 py-2.5"
              >
                <div className="flex items-center gap-2.5">
                  <div className="flex size-7 items-center justify-center rounded-lg bg-secondary text-primary">
                    <Boxes className="size-3.5" />
                  </div>
                  <span className="text-sm font-semibold text-foreground">{app.title}</span>
                </div>
                {app.canUninstall ? (
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={!!busy || locked}
                    onClick={() => {
                      if (!window.confirm(`Remove ${app.title} from this site? You can install it again later.`)) return;
                      void runAction(`uninstall:${app.package}`, { action: "uninstall-app", package: app.package }, `${app.title} removed.`);
                    }}
                  >
                    {busy === `uninstall:${app.package}` ? "Removing…" : "Uninstall"}
                  </Button>
                ) : (
                  <span className="text-xs font-medium text-muted-foreground">Required</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {/* ── Install app ── */}
      <SectionCard title="Install app" subtitle="Choose an app available on the platform and add it to this site.">
        {site.availableApps.length === 0 ? (
          <p className="text-sm text-muted-foreground">All available apps are already installed.</p>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-48 flex-1">
              <Label className="mb-1.5 text-xs text-muted-foreground">App</Label>
              <Select value={selectedInstall} onValueChange={(v) => setSelectedInstall(v ?? "")} disabled={!!busy || locked}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select an app…" />
                </SelectTrigger>
                <SelectContent>
                  {site.availableApps.map((app) => (
                    <SelectItem key={app.package} value={app.package}>
                      {app.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              disabled={!selectedInstall || !!busy || locked}
              onClick={() => {
                const app = site.availableApps.find((a) => a.package === selectedInstall);
                void runAction("install", { action: "install-app", package: selectedInstall }, `${app?.title || "App"} installed.`);
              }}
            >
              {busy === "install" ? "Installing…" : "Install"}
            </Button>
          </div>
        )}
      </SectionCard>

      {/* ── Plan ── */}
      {showPlan && (
        <SectionCard title="Plan" subtitle="Upgrade or change the plan. Paid plans are billed monthly via Moyasar.">
          <RadioGroup value={selectedPlan} onValueChange={setSelectedPlan} disabled={!!busy} className="gap-2.5">
            {site.plans.map((plan) => {
              const current = site.plan === plan.code;
              const selected = selectedPlan === plan.code;
              return (
                <Label
                  key={plan.code}
                  htmlFor={`plan-${plan.code}`}
                  className={cn(
                    "flex flex-wrap items-start gap-3 rounded-xl border p-3.5 transition-colors",
                    selected ? "border-primary bg-primary/8" : "border-border bg-muted/40",
                  )}
                >
                  <RadioGroupItem value={plan.code} id={`plan-${plan.code}`} className="mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="text-[0.95rem] font-bold text-foreground">{plan.title}</span>
                      {(plan.priceCents ?? 0) > 0 ? (
                        <span className="text-sm font-bold text-primary">
                          {((plan.priceCents ?? 0) / 100).toFixed(2)} SAR/mo
                        </span>
                      ) : (
                        <span className="text-sm font-bold text-emerald-500">Free</span>
                      )}
                      {current && <Badge variant="secondary">Current</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatMb(plan.ramLimitMb)} memory · {formatMb(plan.diskLimitMb)} storage
                    </p>
                    {plan.features?.length ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">{plan.features.join(" · ")}</p>
                    ) : null}
                  </div>
                </Label>
              );
            })}
          </RadioGroup>

          <div className="mt-4">
            <Button
              disabled={!selectedPlan || selectedPlan === site.plan || !!busy}
              onClick={() => { setError(null); setNotice(null); setShowCheckout(true); }}
            >
              Continue to payment
            </Button>
          </div>

          {showCheckout && selectedPlan && selectedPlan !== site.plan && (
            <div className="mt-5">
              <CheckoutPanel
                plan={selectedPlan}
                planTitle={site.plans.find((p) => p.code === selectedPlan)?.title || selectedPlan}
                purpose="upgrade"
                hostname={site.hostname}
                onCancel={() => setShowCheckout(false)}
                onSuccess={(result: CheckoutSuccess) => {
                  setShowCheckout(false);
                  void runAction(
                    "set-plan",
                    { action: "set-plan", plan: selectedPlan, checkoutSessionId: result.sessionId, currency: result.currency },
                    `Plan updated to ${result.planTitle}.`,
                  );
                }}
              />
            </div>
          )}
        </SectionCard>
      )}

      {/* ── Danger zone ── */}
      <Card className="mt-5 border-destructive/30">
        <CardHeader>
          <CardTitle className="text-base text-destructive">Danger zone</CardTitle>
          <CardDescription>
            Permanently delete this site and all of its data. This cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="destructive"
            disabled={!!busy || locked}
            onClick={() => {
              if (
                !window.confirm(
                  `Permanently delete ${site.hostname}?\n\nThis destroys the site, its database, and all files. This cannot be undone.`,
                )
              ) {
                return;
              }
              void runAction("delete", { action: "delete" }, "Site deleted.");
            }}
          >
            {busy === "delete" ? "Deleting…" : "Delete site"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
