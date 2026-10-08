export async function loadFileAsJson(file: File): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result;
        if (typeof content !== 'string') {
          reject(new Error('File content is not text'));
          return;
        }
        resolve(JSON.parse(content));
      } catch (err) {
        reject(new Error(`Failed to parse JSON: ${err instanceof Error ? err.message : 'Unknown error'}`));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

export async function loadFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result;
      if (typeof content !== 'string') {
        reject(new Error('File content is not text'));
        return;
      }
      resolve(content);
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

export async function loadJsonFromUrl(url: string): Promise<unknown> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.json();
  } catch (err) {
    throw new Error(
      `Failed to load from URL: ${err instanceof Error ? err.message : 'Unknown error'}`
    );
  }
}

export async function loadTextFromUrl(url: string): Promise<string> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.text();
  } catch (err) {
    throw new Error(
      `Failed to load from URL: ${err instanceof Error ? err.message : 'Unknown error'}`
    );
  }
}

/**
 * MonkeyType keeps its practice material as plain JSON files in its repository,
 * and raw.githubusercontent.com serves them with `access-control-allow-origin: *`,
 * so a browser can fetch them directly — nothing needs to be vendored here.
 * Quote files live under `quotes/`, word lists under `languages/`; the
 * directory is the only difference, so a reference is a kind plus a name.
 */
const MONKEYTYPE_RAW_BASE =
  'https://raw.githubusercontent.com/monkeytypegame/monkeytype/master/frontend/static';

/**
 * There is no index file in that repository any more — the frontend compiles
 * its list of languages from TypeScript constants — so the directory listing
 * API is what tells us at runtime which files exist. It is rate limited
 * (60 requests per hour per address), hence one request per directory per
 * session, and names a user types work whether or not the listing arrives.
 */
const MONKEYTYPE_API_BASE =
  'https://api.github.com/repos/monkeytypegame/monkeytype/contents/frontend/static';

const MONKEYTYPE_SCHEME = 'monkeytype:';

export type MonkeytypeKind = 'quotes' | 'words';

export const MONKEYTYPE_KINDS: MonkeytypeKind[] = ['quotes', 'words'];

const MONKEYTYPE_DIR: Record<MonkeytypeKind, string> = {
  quotes: 'quotes',
  words: 'languages',
};

/** A kind of `null` means the user did not say, so both directories are tried. */
export interface MonkeytypeRef {
  kind: MonkeytypeKind | null;
  name: string;
}

/** File names are plain identifiers, with `+` for files like `code_c++`. */
const MONKEYTYPE_NAME = /^[A-Za-z0-9_.+-]+$/;

export function monkeytypeFileUrl(kind: MonkeytypeKind, name: string): string {
  return `${MONKEYTYPE_RAW_BASE}/${MONKEYTYPE_DIR[kind]}/${encodeURIComponent(name)}.json`;
}

/**
 * Read a `monkeytype:` shorthand, or null when the input is an ordinary URL.
 * Accepted: `monkeytype:english`, `monkeytype:quotes/english`,
 * `monkeytype:words/english_1k`, and `languages/` as a synonym for `words/`
 * because that is what the directory is really called. A trailing `.json` is
 * dropped so that pasting a file name also works.
 */
export function parseMonkeytypeRef(input: string): MonkeytypeRef | null {
  const trimmed = input.trim();
  if (!trimmed.toLowerCase().startsWith(MONKEYTYPE_SCHEME)) return null;

  let rest = trimmed.slice(MONKEYTYPE_SCHEME.length).trim().replace(/^\/+/, '');
  let kind: MonkeytypeKind | null = null;
  const slash = rest.indexOf('/');
  if (slash !== -1) {
    const prefix = rest.slice(0, slash).toLowerCase();
    if (prefix === 'quotes') kind = 'quotes';
    else if (prefix === 'words' || prefix === 'languages') kind = 'words';
    if (kind) rest = rest.slice(slash + 1);
  }

  return { kind, name: rest.replace(/\.json$/i, '') };
}

/**
 * Fetch a MonkeyType file, reporting back which URL answered so the UI can say
 * where the text came from. A missing name is the common mistake, so it gets
 * an error naming every URL that was tried rather than a bare 404.
 */
