import type { Currency } from "./types.ts";

export const CURRENCIES: Currency[] = ["SAR", "INR", "USD"];

/**
 * Fixed price per currency, in minor units (halalas / paise / cents) per month.
 * PLACEHOLDER VALUES for INR and USD — confirm real prices before going live.
 * Override without a deploy via the PLAN_PRICES_JSON env var, e.g.
 * {"pro":{"SAR":4900,"INR":99900,"USD":1300}}.
 */
const DEFAULT_PRICES: Record<string, Partial<Record<Currency, number>>> = {
  basic: { SAR: 0, INR: 0, USD: 0 },
  pro: { SAR: 4900, INR: 99900, USD: 1300 },
  enterprise: { SAR: 19900, INR: 399900, USD: 5300 },
};

export const CURRENCY_SYMBOL: Record<Currency, string> = { SAR: "SAR", INR: "₹", USD: "$" };

function overrides(env: Record<string, string | undefined>) {
  try {
    return JSON.parse(env.PLAN_PRICES_JSON || "{}") as typeof DEFAULT_PRICES;
  } catch {
    return {};
  }
}

/** Price in minor units, or undefined when the plan has no price in that currency. */
export function priceCents(
  planCode: string,
  currency: Currency,
  env: Record<string, string | undefined> = process.env,
): number | undefined {
  const v = overrides(env)[planCode]?.[currency] ?? DEFAULT_PRICES[planCode]?.[currency];
  return typeof v === "number" && v >= 0 ? v : undefined;
}

export function formatMoney(cents: number, currency: Currency): string {
  const n = (Math.max(0, cents) / 100).toFixed(2);
  return currency === "SAR" ? `${n} SAR` : `${CURRENCY_SYMBOL[currency]}${n}`;
}

/** Best default currency for a browser locale (client hint only; server re-checks). */
export function currencyForLocale(locale: string | undefined): Currency {
  const l = (locale || "").toLowerCase();
  if (l.endsWith("-in") || l.startsWith("hi")) return "INR";
  if (l.endsWith("-sa") || l.startsWith("ar")) return "SAR";
  return "USD";
}
