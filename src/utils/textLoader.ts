import type { TextContent, WordList, QuoteList } from '../types';

export function isWordList(data: unknown): data is WordList {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;
  return (
    typeof obj.name === 'string' &&
    Array.isArray(obj.words) &&
    obj.words.every((w: unknown) => typeof w === 'string')
  );
}

export function isQuoteList(data: unknown): data is QuoteList {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;
  return (
    typeof obj.language === 'string' &&
    Array.isArray(obj.groups) &&
    Array.isArray(obj.quotes) &&
    obj.quotes.every(
      (q: unknown) =>
        q &&
        typeof q === 'object' &&
        typeof (q as Record<string, unknown>).text === 'string' &&
        typeof (q as Record<string, unknown>).source === 'string'
    )
  );
}

export function parseTextContent(data: unknown): TextContent | null {
  if (isWordList(data)) {
    return { type: 'words', data };
  }

  if (isQuoteList(data)) {
    return { type: 'quotes', data };
  }

  return null;
}

export function validateTextContent(data: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!data || typeof data !== 'object') {
    errors.push('Text content must be a JSON object');
    return { valid: false, errors };
  }

  const obj = data as Record<string, unknown>;

  // Try to detect word list
  if ('words' in obj) {
    if (typeof obj.name !== 'string' || !obj.name) {
      errors.push('Word list must have a "name" property');
    }
    if (!Array.isArray(obj.words) || obj.words.length === 0) {
      errors.push('Word list must have a non-empty "words" array');
    }
    if (!Array.isArray(obj.words) || !obj.words.every((w: unknown) => typeof w === 'string')) {
      errors.push('All words must be strings');
    }
    return { valid: errors.length === 0, errors };
  }

  // Try to detect quote list
  if ('quotes' in obj) {
    if (typeof obj.language !== 'string' || !obj.language) {
      errors.push('Quote list must have a "language" property');
    }
    if (!Array.isArray(obj.quotes) || obj.quotes.length === 0) {
      errors.push('Quote list must have a non-empty "quotes" array');
    }
    if (!Array.isArray(obj.quotes)) {
      return { valid: false, errors };
    }

    for (let i = 0; i < obj.quotes.length; i++) {
      const quote = obj.quotes[i];
      if (typeof quote !== 'object' || quote === null) {
        errors.push(`Quote [${i}] is not an object`);
        continue;
      }
      const q = quote as Record<string, unknown>;
      if (typeof q.text !== 'string' || !q.text) {
        errors.push(`Quote [${i}] must have a non-empty "text" property`);
      }
      if (typeof q.source !== 'string' || !q.source) {
        errors.push(`Quote [${i}] must have a non-empty "source" property`);
      }
    }
    return { valid: errors.length === 0, errors };
  }

  errors.push('Text content must be either a word list (with "words" array) or quotes list (with "quotes" array)');
  return { valid: false, errors };
}

export function getTextToType(content: TextContent): string {
  if (content.type === 'words' && 'words' in content.data) {
    return content.data.words.join(' ');
  }

  if (content.type === 'quotes' && 'quotes' in content.data) {
    const quotes = content.data.quotes;
    if (quotes.length === 0) return '';
    // Pick a random quote
    const quote = quotes[Math.floor(Math.random() * quotes.length)];
    return `${quote.text}\n— ${quote.source}`;
  }

  return '';
}

export function saveCustomText(name: string, text: string, type: 'words' | 'quotes'): void {
  if (type === 'words') {
    const wordList: WordList = {
      name,
      words: text.split(/\s+/).filter(w => w.length > 0),
    };
    localStorage.setItem('customText', JSON.stringify(wordList));
  } else {
    const quotes: QuoteList = {
      language: name,
      groups: [],
      quotes: [{ text, source: 'Custom', id: 1, length: text.length }],
    };
    localStorage.setItem('customTextLong', JSON.stringify(quotes));
  }
}

export function loadCustomText(): TextContent | null {
  const customText = localStorage.getItem('customText');
  if (customText) {
    try {
      const data = JSON.parse(customText);
      if (isWordList(data)) {
        return { type: 'words', data };
      }
    } catch {
      // Ignore parse errors
    }
  }

  const customTextLong = localStorage.getItem('customTextLong');
  if (customTextLong) {
    try {
      const data = JSON.parse(customTextLong);
      if (isQuoteList(data)) {
        return { type: 'quotes', data };
      }
    } catch {
      // Ignore parse errors
    }
  }

  return null;
}
