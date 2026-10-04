import React from 'react';
import type { KeyPosition, ParsedKeymap } from '../types';
import type { KeyHint } from '../utils/keyIndex';

export type LayerMode = 'auto' | number;

interface KeyboardDisplayProps {
  keyPositions: KeyPosition[];
  keyLabels: string[];
  /** Where the next character lives, or null if the keymap cannot type it. */
  hint: KeyHint | null;
  /** Layer currently drawn, already resolved from the layer mode. */
  displayedLayer: number;
  keymap?: ParsedKeymap | null;
  layerMode?: LayerMode;
  onLayerModeChange?: (mode: LayerMode) => void;
  scale?: number;
  keySize?: number;
}

export const KeyboardDisplay: React.FC<KeyboardDisplayProps> = ({
  keyPositions,
  keyLabels,
  hint,
  displayedLayer,
  keymap,
  layerMode = 'auto',
  onLayerModeChange,
  scale = 50,
  keySize = 0.9,
}) => {
  // Hold keys are indices on the base layer; they stay physically correct even
  // while a different layer's labels are drawn.
  const holdKeys = hint && hint.layer === displayedLayer ? hint.hold : [];
  const targetKey = hint && hint.layer === displayedLayer ? hint.target : -1;

  return (
    <div className="bg-gray-800/60 p-4 rounded-lg">
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-sm font-semibold text-gray-400">Keyboard</h2>
        <div className="flex items-center gap-3">
          {hint && hint.hold.length > 0 && (
            <span className="text-xs text-gray-400">
              hold <span className="text-yellow-400">{hint.hold.length}</span> key
              {hint.hold.length > 1 ? 's' : ''} for{' '}
              <span className="text-yellow-400">{hint.layerName}</span>
            </span>
          )}
          {keymap && keymap.layers.length > 0 && onLayerModeChange && (
            <select
              value={layerMode === 'auto' ? 'auto' : String(layerMode)}
              onChange={e =>
                onLayerModeChange(e.target.value === 'auto' ? 'auto' : Number(e.target.value))
              }
              className="px-3 py-1 bg-gray-700 text-white rounded border border-gray-600 focus:border-yellow-400 outline-none text-sm"
            >
              <option value="auto">
                Auto{layerMode === 'auto' ? ` — ${keymap.layers[displayedLayer]?.name ?? ''}` : ''}
              </option>
              {keymap.layers.map((layer, i) => (
                <option key={i} value={i}>
                  {layer.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
      <div
        className="relative"
        style={{
          // Math.max() of an empty list is -Infinity, which produces an
          // invalid CSS length, so fall back to 0 for an empty layout.
          height: `${keyPositions.reduce((max, k) => Math.max(max, (k.y + 1) * scale), 0)}px`,
          width: `${keyPositions.reduce((max, k) => Math.max(max, (k.x + 1) * scale), 0)}px`,
          margin: '0 auto',
        }}
      >
        {keyPositions.map((key, index) => {
          const label = keyLabels[index] || '';
          const isTarget = index === targetKey;
          const isHold = holdKeys.includes(index);
          // rx/ry of 0 are valid rotation origins, so test for undefined.
          const hasOrigin = key.rx !== undefined && key.ry !== undefined;

          const style: React.CSSProperties = {
            position: 'absolute',
            left: `${key.x * scale}px`,
            top: `${key.y * scale}px`,
            width: `${keySize * scale}px`,
            height: `${keySize * scale}px`,
            transform: key.r ? `rotate(${key.r}deg)` : 'none',
            transformOrigin: hasOrigin
              ? `${(key.rx! - key.x) * scale}px ${(key.ry! - key.y) * scale}px`
              : 'center',
          };

          let keyClass = 'bg-gray-700 border-gray-600 hover:bg-gray-600';
          let textClass = 'text-gray-200 text-center text-xs';
          if (isTarget) {
            keyClass = 'bg-yellow-400 border-yellow-500 scale-110 shadow-lg';
            textClass = 'text-gray-900 font-bold text-center';
          } else if (isHold) {
            keyClass = 'bg-yellow-400/20 border-yellow-400 border-dashed';
            textClass = 'text-yellow-200 text-center text-xs';
          }

          return (
            <div
              key={index}
              title={isHold ? 'hold' : undefined}
              style={style}
              className={`
                flex items-center justify-center rounded border-2 text-sm font-mono overflow-hidden
                transition-all duration-150
                ${keyClass}
              `}
            >
              <span className={textClass}>{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
