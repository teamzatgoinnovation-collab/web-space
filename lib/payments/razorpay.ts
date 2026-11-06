import { createHmac, timingSafeEqual } from "node:crypto";
import { bindingMatches, buildBinding, defaultDeps, type Deps, type PaymentProvider } from "./types.ts";

const BASE_URL = "https://api.razorpay.com/v1";

function keys(deps: Deps) {
  const id = deps.env.RAZORPAY_KEY_ID?.trim();
  const secret = deps.env.RAZORPAY_KEY_SECRET?.trim();
  return id && secret ? { id, secret } : null;
}

const basic = (k: { id: string; secret: string }) =>
  `Basic ${Buffer.from(`${k.id}:${k.secret}`).toString("base64")}`;

export function signatureOk(orderId: string, paymentId: string, signature: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const razorpay: PaymentProvider = {
  id: "razorpay",
  label: "UPI, cards, netbanking, wallets",
  methods: ["UPI", "Card", "Netbanking", "Wallets"],
  currencies: ["INR"],

  isConfigured: (deps = defaultDeps()) => Boolean(keys(deps)),

  async createCheckout(ctx, deps = defaultDeps()) {
    const k = keys(deps);
    if (!k) throw new Error("Razorpay is not configured.");
    const res = await deps.fetch(`${BASE_URL}/orders`, {
      method: "POST",
      headers: { Authorization: basic(k), "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: ctx.amountCents,
        currency: ctx.currency,
        receipt: `sp_${Date.now().toString(36)}`,
        notes: { space: buildBinding(ctx) },
      }),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Razorpay order failed (${res.status})`);
    const order = (await res.json()) as { id: string };
    return { orderId: order.id, keyId: k.id, amount: ctx.amountCents, currency: ctx.currency, name: "ZatGo Space" };
  },

  /** payload = `<payment_id>.<order_id>.<signature>` as returned by Razorpay Checkout. */
  async verify(payload, expected, deps = defaultDeps()) {
    const k = keys(deps);
    if (!k) return { ok: false, error: "Payments are not configured yet. Try again later." };
    const [paymentId, orderId, signature] = payload.split(".");
    if (!paymentId || !orderId || !signature) return { ok: false, error: "Checkout payment not found." };
    if (!signatureOk(orderId, paymentId, signature, k.secret)) {
      return { ok: false, error: "Payment signature is invalid." };
    }
    try {
      const [pr, or] = await Promise.all([
        deps.fetch(`${BASE_URL}/payments/${encodeURIComponent(paymentId)}`, { headers: { Authorization: basic(k) }, cache: "no-store" }),
        deps.fetch(`${BASE_URL}/orders/${encodeURIComponent(orderId)}`, { headers: { Authorization: basic(k) }, cache: "no-store" }),
      ]);
      if (!pr.ok || !or.ok) return { ok: false, error: "Checkout payment not found." };
      const payment = (await pr.json()) as { id: string; status: string; amount: number; currency: string; order_id: string };
      const order = (await or.json()) as { amount: number; currency: string; notes?: { space?: string } };
      if (payment.order_id !== orderId) return { ok: false, error: "Payment does not belong to this order." };
      if (payment.status !== "captured") return { ok: false, error: "Payment not completed. Finish checkout first." };
      if (payment.currency !== expected.currency || order.currency !== expected.currency) {
        return { ok: false, error: "Unexpected payment currency." };
      }
      if (payment.amount !== expected.amountCents || order.amount !== expected.amountCents) {
        return { ok: false, error: "Payment amount does not match the selected plan." };
      }
      if (!bindingMatches(order.notes?.space, expected)) {
        return { ok: false, error: "Checkout was for a different plan or site." };
      }
      return { ok: true, paymentId: payment.id };
    } catch {
      return { ok: false, error: "Could not verify the payment. Try again." };
    }
  },
};
