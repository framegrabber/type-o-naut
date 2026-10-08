import React, { useState } from 'react';
import { Upload, XCircle } from 'lucide-react';
import type { KeyboardLayout, ParsedKeymap, Settings, TextContent, UnlockPolicy } from '../types';
import type { MonkeytypeKind } from '../utils/fileLoader';
import {
  listMonkeytypeNames,
  loadFileAsJson,
  loadFileAsText,
  loadJsonFromUrl,
  loadMonkeytypeJson,
  loadTextFromUrl,
  parseMonkeytypeRef,
} from '../utils/fileLoader';
import { validateKeyboardLayout } from '../utils/layoutValidator';
import { parseZmkKeymap, validateParsedKeymap } from '../utils/zmkParser';
import { parseTextContent, validateTextContent } from '../utils/textLoader';

const MIN_TARGET_WPM = 10;
const MAX_TARGET_WPM = 150;

const UNLOCK_POLICIES: { value: UnlockPolicy; label: string; hint: string }[] = [
  {
    value: 'cost',
    label: 'Easiest first',
    hint: 'Characters the keymap makes easiest to reach come first; layer-held keys wait.',
  },
  {
    value: 'frequency',
    label: 'Most common first',
    hint: "Characters the loaded text uses most come first, the way keybr.com orders them.",
  },
];

/** A source slot is named after the kind of file that lives in it. */
const SLOT_TITLES: Record<MonkeytypeKind, string> = {
  words: 'Word list',
  quotes: 'Quotes',
};

const SLOT_HINTS: Record<MonkeytypeKind, string> = {
  words: 'Drives the words lesson, and is the alphabet guided practice draws from.',
  quotes: 'Drives the quotes lesson, and stands in for guided practice when no word list is loaded.',
};

/** Shown in the picker field so the shape of a name is obvious. */
const MONKEYTYPE_EXAMPLES: Record<MonkeytypeKind, string> = {
  quotes: 'english, german, code_javascript',
  words: 'english_1k, spanish_10k, code_rust',
};

interface ConfigPanelProps {
  layout: KeyboardLayout | null;
  keymap: ParsedKeymap | null;
  wordList: TextContent | null;
  quoteList: TextContent | null;
  /** A validated, parsed source; the trainer routes it to the slot matching its type. */
  onTextLoaded: (text: TextContent) => void;
  settings: Settings;
  onSettingsChange: (next: Settings) => void;
  onLayoutChange: (layout: KeyboardLayout | null) => void;
  onKeymapChange: (keymap: ParsedKeymap | null) => void;
  onLayerReset: () => void;
  historyRuns: number;
  onClearHistory: () => void;
  onClose: () => void;
}

interface ErrorState {
  layout?: string[];
  keymap?: string[];
  words?: string[];
  quotes?: string[];
}

/** What a loaded slot says about itself, without casting unvalidated shapes. */
function describeContent(content: TextContent): string {
  const data = content.data;
  if ('words' in data) {
    return `${data.name} — ${data.words.length} word${data.words.length === 1 ? '' : 's'}`;
  }
  return `${data.language} — ${data.quotes.length} quote${data.quotes.length === 1 ? '' : 's'}`;
}

const ErrorList: React.FC<{ messages: string[] }> = ({ messages }) => (
  <div className="bg-red-900/30 border border-red-500 rounded p-3 flex gap-2">
    <XCircle size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
    <div className="text-sm text-red-300 min-w-0 break-words">
      {messages.map((message, i) => (
        <div key={i}>{message}</div>
      ))}
    </div>
  </div>
);

interface MonkeytypePickerProps {
  kind: MonkeytypeKind;
  names: string[];
  /** Replaces the count line while the listing is in flight or failed. */
  listNote: string | null;
  onNeedNames: () => void;
  busy: boolean;
  onPick: (name: string) => void;
}

/**
 * A list we render ourselves rather than a `<datalist>`: the native combobox
 * paints an unstyleable dropdown arrow over a dark field, its popup is drawn
 * by the browser outside the page (so it looks different in every browser and
 * cannot be keyboard-driven reliably), and it never says how many names exist.
 * Typing a name that is not listed still loads, because the index is fetched
 * from a rate-limited API and MonkeyType adds files faster than we refetch.
 */
