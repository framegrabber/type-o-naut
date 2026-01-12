import type { TextContent, WordList, QuoteList } from '../types';

// Default minimal quotes inspired by MonkeyType
export const DEFAULT_MINIMAL_QUOTES = [
  { text: 'the quick brown fox jumps over the lazy dog', source: 'Classic', length: 44, id: 1 },
  { text: 'pack my box with five dozen liquor jugs', source: 'Pangram', length: 40, id: 2 },
  { text: 'how vexingly quick daft zebras jump', source: 'Pangram', length: 35, id: 3 },
  { text: 'the five boxing wizards jump quickly', source: 'Pangram', length: 36, id: 4 },
];

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

/**
 * Get a random selection of words, repeated multiple times
 * @param words - Array of all available words
 * @param wordCount - Number of unique words to select (default: 15)
 * @param repeatCount - How many times to repeat the selected words (default: 5)
 */
export function getRandomWords(
  words: string[],
  wordCount: number = 15,
  repeatCount: number = 5
): string {
  if (words.length === 0) return '';

  // Adjust wordCount if more words requested than available
  const actualWordCount = Math.min(wordCount, words.length);

  // Fisher-Yates shuffle to randomly select words
  const shuffled = [...words].sort(() => Math.random() - 0.5);
  const selectedWords = shuffled.slice(0, actualWordCount);

  // Repeat the selected words
  const repeatedWords: string[] = [];
  for (let i = 0; i < repeatCount; i++) {
    repeatedWords.push(...selectedWords);
  }

  return repeatedWords.join(' ');
}

/**
 * Get text to type for a session. For quotes, returns a single quote.
 * For words, returns 15 random words repeated 5 times (can be customized).
 * Use getNextQuote() to get the next quote after finishing one.
 */
export function getTextToType(content: TextContent, quoteIndex: number = 0): string {
  if (content.type === 'words' && 'words' in content.data) {
    return getRandomWords(content.data.words, 15, 5);
  }

  if (content.type === 'quotes' && 'quotes' in content.data) {
    const quotes = content.data.quotes;
    if (quotes.length === 0) return '';
    // Return single quote at specified index, cycling if necessary
    const index = quoteIndex % quotes.length;
    const quote = quotes[index];
    return `${quote.text}\n— ${quote.source}`;
  }

  return '';
}

/**
 * Get the next quote index for MonkeyType-style sessions
 */
export function getNextQuoteIndex(currentIndex: number, totalQuotes: number): number {
  if (totalQuotes === 0) return 0;
  return (currentIndex + 1) % totalQuotes;
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
