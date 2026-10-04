import React from 'react';

interface TextDisplayProps {
  text: string;
  input: string;
  /** Draw the caret; false once the run is over or focus is elsewhere. */
  caret: boolean;
  /** Dim the text and invite the typist back in. */
  prompt: boolean;
  onActivate: () => void;
}

/** Split into words that keep their trailing space, so lines break between words. */
function toWords(text: string): { start: number; chars: string[] }[] {
  const words: { start: number; chars: string[] }[] = [];
  let current: string[] = [];
  let start = 0;

  for (let i = 0; i < text.length; i++) {
    current.push(text[i]);
    if (text[i] === ' ') {
      words.push({ start, chars: current });
      current = [];
      start = i + 1;
    }
  }
  if (current.length > 0) words.push({ start, chars: current });

  return words;
}

export const TextDisplay: React.FC<TextDisplayProps> = ({
  text,
  input,
  caret,
  prompt,
  onActivate,
}) => {
  return (
    <div className="relative mb-6 cursor-text" onClick={onActivate}>
      <div
        className={`font-mono text-2xl leading-relaxed transition-[filter] duration-150 ${
          prompt ? 'blur-[2px]' : ''
        }`}
      >
        {toWords(text).map(word => (
          <span key={word.start} className="inline-block whitespace-pre">
            {word.chars.map((char, offset) => {
              const i = word.start + offset;
              let className = 'text-gray-600';
              if (i < input.length) {
                className =
                  input[i] === char ? 'text-gray-100' : 'text-red-400 bg-red-900/30 rounded-sm';
              }
              const hasCaret = caret && i === input.length;
              return (
                <span
                  key={i}
                  className={`${className} ${
                    hasCaret ? 'border-l-2 border-yellow-400 -ml-[2px] animate-pulse' : ''
                  }`}
                >
                  {char}
                </span>
              );
            })}
          </span>
        ))}
        {caret && input.length >= text.length && text.length > 0 && (
          <span className="border-l-2 border-yellow-400 animate-pulse" />
        )}
      </div>

      {prompt && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-300">
          click or press any key to focus
        </div>
      )}
    </div>
  );
};
