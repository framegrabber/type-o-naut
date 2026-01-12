import React, { useState, useEffect, useRef } from 'react';
import { RotateCcw, Settings, Keyboard } from 'lucide-react';
import { StatsDisplay } from './StatsDisplay';
import { TextDisplay } from './TextDisplay';
import { KeyboardDisplay } from './KeyboardDisplay';
import { ConfigPanel } from './ConfigPanel';
import type { KeyboardLayout, ParsedKeymap, TextContent, KeyPosition } from '../types';
import { getTextToType } from '../utils/textLoader';
import { getQueryParam, loadJsonFromUrl, loadTextFromUrl } from '../utils/fileLoader';
import { parseKeyboardLayout, validateKeyboardLayout } from '../utils/layoutValidator';
import { parseZmkKeymap, validateParsedKeymap } from '../utils/zmkParser';
import { parseTextContent, validateTextContent } from '../utils/textLoader';

const DEFAULT_LAYOUT_PATH = '/type-o-naut/defaults/ergonaut_one_s.json';
const DEFAULT_KEYMAP_PATH = '/type-o-naut/defaults/ergonaut_one_s.keymap';
const DEFAULT_TEXT_PATH = '/type-o-naut/defaults/english_minimal.json';

interface TypingState {
  text: string;
  input: string;
  currentIndex: number;
  errors: number;
  startTime: number | null;
  wpm: number;
  accuracy: number;
  finished: boolean;
}

