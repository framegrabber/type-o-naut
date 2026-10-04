import React, { useState, useEffect, useMemo, useRef } from 'react';
import { RotateCcw, Settings, Keyboard } from 'lucide-react';
import { StatsDisplay } from './StatsDisplay';
import { TextDisplay } from './TextDisplay';
import { KeyboardDisplay } from './KeyboardDisplay';
import type { LayerMode } from './KeyboardDisplay';
import { ResultCard } from './ResultCard';
import { ConfigPanel } from './ConfigPanel';
import type { KeyboardLayout, ParsedKeymap, TextContent, KeyPosition } from '../types';
import { getTextToType, getNextQuoteIndex, DEFAULT_MINIMAL_QUOTES } from '../utils/textLoader';
import { getQueryParam, loadJsonFromUrl, loadTextFromUrl } from '../utils/fileLoader';
import { parseKeyboardLayout, validateKeyboardLayout } from '../utils/layoutValidator';
import { parseZmkKeymap, validateParsedKeymap } from '../utils/zmkParser';
import { buildCharIndex, buildLayerAccess, resolveHint } from '../utils/keyIndex';
import { parseTextContent, validateTextContent } from '../utils/textLoader';

const DEFAULT_LAYOUT_PATH = `${import.meta.env.BASE_URL}defaults/ergonaut_one_s.json`;
const DEFAULT_KEYMAP_PATH = `${import.meta.env.BASE_URL}defaults/ergonaut_one_s.keymap`;
const DEFAULT_TEXT_PATH = `${import.meta.env.BASE_URL}defaults/english_minimal.json`;

const FALLBACK_TEXT: TextContent = {
  type: 'quotes',
  data: { language: 'English', groups: [], quotes: DEFAULT_MINIMAL_QUOTES },
};

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
}

const EMPTY_SESSION: Omit<TypingState, 'text'> = {
  input: '',
  keystrokes: 0,
  errors: 0,
  startTime: null,
  wpm: 0,
  finished: false,
};

/** Net WPM: correctly typed characters / 5 over elapsed minutes. */
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

