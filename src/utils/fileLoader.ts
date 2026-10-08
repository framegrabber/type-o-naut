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

export function getQueryParam(param: string): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get(param);
}
