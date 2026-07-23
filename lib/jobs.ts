import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export type JobStatus = "queued" | "running" | "succeeded" | "failed";
export type JobStageStatus = "pending" | "running" | "succeeded" | "failed" | "skipped";

export type JobStage = {
  id: string;
  label: string;
  status: JobStageStatus;
};

export type Job = {
  id: string;
  kind: string;
  status: JobStatus;
  createdAt: number;
  updatedAt: number;
  log: string[];
  stages: JobStage[];
  meta?: Record<string, string>;
  error?: string;
  result?: { deskUrl?: string; hostname?: string; orderName?: string };
};

const MAX_JOBS = 50;
const MAX_LOG_LINES = 5000;

type JobStore = {
  memory: Map<string, Job>;
};

/** Survive Next.js HMR / separate route module loads via globalThis + disk. */
function store(): JobStore {
  const g = globalThis as typeof globalThis & { __zatgoSpaceJobs?: JobStore };
  if (!g.__zatgoSpaceJobs) {
    g.__zatgoSpaceJobs = { memory: new Map() };
  }
  return g.__zatgoSpaceJobs;
}

function jobsDir(): string {
  return path.join(process.cwd(), "data", "jobs");
}

function jobPath(id: string): string {
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    throw new Error("Invalid job id");
  }
  return path.join(jobsDir(), `${id}.json`);
}

function ensureDir() {
  fs.mkdirSync(jobsDir(), { recursive: true });
}

function persist(job: Job) {
  ensureDir();
  // Don't write huge logs to disk forever — keep last lines for ops
  const toWrite: Job = {
    ...job,
    log: job.log.slice(-MAX_LOG_LINES),
  };
  fs.writeFileSync(jobPath(job.id), JSON.stringify(toWrite), "utf8");
  store().memory.set(job.id, job);
  trimJobs();
}

function touch(job: Job) {
  job.updatedAt = Date.now();
  persist(job);
}

function trimJobs() {
  const mem = store().memory;
  if (mem.size <= MAX_JOBS) {
    // also trim disk if needed
    try {
      ensureDir();
      const files = fs
        .readdirSync(jobsDir())
        .filter((f) => f.endsWith(".json"))
        .map((f) => {
          const full = path.join(jobsDir(), f);
          return { full, mtime: fs.statSync(full).mtimeMs };
        })
        .sort((a, b) => a.mtime - b.mtime);
      while (files.length > MAX_JOBS) {
        const old = files.shift();
        if (old) fs.unlinkSync(old.full);
      }
    } catch {
      // ignore
    }
    return;
  }
  const sorted = [...mem.values()].sort((a, b) => a.createdAt - b.createdAt);
  while (sorted.length > MAX_JOBS) {
    const old = sorted.shift();
    if (!old) break;
    mem.delete(old.id);
    try {
      fs.unlinkSync(jobPath(old.id));
    } catch {
      // ignore
    }
  }
}

export function createJob(kind: string, meta?: Record<string, string>): Job {
  const job: Job = {
    id: randomUUID(),
    kind,
    status: "queued",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    log: [],
    stages: [],
    meta,
  };
  persist(job);
  return job;
}

export function getJob(id: string): Job | undefined {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return undefined;
  const mem = store().memory.get(id);
  if (mem) return mem;
  try {
    const raw = fs.readFileSync(jobPath(id), "utf8");
    const job = JSON.parse(raw) as Job;
    store().memory.set(id, job);
    return job;
  } catch {
    return undefined;
  }
}

export function appendLog(id: string, line: string) {
  const job = getJob(id);
  if (!job) return;
  for (const l of line.split("\n")) job.log.push(l);
  if (job.log.length > MAX_LOG_LINES) {
    job.log = job.log.slice(-MAX_LOG_LINES);
  }
  touch(job);
}

export function startStage(id: string, stageId: string, label: string) {
  const job = getJob(id);
  if (!job) return;
  const existing = job.stages.find((s) => s.id === stageId);
  if (existing) {
    existing.label = label;
    existing.status = "running";
  } else {
    job.stages.push({ id: stageId, label, status: "running" });
  }
  if (job.status === "queued") job.status = "running";
  touch(job);
}

export function finishStage(
  id: string,
  stageId: string,
  status: Extract<JobStageStatus, "succeeded" | "failed" | "skipped">,
) {
  const job = getJob(id);
  if (!job) return;
  const stage = job.stages.find((s) => s.id === stageId);
  if (stage) stage.status = status;
  else job.stages.push({ id: stageId, label: stageId, status });
  touch(job);
}

export function setJobStatus(id: string, status: JobStatus, error?: string) {
  const job = getJob(id);
  if (!job) return;
  job.status = status;
  if (error) job.error = error;
  touch(job);
}

export function setJobResult(id: string, result: Job["result"]) {
  const job = getJob(id);
  if (!job) return;
  job.result = result;
  touch(job);
}
