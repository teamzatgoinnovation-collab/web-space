import assert from "node:assert/strict";
import { test } from "node:test";
import { deriveStages, elapsedMs, logLines, overallPercent } from "../lib/job-stages.ts";

// Shape of a real successful run (qa-space-two / qa-pay-free): checkpoints, a WARN, raw bench noise.
const OK_OUTPUT = [
  "[5%] Validating plan and subscription",
  "[15%] Checking DNS / hostname",
  "[25%] Creating site qa-pay-free.zatgoinnovation.com",
  "[30%] Provisioning SSL certificate",
  "WARN ssl: Space Agent SSL error (400): invalid domain: 'qa-pay-free.zatgoinnovation.com'",
  "[40%] Installing app zatgo_core",
  "WARN install zatgo_core: App erpnext already installed",
  "",
  "Installing zatgo_core...",
  "Updating DocTypes for zatgo_core    : [=         ] 3%",
  "[80%] Running basic setup (company, warehouse, fiscal year)",
  "[85%] Migrating / clearing cache",
  "[95%] Recording installed apps",
  "Done",
].join("\n");

const statuses = (job: Parameters<typeof deriveStages>[0]) => deriveStages(job).map((s) => s.status);

test("succeeded job: every stage with a checkpoint is succeeded", () => {
  assert.deepEqual(statuses({ status: "Succeeded", progress: 100, output: OK_OUTPUT }), [
    "succeeded", "succeeded", "succeeded", "succeeded", "succeeded", "succeeded",
  ]);
  assert.equal(overallPercent({ status: "Succeeded", progress: 100, output: OK_OUTPUT }), 100);
});

test("running job: earlier stages done, current running, later pending", () => {
  const out = "[5%] a\n[15%] b\n[25%] Creating site x";
  assert.deepEqual(statuses({ status: "Running", progress: 25, output: out }), [
    "succeeded", "succeeded", "running", "pending", "pending", "pending",
  ]);
  assert.equal(overallPercent({ status: "Running", progress: 25, output: out }), 25);
});

test("failed at 25%: that stage failed, earlier done, later pending (real failed job shape)", () => {
  const out = "[5%] Validating plan and subscription\n[15%] Checking DNS / hostname\n[25%] Creating site qa-space-test.zatgoinnovation.com";
  assert.deepEqual(statuses({ status: "Failed", progress: 25, output: out }), [
    "succeeded", "succeeded", "failed", "pending", "pending", "pending",
  ]);
});

test("a stage skipped by the plan (no apps checkpoint) shows skipped once later stages are reached", () => {
  const out = "[5%] a\n[15%] b\n[25%] c\n[30%] d\n[80%] Running basic setup";
  assert.deepEqual(statuses({ status: "Running", progress: 80, output: out }), [
    "succeeded", "succeeded", "succeeded", "succeeded", "skipped", "running",
  ]);
});

test("queued / empty job: everything pending, 0 percent", () => {
  assert.deepEqual(statuses({ status: "Queued", progress: 0, output: "" }), Array(6).fill("pending"));
  assert.equal(overallPercent({ status: "Queued" }), 0);
  assert.equal(overallPercent({ status: "Running", progress: 150 }), 99); // never 100 until succeeded
});

test("durations come from the timeline when present, and are absent when not", () => {
  const timeline = [
    { at: "2026-11-06 06:00:00", event: "progress", progress: 5 },
    { at: "2026-11-06 06:00:10", event: "progress", progress: 15 },
    { at: "2026-11-06 06:00:40", event: "progress", progress: 25 },
  ];
  const s = deriveStages({
    status: "Running",
    progress: 25,
    output: "[5%] a\n[15%] b\n[25%] c",
    timeline,
  });
  assert.equal(s[0].durationMs, 10_000);
  assert.equal(s[1].durationMs, 30_000);
  assert.equal(s[2].durationMs, undefined); // still running
  assert.equal(deriveStages({ status: "Succeeded", output: OK_OUTPUT })[0].durationMs, undefined);
});

test("elapsed uses finishedAt when done, now when running", () => {
  assert.equal(elapsedMs({ status: "Succeeded", startedAt: "2026-11-06 06:00:00", finishedAt: "2026-11-06 06:01:00" }), 60_000);
  assert.equal(elapsedMs({ status: "Running", startedAt: "2026-11-06 06:00:00" }, Date.parse("2026-11-06T06:00:30")), 30_000);
  assert.equal(elapsedMs({ status: "Queued" }), undefined);
});

test("customer log: checkpoints and generic warnings only; no raw bench output or internals", () => {
  const text = logLines({ status: "Succeeded", output: OK_OUTPUT }).map((l) => l.text).join("\n");
  assert.match(text, /\[25%\] Creating site/);
  assert.match(text, /Notice: ssl reported a warning/);
  assert.doesNotMatch(text, /Space Agent|invalid domain|Updating DocTypes|Installing zatgo_core\.\.\./);
  assert.doesNotMatch(text, /Done/);
});

test("admin log: includes raw WARN text and bench output", () => {
  const text = logLines({ status: "Succeeded", output: OK_OUTPUT }, { admin: true }).map((l) => l.text).join("\n");
  assert.match(text, /Space Agent SSL error/);
  assert.match(text, /Updating DocTypes/);
});

test("log lines are attributed to the stage of the latest checkpoint", () => {
  const lines = logLines({ status: "Succeeded", output: OK_OUTPUT });
  assert.equal(lines.find((l) => l.text.startsWith("Notice: ssl"))?.stage, "certificate");
});

test("elapsed for a running job uses the job's own modified time, not this machine's clock", () => {
  const job = { status: "Running", startedAt: "2026-11-06 06:00:00", modifiedAt: "2026-11-06 06:00:45" };
  // `now` is hours away (different timezone) and must not matter.
  assert.equal(elapsedMs(job, Date.parse("2026-11-06T03:00:00")), 45_000);
  assert.equal(elapsedMs(job, Date.parse("2026-11-06T09:00:00")), 45_000);
});
