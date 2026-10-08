import { describe, expect, it } from 'vitest';
import {
  MONKEYTYPE_SCRIPTS,
  classifyMonkeytypeName,
  compareMonkeytypeEntries,
  monkeytypeFileUrl,
  parseMonkeytypeRef,
  typeableScripts,
} from './fileLoader';

const script = (name: string) => classifyMonkeytypeName(name).script;
const content = (name: string) => classifyMonkeytypeName(name).content;

describe('classifyMonkeytypeName', () => {
  it('reads the size suffix off the base name', () => {
    expect(classifyMonkeytypeName('english')).toMatchObject({ base: 'english', size: null });
    expect(classifyMonkeytypeName('english_1k')).toMatchObject({ base: 'english', size: 1000 });
    expect(classifyMonkeytypeName('english_450k')).toMatchObject({
      base: 'english',
      size: 450000,
    });
    expect(classifyMonkeytypeName('esperanto_x_sistemo_25k')).toMatchObject({
      base: 'esperanto_x_sistemo',
      size: 25000,
    });
  });

  it('keeps the published name untouched, including case and "+"', () => {
    expect(classifyMonkeytypeName('code_c++').name).toBe('code_c++');
    expect(classifyMonkeytypeName('English_1K').name).toBe('English_1K');
    expect(classifyMonkeytypeName('English_1K')).toMatchObject({ base: 'english', size: 1000 });
  });

  it('calls source-token dumps code, whatever suffix they carry', () => {
    expect(content('code_ruby')).toBe('code');
    expect(content('code_c++')).toBe('code');
    expect(content('code_6502_assembly')).toBe('code');
    expect(content('code_python_2k')).toBe('code');
    expect(content('git')).toBe('code');
    expect(content('docker_file')).toBe('code');
  });

  it('does not mistake prose for code', () => {
    expect(content('english')).toBe('prose');
    expect(content('lorem_ipsum')).toBe('prose');
    // Not a `code_` prefix: `_code` is nowhere in the listing, but a future
    // file must not be swept up by a looser match.
    expect(content('codes')).toBe('prose');
  });

  it('maps languages to the script they are published in', () => {
    expect(script('russian')).toBe('cyrillic');
    expect(script('russian_contractions_1k')).toBe('cyrillic');
    expect(script('hebrew_10k')).toBe('hebrew');
    expect(script('yiddish')).toBe('hebrew');
    expect(script('arabic_egypt_1k')).toBe('arabic');
    expect(script('persian_20k')).toBe('arabic');
    expect(script('urdu')).toBe('arabic');
    expect(script('greek_koine')).toBe('greek');
    expect(script('thai_60k')).toBe('thai');
    expect(script('chinese_traditional_50k')).toBe('han');
    expect(script('japanese_hiragana')).toBe('kana');
    expect(script('korean_5k')).toBe('hangul');
    expect(script('myanmar_burmese')).toBe('burmese');
    expect(script('amharic_5k')).toBe('ethiopic');
    expect(script('santali')).toBe('olchiki');
    expect(script('kurdish_central_4k')).toBe('arabic');
  });

  it('follows the transliterated editions back to Latin', () => {
    expect(script('serbian_latin_10k')).toBe('latin');
    expect(script('bulgarian_latin')).toBe('latin');
    expect(script('belarusian_lacinka_1k')).toBe('latin');
    expect(script('ukrainian_latynka_50k')).toBe('latin');
    expect(script('japanese_romaji_1k')).toBe('latin');
    expect(script('sanskrit_roman')).toBe('latin');
    expect(script('persian_romanized')).toBe('latin');
    expect(script('nepali_romanized')).toBe('latin');
    expect(script('pig_latin')).toBe('latin');
  });

  it('does not let a language name swallow a longer unrelated one', () => {
    expect(script('greeklish_25k')).toBe('latin');
    expect(script('hinglish')).toBe('latin');
    expect(script('tanglish')).toBe('latin');
    expect(script('urdish')).toBe('latin');
    expect(script('pinyin_10k')).toBe('latin');
    expect(script('jyutping')).toBe('latin');
  });

  it('splits Crimean Tatar from Volga Tatar on the cyrillic marker', () => {
    expect(script('tatar_9k')).toBe('cyrillic');
    expect(script('tatar_crimean_15k')).toBe('latin');
    expect(script('tatar_crimean_cyrillic_10k')).toBe('cyrillic');
  });

  it('assumes Latin for anything it has never heard of', () => {
    expect(script('klingon_1k')).toBe('latin');
    expect(script('toki_pona_ku_suli')).toBe('latin');
    expect(script('something_invented_tomorrow')).toBe('latin');
  });
});

