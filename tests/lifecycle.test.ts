import test from "node:test";
import assert from "node:assert/strict";
import { daysLeft, describeLifecycle, inactivityPhrase, mergeLifecycle, type Lifecycle } from "../lib/lifecycle.ts";

const base: Lifecycle = {
  subscription: "s1", site: "acme", site_url: "https://acme.zatgoinnovation.com", site_status: "Active",
  lifecycle_status: "TRIAL", plan: "pro", monthly_price: 49, trial_started_at: "2026-11-06T12:00:00+00:00",
  trial_ends_at: "2026-12-06T12:00:00+00:00", remaining_days: 30, paid_until: null, next_billing_date: null,
  last_activity_at: null, inactive_days: 0, deletion_scheduled_at: null, deletion_hold: false, read_only: false,
};
const at = (iso: string) => Date.parse(iso);

test("countdown rounds up and never goes negative", () => {
  const end = "2026-12-06T12:00:00+00:00";
  assert.equal(daysLeft(end, at("2026-11-06T12:00:00Z")), 30);
  assert.equal(daysLeft(end, at("2026-12-05T13:00:00Z")), 1);
  assert.equal(daysLeft(end, at("2026-12-06T12:00:00Z")), 0);
  assert.equal(daysLeft(end, at("2026-12-20T12:00:00Z")), 0);
  assert.equal(daysLeft(null, 0), null);
  assert.equal(daysLeft("garbage", 0), null);
});

test("timezone offsets do not move the end of the trial", () => {
  // 15:00 in Riyadh (+03:00) is 12:00 UTC.
  assert.equal(daysLeft("2026-12-06T15:00:00+03:00", at("2026-11-06T12:00:00Z")), 30);
  assert.equal(daysLeft("2026-12-06T15:00:00+03:00", at("2026-12-06T12:00:00Z")), 0);
});

test("trial headline and tone", () => {
  const early = describeLifecycle(base, at("2026-11-07T12:00:00Z"));
  assert.equal(early?.label, "Free trial");
  assert.equal(early?.tone, "info");
  assert.match(early!.headline, /29 days left/);
  const late = describeLifecycle(base, at("2026-12-05T13:00:00Z"));
  assert.equal(late?.tone, "warning");
  assert.match(late!.headline, /1 day left/);
  const over = describeLifecycle(base, at("2026-12-06T12:00:01Z"));
  assert.equal(over?.label, "Trial ended");
  assert.equal(over?.canActivate, true);
});

test("each status has a label and a sensible action", () => {
  const cases: Array<[Lifecycle["lifecycle_status"], string, boolean]> = [
    ["ACTIVE", "Active", true], ["EXPIRED", "Read-only", true], ["PENDING_PAYMENT", "Payment due", true],
    ["SUSPENDED", "Suspended", true], ["DELETION_SCHEDULED", "Deletion scheduled", true], ["DELETED", "Deleted", false],
  ];
  for (const [status, label, canActivate] of cases) {
    const d = describeLifecycle({ ...base, lifecycle_status: status, paid_until: "2026-12-01T00:00:00Z", deletion_scheduled_at: "2026-11-20T10:00:00Z" }, 0);
    assert.equal(d?.label, label, status ?? "");
    assert.equal(d?.canActivate, canActivate, status ?? "");
  }
  assert.equal(describeLifecycle(null, 0), null);
  assert.equal(describeLifecycle({ ...base, lifecycle_status: null }, 0), null);
});

test("scheduled deletion shows its date", () => {
  const d = describeLifecycle({ ...base, lifecycle_status: "DELETION_SCHEDULED", deletion_scheduled_at: "2026-11-20T10:00:00Z" }, 0);
  assert.match(d!.headline, /2026-11-20/);
});

test("inactivity phrase", () => {
  assert.equal(inactivityPhrase({ inactive_days: 0.4, last_activity_at: null }), "active today");
  assert.equal(inactivityPhrase({ inactive_days: 1.2, last_activity_at: null }), "no activity for 1 day");
  assert.equal(inactivityPhrase({ inactive_days: 10.9, last_activity_at: null }), "no activity for 10 days");
});

test("lifecycle merges onto site rows by name, without leaking between sites", () => {
  const rows = [{ name: "a", slug: "a" }, { name: "b", slug: "b" }];
  const merged = mergeLifecycle(rows, { a: { ...base, site: "a" } });
  assert.equal(merged[0].lifecycle?.site, "a");
  assert.equal(merged[1].lifecycle, null);
  assert.equal(mergeLifecycle(rows, null)[0].lifecycle, null);
});
