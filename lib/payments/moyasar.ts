import { bindingMatches, buildBinding, defaultDeps, type Deps, type PaymentProvider } from "./types.ts";

const BASE_URL = "https://api.moyasar.com/v1";

function configured(deps: Deps): boolean {
  return Boolean(deps.env.MOYASAR_SECRET_KEY?.trim() && deps.env.NEXT_PUBLIC_MOYASAR_PUBLISHABLE_KEY?.trim());
}

export const moyasar: PaymentProvider = {
  id: "moyasar",
  label: "Card / mada",
  methods: ["Visa", "Mastercard", "mada"],
  currencies: ["SAR"],

  isConfigured: (deps = defaultDeps()) => configured(deps),

  async createCheckout(ctx, deps = defaultDeps()) {
    return {
      amount: ctx.amountCents,
      currency: ctx.currency,
      description: buildBinding(ctx),
      publishableKey: deps.env.NEXT_PUBLIC_MOYASAR_PUBLISHABLE_KEY!.trim(),
    };
  },

  async verify(paymentId, expected, deps = defaultDeps()) {
    if (!configured(deps)) return { ok: false, error: "Payments are not configured yet. Try again later." };
    let payment: { id: string; status: string; amount: number; currency: string; description?: string };
    try {
      const res = await deps.fetch(`${BASE_URL}/payments/${encodeURIComponent(paymentId)}`, {
        headers: { Authorization: `Basic ${Buffer.from(`${deps.env.MOYASAR_SECRET_KEY!.trim()}:`).toString("base64")}` },
        cache: "no-store",
      });
      if (!res.ok) return { ok: false, error: "Checkout payment not found." };
      payment = await res.json();
    } catch {
      return { ok: false, error: "Checkout payment not found." };
    }
    if (payment.status !== "paid") return { ok: false, error: "Payment not completed. Finish checkout first." };
    if (payment.currency !== expected.currency) return { ok: false, error: "Unexpected payment currency." };
    if (payment.amount !== expected.amountCents) {
      return { ok: false, error: "Payment amount does not match the selected plan." };
    }
    if (!bindingMatches(payment.description, expected)) {
      return { ok: false, error: "Checkout was for a different plan or site." };
    }
    return { ok: true, paymentId: payment.id };
  },
};