const MonkeytypePicker: React.FC<MonkeytypePickerProps> = ({
  kind,
  names,
  listNote,
  onNeedNames,
  busy,
  onPick,
}) => {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);

  const trimmed = query.trim();
  // Derived in render; a few hundred short names cost nothing to filter.
  const needle = trimmed.toLowerCase();
  const matches = needle ? names.filter(name => name.toLowerCase().includes(needle)) : names;
  const active = highlight >= 0 && highlight < matches.length ? highlight : -1;

  const submit = (name: string) => {
    if (!name.trim()) return;
    setOpen(false);
    setHighlight(-1);
    onPick(name.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (matches.length === 0) return;
      setOpen(true);
      setHighlight(
        e.key === 'ArrowDown'
          ? (active + 1) % matches.length
          : active <= 0
            ? matches.length - 1
            : active - 1
      );
      return;
    }
    if (e.key === 'Enter') {
      submit(active >= 0 ? matches[active] : trimmed);
      return;
    }
    if (e.key === 'Escape' && open) {
      // Swallowed so it closes the list rather than leaving fullscreen.
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      setHighlight(-1);
    }
  };

  return (
    <div className="mb-3 rounded border border-gray-700 p-3">
      <div className="text-sm font-semibold text-gray-300 mb-2">
        From MonkeyType <span className="font-normal text-gray-500">({kind})</span>
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-label={`MonkeyType ${kind} file name`}
          value={query}
          placeholder={`e.g. ${MONKEYTYPE_EXAMPLES[kind]}`}
          onChange={e => {
            setQuery(e.target.value);
            setOpen(true);
            setHighlight(-1);
          }}
          onFocus={() => {
            onNeedNames();
            setOpen(true);
          }}
          // Picking a name keeps focus (the row cancels the mousedown), so a
          // real blur means the user left the field and the list can collapse.
          onBlur={() => setOpen(false)}
          onKeyDown={handleKeyDown}
          className="flex-1 min-w-0 px-3 py-2 bg-gray-700 text-white rounded text-sm border border-gray-600 focus:border-yellow-400 outline-none"
        />
        <button
          onClick={() => submit(query)}
          disabled={busy || !trimmed}
          className="px-4 py-2 text-sm bg-gray-700 text-gray-200 rounded hover:bg-gray-600 disabled:opacity-40 disabled:hover:bg-gray-700 transition-colors"
        >
          {busy ? '…' : 'Load'}
        </button>
      </div>
      {open && (
        <ul className="mt-2 max-h-44 overflow-y-auto rounded border border-gray-700 bg-gray-900">
          {matches.map((name, i) => (
            <li key={name}>
              <button
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => {
                  setQuery(name);
                  submit(name);
                }}
                className={`block w-full px-3 py-1.5 text-left font-mono text-xs transition-colors ${
                  i === active
                    ? 'bg-yellow-400 text-gray-900'
                    : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                }`}
              >
                {name}
              </button>
            </li>
          ))}
          {matches.length === 0 && (
            <li className="px-3 py-2 text-xs text-gray-500">
              {names.length === 0
                ? 'No names listed — type one and press Load'
                : `Nothing listed matches "${trimmed}" — Load tries it anyway`}
            </li>
          )}
        </ul>
      )}
      <p className="mt-2 text-xs text-gray-500">
        {listNote ??
          (names.length === 0
            ? 'Names load from their repository when you use this field'
            : trimmed
              ? `${matches.length} of ${names.length} ${kind} files match`
              : `${names.length} ${kind} files — fetched from their repository, nothing is copied here`)}
      </p>
    </div>
  );
};

interface TextSourceBlockProps {
  kind: MonkeytypeKind;
  content: TextContent | null;
  /** Where the content in this slot came from. */
  source: string | null;
  /** Set when a load started here landed in the other slot. */
  note: string | null;
  errors: string[] | undefined;
  names: string[];
  listNote: string | null;
  onNeedNames: (kind: MonkeytypeKind) => void;
  /** Validate, parse and hand over; false when the data was rejected. */
  onData: (data: unknown, source: string, from: MonkeytypeKind) => boolean;
  onError: (from: MonkeytypeKind, messages: string[]) => void;
}

/**
 * One source slot. Both slots are live at once — the lesson mode picks which
 * one a session comes from — so loading here never disturbs the other block.
 */
