import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { KeyboardLayout, KeyPosition } from '../types';
import { buildCharIndex, buildLayerAccess, resolveHint } from './keyIndex';
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
    expect(layerAccess.get(5)).toEqual([34]); // &lt 5 SPACE -> NUM
    expect(layerAccess.get(6)).toEqual([33]); // &lt 6 RET   -> SYM
  });

  it('chains holds for layers that are only reachable from another layer', () => {
    // &mo 8 lives on MOUSE, which is itself reached from the base layer.
    expect(layerAccess.get(8)).toEqual([30, 32]);
  });
});

describe('resolveHint', () => {
  it('resolves a base-layer character with nothing held', () => {
    expect(hintFor('a')).toMatchObject({ layer: 0, target: 10, hold: [] });
  });

  it('adds a shift key for capitals, on the opposite hand', () => {
    const hint = hintFor('A')!;
    expect(hint.target).toBe(10);
    expect(hint.hold).toHaveLength(1);
    // Target is on the left half, so the right-hand shift is chosen.
    expect(keyPositions[hint.hold[0]].x).toBeGreaterThan(keyPositions[hint.target].x);
    expect(keymap.layers[0].bindings[hint.hold[0]].hold).toEqual({ mod: 'shift' });
  });

  it('crosses to another layer for digits and symbols', () => {
    const one = hintFor('1')!;
    expect(one.layerName).toBe('NUM');
    expect(labelOf(one.layer, one.target)).toBe('1');
    expect(one.hold).toEqual([34]);

    const bang = hintFor('!')!;
    expect(bang.layerName).toBe('SYM');
    // &kp EXCL already carries shift in firmware, so only the layer key is held.
    expect(bang.hold).toEqual([33]);
  });

  it('combines a layer hold with a shift hold from the target layer', () => {
    const quote = hintFor('"')!;
    expect(quote.layerName).toBe('NUM');
    expect(labelOf(quote.layer, quote.target)).toBe("'");
    // The layer thumb, then NUM's own shift — the base layer's home-row mods
    // are unreachable while that thumb is held.
    expect(quote.hold).toEqual([34, 16]);
    expect(labelOf(quote.layer, quote.hold[1])).toBe('Shift');
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