export const TypingTrainer: React.FC = () => {
  const [layout, setLayout] = useState<KeyboardLayout | null>(null);
  const [keymap, setKeymap] = useState<ParsedKeymap | null>(null);
  const [selectedLayer, setSelectedLayer] = useState(0);
  const [textContent, setTextContent] = useState<TextContent | null>(null);
  const [showKeyboard, setShowKeyboard] = useState(true);
  const [showConfig, setShowConfig] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const [typing, setTyping] = useState<TypingState>({
    text: '',
    input: '',
    currentIndex: 0,
    errors: 0,
    startTime: null,
    wpm: 0,
    accuracy: 100,
    finished: false,
  });

  const inputRef = useRef<HTMLInputElement>(null);

  // Load defaults on mount
  useEffect(() => {
    const loadDefaults = async () => {
      try {
        // Load keyboard layout
        const layoutResponse = await fetch(DEFAULT_LAYOUT_PATH);
        const layoutData = await layoutResponse.json();
        const parsed = parseKeyboardLayout(layoutData);
        if (parsed) setLayout(parsed);

        // Load keymap
        const keymapResponse = await fetch(DEFAULT_KEYMAP_PATH);
        const keymapText = await keymapResponse.text();
        const parsedKeymap = parseZmkKeymap(keymapText);
        if (validateParsedKeymap(parsedKeymap).length === 0) {
          setKeymap(parsedKeymap);
        }

        // Load text content
        const textResponse = await fetch(DEFAULT_TEXT_PATH);
        const textData = await textResponse.json();
        if (validateTextContent(textData).valid) {
          const parsed = parseTextContent(textData);
          if (parsed) setTextContent(parsed);
        }
      } catch (err) {
        console.error('Failed to load defaults:', err);
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

  // Update text when content changes
  useEffect(() => {
    if (textContent) {
      const newText = getTextToType(textContent);
      setTyping(prev => ({
        ...prev,
        text: newText,
        input: '',
        currentIndex: 0,
        errors: 0,
        startTime: null,
        wpm: 0,
        accuracy: 100,
        finished: false,
      }));
    }
  }, [textContent]);

  // Focus input on mount
  useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
  }, []);

  // Calculate WPM
  useEffect(() => {
    if (typing.startTime && !typing.finished) {
      const interval = setInterval(() => {
        const timeElapsed = (Date.now() - typing.startTime!) / 1000 / 60;
        const wordsTyped = typing.input.length / 5;
        setTyping(prev => ({
          ...prev,
          wpm: Math.round(wordsTyped / timeElapsed),
        }));
      }, 100);
      return () => clearInterval(interval);
    }
  }, [typing.startTime, typing.input.length, typing.finished]);

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.currentTarget.value;

    if (!typing.startTime && value.length > 0) {
      setTyping(prev => ({ ...prev, startTime: Date.now() }));
    }

    if (value.length > typing.input.length) {
      const newChar = value[value.length - 1];
      if (newChar !== typing.text[typing.currentIndex]) {
        setTyping(prev => ({ ...prev, errors: prev.errors + 1 }));
      }
      setTyping(prev => ({ ...prev, currentIndex: prev.currentIndex + 1 }));
    } else if (value.length < typing.input.length) {
      setTyping(prev => ({
        ...prev,
        currentIndex: Math.max(0, prev.currentIndex - 1),
      }));
    }

    const correct = value
      .split('')
      .filter((char, i) => char === typing.text[i]).length;
    const newAccuracy = value.length > 0 ? Math.round((correct / value.length) * 100) : 100;

    setTyping(prev => ({
      ...prev,
      input: value,
      accuracy: newAccuracy,
      finished: value.length === typing.text.length && typing.text.length > 0,
    }));
  };

  const reset = () => {
    setTyping(prev => ({
      ...prev,
      input: '',
      currentIndex: 0,
      errors: 0,
      startTime: null,
      wpm: 0,
      accuracy: 100,
      finished: false,
    }));
    if (inputRef.current) inputRef.current.focus();
  };

  const newText = () => {
    if (textContent) {
      const newTextStr = getTextToType(textContent);
      setTyping(prev => ({
        ...prev,
        text: newTextStr,
        input: '',
        currentIndex: 0,
        errors: 0,
        startTime: null,
        wpm: 0,
        accuracy: 100,
        finished: false,
      }));
    }
    if (inputRef.current) inputRef.current.focus();
  };

  const getKeyLabels = (): string[] => {
    if (!keymap || selectedLayer >= keymap.layers.length) {
      return [];
    }
    return keymap.layers[selectedLayer].bindings;
  };

  const getKeyPositions = (): KeyPosition[] => {
    if (!layout) return [];
    const layoutDef = Object.values(layout.layouts)[0];
    return layoutDef?.layout || [];
  };

  const getNextKeyIndex = (): number => {
    if (typing.currentIndex >= typing.text.length) return -1;
    const nextChar = typing.text[typing.currentIndex].toLowerCase();
    const labels = getKeyLabels();

    // Map special characters to their display symbols
    const charMap: Record<string, string[]> = {
      ' ': ['␣', 'space'],
      '\n': ['⏎', 'enter'],
      '\t': ['⇥', 'tab'],
    };

    // Try to find exact match
    for (let i = 0; i < labels.length; i++) {
      const label = labels[i].toLowerCase();
      
      // Check if this character maps to any symbol for this key
      if (charMap[nextChar]) {
        if (charMap[nextChar].some(symbol => label.includes(symbol))) {
          return i;
        }
      }
      
      // Direct match
      if (label === nextChar || label.includes(nextChar)) {
        return i;
      }
    }
    return -1;
  };

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
        <StatsDisplay wpm={typing.wpm} accuracy={typing.accuracy} errors={typing.errors} />

        {/* Text Display */}
        <TextDisplay text={typing.text} input={typing.input} currentIndex={typing.currentIndex} />

        {/* Input */}
        <input
          ref={inputRef}
          type="text"
          value={typing.input}
          onChange={handleInput}
          disabled={typing.finished}
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
            keyPositions={getKeyPositions()}
            keyLabels={getKeyLabels()}
            nextKeyIndex={getNextKeyIndex()}
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
                  Accuracy: <span className="text-green-400 font-bold">{typing.accuracy}%</span>
                </p>
                <p className="text-xl">
                  Errors: <span className="text-red-400 font-bold">{typing.errors}</span>
                </p>
              </div>
              <button
                onClick={reset}
                className="w-full px-6 py-3 bg-yellow-400 text-gray-900 rounded-lg hover:bg-yellow-500 transition-colors font-semibold"
              >
                Try Again
              </button>
            </div>
          </div>
        )}

        {/* Config Panel */}
        {showConfig && (
          <ConfigPanel
            layout={layout}
            keymap={keymap}
            selectedLayer={selectedLayer}
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
