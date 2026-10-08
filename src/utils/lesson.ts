import type { KeyStat, KeyStatsTable, LessonState, Settings, UnlockPolicy } from '../types';
import { charCost, type CharIndex, type LayerAccess } from './keyIndex';
import { bestConfidence, proficiency } from './keyStats';

/**
 * Characters the lesson opens with. keybr starts on a handful of keys so the
 * first words are typeable at all; fewer than this and the generator has
 * nothing to build words from.
 */
const MIN_UNLOCKED = 6;

/** Generated words land in this range; real corpus words are filtered to it. */
const MIN_WORD = 3;
const MAX_WORD = 8;

/**
 * How much heavier the focus character is than its corpus weight. keybr does
 * the same thing — the drilled key is deliberately over-represented so it
 * lands in every word rather than once a line.
 */
const FOCUS_BOOST = 6;

/** Tries at a word before falling back to a cheaper construction. */
const WORD_ATTEMPTS = 24;
const SEEDED_ATTEMPTS = 12;

/**
 * Chance of ending a word relative to the weight of continuing it, used only
 * when the markov table has no transition left inside the unlocked alphabet.
 */
const FALLBACK_END_WEIGHT = 0.6;

/** Word boundaries in the markov table; neither can occur in real text. */
const START = '\u0000';
const END = '\u0001';

/**
 * Context length of the chain we sample first. keybr ships an order-4
 * phonetic model per language; we build ours from whatever corpus is loaded,
 * so 3 is the compromise: long enough that the next character is nearly
 * determined by its neighbours, short enough that a few hundred words still
 * populate it.
 */
const ORDER = 3;

/**
 * context -> next character -> occurrences. One table holds both orders: keys
 * of ORDER characters are the primary chain, keys of ORDER - 1 the backoff.
 * Key length tells them apart, so they cannot collide.
 */
type MarkovTable = Map<string, Map<string, number>>;

/**
 * The table is a pure function of the corpus and the corpus is a stable array
 * for as long as a text source stays loaded, so building it once per list
 * keeps a per-run generator call cheap.
 */
const tableCache = new WeakMap<string[], MarkovTable>();

function charFrequency(corpus: string[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const word of corpus) {
    for (const char of word) freq.set(char, (freq.get(char) ?? 0) + 1);
  }
  return freq;
}

/**
 * Every character this keymap can actually produce, in the order the lesson
 * should take them on.
 *
 * Order is the whole adaptive mechanism. Under `cost` we rank by how much work
 * the keyboard asks for, so a layer-held symbol waits until the home row is
 * learned, and frequency only breaks ties — on a normal base layer all 26
 * letters cost the same, and there the common ones should come first. Under
 * `frequency` the two keys swap, which is keybr's order: useful when the
 * keymap makes every letter equally cheap, or when the point is speed on
 * common characters rather than coverage of awkward ones.
 */
function candidates(
  charIndex: CharIndex,
  layerAccess: LayerAccess,
  corpus: string[],
  policy: UnlockPolicy
): string[] {
  const freq = charFrequency(corpus);
  const costs = new Map<string, number>();

  for (const char of charIndex.keys()) {
    // Space is typed between every word regardless, and newlines and tabs are
    // not lesson material; neither belongs in the unlock queue.
    if (char.length === 0 || /\s/.test(char)) continue;
    const cost = charCost(char, charIndex, layerAccess);
    if (cost === null) continue;
    costs.set(char, cost);
  }

  return [...costs.keys()].sort((a, b) => {
    const byCost = costs.get(a)! - costs.get(b)!;
    const byFreq = (freq.get(b) ?? 0) - (freq.get(a) ?? 0);
    const first = policy === 'frequency' ? byFreq : byCost;
    if (first !== 0) return first;
    const second = policy === 'frequency' ? byCost : byFreq;
    if (second !== 0) return second;
    // Neither key could separate them, which happens whenever the corpus has
    // nothing in common with the keymap — a Hebrew word list on a QWERTY
    // board leaves every frequency at zero. Falling straight to code point
    // order would open the lesson on `,` and `.`; letters are what a typing
    // lesson is for.
    const letters = Number(/\p{L}/u.test(b)) - Number(/\p{L}/u.test(a));
    if (letters !== 0) return letters;
    return a.codePointAt(0)! - b.codePointAt(0)!;
  });
}

function statsByChar(stats: KeyStatsTable): Map<string, KeyStat> {
  const byChar = new Map<string, KeyStat>();
  for (const stat of stats.keys) byChar.set(stat.char, stat);
  return byChar;
}

/**
 * What the guided lesson is practising right now: the unlocked alphabet, the
 * character it is drilling, and the one it will hand out next.
 *
 * Unlocking reads the best-ever *time* rather than the current score so a
 * single bad run cannot take a learned key away again — misses only ever
 * accumulate, so letting them gate the queue would re-lock keys. The focus
 * reads `proficiency`, speed penalised by the miss rate, because today's worst
 * key is either the slow one or the unreliable one.
 */