describe('compareMonkeytypeEntries', () => {
  it('groups variants of one corpus and orders them by size', () => {
    const names = ['english_5k', 'english', 'danish_1k', 'english_450k', 'english_1k', 'danish'];
    const sorted = names.map(classifyMonkeytypeName).sort(compareMonkeytypeEntries);
    expect(sorted.map(entry => entry.name)).toEqual([
      'danish',
      'danish_1k',
      'english',
      'english_1k',
      'english_5k',
      'english_450k',
    ]);
  });
});

describe('typeableScripts', () => {
  it('clears a script whose common letters the keymap produces', () => {
    const latin = new Set([...MONKEYTYPE_SCRIPTS.latin.sample]);
    const scripts = typeableScripts(char => latin.has(char));
    expect(scripts.has('latin')).toBe(true);
    expect(scripts.has('cyrillic')).toBe(false);
    expect(scripts.has('han')).toBe(false);
  });

  it('clears a script the keymap reaches only halfway', () => {
    const half = new Set([...MONKEYTYPE_SCRIPTS.greek.sample].slice(0, 5));
    expect(typeableScripts(char => half.has(char)).has('greek')).toBe(true);
  });

  it('refuses a script the keymap barely touches', () => {
    const few = new Set([...MONKEYTYPE_SCRIPTS.greek.sample].slice(0, 4));
    expect(typeableScripts(char => few.has(char)).has('greek')).toBe(false);
  });

  it('refuses everything when the keymap produces nothing', () => {
    expect(typeableScripts(() => false).size).toBe(0);
  });

  it('gives every script a distinct ten-character sample', () => {
    for (const [name, info] of Object.entries(MONKEYTYPE_SCRIPTS)) {
      const chars = [...info.sample];
      expect(chars.length, name).toBe(10);
      expect(new Set(chars).size, name).toBe(10);
    }
    // No character may appear in two scripts, or one keymap would clear both.
    const seen = new Set<string>();
    for (const info of Object.values(MONKEYTYPE_SCRIPTS)) {
      for (const char of info.sample) {
        expect(seen.has(char), char).toBe(false);
        seen.add(char);
      }
    }
  });
});

describe('parseMonkeytypeRef', () => {
  it('reads the shorthand with and without a directory', () => {
    expect(parseMonkeytypeRef('monkeytype:english')).toEqual({ kind: null, name: 'english' });
    expect(parseMonkeytypeRef('monkeytype:quotes/english')).toEqual({
      kind: 'quotes',
      name: 'english',
    });
    expect(parseMonkeytypeRef('monkeytype:languages/english_1k.json')).toEqual({
      kind: 'words',
      name: 'english_1k',
    });
  });

  it('leaves ordinary URLs alone', () => {
    expect(parseMonkeytypeRef('https://example.com/words.json')).toBeNull();
  });
});

describe('monkeytypeFileUrl', () => {
  it('points words at the languages directory', () => {
    expect(monkeytypeFileUrl('words', 'english_1k')).toMatch(/\/languages\/english_1k\.json$/);
    expect(monkeytypeFileUrl('quotes', 'english')).toMatch(/\/quotes\/english\.json$/);
  });
});
