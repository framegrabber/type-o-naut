import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Keyboard, Maximize, Minimize, RotateCcw, Settings as SettingsIcon } from 'lucide-react';
import { StatsDisplay } from './StatsDisplay';
import { KeySetDisplay } from './KeySetDisplay';
import { TextDisplay } from './TextDisplay';
import { KeyboardDisplay } from './KeyboardDisplay';
import { ResultCard } from './ResultCard';
import { ConfigPanel } from './ConfigPanel';
import type {
  KeyboardLayout,
  KeyPosition,
  KeyStatsTable,
  LessonMode,
  LessonState,
  ParsedKeymap,
  Sample,
  Session,
  Settings,
  TextContent,
} from '../types';
import {
  getNextQuoteIndex,
  getAttribution,
  getQuoteText,
  getRandomWords,
  quoteListOf,
  wordListOf,
  DEFAULT_MINIMAL_QUOTES,
} from '../utils/textLoader';
import {
  getQueryParam,
  loadJsonFromUrl,
  loadMonkeytypeJson,
  loadTextFromUrl,
  parseMonkeytypeRef,
} from '../utils/fileLoader';
import type { MonkeytypeKind } from '../utils/fileLoader';
import { parseKeyboardLayout, validateKeyboardLayout } from '../utils/layoutValidator';
import { parseZmkKeymap, validateParsedKeymap } from '../utils/zmkParser';
import {
  buildCharIndex,
  buildLayerAccess,
  findBaseLayers,
  resolveComboHint,
  resolveHint,
} from '../utils/keyIndex';
import type { CharIndex } from '../utils/keyIndex';
import { parseTextContent, validateTextContent } from '../utils/textLoader';
import type { RunResult } from '../utils/history';
import { appendRun, clearHistory, loadHistory, summarise } from '../utils/history';
import { foldRun, isValidRun, loadKeyStats, proficiency, saveKeyStats } from '../utils/keyStats';
import { guidedText, lessonState } from '../utils/lesson';

const DEFAULT_LAYOUT_PATH = `${import.meta.env.BASE_URL}defaults/ergonaut_one_s.json`;
const DEFAULT_KEYMAP_PATH = `${import.meta.env.BASE_URL}defaults/ergonaut_one_s.keymap`;
const DEFAULT_QUOTES_PATH = `${import.meta.env.BASE_URL}defaults/english_quotes.json`;
const DEFAULT_WORDS_PATH = `${import.meta.env.BASE_URL}defaults/english_words.json`;

/**
 * Enough quotes to type on when the default quote file cannot be fetched.
 * There is no equivalent for words: an absent word list is visible as such,
 * and inventing one would hide the failure.
 */
const FALLBACK_QUOTES: TextContent = {
  type: 'quotes',
  data: { language: 'English', groups: [], quotes: DEFAULT_MINIMAL_QUOTES },
};

const MODES: { value: LessonMode; label: string }[] = [
  { value: 'quotes', label: 'quotes' },
  { value: 'words', label: 'words' },
  { value: 'guided', label: 'guided' },
];

/**
 * Characters a guided fragment aims for. Long enough that the result is worth
 * comparing with the last one, short enough that a lesson stays a lesson.
 */
const GUIDED_LENGTH = 120;

/**
 * Words to learn letter transitions from, and which slot they came from. A
 * word list already is a corpus; failing that, the quote list is split into
 * its distinct words, so guided mode works with whatever is loaded rather
 * than needing a corpus of its own. The origin travels with the words so
 * that nothing has to make the same choice a second time and drift from it.
 */
