import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { KeyboardLayout } from '../types';
import { charsFor, parseKeycode, parseZmkKeymap, validateParsedKeymap } from './zmkParser';

const keymapText = readFileSync('public/defaults/ergonaut_one_s.keymap', 'utf8');
const layout = JSON.parse(
  readFileSync('public/defaults/ergonaut_one_s.json', 'utf8')
) as KeyboardLayout;
const layoutKeyCount = Object.values(layout.layouts)[0].layout.length;

describe('parseKeycode', () => {
  it('unwraps nested modifier functions', () => {
    expect(parseKeycode('LG(LS(N4))')).toEqual({ code: 'N4', mods: ['gui', 'shift'] });
  });

  it('normalises spellings of the same key', () => {
    expect(parseKeycode('SQT').code).toBe('APOS');
    expect(parseKeycode('SPC').code).toBe('SPACE');
    expect(parseKeycode('NUMBER_7').code).toBe('N7');
  });

  it('treats pre-shifted keycodes as shift plus their base key', () => {
    expect(parseKeycode('EXCL')).toEqual({ code: 'N1', mods: ['shift'] });
    expect(parseKeycode('QMARK')).toEqual({ code: 'FSLH', mods: ['shift'] });
  });

  it('does not duplicate shift when a pre-shifted code is wrapped', () => {
    expect(parseKeycode('LS(EXCL)').mods).toEqual(['shift']);
  });
});

describe('charsFor', () => {
  it('reports both cases of a character key', () => {
    expect(charsFor('N1')).toEqual({ plain: '1', shifted: '!' });
    expect(charsFor('APOS')).toEqual({ plain: "'", shifted: '"' });
  });

  it('returns nothing for non-character keys', () => {
    expect(charsFor('F7')).toBeUndefined();
    expect(charsFor('LEFT_SHIFT')).toBeUndefined();
  });
});

describe('parseZmkKeymap', () => {
  const keymap = parseZmkKeymap(keymapText);

  it('parses every layer with no validation errors', () => {
    expect(keymap.layers.map(l => l.name)).toEqual([
      'MAIN', 'FOCAL', 'NAV', 'MOUSE', 'MEDIA', 'NUM', 'SYM', 'FUN', 'ADJ',
    ]);
    expect(validateParsedKeymap(keymap)).toEqual([]);
  });

  it('keeps one binding per physical key on every layer, including &none', () => {
    for (const layer of keymap.layers) {
      expect(layer.bindings, layer.name).toHaveLength(layoutKeyCount);
    }
    // NAV starts with four &none keys; dropping them would shift every label.
    expect(keymap.layers[2].bindings.slice(0, 5).map(b => b.label)).toEqual(['', '', '', '', 'L1']);
  });

  it('exposes the tap keycode and the held action of a hold-tap', () => {
    const a = keymap.layers[0].bindings[10]; // &hm LEFT_SHIFT A
    expect(a.label).toBe('A');
    expect(a.tap).toEqual({ code: 'A', mods: [] });
    expect(a.engages).toEqual({ mod: 'shift' });
    expect(a.engage).toBe('hold');

    const esc = keymap.layers[0].bindings[30]; // &lt 4 ESC
    expect(esc.engages).toEqual({ layer: 4 });
    expect(esc.engage).toBe('hold');
  });

  it('renders modifier functions as glyphs without treating them as typed text', () => {
    const paste = keymap.layers[2].bindings[6]; // &kp LG(V)
    expect(paste.label).toBe('⌘V');
    expect(paste.tap).toEqual({ code: 'V', mods: ['gui'] });
  });

  it('labels bluetooth, output and parameterless behaviors', () => {
    const adj = keymap.layers[8].bindings.map(b => b.label);
    expect(adj[0]).toBe('BT0');
    expect(adj[10]).toBe('BT CLR');
    expect(adj[13]).toBe('RESET');
    expect(adj[20]).toBe('TOG');
  });

  it('separates held layers from latched and sticky ones', () => {
    // &tog 1 on NAV latches the layer, so it is tapped rather than held.
    const toggle = keymap.layers[2].bindings[4];
    expect(toggle.engages).toEqual({ layer: 1 });
    expect(toggle.engage).toBe('tap');

    // &mo 8 on MOUSE is momentary.
    const momentary = keymap.layers[3].bindings[30];
    expect(momentary.engages).toEqual({ layer: 8 });
    expect(momentary.engage).toBe('hold');

    expect(parseZmkKeymap(`
      keymap {
        base {
          bindings = <
&sl 2 &sk LSHFT
          >;
        };
      };
    `).layers[0].bindings).toEqual([
      { label: '⏱L2', engages: { layer: 2 }, engage: 'sticky' },
      { label: '⏱Shift', engages: { mod: 'shift' }, engage: 'sticky' },
    ]);
  });

  it('accepts digits in layer names', () => {
    const parsed = parseZmkKeymap(`
      keymap {
        layer_0 {
          bindings = <
&kp A &kp B
          >;
        };
        layer_1 {
          bindings = <
&kp C &kp D
          >;
        };
      };
    `);
    expect(parsed.layers.map(l => l.name)).toEqual(['layer_0', 'layer_1']);
    expect(parsed.layers[1].bindings.map(b => b.label)).toEqual(['C', 'D']);
  });
});
