import test from "node:test";
import assert from "node:assert/strict";
import { parseProvisionRequest } from "../lib/provision-request.ts";
import { validateSiteStep } from "../lib/site-step.ts";
import { TRIAL_PLAN_CODE } from "../lib/trial.ts";

const ok = { slug: "acme", adminPassword: "longenough1" };

test("the plan is always the trial plan, whatever the browser sends", () => {
  for (const evil of [
    {},
    { plan: "basic" },
    { plan: "pro", apps: ["frappe"], checkoutSessionId: "free_x", currency: "USD", paymentMethod: "Stripe" },
    { plan: { $ne: null } },
  ]) {
    const r = parseProvisionRequest({ ...ok, ...evil });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.data.plan, TRIAL_PLAN_CODE);
      assert.deepEqual(Object.keys(r.data).sort(), ["adminPassword", "plan", "slug"]); // nothing else leaks through
    }
  }
});

test("a creation request needs no plan, no apps and no payment session", () => {
  assert.equal(parseProvisionRequest(ok).ok, true);
});

test("the slug is trimmed, lower-cased and validated", () => {
  const r = parseProvisionRequest({ ...ok, slug: "  AcMe-1 " });
  assert.equal(r.ok && r.data.slug, "acme-1");
  for (const slug of ["", "-acme", "acme-", "has space", "a_b", "dots.in.name", "x".repeat(64), "ünï"]) {
    assert.equal(parseProvisionRequest({ ...ok, slug }).ok, false, slug);
  }
});

test("the administrator password must be 8 to 128 characters", () => {
  assert.equal(parseProvisionRequest({ ...ok, adminPassword: "short" }).ok, false);
  assert.equal(parseProvisionRequest({ ...ok, adminPassword: "x".repeat(129) }).ok, false);
  assert.equal(parseProvisionRequest({ ...ok, adminPassword: "x".repeat(8) }).ok, true);
  const bad = parseProvisionRequest({ ...ok, adminPassword: "short" });
  assert.match(!bad.ok ? bad.error : "", /at least 8/);
});

test("optional company name and region pass through; junk is rejected", () => {
  const r = parseProvisionRequest({ ...ok, companyName: "Acme Trading", preferredRegion: "ksa-1" });
  assert.equal(r.ok && r.data.companyName, "Acme Trading");
  assert.equal(r.ok && r.data.preferredRegion, "ksa-1");
  assert.equal(parseProvisionRequest({ ...ok, companyName: "" }).ok, false);
  assert.equal(parseProvisionRequest({ ...ok, preferredRegion: 5 }).ok, false);
  assert.equal(parseProvisionRequest(null).ok, false);
  assert.equal(parseProvisionRequest("slug").ok, false);
});

test("the Site step checks name, password length and confirmation in that order", () => {
  assert.match(validateSiteStep({ slug: "Bad Name", password: "longenough1", confirm: "longenough1" })!, /valid site name/);
  assert.match(validateSiteStep({ slug: "acme", password: "short", confirm: "short" })!, /at least 8/);
  assert.match(validateSiteStep({ slug: "acme", password: "longenough1", confirm: "different1" })!, /do not match/);
  assert.equal(validateSiteStep({ slug: " Acme ", password: "longenough1", confirm: "longenough1" }), null);
});

test("the trial plan is Enterprise, the plan that holds every ZatGo app", () => {
  assert.equal(TRIAL_PLAN_CODE, "enterprise");
});
