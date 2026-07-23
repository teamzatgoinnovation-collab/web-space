import { randomUUID } from "node:crypto";

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

const jobs = new Map<string, Job>();
const MAX_JOBS = 50;
const MAX_LOG_LINES = 5000;

function touch(job: Job) {
  job.updatedAt = Date.now();
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
  jobs.set(job.id, job);
  if (jobs.size > MAX_JOBS) {
    const sorted = [...jobs.values()].sort((a, b) => a.createdAt - b.createdAt);
    while (sorted.length > MAX_JOBS) {
      const old = sorted.shift();
      if (old) jobs.delete(old.id);
    }
  }
  return job;
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

export function appendLog(id: string, line: string) {
  const job = jobs.get(id);
  if (!job) return;
  for (const l of line.split("\n")) job.log.push(l);
  if (job.log.length > MAX_LOG_LINES) job.log = job.log.slice(-MAX_LOG_LINES);
  touch(job);
}

export function startStage(id: string, stageId: string, label: string) {
  const job = jobs.get(id);
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
  const job = jobs.get(id);
  if (!job) return;
  const stage = job.stages.find((s) => s.id === stageId);
  if (stage) stage.status = status;
  else job.stages.push({ id: stageId, label: stageId, status });
  touch(job);
}

export function setJobStatus(id: string, status: JobStatus, error?: string) {
  const job = jobs.get(id);
  if (!job) return;
  job.status = status;
  if (error) job.error = error;
  touch(job);
}

export function setJobResult(id: string, result: Job["result"]) {
  const job = jobs.get(id);
  if (!job) return;
  job.result = result;
  touch(job);
}
