import React from 'react';
import type { KeyPosition, ParsedKeymap } from '../types';
import type { KeyHint } from '../utils/keyIndex';

interface KeyboardDisplayProps {
  keyPositions: KeyPosition[];
  keyLabels: string[];
  /** Where the next character lives, or null if the keymap cannot type it. */
  hint: KeyHint | null;
  /** Layer currently drawn: the hint's layer, or the base when there is none. */
  displayedLayer: number;
  keymap?: ParsedKeymap | null;
  /** The layout the hands rest on; access chains are measured from here. */
  baseLayer?: number;
  /** Layers that can serve as a base: the root plus anything &to/&tog latches. */
  baseLayers?: number[];
  onBaseLayerChange?: (layer: number) => void;
  scale?: number;
  keySize?: number;
}

export const KeyboardDisplay: React.FC<KeyboardDisplayProps> = ({
  keyPositions,
  keyLabels,
  hint,
  displayedLayer,
  keymap,
  baseLayer = 0,
  baseLayers = [],
  onBaseLayerChange,
  scale = 50,
  keySize = 0.9,
}) => {
  // Steps are physical key indices; they stay correct even while a different
  // layer's labels are drawn.
  const onThisLayer = hint !== null && hint.layer === displayedLayer;
  const steps = onThisLayer ? hint.steps : [];
  const chord = onThisLayer ? hint.chord ?? [] : [];
  const targetKey = onThisLayer && !hint.chord ? hint.target : -1;
  const holdCount = hint?.steps.filter(s => s.engage === 'hold').length ?? 0;
  const tapCount = hint?.steps.filter(s => s.engage !== 'hold').length ?? 0;
  const onBase = hint !== null && hint.layer === baseLayer;

  return (
    <div className="bg-gray-800/60 p-4 rounded-lg">
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-sm font-semibold text-gray-400">
          Keyboard
          {keymap && !onBase && hint && (
            <span className="ml-2 font-normal text-gray-500">{hint.layerName}</span>
          )}
        </h2>
        <div className="flex items-center gap-3">
          {hint && hint.chord && (
            <span className="text-xs text-gray-400">
              press <span className="text-yellow-400">{hint.chord.length}</span> keys together
            </span>
          )}
          {hint && hint.steps.length > 0 && (
            <span className="text-xs text-gray-400">
              {holdCount > 0 && (
                <>
                  hold <span className="text-yellow-400">{holdCount}</span>
                </>
              )}
              {holdCount > 0 && tapCount > 0 && ', '}
              {tapCount > 0 && (
                <>
                  tap <span className="text-sky-400">{tapCount}</span>
                </>
              )}{' '}
              {/* On the resting layout the only extra key is a modifier. */}
              {onBase ? (
                'for shift'
              ) : (
                <>
                  for <span className="text-yellow-400">{hint.layerName}</span>
                </>
              )}
            </span>
          )}
          {keymap && baseLayers.length > 1 && onBaseLayerChange && (
            <label className="flex items-center gap-2 text-xs text-gray-500">
              layout
              <select
                value={baseLayer}
                onChange={e => onBaseLayerChange(Number(e.target.value))}
                className="px-3 py-1 bg-gray-700 text-white rounded border border-gray-600 focus:border-yellow-400 outline-none text-sm"
              >
                {baseLayers.map(i => (
                  <option key={i} value={i}>
                    {keymap.layers[i]?.name ?? `Layer ${i}`}
                  </option>
                ))}
              </select>
            </label>
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
          const isTarget = index === targetKey || chord.includes(index);
          const step = steps.find(s => s.keyIndex === index);
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
          } else if (step?.engage === 'hold') {
            keyClass = 'bg-yellow-400/20 border-yellow-400 border-dashed';
            textClass = 'text-yellow-200 text-center text-xs';
          } else if (step) {
            keyClass = 'bg-sky-400/20 border-sky-400 border-dotted';
            textClass = 'text-sky-200 text-center text-xs';
          }

          return (
            <div
              key={index}
              title={step?.engage}
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
