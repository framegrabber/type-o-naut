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

export interface Binding {
  /** Text drawn on the keycap. */
  label: string;
  /** What a plain press emits, when it emits anything. */
  tap?: Keycode;
  /** Hold action of a hold-tap (&mt/&lt and user-defined behaviors). */
  hold?: { mod: Modifier } | { layer: number };
  /** Layer activated by a dedicated layer behavior (&mo/&to/&tog/&sl). */
  activates?: { layer: number; sticky: boolean };
}

export interface KeymapLayer {
  name: string;
  bindings: Binding[];
}

export interface ParsedKeymap {
  layers: KeymapLayer[];
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
