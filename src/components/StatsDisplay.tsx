import React from 'react';

interface StatsDisplayProps {
  wpm: number;
  accuracy: number;
  errors: number;
}

export const StatsDisplay: React.FC<StatsDisplayProps> = ({ wpm, accuracy, errors }) => {
  return (
    <div className="grid grid-cols-3 gap-4 mb-8">
      <div className="bg-gray-800 p-4 rounded-lg">
        <div className="text-gray-400 text-sm">WPM</div>
        <div className="text-3xl font-bold text-yellow-400">{wpm}</div>
      </div>
      <div className="bg-gray-800 p-4 rounded-lg">
        <div className="text-gray-400 text-sm">Accuracy</div>
        <div className="text-3xl font-bold text-green-400">{accuracy}%</div>
      </div>
      <div className="bg-gray-800 p-4 rounded-lg">
        <div className="text-gray-400 text-sm">Errors</div>
        <div className="text-3xl font-bold text-red-400">{errors}</div>
      </div>
    </div>
  );
};
