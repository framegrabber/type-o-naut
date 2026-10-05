import React, { useState } from 'react';
import { Upload, XCircle } from 'lucide-react';
import type { KeyboardLayout, LessonMode, ParsedKeymap, Settings, TextContent } from '../types';
import { loadFileAsJson, loadFileAsText, loadJsonFromUrl, loadTextFromUrl } from '../utils/fileLoader';
import { validateKeyboardLayout } from '../utils/layoutValidator';
import { parseZmkKeymap, validateParsedKeymap } from '../utils/zmkParser';
import { parseTextContent, validateTextContent } from '../utils/textLoader';

const MODES: { value: LessonMode; label: string }[] = [
  { value: 'quotes', label: 'Quotes' },
  { value: 'words', label: 'Words' },
  { value: 'guided', label: 'Guided' },
];

const MIN_TARGET_WPM = 10;
const MAX_TARGET_WPM = 150;

interface ConfigPanelProps {
  layout: KeyboardLayout | null;
  keymap: ParsedKeymap | null;
  textContent: TextContent | null;
  settings: Settings;
  onSettingsChange: (next: Settings) => void;
  onLayoutChange: (layout: KeyboardLayout | null) => void;
  onKeymapChange: (keymap: ParsedKeymap | null) => void;
  onLayerReset: () => void;
  onTextChange: (text: TextContent | null) => void;
  /** How many finished runs are stored, so the clear action can show its weight. */
  historyRuns: number;
  onClearHistory: () => void;
  onClose: () => void;
}

interface ErrorState {
  layout?: string[];
  keymap?: string[];
  text?: string[];
}

