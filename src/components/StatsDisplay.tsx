import React from 'react';

interface StatsDisplayProps {
  wpm: number;
  accuracy: number;
  errors: number;
}

export const StatsDisplay: React.FC<StatsDisplayProps> = ({ wpm, accuracy, errors }) => {
  return (
    <div className="flex items-baseline gap-6 mb-4 font-mono text-sm">
      <span className="text-gray-500">
        wpm <span className="text-yellow-400 text-lg font-bold">{wpm}</span>
      </span>
      <span className="text-gray-500">
        acc <span className="text-green-400 text-lg font-bold">{accuracy}%</span>
      </span>
      <span className="text-gray-500">
        err <span className="text-red-400 text-lg font-bold">{errors}</span>
      </span>
    </div>
  );
};
