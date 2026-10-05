import type { Engage, KeyPosition, ParsedKeymap } from '../types';
import { charsFor } from './zmkParser';

/** A key that emits a character, and whether shift has to be held for it. */
export interface KeyTarget {
  layer: number;
  keyIndex: number;
  shift: boolean;
}

/** A key to press before the target, and how: held down, or tapped once. */
export interface KeyStep {
  keyIndex: number;
  engage: Engage;
}

/** Everything the keyboard view needs to guide the next keystroke. */
export interface KeyHint {
  /** Layer the character lives on. */
  layer: number;
  layerName: string;
  /** Index of the key to press. */
  target: number;
  /** Keys to engage first, in order, as physical key indices. */
  steps: KeyStep[];
  /** Set when the character comes from a combo: press these keys together. */
  chord?: number[];
}

export type CharIndex = Map<string, KeyTarget[]>;
/** Layer number -> the keys to engage, in order, to reach that layer. */
export type LayerAccess = Map<number, KeyStep[]>;

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
 * Shortest chain of keys that reaches each layer. Layers can be nested (a &mo
 * on a non-base layer), so this is a breadth-first search rather than a single
 * lookup. Each step records whether the key is held (&mo, &lt) or tapped
 * (&to/&tog latch the layer, &sl applies it to the next key).
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
      if (!binding.engages || !('layer' in binding.engages)) return;
      const to = binding.engages.layer;
      if (access.has(to)) return;
      access.set(to, [...path, { keyIndex, engage: binding.engage ?? 'hold' }]);
      queue.push(to);
    });
  }

  return access;
}

/**
 * Layers that can serve as a resting layout: the root plus any layer a key
 * latches on with &to/&tog. An alternative alphabet such as a Colemak or
 * FOCAL layer is reached that way and then stays active, so while it is on,
 * it *is* the base and its characters need no access keys. Momentary and
 * sticky layers are excluded; you never rest on them.
 */
export function findBaseLayers(keymap: ParsedKeymap, root = 0): number[] {
  const bases = [root];
  keymap.layers.forEach(layer =>
    layer.bindings.forEach(binding => {
      if (binding.engage !== 'tap' || !binding.engages || !('layer' in binding.engages)) return;
      const candidate = binding.engages.layer;
      if (candidate < keymap.layers.length && !bases.includes(candidate)) bases.push(candidate);
    })
  );
  return bases;
}

/** Keys on a layer that bring shift into play, by hold-tap, plain modifier or sticky key. */
function shiftKeys(keymap: ParsedKeymap, layerIndex: number): KeyStep[] {
  const layer = keymap.layers[layerIndex];
  if (!layer) return [];
  const keys: KeyStep[] = [];
  layer.bindings.forEach((binding, keyIndex) => {
    if (binding.engages && 'mod' in binding.engages && binding.engages.mod === 'shift') {
      keys.push({ keyIndex, engage: binding.engage ?? 'hold' });
    }
  });
  return keys;
}

/**
 * How expensive a single target is to reach: wrong layer dominates, then
 * shift, then the length of the layer chain, with the layer number as a
 * tie-breaker so the result is stable.
 *
 * `preferredLayer` is optional because the two callers measure from different
 * places. A hint is drawn on the layer the user is currently looking at, so a
 * target already there costs nothing extra. Lesson ordering, by contrast,
 * needs the cost of a character to be a fixed property of the keymap — if it
 * moved with whatever layer happened to be displayed, the unlock order would
 * shuffle mid-run. Omitting `preferredLayer` hands out no discount at all, so
 * every target is priced from the resting base layer.
 */
function targetCost(t: KeyTarget, layerAccess: LayerAccess, preferredLayer?: number): number {
  return (
    (t.layer === preferredLayer ? 0 : 1000) +
    (t.shift ? 100 : 0) +
    layerAccess.get(t.layer)!.length * 10 +
    t.layer
  );
}

/**
 * Cost of the cheapest way to type `char`, or null when no key that produces
 * it sits on a reachable layer — the same condition `resolveHint` treats as
 * unresolvable. Used to order characters by how hard the keyboard makes them.
 */
export function charCost(
  char: string,
  charIndex: CharIndex,
  layerAccess: LayerAccess,
  opts: { preferredLayer?: number } = {}
): number | null {
  const candidates = (charIndex.get(char) ?? []).filter(t => layerAccess.has(t.layer));
  if (candidates.length === 0) return null;
  return Math.min(...candidates.map(t => targetCost(t, layerAccess, opts.preferredLayer)));
}

/**
 * Pick the key to press for `char`, plus the keys to engage to get there.
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

  const best = candidates.reduce((a, b) =>
    targetCost(b, layerAccess, preferredLayer) < targetCost(a, layerAccess, preferredLayer) ? b : a
  );
  const steps = [...layerAccess.get(best.layer)!];

  if (best.shift) {
    // While a layer is held the base layer's home-row mods are out of reach,
    // so take shift from the target layer when it offers one.
    const onTargetLayer = shiftKeys(keymap, best.layer);
    const source = onTargetLayer.length > 0 ? onTargetLayer : shiftKeys(keymap, baseLayer);
    const available = source.filter(s => !steps.some(step => step.keyIndex === s.keyIndex));
    const targetX = keyPositions[best.keyIndex]?.x;
    const midpoint =
      keyPositions.length > 0
        ? keyPositions.reduce((sum, k) => sum + k.x, 0) / keyPositions.length
        : 0;
    // Opposite hand first; without coordinates, any shift key will do.
    const opposite = available.filter(s => {
      const x = keyPositions[s.keyIndex]?.x;
      if (x === undefined || targetX === undefined) return false;
      return x < midpoint !== targetX < midpoint;
    });
    const chosen = opposite[0] ?? available[0];
    if (chosen !== undefined) steps.push(chosen);
  }

  return {
    layer: best.layer,
    layerName: keymap.layers[best.layer]?.name ?? `Layer ${best.layer}`,
    target: best.keyIndex,
    steps,
  };
}

/**
 * A combo that types `char` on the given layer, if one exists. Combos are a
 * fallback rather than part of the character index: a key you can reach
 * normally should be taught as a key, not as a chord.
 */
export function resolveComboHint(
  char: string,
  keymap: ParsedKeymap,
  layer: number
): KeyHint | null {
  for (const combo of keymap.combos) {
    if (combo.layers.length > 0 && !combo.layers.includes(layer)) continue;
    if (combo.keyPositions.length === 0) continue;

    const tap = combo.binding.tap;
    if (!tap || tap.mods.some(mod => mod !== 'shift')) continue;
    const chars = charsFor(tap.code);
    if (!chars) continue;

    if ((tap.mods.includes('shift') ? chars.shifted : chars.plain) !== char) continue;

    return {
      layer,
      layerName: keymap.layers[layer]?.name ?? `Layer ${layer}`,
      target: combo.keyPositions[0],
      steps: [],
      chord: combo.keyPositions,
    };
  }
  return null;
}
