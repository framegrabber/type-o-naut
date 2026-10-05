import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RunResult } from './history';
import { appendRun, clearHistory, loadHistory, summarise } from './history';

const STORAGE_KEY = 'typeonaut.history.v2';

function installStorage(): Map<string, string> {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  });
  return store;
}

const run = (over: Partial<RunResult> = {}): RunResult => ({
  ts: 1,
  keymapId: 'abc12345',
  wpm: 60,
  accuracy: 100,
  errors: 0,
  keystrokes: 50,
  chars: 50,
  durationMs: 10_000,
  source: 'quotes',
  ...over,
});

describe('history storage', () => {
  let store: Map<string, string>;
  beforeEach(() => {
    store = installStorage();
  });

  it('round-trips a run', () => {
    appendRun(run({ wpm: 72 }));
    expect(loadHistory()).toEqual([run({ wpm: 72 })]);
  });

  it('keeps runs oldest first and drops the oldest past the cap', () => {
    for (let i = 1; i <= 205; i++) appendRun(run({ ts: i, wpm: i }));
    const runs = loadHistory();
    expect(runs).toHaveLength(200);
    expect(runs[0].ts).toBe(6);
    expect(runs[199].ts).toBe(205);
  });

  it('clears', () => {
    appendRun(run());
    clearHistory();
    expect(loadHistory()).toEqual([]);
  });

  it('treats an unreadable store as empty rather than throwing', () => {
    store.set(STORAGE_KEY, '{not json');
    expect(loadHistory()).toEqual([]);

    store.set(STORAGE_KEY, JSON.stringify({ version: 1, runs: 'nope' }));
    expect(loadHistory()).toEqual([]);

    store.set(STORAGE_KEY, JSON.stringify([run()]));
    expect(loadHistory()).toEqual([]);
  });

  it('drops entries that do not match the current shape', () => {
    store.set(
      STORAGE_KEY,
      JSON.stringify({
        version: 2,
        runs: [
          run(),
          run({ source: 'guided' }),
          { wpm: 10 },
          { ...run(), source: 'code' },
          { ...run(), keymapId: undefined },
        ],
      })
    );
    expect(loadHistory()).toEqual([run(), run({ source: 'guided' })]);
  });

  it('survives storage that refuses to write', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    });
    expect(appendRun(run({ wpm: 42 }))).toEqual([run({ wpm: 42 })]);
    expect(() => clearHistory()).not.toThrow();
  });
});

describe('summarise', () => {
  it('reports nothing meaningful for an empty history', () => {
    expect(summarise([])).toEqual({ runs: 0, best: 0, recentAverage: null, totalMs: 0 });
  });

  it('averages only the most recent runs', () => {
    // 12 runs: the first two (wpm 1, 2) fall outside the 10-run window.
    const runs = Array.from({ length: 12 }, (_, i) => run({ ts: i, wpm: i + 1 }));
    expect(summarise(runs).recentAverage).toBe(8); // mean of 3..12
  });

  it('takes the best from the whole history, not just the window', () => {
    const runs = [run({ wpm: 150 }), ...Array.from({ length: 10 }, () => run({ wpm: 50 }))];
    const summary = summarise(runs);
    expect(summary.best).toBe(150);
    expect(summary.recentAverage).toBe(50);
    expect(summary.runs).toBe(11);
  });

  it('totals time across every run', () => {
    expect(summarise([run({ durationMs: 1000 }), run({ durationMs: 2500 })]).totalMs).toBe(3500);
  });

  it('scopes the summary to one keymap when asked', () => {
    const runs = [run({ wpm: 150, keymapId: 'other' }), run({ wpm: 50 }), run({ wpm: 70 })];
    expect(summarise(runs, 'abc12345')).toEqual({
      runs: 2,
      best: 70,
      recentAverage: 60,
      totalMs: 20_000,
    });
  });
});
