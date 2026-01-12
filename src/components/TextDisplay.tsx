import React from 'react';

interface TextDisplayProps {
  text: string;
  input: string;
  currentIndex: number;
}

export const TextDisplay: React.FC<TextDisplayProps> = ({ text, input, currentIndex }) => {
  return (
    <div className="bg-gray-800 p-8 rounded-lg mb-8">
      <div className="font-mono text-2xl leading-relaxed break-words">
        {text.split('').map((char, i) => {
          let className = 'text-gray-500';
          if (i < input.length) {
            className = input[i] === char ? 'text-green-400' : 'text-red-400 bg-red-900/30';
          } else if (i === currentIndex) {
            className = 'text-yellow-400 border-b-2 border-yellow-400';
          }
          return (
            <span key={i} className={className}>
              {char}
            </span>
          );
        })}
      </div>
    </div>
  );
};
