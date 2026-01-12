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

export interface KeymapLayer {
  name: string;
  bindings: string[];
}

export interface ParsedKeymap {
  layers: KeymapLayer[];
  defaultLayer: number;
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
