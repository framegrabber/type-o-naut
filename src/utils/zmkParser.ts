import type { ParsedKeymap, KeymapLayer } from '../types';

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
  'SEMI': ';', 'APOS': "'", 'COLON': ':', 'DBLQU': '"',
  'LBKT': '[', 'RBKT': ']', 'LBRC': '{', 'RBRC': '}',
  'LPAR': '(', 'RPAR': ')',
  'EQUAL': '=', 'PLUS': '+', 'MINUS': '-', 'UNDER': '_',
  'EXCL': '!', 'AT': '@', 'HASH': '#', 'DLLR': '$', 'PRCNT': '%',
  'CARET': '^', 'AMPS': '&', 'STAR': '*', 'PIPE': '|', 'TILDE': '~',
  'GRAVE': '`', 'QUESTION': '?',
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
  'PSCRN': 'PrtSc', 'SLCK': 'Slk', 'PAUSE_BREAK': 'Pause',
};

function mapKeycode(keycode: string): string {
  const normalized = keycode.toUpperCase();
  
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

function parseKeyBinding(binding: string): string {
  const parts = binding.trim().split(/\s+/);
  const behavior = parts[0].toUpperCase();

  // &none - empty/transparent
  if (behavior === '&NONE') return '';
  if (behavior === '&TRANS') return '∅';

  // &kp KEYCODE - simple key press
  if (behavior === '&KP' && parts.length >= 2) {
    return mapKeycode(parts.slice(1).join(' '));
  }

  // &mt MODIFIER KEYCODE - mod-tap (just show the keycode for typing)
  if (behavior === '&MT' && parts.length >= 3) {
    return mapKeycode(parts[2]);
  }

  // &hm MODIFIER KEYCODE - homerow mods (just show the keycode for typing)
  if (behavior === '&HM' && parts.length >= 3) {
    return mapKeycode(parts[2]);
  }

  // &lt LAYER KEYCODE - layer-tap (just show the keycode)
  if (behavior === '&LT' && parts.length >= 3) {
    return mapKeycode(parts[2]);
  }

  // &mo LAYER - momentary layer
  if (behavior === '&MO' && parts.length >= 2) {
    return `L${parts[1]}`;
  }

  // &to LAYER - toggle layer
  if (behavior === '&TO' && parts.length >= 2) {
    return `L${parts[1]}`;
  }

  // &tog LAYER - toggle layer (variant)
  if (behavior === '&TOG' && parts.length >= 2) {
    return `L${parts[1]}`;
  }

  // &sl LAYER - sticky layer
  if (behavior === '&SL' && parts.length >= 2) {
    return `⏱L${parts[1]}`;
  }

  // &sk KEYCODE - sticky key
  if (behavior === '&SK' && parts.length >= 2) {
    return `⏱${mapKeycode(parts[1])}`;
  }

  // Fallback: return first param or behavior name
  if (parts.length > 1) {
    return mapKeycode(parts.slice(1).join(' '));
  }
  
  return behavior.replace(/^&/, '').slice(0, 8);
}

export function parseZmkKeymap(keymapContent: string): ParsedKeymap {
  const layers: KeymapLayer[] = [];
  let currentLayerName: string | null = null;
  let bindings: string[] = [];
  let defaultLayer = 0;
  let inKeymap = false;
  let inBindings = false;
  let bindingsBuffer: string[] = [];
  let keymapDepth = 0;

  const lines = keymapContent.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#')) continue;

    // Track when we enter/exit keymap block
    if (!inKeymap && trimmed.includes('keymap') && trimmed.includes('{')) {
      inKeymap = true;
      keymapDepth = 1;
      continue;
    }

    if (!inKeymap) continue;

    // Count braces to track depth
    for (const char of trimmed) {
      if (char === '{') keymapDepth++;
      if (char === '}') keymapDepth--;
    }

    // Exit when keymap block closes
    if (trimmed === '};' && keymapDepth === 0) {
      // Save last layer
      if (currentLayerName && bindings.length > 0) {
        layers.push({ name: currentLayerName, bindings });
      }
      inKeymap = false;
      break;
    }

    // Layer definition: layer_name {
    const layerMatch = trimmed.match(/^\s*([a-z_]+)\s*{\s*$/i);
    if (layerMatch) {
      // Save previous layer if exists
      if (currentLayerName && bindings.length > 0) {
        layers.push({ name: currentLayerName, bindings });
        bindings = [];
        inBindings = false;
        bindingsBuffer = [];
      }
      currentLayerName = layerMatch[1];
      continue;
    }

    // Extract display-name: display-name = "LAYER_NAME";
    const displayNameMatch = trimmed.match(/display-name\s*=\s*"([^"]+)"/i);
    if (displayNameMatch && currentLayerName) {
      currentLayerName = displayNameMatch[1];
    }

    // Start of bindings block: bindings = <
    if (trimmed.startsWith('bindings') && trimmed.includes('<')) {
      inBindings = true;
      bindingsBuffer = [];
      
      // Extract everything after <
      const startIdx = trimmed.indexOf('<');
      const endIdx = trimmed.indexOf('>');
      
      if (endIdx !== -1) {
        // All bindings on one line
        const content = trimmed.substring(startIdx + 1, endIdx).trim();
        if (content) {
          bindingsBuffer.push(content);
        }
        inBindings = false;
        // Process immediately
        bindings.push(...processBindings(bindingsBuffer));
        bindingsBuffer = [];
      } else {
        // Bindings span multiple lines
        const content = trimmed.substring(startIdx + 1).trim();
        if (content) {
          bindingsBuffer.push(content);
        }
      }
      continue;
    }

    // Accumulate bindings until we hit >
    if (inBindings) {
      if (trimmed.includes('>')) {
        // End of bindings
        const endIdx = trimmed.indexOf('>');
        const content = trimmed.substring(0, endIdx).trim();
        if (content) {
          bindingsBuffer.push(content);
        }
        inBindings = false;
        
        // Process all accumulated bindings
        bindings.push(...processBindings(bindingsBuffer));
        bindingsBuffer = [];
      } else {
        // Continue accumulating
        if (trimmed) {
          bindingsBuffer.push(trimmed);
        }
      }
    }
  }

  return { layers, defaultLayer };
}

function processBindings(bufferLines: string[]): string[] {
  const bindingText = bufferLines.join(' ');
  const results: string[] = [];
  
  // Split text into tokens by whitespace
  const tokens = bindingText.split(/\s+/).filter(t => t.length > 0);
  
  let currentBinding: string[] = [];
  
  for (const token of tokens) {
    if (token.startsWith('&')) {
      // New binding found - save previous if exists
      if (currentBinding.length > 0) {
        const binding = currentBinding.join(' ');
        const parsed = parseKeyBinding(binding);
        if (parsed) {
          results.push(parsed);
        }
      }
      currentBinding = [token];
    } else {
      // Add to current binding (parameter)
      currentBinding.push(token);
    }
  }
  
  // Process last binding
  if (currentBinding.length > 0) {
    const binding = currentBinding.join(' ');
    const parsed = parseKeyBinding(binding);
    if (parsed) {
      results.push(parsed);
    }
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
