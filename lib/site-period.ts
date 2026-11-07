import { callMethod } from "@/lib/frappe-customer";
import type { BillingPeriod } from "@/lib/payments/pricing";

/**
 * The billing period the PLATFORM has set for a site (Monthly or Yearly). The customer's own session is used, so
 * Frappe also checks that they own the site. Anything unexpected reads as Monthly: the browser never chooses it.
 */
export async function billingPeriodForSite(site: string, sid: string): Promise<BillingPeriod> {
  const lc = await callMethod<{ billing_period?: string } | null>("space.api.lifecycle.get_lifecycle", { site }, sid);
  return lc?.billing_period === "Yearly" ? "Yearly" : "Monthly";
}
