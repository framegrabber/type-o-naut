import React from 'react';
import type { KeyPosition, ParsedKeymap } from '../types';

interface KeyboardDisplayProps {
  keyPositions: KeyPosition[];
  keyLabels: string[];
  nextKeyIndex: number;
  keymap?: ParsedKeymap | null;
  selectedLayer?: number;
  onLayerChange?: (layer: number) => void;
  scale?: number;
  keySize?: number;
}

export const KeyboardDisplay: React.FC<KeyboardDisplayProps> = ({
  keyPositions,
  keyLabels,
  nextKeyIndex,
  keymap,
  selectedLayer = 0,
  onLayerChange,
  scale = 50,
  keySize = 0.9,
}) => {
  return (
    <div className="bg-gray-800 p-8 rounded-lg">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-yellow-400">Keyboard Layout</h2>
        {keymap && keymap.layers.length > 0 && onLayerChange && (
          <select
            value={selectedLayer}
            onChange={e => onLayerChange(parseInt(e.target.value))}
            className="px-3 py-1 bg-gray-700 text-white rounded border border-gray-600 focus:border-yellow-400 outline-none text-sm"
          >
            {keymap.layers.map((layer, i) => (
              <option key={i} value={i}>
                {layer.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <div
        className="relative"
        style={{
          height: `${Math.max(...keyPositions.map(k => (k.y + 1) * scale))}px`,
          width: `${Math.max(...keyPositions.map(k => (k.x + 1) * scale))}px`,
          margin: '0 auto',
        }}
      >
        {keyPositions.map((key, index) => {
          const label = keyLabels[index] || '';
          const isNextKey = index === nextKeyIndex;

          const style: React.CSSProperties = {
            position: 'absolute',
            left: `${key.x * scale}px`,
            top: `${key.y * scale}px`,
            width: `${keySize * scale}px`,
            height: `${keySize * scale}px`,
            transform: key.r ? `rotate(${key.r}deg)` : 'none',
            transformOrigin:
              key.rx && key.ry
                ? `${(key.rx - key.x) * scale}px ${(key.ry - key.y) * scale}px`
                : 'center',
          };

          return (
            <div
              key={index}
              style={style}
              className={`
                flex items-center justify-center rounded border-2 text-sm font-mono overflow-hidden
                transition-all duration-150
                ${
                  isNextKey
                    ? 'bg-yellow-400 border-yellow-500 scale-110 shadow-lg'
                    : 'bg-gray-700 border-gray-600 hover:bg-gray-600'
                }
              `}
            >
              <span className={isNextKey ? 'text-gray-900 font-bold text-center' : 'text-gray-200 text-center text-xs'}>
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
