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

interface Chunk {
  start: number;
  chars: string[];
}

/**
 * Split a line into chunks that must not be broken across rows: a run of
 * leading indentation, then one chunk per word including its trailing space.
 */
function toChunks(line: string, lineStart: number): Chunk[] {
  const chunks: Chunk[] = [];
  let current: string[] = [];
  let start = lineStart;

  const flush = () => {
    if (current.length > 0) {
      chunks.push({ start, chars: current });
      start += current.length;
      current = [];
    }
  };

  for (const char of line) {
    current.push(char);
    if (char === ' ') flush();
  }
  flush();

  return chunks;
}

/** Lines, with the index of each line's first character in the full text. */
function toLines(text: string): { start: number; line: string }[] {
  const lines: { start: number; line: string }[] = [];
  let start = 0;

  for (const line of text.split('\n')) {
    lines.push({ start, line });
    start += line.length + 1; // + the newline itself
  }

  return lines;
}

export const TextDisplay: React.FC<TextDisplayProps> = ({
  text,
  input,
  caret,
  prompt,
  onActivate,
}) => {
  const charClass = (i: number, char: string) => {
    if (i >= input.length) return 'text-gray-600';
    return input[i] === char ? 'text-gray-100' : 'text-red-400 bg-red-900/30 rounded-sm';
  };
  const caretClass = (i: number) =>
    caret && i === input.length ? 'border-l-2 border-yellow-400 -ml-[2px] animate-pulse' : '';

  const lines = toLines(text);

  return (
    <div className="relative mb-6 cursor-text" onClick={onActivate}>
      <div
        className={`font-mono text-2xl leading-relaxed transition-[filter] duration-150 ${
          prompt ? 'blur-[2px]' : ''
        }`}
        style={{ tabSize: 2 }}
      >
        {lines.map(({ start, line }, lineIndex) => {
          // Index of the newline that ends this line, if there is one.
          const newlineIndex = lineIndex < lines.length - 1 ? start + line.length : -1;
          return (
            <div key={start} className="min-h-[1em]">
              {toChunks(line, start).map(chunk => (
                <span key={chunk.start} className="inline-block whitespace-pre">
                  {chunk.chars.map((char, offset) => {
                    const i = chunk.start + offset;
                    return (
                      <span key={i} className={`${charClass(i, char)} ${caretClass(i)}`}>
                        {char}
                      </span>
                    );
                  })}
                </span>
              ))}
              {newlineIndex !== -1 && (
                <span
                  className={`${
                    newlineIndex < input.length && input[newlineIndex] !== '\n'
                      ? 'text-red-400 bg-red-900/30 rounded-sm'
                      : 'text-gray-700'
                  } ${caretClass(newlineIndex)}`}
                >
                  ↵
                </span>
              )}
            </div>
          );
        })}
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
