import React, { useMemo, useState } from 'react';
import { AlertTriangle, ChevronRight, RotateCcw, Trash2, Upload, XCircle } from 'lucide-react';
import type { KeyboardLayout, ParsedKeymap, Settings, TextContent, UnlockPolicy } from '../types';
import type { MonkeytypeEntry, MonkeytypeKind, MonkeytypeScript } from '../utils/fileLoader';
import {
  MONKEYTYPE_SCRIPTS,
  classifyMonkeytypeName,
  compareMonkeytypeEntries,
  listMonkeytypeNames,
  loadFileAsJson,
  loadFileAsText,
  loadJsonFromUrl,
  loadMonkeytypeJson,
  loadTextFromUrl,
  parseMonkeytypeRef,
  typeableScripts,
} from '../utils/fileLoader';
import { buildCharIndex } from '../utils/keyIndex';
import { validateKeyboardLayout } from '../utils/layoutValidator';
import { parseZmkKeymap, validateParsedKeymap } from '../utils/zmkParser';
import { parseTextContent, validateTextContent } from '../utils/textLoader';

const MIN_TARGET_WPM = 10;
const MAX_TARGET_WPM = 150;

/**
 * Below this share of typeable characters a source is called out as a warning
 * rather than a note. One character in ten unreachable means a typical word
 * contains one: practice stops at a wall instead of stumbling over the odd
 * accent, which is what the band above this threshold looks like.
 */
const COVERAGE_WARN = 0.9;

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

/** Shown in the picker field so the shape of a name is obvious. */
const MONKEYTYPE_EXAMPLES: Record<MonkeytypeKind, string> = {
  quotes: 'english, german, latin',
  words: 'english_1k, spanish_10k',
};

