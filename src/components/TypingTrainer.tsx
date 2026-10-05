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
  LessonState,
  ParsedKeymap,
  Sample,
  Session,
  Settings,
  TextContent,
} from '../types';
import {
  getTextToType,
  getNextQuoteIndex,
  getAttribution,
  DEFAULT_MINIMAL_QUOTES,
} from '../utils/textLoader';
import { getQueryParam, loadJsonFromUrl, loadTextFromUrl } from '../utils/fileLoader';
import { parseKeyboardLayout, validateKeyboardLayout } from '../utils/layoutValidator';
import { parseZmkKeymap, validateParsedKeymap } from '../utils/zmkParser';
import {
  buildCharIndex,
  buildLayerAccess,
  findBaseLayers,
  resolveComboHint,
  resolveHint,
} from '../utils/keyIndex';
import { parseTextContent, validateTextContent } from '../utils/textLoader';
import type { RunResult } from '../utils/history';
import { appendRun, clearHistory, loadHistory, summarise } from '../utils/history';
import { confidence, foldRun, isValidRun, loadKeyStats, saveKeyStats } from '../utils/keyStats';
import { guidedText, lessonState } from '../utils/lesson';

const DEFAULT_LAYOUT_PATH = `${import.meta.env.BASE_URL}defaults/ergonaut_one_s.json`;
const DEFAULT_KEYMAP_PATH = `${import.meta.env.BASE_URL}defaults/ergonaut_one_s.keymap`;
const DEFAULT_TEXT_PATH = `${import.meta.env.BASE_URL}defaults/english_minimal.json`;

const FALLBACK_TEXT: TextContent = {
  type: 'quotes',
  data: { language: 'English', groups: [], quotes: DEFAULT_MINIMAL_QUOTES },
};

/**
 * Characters a guided fragment aims for. Long enough that the result is worth
 * comparing with the last one, short enough that a lesson stays a lesson.
 */
const GUIDED_LENGTH = 120;

/**
 * Words to learn letter transitions from. A word list is one already; a quote
 * file is split into its distinct words so guided mode needs no corpus of its
 * own.
 */
