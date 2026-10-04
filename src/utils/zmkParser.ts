import type { Binding, Keycode, KeymapLayer, Modifier, ParsedKeymap } from '../types';
import { findCompatible, findNodes, parseDts } from './dts';

const ZMK_KEYCODE_MAP: Record<string, string> = {
  // Letters
  'A': 'A', 'B': 'B', 'C': 'C', 'D': 'D', 'E': 'E', 'F': 'F', 'G': 'G', 'H': 'H',
  'I': 'I', 'J': 'J', 'K': 'K', 'L': 'L', 'M': 'M', 'N': 'N', 'O': 'O', 'P': 'P',
  'Q': 'Q', 'R': 'R', 'S': 'S', 'T': 'T', 'U': 'U', 'V': 'V', 'W': 'W', 'X': 'X',
  'Y': 'Y', 'Z': 'Z',
  // Numbers
  'N0': '0', 'N1': '1', 'N2': '2', 'N3': '3', 'N4': '4', 'N5': '5', 'N6': '6',
  'N7': '7', 'N8': '8', 'N9': '9', 'NUMBER_0': '0', 'NUMBER_1': '1', 'NUMBER_2': '2',
  'NUMBER_3': '3', 'NUMBER_4': '4', 'NUMBER_5': '5', 'NUMBER_6': '6', 'NUMBER_7': '7',
  'NUMBER_8': '8', 'NUMBER_9': '9',
  // Special chars with symbols
  'SPACE': '␣', 'SPC': '␣',
  'ENTER': '⏎', 'RET': '⏎',
  'TAB': '⇥',
  'BSPC': '⌫', 'BACKSPACE': '⌫',
  'DEL': '⌦', 'DELETE': '⌦',
  // Other special chars
  'COMMA': ',', 'DOT': '.', 'FSLH': '/', 'BSLH': '\\',
  'SEMI': ';', 'APOS': "'", 'SQT': "'", 'SINGLE_QUOTE': "'",
  'COLON': ':', 'DBLQU': '"', 'DQT': '"', 'DOUBLE_QUOTES': '"',
  'LBKT': '[', 'RBKT': ']', 'LBRC': '{', 'RBRC': '}',
  'LPAR': '(', 'RPAR': ')', 'LT': '<', 'GT': '>',
  'EQUAL': '=', 'PLUS': '+', 'MINUS': '-', 'UNDER': '_',
  'EXCL': '!', 'AT': '@', 'HASH': '#', 'DLLR': '$', 'PRCNT': '%',
  'CARET': '^', 'AMPS': '&', 'STAR': '*', 'PIPE': '|', 'TILDE': '~',
  'GRAVE': '`', 'QUESTION': '?', 'QMARK': '?',
  // Modifiers (these shouldn't appear as keycodes, but map them just in case)
  'LEFT_SHIFT': 'Shift', 'LSHIFT': 'Shift', 'LSHFT': 'Shift', 'RIGHT_SHIFT': 'Shift', 'RSHIFT': 'Shift', 'RSHFT': 'Shift',
  'LEFT_CONTROL': 'Ctrl', 'LCTRL': 'Ctrl', 'RIGHT_CONTROL': 'Ctrl', 'RCTRL': 'Ctrl',
  'LEFT_ALT': 'Alt', 'LALT': 'Alt', 'RIGHT_ALT': 'Alt', 'RALT': 'Alt', 'ALTGR': 'AltGr',
  'LEFT_GUI': 'Cmd', 'LGUI': 'Cmd', 'RIGHT_GUI': 'Cmd', 'RGUI': 'Cmd',
  // Navigation
  'UP': '↑', 'DOWN': '↓', 'LEFT': '←', 'RIGHT': '→',
  'HOME': 'Home', 'END': 'End', 'PG_UP': 'PgUp', 'PAGE_UP': 'PgUp', 'PG_DN': 'PgDn', 'PAGE_DOWN': 'PgDn',
  'INSERT': 'Ins', 'INS': 'Ins',
  // Function keys
  'F1': 'F1', 'F2': 'F2', 'F3': 'F3', 'F4': 'F4', 'F5': 'F5', 'F6': 'F6',
  'F7': 'F7', 'F8': 'F8', 'F9': 'F9', 'F10': 'F10', 'F11': 'F11', 'F12': 'F12',
  // Special
  'ESC': 'Esc', 'CAPS': 'Caps', 'CAPS_LOCK': 'Caps',
  'PSCRN': 'PrtSc', 'SLCK': 'Slk', 'PAUSE_BREAK': 'Pause', 'APP': 'Menu',
  // Consumer codes (the C_/K_ prefix is stripped before lookup)
  'VOL_UP': 'Vol+', 'VOL_DN': 'Vol-', 'MUTE': 'Mute',
  'BRI_UP': 'Bri+', 'BRI_DN': 'Bri-',
  'PP': 'Play', 'STOP': 'Stop', 'NEXT': 'Next', 'PREV': 'Prev',
};

