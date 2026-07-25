/**
 * Server-side Moyasar client (KSA payment gateway — used instead of Stripe,
 * which doesn't operate in Saudi Arabia).
 *
 * Moyasar deliberately does not allow creating card payments via the
 * secret-key API — that must happen client-side, from the browser, against
 * Moyasar's own API using the publishable key (their Payment Form widget;
 * see components/MoyasarCheckout.tsx). Raw card data never reaches this
 * server. What this module does is the other half: verify, with the
 * secret key, that a payment the client claims succeeded actually did —
 * status, amount, and currency all re-checked server-side before any
 * provisioning or plan change is allowed to proceed.
 */

const BASE_URL = "https://api.moyasar.com/v1";

export type MoyasarPayment = {
  id: string;
  status: "initiated" | "paid" | "failed" | "authorized" | "captured" | "refunded" | "voided";
  amount: number;
  currency: string;
  description?: string;
  source?: { type?: string };
};

export function moyasarConfigured(): boolean {
  return Boolean(process.env.MOYASAR_SECRET_KEY?.trim() && process.env.NEXT_PUBLIC_MOYASAR_PUBLISHABLE_KEY?.trim());
}

function authHeader(): string {
  const key = process.env.MOYASAR_SECRET_KEY?.trim();
  if (!key) throw new Error("MOYASAR_SECRET_KEY is not configured.");
  return `Basic ${Buffer.from(`${key}:`).toString("base64")}`;
}

export async function getPayment(id: string): Promise<MoyasarPayment> {
  const res = await fetch(`${BASE_URL}/payments/${encodeURIComponent(id)}`, {
    headers: { Authorization: authHeader() },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Moyasar payment lookup failed (${res.status})`);
  }
  return (await res.json()) as MoyasarPayment;
}
