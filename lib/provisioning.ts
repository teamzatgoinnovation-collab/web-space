/**
 * Provisioning step model — derived entirely from the real checkpoints
 * space_cloud.jobs.provision.run_create_site() reports via progress(pct, msg):
 * 5% validate, 15% dns, 25% create_site (the long one — bench new-site),
 * 80% basic_setup, 85% migrate, 95% finalize, 100% done. No timers, no
 * invented percentages: a step is "running" iff the job's real progress
 * falls inside its range, "completed" iff progress has passed it.
 */

export type StepState = "pending" | "running" | "completed" | "failed";

export type ProvisioningStep = {
  id: string;
  label: string;
  description: string;
  /** Real backend checkpoint this step starts at (see progress() calls above). */
  at: number;
};

export const PROVISIONING_STEPS: ProvisioningStep[] = [
  {
    id: "validate",
    label: "Validating your plan",
    description: "Checking your plan and subscription are active.",
    at: 5,
  },
  {
    id: "dns",
    label: "Connecting your subdomain",
    description: "Reserving your site name and checking it's available.",
    at: 15,
  },
  {
    id: "create_site",
    label: "Creating your ERPNext site",
    description: "Creating the site database and initializing Frappe. This is the longest step.",
    at: 25,
  },
  {
    id: "ssl",
    label: "Securing your site",
    description: "Issuing an SSL certificate for your domain.",
    at: 30,
  },
  {
    id: "basic_setup",
    label: "Configuring your company",
    description: "Setting up your company, default warehouse, and fiscal year.",
    at: 80,
  },
  {
    id: "migrate",
    label: "Running final migrations",
    description: "Applying database migrations and clearing cache.",
    at: 85,
  },
  {
    id: "finalize",
    label: "Finishing setup",
    description: "Recording installed apps and finalizing your site.",
    at: 95,
  },
];

export type DerivedStep = ProvisioningStep & { state: StepState };

export type JobStatus = "queued" | "running" | "succeeded" | "failed" | string;

export function deriveSteps(progress: number, status: JobStatus): DerivedStep[] {
  const clamped = Number.isFinite(progress) ? Math.max(0, Math.min(100, progress)) : 0;
  return PROVISIONING_STEPS.map((step, i) => {
    const next = PROVISIONING_STEPS[i + 1];
    const inRange = clamped >= step.at && (!next || clamped < next.at);

    if (status === "succeeded") return { ...step, state: "completed" as const };

    if (status === "failed") {
      if (inRange || (i === PROVISIONING_STEPS.length - 1 && clamped >= step.at)) {
        return { ...step, state: "failed" as const };
      }
      return { ...step, state: clamped > step.at ? ("completed" as const) : ("pending" as const) };
    }

    if (clamped > step.at && !inRange) return { ...step, state: "completed" as const };
    if (inRange || (status === "queued" && i === 0)) return { ...step, state: "running" as const };
    return { ...step, state: "pending" as const };
  });
}

/** The step currently failed or running, for "Stopped at: X" / "Currently: X" messaging. */
export function activeStep(steps: DerivedStep[]): DerivedStep | null {
  return steps.find((s) => s.state === "failed") || steps.find((s) => s.state === "running") || null;
}

export type ActivityEntry = { progress: number; message: string };

/** Parses job.output ("[5%] Validating plan and subscription\n[15%] ...") into
 * structured entries. No fabricated timestamps — the backend only tracks
 * percentage checkpoints, not per-line wall-clock times, so we don't invent one. */
export function parseActivity(output: string | null | undefined): ActivityEntry[] {
  if (!output) return [];
  const entries: ActivityEntry[] = [];
  for (const line of output.split("\n")) {
    const m = line.match(/^\[(\d+)%\]\s*(.+)$/);
    if (m) {
      entries.push({ progress: Number(m[1]), message: m[2].trim() });
    } else if (line.trim() && !line.trim().startsWith("WARN")) {
      // "Done" and similar terminal lines with no [pct%] prefix.
      entries.push({ progress: 100, message: line.trim() });
    }
  }
  return entries;
}

export function formatElapsed(startedAt: string | null | undefined): string | null {
  if (!startedAt) return null;
  const start = new Date(startedAt.replace(" ", "T") + "Z").getTime();
  if (!Number.isFinite(start)) return null;
  const ms = Date.now() - start;
  if (ms < 0) return null;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.floor((ms % 60_000) / 1000);
  if (mins <= 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}