const TextSourceBlock: React.FC<TextSourceBlockProps> = ({
  kind,
  content,
  source,
  note,
  errors,
  names,
  listNote,
  onNeedNames,
  onData,
  onError,
}) => {
  const [busy, setBusy] = useState<{ file?: boolean; url?: boolean; monkeytype?: boolean }>({});
  const [url, setUrl] = useState('');

  const fail = (err: unknown) =>
    onError(kind, [err instanceof Error ? err.message : 'Unknown error']);

  const handleFile = async (file: File) => {
    setBusy(prev => ({ ...prev, file: true }));
    try {
      onData(await loadFileAsJson(file), file.name, kind);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(prev => ({ ...prev, file: false }));
    }
  };

  const handleUrl = async () => {
    if (!url.trim()) return;
    setBusy(prev => ({ ...prev, url: true }));
    try {
      // A `monkeytype:` shorthand resolves to a file in their repository; an
      // ordinary URL is fetched as it stands.
      const ref = parseMonkeytypeRef(url);
      if (ref) {
        const loaded = await loadMonkeytypeJson(ref);
        onData(loaded.data, loaded.url, kind);
      } else {
        onData(await loadJsonFromUrl(url), url.trim(), kind);
      }
    } catch (err) {
      fail(err);
    } finally {
      setBusy(prev => ({ ...prev, url: false }));
    }
  };

  const handleMonkeytype = async (name: string) => {
    setBusy(prev => ({ ...prev, monkeytype: true }));
    try {
      // The kind is the block's own, so a missing name names the one URL tried.
      const loaded = await loadMonkeytypeJson({ kind, name });
      onData(loaded.data, loaded.url, kind);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(prev => ({ ...prev, monkeytype: false }));
    }
  };

  return (
    <div className="mb-6">
      <h3 className="text-lg font-semibold text-white mb-1">{SLOT_TITLES[kind]}</h3>
      <p className="text-xs text-gray-500 mb-3">{SLOT_HINTS[kind]}</p>
      {content ? (
        <div className="text-sm text-green-400 mb-3">
          ✓ {describeContent(content)}
          {source && <span className="block text-gray-500 break-all">from {source}</span>}
        </div>
      ) : (
        <div className="text-sm text-gray-500 mb-3">Nothing loaded</div>
      )}
      <div className="flex gap-2 mb-3">
        <label className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded cursor-pointer transition-colors text-sm">
          <Upload size={18} />
          <span>Upload JSON</span>
          <input
            type="file"
            accept=".json"
            onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
            className="hidden"
            disabled={busy.file}
          />
        </label>
      </div>

      <MonkeytypePicker
        kind={kind}
        names={names}
        listNote={listNote}
        onNeedNames={() => onNeedNames(kind)}
        busy={busy.monkeytype ?? false}
        onPick={handleMonkeytype}
      />

      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={url}
          placeholder={`URL, or monkeytype:${kind}/name`}
          aria-label={`${SLOT_TITLES[kind]} URL`}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleUrl()}
          className="flex-1 min-w-0 px-3 py-2 bg-gray-700 text-white rounded text-sm border border-gray-600 focus:border-yellow-400 outline-none"
        />
        <button
          onClick={handleUrl}
          disabled={busy.url || !url.trim()}
          className="px-4 py-2 text-sm bg-gray-700 text-gray-200 rounded hover:bg-gray-600 disabled:opacity-40 disabled:hover:bg-gray-700 transition-colors"
        >
          {busy.url ? '…' : 'Load'}
        </button>
      </div>

      {note && <div className="mb-3 text-xs text-yellow-400">{note}</div>}
      {errors && <ErrorList messages={errors} />}
    </div>
  );
};

