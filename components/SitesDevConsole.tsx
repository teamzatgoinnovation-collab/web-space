"use client";

import { useEffect, useRef, useState } from "react";

/** Floating Dev logs panel for Sites load activity (same pattern as provision console). */
export function SitesDevConsole({ active }: { active?: boolean }) {
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [lines, setLines] = useState<string[]>([]);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;

    const poll = () => {
      void fetch("/api/sites/logs", { cache: "no-store" })
        .then(async (r) => {
          const d = await r.json();
          if (!alive) return;
          if (!r.ok || !d.ok) {
            setEnabled(false);
            return;
          }
          setEnabled(true);
          setLines(d.lines || []);
        })
        .catch(() => undefined);
    };

    poll();
    // Poll faster while a sites refresh is in flight
    const ms = active ? 800 : 2000;
    const t = setInterval(poll, ms);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [open, active]);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines.length, open]);

  const clear = () => {
    void fetch("/api/sites/logs", { method: "DELETE" }).then(() => setLines([]));
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      {open && (
        <div className="flex w-[min(100vw-2rem,22rem)] flex-col overflow-hidden rounded-xl border border-[var(--space-ink)]/20 bg-[var(--space-ink)] text-[var(--space-mist)] shadow-xl">
          <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide">
              Dev activity · Sites
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={clear}
                className="text-[11px] opacity-60 hover:opacity-100"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-[11px] opacity-60 hover:opacity-100"
              >
                Close
              </button>
            </div>
          </div>

          {!enabled && (
            <p className="px-3 py-2 text-[11px] text-amber-200/90">
              Console off — set NEXT_PUBLIC_SPACE_DEV_CONSOLE=1
            </p>
          )}

          {active && (
            <div className="border-b border-white/10 px-3 py-1.5 text-[10px] text-[var(--space-accent-soft)]">
              Refresh running…
            </div>
          )}

          <pre className="h-40 overflow-auto whitespace-pre-wrap break-all px-3 py-2 font-mono text-[10px] leading-snug text-[var(--space-mist)]/90">
            {lines.length ? lines.slice(-120).join("\n") : "No activity yet — click Refresh."}
            <div ref={endRef} />
          </pre>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-full bg-[var(--space-ink)] px-4 py-2 text-xs font-medium text-white shadow-lg ring-1 ring-white/10 hover:bg-[var(--space-ink)]/90"
      >
        {open ? "Hide logs" : "Dev logs"}
      </button>
    </div>
  );
}
