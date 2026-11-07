/**
 * Moyasar-backed billing for Space plan changes / new-site checkout.
 *
 * Free plans (priceCents === 0) skip the payment gateway entirely — there's
 * nothing to charge. Paid plans use Moyasar's Payment Form widget
 * (components/MoyasarCheckout.tsx), which creates the payment directly
 * from the browser against Moyasar's API using the publishable key — raw
 * card data never reaches this server. Moyasar itself is the source of
 * truth for "did this actually get paid": assertPaidCheckout re-fetches
 * the payment by id with the secret key and re-checks status, amount, and
 * currency before any provisioning or plan change is allowed to proceed —
 * nothing here trusts a client-asserted success.
 *
 * Plan/purpose/hostname binding travels in the payment's `description`
 * field (a real Moyasar field, echoed back verbatim on fetch) instead of
 * server-side session state, so there's nothing to persist between
 * "start checkout" and "verify checkout" — Moyasar's payment id is that
 * session already.
 */

import { getPlan } from "./control-plane";
import { priceCents, type BillingPeriod } from "./payments/pricing";
import { activeProviders, availableCurrencies, getProvider, splitSessionId, verifySession } from "./payments/registry";
import type { Currency, PaymentPurpose, ProviderId } from "./payments/types";

export type CheckoutPurpose = PaymentPurpose;

const FREE_PREFIX = "free_";

export type CheckoutSession = {
  id: string;
  status: "open" | "complete";
  purpose: CheckoutPurpose;
  plan: string;
  planTitle: string;
  provider?: ProviderId;
  currency: Currency;
  listPriceCents: number;
  amountDueCents: number;
  hostname?: string;
  /** Provider-specific data for the browser (open sessions only). */
  client?: Record<string, unknown>;
};

/** What the wizard offers for a plan: currencies, each with its price and providers. */
export function checkoutOptions(planCode: string, period: BillingPeriod = "Monthly"): {
  period: BillingPeriod;
  currencies: { currency: Currency; priceCents: number; providers: { id: ProviderId; label: string; methods: string[] }[] }[];
} {
  const plan = getPlan(planCode);
  if (!plan || !plan.isActive) return { period, currencies: [] };
  // A free plan needs no gateway, so it is always available (in the default currency).
  if ((priceCents(planCode, "SAR") ?? 1) === 0) {
    return { period, currencies: [{ currency: "SAR", priceCents: 0, providers: [] }] };
  }
  const active = activeProviders();
  return {
    period,
    currencies: availableCurrencies(planCode).map((currency) => ({
      currency,
      priceCents: priceCents(planCode, currency, process.env, period)!,
      providers: active
        .filter((p) => p.currencies.includes(currency))
        .map((p) => ({ id: p.id, label: p.label, methods: p.methods })),
    })),
  };
}

/** Legacy single-currency list price (SAR minor units) for places that show one number. */
export function planListPriceCents(planCode: string): number {
  return priceCents(planCode, "SAR") ?? 0;
}

export async function createCheckoutSession(input: {
  plan: string;
  purpose: CheckoutPurpose;
  hostname?: string;
  provider?: string;
  currency?: string;
  /** Set by the server from the site's platform record, never from the browser. */
  period?: BillingPeriod;
}): Promise<{ ok: true; session: CheckoutSession } | { ok: false; error: string }> {
  const plan = getPlan(input.plan);
  if (!plan || !plan.isActive) {
    return { ok: false, error: "Unknown or inactive plan" };
  }
  if (input.purpose !== "provision" && !input.hostname?.trim()) {
    return { ok: false, error: "Hostname required for plan upgrades and activation" };
  }
  const hostname = input.hostname?.trim().toLowerCase() || undefined;
  const currency = (input.currency || "SAR") as Currency;
  const amountCents = priceCents(plan.code, currency, process.env, input.period ?? "Monthly");
  if (amountCents === undefined) return { ok: false, error: "This plan is not available in that currency." };

  const base = {
    purpose: input.purpose,
    plan: plan.code,
    planTitle: plan.title,
    currency,
    listPriceCents: amountCents,
    amountDueCents: amountCents,
    hostname,
  };

  if (amountCents <= 0) {
    return { ok: true, session: { ...base, id: `${FREE_PREFIX}${crypto.randomUUID()}`, status: "complete" } };
  }

  const provider = getProvider(input.provider || "moyasar");
  if (!provider || !provider.currencies.includes(currency) || !activeProviders().some((p) => p.id === provider.id)) {
    return { ok: false, error: "That payment method is not available. Try another." };
  }
  try {
    const client = await provider.createCheckout({
      plan: plan.code,
      purpose: input.purpose,
      hostname,
      amountCents,
      currency,
    });
    return {
      ok: true,
      session: { ...base, id: "", status: "open", provider: provider.id, client },
    };
  } catch {
    return { ok: false, error: "Could not start checkout. Try again." };
  }
}

/** Require a completed, matching checkout before provisioning or changing a plan. */
export async function assertPaidCheckout(opts: {
  sessionId: string | undefined;
  plan: string;
  purpose: CheckoutPurpose;
  hostname?: string;
  currency?: string;
  period?: BillingPeriod;
}): Promise<{ ok: true; session: { id: string } } | { ok: false; error: string }> {
  const sessionId = opts.sessionId?.trim();
  if (!sessionId) {
    return { ok: false, error: "Complete checkout before continuing." };
  }

  if (sessionId.startsWith(FREE_PREFIX)) {
    // Free plan — nothing was charged. A free session is only valid for a free plan.
    if ((priceCents(opts.plan, "SAR") ?? 1) > 0) return { ok: false, error: "Complete checkout before continuing." };
    return { ok: true, session: { id: sessionId } };
  }

  const plan = getPlan(opts.plan);
  if (!plan || !plan.isActive) {
    return { ok: false, error: "Unknown or inactive plan" };
  }
  const { provider } = splitSessionId(sessionId);
  const p = getProvider(provider);
  const currency = ((opts.currency as Currency | undefined) || p?.currencies[0] || "SAR") as Currency;
  const amountCents = priceCents(plan.code, currency, process.env, opts.period ?? "Monthly");
  if (amountCents === undefined) return { ok: false, error: "Unexpected payment currency." };

  const r = await verifySession(sessionId, {
    plan: opts.plan,
    purpose: opts.purpose,
    hostname: opts.hostname,
    amountCents,
    currency,
  });
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, session: { id: r.sessionId! } };
}
