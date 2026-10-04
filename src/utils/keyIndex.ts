import type { KeyPosition, ParsedKeymap } from '../types';
import { charsFor } from './zmkParser';

/** A key that emits a character, and whether shift has to be held for it. */
export interface KeyTarget {
  layer: number;
  keyIndex: number;
  shift: boolean;
}

/** Everything the keyboard view needs to guide the next keystroke. */
export interface KeyHint {
  /** Layer the character lives on. */
  layer: number;
  layerName: string;
  /** Index of the key to press. */
  target: number;
  /** Keys that must be held first, as indices on the *base* layer. */
  hold: number[];
}

export type CharIndex = Map<string, KeyTarget[]>;
/** Layer number -> base-layer key indices to hold, in order, to reach it. */
export type LayerAccess = Map<number, number[]>;

/**
 * Map every character the keymap can produce to the keys that produce it.
 *
 * A binding emits its plain character on a bare press and its shifted
 * character when the typist also holds shift. Bindings that already carry
 * shift from the firmware (&kp EXCL, &kp LS(N1)) emit only the shifted
 * character, with no shift required from the typist.
 */
export function buildCharIndex(keymap: ParsedKeymap): CharIndex {
  const index: CharIndex = new Map();

  const add = (char: string, target: KeyTarget) => {
    const existing = index.get(char);
    if (existing) existing.push(target);
    else index.set(char, [target]);
  };

  keymap.layers.forEach((layer, layerIndex) => {
    layer.bindings.forEach((binding, keyIndex) => {
      if (!binding.tap) return;
      const chars = charsFor(binding.tap.code);
      if (!chars) return;

      // Anything beyond shift (ctrl/alt/gui) is a shortcut, not typed text.
      const extraMods = binding.tap.mods.filter(m => m !== 'shift');
      if (extraMods.length > 0) return;

      if (binding.tap.mods.includes('shift')) {
        add(chars.shifted, { layer: layerIndex, keyIndex, shift: false });
        return;
      }

      add(chars.plain, { layer: layerIndex, keyIndex, shift: false });
      if (chars.shifted !== chars.plain) {
        add(chars.shifted, { layer: layerIndex, keyIndex, shift: true });
      }
    });
  });

  return index;
}

/**
 * Shortest chain of base-layer keys that activates each layer. Layers can be
 * nested (a &mo on a non-base layer), so this is a breadth-first search rather
 * than a single lookup.
 */
export function buildLayerAccess(keymap: ParsedKeymap, baseLayer = 0): LayerAccess {
  const access: LayerAccess = new Map([[baseLayer, []]]);
  const queue: number[] = [baseLayer];

  while (queue.length > 0) {
    const from = queue.shift()!;
    const path = access.get(from)!;
    const layer = keymap.layers[from];
    if (!layer) continue;

    layer.bindings.forEach((binding, keyIndex) => {
      const to = binding.activates?.layer ?? (binding.hold && 'layer' in binding.hold ? binding.hold.layer : undefined);
      if (to === undefined || access.has(to)) return;
      access.set(to, [...path, keyIndex]);
      queue.push(to);
    });
  }

  return access;
}

/** Keys on a layer that hold shift: a hold-tap, a plain modifier or a sticky key. */
function shiftKeys(keymap: ParsedKeymap, layerIndex: number): number[] {
  const layer = keymap.layers[layerIndex];
  if (!layer) return [];
  const keys: number[] = [];
  layer.bindings.forEach((binding, keyIndex) => {
    if (binding.hold && 'mod' in binding.hold && binding.hold.mod === 'shift') keys.push(keyIndex);
  });
  return keys;
}

/**
 * Pick the key to press for `char`, plus the keys to hold to get there.
 *
 * Preference order: a target on the layer already being shown, then one that
 * needs no shift, then the shortest layer chain, then the lowest layer. Shift
 * is taken from the hand opposite the target when the layout allows it, which
 * is how the key is actually reached.
 */
export function resolveHint(
  char: string,
  keymap: ParsedKeymap,
  charIndex: CharIndex,
  layerAccess: LayerAccess,
  keyPositions: KeyPosition[],
  preferredLayer: number,
  baseLayer = 0
): KeyHint | null {
  const candidates = (charIndex.get(char) ?? []).filter(t => layerAccess.has(t.layer));
  if (candidates.length === 0) return null;

  const cost = (t: KeyTarget) =>
    (t.layer === preferredLayer ? 0 : 1000) +
    (t.shift ? 100 : 0) +
    (layerAccess.get(t.layer)!.length * 10) +
    t.layer;

  const best = candidates.reduce((a, b) => (cost(b) < cost(a) ? b : a));
  const hold = [...layerAccess.get(best.layer)!];

  if (best.shift) {
    // While a layer is held the base layer's home-row mods are out of reach,
    // so take shift from the target layer when it offers one.
    const onTargetLayer = shiftKeys(keymap, best.layer);
    const source = onTargetLayer.length > 0 ? onTargetLayer : shiftKeys(keymap, baseLayer);
    const available = source.filter(k => !hold.includes(k));
    const targetX = keyPositions[best.keyIndex]?.x;
    const midpoint =
      keyPositions.length > 0
        ? keyPositions.reduce((sum, k) => sum + k.x, 0) / keyPositions.length
        : 0;
    // Opposite hand first; without coordinates, any shift key will do.
    const opposite = available.filter(k => {
      const x = keyPositions[k]?.x;
      if (x === undefined || targetX === undefined) return false;
      return x < midpoint !== targetX < midpoint;
    });
    const chosen = opposite[0] ?? available[0];
    if (chosen !== undefined) hold.push(chosen);
  }

  return {
    layer: best.layer,
    layerName: keymap.layers[best.layer]?.name ?? `Layer ${best.layer}`,
    target: best.keyIndex,
    hold,
  };
}
