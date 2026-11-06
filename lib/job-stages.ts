/**
 * Turns a Space Deployment Job (progress %, checkpoint output, optional timeline)
 * into the visible install tasks. Pure and dependency-free so it can be unit
 * tested against real job outputs.
 *
 * Checkpoints come from space_cloud/jobs/provision.py: "[25%] Creating site ...".
 * Raw bench output (hundreds of "Updating DocTypes ..." lines) and WARN details
 * can contain internal paths and server details, so customers only ever get the
 * checkpoint lines and a generic note per warning; admins also get the raw lines.
 */

export type StageId = "validate" | "dns" | "site" | "certificate" | "apps" | "finish";
export type StageStatus = "pending" | "running" | "succeeded" | "failed" | "skipped";
export type JobState = "queued" | "running" | "succeeded" | "failed";

export type TimelineEntry = { at: string; event?: string; detail?: string; progress?: number };

export type JobInput = {
  status: string;
  progress?: number;
  output?: string;
  startedAt?: string;
  finishedAt?: string;
  /** Frappe's own `modified` time: same clock as startedAt, so safe to subtract (unlike Date.now()). */
  modifiedAt?: string;
  timeline?: TimelineEntry[];
};

export const STAGES: { id: StageId; label: string; hint: string }[] = [
  { id: "validate", label: "Checking your site name", hint: "Making sure the name and plan are valid." },
  { id: "dns", label: "Connecting your subdomain", hint: "Pointing your address at the platform." },
  { id: "site", label: "Creating your ERPNext site", hint: "Setting up the database and base system. This is the longest step." },
  { id: "certificate", label: "Securing with HTTPS", hint: "Issuing a certificate so your site opens securely." },
  { id: "apps", label: "Installing selected apps", hint: "Adding the apps included in your plan." },
  { id: "finish", label: "Finishing setup", hint: "Company defaults, database upgrade and final checks." },
];

export type DerivedStage = {
  id: StageId;
  label: string;
  hint: string;
  status: StageStatus;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  /** Safe checkpoint lines that belong to this stage. */
  log: string[];
};

export type LogLine = { level: "info" | "warn" | "error"; text: string; stage?: StageId };

const CHECKPOINT = /^\[(\d+)%\]\s*(.*)$/;

function stageForPct(pct: number): StageId {
  if (pct <= 5) return "validate";
  if (pct <= 15) return "dns";
  if (pct <= 25) return "site";
  if (pct <= 30) return "certificate";
  if (pct < 80) return "apps";
  return "finish";
}

export function normalizeState(status: string): JobState {
  const s = status.toLowerCase();
  if (s === "succeeded") return "succeeded";
  if (s === "failed") return "failed";
  if (s === "running") return "running";
  return "queued";
}

type Checkpoint = { pct: number; msg: string; stage: StageId; at?: string };

function parseCheckpoints(job: JobInput): Checkpoint[] {
  const times = new Map<number, string>();
  for (const t of job.timeline || []) {
    if (typeof t.progress === "number" && t.at && t.event === "progress") times.set(t.progress, t.at);
  }
  const out: Checkpoint[] = [];
  for (const line of (job.output || "").split("\n")) {
    const m = CHECKPOINT.exec(line.trim());
    if (!m) continue;
    const pct = Number(m[1]);
    out.push({ pct, msg: m[2], stage: stageForPct(pct), at: times.get(pct) });
  }
  return out;
}

function ms(iso?: string): number | undefined {
  if (!iso) return undefined;
  const t = Date.parse(iso.includes("T") ? iso : iso.replace(" ", "T"));
  return Number.isNaN(t) ? undefined : t;
}

export function deriveStages(job: JobInput): DerivedStage[] {
  const state = normalizeState(job.status);
  const cps = parseCheckpoints(job);
  const order = STAGES.map((s) => s.id);
  const reached = cps.length ? Math.max(...cps.map((c) => order.indexOf(c.stage))) : -1;

  return STAGES.map((def, i) => {
    const mine = cps.filter((c) => c.stage === def.id);
    let status: StageStatus = "pending";
    if (state === "succeeded") status = mine.length ? "succeeded" : "skipped";
    else if (reached < 0) status = "pending";
    else if (i < reached) status = mine.length ? "succeeded" : "skipped";
    else if (i === reached) status = state === "failed" ? "failed" : "running";

    const startedAt = mine.find((c) => c.at)?.at;
    const next = cps.find((c) => order.indexOf(c.stage) > i && c.at);
    const finishedAt =
      status === "succeeded" ? next?.at ?? job.finishedAt : status === "failed" ? job.finishedAt : undefined;
    const a = ms(startedAt);
    const b = ms(finishedAt);
    return {
      ...def,
      status,
      startedAt,
      finishedAt,
      durationMs: a !== undefined && b !== undefined && b >= a ? b - a : undefined,
      log: mine.map((c) => c.msg),
    };
  });
}

/** Overall percent from the real backend progress (never faked from elapsed time). */
export function overallPercent(job: JobInput): number {
  const state = normalizeState(job.status);
  if (state === "succeeded") return 100;
  const cps = parseCheckpoints(job);
  const fromOutput = cps.length ? Math.max(...cps.map((c) => c.pct)) : 0;
  return Math.min(99, Math.max(0, job.progress ?? 0, fromOutput));
}

export function elapsedMs(job: JobInput, now = Date.now()): number | undefined {
  const a = ms(job.startedAt);
  if (a === undefined) return undefined;
  // Frappe timestamps carry no timezone and may not match this server's clock, so
  // prefer finishedAt, then the job's own last-modified time, over Date.now().
  const b = ms(job.finishedAt) ?? ms(job.modifiedAt) ?? now;
  return Math.max(0, b - a);
}

/**
 * The log shown to people. Customers: checkpoint lines plus a generic notice per
 * WARN. Admins (admin=true): every raw line, including bench output.
 */
export function logLines(job: JobInput, opts: { admin?: boolean } = {}): LogLine[] {
  const lines: LogLine[] = [];
  let stage: StageId | undefined;
  for (const raw of (job.output || "").split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;
    const cp = CHECKPOINT.exec(line.trim());
    if (cp) {
      stage = stageForPct(Number(cp[1]));
      lines.push({ level: "info", text: line.trim(), stage });
    } else if (/^WARN\b/.test(line)) {
      const what = /^WARN\s+([a-z ]+?)(?::|$)/i.exec(line)?.[1]?.trim() || "a step";
      lines.push({
        level: "warn",
        text: opts.admin ? line : `Notice: ${what} reported a warning but setup continued.`,
        stage,
      });
    } else if (opts.admin) {
      lines.push({ level: "info", text: line, stage });
    }
  }
  return lines;
}
