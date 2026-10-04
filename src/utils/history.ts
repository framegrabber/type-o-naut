const STORAGE_KEY = 'typeonaut.history.v1';
/** Oldest runs are dropped past this, to keep the entry small and bounded. */
const MAX_RUNS = 200;
/** How many recent runs the headline average covers. */
const RECENT_RUNS = 10;

export interface RunResult {
  /** Completion time, epoch milliseconds. */
  ts: number;
  wpm: number;
  accuracy: number;
  errors: number;
  keystrokes: number;
  /** Length of the text that was typed. */
  chars: number;
  durationMs: number;
  source: 'words' | 'quotes';
}

export interface HistorySummary {
  runs: number;
  best: number;
  /** Mean wpm over the most recent runs, or null before there are any. */
  recentAverage: number | null;
  totalMs: number;
}

function isRunResult(value: unknown): value is RunResult {
  if (!value || typeof value !== 'object') return false;
  const run = value as Record<string, unknown>;
  return (
    typeof run.ts === 'number' &&
    typeof run.wpm === 'number' &&
    typeof run.accuracy === 'number' &&
    typeof run.errors === 'number' &&
    typeof run.keystrokes === 'number' &&
    typeof run.chars === 'number' &&
    typeof run.durationMs === 'number' &&
    (run.source === 'words' || run.source === 'quotes')
  );
}

/**
 * Stored runs, oldest first. Anything unreadable — no storage at all, invalid
 * JSON, a different shape from an older build — yields an empty history
 * rather than breaking the trainer over a results panel.
 */
export function loadHistory(): RunResult[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return [];
    const runs = (parsed as Record<string, unknown>).runs;
    if (!Array.isArray(runs)) return [];
    return runs.filter(isRunResult);
  } catch {
    return [];
  }
}

/** Append a finished run and return the stored history. */
export function appendRun(run: RunResult): RunResult[] {
  const runs = [...loadHistory(), run].slice(-MAX_RUNS);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, runs }));
  } catch {
    // Storage full or blocked (Safari private mode): keep the in-memory view.
  }
  return runs;
}

export function clearHistory(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do; an unreadable store is already an empty history.
  }
}

export function summarise(runs: RunResult[]): HistorySummary {
  if (runs.length === 0) return { runs: 0, best: 0, recentAverage: null, totalMs: 0 };

  const recent = runs.slice(-RECENT_RUNS);
  const recentTotal = recent.reduce((sum, run) => sum + run.wpm, 0);

  return {
    runs: runs.length,
    best: runs.reduce((max, run) => Math.max(max, run.wpm), 0),
    recentAverage: Math.round(recentTotal / recent.length),
    totalMs: runs.reduce((sum, run) => sum + run.durationMs, 0),
  };
}
