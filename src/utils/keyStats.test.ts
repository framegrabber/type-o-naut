import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { KeyStat, KeyStatsTable, Sample } from '../types';
import {
  bestConfidence,
  confidence,
  foldRun,
  isValidRun,
  loadKeyStats,
  proficiency,
  saveKeyStats,
} from './keyStats';

const STORAGE_KEY = 'typeonaut.keystats.v1';
const KEYMAP = 'abc12345';

function installStorage(): Map<string, string> {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  });
  return store;
}

const empty = (keymapId = KEYMAP): KeyStatsTable => ({ keymapId, keys: [] });

/** `n` clean samples of the same character at the same speed. */
const typed = (char: string, ms: number, n = 1): Sample[] =>
  Array.from({ length: n }, () => ({ char, ms, typo: false }));

const stat = (table: KeyStatsTable, char: string): KeyStat | undefined =>
  table.keys.find(key => key.char === char);

describe('foldRun', () => {
  it('seeds the average from the first run and never mutates the input', () => {
    const before = empty();
    const after = foldRun(before, typed('a', 300, 2), KEYMAP);

    expect(before).toEqual(empty());
    expect(after.keys).toEqual([{ char: 'a', timeToType: 300, best: 300, hits: 2, misses: 0 }]);
  });

  it('averages within a run, then smooths across runs at 0.1', () => {
    // 200 and 400 in one run is a single 300 datapoint, not two.
    let table = foldRun(empty(), [...typed('a', 200), ...typed('a', 400)], KEYMAP);
    expect(stat(table, 'a')?.timeToType).toBe(300);

    table = foldRun(table, typed('a', 100), KEYMAP);
    expect(stat(table, 'a')?.timeToType).toBeCloseTo(280, 10);

    table = foldRun(table, typed('a', 100), KEYMAP);
    expect(stat(table, 'a')?.timeToType).toBeCloseTo(262, 10);
  });

  it('converges towards a sustained speed without jumping to it', () => {
    let table = foldRun(empty(), typed('a', 500), KEYMAP);
    for (let i = 0; i < 40; i++) table = foldRun(table, typed('a', 100), KEYMAP);

    const timeToType = stat(table, 'a')?.timeToType ?? 0;
    expect(timeToType).toBeGreaterThan(100);
    expect(timeToType).toBeLessThan(110);
  });

  it('keeps the best-ever time when a later run is slower', () => {
    let table = foldRun(empty(), typed('a', 200), KEYMAP);
    table = foldRun(table, typed('a', 1000), KEYMAP);

    const key = stat(table, 'a');
    expect(key?.timeToType).toBeCloseTo(280, 10);
    expect(key?.best).toBe(200);
    expect(key?.hits).toBe(2);
  });

  it('counts typos as hits and misses without letting them touch timing', () => {
    let table = foldRun(empty(), typed('a', 200), KEYMAP);
    table = foldRun(
      table,
      [
        { char: 'a', ms: 50, typo: true },
        { char: 'a', ms: 9000, typo: true },
      ],
      KEYMAP
    );

    expect(stat(table, 'a')).toEqual({
      char: 'a',
      timeToType: 200,
      best: 200,
      hits: 3,
      misses: 2,
    });
  });

  it('records a character seen only as a typo without any timing', () => {
    const table = foldRun(empty(), [{ char: 'z', ms: 300, typo: true }], KEYMAP);

    expect(stat(table, 'z')).toEqual({
      char: 'z',
      timeToType: null,
      best: null,
      hits: 1,
      misses: 1,
    });
  });

  it('excludes samples outside the 40–12000 ms sanity window', () => {
    const outside = foldRun(
      empty(),
      [...typed('a', 39), ...typed('a', 12001), ...typed('a', 0)],
      KEYMAP
    );
    expect(stat(outside, 'a')).toEqual({
      char: 'a',
      timeToType: null,
      best: null,
      hits: 3,
      misses: 0,
    });

    const inside = foldRun(empty(), [...typed('a', 40), ...typed('a', 12000)], KEYMAP);
    expect(stat(inside, 'a')?.timeToType).toBe((40 + 12000) / 2);
  });

  it('ignores out-of-window samples when averaging the rest of the run', () => {
    const table = foldRun(empty(), [...typed('a', 200), ...typed('a', 0)], KEYMAP);
    expect(stat(table, 'a')?.timeToType).toBe(200);
    expect(stat(table, 'a')?.hits).toBe(2);
  });

  it('tracks each character separately and appends new ones', () => {
    let table = foldRun(empty(), typed('a', 200), KEYMAP);
    table = foldRun(table, [...typed('a', 200), ...typed('b', 600)], KEYMAP);

    expect(table.keys.map(key => key.char)).toEqual(['a', 'b']);
    expect(stat(table, 'a')?.timeToType).toBe(200);
    expect(stat(table, 'b')?.timeToType).toBe(600);
  });

  it('starts from scratch when the keymap changes', () => {
    const other = foldRun(empty('other999'), typed('a', 150, 3), 'other999');
    const table = foldRun(other, typed('a', 500), KEYMAP);

    expect(table.keymapId).toBe(KEYMAP);
    expect(table.keys).toEqual([{ char: 'a', timeToType: 500, best: 500, hits: 1, misses: 0 }]);
  });

  it('leaves the table alone for a run with no samples', () => {
    const table = foldRun(empty(), typed('a', 200), KEYMAP);
    expect(foldRun(table, [], KEYMAP)).toEqual(table);
  });
});

