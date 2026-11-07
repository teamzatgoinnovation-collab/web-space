import { z } from "zod";
import { MIN_PASSWORD, PASSWORD_ERROR, SLUG_ERROR, SLUG_RE } from "./site-step.ts";
import { TRIAL_PLAN_CODE } from "./trial.ts";

/**
 * What the site-creation API accepts. The browser sends only the site name, the administrator password and two
 * optional details; the PLAN is decided here (the trial plan) and anything else a client sends -- plan, apps, payment
 * session -- is dropped, never trusted.
 */
const Body = z.object({
  slug: z.string().min(1).max(63),
  adminPassword: z.string().min(MIN_PASSWORD, PASSWORD_ERROR).max(128, "Administrator password is too long"),
  preferredRegion: z.string().min(1).max(64).optional(),
  companyName: z.string().min(1).max(140).optional(),
});

export type ProvisionRequest = {
  slug: string;
  adminPassword: string;
  plan: string;
  preferredRegion?: string;
  companyName?: string;
};

export function parseProvisionRequest(json: unknown): { ok: true; data: ProvisionRequest } | { ok: false; error: string } {
  const parsed = Body.safeParse(json);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message || "Invalid request" };
  const slug = parsed.data.slug.trim().toLowerCase();
  if (!SLUG_RE.test(slug)) return { ok: false, error: SLUG_ERROR };
  const { preferredRegion, companyName } = parsed.data;
  return {
    ok: true,
    data: {
      slug,
      adminPassword: parsed.data.adminPassword,
      plan: TRIAL_PLAN_CODE,
      ...(preferredRegion ? { preferredRegion } : {}),
      ...(companyName ? { companyName } : {}),
    },
  };
}