export const ConfigPanel: React.FC<ConfigPanelProps> = ({
  layout,
  keymap,
  textContent,
  settings,
  onSettingsChange,
  onLayoutChange,
  onKeymapChange,
  onLayerReset,
  onTextChange,
  historyRuns,
  onClearHistory,
  onClose,
}) => {
  const [errors, setErrors] = useState<ErrorState>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  const handleLayoutFile = async (file: File) => {
    setLoading(prev => ({ ...prev, layout: true }));
    try {
      const data = await loadFileAsJson(file);
      const validation = validateKeyboardLayout(data);
      if (!validation.valid) {
        setErrors(prev => ({ ...prev, layout: validation.errors }));
        return;
      }
      onLayoutChange(data as KeyboardLayout);
      setErrors(prev => ({ ...prev, layout: undefined }));
    } catch (err) {
      setErrors(prev => ({
        ...prev,
        layout: [err instanceof Error ? err.message : 'Unknown error'],
      }));
    } finally {
      setLoading(prev => ({ ...prev, layout: false }));
    }
  };

  const handleKeymapFile = async (file: File) => {
    setLoading(prev => ({ ...prev, keymap: true }));
    try {
      const text = await loadFileAsText(file);
      const parsed = parseZmkKeymap(text);
      const validation = validateParsedKeymap(parsed);
      if (validation.length > 0) {
        setErrors(prev => ({ ...prev, keymap: validation }));
        return;
      }
      onKeymapChange(parsed);
      onLayerReset();
      setErrors(prev => ({ ...prev, keymap: undefined }));
    } catch (err) {
      setErrors(prev => ({
        ...prev,
        keymap: [err instanceof Error ? err.message : 'Unknown error'],
      }));
    } finally {
      setLoading(prev => ({ ...prev, keymap: false }));
    }
  };

  const handleTextFile = async (file: File) => {
    setLoading(prev => ({ ...prev, text: true }));
    try {
      const data = await loadFileAsJson(file);
      const validation = validateTextContent(data);
      if (!validation.valid) {
        setErrors(prev => ({ ...prev, text: validation.errors }));
        return;
      }
      const parsed = parseTextContent(data);
      if (!parsed) {
        setErrors(prev => ({ ...prev, text: ['Failed to parse text content'] }));
        return;
      }
      onTextChange(parsed);
      setErrors(prev => ({ ...prev, text: undefined }));
    } catch (err) {
      setErrors(prev => ({
        ...prev,
        text: [err instanceof Error ? err.message : 'Unknown error'],
      }));
    } finally {
      setLoading(prev => ({ ...prev, text: false }));
    }
  };

  const handleLayoutUrl = async (url: string) => {
    if (!url.trim()) return;
    setLoading(prev => ({ ...prev, layoutUrl: true }));
    try {
      const data = await loadJsonFromUrl(url);
      const validation = validateKeyboardLayout(data);
      if (!validation.valid) {
        setErrors(prev => ({ ...prev, layout: validation.errors }));
        return;
      }
      onLayoutChange(data as KeyboardLayout);
      setErrors(prev => ({ ...prev, layout: undefined }));
    } catch (err) {
      setErrors(prev => ({
        ...prev,
        layout: [err instanceof Error ? err.message : 'Unknown error'],
      }));
    } finally {
      setLoading(prev => ({ ...prev, layoutUrl: false }));
    }
  };

  const handleKeymapUrl = async (url: string) => {
    if (!url.trim()) return;
    setLoading(prev => ({ ...prev, keymapUrl: true }));
    try {
      const text = await loadTextFromUrl(url);
      const parsed = parseZmkKeymap(text);
      const validation = validateParsedKeymap(parsed);
      if (validation.length > 0) {
        setErrors(prev => ({ ...prev, keymap: validation }));
        return;
      }
      onKeymapChange(parsed);
      onLayerReset();
      setErrors(prev => ({ ...prev, keymap: undefined }));
    } catch (err) {
      setErrors(prev => ({
        ...prev,
        keymap: [err instanceof Error ? err.message : 'Unknown error'],
      }));
    } finally {
      setLoading(prev => ({ ...prev, keymapUrl: false }));
    }
  };

  const handleTextUrl = async (url: string) => {
    if (!url.trim()) return;
    setLoading(prev => ({ ...prev, textUrl: true }));
    try {
      const data = await loadJsonFromUrl(url);
      const validation = validateTextContent(data);
      if (!validation.valid) {
        setErrors(prev => ({ ...prev, text: validation.errors }));
        return;
      }
      const parsed = parseTextContent(data);
      if (!parsed) {
        setErrors(prev => ({ ...prev, text: ['Failed to parse text content'] }));
        return;
      }
      onTextChange(parsed);
      setErrors(prev => ({ ...prev, text: undefined }));
    } catch (err) {
      setErrors(prev => ({
        ...prev,
        text: [err instanceof Error ? err.message : 'Unknown error'],
      }));
    } finally {
      setLoading(prev => ({ ...prev, textUrl: false }));
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 p-8 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-yellow-400">Configuration</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-200 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Keyboard Layout Section */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-white mb-3">Keyboard Layout</h3>
          {layout && <div className="text-sm text-green-400 mb-2">✓ Loaded: {layout.name}</div>}
          <div className="flex gap-2 mb-3">
            <label className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded cursor-pointer transition-colors">
              <Upload size={18} />
              <span>Upload JSON</span>
              <input
                type="file"
                accept=".json"
                onChange={e => e.target.files?.[0] && handleLayoutFile(e.target.files[0])}
                className="hidden"
                disabled={loading.layout}
              />
            </label>
          </div>
          <div className="mb-3">
            <input
              type="text"
              placeholder="Keyboard layout URL..."
              onKeyDown={e =>
                e.key === 'Enter' && handleLayoutUrl((e.target as HTMLInputElement).value)
              }
              className="w-full px-3 py-2 bg-gray-700 text-white rounded text-sm border border-gray-600 focus:border-yellow-400 outline-none"
            />
          </div>
          {errors.layout && (
            <div className="bg-red-900/30 border border-red-500 rounded p-3 flex gap-2">
              <XCircle size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-red-300">
                {errors.layout.map((err, i) => (
                  <div key={i}>{err}</div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Keymap Section */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-white mb-3">ZMK Keymap</h3>
          {keymap && (
            <div className="text-sm text-green-400 mb-2">✓ Loaded: {keymap.layers.length} layers</div>
          )}
          <div className="flex gap-2 mb-3">
            <label className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded cursor-pointer transition-colors">
              <Upload size={18} />
              <span>Upload .keymap</span>
              <input
                type="file"
                accept=".keymap"
                onChange={e => e.target.files?.[0] && handleKeymapFile(e.target.files[0])}
                className="hidden"
                disabled={loading.keymap}
              />
            </label>
          </div>
          <div className="mb-3">
            <input
              type="text"
              placeholder="Keymap URL..."
              onKeyDown={e =>
                e.key === 'Enter' && handleKeymapUrl((e.target as HTMLInputElement).value)
              }
              className="w-full px-3 py-2 bg-gray-700 text-white rounded text-sm border border-gray-600 focus:border-yellow-400 outline-none"
            />
          </div>
          {errors.keymap && (
            <div className="bg-red-900/30 border border-red-500 rounded p-3 flex gap-2">
              <XCircle size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-red-300">
                {errors.keymap.map((err, i) => (
                  <div key={i}>{err}</div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Text Content Section */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-white mb-3">Text Content</h3>
          {textContent && (
            <div className="text-sm text-green-400 mb-2">
              ✓ Loaded: {textContent.type === 'words' ? `Word list (${'words' in textContent.data ? textContent.data.words.length : 0} words)` : `Quotes (${'quotes' in textContent.data ? textContent.data.quotes.length : 0} quotes)`}
            </div>
          )}
          <div className="flex gap-2 mb-3">
            <label className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded cursor-pointer transition-colors">
              <Upload size={18} />
              <span>Upload JSON</span>
              <input
                type="file"
                accept=".json"
                onChange={e => e.target.files?.[0] && handleTextFile(e.target.files[0])}
                className="hidden"
                disabled={loading.text}
              />
            </label>
          </div>
          <div className="mb-3">
            <input
              type="text"
              placeholder="Text content URL..."
              onKeyDown={e =>
                e.key === 'Enter' && handleTextUrl((e.target as HTMLInputElement).value)
              }
              className="w-full px-3 py-2 bg-gray-700 text-white rounded text-sm border border-gray-600 focus:border-yellow-400 outline-none"
            />
          </div>
          {errors.text && (
            <div className="bg-red-900/30 border border-red-500 rounded p-3 flex gap-2">
              <XCircle size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-red-300">
                {errors.text.map((err, i) => (
                  <div key={i}>{err}</div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Lesson */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-white mb-3">Lesson</h3>
          <div className="flex gap-2 mb-3">
            {MODES.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => onSettingsChange({ ...settings, mode: value })}
                className={`px-4 py-2 text-sm rounded transition-colors ${
                  settings.mode === value
                    ? 'bg-yellow-400 text-gray-900 font-semibold'
                    : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="flex items-center justify-between gap-4">
            <span className="text-sm text-gray-400">
              Target speed — the pace a character must hold to count as learned
            </span>
            <span className="flex items-center gap-2">
              <input
                type="number"
                min={MIN_TARGET_WPM}
                max={MAX_TARGET_WPM}
                step={5}
                value={settings.targetWpm}
                onChange={e => {
                  // An empty or half-typed field parses to NaN; keep the last good value.
                  const next = Number.parseInt(e.target.value, 10);
                  if (Number.isNaN(next)) return;
                  onSettingsChange({
                    ...settings,
                    targetWpm: Math.min(MAX_TARGET_WPM, Math.max(MIN_TARGET_WPM, next)),
                  });
                }}
                className="w-20 px-3 py-2 bg-gray-700 text-white rounded text-sm border border-gray-600 focus:border-yellow-400 outline-none"
              />
              <span className="text-sm text-gray-400">wpm</span>
            </span>
          </label>
        </div>

        {/* Results history */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-white mb-3">Results</h3>
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm text-gray-400">
              {historyRuns === 0
                ? 'No runs recorded yet'
                : `${historyRuns} run${historyRuns === 1 ? '' : 's'} stored in this browser`}
            </span>
            <button
              onClick={onClearHistory}
              disabled={historyRuns === 0}
              className="px-4 py-2 text-sm bg-gray-700 text-gray-200 rounded hover:bg-red-900/60 hover:text-red-200 disabled:opacity-40 disabled:hover:bg-gray-700 disabled:hover:text-gray-200 transition-colors"
            >
              Clear history
            </button>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full px-6 py-3 bg-yellow-400 text-gray-900 rounded-lg hover:bg-yellow-500 transition-colors font-semibold"
        >
          Done
        </button>
      </div>
    </div>
  );
};
