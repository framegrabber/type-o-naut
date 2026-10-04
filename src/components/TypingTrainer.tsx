import React, { useState, useEffect, useRef } from 'react';
import { RotateCcw, Settings, Keyboard } from 'lucide-react';
import { StatsDisplay } from './StatsDisplay';
import { TextDisplay } from './TextDisplay';
import { KeyboardDisplay } from './KeyboardDisplay';
import { ConfigPanel } from './ConfigPanel';
import type { KeyboardLayout, ParsedKeymap, TextContent, KeyPosition } from '../types';
import { getTextToType, getNextQuoteIndex, DEFAULT_MINIMAL_QUOTES } from '../utils/textLoader';
import { getQueryParam, loadJsonFromUrl, loadTextFromUrl } from '../utils/fileLoader';
import { parseKeyboardLayout, validateKeyboardLayout } from '../utils/layoutValidator';
import { parseZmkKeymap, validateParsedKeymap } from '../utils/zmkParser';
import { parseTextContent, validateTextContent } from '../utils/textLoader';

const DEFAULT_LAYOUT_PATH = `${import.meta.env.BASE_URL}defaults/ergonaut_one_s.json`;
const DEFAULT_KEYMAP_PATH = `${import.meta.env.BASE_URL}defaults/ergonaut_one_s.keymap`;
const DEFAULT_TEXT_PATH = `${import.meta.env.BASE_URL}defaults/english_minimal.json`;

const FALLBACK_TEXT: TextContent = {
  type: 'quotes',
  data: { language: 'English', groups: [], quotes: DEFAULT_MINIMAL_QUOTES },
};

// Display symbols the keymap parser emits for non-printing characters.
const CHAR_LABELS: Record<string, string> = { ' ': '␣', '\n': '⏎', '\t': '⇥' };

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
  const [selectedLayer, setSelectedLayer] = useState(0);
  const [textContent, setTextContent] = useState<TextContent | null>(null);
  const [showKeyboard, setShowKeyboard] = useState(true);
  const [showConfig, setShowConfig] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [quoteIndex, setQuoteIndex] = useState(0); // Track current quote for quote sessions
  const [sessionNonce, setSessionNonce] = useState(0); // Bumped to re-roll a word session

  const [typing, setTyping] = useState<TypingState>({ text: '', ...EMPTY_SESSION });

  const inputRef = useRef<HTMLInputElement>(null);

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
            setSelectedLayer(0);
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

  // Live WPM while a run is in progress. Depends only on run start/stop so the
  // interval is not torn down and recreated on every keystroke.
  useEffect(() => {
    if (typing.startTime === null || typing.finished) return;
    const interval = setInterval(() => {
      setTyping(prev => ({ ...prev, wpm: netWpm(prev.input, prev.text, prev.startTime, Date.now()) }));
    }, 250);
    return () => clearInterval(interval);
  }, [typing.startTime, typing.finished]);

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
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

  const keyLabels: string[] =
    keymap && selectedLayer < keymap.layers.length ? keymap.layers[selectedLayer].bindings : [];

  const keyPositions: KeyPosition[] = layout
    ? Object.values(layout.layouts)[0]?.layout ?? []
    : [];

  const nextChar: string | undefined = typing.text[typing.input.length];
  const wantedLabel =
    nextChar === undefined ? null : (CHAR_LABELS[nextChar] ?? nextChar).toLowerCase();
  // Exact match only: substring matching highlighted "Ctrl" when "c" was due.
  const nextKeyIndex =
    wantedLabel === null ? -1 : keyLabels.findIndex(label => label.toLowerCase() === wantedLabel);

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
    <div className="min-h-screen bg-gray-900 text-gray-100 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-yellow-400">Type-o-naut</h1>
          <div className="flex gap-4">
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

        {/* Text Display */}
        <TextDisplay text={typing.text} input={typing.input} />

        {/* Input */}
        <input
          ref={inputRef}
          type="text"
          value={typing.input}
          onChange={handleInput}
          onPaste={e => e.preventDefault()}
          onDrop={e => e.preventDefault()}
          disabled={typing.finished}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          className="w-full bg-gray-800 text-gray-100 p-4 rounded-lg mb-8 font-mono text-xl focus:outline-none focus:ring-2 focus:ring-yellow-400"
          placeholder="Start typing..."
        />

        {/* Controls */}
        <div className="flex gap-4 mb-8">
          <button
            onClick={reset}
            className="flex items-center gap-2 px-6 py-3 bg-yellow-400 text-gray-900 rounded-lg hover:bg-yellow-500 transition-colors font-semibold"
          >
            <RotateCcw size={20} />
            Reset
          </button>
          <button
            onClick={newText}
            className="flex items-center gap-2 px-6 py-3 bg-gray-700 text-gray-100 rounded-lg hover:bg-gray-600 transition-colors font-semibold"
          >
            New Text
          </button>
        </div>

        {/* Keyboard Visualization */}
        {showKeyboard && layout && (
          <KeyboardDisplay
            keyPositions={keyPositions}
            keyLabels={keyLabels}
            nextKeyIndex={nextKeyIndex}
            keymap={keymap}
            selectedLayer={selectedLayer}
            onLayerChange={setSelectedLayer}
          />
        )}

        {/* Finish Modal */}
        {typing.finished && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-40">
            <div className="bg-gray-800 p-8 rounded-lg max-w-md">
              <h2 className="text-3xl font-bold text-yellow-400 mb-4">Test Complete!</h2>
              <div className="space-y-2 mb-6">
                <p className="text-xl">
                  WPM: <span className="text-yellow-400 font-bold">{typing.wpm}</span>
                </p>
                <p className="text-xl">
                  Accuracy: <span className="text-green-400 font-bold">{accuracy}%</span>
                </p>
                <p className="text-xl">
                  Errors: <span className="text-red-400 font-bold">{typing.errors}</span>
                </p>
              </div>
              <div className="flex gap-4">
                <button
                  onClick={reset}
                  className="flex-1 px-6 py-3 bg-yellow-400 text-gray-900 rounded-lg hover:bg-yellow-500 transition-colors font-semibold"
                >
                  Try Again
                </button>
                {textContent?.type === 'quotes' && (
                  <button
                    onClick={nextQuote}
                    className="flex-1 px-6 py-3 bg-gray-700 text-gray-100 rounded-lg hover:bg-gray-600 transition-colors font-semibold"
                  >
                    Next
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Config Panel */}
        {showConfig && (
          <ConfigPanel
            layout={layout}
            keymap={keymap}
            textContent={textContent}
            onLayoutChange={setLayout}
            onKeymapChange={setKeymap}
            onLayerChange={setSelectedLayer}
            onTextChange={setTextContent}
            onClose={() => setShowConfig(false)}
          />
        )}
      </div>
    </div>
  );
};