interface ConfigPanelProps {
  layout: KeyboardLayout | null;
  keymap: ParsedKeymap | null;
  wordList: TextContent | null;
  quoteList: TextContent | null;
  /** A validated, parsed source; the trainer routes it to the slot matching its type. */
  onTextLoaded: (text: TextContent) => void;
  /** Unload a source slot entirely. */
  onTextCleared: (kind: MonkeytypeKind) => void;
  /** Reload the bundled default into a slot. */
  onTextReset: (kind: MonkeytypeKind) => void;
  /** Which slot the guided corpus is coming from right now; null when neither can serve. */
  guidedCorpus: MonkeytypeKind | null;
  /** Share (0..1) of each loaded source's characters the keymap can produce; null when either is empty. */
  coverage: { words: number | null; quotes: number | null };
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

/** What a loaded slot holds, without casting unvalidated shapes. */
function describeContent(content: TextContent): { count: string; name: string } {
  const data = content.data;
  if ('words' in data) {
    return {
      count: `${data.words.length} word${data.words.length === 1 ? '' : 's'}`,
      name: data.name,
    };
  }
  return {
    count: `${data.quotes.length} quote${data.quotes.length === 1 ? '' : 's'}`,
    name: data.language,
  };
}

const ErrorList: React.FC<{ messages: string[] }> = ({ messages }) => (
  <div className="flex gap-1.5 rounded border border-red-500/70 bg-red-900/30 p-2">
    <XCircle size={13} className="mt-px flex-shrink-0 text-red-400" />
    <div className="min-w-0 break-words text-[11px] leading-snug text-red-300">
      {messages.map((message, i) => (
        <div key={i}>{message}</div>
      ))}
    </div>
  </div>
);

/**
 * A collapsible section. The summary carries the section's state, so a closed
 * section still answers the question most visits ask ("what is loaded?") in one
 * row — which is what makes the whole panel fit on screen. Open state is held
 * here rather than left to the `<details>` element so a re-render cannot snap
 * a section the user opened back shut.
 */
const Section: React.FC<{
  title: string;
  status?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}> = ({ title, status, defaultOpen = false, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details
      open={open}
      onToggle={e => setOpen(e.currentTarget.open)}
      className="group border-b border-gray-700/60 py-2"
    >
      <summary className="flex cursor-pointer select-none list-none items-center gap-1.5 [&::-webkit-details-marker]:hidden">
        <ChevronRight
          size={13}
          className="flex-shrink-0 text-gray-500 transition-transform group-open:rotate-90"
        />
        <span className="text-sm font-semibold text-gray-200">{title}</span>
        <span className="ml-auto min-w-0 truncate pl-2 text-[11px] text-gray-400">{status}</span>
      </summary>
      <div className="mt-2 space-y-2 pl-[1.15rem]">{children}</div>
    </details>
  );
};

/**
 * File picker and URL field on one row. Uploading is the rarest of the three
 * ways to load anything, so it is an icon the size of the Load button rather
 * than the widest, bluest thing in the section.
 */
const LoadRow: React.FC<{
  accept: string;
  label: string;
  placeholder: string;
  busyFile: boolean;
  busyUrl: boolean;
  onFile: (file: File) => void;
  onUrl: (url: string) => void;
}> = ({ accept, label, placeholder, busyFile, busyUrl, onFile, onUrl }) => {
  const [url, setUrl] = useState('');
  return (
    <div className="flex gap-1.5">
      <label
        title={`Upload a ${accept} file`}
        className="flex cursor-pointer items-center rounded border border-gray-600 bg-gray-700 px-2 text-gray-200 transition-colors hover:bg-gray-600"
      >
        {busyFile ? <span className="text-xs">…</span> : <Upload size={13} />}
        <input
          type="file"
          accept={accept}
          aria-label={`Upload ${label} file`}
          onChange={e => e.target.files?.[0] && onFile(e.target.files[0])}
          className="hidden"
          disabled={busyFile}
        />
      </label>
      <input
        type="text"
        value={url}
        placeholder={placeholder}
        aria-label={`${label} URL`}
        onChange={e => setUrl(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && onUrl(url)}
        className="min-w-0 flex-1 rounded border border-gray-600 bg-gray-700 px-2 py-1 text-xs text-white outline-none focus:border-yellow-400"
      />
      <button
        type="button"
        onClick={() => onUrl(url)}
        disabled={busyUrl || !url.trim()}
        className="rounded bg-gray-700 px-2 py-1 text-xs text-gray-200 transition-colors hover:bg-gray-600 disabled:opacity-40 disabled:hover:bg-gray-700"
      >
        {busyUrl ? '…' : 'Load'}
      </button>
    </div>
  );
};

interface MonkeytypePickerProps {
  kind: MonkeytypeKind;
  names: string[];
  /** Replaces the count line while the listing is in flight or failed. */
  listNote: string | null;
  /** Scripts the keymap can practise; null when there is no keymap to judge by. */
  scripts: Set<MonkeytypeScript> | null;
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
 *
 * Both directories are flat dumps of everything MonkeyType has, so the list is
 * narrowed to prose in a script this keymap can produce — `code_ruby` as a
 * "word list" is `FileTest Thread::Mutex __LINE__ redo`, and a Hebrew list on a
 * Latin keymap is a wall. The narrowing is two toggle chips rather than a
 * "show all" button or group headings: a chip keeps the fact that something was
 * filtered, the size of what was filtered, and the way back all on one row, and
 * it is the only shape that stays honest when the classification (a guess from
 * the file name) is wrong about a name the user wanted.
 */
const MonkeytypePicker: React.FC<MonkeytypePickerProps> = ({
  kind,
  names,
  listNote,
  scripts,
  onNeedNames,
  busy,
  onPick,
}) => {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [showCode, setShowCode] = useState(false);
  const [showOtherScripts, setShowOtherScripts] = useState(false);

  // Hundreds of short names; classified once per listing rather than per keystroke.
  const entries = useMemo(
    () => names.map(classifyMonkeytypeName).sort(compareMonkeytypeEntries),
    [names]
  );

  const trimmed = query.trim();
  const needle = trimmed.toLowerCase();
  const offered = (entry: MonkeytypeEntry) =>
    (entry.content === 'prose' || showCode) &&
    (scripts === null || scripts.has(entry.script) || showOtherScripts);

  const matches = entries.filter(
    entry => offered(entry) && (!needle || entry.name.toLowerCase().includes(needle))
  );
  const filteredOut = entries.length - entries.filter(offered).length;
  const hiddenMatches = needle
    ? entries.filter(entry => !offered(entry) && entry.name.toLowerCase().includes(needle)).length
    : 0;
  const codeCount = entries.filter(entry => entry.content === 'code').length;
  const otherScriptCount =
    scripts === null
      ? 0
      : entries.filter(entry => entry.content === 'prose' && !scripts.has(entry.script)).length;

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
      submit(active >= 0 ? matches[active].name : trimmed);
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

  const chip = (pressed: boolean, label: string, title: string, toggle: () => void) => (
    <button
      type="button"
      title={title}
      aria-pressed={pressed}
      onMouseDown={e => e.preventDefault()}
      onClick={toggle}
      className={`rounded-full px-2 py-px text-[10px] transition-colors ${
        pressed
          ? 'bg-yellow-400 text-gray-900'
          : 'bg-gray-700 text-gray-400 hover:bg-gray-600 hover:text-gray-200'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div>
      <div className="flex gap-1.5">
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-label={`MonkeyType ${kind} file name`}
          value={query}
          placeholder={`MonkeyType ${kind} — ${MONKEYTYPE_EXAMPLES[kind]}`}
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
          className="min-w-0 flex-1 rounded border border-gray-600 bg-gray-700 px-2 py-1 text-xs text-white outline-none focus:border-yellow-400"
        />
        <button
          type="button"
          onClick={() => submit(query)}
          disabled={busy || !trimmed}
          className="rounded bg-gray-700 px-2 py-1 text-xs text-gray-200 transition-colors hover:bg-gray-600 disabled:opacity-40 disabled:hover:bg-gray-700"
        >
          {busy ? '…' : 'Load'}
        </button>
      </div>
      {open && (
        <ul className="mt-1 max-h-40 overflow-y-auto rounded border border-gray-700 bg-gray-900">
          {matches.map((entry, i) => (
            <li key={entry.name}>
              <button
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => {
                  setQuery(entry.name);
                  submit(entry.name);
                }}
                className={`flex w-full items-baseline gap-2 px-2 py-1 text-left font-mono text-[11px] transition-colors ${
                  i === active
                    ? 'bg-yellow-400 text-gray-900'
                    : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                }`}
              >
                <span className="truncate">{entry.name}</span>
                {(entry.content === 'code' || entry.script !== 'latin') && (
                  <span className={`ml-auto flex-shrink-0 ${i === active ? '' : 'text-gray-500'}`}>
                    {entry.content === 'code' ? 'code' : MONKEYTYPE_SCRIPTS[entry.script].label}
                  </span>
                )}
              </button>
            </li>
          ))}
          {matches.length === 0 && (
            <li className="px-2 py-1.5 text-[11px] text-gray-500">
              {entries.length === 0
                ? 'No names listed — type one and press Load'
                : `Nothing shown matches "${trimmed}" — Load tries it anyway`}
            </li>
          )}
        </ul>
      )}
      {entries.length > 0 && (codeCount > 0 || otherScriptCount > 0) && (
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {codeCount > 0 &&
            chip(
              showCode,
              `code ${codeCount}`,
              'Lists of source tokens rather than prose, guessed from the file name',
              () => setShowCode(prev => !prev)
            )}
          {otherScriptCount > 0 &&
            chip(
              showOtherScripts,
              `other scripts ${otherScriptCount}`,
              'Languages written in a script this keymap does not produce',
              () => setShowOtherScripts(prev => !prev)
            )}
        </div>
      )}
      <p className="mt-1 text-[11px] leading-snug text-gray-500">
        {listNote ??
          (entries.length === 0
            ? 'Names load from their repository when you use this field'
            : `${matches.length} of ${entries.length} ${kind} files${
                filteredOut > 0 ? `, ${filteredOut} filtered out by name` : ''
              }${hiddenMatches > 0 ? ` (${hiddenMatches} of them match)` : ''}`)}
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
  scripts: Set<MonkeytypeScript> | null;
  guidedCorpus: MonkeytypeKind | null;
  coverage: number | null;
  onNeedNames: (kind: MonkeytypeKind) => void;
  /** Validate, parse and hand over; false when the data was rejected. */
  onData: (data: unknown, source: string, from: MonkeytypeKind) => boolean;
  onError: (from: MonkeytypeKind, messages: string[]) => void;
  onClear: (kind: MonkeytypeKind) => void;
  onReset: (kind: MonkeytypeKind) => void;
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
  scripts,
  guidedCorpus,
  coverage,
  onNeedNames,
  onData,
  onError,
  onClear,
  onReset,
}) => {
  const [busy, setBusy] = useState<{ file?: boolean; url?: boolean; monkeytype?: boolean }>({});
  /**
   * Discarding a source is one click away but never one *stray* click away: the
   * button states what it will do, then asks again in red before doing it, and
   * forgets the moment focus leaves.
   */
  const [armed, setArmed] = useState<'reset' | 'clear' | null>(null);

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

  const handleUrl = async (url: string) => {
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

  const arm = (action: 'reset' | 'clear') => {
    // Nothing loaded means nothing to lose: asking "replace with default?" of
    // an empty slot is a confirmation of nothing.
    if (armed !== action && content !== null) {
      setArmed(action);
      return;
    }
    setArmed(null);
    if (action === 'reset') onReset(kind);
    else onClear(kind);
  };

  const described = content ? describeContent(content) : null;
  const guidedLine =
    kind === 'words'
      ? guidedCorpus === 'words'
        ? 'Guided practice draws its alphabet and words from this list.'
        : `Guided practice would draw from this list; ${
            guidedCorpus === 'quotes' ? 'the quote list is standing in' : 'nothing is standing in'
          }.`
      : guidedCorpus === 'quotes'
        ? 'Standing in for guided practice, tokenised, because no word list is loaded.'
        : null;

  const danger = 'rounded px-1.5 py-0.5 transition-colors';

  return (
    <Section
      title={SLOT_TITLES[kind]}
      defaultOpen
      status={
        described ? (
          <span className="text-green-400">{described.count}</span>
        ) : (
          <span className="text-gray-500">not loaded</span>
        )
      }
    >
      {described && (
        <div className="truncate text-[11px] text-gray-400" title={source ?? undefined}>
          {described.name}
          {source && <span className="text-gray-600"> · {source}</span>}
        </div>
      )}
      {guidedLine && <div className="text-[11px] leading-snug text-gray-500">{guidedLine}</div>}
      {coverage !== null &&
        coverage < 1 &&
        (coverage < COVERAGE_WARN ? (
          <div className="flex gap-1.5 text-[11px] leading-snug text-amber-300">
            <AlertTriangle size={12} className="mt-px flex-shrink-0" />
            <span>
              {coverage === 0
                ? 'None of its characters are on this keymap — nothing in it can be typed here.'
                : `Only ${Math.floor(coverage * 100)}% of its characters are on this keymap — practice will stall on the rest.`}
            </span>
          </div>
        ) : (
          <div className="text-[11px] leading-snug text-gray-500">
            This keymap types {Math.floor(coverage * 100)}% of its characters; the rest will show
            the &ldquo;not on this keymap&rdquo; notice.
          </div>
        ))}

      <MonkeytypePicker
        kind={kind}
        names={names}
        listNote={listNote}
        scripts={scripts}
        onNeedNames={() => onNeedNames(kind)}
        busy={busy.monkeytype ?? false}
        onPick={handleMonkeytype}
      />

      <LoadRow
        accept=".json"
        label={SLOT_TITLES[kind]}
        placeholder={`URL, or monkeytype:${kind}/name`}
        busyFile={busy.file ?? false}
        busyUrl={busy.url ?? false}
        onFile={handleFile}
        onUrl={handleUrl}
      />

      <div className="flex items-center justify-end gap-2 text-[11px]" onBlur={() => setArmed(null)}>
        <button
          type="button"
          onClick={() => arm('reset')}
          title="Load the bundled default back into this slot"
          className={`${danger} flex items-center gap-1 ${
            armed === 'reset'
              ? 'bg-yellow-400/20 text-yellow-200 ring-1 ring-yellow-400/70'
              : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'
          }`}
        >
          <RotateCcw size={11} />
          {armed === 'reset' ? 'Replace with default?' : 'Reset to default'}
        </button>
        <button
          type="button"
          onClick={() => arm('clear')}
          disabled={!content}
          title={`Remove this ${kind === 'words' ? 'word list' : 'quote list'} — the ${kind} lesson will have no source`}
          className={`${danger} flex items-center gap-1 disabled:opacity-30 disabled:hover:bg-transparent ${
            armed === 'clear'
              ? 'bg-red-500/20 text-red-300 ring-1 ring-red-500/70'
              : 'text-gray-400 hover:bg-red-900/50 hover:text-red-200'
          }`}
        >
          <Trash2 size={11} />
          {armed === 'clear' ? 'Unload for good?' : 'Unload'}
        </button>
      </div>

      {note && <div className="text-[11px] leading-snug text-yellow-400">{note}</div>}
      {errors && <ErrorList messages={errors} />}
    </Section>
  );
};

export const ConfigPanel: React.FC<ConfigPanelProps> = ({
  layout,
  keymap,
  wordList,
  quoteList,
  onTextLoaded,
  onTextCleared,
  onTextReset,
  guidedCorpus,
  coverage,
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
   * Which scripts this keymap can practise, so the pickers can offer the
   * languages it is able to type. With no keymap there is nothing to judge by,
   * so the script filter is off rather than guessing.
   */
  const scripts = useMemo(() => {
    if (!keymap) return null;
    const index = buildCharIndex(keymap);
    return typeableScripts(char => index.has(char));
  }, [keymap]);

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

  /** The slot is emptied by the trainer; the panel drops what it said about it. */
  const clearText = (kind: MonkeytypeKind) => {
    onTextCleared(kind);
    setSources(prev => ({ ...prev, [kind]: null }));
    setErrors(prev => ({ ...prev, [kind]: undefined }));
    setRoutedNotes(prev => ({ ...prev, [kind]: null }));
  };

  const resetText = (kind: MonkeytypeKind) => {
    onTextReset(kind);
    setSources(prev => ({ ...prev, [kind]: 'bundled default' }));
    setErrors(prev => ({ ...prev, [kind]: undefined }));
    setRoutedNotes(prev => ({ ...prev, [kind]: null }));
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

  const policy = UNLOCK_POLICIES.find(entry => entry.value === settings.unlockPolicy);

  // A sidebar rather than a dialog: configuration stays open while you type,
  // so there is no backdrop and nothing over the trainer. The trainer reserves
  // the width on its side. `data-config-panel` marks the region as part of the
  // panel, so focus handling elsewhere can leave fields in here alone.
  return (
    <aside
      data-config-panel="true"
      aria-label="Configuration"
      className="fixed top-0 right-0 z-40 flex h-screen w-[22rem] flex-col border-l border-gray-700 bg-gray-800"
    >
      <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-700 px-4 py-2">
        <h2 className="text-sm font-bold tracking-wide text-yellow-400">Configuration</h2>
        <button
          onClick={onClose}
          title="Close configuration"
          className="rounded px-2 py-0.5 text-xs text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
        >
          Done ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-1">
        {/* Keyboard and keymap are set once and rarely revisited, so they stay
            folded with their state on the summary row. */}
        <Section title="Keyboard layout" status={layout ? layout.name : 'not loaded'}>
          <LoadRow
            accept=".json"
            label="Keyboard layout"
            placeholder="Keyboard layout URL"
            busyFile={loading.layout ?? false}
            busyUrl={loading.layoutUrl ?? false}
            onFile={handleLayoutFile}
            onUrl={handleLayoutUrl}
          />
          {errors.layout && <ErrorList messages={errors.layout} />}
        </Section>

        <Section
          title="ZMK keymap"
          status={keymap ? `${keymap.layers.length} layers` : 'not loaded'}
        >
          <LoadRow
            accept=".keymap"
            label="Keymap"
            placeholder="Keymap URL"
            busyFile={loading.keymap ?? false}
            busyUrl={loading.keymapUrl ?? false}
            onFile={handleKeymapFile}
            onUrl={handleKeymapUrl}
          />
          {errors.keymap && <ErrorList messages={errors.keymap} />}
        </Section>

        {/* The two source slots, both live at once. */}
        <TextSourceBlock
          kind="words"
          content={wordList}
          source={sources.words}
          note={routedNotes.words}
          errors={errors.words}
          names={monkeytypeNames.words}
          listNote={monkeytypeListNotes.words}
          scripts={scripts}
          guidedCorpus={guidedCorpus}
          coverage={coverage.words}
          onNeedNames={ensureMonkeytypeNames}
          onData={commitText}
          onError={reportTextError}
          onClear={clearText}
          onReset={resetText}
        />
        <TextSourceBlock
          kind="quotes"
          content={quoteList}
          source={sources.quotes}
          note={routedNotes.quotes}
          errors={errors.quotes}
          names={monkeytypeNames.quotes}
          listNote={monkeytypeListNotes.quotes}
          scripts={scripts}
          guidedCorpus={guidedCorpus}
          coverage={coverage.quotes}
          onNeedNames={ensureMonkeytypeNames}
          onData={commitText}
          onError={reportTextError}
          onClear={clearText}
          onReset={resetText}
        />

        <Section
          title="Lesson"
          defaultOpen
          status={`${settings.targetWpm} wpm · ${policy ? policy.label.toLowerCase() : ''}`}
        >
          <label className="flex items-center gap-2">
            <span className="flex-1 text-[11px] leading-snug text-gray-400">
              Target speed — the pace a character must hold to count as learned
            </span>
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
              className="w-14 rounded border border-gray-600 bg-gray-700 px-2 py-1 text-xs text-white outline-none focus:border-yellow-400"
            />
            <span className="text-[11px] text-gray-400">wpm</span>
          </label>
          <div>
            <div className="mb-1 text-[11px] leading-snug text-gray-400">
              Unlock order — which character guided mode teaches next
            </div>
            <div className="flex gap-1">
              {UNLOCK_POLICIES.map(({ value, label, hint }) => (
                <button
                  key={value}
                  type="button"
                  title={hint}
                  onClick={() => onSettingsChange({ ...settings, unlockPolicy: value })}
                  aria-pressed={settings.unlockPolicy === value}
                  className={`rounded px-1.5 py-0.5 text-[11px] transition-colors ${
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
        </Section>

        <Section
          title="Results"
          status={historyRuns === 0 ? 'no runs yet' : `${historyRuns} stored`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] leading-snug text-gray-400">
              {historyRuns === 0
                ? 'No runs recorded yet'
                : `${historyRuns} run${historyRuns === 1 ? '' : 's'} stored in this browser`}
            </span>
            <button
              onClick={onClearHistory}
              disabled={historyRuns === 0}
              className="flex-shrink-0 rounded bg-gray-700 px-2 py-1 text-[11px] text-gray-200 transition-colors hover:bg-red-900/60 hover:text-red-200 disabled:opacity-40 disabled:hover:bg-gray-700 disabled:hover:text-gray-200"
            >
              Clear history
            </button>
          </div>
        </Section>
      </div>
    </aside>
  );
};