export function lessonState(
  charIndex: CharIndex,
  layerAccess: LayerAccess,
  stats: KeyStatsTable,
  settings: Settings,
  corpus: string[]
): LessonState {
  const queue = candidates(charIndex, layerAccess, corpus, settings.unlockPolicy);
  const byChar = statsByChar(stats);

  const learned = (char: string) => {
    const best = bestConfidence(byChar.get(char), settings.targetWpm);
    // No statistics at all means never typed, which is the opposite of
    // learned: it has to hold the queue closed.
    return best !== null && best >= 1;
  };

  let count = Math.min(MIN_UNLOCKED, queue.length);
  while (count < queue.length && queue.slice(0, count).every(learned)) count++;

  const unlocked = queue.slice(0, count);
  const next = count < queue.length ? queue[count] : null;

  let focus: string | null = null;
  let lowest = Infinity;
  for (const char of unlocked) {
    const current = proficiency(byChar.get(char), settings.targetWpm);
    // A character with no timing evidence is the most in need of practice,
    // so it sorts below any measured one.
    const value = current === null ? -Infinity : current;
    if (focus === null || value < lowest) {
      focus = char;
      lowest = value;
    }
  }

  return { unlocked, focus, next };
}

/**
 * Order-3 transitions over the whole corpus, plus the order-2 table used when
 * the longer context has nothing legal left. Building from the full word list
 * rather than the handful of words the unlocked alphabet allows is what keeps
 * generated text looking like language: the statistics stay rich and only the
 * sampling is restricted.
 *
 * Both orders are accumulated in one walk, which costs two map writes per
 * character. The table is bounded by the corpus's distinct n-grams, not by
 * the alphabet raised to the order: English words use a small corner of the
 * 26^3 space, so it stays linear in corpus size. Measured on a 20k-word word
 * list (174k characters), easily more than a quote file tokenises to: 6.7k
 * contexts, 38k transitions, 2.4 MiB — against 579 contexts and 334 KiB for
 * the order-2 half alone. Built once per corpus array and cached.
 */
function markovTable(corpus: string[]): MarkovTable {
  const cached = tableCache.get(corpus);
  if (cached) return cached;

  const table: MarkovTable = new Map();
  const record = (context: string, char: string) => {
    let row = table.get(context);
    if (!row) {
      row = new Map();
      table.set(context, row);
    }
    row.set(char, (row.get(char) ?? 0) + 1);
  };

  for (const word of corpus) {
    const letters = [...word];
    if (letters.length === 0) continue;
    let context = START.repeat(ORDER);
    for (const char of [...letters, END]) {
      record(context, char);
      // The shorter context is a suffix of the longer one, so the backoff
      // table is exactly the order-2 table the walk used to rely on.
      record(context.slice(1), char);
      context = context.slice(1) + char;
    }
  }

  tableCache.set(corpus, table);
  return table;
}

function weightedPick(options: Array<[string, number]>, rng: () => number): string {
  let total = 0;
  for (const [, weight] of options) total += weight;
  let roll = rng() * total;
  for (const [value, weight] of options) {
    roll -= weight;
    if (roll < 0) return value;
  }
  return options[options.length - 1][0];
}

function hasRepeatedBigram(letters: string[]): boolean {
  const seen = new Set<string>();
  for (let i = 1; i < letters.length; i++) {
    const bigram = letters[i - 1] + letters[i];
    if (seen.has(bigram)) return true;
    seen.add(bigram);
  }
  return false;
}

interface Shape {
  unlocked: string[];
  allowed: Set<string>;
  focus: string | null;
  weights: Map<string, number>;
}

/**
 * Continuations of one context that the lesson may actually type: unlocked
 * characters, no bigram the word has already used, and END only once the word
 * is long enough and has drilled the focus.
 *
 * An empty result is what makes the backoff work — it means this context has
 * nothing legal to offer, not that the walk is stuck.
 */
function contextOptions(
  table: MarkovTable,
  context: string,
  shape: Shape,
  bigrams: Set<string>,
  started: boolean,
  complete: boolean
): Array<[string, number]> {
  const row = table.get(context);
  if (!row) return [];

  const previous = context[context.length - 1];
  const options: Array<[string, number]> = [];
  for (const [char, count] of row) {
    if (char === END) {
      if (complete) options.push([END, count]);
      continue;
    }
    if (!shape.allowed.has(char)) continue;
    // Repeating a bigram is what turns a six-letter alphabet into
    // "jjf jjk jjf": ban it and the walk is forced to branch.
    if (started && bigrams.has(previous + char)) continue;
    options.push([char, char === shape.focus ? count * FOCUS_BOOST : count]);
  }
  return options;
}

/**
 * The chain fell off the unlocked alphabet at every order, which is the normal
 * case early on. Carry on from plain corpus letter frequency instead.
 */
function frequencyOptions(
  shape: Shape,
  bigrams: Set<string>,
  previous: string,
  started: boolean,
  complete: boolean
): Array<[string, number]> {
  const options: Array<[string, number]> = [];
  let total = 0;
  for (const char of shape.unlocked) {
    if (started && bigrams.has(previous + char)) continue;
    const weight = (shape.weights.get(char) ?? 1) * (char === shape.focus ? FOCUS_BOOST : 1);
    total += weight;
    options.push([char, weight]);
  }
  if (complete) options.push([END, total * FALLBACK_END_WEIGHT]);
  return options;
}

