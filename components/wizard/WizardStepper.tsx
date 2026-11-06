"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  steps: readonly string[];
  current: number;
  /** Steps before this index can be revisited; later ones cannot. */
  canGoTo?: (index: number) => boolean;
  onGoTo?: (index: number) => void;
};

/** Numbered stepper: done steps show a check and (when allowed) go back on click. */
export function WizardStepper({ steps, current, canGoTo, onGoTo }: Props) {
  const pct = steps.length > 1 ? (current / (steps.length - 1)) * 100 : 0;
  return (
    <nav aria-label="Progress" className="mb-8">
      {/* Mobile: compact label + bar */}
      <div className="sm:hidden">
        <p className="text-sm font-medium text-foreground">
          Step {current + 1} of {steps.length} · <span className="text-primary">{steps[current]}</span>
        </p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary" role="presentation">
          <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${((current + 1) / steps.length) * 100}%` }} />
        </div>
      </div>

      {/* Desktop: circles joined by a line */}
      <ol className="relative hidden sm:flex">
        <div className="absolute top-4 right-8 left-8 h-0.5 bg-border" aria-hidden="true">
          <div className="h-full bg-primary transition-all duration-300" style={{ width: `${pct}%` }} />
        </div>
        {steps.map((label, i) => {
          const done = i < current;
          const active = i === current;
          const clickable = done && (canGoTo ? canGoTo(i) : true) && Boolean(onGoTo);
          const circle = (
            <span
              className={cn(
                "relative z-10 flex size-8 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors",
                done && "border-primary bg-primary text-primary-foreground",
                active && "border-primary bg-background text-primary ring-4 ring-primary/15",
                !done && !active && "border-border bg-background text-muted-foreground",
              )}
            >
              {done ? <Check className="size-4" aria-hidden="true" /> : i + 1}
            </span>
          );
          return (
            <li key={label} className="flex flex-1 flex-col items-center gap-2" aria-current={active ? "step" : undefined}>
              {clickable ? (
                <button
                  type="button"
                  onClick={() => onGoTo!(i)}
                  className="flex flex-col items-center gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
                  aria-label={`Go back to ${label}`}
                >
                  {circle}
                  <span className="text-xs font-medium text-primary">{label}</span>
                </button>
              ) : (
                <>
                  {circle}
                  <span className={cn("text-xs font-medium", active ? "text-foreground" : "text-muted-foreground")}>{label}</span>
                </>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
