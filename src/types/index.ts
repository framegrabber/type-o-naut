export interface KeyPosition {
  row: number;
  col: number;
  x: number;
  y: number;
  r?: number;
  rx?: number;
  ry?: number;
}

export interface KeyboardLayout {
  id: string;
  name: string;
  layouts: {
    [layoutName: string]: {
      layout: KeyPosition[];
    };
  };
  sensors?: unknown[];
}

export type Modifier = 'shift' | 'ctrl' | 'alt' | 'gui';

/** A keycode plus the modifiers the firmware applies for it (LS(N1) -> shift+N1). */
export interface Keycode {
  code: string;
  mods: Modifier[];
}

/**
 * How a key's secondary action is engaged: held down, tapped to latch, or
 * tapped to apply to the next key only.
 */
export type Engage = 'hold' | 'tap' | 'sticky';

export interface Binding {
  /** Text drawn on the keycap. */
  label: string;
  /** What a plain press emits, when it emits anything. */
  tap?: Keycode;
  /**
   * The modifier or layer this key brings into play, beyond its tap. Hold-taps
   * (&mt/&lt/&hm) and momentary layers (&mo) are engaged by holding; toggles
   * (&to/&tog) and sticky behaviors (&sl/&sk) are engaged by tapping.
   */
  engages?: { mod: Modifier } | { layer: number };
  engage?: Engage;
}

export interface KeymapLayer {
  name: string;
  bindings: Binding[];
}

export interface Combo {
  name: string;
  /** Physical key indices pressed together. */
  keyPositions: number[];
  binding: Binding;
  /** Layers the combo is restricted to; empty means every layer. */
  layers: number[];
}

export interface ParsedKeymap {
  /**
   * Identity of the keymap source, so per-key statistics can be scoped to the
   * keymap they were measured on. Moving a character to another layer changes
   * what its timings mean, and merging the two would be nonsense.
   */
  id: string;
  layers: KeymapLayer[];
  combos: Combo[];
}

export interface WordList {
  name: string;
  noLazyMode?: boolean;
  orderedByFrequency?: boolean;
  words: string[];
}

export interface Quote {
  text: string;
  source: string;
  length: number;
  id: number;
}

export interface QuoteList {
  language: string;
  groups: [number, number][];
  quotes: Quote[];
}

export interface TextContent {
  type: 'words' | 'quotes';
  data: WordList | QuoteList;
}

export interface KeyLabel {
  tap: string;
  hold?: string;
}

/** One keystroke's worth of evidence, keyed by the character that was expected. */
export interface Sample {
  char: string;
  /** Milliseconds since the previous keystroke; 0 for the first one of a run. */
  ms: number;
  typo: boolean;
}

/** Running per-character skill, smoothed across runs. */
export interface KeyStat {
  char: string;
  /** Exponentially smoothed time to type, in milliseconds. */
  timeToType: number | null;
  /** Lowest smoothed time ever reached, so a bad run cannot re-lock a key. */
  best: number | null;
  hits: number;
  misses: number;
}

export interface KeyStatsTable {
  keymapId: string;
  keys: KeyStat[];
}

export type LessonMode = 'quotes' | 'words' | 'guided';

export interface Settings {
  mode: LessonMode;
  /** Speed a character must reach before it counts as learned. */
  targetWpm: number;
}

/** What the current text was generated from; bumping any field re-rolls it. */
export interface Session {
  mode: LessonMode;
  quoteIndex: number;
  nonce: number;
}

/** The guided lesson's view of what is being practised right now. */
export interface LessonState {
  /** Unlocked characters, in the order they were unlocked. */
  unlocked: string[];
  /** Least confident unlocked character; it appears in every generated word. */
  focus: string | null;
  /** The character that unlocks once the whole unlocked set is at target. */
  next: string | null;
}