function corpusWords(content: TextContent | null): string[] {
  if (!content) return [];
  if (content.type === 'words' && 'words' in content.data) return content.data.words;
  if (!('quotes' in content.data)) return [];
  const words = new Set<string>();
  for (const quote of content.data.quotes) {
    for (const word of quote.text.toLowerCase().split(/[^a-z']+/)) {
      if (word.length >= 2) words.add(word);
    }
  }
  return [...words];
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
 */
function loadSettings(): Settings | null {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isSettings(parsed) ? { mode: parsed.mode, targetWpm: parsed.targetWpm } : null;
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
  const [textContent, setTextContent] = useState<TextContent | null>(null);
  const [showKeyboard, setShowKeyboard] = useState(true);
  const [showConfig, setShowConfig] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  // Settings read once: whether anything was stored decides if the first-run
  // default mode still has to follow the text that loads.
  const [storedSettings] = useState(loadSettings);
  const [settings, setSettings] = useState<Settings>(
    storedSettings ?? { mode: 'quotes', targetWpm: DEFAULT_TARGET_WPM }
  );
  const [session, setSession] = useState<Session>({
    mode: storedSettings?.mode ?? 'quotes',
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

  // Load defaults on mount. Each resource is loaded independently so that one
  // missing file cannot leave the trainer without text to type.
  useEffect(() => {
    const loadDefaults = async () => {
      try {
        const [layoutResult, keymapResult, textResult] = await Promise.allSettled([
          fetch(DEFAULT_LAYOUT_PATH).then(r => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.json();
          }),
          fetch(DEFAULT_KEYMAP_PATH).then(r => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.text();
          }),
          fetch(DEFAULT_TEXT_PATH).then(r => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.json();
          }),
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

        const parsedText =
          textResult.status === 'fulfilled' && validateTextContent(textResult.value).valid
            ? parseTextContent(textResult.value)
            : null;
        setTextContent(parsedText ?? FALLBACK_TEXT);
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
      const textUrl = getQueryParam('textUrl');

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

      if (textUrl) {
        try {
          const data = await loadJsonFromUrl(textUrl);
          if (validateTextContent(data).valid) {
            const parsed = parseTextContent(data);
            if (parsed) setTextContent(parsed);
          }
        } catch (err) {
          console.error('Failed to load text from URL:', err);
        }
      }
    };

    if (!isLoading) {
      loadFromParams();
    }
  }, [isLoading]);

  // On a first run there is nothing stored, so the mode follows whatever text
  // was loaded: a word list opens in words mode, a quote list in quotes.
  useEffect(() => {
    if (storedSettings || !textContent) return;
    setSettings(prev => ({ ...prev, mode: textContent.type }));
  }, [storedSettings, textContent]);

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
   * What the guided generator learns its letter transitions from. A word list
   * already is one; a quote file is tokenised, so guided mode works with
   * whatever the user loaded rather than needing a corpus of its own.
   */
  const corpus = useMemo(() => corpusWords(textContent), [textContent]);

  const lesson = useMemo(
    () =>
      charIndex && layerAccess
        ? lessonState(charIndex, layerAccess, keyStats, settings, corpus)
        : null,
    [charIndex, layerAccess, keyStats, settings, corpus]
  );

  // Mirrored for the session effect, which reads the lesson without taking a
  // dependency on it. Assigning in render keeps the ref current before any
  // effect runs; it is derived data, so there is nothing to tear.
  lessonRef.current = lesson ? { lesson, corpus } : null;
  const lessonReady = lesson !== null;

  // Start a fresh session whenever the source text or the session changes.
  // Guided mode builds its own text from the unlocked characters; the others
  // take it from the loaded file.
  useEffect(() => {
    if (!textContent) return;
    const guided = session.mode === 'guided' ? lessonRef.current : null;
    setTyping({
      text: guided
        ? guidedText(guided.lesson, guided.corpus, GUIDED_LENGTH)
        : getTextToType(textContent, { quoteIndex: session.quoteIndex }),
      ...EMPTY_SESSION,
    });
    // `lessonReady` is a dependency so the first guided session regenerates
    // once the keymap has finished loading; its *contents* deliberately are not.
  }, [textContent, session, lessonReady]);

  // Keep the hidden-ish input focused. This must run after the render that
  // re-enables the field, otherwise focusing a disabled input is a no-op.
  useEffect(() => {
    if (!typing.finished && !showConfig) inputRef.current?.focus();
  }, [typing.text, typing.finished, showConfig]);

  // Typing anywhere on the page resumes the run, like a real typing test.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (showConfig || typing.finished || e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.activeElement !== inputRef.current) inputRef.current?.focus();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showConfig, typing.finished]);

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
    // What produced the text, not what file it came from: a guided run on a
    // quote file is still a guided run.
    const source: RunResult['source'] =
      session.mode === 'guided' ? 'guided' : textContent?.type ?? 'quotes';
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
  }, [typing, keymapId, textContent, session.mode]);

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
   * Re-roll the text. What a session is generated from decides how: a guided
   * lesson draws a new fragment, a quote list advances to the next quote, a
   * word list reshuffles, which needs nothing but a new session identity.
   */
  const newSession = () => {
    const quoteCount =
      session.mode !== 'guided' && textContent?.type === 'quotes' && 'quotes' in textContent.data
        ? textContent.data.quotes.length
        : 0;
    setSession(prev =>
      quoteCount > 0
        ? { ...prev, quoteIndex: getNextQuoteIndex(prev.quoteIndex, quoteCount) }
        : { ...prev, nonce: prev.nonce + 1 }
    );
    inputRef.current?.focus();
  };

  // Generated text is credited to nobody; only a loaded file has a source.
  const attribution =
    textContent && session.mode !== 'guided' ? getAttribution(textContent, session.quoteIndex) : null;

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
    <div className="min-h-screen bg-gray-900 text-gray-100 px-8 py-6">
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
                onClick={() => setShowConfig(true)}
                className="p-2 rounded bg-gray-800 hover:bg-gray-700 transition-colors"
                title="Open configuration"
              >
                <SettingsIcon size={20} />
              </button>
            </div>
          </div>
        )}

        {/* Stats */}
        <StatsDisplay wpm={typing.wpm} accuracy={accuracy} errors={typing.errors} />

        {/* The guided alphabet and how well each of its keys is known. */}
        {session.mode === 'guided' && lesson && (
          <KeySetDisplay state={lesson} stats={keyStats} targetWpm={settings.targetWpm} />
        )}

        {/* Text, typed into directly. The input below is invisible but real,
            so IME, mobile keyboards and composition still work. */}
        <TextDisplay
          text={typing.text}
          input={typing.input}
          caret={inputFocused && !typing.finished}
          prompt={!inputFocused && !typing.finished && !showConfig}
          onActivate={() => inputRef.current?.focus()}
        />

        {attribution && (
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
                    confidence:
                      lesson.focus === null
                        ? null
                        : confidence(
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
                label: session.mode === 'guided' || textContent?.type !== 'quotes' ? 'New text' : 'Next',
                shortcut: 'n',
                onSelect: newSession,
              },
            ]}
          />
        )}

        {/* Config Panel */}
        {showConfig && (
          <ConfigPanel
            layout={layout}
            keymap={keymap}
            textContent={textContent}
            settings={settings}
            onSettingsChange={setSettings}
            onLayoutChange={setLayout}
            onKeymapChange={setKeymap}
            onLayerReset={() => setBaseLayer(0)}
            onTextChange={setTextContent}
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
