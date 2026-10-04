import type { Quote, QuoteList, TextContent, WordList } from '../types';

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
 * Get a random selection of words, reshuffled for each repetition.
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

  // Fisher-Yates: Array.sort with a random comparator is biased and, with a
  // non-transitive comparator, implementation-defined.
  const shuffled = [...words];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const selected = shuffled.slice(0, Math.min(wordCount, words.length));
  const out: string[] = [];
  for (let round = 0; round < repeatCount; round++) {
    // Reshuffle each round so the drill is not a memorisable loop.
    const roundWords = [...selected];
    for (let i = roundWords.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [roundWords[i], roundWords[j]] = [roundWords[j], roundWords[i]];
    }
    out.push(...roundWords);
  }

  return out.join(' ');
}

/**
 * Get text to type for a session. For quotes, returns a single quote.
 * For words, returns 15 random words repeated 5 times (can be customized).
 * Use getNextQuote() to get the next quote after finishing one.
 *
 * Multi-line sources (MonkeyType's code_* quote files) are normalised to LF
 * and stripped of trailing whitespace, which is not typeable in any useful
 * sense and would otherwise leave an unfinishable run.
 */
export function getTextToType(content: TextContent, quoteIndex: number = 0): string {
  if (content.type === 'words' && 'words' in content.data) {
    return getRandomWords(content.data.words, 15, 5);
  }

  const quote = getQuoteAt(content, quoteIndex);
  if (!quote) return '';

  return quote.text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .trimEnd();
}

/** The quote a session is currently on, cycling by index, or null for word lists. */
export function getQuoteAt(content: TextContent, quoteIndex: number): Quote | null {
  if (content.type !== 'quotes' || !('quotes' in content.data)) return null;
  const quotes = content.data.quotes;
  if (quotes.length === 0) return null;
  return quotes[quoteIndex % quotes.length];
}

/**
 * What the current text should be credited to: a quote's own source, or the
 * name of the word list it was drawn from.
 */
export function getAttribution(content: TextContent, quoteIndex: number): string | null {
  const quote = getQuoteAt(content, quoteIndex);
  if (quote) return quote.source.trim() || null;
  if (content.type === 'words' && 'words' in content.data) return content.data.name.trim() || null;
  return null;
}

/**
 * Get the next quote index for MonkeyType-style sessions
 */
export function getNextQuoteIndex(currentIndex: number, totalQuotes: number): number {
  if (totalQuotes === 0) return 0;
  return (currentIndex + 1) % totalQuotes;
}