function guidedCorpus(
  words: TextContent | null,
  quotes: TextContent | null
): { source: 'words' | 'quotes' | null; words: string[] } {
  const wordList = wordListOf(words);
  // A loaded word list is the corpus even if it turns out to hold nothing:
  // reaching past a source the user did load would hide that it is empty.
  if (wordList) {
    return { source: wordList.words.length > 0 ? 'words' : null, words: wordList.words };
  }

  const quoteList = quoteListOf(quotes);
  if (!quoteList) return { source: null, words: [] };
  const distinct = new Set<string>();
  for (const quote of quoteList.quotes) {
    for (const word of quote.text.toLowerCase().split(/[^a-z']+/)) {
      if (word.length >= 2) distinct.add(word);
    }
  }
  return { source: distinct.size > 0 ? 'quotes' : null, words: [...distinct] };
}

/**
 * Share (0..1) of a source's characters this keymap can produce, counted over
 * every occurrence rather than over distinct characters: a single stray glyph
 * in a 1500-word list is then a rounding error, while a list written in
 * another script reads as 0 — which is the warning worth giving. Whitespace
 * is left out of the count because every keymap has a space bar, and letting
 * it in would report a sixth of an untypeable quote file as typeable.
 * Null when there is no source, no keymap, or nothing countable in it.
 */
function charCoverage(content: TextContent | null, charIndex: CharIndex | null): number | null {
  if (!content || !charIndex) return null;

  // Counted first, looked up afterwards: the quote corpus is ~90k characters
  // and only a few hundred of them are distinct.
  const counts = new Map<string, number>();
  const tally = (text: string) => {
    for (const char of text) counts.set(char, (counts.get(char) ?? 0) + 1);
  };
  const words = wordListOf(content);
  if (words) words.words.forEach(tally);
  else for (const quote of quoteListOf(content)?.quotes ?? []) tally(quote.text);

  let total = 0;
  let typeable = 0;
  for (const [char, count] of counts) {
    if (/\s/.test(char)) continue;
    total += count;
    if (charIndex.has(char)) typeable += count;
  }
  return total === 0 ? null : typeable / total;
}

/**
 * A bundled default source, validated exactly the way an uploaded file is.
 * Shared by the first load and by resetting a slot back to the default, so
 * the two cannot come to disagree about what is acceptable.
 */
async function loadDefaultText(kind: 'words' | 'quotes'): Promise<TextContent> {
  const response = await fetch(kind === 'words' ? DEFAULT_WORDS_PATH : DEFAULT_QUOTES_PATH);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data: unknown = await response.json();
  const { valid, errors } = validateTextContent(data);
  if (!valid) throw new Error(errors.join('; '));
  const parsed = parseTextContent(data);
  if (parsed?.type !== kind) throw new Error(`not a ${kind} list`);
  return parsed;
}

/**
 * Whether focus is sitting in a field the user is deliberately typing into —
 * a URL box in the configuration sidebar, say. The sidebar is not modal, so
 * the typing surface may not simply take focus back from one of those.
 */
function holdsTextEntry(element: Element | null, typingField: HTMLTextAreaElement | null): boolean {
  if (!element || element === typingField) return false;
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  ) {
    return true;
  }
  return element instanceof HTMLElement && element.isContentEditable;
}

// Readable stand-ins for non-printing characters in UI copy.
const CHAR_LABELS: Record<string, string> = { ' ': 'space', '\n': 'enter', '\t': 'tab' };

interface TypingState {
  text: string;
  input: string;
  /** Characters typed over the whole session, including corrected ones. */
  keystrokes: number;
  /** Keystrokes that did not match the expected character. */
  errors: number;
  startTime: number | null;
  wpm: number;
  finished: boolean;
  /** One entry per counted keystroke, in typing order, for the key statistics. */
  samples: Sample[];
  /** When the previous keystroke landed; the next one's interval starts here. */
  lastStamp: number | null;
}

const EMPTY_SESSION: Omit<TypingState, 'text'> = {
  input: '',
  keystrokes: 0,
  errors: 0,
  startTime: null,
  wpm: 0,
  finished: false,
  samples: [],
  lastStamp: null,
};

/**
 * Net WPM: correctly typed characters / 5 over elapsed minutes. Times come
 * from `performance.now()`, not the wall clock: a clock step mid-run would
 * otherwise poison both the speed and the per-key timings derived from it.
 */
function netWpm(input: string, text: string, startTime: number | null, now: number): number {
  if (startTime === null) return 0;
  const minutes = (now - startTime) / 60000;
  if (minutes <= 0) return 0;
  let correct = 0;
  for (let i = 0; i < input.length; i++) {
    if (input[i] === text[i]) correct += 1;
  }
  return Math.round(correct / 5 / minutes);
}

/**
 * Accuracy is keystroke-based: correcting a mistake does not erase it, so this
 * is never recomputed from the input buffer. Named because that contract is
 * what the number means, not the arithmetic.
 */
function netAccuracy(keystrokes: number, errors: number): number {
  if (keystrokes === 0) return 100;
  return Math.round(((keystrokes - errors) / keystrokes) * 100);
}

const SETTINGS_KEY = 'typeonaut.settings.v1';
const DEFAULT_TARGET_WPM = 30;
const DEFAULT_SETTINGS: Settings = {
  mode: 'quotes',
  targetWpm: DEFAULT_TARGET_WPM,
  unlockPolicy: 'cost',
};

function isSettings(value: unknown): value is Settings {
  if (!value || typeof value !== 'object') return false;
  const settings = value as Record<string, unknown>;
  return (
    (settings.mode === 'quotes' || settings.mode === 'words' || settings.mode === 'guided') &&
    typeof settings.targetWpm === 'number' &&
    Number.isFinite(settings.targetWpm)
  );
}

/**
 * Stored settings, or null when there are none to speak of. Anything
 * unreadable — no storage at all, invalid JSON, a shape from an older build —
 * counts as a first run, the same way history treats a broken store as empty.
 * Fields added after a user last saved are filled from the defaults rather
 * than voiding the whole entry: losing a mode choice over a new toggle would
 * be a worse trade than a missing field.
 */
function loadSettings(): Settings | null {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isSettings(parsed)) return null;
    const policy =
      'unlockPolicy' in parsed && parsed.unlockPolicy === 'frequency' ? 'frequency' : 'cost';
    return { mode: parsed.mode, targetWpm: parsed.targetWpm, unlockPolicy: policy };
  } catch {
    return null;
  }
}

