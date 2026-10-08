import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { KeyStat, KeyStatsTable, LessonState, Settings } from '../types';
import { buildCharIndex, buildLayerAccess, charCost } from './keyIndex';
import { guidedText, lessonState } from './lesson';
import { parseZmkKeymap } from './zmkParser';

const keymap = parseZmkKeymap(readFileSync('public/defaults/ergonaut_one_s.keymap', 'utf8'));
const charIndex = buildCharIndex(keymap);
const layerAccess = buildLayerAccess(keymap);

// public/defaults ships quotes, not a word list, so the corpus is written out
// here: common English words, long enough for order-2 transitions to mean
// something.
const CORPUS = [
  'the', 'of', 'and', 'to', 'in', 'that', 'it', 'is', 'was', 'for',
  'on', 'with', 'as', 'at', 'by', 'from', 'not', 'but', 'this', 'they',
  'have', 'had', 'has', 'one', 'all', 'were', 'when', 'there', 'can', 'what',
  'said', 'each', 'she', 'which', 'their', 'time', 'will', 'about', 'would',
  'other', 'into', 'could', 'than', 'then', 'them', 'these', 'some', 'her',
  'like', 'him', 'see', 'two', 'more', 'write', 'go', 'number', 'no', 'way',
  'people', 'my', 'over', 'know', 'water', 'call', 'first', 'who', 'down',
  'side', 'been', 'now', 'find', 'any', 'new', 'work', 'part', 'take', 'get',
  'place', 'made', 'live', 'where', 'after', 'back', 'little', 'only',
  'round', 'man', 'year', 'came', 'show', 'every', 'good', 'me', 'give',
  'our', 'under', 'name', 'very', 'through', 'just', 'form', 'sentence',
  'great', 'think', 'say', 'help', 'low', 'line', 'differ', 'turn', 'cause',
  'much', 'mean', 'before', 'move', 'right', 'boy', 'old', 'too', 'same',
  'tell', 'does', 'set', 'three', 'want', 'air', 'well', 'also', 'play',
  'small', 'end', 'put', 'home', 'read', 'hand', 'port', 'large', 'spell',
  'add', 'even', 'land', 'here', 'must', 'big', 'high', 'such', 'follow',
  'act', 'why', 'ask', 'men', 'change', 'went', 'light', 'kind', 'off',
  'need', 'house', 'picture', 'try', 'us', 'again', 'animal', 'point',
  'mother', 'world', 'near', 'build', 'self', 'earth', 'father', 'head',
  'stand', 'own', 'page', 'should', 'country', 'found', 'answer', 'school',
  'grow', 'study', 'still', 'learn', 'plant', 'cover', 'food', 'sun',
  'four', 'between', 'state', 'keep', 'eye', 'never', 'last', 'let',
  'thought', 'city', 'tree', 'cross', 'farm', 'hard', 'start', 'might',
  'story', 'saw', 'far', 'sea', 'draw', 'left', 'late', 'run', 'while',
  'press', 'close', 'night', 'real', 'life', 'few', 'north', 'open',
  'seem', 'together', 'next', 'white', 'children', 'begin', 'got', 'walk',
  'example', 'ease', 'paper', 'often', 'always', 'music', 'those', 'both',
  'mark', 'book', 'letter', 'until', 'mile', 'river', 'car', 'feet', 'care',
  'second', 'group', 'carry', 'took', 'rain', 'eat', 'face', 'watch',
  'indian', 'really', 'almost', 'above', 'girl', 'sometimes', 'mountain',
  'young', 'talk', 'soon', 'list', 'song', 'being', 'leave', 'family',
];

const SETTINGS: Settings = { mode: 'guided', targetWpm: 40, unlockPolicy: 'cost' };
// 40 wpm is 300 ms per character, so 200 ms is comfortably at target and
// 900 ms is well below it.
const AT_TARGET = 200;
const BELOW_TARGET = 900;

const EMPTY: KeyStatsTable = { keymapId: keymap.id, keys: [] };

const stat = (char: string, ms: number, best = ms): KeyStat => ({
  char,
  timeToType: ms,
  best,
  hits: 20,
  misses: 1,
});

const tableOf = (keys: KeyStat[]): KeyStatsTable => ({ keymapId: keymap.id, keys });

