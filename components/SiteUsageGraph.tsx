"use client";

import { formatMb, pct } from "@/lib/format";

type Props = {
  diskUsedMb: number;
  diskLimitMb: number;
  ramUsedMb: number;
  ramLimitMb: number;
  appCount: number;
};

function Donut({
  value,
  label,
  detail,
  color,
}: {
  value: number;
  label: string;
  detail: string;
  color: string;
}) {
  const clamped = Math.min(100, Math.max(0, value));
  const r = 42;
  const c = 2 * Math.PI * r;
  const dash = (clamped / 100) * c;
  return (
    <div className="flex flex-col items-center text-center">
      <div className="relative h-28 w-28">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden>
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke="currentColor"
            strokeWidth="10"
            className="text-[var(--space-ink)]/10"
          />
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke={color}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${c - dash}`}
            className="transition-[stroke-dasharray] duration-700 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-semibold tabular-nums text-[var(--space-ink)]">
            {Math.round(clamped)}%
          </span>
        </div>
      </div>
      <p className="mt-2 text-sm font-semibold text-[var(--space-ink)]">{label}</p>
      <p className="mt-0.5 text-xs tabular-nums text-[var(--space-ink)]/55">{detail}</p>
    </div>
  );
}

function BarChart({
  diskPct,
  ramPct,
  diskLabel,
  ramLabel,
}: {
  diskPct: number;
  ramPct: number;
  diskLabel: string;
  ramLabel: string;
}) {
  const rows = [
    { key: "Storage", pct: diskPct, label: diskLabel, fill: "var(--space-accent)" },
    { key: "Memory", pct: ramPct, label: ramLabel, fill: "#3d6b8a" },
  ];
  return (
    <div className="mt-6 space-y-4" role="img" aria-label="Usage comparison chart">
      {rows.map((row) => (
        <div key={row.key}>
          <div className="mb-1.5 flex items-baseline justify-between gap-2 text-xs">
            <span className="font-medium text-[var(--space-ink)]/70">{row.key}</span>
            <span className="tabular-nums text-[var(--space-ink)]/50">{row.label}</span>
          </div>
          <div className="relative h-8 w-full overflow-hidden rounded-lg bg-[var(--space-ink)]/[0.06]">
            <div
              className="absolute inset-y-0 left-0 rounded-lg transition-[width] duration-700 ease-out"
              style={{
                width: `${Math.min(100, Math.max(2, row.pct))}%`,
                background: row.fill,
                opacity: 0.85,
              }}
            />
            <span className="absolute inset-0 flex items-center px-3 text-xs font-semibold tabular-nums text-white mix-blend-difference">
              {Math.round(row.pct)}%
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function SiteUsageGraph({
  diskUsedMb,
  diskLimitMb,
  ramUsedMb,
  ramLimitMb,
  appCount,
}: Props) {
  const diskPct = diskLimitMb > 0 ? pct(diskUsedMb, diskLimitMb) : diskUsedMb > 0 ? 8 : 0;
  const ramPct = ramLimitMb > 0 ? pct(ramUsedMb, ramLimitMb) : ramUsedMb > 0 ? 8 : 0;
  const diskDetail =
    diskLimitMb > 0
      ? `${formatMb(diskUsedMb)} / ${formatMb(diskLimitMb)}`
      : formatMb(diskUsedMb);
  const ramDetail =
    ramLimitMb > 0
      ? `${formatMb(ramUsedMb)} / ${formatMb(ramLimitMb)}`
      : formatMb(ramUsedMb);

  return (
    <div>
      <div className="flex flex-wrap justify-around gap-6">
        <Donut
          value={diskLimitMb > 0 ? diskPct : Math.min(100, diskUsedMb > 0 ? 12 : 0)}
          label="Storage"
          detail={diskDetail}
          color="var(--space-accent)"
        />
        <Donut
          value={ramLimitMb > 0 ? ramPct : Math.min(100, ramUsedMb > 0 ? 12 : 0)}
          label="Memory"
          detail={ramDetail}
          color="#3d6b8a"
        />
        <div className="flex flex-col items-center text-center">
          <div className="flex h-28 w-28 flex-col items-center justify-center rounded-full border-[10px] border-[var(--space-ink)]/10">
            <span className="text-2xl font-semibold tabular-nums text-[var(--space-ink)]">
              {appCount}
            </span>
            <span className="text-[10px] uppercase tracking-wide text-[var(--space-ink)]/45">
              apps
            </span>
          </div>
          <p className="mt-2 text-sm font-semibold text-[var(--space-ink)]">Installed</p>
          <p className="mt-0.5 text-xs text-[var(--space-ink)]/55">On this site</p>
        </div>
      </div>
      <BarChart
        diskPct={diskLimitMb > 0 ? diskPct : 0}
        ramPct={ramLimitMb > 0 ? ramPct : 0}
        diskLabel={diskDetail}
        ramLabel={ramDetail}
      />
      {diskLimitMb <= 0 && ramLimitMb <= 0 ? (
        <p className="mt-3 text-xs text-[var(--space-ink)]/50">
          Assign a plan to see usage against included storage and memory.
        </p>
      ) : null}
    </div>
  );
}