/**
 * Walk the markov chain, keeping only characters the lesson has unlocked.
 *
 * Each step tries the order-3 context, then the order-2 context inside it,
 * then letter frequency — in that order, deliberately. A thin alphabet knocks
 * the long context out constantly, and dropping straight to frequency from
 * there is what used to produce `hownsqxq`; one step of backoff keeps most of
 * those positions on real transitions.
 *
 * `seed` forces the first character, which is how a word is guaranteed to
 * contain the focus when free generation keeps missing it.
 */
function generateWord(
  table: MarkovTable,
  shape: Shape,
  rng: () => number,
  seed: string | null
): string | null {
  const letters: string[] = [];
  const bigrams = new Set<string>();
  let context = START.repeat(ORDER);

  if (seed) {
    letters.push(seed);
    context = context.slice(1) + seed;
  }

  while (letters.length < MAX_WORD) {
    const complete =
      letters.length >= MIN_WORD && (shape.focus === null || letters.includes(shape.focus));
    const started = letters.length > 0;
    const previous = context[context.length - 1];

    let options = contextOptions(table, context, shape, bigrams, started, complete);
    if (options.length === 0) {
      options = contextOptions(table, context.slice(1), shape, bigrams, started, complete);
    }
    if (options.length === 0) {
      options = frequencyOptions(shape, bigrams, previous, started, complete);
    }

    if (options.length === 0) break;
    const next = weightedPick(options, rng);
    if (next === END) break;

    if (started) bigrams.add(previous + next);
    letters.push(next);
    context = context.slice(1) + next;
  }

  if (letters.length < MIN_WORD) return null;
  if (shape.focus !== null && !letters.includes(shape.focus)) return null;
  return letters.join('');
}

/**
 * Last resort when even seeded generation cannot find a word: distinct
 * characters starting at the focus, so the bigram rule is satisfied by
 * construction.
 */
function constructedWord(shape: Shape): string {
  const lead = shape.focus ?? shape.unlocked[0];
  const rest = shape.unlocked.filter(char => char !== lead).slice(0, MIN_WORD - 1);
  return lead + rest.join('');
}

/**
 * Corpus words that are already typeable with the unlocked alphabet and drill
 * the focus. keybr filters its word list first and only invents words when the
 * filtered list runs thin, which it does for most of a lesson.
 */
function realWords(corpus: string[], shape: Shape): string[] {
  const pool: string[] = [];
  const seen = new Set<string>();
  for (const word of corpus) {
    if (seen.has(word)) continue;
    const letters = [...word];
    if (letters.length < MIN_WORD || letters.length > MAX_WORD) continue;
    if (!letters.every(char => shape.allowed.has(char))) continue;
    if (shape.focus !== null && !letters.includes(shape.focus)) continue;
    if (hasRepeatedBigram(letters)) continue;
    seen.add(word);
    pool.push(word);
  }
  return pool;
}

/**
 * Pseudo-random practice text restricted to the unlocked alphabet, with the
 * focus character in every word.
 *
 * `rng` is injectable so a session can be reproduced and tests can assert on
 * exact output.
 */
export function guidedText(
  state: LessonState,
  corpus: string[],
  length: number,
  rng: () => number = Math.random
): string {
  if (length <= 0) return '';

  const unlocked = state.unlocked.filter(char => char.length > 0 && !/\s/.test(char));
  if (unlocked.length === 0) return '';

  const allowed = new Set(unlocked);
  const focus = state.focus !== null && allowed.has(state.focus) ? state.focus : null;
  const frequency = charFrequency(corpus);
  const weights = new Map<string, number>();
  for (const char of unlocked) weights.set(char, (frequency.get(char) ?? 0) + 1);

  const shape: Shape = { unlocked, allowed, focus, weights };
  const table = markovTable(corpus);
  const pool = realWords(corpus, shape);
  const used = new Set<string>();

  const nextWord = (): string => {
    if (pool.length > 0) {
      return pool.splice(Math.floor(rng() * pool.length), 1)[0];
    }

    // Keep the first valid word as a floor, but go on looking for one this
    // fragment has not shown yet — repetition is the failure mode here.
    let repeat: string | null = null;
    for (let attempt = 0; attempt < WORD_ATTEMPTS; attempt++) {
      const word = generateWord(table, shape, rng, null);
      if (word === null) continue;
      if (!used.has(word)) return word;
      repeat ??= word;
    }
    for (let attempt = 0; attempt < SEEDED_ATTEMPTS; attempt++) {
      const word = generateWord(table, shape, rng, focus);
      if (word === null) continue;
      if (!used.has(word)) return word;
      repeat ??= word;
    }
    return repeat ?? constructedWord(shape);
  };

  const words: string[] = [];
  let total = 0;
  while (total < length) {
    const word = nextWord();
    used.add(word);
    total += word.length + (words.length > 0 ? 1 : 0);
    words.push(word);
  }

  return words.join(' ');
}
