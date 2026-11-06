/**
 * Payment provider contract. Each provider verifies a payment server-side with
 * its own secret key — nothing here trusts a client-asserted success.
 */

export type Currency = "SAR" | "INR" | "USD";
export type ProviderId = "moyasar" | "razorpay" | "stripe" | "paypal";
export type PaymentPurpose = "provision" | "upgrade";

/** What a verified payment must match: the plan being bought, for whom, how much. */
export type Expected = {
  plan: string;
  purpose: PaymentPurpose;
  hostname?: string;
  amountCents: number;
  currency: Currency;
};

export type VerifyResult = { ok: true; paymentId: string } | { ok: false; error: string };

export type Deps = {
  fetch: typeof fetch;
  env: Record<string, string | undefined>;
};

export type CheckoutContext = {
  plan: string;
  purpose: PaymentPurpose;
  hostname?: string;
  amountCents: number;
  currency: Currency;
};

export interface PaymentProvider {
  id: ProviderId;
  label: string;
  /** Payment methods shown to the customer (UPI, card, ...). */
  methods: string[];
  currencies: Currency[];
  isConfigured(deps?: Deps): boolean;
  /** Server step before the browser opens the provider's UI. */
  createCheckout(ctx: CheckoutContext, deps?: Deps): Promise<Record<string, unknown>>;
  /** `payload` is the provider-specific part of the session id the browser returns. */
  verify(payload: string, expected: Expected, deps?: Deps): Promise<VerifyResult>;
}

export const defaultDeps = (): Deps => ({ fetch: (...a) => fetch(...a), env: process.env });

/** The plan/purpose/host binding carried inside every provider's own record. */
export function buildBinding(ctx: Pick<CheckoutContext, "plan" | "purpose" | "hostname">): string {
  return ["space", ctx.purpose, ctx.plan, ctx.hostname || "-"].join("|");
}

export function bindingMatches(binding: string | undefined, expected: Expected): boolean {
  const parts = (binding || "").split("|");
  if (parts.length !== 4 || parts[0] !== "space") return false;
  if (parts[1] !== expected.purpose || parts[2] !== expected.plan) return false;
  if (expected.purpose === "upgrade" && expected.hostname) {
    return parts[3] === expected.hostname.toLowerCase();
  }
  return true;
}