export const ConfigPanel: React.FC<ConfigPanelProps> = ({
  layout,
  keymap,
  wordList,
  quoteList,
  onTextLoaded,
  settings,
  onSettingsChange,
  onLayoutChange,
  onKeymapChange,
  onLayerReset,
  historyRuns,
  onClearHistory,
  onClose,
}) => {
  const [errors, setErrors] = useState<ErrorState>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  /**
   * Names fetched from MonkeyType's repository, per kind, so the picker
   * reflects what exists today rather than a copy that goes stale.
   */
  const [monkeytypeNames, setMonkeytypeNames] = useState<Record<MonkeytypeKind, string[]>>({
    quotes: [],
    words: [],
  });
  const [monkeytypeListNotes, setMonkeytypeListNotes] = useState<
    Record<MonkeytypeKind, string | null>
  >({ quotes: null, words: null });
  /** Where each slot's text came from, so a successful load names its source. */
  const [sources, setSources] = useState<Record<MonkeytypeKind, string | null>>({
    quotes: null,
    words: null,
  });
  /** Says so when a load started in one block landed in the other. */
  const [routedNotes, setRoutedNotes] = useState<Record<MonkeytypeKind, string | null>>({
    quotes: null,
    words: null,
  });

  /**
   * Validate, parse and hand over text content, whatever fetched it. The file's
   * own kind decides which slot it lands in, so the block it was started from
   * says where it actually went. Returns false when the data was rejected,
   * with the reasons already on screen.
   */
  const commitText = (data: unknown, source: string, from: MonkeytypeKind): boolean => {
    const validation = validateTextContent(data);
    if (!validation.valid) {
      setErrors(prev => ({ ...prev, [from]: validation.errors }));
      return false;
    }
    const parsed = parseTextContent(data);
    if (!parsed) {
      setErrors(prev => ({ ...prev, [from]: ['Failed to parse text content'] }));
      return false;
    }
    onTextLoaded(parsed);
    setSources(prev => ({ ...prev, [parsed.type]: source }));
    setErrors(prev => ({ ...prev, [from]: undefined }));
    setRoutedNotes(prev => ({
      ...prev,
      [from]:
        parsed.type === from
          ? null
          : `That file is a ${parsed.type === 'words' ? 'word list' : 'quote list'} — it loaded into ${SLOT_TITLES[parsed.type]}.`,
      [parsed.type]: null,
    }));
    return true;
  };

  const reportTextError = (from: MonkeytypeKind, messages: string[]) => {
    setErrors(prev => ({ ...prev, [from]: messages }));
    setRoutedNotes(prev => ({ ...prev, [from]: null }));
  };

  /** Fetched once per kind, when that block's picker is first used. */
  const ensureMonkeytypeNames = async (kind: MonkeytypeKind) => {
    if (monkeytypeNames[kind].length > 0) return;
    setMonkeytypeListNotes(prev => ({ ...prev, [kind]: 'Fetching names…' }));
    try {
      // Repeated focus while this is in flight reuses the cached promise, so
      // the rate-limited listing API is still asked only once per kind.
      const names = await listMonkeytypeNames(kind);
      setMonkeytypeNames(prev => ({ ...prev, [kind]: names }));
      setMonkeytypeListNotes(prev => ({ ...prev, [kind]: null }));
    } catch (err) {
      // Suggestions are a convenience; typing a name still works without them.
      setMonkeytypeListNotes(prev => ({
        ...prev,
        [kind]: `Could not list names (${err instanceof Error ? err.message : 'Unknown error'}) — type one anyway`,
      }));
    }
  };

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

  // A sidebar rather than a dialog: configuration stays open while you type,
  // so there is no backdrop and nothing over the trainer. The trainer reserves
  // the width on its side. `data-config-panel` marks the region as part of the
  // panel, so focus handling elsewhere can leave fields in here alone.
  return (
    <aside
      data-config-panel="true"
      aria-label="Configuration"
      className="fixed top-0 right-0 z-40 h-screen w-[22rem] flex flex-col bg-gray-800 border-l border-gray-700"
    >
      <div className="flex justify-between items-center px-5 py-4 border-b border-gray-700 flex-shrink-0">
        <h2 className="text-xl font-bold text-yellow-400">Configuration</h2>
        <button
          onClick={onClose}
          title="Close configuration"
          className="text-gray-400 hover:text-gray-200 transition-colors"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        {/* Keyboard Layout Section */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-white mb-3">Keyboard Layout</h3>
          {layout && <div className="text-sm text-green-400 mb-2">✓ Loaded: {layout.name}</div>}
          <div className="flex gap-2 mb-3">
            <label className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded cursor-pointer transition-colors text-sm">
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
          {errors.layout && <ErrorList messages={errors.layout} />}
        </div>

        {/* Keymap Section */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-white mb-3">ZMK Keymap</h3>
          {keymap && (
            <div className="text-sm text-green-400 mb-2">
              ✓ Loaded: {keymap.layers.length} layers
            </div>
          )}
          <div className="flex gap-2 mb-3">
            <label className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded cursor-pointer transition-colors text-sm">
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
          {errors.keymap && <ErrorList messages={errors.keymap} />}
        </div>

        {/* The two source slots, both live at once. */}
        <TextSourceBlock
          kind="words"
          content={wordList}
          source={sources.words}
          note={routedNotes.words}
          errors={errors.words}
          names={monkeytypeNames.words}
          listNote={monkeytypeListNotes.words}
          onNeedNames={ensureMonkeytypeNames}
          onData={commitText}
          onError={reportTextError}
        />
        <TextSourceBlock
          kind="quotes"
          content={quoteList}
          source={sources.quotes}
          note={routedNotes.quotes}
          errors={errors.quotes}
          names={monkeytypeNames.quotes}
          listNote={monkeytypeListNotes.quotes}
          onNeedNames={ensureMonkeytypeNames}
          onData={commitText}
          onError={reportTextError}
        />

        {/* Lesson */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-white mb-3">Lesson</h3>
          <label className="block">
            <span className="block text-sm text-gray-400 mb-2">
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
          <div className="mt-4">
            <span className="block text-sm text-gray-400 mb-2">
              Unlock order — which character guided mode teaches next
            </span>
            <div className="flex gap-2 text-sm">
              {UNLOCK_POLICIES.map(({ value, label, hint }) => (
                <button
                  key={value}
                  type="button"
                  title={hint}
                  onClick={() => onSettingsChange({ ...settings, unlockPolicy: value })}
                  aria-pressed={settings.unlockPolicy === value}
                  className={`px-3 py-2 rounded transition-colors ${
                    settings.unlockPolicy === value
                      ? 'bg-yellow-400 text-gray-900'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
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
    </aside>
  );
};
