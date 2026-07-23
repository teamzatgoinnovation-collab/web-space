/** Format megabytes for Space quota UI. */
export function formatMb(mb: number): string {
  const n = Math.max(0, Number(mb) || 0);
  if (n >= 1024) {
    const gb = n / 1024;
    return `${gb >= 10 ? Math.round(gb) : Math.round(gb * 10) / 10} GB`;
  }
  return `${Math.round(n)} MB`;
}

export function pct(used: number, limit: number): number {
  if (!limit || limit <= 0) return 0;
  return Math.min(100, Math.round((Math.max(0, used) / limit) * 100));
}