// ZMK modifier functions, e.g. LG(LS(N4)) -> ⌘⇧4
const ZMK_MODIFIER_FUNCTIONS: Record<string, { glyph: string; mod: Modifier }> = {
  LS: { glyph: '⇧', mod: 'shift' }, RS: { glyph: '⇧', mod: 'shift' },
  LC: { glyph: '⌃', mod: 'ctrl' }, RC: { glyph: '⌃', mod: 'ctrl' },
  LA: { glyph: '⌥', mod: 'alt' }, RA: { glyph: '⌥', mod: 'alt' },
  LG: { glyph: '⌘', mod: 'gui' }, RG: { glyph: '⌘', mod: 'gui' },
};

// Keycodes that are a modifier rather than a character.
const MODIFIER_KEYCODES: Record<string, Modifier> = {
  LEFT_SHIFT: 'shift', LSHIFT: 'shift', LSHFT: 'shift',
  RIGHT_SHIFT: 'shift', RSHIFT: 'shift', RSHFT: 'shift',
  LEFT_CONTROL: 'ctrl', LCTRL: 'ctrl', RIGHT_CONTROL: 'ctrl', RCTRL: 'ctrl',
  LEFT_ALT: 'alt', LALT: 'alt', RIGHT_ALT: 'alt', RALT: 'alt', ALTGR: 'alt',
  LEFT_GUI: 'gui', LGUI: 'gui', RIGHT_GUI: 'gui', RGUI: 'gui',
};

// Spellings that mean the same physical key.
const KEYCODE_ALIASES: Record<string, string> = {
  SPC: 'SPACE', RET: 'ENTER', BACKSPACE: 'BSPC', DELETE: 'DEL',
  SQT: 'APOS', SINGLE_QUOTE: 'APOS', SEMICOLON: 'SEMI',
  COMMA: 'COMMA', PERIOD: 'DOT', SLASH: 'FSLH', BACKSLASH: 'BSLH',
  LEFT_BRACKET: 'LBKT', RIGHT_BRACKET: 'RBKT', EQUAL_SIGN: 'EQUAL',
  NUMBER_0: 'N0', NUMBER_1: 'N1', NUMBER_2: 'N2', NUMBER_3: 'N3', NUMBER_4: 'N4',
  NUMBER_5: 'N5', NUMBER_6: 'N6', NUMBER_7: 'N7', NUMBER_8: 'N8', NUMBER_9: 'N9',
};

// Keycodes that already imply shift: &kp EXCL is LS(N1) in the firmware, so the
// typist does not hold shift themselves.
const PRESHIFTED_KEYCODES: Record<string, string> = {
  EXCL: 'N1', AT: 'N2', HASH: 'N3', DLLR: 'N4', PRCNT: 'N5',
  CARET: 'N6', AMPS: 'N7', STAR: 'N8', LPAR: 'N9', RPAR: 'N0',
  UNDER: 'MINUS', PLUS: 'EQUAL', LBRC: 'LBKT', RBRC: 'RBKT',
  PIPE: 'BSLH', COLON: 'SEMI', DQT: 'APOS', DBLQU: 'APOS',
  QMARK: 'FSLH', QUESTION: 'FSLH', TILDE: 'GRAVE', LT: 'COMMA', GT: 'DOT',
};

