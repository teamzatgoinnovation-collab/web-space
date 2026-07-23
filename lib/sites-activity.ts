/**
 * In-memory activity log for Sites dashboard (dev console).
 * Survives HMR via globalThis; not persisted.
 */

const MAX_LINES = 400;

type Store = { lines: string[] };

function store(): Store {
  const g = globalThis as typeof globalThis & { __zatgoSpaceSitesLog?: Store };
  if (!g.__zatgoSpaceSitesLog) g.__zatgoSpaceSitesLog = { lines: [] };
  return g.__zatgoSpaceSitesLog;
}

function stamp(): string {
  return new Date().toISOString().slice(11, 23);
}

export function sitesLog(message: string) {
  const line = `[${stamp()}] ${message}`;
  const s = store();
  s.lines.push(line);
  if (s.lines.length > MAX_LINES) {
    s.lines = s.lines.slice(-MAX_LINES);
  }
}

export function sitesLogClear() {
  store().lines = [];
}

export function sitesLogLines(limit = 200): string[] {
  const lines = store().lines;
  return lines.slice(-Math.max(1, limit));
}
