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

import { getPlan, type SpacePlan } from "./control-plane";
import { getPayment, moyasarConfigured } from "./moyasar";

export type CheckoutPurpose = "provision" | "upgrade";

const FREE_PREFIX = "free_";
const DESC_PREFIX = "space";
const NONE = "-";

export type CheckoutSession = {
  id: string;
  status: "open" | "complete";
  purpose: CheckoutPurpose;
  plan: string;
  planTitle: string;
  currency: "SAR";
  listPriceCents: number;
  amountDueCents: number;
  hostname?: string;
  /** Only present for "open" (paid-plan) sessions — feeds MoyasarCheckout. */
  form?: {
    amount: number;
    currency: "SAR";
    description: string;
    publishableKey: string;
  };
};

export function planListPriceCents(plan: SpacePlan): number {
  if (typeof plan.priceCents === "number") return plan.priceCents;
  const m = plan.mock_price.match(/\$(\d+)/);
  return m ? Number(m[1]) * 100 : 0;
}

export function formatSar(cents: number): string {
  return `${(Math.max(0, cents) / 100).toFixed(2)} SAR`;
}

function buildDescription(purpose: CheckoutPurpose, plan: string, hostname?: string): string {
  return [DESC_PREFIX, purpose, plan, hostname || NONE].join("|");
}

function parseDescription(description: string | undefined): {
  purpose: string;
  plan: string;
  hostname: string;
} | null {
  const parts = (description || "").split("|");
  if (parts.length !== 4 || parts[0] !== DESC_PREFIX) return null;
  return { purpose: parts[1], plan: parts[2], hostname: parts[3] };
}

export async function createCheckoutSession(input: {
  plan: string;
  purpose: CheckoutPurpose;
  hostname?: string;
}): Promise<{ ok: true; session: CheckoutSession } | { ok: false; error: string }> {
  const plan = getPlan(input.plan);
  if (!plan || !plan.isActive) {
    return { ok: false, error: "Unknown or inactive plan" };
  }
  if (input.purpose === "upgrade" && !input.hostname?.trim()) {
    return { ok: false, error: "Hostname required for plan upgrades" };
  }
  const hostname = input.hostname?.trim().toLowerCase() || undefined;
  const amountCents = planListPriceCents(plan);

  if (amountCents <= 0) {
    return {
      ok: true,
      session: {
        id: `${FREE_PREFIX}${crypto.randomUUID()}`,
        status: "complete",
        purpose: input.purpose,
        plan: plan.code,
        planTitle: plan.title,
        currency: "SAR",
        listPriceCents: 0,
        amountDueCents: 0,
        hostname,
      },
    };
  }

  if (!moyasarConfigured()) {
    return { ok: false, error: "Payments are not configured yet. Try again later." };
  }
  const publishableKey = process.env.NEXT_PUBLIC_MOYASAR_PUBLISHABLE_KEY!.trim();

  return {
    ok: true,
    session: {
      id: "", // populated by Moyasar once the form actually creates the payment
      status: "open",
      purpose: input.purpose,
      plan: plan.code,
      planTitle: plan.title,
      currency: "SAR",
      listPriceCents: amountCents,
      amountDueCents: amountCents,
      hostname,
      form: {
        amount: amountCents,
        currency: "SAR",
        description: buildDescription(input.purpose, plan.code, hostname),
        publishableKey,
      },
    },
  };
}

/** Require a completed, matching checkout before provisioning or changing a plan. */
export async function assertPaidCheckout(opts: {
  sessionId: string | undefined;
  plan: string;
  purpose: CheckoutPurpose;
  hostname?: string;
}): Promise<{ ok: true; session: { id: string } } | { ok: false; error: string }> {
  const sessionId = opts.sessionId?.trim();
  if (!sessionId) {
    return { ok: false, error: "Complete checkout before continuing." };
  }

  if (sessionId.startsWith(FREE_PREFIX)) {
    // Free plan — nothing was charged.
    return { ok: true, session: { id: sessionId } };
  }

  if (!moyasarConfigured()) {
    return { ok: false, error: "Payments are not configured yet. Try again later." };
  }

  const plan = getPlan(opts.plan);
  if (!plan || !plan.isActive) {
    return { ok: false, error: "Unknown or inactive plan" };
  }
  const expectedAmountCents = planListPriceCents(plan);

  let payment;
  try {
    payment = await getPayment(sessionId);
  } catch {
    return { ok: false, error: "Checkout payment not found." };
  }

  if (payment.status !== "paid") {
    return { ok: false, error: "Payment not completed. Finish checkout first." };
  }
  if (payment.currency !== "SAR") {
    return { ok: false, error: "Unexpected payment currency." };
  }
  if (payment.amount !== expectedAmountCents) {
    return { ok: false, error: "Payment amount does not match the selected plan." };
  }

  const parsed = parseDescription(payment.description);
  if (!parsed || parsed.plan !== opts.plan || parsed.purpose !== opts.purpose) {
    return { ok: false, error: "Checkout was for a different plan." };
  }
  if (opts.purpose === "upgrade" && opts.hostname && parsed.hostname !== opts.hostname.toLowerCase()) {
    return { ok: false, error: "Checkout was for a different site." };
  }

  return { ok: true, session: { id: payment.id } };
}
