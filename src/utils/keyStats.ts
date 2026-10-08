import type { KeyStat, KeyStatsTable, Sample } from '../types';

const STORAGE_KEY = 'typeonaut.keystats.v1';

/**
 * Sanity window for a single keystroke interval, in milliseconds. Below the
 * floor is faster than ~300 WPM — a rollover artefact, or the `ms === 0` that
 * marks the first keystroke of a run, which has no predecessor to measure
 * against. Above the ceiling the typist stopped to think, which says nothing
 * about how well they know the key.
 */
const MIN_SAMPLE_MS = 40;
const MAX_SAMPLE_MS = 12000;

/** Weight of the newest run in the exponential moving average. */
const ALPHA = 0.1;

/** keybr's result filter: anything shorter than this is an abandoned attempt. */
const MIN_RUN_CHARS = 10;
const MIN_RUN_MS = 1000;

/** Characters per word, the convention `netWpm` in TypingTrainer already uses. */
const CHARS_PER_WORD = 5;

function isKeyStat(value: unknown): value is KeyStat {
  if (!value || typeof value !== 'object') return false;
  if (!('char' in value && 'timeToType' in value && 'best' in value)) return false;
  if (!('hits' in value && 'misses' in value)) return false;
  const { char, timeToType, best, hits, misses } = value;
  return (
    typeof char === 'string' &&
    (timeToType === null || typeof timeToType === 'number') &&
    (best === null || typeof best === 'number') &&
    typeof hits === 'number' &&
    typeof misses === 'number'
  );
}

function isKeyStatsTable(value: unknown): value is KeyStatsTable {
  if (!value || typeof value !== 'object') return false;
  if (!('keymapId' in value && 'keys' in value)) return false;
  const { keymapId, keys } = value;
  return typeof keymapId === 'string' && Array.isArray(keys) && keys.every(isKeyStat);
}

/**
 * Fold one run's samples into the table, returning a new one.
 *
 * Statistics are scoped to a keymap: the same character can sit on another
 * layer behind a different hold key, so a table recorded elsewhere is
 * discarded rather than merged.
 */
export function foldRun(
  table: KeyStatsTable,
  samples: Sample[],
  keymapId: string
): KeyStatsTable {
  const base: KeyStatsTable = table.keymapId === keymapId ? table : { keymapId, keys: [] };

  // Per-character tallies for this run only; the smoothing step below sees one
  // value per character per run, so a long run cannot outvote a short one.
  const runs = new Map<string, { hits: number; misses: number; total: number; timed: number }>();
  for (const sample of samples) {
    let tally = runs.get(sample.char);
    if (!tally) {
      tally = { hits: 0, misses: 0, total: 0, timed: 0 };
      runs.set(sample.char, tally);
    }
    tally.hits += 1;
    if (sample.typo) {
      tally.misses += 1;
      continue;
    }
    if (sample.ms >= MIN_SAMPLE_MS && sample.ms <= MAX_SAMPLE_MS) {
      tally.total += sample.ms;
      tally.timed += 1;
    }
  }

  const keys = base.keys.map(stat => {
    const tally = runs.get(stat.char);
    if (!tally) return stat;
    runs.delete(stat.char);
    return fold(stat, tally);
  });

  for (const [char, tally] of runs) {
    keys.push(fold({ char, timeToType: null, best: null, hits: 0, misses: 0 }, tally));
  }

  return { keymapId, keys };
}

function fold(
  stat: KeyStat,
  tally: { hits: number; misses: number; total: number; timed: number }
): KeyStat {
  const next: KeyStat = {
    char: stat.char,
    timeToType: stat.timeToType,
    best: stat.best,
    hits: stat.hits + tally.hits,
    misses: stat.misses + tally.misses,
  };

  // Every sample was a typo or outside the sanity window: the counts move, but
  // there is no evidence about speed, so the smoothed value stays as it was.
  if (tally.timed === 0) return next;

  const value = tally.total / tally.timed;
  next.timeToType =
    stat.timeToType === null ? value : ALPHA * value + (1 - ALPHA) * stat.timeToType;
  // Best-ever, so one bad run cannot re-lock a key that has been learned.
  next.best = stat.best === null ? next.timeToType : Math.min(stat.best, next.timeToType);
  return next;
}

/**
 * Milliseconds per character implied by a words-per-minute target, using the
 * same five-characters-per-word convention as `netWpm` in TypingTrainer.
 */
function targetMs(targetWpm: number): number {
  return 60000 / (targetWpm * CHARS_PER_WORD);
}

/**
 * How close a character is to the target speed: 1 means exactly at target,
 * above means faster. `null` while there is no timing evidence at all.
 */
export function confidence(stat: KeyStat | undefined, targetWpm: number): number | null {
  if (!stat || stat.timeToType === null) return null;
  return targetMs(targetWpm) / stat.timeToType;
}

/**
 * How many hits a character is credited with before its miss rate is believed.
 * Without it the first typo on a fresh key reads as 100% inaccurate and that
 * key would hold the focus for the rest of the lesson.
 */
const MISS_PRIOR = 4;

/**
 * What a miss costs relative to its share of the keystrokes: a key missed a
 * tenth of the time scores as if it were 20% slower than it is. Errors are
 * worth more than time because a typo you correct also costs the correction.
 */
const MISS_WEIGHT = 2;

/**
 * Speed and accuracy as one number on `confidence`'s scale, which is what the
 * lesson ranks keys by: a character is practised until it is both fast and
 * reliable. Typos leave `timeToType` untouched by design (they carry no timing
 * evidence), so without this term a key you miss constantly but hit quickly
 * would never be drilled.
 */
export function proficiency(stat: KeyStat | undefined, targetWpm: number): number | null {
  const speed = confidence(stat, targetWpm);
  if (speed === null || !stat) return null;
  return speed / (1 + (MISS_WEIGHT * stat.misses) / (stat.hits + MISS_PRIOR));
}

/** As `confidence`, but against the best-ever time; unlocking uses this. */
export function bestConfidence(stat: KeyStat | undefined, targetWpm: number): number | null {
  if (!stat || stat.best === null) return null;
  return targetMs(targetWpm) / stat.best;
}

/**
 * Stored statistics for one keymap. Anything unreadable — no storage, invalid
 * JSON, an older shape, or a table recorded on another keymap — yields an
 * empty table rather than breaking the trainer over a progress panel.
 */
export function loadKeyStats(keymapId: string): KeyStatsTable {
  const empty: KeyStatsTable = { keymapId, keys: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return empty;
    const parsed: unknown = JSON.parse(raw);
    if (!isKeyStatsTable(parsed) || parsed.keymapId !== keymapId) return empty;
    return parsed;
  } catch {
    return empty;
  }
}

export function saveKeyStats(table: KeyStatsTable): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(table));
  } catch {
    // Storage full or blocked (Safari private mode): keep the in-memory table.
  }
}

/** Whether a finished run is substantial enough to learn from. */
export function isValidRun(length: number, durationMs: number): boolean {
  return length >= MIN_RUN_CHARS && durationMs >= MIN_RUN_MS;
}