export async function loadMonkeytypeJson(
  ref: MonkeytypeRef
): Promise<{ data: unknown; url: string; kind: MonkeytypeKind }> {
  const name = ref.name.trim();
  if (!name) {
    throw new Error('MonkeyType reference needs a name, for example monkeytype:english');
  }
  if (!MONKEYTYPE_NAME.test(name)) {
    throw new Error(
      `"${name}" is not a MonkeyType file name — use letters, digits, "_", ".", "+" or "-"`
    );
  }

  const kinds = ref.kind ? [ref.kind] : MONKEYTYPE_KINDS;
  const tried: string[] = [];

  for (const kind of kinds) {
    const url = monkeytypeFileUrl(kind, name);
    tried.push(url);
    const response = await fetch(url);
    if (response.status === 404) continue;
    if (!response.ok) {
      throw new Error(`Failed to load ${url}: HTTP ${response.status} ${response.statusText}`);
    }
    // The files are served as text/plain, so the body is parsed explicitly.
    const body = await response.text();
    try {
      return { data: JSON.parse(body), url, kind };
    } catch (err) {
      throw new Error(
        `${url} is not valid JSON: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
    }
  }

  const where = ref.kind ? `MonkeyType ${ref.kind} file` : 'MonkeyType file';
  throw new Error(`No ${where} named "${name}" — tried ${tried.join(' and ')}`);
}

const monkeytypeListings = new Map<MonkeytypeKind, Promise<string[]>>();

/**
 * Every file name MonkeyType currently publishes for a kind, so the picker
 * stays right as they add files. Cached per session; a failed listing is not
 * cached, so reopening the panel retries.
 */
export async function listMonkeytypeNames(kind: MonkeytypeKind): Promise<string[]> {
  const cached = monkeytypeListings.get(kind);
  if (cached) return cached;

  const pending = (async () => {
    const url = `${MONKEYTYPE_API_BASE}/${MONKEYTYPE_DIR[kind]}`;
    const response = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const body: unknown = await response.json();
    if (!Array.isArray(body)) {
      throw new Error('Unexpected directory listing');
    }
    const entries: unknown[] = body;
    const names: string[] = [];
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object' || !('name' in entry)) continue;
      const name = entry.name;
      if (typeof name !== 'string' || !name.endsWith('.json')) continue;
      names.push(name.slice(0, -'.json'.length));
    }
    return names.sort();
  })();

  monkeytypeListings.set(kind, pending);
  pending.catch(() => monkeytypeListings.delete(kind));
  return pending;
}

/* ------------------------------------------------------------------------ *
 * Classifying a MonkeyType name.
 *
 * The two directories are flat and mixed: ~450 word lists and ~90 quote files
 * holding prose in every script MonkeyType supports, dumps of source tokens
 * (`code_ruby` is `FileTest Thread::Mutex __LINE__ redo`, which nobody picked
 * a "word list" to practise), and size variants of one corpus (`english`,
 * `english_1k` … `english_450k`). A picker that lists all of them flat offers
 * mostly things the trainer cannot usefully teach on a given keymap.
 *
 * What follows is a HEURISTIC over file *names*: nothing is downloaded to
 * classify it, so a file whose contents disagree with its name, or one added
 * after this table was written, lands in the wrong group. It is therefore only
 * ever allowed to group and order the picker — never to refuse a name. A name
 * typed by hand still loads whatever it turns out to be.
 * ------------------------------------------------------------------------ */

export type MonkeytypeScript =
  | 'latin'
  | 'cyrillic'
  | 'greek'
  | 'hebrew'
  | 'arabic'
  | 'armenian'
  | 'georgian'
  | 'devanagari'
  | 'bengali'
  | 'gujarati'
  | 'kannada'
  | 'malayalam'
  | 'tamil'
  | 'telugu'
  | 'sinhala'
  | 'thai'
  | 'lao'
  | 'khmer'
  | 'burmese'
  | 'tibetan'
  | 'ethiopic'
  | 'han'
  | 'kana'
  | 'hangul'
  | 'olchiki';

/**
 * A display name plus ten characters that are common in the script. The sample
 * is what decides whether a keymap can practise the script at all; this module
 * has no character index, so the caller supplies the test.
 */
export const MONKEYTYPE_SCRIPTS: Record<MonkeytypeScript, { label: string; sample: string }> = {
  latin: { label: 'Latin', sample: 'etaoinshrd' },
  cyrillic: { label: 'Cyrillic', sample: 'оеаинтсрвл' },
  greek: { label: 'Greek', sample: 'αβγδεζηθικ' },
  hebrew: { label: 'Hebrew', sample: 'אבגדהוזחטי' },
  arabic: { label: 'Arabic', sample: 'ابتثجحخدذر' },
  armenian: { label: 'Armenian', sample: 'աբգդեզէըթժ' },
  georgian: { label: 'Georgian', sample: 'აბგდევზთიკ' },
  devanagari: { label: 'Devanagari', sample: 'अआइईउकखगचज' },
  bengali: { label: 'Bengali', sample: 'অআইঈউকখগচজ' },
  gujarati: { label: 'Gujarati', sample: 'અઆઇઈઉકખગચજ' },
  kannada: { label: 'Kannada', sample: 'ಅಆಇಈಉಕಖಗಚಜ' },
  malayalam: { label: 'Malayalam', sample: 'അആഇഈഉകഖഗചജ' },
  tamil: { label: 'Tamil', sample: 'அஆஇஈஉகஙசஞட' },
  telugu: { label: 'Telugu', sample: 'అఆఇఈఉకఖగచజ' },
  sinhala: { label: 'Sinhala', sample: 'අආඇඉඊකඛගඝච' },
  thai: { label: 'Thai', sample: 'กขคงจฉชญดต' },
  lao: { label: 'Lao', sample: 'ກຂຄງຈຊຍດຕຖ' },
  khmer: { label: 'Khmer', sample: 'កខគឃងចឆជឈញ' },
  burmese: { label: 'Burmese', sample: 'ကခဂဃငစဆဇဈည' },
  tibetan: { label: 'Tibetan', sample: 'ཀཁགངཅཆཇཉཏཐ' },
  ethiopic: { label: 'Ethiopic', sample: 'ሀለሐመሠረሰቀበተ' },
  han: { label: 'Chinese', sample: '的一是不了在人有我他' },
  kana: { label: 'Japanese kana', sample: 'あいうえおかきくけこ' },
  hangul: { label: 'Korean', sample: '가나다라마바사아자차' },
  olchiki: { label: 'Ol Chiki', sample: 'ᱚᱛᱜᱝᱞᱟᱠᱡᱢᱣ' },
};

/** `english_450k` -> 450000, the corpus-size suffix MonkeyType uses. */
const SIZE_SUFFIX = /_(\d+)k$/;

/**
 * Token dumps rather than prose. `code_` is MonkeyType's own prefix; these two
 * are the command dumps that do not carry it.
 */
const NON_PROSE_NAMES: Record<string, true> = { git: true, docker_file: true };

/**
 * Transliterations. MonkeyType names the Latin-script edition of a language
 * after the language itself, so these suffixes have to beat the table below.
 */
const LATIN_EDITION = /_(latin|latynka|lacinka|romanized|romaji|roman)$/;

/**
 * Language name -> the script its files are written in. Matched against the
 * name with the size suffix removed, at a `_` boundary, longest key first, so
 * `arabic_egypt` follows `arabic` while `greeklish` and `hinglish` do not
 * follow `greek` and `hindi`. Anything unlisted is assumed Latin, which is the
 * right default: the listing is mostly European languages.
 */
const SCRIPT_BY_LANGUAGE: Record<string, MonkeytypeScript> = {
  amharic: 'ethiopic',
  arabic: 'arabic',
  armenian: 'armenian',
  bangla: 'bengali',
  bashkir: 'cyrillic',
  belarusian: 'cyrillic',
  bulgarian: 'cyrillic',
  chinese: 'han',
  georgian: 'georgian',
  greek: 'greek',
  gujarati: 'gujarati',
  hebrew: 'hebrew',
  hindi: 'devanagari',
  japanese_hiragana: 'kana',
  japanese_katakana: 'kana',
  kannada: 'kannada',
  kazakh: 'cyrillic',
  khmer: 'khmer',
  korean: 'hangul',
  kurdish_central: 'arabic',
  kyrgyz: 'cyrillic',
  lao: 'lao',
  macedonian: 'cyrillic',
  malayalam: 'malayalam',
  marathi: 'devanagari',
  mongolian: 'cyrillic',
  myanmar: 'burmese',
  nepali: 'devanagari',
  pashto: 'arabic',
  persian: 'arabic',
  russian: 'cyrillic',
  sanskrit: 'devanagari',
  santali: 'olchiki',
  serbian: 'cyrillic',
  sindhi: 'arabic',
  sinhala: 'sinhala',
  tamil: 'tamil',
  tatar: 'cyrillic',
  // Crimean Tatar is published in Latin; only its explicitly Cyrillic edition
  // is not, and that is caught by the `cyrillic` check before this table.
  tatar_crimean: 'latin',
  telugu: 'telugu',
  thai: 'thai',
  tibetan: 'tibetan',
  udmurt: 'cyrillic',
  ukrainian: 'cyrillic',
  urdu: 'arabic',
  yiddish: 'hebrew',
};

export interface MonkeytypeEntry {
  /** The file name as published, which is what gets fetched. */
  name: string;
  /** The name without its size suffix, so variants of one corpus sort together. */
  base: string;
  /** Word count the name advertises; null when it advertises none. */
  size: number | null;
  /** `code` for source-token dumps, `prose` for everything else. */
  content: 'prose' | 'code';
  script: MonkeytypeScript;
}

/** Guess what a published file holds, from its name alone. See the note above. */
export function classifyMonkeytypeName(name: string): MonkeytypeEntry {
  const lower = name.toLowerCase();
  const sized = SIZE_SUFFIX.exec(lower);
  const base = sized ? lower.slice(0, -sized[0].length) : lower;
  const size = sized ? Number.parseInt(sized[1], 10) * 1000 : null;

  if (base.startsWith('code_') || NON_PROSE_NAMES[base]) {
    // Source is written in ASCII whatever language the comments are in.
    return { name, base, size, content: 'code', script: 'latin' };
  }

  let script: MonkeytypeScript = 'latin';
  if (base.includes('cyrillic')) {
    script = 'cyrillic';
  } else if (!LATIN_EDITION.test(base)) {
    let longest = '';
    for (const language of Object.keys(SCRIPT_BY_LANGUAGE)) {
      if (language.length <= longest.length) continue;
      if (base === language || base.startsWith(`${language}_`)) longest = language;
    }
    if (longest) script = SCRIPT_BY_LANGUAGE[longest];
  }
  return { name, base, size, content: 'prose', script };
}

/** Variants of one corpus belong together, smallest first; `english` before `english_1k`. */
export function compareMonkeytypeEntries(a: MonkeytypeEntry, b: MonkeytypeEntry): number {
  if (a.base !== b.base) return a.base < b.base ? -1 : 1;
  return (a.size ?? 0) - (b.size ?? 0);
}

/**
 * Which scripts a keymap can practise, given a test for one character.
 *
 * Half the sample is deliberately a wide margin: a keymap that reaches a
 * script's letters through compose sequences or `RA(...)` resolves only some
 * of them (`keyIndex` does not model either yet), and that is still a keyboard
 * someone types that script on. A keymap with none of a script's common
 * letters cannot clear it by accident.
 */
export function typeableScripts(canType: (char: string) => boolean): Set<MonkeytypeScript> {
  const typeable = new Set<MonkeytypeScript>();
  // Our own literal, so the key type is known; `Object.keys` just forgets it.
  const scripts = Object.keys(MONKEYTYPE_SCRIPTS) as MonkeytypeScript[];
  for (const script of scripts) {
    const sample = [...MONKEYTYPE_SCRIPTS[script].sample];
    const reachable = sample.filter(canType).length;
    if (reachable * 2 >= sample.length) typeable.add(script);
  }
  return typeable;
}

export function getQueryParam(param: string): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get(param);
}
