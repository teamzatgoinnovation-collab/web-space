/**
 * What the customer sees of a site's trial / subscription. The server (Space lifecycle) is the authority: these
 * helpers only turn its picture into labels, and recompute the day counter so a cached response never lags.
 * Pure functions -- covered by tests/lifecycle.test.ts.
 */

export type LifecycleStatus =
  | "TRIAL"
  | "ACTIVE"
  | "EXPIRED"
  | "SUSPENDED"
  | "PENDING_PAYMENT"
  | "DELETION_SCHEDULED"
  | "DELETED";

export type Lifecycle = {
  subscription: string;
  site: string | null;
  site_url: string | null;
  site_status: string | null;
  lifecycle_status: LifecycleStatus | null;
  plan: string | null;
  monthly_price: number | null;
  yearly_price?: number | null;
  /** Set by an admin on the platform; one payment buys one period. Absent (older platform) means Monthly. */
  billing_period?: "Monthly" | "Yearly";
  period_price?: number | null;
  /** A real company site Space only tracks: shows a neutral "Active" badge, has no trial and nothing to pay. */
  protected?: boolean;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  remaining_days: number | null;
  paid_until: string | null;
  next_billing_date: string | null;
  last_activity_at: string | null;
  inactive_days: number;
  deletion_scheduled_at: string | null;
  deletion_hold: boolean;
  read_only: boolean;
};

export type Tone = "info" | "success" | "warning" | "danger";

export type LifecycleLabel = {
  label: string;
  tone: Tone;
  headline: string;
  /** Show the pay / activate button. */
  canActivate: boolean;
  actionLabel: string;
};

const DAY_MS = 86_400_000;

/** Whole days left, rounded up, never negative (same rule as the server). */
export function daysLeft(endsAt: string | null | undefined, nowMs: number): number | null {
  if (!endsAt) return null;
  const end = Date.parse(endsAt);
  if (Number.isNaN(end)) return null;
  return Math.max(0, Math.ceil((end - nowMs) / DAY_MS));
}

export function describeLifecycle(v: Lifecycle | null | undefined, nowMs: number): LifecycleLabel | null {
  if (!v || !v.lifecycle_status) return null;
  const days = daysLeft(v.trial_ends_at, nowMs);
  switch (v.lifecycle_status) {
    case "TRIAL":
      if (days !== null && days <= 0) {
        return { label: "Trial ended", tone: "danger", headline: "Your free trial has ended. Choose a monthly plan to keep editing.", canActivate: true, actionLabel: "Activate subscription" };
      }
      return {
        label: "Free trial",
        tone: days !== null && days <= 5 ? "warning" : "info",
        headline: days === 1 ? "1 day left in your free trial" : `${days ?? "?"} days left in your free trial`,
        canActivate: true,
        actionLabel: "Activate subscription",
      };
    case "ACTIVE": {
      if (v.protected) {
        return { label: "Active", tone: "success", headline: "ZatGo ERP site: active.", canActivate: false, actionLabel: "" };
      }
      const yearly = v.billing_period === "Yearly";
      const period = yearly ? "Yearly" : "Monthly";
      return {
        label: "Active",
        tone: "success",
        headline: v.next_billing_date ? `${period} · renews ${v.next_billing_date}` : `${period} subscription active`,
        canActivate: !!v.paid_until,
        actionLabel: yearly ? "Pay next year" : "Pay next month",
      };
    }
    case "EXPIRED":
      return { label: "Read-only", tone: "danger", headline: "Trial ended: your data is safe and viewable, editing is off.", canActivate: true, actionLabel: "Activate subscription" };
    case "PENDING_PAYMENT":
      return { label: "Payment due", tone: "danger", headline: "Your monthly payment is overdue: the site is read-only.", canActivate: true, actionLabel: "Pay now" };
    case "SUSPENDED":
      return { label: "Suspended", tone: "danger", headline: "This site is suspended. Pay or contact support to reactivate.", canActivate: true, actionLabel: "Reactivate" };
    case "DELETION_SCHEDULED":
      return {
        label: "Deletion scheduled",
        tone: "danger",
        headline: v.deletion_scheduled_at ? `Scheduled for deletion on ${v.deletion_scheduled_at.slice(0, 10)}. Sign in or subscribe to keep it.` : "Scheduled for deletion.",
        canActivate: true,
        actionLabel: "Reactivate",
      };
    case "DELETED":
      return { label: "Deleted", tone: "danger", headline: "This site was deleted.", canActivate: false, actionLabel: "" };
    default:
      return null;
  }
}

/** Inactivity as a short phrase: "no activity for 4 days". */
export function inactivityPhrase(v: Pick<Lifecycle, "inactive_days" | "last_activity_at">): string {
  const d = Math.floor(v.inactive_days || 0);
  if (d <= 0) return "active today";
  return d === 1 ? "no activity for 1 day" : `no activity for ${d} days`;
}

/** Merge the lifecycle picture of each site (keyed by site name) onto the portal's site rows. */
export function mergeLifecycle<T extends { name: string; slug: string }>(
  rows: T[],
  byName: Record<string, Lifecycle> | null | undefined,
): Array<T & { lifecycle: Lifecycle | null }> {
  return rows.map((r) => ({ ...r, lifecycle: byName?.[r.name] ?? byName?.[r.slug] ?? null }));
}
