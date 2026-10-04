/**
 * A small devicetree reader, enough for ZMK `.keymap` files.
 *
 * It understands nodes, properties and the comment and preprocessor noise
 * that surrounds them, and nothing else: no `/delete-node/`, no macro
 * expansion, no includes. Property values are kept as normalised text and
 * interpreted by the caller, because what `<...>` means depends entirely on
 * which property it belongs to.
 */
export interface DtsNode {
  /** Node name without its unit address, or '/' for the synthetic root. */
  name: string;
  /** The `label:` in front of the node name, when there is one. */
  label?: string;
  children: DtsNode[];
  /** Property text with the outer <>, "" or [] removed, whitespace collapsed. */
  props: Record<string, string>;
}

interface Cursor {
  source: string;
  index: number;
}

/** Skip whitespace, both comment forms, and whole preprocessor lines. */
function skipTrivia(cursor: Cursor): void {
  const { source } = cursor;
  for (;;) {
    while (cursor.index < source.length && /\s/.test(source[cursor.index])) cursor.index++;

    const rest = source.slice(cursor.index);
    if (rest.startsWith('//') || rest.startsWith('#')) {
      const newline = source.indexOf('\n', cursor.index);
      cursor.index = newline === -1 ? source.length : newline + 1;
      continue;
    }
    if (rest.startsWith('/*')) {
      const end = source.indexOf('*/', cursor.index + 2);
      cursor.index = end === -1 ? source.length : end + 2;
      continue;
    }
    return;
  }
}

/** Read up to the next structural character, which is left unconsumed. */
function readHead(cursor: Cursor): string {
  const start = cursor.index;
  while (cursor.index < cursor.source.length && !'{=;}'.includes(cursor.source[cursor.index])) {
    cursor.index++;
  }
  return cursor.source.slice(start, cursor.index).trim();
}

/** Read a property value up to the `;` that closes it, honouring nesting. */
function readValue(cursor: Cursor): string {
  const { source } = cursor;
  let depth = 0;
  let quoted = false;
  const start = cursor.index;

  while (cursor.index < source.length) {
    const char = source[cursor.index];
    if (quoted) {
      if (char === '"' && source[cursor.index - 1] !== '\\') quoted = false;
    } else if (char === '"') {
      quoted = true;
    } else if (char === '<' || char === '[') {
      depth++;
    } else if (char === '>' || char === ']') {
      depth--;
    } else if (char === ';' && depth <= 0) {
      break;
    }
    cursor.index++;
  }

  const raw = source.slice(start, cursor.index);
  cursor.index++; // consume the ';'
  return normaliseValue(raw);
}

function normaliseValue(raw: string): string {
  return raw
    .trim()
    .replace(/^<|>$/g, '')
    .replace(/^\[|\]$/g, '')
    .replace(/^"|"$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseChildren(cursor: Cursor): Pick<DtsNode, 'children' | 'props'> {
  const children: DtsNode[] = [];
  const props: Record<string, string> = {};

  for (;;) {
    skipTrivia(cursor);
    if (cursor.index >= cursor.source.length) break;

    if (cursor.source[cursor.index] === '}') {
      cursor.index++;
      skipTrivia(cursor);
      if (cursor.source[cursor.index] === ';') cursor.index++;
      break;
    }

    const head = readHead(cursor);
    const delimiter = cursor.source[cursor.index];

    if (delimiter === '{') {
      cursor.index++;
      const [label, nameWithAddress] = head.includes(':')
        ? [head.slice(0, head.indexOf(':')).trim(), head.slice(head.indexOf(':') + 1).trim()]
        : [undefined, head];
      const body = parseChildren(cursor);
      children.push({ name: nameWithAddress.split('@')[0].trim(), label, ...body });
      continue;
    }

    if (delimiter === '=') {
      cursor.index++;
      if (head) props[head] = readValue(cursor);
      continue;
    }

    if (delimiter === ';') {
      cursor.index++;
      // A valueless property, such as `hold-trigger-on-release;`.
      if (head) props[head] = '';
      continue;
    }

    // No structural character left: malformed tail, stop rather than loop.
    break;
  }

  return { children, props };
}

export function parseDts(source: string): DtsNode {
  const cursor: Cursor = { source, index: 0 };
  return { name: '/', ...parseChildren(cursor) };
}

/** Every node with this name, at any depth, in document order. */
export function findNodes(node: DtsNode, name: string): DtsNode[] {
  const found: DtsNode[] = [];
  const visit = (current: DtsNode) => {
    for (const child of current.children) {
      if (child.name === name) found.push(child);
      visit(child);
    }
  };
  visit(node);
  return found;
}

/** First node whose `compatible` property matches, at any depth. */
export function findCompatible(node: DtsNode, compatible: string): DtsNode | null {
  const visit = (current: DtsNode): DtsNode | null => {
    for (const child of current.children) {
      if (child.props.compatible === compatible) return child;
      const nested = visit(child);
      if (nested) return nested;
    }
    return null;
  };
  return visit(node);
}
