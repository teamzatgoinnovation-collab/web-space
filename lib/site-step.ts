/** Validation of the wizard's "Site" step: the same rules in the browser (instant feedback) and the API route. */

export const SLUG_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
export const MIN_PASSWORD = 8;

export const SLUG_ERROR = "Enter a valid site name (lowercase letters, numbers and hyphens)";
export const PASSWORD_ERROR = `Administrator password must be at least ${MIN_PASSWORD} characters`;

/** Returns the first problem with the Site step, or null when it is fine. */
export function validateSiteStep(input: { slug: string; password: string; confirm: string }): string | null {
  if (!SLUG_RE.test(input.slug.trim().toLowerCase())) return SLUG_ERROR;
  if (input.password.length < MIN_PASSWORD) return PASSWORD_ERROR;
  if (input.password !== input.confirm) return "Passwords do not match";
  return null;
}