export const TypingTrainer: React.FC = () => {
  const [layout, setLayout] = useState<KeyboardLayout | null>(null);
  const [keymap, setKeymap] = useState<ParsedKeymap | null>(null);
  const [layerMode, setLayerMode] = useState<LayerMode>('auto');
  const [textContent, setTextContent] = useState<TextContent | null>(null);
  const [showKeyboard, setShowKeyboard] = useState(true);
  const [showConfig, setShowConfig] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [quoteIndex, setQuoteIndex] = useState(0); // Track current quote for quote sessions
  const [sessionNonce, setSessionNonce] = useState(0); // Bumped to re-roll a word session
  const [inputFocused, setInputFocused] = useState(false);

  const [typing, setTyping] = useState<TypingState>({ text: '', ...EMPTY_SESSION });

  const inputRef = useRef<HTMLTextAreaElement>(null);

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
            setLayerMode('auto');
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

  // Start a fresh session whenever the source text changes.
  useEffect(() => {
    if (!textContent) return;
    setTyping({ text: getTextToType(textContent, quoteIndex), ...EMPTY_SESSION });
  }, [textContent, quoteIndex, sessionNonce]);

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

  // Live WPM while a run is in progress. Depends only on run start/stop so the
  // interval is not torn down and recreated on every keystroke.
  useEffect(() => {
    if (typing.startTime === null || typing.finished) return;
    const interval = setInterval(() => {
      setTyping(prev => ({ ...prev, wpm: netWpm(prev.input, prev.text, prev.startTime, Date.now()) }));
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

      const now = Date.now();
      const startTime = prev.startTime ?? (value.length > 0 ? now : null);
      let { keystrokes, errors } = prev;

      if (value.length > prev.input.length) {
        keystrokes += 1;
        if (value[value.length - 1] !== prev.text[value.length - 1]) errors += 1;
      }

      const finished = prev.text.length > 0 && value.length === prev.text.length;
      return {
        ...prev,
        input: value,
        keystrokes,
        errors,
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

      const now = Date.now();
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
        startTime,
        finished,
        wpm: finished ? netWpm(value, prev.text, startTime, now) : prev.wpm,
      };
    });
  };

  const reset = () => {
    setTyping(prev => ({ ...prev, ...EMPTY_SESSION }));
    inputRef.current?.focus();
  };

  const nextQuote = () => {
    if (textContent && textContent.type === 'quotes' && 'quotes' in textContent.data) {
      const nextIdx = getNextQuoteIndex(quoteIndex, textContent.data.quotes.length);
      setQuoteIndex(nextIdx);
    } else {
      // For word lists, just reset
      reset();
    }
  };

  const newText = () => {
    if (textContent?.type === 'quotes') {
      nextQuote();
    } else {
      // Word sessions re-roll their random selection; quote sessions advance.
      setSessionNonce(n => n + 1);
    }
  };

  const keyPositions: KeyPosition[] = layout
    ? Object.values(layout.layouts)[0]?.layout ?? []
    : [];

  // Indexes depend only on the keymap, so they survive every keystroke.
  const charIndex = useMemo(() => (keymap ? buildCharIndex(keymap) : null), [keymap]);
  const layerAccess = useMemo(() => (keymap ? buildLayerAccess(keymap) : null), [keymap]);

  const nextChar: string | undefined = typing.text[typing.input.length];
  // In auto mode the base layer is the reference point, so characters that
  // exist on several layers resolve to the one closest to home.
  const preferredLayer = layerMode === 'auto' ? 0 : layerMode;
  const hint =
    keymap && charIndex && layerAccess && nextChar !== undefined
      ? resolveHint(nextChar, keymap, charIndex, layerAccess, keyPositions, preferredLayer)
      : null;

  // Auto mode follows the character; a manual choice pins the view.
  const displayedLayer = layerMode === 'auto' ? hint?.layer ?? 0 : layerMode;

  const keyLabels: string[] = keymap?.layers[displayedLayer]?.bindings.map(b => b.label) ?? [];

  // Accuracy is keystroke-based: correcting a mistake does not erase it.
  const accuracy =
    typing.keystrokes === 0
      ? 100
      : Math.round(((typing.keystrokes - typing.errors) / typing.keystrokes) * 100);

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
        {/* Header */}
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
              onClick={() => setShowConfig(true)}
              className="p-2 rounded bg-gray-800 hover:bg-gray-700 transition-colors"
              title="Open configuration"
            >
              <Settings size={20} />
            </button>
          </div>
        </div>

        {/* Stats */}
        <StatsDisplay wpm={typing.wpm} accuracy={accuracy} errors={typing.errors} />

        {/* Text, typed into directly. The input below is invisible but real,
            so IME, mobile keyboards and composition still work. */}
        <TextDisplay
          text={typing.text}
          input={typing.input}
          caret={inputFocused && !typing.finished}
          prompt={!inputFocused && !typing.finished && !showConfig}
          onActivate={() => inputRef.current?.focus()}
        />

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

        {/* Controls */}
        <div className="flex gap-3 mb-6">
          <button
            onClick={reset}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-gray-800 text-gray-300 rounded hover:bg-gray-700 hover:text-gray-100 transition-colors"
          >
            <RotateCcw size={16} />
            Reset
          </button>
          <button
            onClick={newText}
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
              layerMode={layerMode}
              onLayerModeChange={setLayerMode}
            />
          </>
        )}

        {/* Result */}
        {typing.finished && (
          <ResultCard
            wpm={typing.wpm}
            accuracy={accuracy}
            errors={typing.errors}
            actions={[
              { label: 'Try again', shortcut: 'r', onSelect: reset, primary: true },
              ...(textContent?.type === 'quotes'
                ? [{ label: 'Next', shortcut: 'n', onSelect: nextQuote }]
                : [{ label: 'New text', shortcut: 'n', onSelect: newText }]),
            ]}
          />
        )}

        {/* Config Panel */}
        {showConfig && (
          <ConfigPanel
            layout={layout}
            keymap={keymap}
            textContent={textContent}
            onLayoutChange={setLayout}
            onKeymapChange={setKeymap}
            onLayerReset={() => setLayerMode('auto')}
            onTextChange={setTextContent}
            onClose={() => setShowConfig(false)}
          />
        )}
      </div>
    </div>
  );
};