function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Storage full or blocked (Safari private mode): the session still works.
  }
}

export const TypingTrainer: React.FC = () => {
  const [layout, setLayout] = useState<KeyboardLayout | null>(null);
  const [keymap, setKeymap] = useState<ParsedKeymap | null>(null);
  const [baseLayer, setBaseLayer] = useState(0);
  // Two independent sources, both loadable at once: the mode decides which one
  // a session is drawn from, so loading one never costs the other.
  const [wordList, setWordList] = useState<TextContent | null>(null);
  const [quoteList, setQuoteList] = useState<TextContent | null>(null);
  const [showKeyboard, setShowKeyboard] = useState(true);
  const [showConfig, setShowConfig] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [settings, setSettings] = useState<Settings>(() => loadSettings() ?? DEFAULT_SETTINGS);
  const [session, setSession] = useState<Session>({
    mode: settings.mode,
    quoteIndex: 0,
    nonce: 0,
  });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [history, setHistory] = useState<RunResult[]>(() => loadHistory());

  // Key statistics sit beside the run history: both are per keymap, and both
  // are held in memory so a finished run is reflected without re-reading
  // storage. Statistics recorded on another keymap describe other fingers.
  const keymapId = keymap?.id ?? 'unknown';
  const [keyStats, setKeyStats] = useState<KeyStatsTable>(() => loadKeyStats(keymapId));

  const [typing, setTyping] = useState<TypingState>({ text: '', ...EMPTY_SESSION });

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recordedRunRef = useRef<number | null>(null);
  /**
   * The lesson as of the last render, read when a session starts. A dependency
   * would re-roll the text mid-run: the lesson changes the moment a run is
   * folded into the key statistics, which happens while the result is on
   * screen and the same text is still the one that was typed.
   */
  const lessonRef = useRef<{ lesson: LessonState; corpus: string[] } | null>(null);

  /**
   * A loaded source goes to the slot matching its own kind, wherever it came
   * from — file, URL, MonkeyType picker or query parameter. Which slot is
   * typed from is the mode's decision, not the last file's.
   */
  const receiveText = (text: TextContent) => {
    if (text.type === 'words') setWordList(text);
    else setQuoteList(text);
  };

  /**
   * Empty a slot. The session effect sees the source go and the mode's own
   * "nothing loaded" notice takes the text's place; guided mode falls back to
   * whatever corpus is left, and says so when there is none.
   */
  const clearText = (kind: 'words' | 'quotes') => {
    if (kind === 'words') setWordList(null);
    else setQuoteList(null);
  };

  /**
   * Put the bundled default back in a slot, through the same validation an
   * upload goes through. A failure is reported where the first load reports
   * its own, and leaves whatever was in the slot alone rather than emptying
   * it on the strength of a failed fetch.
   */
  const resetText = (kind: 'words' | 'quotes') => {
    loadDefaultText(kind).then(receiveText, (err: unknown) => {
      console.error(`Failed to load default ${kind === 'words' ? 'word list' : 'quotes'}:`, err);
    });
  };

  // Load defaults on mount. Each resource is loaded independently so that one
  // missing file cannot leave the trainer without text to type.
  useEffect(() => {
    const loadDefaults = async () => {
      try {
        const [layoutResult, keymapResult, quotesResult, wordsResult] = await Promise.allSettled([
          fetch(DEFAULT_LAYOUT_PATH).then(r => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.json();
          }),
          fetch(DEFAULT_KEYMAP_PATH).then(r => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.text();
          }),
          loadDefaultText('quotes'),
          loadDefaultText('words'),
        ]);

        if (layoutResult.status === 'fulfilled') {
          const parsed = parseKeyboardLayout(layoutResult.value);
          if (parsed) setLayout(parsed);
        } else {
          console.error('Failed to load default layout:', layoutResult.reason);
        }

        if (keymapResult.status === 'fulfilled') {
          const parsedKeymap = parseZmkKeymap(keymapResult.value);
          const keymapErrors = validateParsedKeymap(parsedKeymap);
          if (keymapErrors.length === 0) {
            setKeymap(parsedKeymap);
          } else {
            console.error('Default keymap is invalid:', keymapErrors);
          }
        } else {
          console.error('Failed to load default keymap:', keymapResult.reason);
        }

        // The stand-in covers the quote slot only: it is the mode a first
        // visit opens in, so an unreachable file would leave nothing to type.
        if (quotesResult.status === 'fulfilled') {
          setQuoteList(quotesResult.value);
        } else {
          console.error('Failed to load default quotes:', quotesResult.reason);
          setQuoteList(FALLBACK_QUOTES);
        }

        if (wordsResult.status === 'fulfilled') {
          setWordList(wordsResult.value);
        } else {
          console.error('Failed to load default word list:', wordsResult.reason);
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadDefaults();
  }, []);

  // Load from URL params if provided
  useEffect(() => {
    const loadFromParams = async () => {
      const keyboardUrl = getQueryParam('keyboardUrl');
      const keymapUrl = getQueryParam('keymapUrl');
      // A link may carry one source or both; each lands in the slot its own
      // contents belong to, so the parameter name only decides which
      // MonkeyType directory an unqualified shorthand is looked up in.
      const textParams: { param: string; url: string | null; kind: MonkeytypeKind | null }[] = [
        { param: 'textUrl', url: getQueryParam('textUrl'), kind: null },
        { param: 'wordsUrl', url: getQueryParam('wordsUrl'), kind: 'words' },
        { param: 'quotesUrl', url: getQueryParam('quotesUrl'), kind: 'quotes' },
      ];

      if (keyboardUrl) {
        try {
          const data = await loadJsonFromUrl(keyboardUrl);
          if (validateKeyboardLayout(data).valid) {
            setLayout(parseKeyboardLayout(data));
          }
        } catch (err) {
          console.error('Failed to load keyboard from URL:', err);
        }
      }

      if (keymapUrl) {
        try {
          const text = await loadTextFromUrl(keymapUrl);
          const parsed = parseZmkKeymap(text);
          if (validateParsedKeymap(parsed).length === 0) {
            setKeymap(parsed);
            setBaseLayer(0);
          }
        } catch (err) {
          console.error('Failed to load keymap from URL:', err);
        }
      }

      for (const { param, url, kind } of textParams) {
        if (!url) continue;
        try {
          // Shareable links may name a MonkeyType file instead of a full URL.
          const ref = parseMonkeytypeRef(url);
          const data = ref
            ? (await loadMonkeytypeJson({ name: ref.name, kind: ref.kind ?? kind })).data
            : await loadJsonFromUrl(url);
          if (validateTextContent(data).valid) {
            const parsed = parseTextContent(data);
            if (parsed) receiveText(parsed);
          }
        } catch (err) {
          console.error(`Failed to load text from ${param}:`, err);
        }
      }
    };

    if (!isLoading) {
      loadFromParams();
    }
  }, [isLoading]);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  // The mode is what a session is generated from, so changing it starts one.
  // Target speed does not affect the text, hence the mode-only comparison.
  useEffect(() => {
    setSession(prev =>
      prev.mode === settings.mode ? prev : { ...prev, mode: settings.mode, nonce: prev.nonce + 1 }
    );
  }, [settings]);

  // The character index depends only on the keymap; the access chains also
  // depend on which layout the hands are resting on.
  const charIndex = useMemo(() => (keymap ? buildCharIndex(keymap) : null), [keymap]);
  const baseLayers = useMemo(() => (keymap ? findBaseLayers(keymap) : []), [keymap]);
  const layerAccess = useMemo(
    () => (keymap ? buildLayerAccess(keymap, baseLayer) : null),
    [keymap, baseLayer]
  );

  /**
   * What the guided generator learns its letter transitions from, and which
   * slot those words came from: the word list when one is loaded, otherwise
   * the quotes, tokenised. The panel names `guided.source` rather than
   * working the rule out again, so the label cannot disagree with the text.
   */
  const guided = useMemo(() => guidedCorpus(wordList, quoteList), [wordList, quoteList]);

  /**
   * How much of each loaded source this keymap can actually produce. Keyed to
   * the sources and the index alone: the quote corpus is ~90k characters, and
   * this may not be recomputed on a keystroke.
   */
  const coverage = useMemo(
    () => ({
      words: charCoverage(wordList, charIndex),
      quotes: charCoverage(quoteList, charIndex),
    }),
    [wordList, quoteList, charIndex]
  );

  /**
   * The source the running session draws from. Guided mode generates its own
   * text and so has no source; the other two each have exactly one, which is
   * why loading a word list never disturbs a quote session.
   */
  const activeSource = session.mode === 'quotes' ? quoteList : session.mode === 'words' ? wordList : null;

  /**
   * The corpus behind the *running* session, which is a guided-mode concern
   * only: unloading the word list hands guided mode the quotes, and swapping
   * one word list for another changes the alphabet under it. Both are worth a
   * fresh fragment. The array identity only changes when a source is loaded or
   * cleared, never mid-run, so this cannot re-roll text under a typist. Null in
   * the other modes, so loading or clearing the slot they do not read cannot
   * interrupt them.
   */
  const sessionCorpus = session.mode === 'guided' ? guided.words : null;

  const lesson = useMemo(
    () =>
      charIndex && layerAccess
        ? lessonState(charIndex, layerAccess, keyStats, settings, guided.words)
        : null,
    [charIndex, layerAccess, keyStats, settings, guided]
  );

  // Mirrored for the session effect, which reads the lesson without taking a
  // dependency on it. Assigning in render keeps the ref current before any
  // effect runs; it is derived data, so there is nothing to tear.
  lessonRef.current = lesson ? { lesson, corpus: guided.words } : null;
  const lessonReady = lesson !== null;

  // Start a fresh session whenever the mode's source or the session changes.
  // Guided mode builds its own text from the unlocked characters; the others
  // take it from the slot the mode points at. With that slot empty there is
  // nothing to type, and the notice below says which source is missing.
  useEffect(() => {
    if (session.mode === 'guided') {
      const current = lessonRef.current;
      setTyping({
        text: current ? guidedText(current.lesson, current.corpus, GUIDED_LENGTH) : '',
        ...EMPTY_SESSION,
      });
      return;
    }

    // The slot's kind matches the mode by construction; narrowing is how that
    // is said in a way the compiler hears.
    const quotes = quoteListOf(activeSource);
    const words = wordListOf(activeSource);
    setTyping({
      text: quotes
        ? getQuoteText(quotes, session.quoteIndex)
        : words
          ? getRandomWords(words.words)
          : '',
      ...EMPTY_SESSION,
    });
    // `lessonReady` is a dependency so the first guided session regenerates
    // once the keymap has finished loading; its *contents* deliberately are not.
    // `sessionCorpus` catches a guided corpus being unloaded or restored.
  }, [activeSource, session, lessonReady, sessionCorpus]);

  // Keep the hidden-ish input focused. This must run after the render that
  // re-enables the field, otherwise focusing a disabled input is a no-op.
  // The configuration sidebar is not modal, so it does not suspend this —
  // only a field the user is actually typing into does.
  useEffect(() => {
    if (typing.finished) return;
    if (holdsTextEntry(document.activeElement, inputRef.current)) return;
    inputRef.current?.focus();
    // Closing the sidebar hands the keyboard back to the text.
  }, [typing.text, typing.finished, showConfig]);

  // Typing anywhere on the page resumes the run, like a real typing test.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (typing.finished || e.metaKey || e.ctrlKey || e.altKey) return;
      if (holdsTextEntry(document.activeElement, inputRef.current)) return;
      if (document.activeElement !== inputRef.current) inputRef.current?.focus();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [typing.finished]);

  // Fullscreen can also be left with Esc or F11, which the browser handles
  // without telling us, so the flag follows the document rather than the click.
  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement !== null);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // Swapping the keymap swaps the statistics with it; the stored table is
  // keyed by keymap, so the id is what decides whether a reload is due.
  useEffect(() => {
    setKeyStats(prev => (prev.keymapId === keymapId ? prev : loadKeyStats(keymapId)));
  }, [keymapId]);

  // Everything a finished run is made of, captured as one object the moment the
  // run ends, so that the history entry and the per-key samples describe the
  // same run rather than being picked up from two different renders.
  const finishedRun = useMemo(() => {
    if (!typing.finished || typing.startTime === null) return null;
    // What produced the text, which is what the mode says: a guided run drawn
    // from a quote corpus is still a guided run.
    const source: RunResult['source'] = session.mode;
    return {
      startTime: typing.startTime,
      keymapId,
      wpm: typing.wpm,
      accuracy: netAccuracy(typing.keystrokes, typing.errors),
      errors: typing.errors,
      keystrokes: typing.keystrokes,
      chars: typing.text.length,
      source,
      samples: typing.samples,
    };
  }, [typing, keymapId, session.mode]);

  // Record each finished run exactly once. StrictMode runs effects twice in
  // development, and a re-render after the run ends must not log it again, so
  // the session's start time is used as its identity.
  useEffect(() => {
    if (!finishedRun) return;
    if (recordedRunRef.current === finishedRun.startTime) return;
    recordedRunRef.current = finishedRun.startTime;
    const { startTime, samples, ...run } = finishedRun;
    const durationMs = performance.now() - startTime;
    // A run too short or too quick to mean anything is an abandoned attempt:
    // it is neither a result nor evidence, so neither store hears about it.
    if (!isValidRun(run.chars, durationMs)) return;
    setHistory(appendRun({ ...run, ts: Date.now(), durationMs }));
    // The in-memory table is the live one, except right after a keymap swap,
    // when the reload effect has not yet caught up with the new id.
    const base = keyStats.keymapId === run.keymapId ? keyStats : loadKeyStats(run.keymapId);
    const folded = foldRun(base, samples, run.keymapId);
    saveKeyStats(folded);
    setKeyStats(folded);
  }, [finishedRun, keyStats]);

  // Live WPM while a run is in progress. Depends only on run start/stop so the
  // interval is not torn down and recreated on every keystroke.
  useEffect(() => {
    if (typing.startTime === null || typing.finished) return;
    const interval = setInterval(() => {
      setTyping(prev => ({ ...prev, wpm: netWpm(prev.input, prev.text, prev.startTime, performance.now()) }));
    }, 250);
    return () => clearInterval(interval);
  }, [typing.startTime, typing.finished]);

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.currentTarget.value;

    setTyping(prev => {
      // Reject anything that is not a single-character edit (paste, drop,
      // autocomplete) and anything past the end of the target text. A new
      // object is returned so React re-renders and restores the input value.
      if (prev.finished) return { ...prev };
      if (value.length > prev.input.length + 1) return { ...prev };
      if (value.length > prev.text.length) return { ...prev };

      const now = performance.now();
      const startTime = prev.startTime ?? (value.length > 0 ? now : null);
      let { keystrokes, errors, samples } = prev;

      if (value.length > prev.input.length) {
        keystrokes += 1;
        // Evidence is filed under the character the user was meant to hit: a
        // wrong keystroke counts against that key, not against the one landed.
        const expected = prev.text[prev.input.length];
        const typo = value[value.length - 1] !== expected;
        if (typo) errors += 1;
        // The first keystroke of a run has no predecessor, so its interval is
        // 0 — outside the statistics' sanity window, where an unmeasurable gap
        // belongs.
        const ms = prev.lastStamp === null ? 0 : now - prev.lastStamp;
        samples = [...samples, { char: expected, ms, typo }];
      }

      const finished = prev.text.length > 0 && value.length === prev.text.length;
      return {
        ...prev,
        input: value,
        keystrokes,
        errors,
        samples,
        // Backspace records no sample but still moves the mark, so that the
        // next interval is not inflated by the time spent correcting.
        lastStamp: now,
        startTime,
        finished,
        wpm: finished ? netWpm(value, prev.text, startTime, now) : prev.wpm,
      };
    });
  };

  /**
   * Enter and Tab never reach onChange usefully, so they are applied here.
   * A correct newline also consumes the next line's indentation, the way code
   * editors do; those characters are free rather than counted as keystrokes.
   */
  const typeWhitespace = (char: '\n' | '\t') => {
    setTyping(prev => {
      if (prev.finished) return { ...prev };
      const position = prev.input.length;
      if (position >= prev.text.length) return { ...prev };

      const now = performance.now();
      const startTime = prev.startTime ?? now;
      const correct = prev.text[position] === char;

      let addition: string = char;
      if (correct && char === '\n') {
        addition += /^[ \t]*/.exec(prev.text.slice(position + 1))![0];
      }

      const value = prev.input + addition;
      const finished = value.length === prev.text.length;
      return {
        ...prev,
        input: value,
        keystrokes: prev.keystrokes + 1,
        errors: prev.errors + (correct ? 0 : 1),
        samples: [
          ...prev.samples,
          {
            char: prev.text[position],
            ms: prev.lastStamp === null ? 0 : now - prev.lastStamp,
            typo: !correct,
          },
        ],
        lastStamp: now,
        startTime,
        finished,
        wpm: finished ? netWpm(value, prev.text, startTime, now) : prev.wpm,
      };
    });
  };

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    } catch (err) {
      // Denied by the browser (iOS Safari has no element fullscreen at all).
      console.error('Fullscreen request failed:', err);
    }
    inputRef.current?.focus();
  };

  const reset = () => {
    setTyping(prev => ({ ...prev, ...EMPTY_SESSION }));
    inputRef.current?.focus();
  };

  /**
   * Re-roll the text. The mode decides how: a guided lesson draws a new
   * fragment, a quote list advances to the next quote, a word list reshuffles,
   * which needs nothing but a new session identity.
   */
  const newSession = () => {
    const quotes = quoteListOf(activeSource);
    const quoteCount = quotes?.quotes.length ?? 0;
    setSession(prev =>
      quoteCount > 0
        ? { ...prev, quoteIndex: getNextQuoteIndex(prev.quoteIndex, quoteCount) }
        : { ...prev, nonce: prev.nonce + 1 }
    );
    inputRef.current?.focus();
  };

  // Generated text is credited to nobody; only a loaded file has a source.
  const attribution = activeSource ? getAttribution(activeSource, session.quoteIndex) : null;

  // Why there is nothing to type, when there is nothing to type. Each mode
  // keeps to its own source, so an empty one is said out loud rather than
  // quietly answered from the other.
  let emptySource: string | null = null;
  if (session.mode === 'guided' && guided.source === null) {
    emptySource =
      'Guided lessons draw their words from a word list, or from the quotes when there is none — load one to begin.';
  } else if (session.mode === 'guided' && !lessonReady) {
    emptySource = 'Guided lessons need a keymap to choose their keys from — load one to begin.';
  } else if (session.mode === 'words' && !wordList) {
    emptySource = 'No word list loaded — load one to practise words.';
  } else if (session.mode === 'quotes' && !quoteList) {
    emptySource = 'No quote list loaded — load one to type quotes.';
  }

  const keyPositions: KeyPosition[] = layout
    ? Object.values(layout.layouts)[0]?.layout ?? []
    : [];

  const nextChar: string | undefined = typing.text[typing.input.length];
  const hint =
    keymap && charIndex && layerAccess && nextChar !== undefined
      ? resolveHint(nextChar, keymap, charIndex, layerAccess, keyPositions, baseLayer, baseLayer) ??
        resolveComboHint(nextChar, keymap, baseLayer)
      : null;

  // The view follows the character; with nothing to show it rests on the base.
  const displayedLayer = hint?.layer ?? baseLayer;

  const keyLabels: string[] = keymap?.layers[displayedLayer]?.bindings.map(b => b.label) ?? [];

  const accuracy = netAccuracy(typing.keystrokes, typing.errors);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 text-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="text-2xl font-bold text-yellow-400 mb-4">Type-o-naut</div>
          <div className="text-gray-400">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`min-h-screen bg-gray-900 text-gray-100 px-8 py-6 transition-[padding] ${
        // The configuration is a sidebar, not a dialog: the page gives up the
        // width it occupies (22rem) instead of being covered by it.
        showConfig ? 'md:pr-[23rem]' : ''
      }`}
    >
      <div className="max-w-6xl mx-auto">
        {/* Header. Fullscreen is a distraction-free mode, so it goes too. */}
        {isFullscreen ? (
          <button
            onClick={toggleFullscreen}
            className="fixed top-3 right-3 z-30 p-2 rounded text-gray-700 hover:text-gray-300 hover:bg-gray-800 transition-colors"
            title="Leave fullscreen (Esc)"
          >
            <Minimize size={18} />
          </button>
        ) : (
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-xl font-bold text-yellow-400">Type-o-naut</h1>
            <div className="flex gap-2">
              <button
                onClick={() => setShowKeyboard(!showKeyboard)}
                className="p-2 rounded bg-gray-800 hover:bg-gray-700 transition-colors"
                title="Toggle keyboard display"
              >
                <Keyboard size={20} />
              </button>
              <button
                onClick={toggleFullscreen}
                className="p-2 rounded bg-gray-800 hover:bg-gray-700 transition-colors"
                title="Fullscreen"
              >
                <Maximize size={20} />
              </button>
              <button
                onClick={() => setShowConfig(open => !open)}
                aria-pressed={showConfig}
                className={`p-2 rounded transition-colors ${
                  showConfig
                    ? 'bg-gray-700 text-yellow-400'
                    : 'bg-gray-800 hover:bg-gray-700'
                }`}
                title={showConfig ? 'Close configuration' : 'Open configuration'}
              >
                <SettingsIcon size={20} />
              </button>
            </div>
          </div>
        )}

        {/* Stats, with the mode beside them: it is the control reached for
            most often, so it belongs on the trainer itself rather than in a
            dialog. Hidden in fullscreen like the other chrome. */}
        <div className="flex flex-wrap items-baseline justify-between gap-x-6">
          <StatsDisplay wpm={typing.wpm} accuracy={accuracy} errors={typing.errors} />
          <div
            role="group"
            aria-label="Lesson mode"
            className={`flex gap-1 mb-4 font-mono text-sm ${isFullscreen ? 'hidden' : ''}`}
          >
            {MODES.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => {
                  setSettings(prev => ({ ...prev, mode: value }));
                  inputRef.current?.focus();
                }}
                aria-pressed={settings.mode === value}
                className={`px-3 py-1 rounded transition-colors ${
                  settings.mode === value
                    ? 'bg-gray-800 text-yellow-400'
                    : 'text-gray-500 hover:bg-gray-800 hover:text-gray-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* The guided alphabet and how well each of its keys is known. */}
        {session.mode === 'guided' && lesson && (
          <KeySetDisplay state={lesson} stats={keyStats} targetWpm={settings.targetWpm} />
        )}

        {/* Text, typed into directly. The input below is invisible but real,
            so IME, mobile keyboards and composition still work. With the
            mode's source empty there is no session to show, only the reason. */}
        {emptySource ? (
          <p className="mb-6 font-mono text-2xl leading-relaxed text-gray-500">{emptySource}</p>
        ) : (
          <TextDisplay
            text={typing.text}
            input={typing.input}
            caret={inputFocused && !typing.finished}
            prompt={!inputFocused && !typing.finished}
            onActivate={() => inputRef.current?.focus()}
          />
        )}

        {attribution && !emptySource && (
          <p className="-mt-4 mb-6 font-mono text-sm text-gray-500">— {attribution}</p>
        )}

        <textarea
          ref={inputRef}
          rows={1}
          value={typing.input}
          onChange={handleInput}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              // A textarea would otherwise insert a line break that the text
              // never asked for and score it as an error.
              e.preventDefault();
              if (typing.text.includes('\n')) typeWhitespace('\n');
            } else if (e.key === 'Tab' && !e.shiftKey && typing.text.includes('\t')) {
              // Only swallow Tab when the text needs one, so it still moves
              // focus on ordinary prose.
              e.preventDefault();
              typeWhitespace('\t');
            }
          }}
          onPaste={e => e.preventDefault()}
          onDrop={e => e.preventDefault()}
          onFocus={() => setInputFocused(true)}
          onBlur={() => setInputFocused(false)}
          disabled={typing.finished}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-label="Typing input"
          className="absolute opacity-0 w-px h-px -z-10 resize-none"
        />

        {/* Controls. Hidden in fullscreen; the result card covers both. */}
        <div className={`flex gap-3 mb-6 ${isFullscreen ? 'hidden' : ''}`}>
          <button
            onClick={reset}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-gray-800 text-gray-300 rounded hover:bg-gray-700 hover:text-gray-100 transition-colors"
          >
            <RotateCcw size={16} />
            Reset
          </button>
          <button
            onClick={newSession}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-gray-800 text-gray-300 rounded hover:bg-gray-700 hover:text-gray-100 transition-colors"
          >
            New Text
          </button>
        </div>

        {/* Keyboard Visualization */}
        {showKeyboard && layout && (
          <>
            {keymap && nextChar !== undefined && !hint && (
              <div className="mb-2 text-sm text-gray-400">
                <span className="font-mono text-yellow-400">
                  {CHAR_LABELS[nextChar] ?? nextChar}
                </span>{' '}
                is not on this keymap
              </div>
            )}
            <KeyboardDisplay
              keyPositions={keyPositions}
              keyLabels={keyLabels}
              hint={hint}
              keymap={keymap}
              displayedLayer={displayedLayer}
              baseLayer={baseLayer}
              baseLayers={baseLayers}
              onBaseLayerChange={setBaseLayer}
            />
          </>
        )}

        {/* Result */}
        {typing.finished && (
          <ResultCard
            wpm={typing.wpm}
            accuracy={accuracy}
            errors={typing.errors}
            summary={summarise(history, keymap?.id)}
            guided={
              session.mode === 'guided' && lesson
                ? {
                    focus: lesson.focus,
                    proficiency:
                      lesson.focus === null
                        ? null
                        : proficiency(
                            keyStats.keys.find(k => k.char === lesson.focus),
                            settings.targetWpm
                          ),
                    next: lesson.next,
                  }
                : undefined
            }
            actions={[
              { label: 'Try again', shortcut: 'r', onSelect: reset, primary: true },
              {
                // Quotes have a next one; everything else is rolled again.
                label: session.mode === 'quotes' ? 'Next' : 'New text',
                shortcut: 'n',
                onSelect: newSession,
              },
            ]}
          />
        )}

        {/* Configuration, as a sidebar the trainer keeps room for. */}
        {showConfig && (
          <ConfigPanel
            layout={layout}
            keymap={keymap}
            wordList={wordList}
            quoteList={quoteList}
            onTextLoaded={receiveText}
            onTextCleared={clearText}
            onTextReset={resetText}
            guidedCorpus={guided.source}
            coverage={coverage}
            settings={settings}
            onSettingsChange={setSettings}
            onLayoutChange={setLayout}
            onKeymapChange={setKeymap}
            onLayerReset={() => setBaseLayer(0)}
            historyRuns={history.length}
            onClearHistory={() => {
              clearHistory();
              setHistory([]);
            }}
            onClose={() => setShowConfig(false)}
          />
        )}
      </div>
    </div>
  );
};