/** US-ASCII output of each character-producing keycode, unshifted and shifted. */
const KEYCODE_CHARS: Record<string, { plain: string; shifted: string }> = {
  A: { plain: 'a', shifted: 'A' }, B: { plain: 'b', shifted: 'B' },
  C: { plain: 'c', shifted: 'C' }, D: { plain: 'd', shifted: 'D' },
  E: { plain: 'e', shifted: 'E' }, F: { plain: 'f', shifted: 'F' },
  G: { plain: 'g', shifted: 'G' }, H: { plain: 'h', shifted: 'H' },
  I: { plain: 'i', shifted: 'I' }, J: { plain: 'j', shifted: 'J' },
  K: { plain: 'k', shifted: 'K' }, L: { plain: 'l', shifted: 'L' },
  M: { plain: 'm', shifted: 'M' }, N: { plain: 'n', shifted: 'N' },
  O: { plain: 'o', shifted: 'O' }, P: { plain: 'p', shifted: 'P' },
  Q: { plain: 'q', shifted: 'Q' }, R: { plain: 'r', shifted: 'R' },
  S: { plain: 's', shifted: 'S' }, T: { plain: 't', shifted: 'T' },
  U: { plain: 'u', shifted: 'U' }, V: { plain: 'v', shifted: 'V' },
  W: { plain: 'w', shifted: 'W' }, X: { plain: 'x', shifted: 'X' },
  Y: { plain: 'y', shifted: 'Y' }, Z: { plain: 'z', shifted: 'Z' },
  N1: { plain: '1', shifted: '!' }, N2: { plain: '2', shifted: '@' },
  N3: { plain: '3', shifted: '#' }, N4: { plain: '4', shifted: '$' },
  N5: { plain: '5', shifted: '%' }, N6: { plain: '6', shifted: '^' },
  N7: { plain: '7', shifted: '&' }, N8: { plain: '8', shifted: '*' },
  N9: { plain: '9', shifted: '(' }, N0: { plain: '0', shifted: ')' },
  MINUS: { plain: '-', shifted: '_' }, EQUAL: { plain: '=', shifted: '+' },
  LBKT: { plain: '[', shifted: '{' }, RBKT: { plain: ']', shifted: '}' },
  BSLH: { plain: '\\', shifted: '|' }, SEMI: { plain: ';', shifted: ':' },
  APOS: { plain: "'", shifted: '"' }, GRAVE: { plain: '`', shifted: '~' },
  COMMA: { plain: ',', shifted: '<' }, DOT: { plain: '.', shifted: '>' },
  FSLH: { plain: '/', shifted: '?' },
  SPACE: { plain: ' ', shifted: ' ' },
  ENTER: { plain: '\n', shifted: '\n' }, TAB: { plain: '\t', shifted: '\t' },
};

// Parameterless behaviors that never produce a character.
const ZMK_BEHAVIOR_LABELS: Record<string, string> = {
  '&SYS_RESET': 'RESET',
  '&BOOTLOADER': 'BOOT',
  '&STUDIO_UNLOCK': 'STUDIO',
  '&CAPS_WORD': 'CAPSWD',
  '&KEY_REPEAT': 'REPEAT',
};

/** Characters a keycode can emit, or undefined for non-character keys. */
export function charsFor(code: string): { plain: string; shifted: string } | undefined {
  return KEYCODE_CHARS[code];
}

