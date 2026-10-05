import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { KeyboardLayout, KeyPosition, ParsedKeymap } from '../types';
import {
  buildCharIndex,
  buildLayerAccess,
  charCost,
  findBaseLayers,
  resolveComboHint,
  resolveHint,
} from './keyIndex';
import { parseZmkKeymap } from './zmkParser';

const keymap = parseZmkKeymap(readFileSync('public/defaults/ergonaut_one_s.keymap', 'utf8'));
const layout = JSON.parse(
  readFileSync('public/defaults/ergonaut_one_s.json', 'utf8')
) as KeyboardLayout;
const keyPositions: KeyPosition[] = Object.values(layout.layouts)[0].layout;

const charIndex = buildCharIndex(keymap);
const layerAccess = buildLayerAccess(keymap);

const hintFor = (char: string, preferredLayer = 0) =>
  resolveHint(char, keymap, charIndex, layerAccess, keyPositions, preferredLayer);

const labelOf = (layer: number, key: number) => keymap.layers[layer].bindings[key].label;

describe('buildLayerAccess', () => {
  it('finds the key that reaches each directly accessible layer', () => {
    expect(layerAccess.get(0)).toEqual([]);
    // &lt 5 SPACE -> NUM and &lt 6 RET -> SYM are hold-taps.
    expect(layerAccess.get(5)).toEqual([{ keyIndex: 34, engage: 'hold' }]);
    expect(layerAccess.get(6)).toEqual([{ keyIndex: 33, engage: 'hold' }]);
  });

  it('chains steps for layers only reachable from another layer', () => {
    // &mo 8 lives on MOUSE, which is itself reached from the base layer.
    expect(layerAccess.get(8)).toEqual([
      { keyIndex: 30, engage: 'hold' },
      { keyIndex: 32, engage: 'hold' },
    ]);
  });

  it('marks a toggled layer as tapped, not held', () => {
    // NAV's &tog 1 latches FOCAL: hold the NAV thumb, then tap the toggle.
    expect(layerAccess.get(1)).toEqual([
      { keyIndex: 31, engage: 'hold' },
      { keyIndex: 4, engage: 'tap' },
    ]);
  });
});

describe('resolveHint', () => {
  it('resolves a base-layer character with nothing to engage', () => {
    expect(hintFor('a')).toMatchObject({ layer: 0, target: 10, steps: [] });
  });

  it('adds a shift key for capitals, on the opposite hand', () => {
    const hint = hintFor('A')!;
    expect(hint.target).toBe(10);
    expect(hint.steps).toHaveLength(1);
    const shift = hint.steps[0];
    expect(shift.engage).toBe('hold');
    // Target is on the left half, so the right-hand shift is chosen.
    expect(keyPositions[shift.keyIndex].x).toBeGreaterThan(keyPositions[hint.target].x);
    expect(keymap.layers[0].bindings[shift.keyIndex].engages).toEqual({ mod: 'shift' });
  });

  it('crosses to another layer for digits and symbols', () => {
    const one = hintFor('1')!;
    expect(one.layerName).toBe('NUM');
    expect(labelOf(one.layer, one.target)).toBe('1');
    expect(one.steps).toEqual([{ keyIndex: 34, engage: 'hold' }]);

    const bang = hintFor('!')!;
    expect(bang.layerName).toBe('SYM');
    // &kp EXCL already carries shift in firmware, so only the layer key is held.
    expect(bang.steps).toEqual([{ keyIndex: 33, engage: 'hold' }]);
  });

  it('combines a layer hold with a shift hold from the target layer', () => {
    const quote = hintFor('"')!;
    expect(quote.layerName).toBe('NUM');
    expect(labelOf(quote.layer, quote.target)).toBe("'");
    // The layer thumb, then NUM's own shift — the base layer's home-row mods
    // are unreachable while that thumb is held.
    expect(quote.steps).toEqual([
      { keyIndex: 34, engage: 'hold' },
      { keyIndex: 16, engage: 'hold' },
    ]);
    expect(labelOf(quote.layer, quote.steps[1].keyIndex)).toBe('Shift');
  });

  it('prefers a target on the layer already being shown', () => {
    // "." exists on both MAIN and NUM.
    expect(hintFor('.', 0)!.layer).toBe(0);
    expect(hintFor('.', 5)!.layer).toBe(5);
  });

  it('ignores keys whose modifiers are shortcuts rather than typed text', () => {
    // NAV holds &kp LG(V); "v" must still resolve to the plain letter key.
    expect(hintFor('v')!.layer).toBe(0);
    expect(charIndex.get('⌘V')).toBeUndefined();
  });

  it('returns null for characters the keymap cannot produce', () => {
    expect(hintFor('€')).toBeNull();
  });
});