const stateWith = (stats: KeyStatsTable): LessonState =>
  lessonState(charIndex, layerAccess, stats, SETTINGS, CORPUS);

/** mulberry32: a tiny seeded generator so generated text is reproducible. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const fresh = stateWith(EMPTY);

describe('lessonState', () => {
  it('opens on six characters with no statistics at all', () => {
    expect(fresh.unlocked).toHaveLength(6);
    expect(new Set(fresh.unlocked).size).toBe(6);
    expect(fresh.next).not.toBeNull();
  });

  it('opens on the cheapest characters the keymap offers', () => {
    const cheapest = charCost(fresh.unlocked[0], charIndex, layerAccess)!;
    for (const char of fresh.unlocked) {
      expect(charCost(char, charIndex, layerAccess)).toBe(cheapest);
    }
    // Capitals and layer symbols cost more, so they wait their turn.
    expect(fresh.unlocked).not.toContain('A');
    expect(fresh.unlocked).not.toContain('"');
    expect(fresh.unlocked.join('')).toMatch(/^[a-z]+$/);
  });

  it('breaks cost ties by how common the character is in the corpus', () => {
    // Every base-layer letter costs the same, so the opening six are simply
    // the most frequent letters of the active word list.
    expect(fresh.unlocked.join('')).toBe('etaorn');
    expect(fresh.next).toBe('l');
  });

  it('never offers a character the keymap cannot produce', () => {
    const everything = stateWith(EMPTY);
    for (const char of everything.unlocked) {
      expect(charCost(char, charIndex, layerAccess)).not.toBeNull();
    }
    expect(everything.unlocked).not.toContain(' ');
  });

  it('holds the seventh character back while one unlocked key is slow', () => {
    const keys = fresh.unlocked.map((char, i) =>
      stat(char, i === 3 ? BELOW_TARGET : AT_TARGET)
    );
    const state = stateWith(tableOf(keys));
    expect(state.unlocked).toEqual(fresh.unlocked);
    expect(state.next).toBe(fresh.next);
  });

  it('holds the seventh character back while one unlocked key is unmeasured', () => {
    const keys = fresh.unlocked.slice(0, 5).map(char => stat(char, AT_TARGET));
    expect(stateWith(tableOf(keys)).unlocked).toEqual(fresh.unlocked);
  });

  it('unlocks the next character once every unlocked key is at target', () => {
    const keys = fresh.unlocked.map(char => stat(char, AT_TARGET));
    const state = stateWith(tableOf(keys));
    expect(state.unlocked).toHaveLength(7);
    expect(state.unlocked.slice(0, 6)).toEqual(fresh.unlocked);
    expect(state.unlocked[6]).toBe(fresh.next);
    expect(state.next).not.toBe(fresh.next);
  });

  it('unlocks on the best-ever time, so one bad run cannot re-lock a key', () => {
    const keys = fresh.unlocked.map(char => stat(char, BELOW_TARGET, AT_TARGET));
    expect(stateWith(tableOf(keys)).unlocked).toHaveLength(7);
  });

  it('focuses the never-measured character over any measured one', () => {
    const keys = fresh.unlocked
      .filter(char => char !== fresh.unlocked[4])
      .map(char => stat(char, BELOW_TARGET));
    expect(stateWith(tableOf(keys)).focus).toBe(fresh.unlocked[4]);
  });

  it('focuses the slowest character once everything is measured', () => {
    // The slow key is slow at its best too, so nothing new unlocks and the
    // focus has to come from the measured six.
    const keys = fresh.unlocked.map((char, i) =>
      i === 2 ? stat(char, BELOW_TARGET) : stat(char, AT_TARGET)
    );
    const state = stateWith(tableOf(keys));
    expect(state.unlocked).toHaveLength(6);
    expect(state.focus).toBe(fresh.unlocked[2]);
  });

  it('focuses the unreliable character over equally quick clean ones', () => {
    // Everything is just under target, so nothing unlocks and speed alone
    // cannot separate the six — only the miss rate can.
    const keys = fresh.unlocked.map((char, i) =>
      i === 2
        ? { char, timeToType: 320, best: 320, hits: 40, misses: 10 }
        : { char, timeToType: 320, best: 320, hits: 40, misses: 0 }
    );
    const state = stateWith(tableOf(keys));
    expect(state.unlocked).toEqual(fresh.unlocked);
    expect(state.focus).toBe(fresh.unlocked[2]);
  });

  it('reports nothing at all when the keymap produces no characters', () => {
    const state = lessonState(new Map(), new Map(), EMPTY, SETTINGS, CORPUS);
    expect(state).toEqual({ unlocked: [], focus: null, next: null });
  });

  it('walks the whole keymap and then stops handing out characters', () => {
    let state = fresh;
    const rounds: string[] = [];
    for (let round = 0; round < 500 && state.next !== null; round++) {
      rounds.push(state.next);
      state = stateWith(tableOf(state.unlocked.map(char => stat(char, AT_TARGET))));
      // Each round learns exactly what was unlocked, which buys exactly one
      // more character.
      expect(state.unlocked).toHaveLength(rounds.length + 6);
      expect(state.unlocked[rounds.length + 5]).toBe(rounds[rounds.length - 1]);
    }
    expect(state.next).toBeNull();
    expect(state.unlocked.length).toBeGreaterThan(26);
    expect(state.unlocked).toContain('A');
    expect(state.unlocked).toContain('1');
  });
});

describe('unlock policy', () => {
  // The apostrophe sits behind a layer hold on the bundled keymap, so cost
  // ordering makes it wait; a corpus full of contractions makes it one of the
  // most common characters there is.
  const CONTRACTIONS = ["don't", "isn't", "won't", "can't", "it's", "that's", "he's", "she's"];

  const orderUnder = (unlockPolicy: Settings['unlockPolicy'], corpus: string[]) =>
    lessonState(charIndex, layerAccess, EMPTY, { ...SETTINGS, unlockPolicy }, corpus).unlocked;

  it('keeps a layer-held character out of the opening set under cost order', () => {
    expect(orderUnder('cost', CONTRACTIONS)).not.toContain("'");
  });

  it('opens on the commonest characters under frequency order, layer or not', () => {
    const unlocked = orderUnder('frequency', CONTRACTIONS);
    expect(unlocked).toContain("'");
    expect(charCost("'", charIndex, layerAccess)).toBeGreaterThan(
      charCost('n', charIndex, layerAccess)!
    );
  });

  it('agrees with cost order when every frequent character is equally cheap', () => {
    // Every letter of the plain corpus is on the base layer, so neither key
    // can separate them and the two policies produce the same opening set.
    expect(orderUnder('frequency', CORPUS)).toEqual(orderUnder('cost', CORPUS));
  });

  it('opens on letters when the corpus shares nothing with the keymap', () => {
    // A Hebrew word list on a QWERTY board leaves every frequency at zero, so
    // only the tie-break is left to decide; punctuation is not a typing lesson.
    const unlocked = orderUnder('cost', ['מגדל', 'לשם', 'מיליון', 'שונות']);
    expect(unlocked).toHaveLength(6);
    for (const char of unlocked) expect(char).toMatch(/\p{L}/u);
  });
});

describe('guidedText', () => {
  const fragment = guidedText(fresh, CORPUS, 120, seeded(7));
  const words = fragment.split(' ');

  it('fills the requested budget without cutting a word in half', () => {
    expect(fragment.length).toBeGreaterThanOrEqual(120);
    expect(fragment.length).toBeLessThan(120 + 9);
    expect(fragment).not.toMatch(/ {2}|^ | $/);
  });

  it('types only unlocked characters', () => {
    const allowed = new Set([...fresh.unlocked, ' ']);
    for (const char of fragment) expect(allowed.has(char)).toBe(true);
  });

  it('drills the focus character in every single word', () => {
    expect(fresh.focus).not.toBeNull();
    for (const word of words) expect(word).toContain(fresh.focus!);
  });

  it('keeps words roughly word-shaped', () => {
    for (const word of words) {
      expect(word.length).toBeGreaterThanOrEqual(3);
      expect(word.length).toBeLessThanOrEqual(8);
    }
  });

  it('never repeats a bigram inside a word', () => {
    for (const word of words) {
      const bigrams = [...word].slice(1).map((char, i) => word[i] + char);
      expect(new Set(bigrams).size).toBe(bigrams.length);
    }
  });

  it('does not degenerate into a two-word drill on six characters', () => {
    expect(fresh.unlocked).toHaveLength(6);
    expect(new Set(words).size).toBeGreaterThanOrEqual(8);
  });

  it('stays varied across seeds', () => {
    for (const seed of [1, 2, 3, 99, 12345]) {
      const text = guidedText(fresh, CORPUS, 120, seeded(seed));
      expect(new Set(text.split(' ')).size).toBeGreaterThanOrEqual(8);
      for (const word of text.split(' ')) expect(word).toContain(fresh.focus!);
    }
  });

  it('is reproducible for a given seed and varies between seeds', () => {
    expect(guidedText(fresh, CORPUS, 120, seeded(7))).toBe(fragment);
    expect(guidedText(fresh, CORPUS, 120, seeded(8))).not.toBe(fragment);
  });

  it('prefers real corpus words once the alphabet allows them', () => {
    const alphabet = [...new Set(CORPUS.join(''))];
    const state: LessonState = { unlocked: alphabet, focus: 'o', next: null };
    const text = guidedText(state, CORPUS, 120, seeded(3));
    const real = text.split(' ').filter(word => CORPUS.includes(word));
    expect(real.length).toBe(text.split(' ').length);
    for (const word of text.split(' ')) expect(word).toContain('o');
  });

  it('falls back to generation when the corpus offers too few words', () => {
    const state: LessonState = { unlocked: ['a', 'e', 'n', 't', 'r', 'i'], focus: 'i', next: 'o' };
    const text = guidedText(state, CORPUS, 200, seeded(11));
    const invented = text.split(' ').filter(word => !CORPUS.includes(word));
    expect(invented.length).toBeGreaterThan(0);
    for (const char of text) expect(' aentri').toContain(char);
  });

  it('still produces text when there is no focus character', () => {
    const state: LessonState = { unlocked: ['a', 'e', 'n', 't', 'r', 'i'], focus: null, next: 'o' };
    const text = guidedText(state, CORPUS, 120, seeded(5));
    expect(text.length).toBeGreaterThanOrEqual(120);
    for (const char of text) expect(' aentri').toContain(char);
    expect(new Set(text.split(' ')).size).toBeGreaterThanOrEqual(8);
  });

  it('returns nothing when there is nothing to practise', () => {
    expect(guidedText({ unlocked: [], focus: null, next: null }, CORPUS, 120, seeded(1))).toBe('');
    expect(guidedText(fresh, CORPUS, 0, seeded(1))).toBe('');
  });
});

describe('guidedText backoff', () => {
  // 'z' is never unlocked, so none of these corpus words is typeable as-is and
  // every word in the fragment has to come out of the chain.
  const STATE: LessonState = { unlocked: ['a', 'b', 'c', 'd'], focus: null, next: null };
  const SEEDS = [1, 2, 3, 7, 11, 42, 99, 12345];

  /**
   * Each corpus below forces every word to open 'ab', so the third character
   * is exactly the one the backoff chain chose.
   */
  const thirdChars = (corpus: string[]): Set<string> => {
    const chars = new Set<string>();
    for (const seed of SEEDS) {
      for (const word of guidedText(STATE, corpus, 120, seeded(seed)).split(' ')) {
        expect(word.slice(0, 2)).toBe('ab');
        chars.add(word[2]);
      }
    }
    return chars;
  };

  it('takes the order-3 continuation when there is one', () => {
    // The order-3 context '\0ab' only ever saw 'c'; the order-2 context 'ab'
    // is dominated twenty to one by the 'd' of 'zabd', so a 'd' here would
    // mean the shorter context was consulted first.
    const corpus = ['abcz', ...Array.from({ length: 20 }, () => 'zabd')];
    expect(thirdChars(corpus)).toEqual(new Set(['c']));
  });

  it('backs off to order 2 instead of dropping to letter frequency', () => {
    // 'abz' leaves the order-3 context with a locked continuation only, so it
    // yields nothing legal; order 2 still has the 'c' of 'zabc'.
    expect(thirdChars(['abz', 'zabc'])).toEqual(new Set(['c']));
  });

  it('reaches letter frequency only once no context can continue', () => {
    // Neither order has a legal continuation of 'ab', so the third character
    // is drawn from the alphabet — including 'd', which the corpus never uses.
    const chars = thirdChars(['abz']);
    expect(chars.size).toBeGreaterThan(1);
    expect(chars.has('d')).toBe(true);
  });
});
