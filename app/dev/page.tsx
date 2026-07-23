"use client";

import { DevActivityConsole } from "@/components/DevActivityConsole";
import { isDevConsoleEnabled } from "@/lib/dev-console";
import Link from "next/link";

/** Compact floating console only — no full-page layout. */
export default function DevActivityPage() {
  if (!isDevConsoleEnabled()) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <p className="text-sm text-[var(--space-ink)]/70">
          Dev console disabled.{" "}
          <Link href="/" className="underline">
            Back to Space
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-[40vh] px-4 py-10">
      <Link href="/" className="text-sm text-[var(--space-accent)] underline">
        ← Space wizard
      </Link>
      <p className="mt-4 text-sm text-[var(--space-ink)]/70">
        Use the small <strong>Dev logs</strong> button (bottom-right).
      </p>
      <DevActivityConsole />
    </div>
  );
}