/** Normalise a keycode token into a canonical code plus firmware-applied modifiers. */
export function parseKeycode(token: string): Keycode {
  let rest = token.trim().toUpperCase();
  const mods: Modifier[] = [];

  // Unwrap nested modifier functions: LG(LS(N4)) -> gui+shift+N4
  for (;;) {
    const match = rest.match(/^([A-Z]{2})\((.*)\)$/);
    const fn = match && ZMK_MODIFIER_FUNCTIONS[match[1]];
    if (!match || !fn) break;
    if (!mods.includes(fn.mod)) mods.push(fn.mod);
    rest = match[2].trim();
  }

  rest = rest.replace(/^KC_/, '');
  rest = KEYCODE_ALIASES[rest] ?? rest;

  const base = PRESHIFTED_KEYCODES[rest];
  if (base) {
    if (!mods.includes('shift')) mods.push('shift');
    rest = base;
  }

  return { code: rest, mods };
}

function mapKeycode(keycode: string): string {
  const normalized = keycode.trim().toUpperCase();

  // Modifier function wrapper: LG(V), LG(LS(N4)), ...
  const modMatch = normalized.match(/^([A-Z]{2})\((.*)\)$/);
  const fn = modMatch && ZMK_MODIFIER_FUNCTIONS[modMatch[1]];
  if (modMatch && fn) {
    return fn.glyph + mapKeycode(modMatch[2]);
  }

  // Direct keycode lookup
  if (ZMK_KEYCODE_MAP[normalized]) {
    return ZMK_KEYCODE_MAP[normalized];
  }

  // Try removing common prefixes
  const withoutPrefix = normalized
    .replace(/^KC_/, '')
    .replace(/^K_/, '')
    .replace(/^C_/, '');

  if (ZMK_KEYCODE_MAP[withoutPrefix]) {
    return ZMK_KEYCODE_MAP[withoutPrefix];
  }

  // Format remaining: N4 -> 4, LEFT_SHIFT -> Left Shift, etc.
  const numbered = withoutPrefix.replace(/^N(\d)$/, '$1');
  if (numbered !== withoutPrefix) return numbered;

  return withoutPrefix.replace(/_/g, ' ').slice(0, 12);
}

/** Secondary parameter of a hold-tap: either a layer number or a modifier. */
function parseEngages(token: string): Binding['engages'] {
  if (/^\d+$/.test(token)) return { layer: Number(token) };
  const mod = MODIFIER_KEYCODES[parseKeycode(token).code];
  return mod ? { mod } : undefined;
}