describe('charCost', () => {
  const costOf = (char: string, opts?: { preferredLayer?: number }) =>
    charCost(char, charIndex, layerAccess, opts);

  it('charges for shift on the base layer', () => {
    expect(costOf('a')).toBeLessThan(costOf('A')!);
  });

  it('charges more for a layer hold that still needs shift', () => {
    // '"' is NUM's quote key plus NUM's own shift: two keys held before the
    // target. A capital is one. Note the model does not make every layer
    // character dearer than a capital — '1' is a single thumb hold and so
    // scores below 'A'; it is the combination that costs.
    expect(costOf('A')).toBeLessThan(costOf('"')!);
  });

  it('returns null for characters the keymap cannot produce', () => {
    expect(costOf('€')).toBeNull();
  });

  it('discounts a target on the preferred layer', () => {
    const sym = hintFor('!')!.layer;
    expect(costOf('!', { preferredLayer: sym })).toBeLessThan(costOf('!')!);
  });
});

describe('findBaseLayers', () => {
  it('offers the root plus any layer a toggle latches on', () => {
    // FOCAL is an alternative alphabet latched by NAV's &tog 1; the momentary
    // and sticky layers are not places the hands rest.
    expect(findBaseLayers(keymap)).toEqual([0, 1]);
  });
});

describe('an alternative base layout', () => {
  const focalAccess = buildLayerAccess(keymap, 1);
  const focalHint = (char: string) =>
    resolveHint(char, keymap, charIndex, focalAccess, keyPositions, 1, 1);

  it('needs no access keys once it is the layout you rest on', () => {
    const hint = focalHint('t')!;
    expect(hint.layer).toBe(1);
    expect(hint.steps).toEqual([]);
    expect(labelOf(1, hint.target)).toBe('T');
  });

  it('places characters where that layout puts them, not where MAIN does', () => {
    // FOCAL moves T to the right of the left home row; MAIN has it on the top.
    expect(focalHint('t')!.target).not.toBe(hintFor('t')!.target);
  });

  it('reaches other layers through the keys of that layout', () => {
    expect(focalHint('1')!.steps).toEqual([{ keyIndex: 34, engage: 'hold' }]);
  });
});

describe('resolveComboHint', () => {
  const withCombos: ParsedKeymap = {
    id: 'test',
    layers: keymap.layers,
    combos: [
      { name: 'q', keyPositions: [2, 3], binding: { label: '?', tap: { code: 'FSLH', mods: ['shift'] } }, layers: [] },
      { name: 'nav_only', keyPositions: [5, 6], binding: { label: 'Z', tap: { code: 'Z', mods: [] } }, layers: [2] },
      { name: 'shortcut', keyPositions: [7, 8], binding: { label: '⌘V', tap: { code: 'V', mods: ['gui'] } }, layers: [] },
    ],
  };

  it('offers the chord for a character a combo types', () => {
    const hint = resolveComboHint('?', withCombos, 0)!;
    expect(hint.chord).toEqual([2, 3]);
    expect(hint.steps).toEqual([]);
  });

  it('respects the combo layer restriction', () => {
    expect(resolveComboHint('z', withCombos, 0)).toBeNull();
    expect(resolveComboHint('z', withCombos, 2)?.chord).toEqual([5, 6]);
  });

  it('ignores combos that fire a shortcut rather than a character', () => {
    expect(resolveComboHint('v', withCombos, 0)).toBeNull();
  });

  it('returns nothing when no combo matches', () => {
    expect(resolveComboHint('x', withCombos, 0)).toBeNull();
    expect(resolveComboHint('x', keymap, 0)).toBeNull();
  });
});
