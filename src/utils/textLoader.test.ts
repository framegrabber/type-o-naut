import { describe, expect, it } from 'vitest';
import type { TextContent } from '../types';
import {
  getAttribution,
  getQuoteAt,
  getRandomWords,
  getTextToType,
  parseTextContent,
  validateTextContent,
} from './textLoader';

const quotes = (text: string): TextContent => ({
  type: 'quotes',
  data: { language: 'code_javascript', groups: [], quotes: [{ text, source: 'x', id: 1, length: text.length }] },
});

describe('getTextToType', () => {
  it('keeps the line structure of multi-line sources', () => {
    expect(getTextToType(quotes('function f() {\n\treturn 1;\n}'))).toBe(
      'function f() {\n\treturn 1;\n}'
    );
  });

  it('normalises CRLF and lone CR to LF', () => {
    expect(getTextToType(quotes('a\r\nb\rc'))).toBe('a\nb\nc');
  });

  it('strips trailing whitespace, which cannot be typed meaningfully', () => {
    expect(getTextToType(quotes('let a = 1;   \n\tlet b = 2;\t\n\n'))).toBe(
      'let a = 1;\n\tlet b = 2;'
    );
  });

  it('draws the requested number of words per round', () => {
    const text = getRandomWords(['a', 'b', 'c', 'd', 'e'], 3, 4);
    expect(text.split(' ')).toHaveLength(12);
  });

  it('never requests more unique words than the list holds', () => {
    expect(getRandomWords(['a', 'b'], 10, 1).split(' ')).toHaveLength(2);
  });
});

describe('attribution', () => {
  const german: TextContent = {
    type: 'quotes',
    data: {
      language: 'german',
      groups: [],
      quotes: [
        { text: 'Das Schönste, was wir erleben können, ist das Geheimnisvolle.', source: 'Albert Einstein', id: 3, length: 61 },
        { text: 'Ist das Leben nicht hundert Mal zu kurz?', source: 'Friedrich Nietzsche', id: 4, length: 40 },
      ],
    },
  };

  it('credits the quote that is currently being typed', () => {
    expect(getAttribution(german, 0)).toBe('Albert Einstein');
    expect(getAttribution(german, 1)).toBe('Friedrich Nietzsche');
  });

  it('cycles with the quote index', () => {
    expect(getQuoteAt(german, 2)?.id).toBe(3);
    expect(getAttribution(german, 3)).toBe('Friedrich Nietzsche');
  });

  it('falls back to the list name for word sessions', () => {
    const words: TextContent = { type: 'words', data: { name: 'english_1k', words: ['a'] } };
    expect(getQuoteAt(words, 0)).toBeNull();
    expect(getAttribution(words, 0)).toBe('english_1k');
  });

  it('reports nothing when the source is blank', () => {
    expect(getAttribution(quotes('hi'), 0)).toBe('x');
    const blank: TextContent = {
      type: 'quotes',
      data: { language: 'x', groups: [], quotes: [{ text: 'hi', source: '  ', id: 1, length: 2 }] },
    };
    expect(getAttribution(blank, 0)).toBeNull();
  });
});

describe('validateTextContent', () => {
  it('accepts a MonkeyType code quote file', () => {
    const file = {
      language: 'code_javascript',
      groups: [],
      quotes: [{ text: 'const a = 1;\n', source: 'test', id: 1, length: 13 }],
    };
    expect(validateTextContent(file)).toEqual({ valid: true, errors: [] });
    expect(parseTextContent(file)?.type).toBe('quotes');
  });

  it('reports which quote is malformed', () => {
    const result = validateTextContent({
      language: 'x',
      groups: [],
      quotes: [{ text: 'ok', source: 's' }, { text: '', source: 's' }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(['Quote [1] must have a non-empty "text" property']);
  });
});