function parseKeyBinding(binding: string): Binding {
  const parts = binding.trim().split(/\s+/);
  const behavior = parts[0].toUpperCase();

  // &none renders as an unassigned key, &trans as "same as lower layer".
  if (behavior === '&NONE') return { label: '' };
  if (behavior === '&TRANS') return { label: '∅' };

  // Parameterless behaviors (&sys_reset, &bootloader, ...).
  if (ZMK_BEHAVIOR_LABELS[behavior]) return { label: ZMK_BEHAVIOR_LABELS[behavior] };

  // &bt BT_SEL 0 / &bt BT_CLR
  if (behavior === '&BT' && parts.length >= 2) {
    const action = parts[1].toUpperCase().replace(/^BT_/, '');
    return { label: action === 'SEL' && parts[2] ? `BT${parts[2]}` : `BT ${action}` };
  }

  // &out OUT_TOG / OUT_BLE / OUT_USB
  if (behavior === '&OUT' && parts.length >= 2) {
    return { label: parts[1].toUpperCase().replace(/^OUT_/, '') };
  }

  // &kp KEYCODE - simple key press
  if (behavior === '&KP' && parts.length >= 2) {
    const tap = parseKeycode(parts[1]);
    const mod = MODIFIER_KEYCODES[tap.code];
    return mod
      ? { label: mapKeycode(parts[1]), engages: { mod }, engage: 'hold' }
      : { label: mapKeycode(parts[1]), tap };
  }

  // &mo LAYER is momentary: held. &to/&tog LAYER latch the layer on a tap.
  if (behavior === '&MO' && parts.length >= 2) {
    return { label: `L${parts[1]}`, engages: { layer: Number(parts[1]) }, engage: 'hold' };
  }
  if ((behavior === '&TO' || behavior === '&TOG') && parts.length >= 2) {
    return { label: `L${parts[1]}`, engages: { layer: Number(parts[1]) }, engage: 'tap' };
  }

  // &sl LAYER - sticky layer: tapped, applies to the next key only.
  if (behavior === '&SL' && parts.length >= 2) {
    return { label: `⏱L${parts[1]}`, engages: { layer: Number(parts[1]) }, engage: 'sticky' };
  }

  // &sk KEYCODE - sticky key, most often a sticky modifier, also tapped.
  if (behavior === '&SK' && parts.length >= 2) {
    const tap = parseKeycode(parts[1]);
    const mod = MODIFIER_KEYCODES[tap.code];
    const label = `⏱${mapKeycode(parts[1])}`;
    return mod ? { label, engages: { mod }, engage: 'sticky' } : { label, tap };
  }

  // Hold-tap family: &lt LAYER KEYCODE, &mt MOD KEYCODE and user-defined
  // hold-taps such as &hm/&hrm. The tap (last) parameter is what gets typed.
  if (parts.length === 3) {
    const engages = parseEngages(parts[1]);
    return {
      label: mapKeycode(parts[2]),
      tap: parseKeycode(parts[2]),
      ...(engages ? { engages, engage: 'hold' as const } : {}),
    };
  }

  // Fallback: single parameter behaves like a keycode, otherwise show the name.
  if (parts.length === 2) {
    return { label: mapKeycode(parts[1]), tap: parseKeycode(parts[1]) };
  }

  return { label: behavior.replace(/^&/, '').slice(0, 8) };
}

/**
 * Layers are the children of the `zmk,keymap` node, in order, and each one
 * carries its bindings as a single property. Their position in that node is
 * the layer number every &mo/&lt/&tog refers to.
 */
export function parseZmkKeymap(keymapContent: string): ParsedKeymap {
  const root = parseDts(keymapContent);
  const keymapNode = findCompatible(root, 'zmk,keymap') ?? findNodes(root, 'keymap')[0];
  if (!keymapNode) return { layers: [] };

  const layers: KeymapLayer[] = keymapNode.children
    .filter(child => child.props.bindings !== undefined)
    .map(child => ({
      name: child.props['display-name'] || child.name,
      bindings: processBindings([child.props.bindings]),
    }));

  return { layers };
}

function processBindings(bufferLines: string[]): Binding[] {
  const bindingText = bufferLines.join(' ');
  const results: Binding[] = [];
  
  // Split text into tokens by whitespace
  const tokens = bindingText.split(/\s+/).filter(t => t.length > 0);
  
  let currentBinding: string[] = [];
  
  for (const token of tokens) {
    if (token.startsWith('&')) {
      // New binding found - save previous if exists
      if (currentBinding.length > 0) {
        // Keep empty labels (&none): the index of every binding must stay
        // aligned with the index of the physical key it belongs to.
        results.push(parseKeyBinding(currentBinding.join(' ')));
      }
      currentBinding = [token];
    } else {
      // Add to current binding (parameter)
      currentBinding.push(token);
    }
  }
  
  // Process last binding
  if (currentBinding.length > 0) {
    results.push(parseKeyBinding(currentBinding.join(' ')));
  }
  
  return results;
}

export function validateParsedKeymap(parsed: ParsedKeymap): string[] {
  const errors: string[] = [];

  if (!parsed.layers || parsed.layers.length === 0) {
    errors.push('No layers found in keymap');
    return errors;
  }

  for (let i = 0; i < parsed.layers.length; i++) {
    const layer = parsed.layers[i];
    if (!layer.name) {
      errors.push(`Layer ${i} has no name`);
    }
    if (!Array.isArray(layer.bindings) || layer.bindings.length === 0) {
      errors.push(`Layer "${layer.name}" has no bindings`);
    }
  }

  return errors;
}