describe('confidence', () => {
  // netWpm counts correct characters / 5 per minute, so 60 wpm is 300 chars a
  // minute: 200 ms per character.
  const atTarget: KeyStat = { char: 'a', timeToType: 200, best: 200, hits: 1, misses: 0 };

  it('is null without timing evidence', () => {
    expect(confidence(undefined, 60)).toBeNull();
    expect(confidence({ char: 'a', timeToType: null, best: null, hits: 3, misses: 3 }, 60)).toBeNull();
    expect(bestConfidence(undefined, 60)).toBeNull();
    expect(bestConfidence({ char: 'a', timeToType: 200, best: null, hits: 1, misses: 0 }, 60)).toBeNull();
  });

  it('is exactly 1 at the target speed', () => {
    expect(confidence(atTarget, 60)).toBe(1);
    expect(bestConfidence(atTarget, 60)).toBe(1);
    expect(confidence({ ...atTarget, timeToType: 100, best: 100 }, 120)).toBe(1);
  });

  it('rises above 1 when faster than target and falls below when slower', () => {
    expect(confidence({ ...atTarget, timeToType: 100 }, 60)).toBe(2);
    expect(confidence({ ...atTarget, timeToType: 400 }, 60)).toBe(0.5);
  });

  it('judges the best-ever time, not the current average', () => {
    const learned: KeyStat = { char: 'a', timeToType: 400, best: 200, hits: 9, misses: 1 };
    expect(confidence(learned, 60)).toBe(0.5);
    expect(bestConfidence(learned, 60)).toBe(1);
  });
});

describe('proficiency', () => {
  const atTarget: KeyStat = { char: 'a', timeToType: 200, best: 200, hits: 20, misses: 0 };

  it('equals confidence when the character is never missed', () => {
    expect(proficiency(atTarget, 60)).toBe(1);
    expect(proficiency({ ...atTarget, timeToType: 100 }, 60)).toBe(2);
  });

  it('is null wherever confidence is, because timing is the base', () => {
    expect(proficiency(undefined, 60)).toBeNull();
    expect(
      proficiency({ char: 'a', timeToType: null, best: null, hits: 9, misses: 9 }, 60)
    ).toBeNull();
  });

  it('ranks a fast but unreliable key below a slower clean one', () => {
    // 4 misses in 20 hits penalises by 1 + 2 * 4 / 24 = 1.3333, so a key typed
    // at 150 ms (1.3333 of target) scores exactly 1.
    const sloppy = proficiency({ ...atTarget, timeToType: 150, misses: 4 }, 60)!;
    const clean = proficiency({ ...atTarget, timeToType: 180 }, 60)!;
    expect(sloppy).toBeCloseTo(1, 6);
    expect(clean).toBeCloseTo(1.111, 3);
    expect(sloppy).toBeLessThan(clean);
    // On speed alone the ranking is the other way round, which is the point.
    expect(confidence({ ...atTarget, timeToType: 150 }, 60)).toBeGreaterThan(clean);
  });

  it('does not let the first typo on a fresh key dominate', () => {
    // 1 miss in 1 hit is 2/5 of a miss rate, not all of it: still above half.
    expect(proficiency({ ...atTarget, hits: 1, misses: 1 }, 60)).toBeCloseTo(1 / 1.4, 6);
  });
});

describe('key stats storage', () => {
  let store: Map<string, string>;
  beforeEach(() => {
    store = installStorage();
  });

  it('round-trips a table', () => {
    const table = foldRun(empty(), typed('a', 200), KEYMAP);
    saveKeyStats(table);
    expect(loadKeyStats(KEYMAP)).toEqual(table);
  });

  it('is empty before anything is stored', () => {
    expect(loadKeyStats(KEYMAP)).toEqual(empty());
  });

  it('returns an empty table for a different keymap rather than merging', () => {
    saveKeyStats(foldRun(empty('other999'), typed('a', 200), 'other999'));
    expect(loadKeyStats(KEYMAP)).toEqual(empty());
  });

  it('treats an unreadable or mis-shaped store as empty rather than throwing', () => {
    store.set(STORAGE_KEY, '{not json');
    expect(loadKeyStats(KEYMAP)).toEqual(empty());

    store.set(STORAGE_KEY, JSON.stringify({ keymapId: KEYMAP, keys: 'nope' }));
    expect(loadKeyStats(KEYMAP)).toEqual(empty());

    store.set(STORAGE_KEY, JSON.stringify({ keymapId: KEYMAP, keys: [{ char: 'a' }] }));
    expect(loadKeyStats(KEYMAP)).toEqual(empty());

    store.set(STORAGE_KEY, JSON.stringify([{ char: 'a' }]));
    expect(loadKeyStats(KEYMAP)).toEqual(empty());
  });

  it('survives storage that refuses to read or write', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    });
    expect(() => saveKeyStats(empty())).not.toThrow();
    expect(loadKeyStats(KEYMAP)).toEqual(empty());
  });
});

describe('isValidRun', () => {
  it('needs at least 10 characters and 1000 ms', () => {
    expect(isValidRun(10, 1000)).toBe(true);
    expect(isValidRun(9, 1000)).toBe(false);
    expect(isValidRun(10, 999)).toBe(false);
    expect(isValidRun(0, 0)).toBe(false);
    expect(isValidRun(120, 30_000)).toBe(true);
  });
});
