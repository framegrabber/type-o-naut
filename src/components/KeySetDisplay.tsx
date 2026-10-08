import React from 'react';
import type { KeyStat, KeyStatsTable, LessonState } from '../types';
import { confidence, proficiency } from '../utils/keyStats';

interface KeySetDisplayProps {
  state: LessonState;
  stats: KeyStatsTable;
  targetWpm: number;
}

/** Readable stand-ins for non-printing characters; the trainer uses the same copy. */
const CHAR_LABELS: Record<string, string> = { ' ': 'space', '\n': 'enter', '\t': 'tab' };

/**
 * Fixed ramp rather than an interpolated inline colour: Tailwind only emits the
 * classes it can see in the source, and a handful of steps reads more clearly
 * on a chip this small than a continuous gradient would.
 */
const RAMP = [
  'bg-red-500/80 text-red-50',
  'bg-orange-500/80 text-orange-50',
  'bg-amber-500/80 text-amber-50',
  'bg-lime-500/80 text-lime-50',
  'bg-green-500/80 text-green-50',
];

/** Never measured. Distinct from slow: the user is told to type it, not to speed up. */
const UNMEASURED = 'bg-gray-700 text-gray-400';
const AT_TARGET = 'bg-emerald-400 text-emerald-950';

function tint(value: number | null): string {
  if (value === null) return UNMEASURED;
  if (value >= 1) return AT_TARGET;
  const step = Math.min(RAMP.length - 1, Math.max(0, Math.floor(value * RAMP.length)));
  return RAMP[step];
}

export const KeySetDisplay: React.FC<KeySetDisplayProps> = ({ state, stats, targetWpm }) => {
  const byChar = new Map<string, KeyStat>(stats.keys.map(k => [k.char, k]));

  return (
    <div className="flex items-center gap-2 mb-4 font-mono text-sm">
      <span className="text-gray-500">keys</span>
      <div className="flex flex-wrap items-center gap-1">
        {state.unlocked.map(char => {
          const stat = byChar.get(char);
          // The chip ranks keys the way the lesson does, so the outlined focus
          // is always the reddest one; the title splits the score back out,
          // because "slow" and "unreliable" need different practice.
          const value = proficiency(stat, targetWpm);
          const speed = confidence(stat, targetWpm);
          const text = CHAR_LABELS[char] ?? char;
          const detail =
            value === null || speed === null || !stat
              ? 'not yet measured'
              : `${Math.round(value * 100)}% ready — ${Math.round(speed * 100)}% of target speed, ` +
                `${stat.misses} missed of ${stat.hits}`;
          return (
            <span
              key={char}
              title={`${text} — ${detail}`}
              className={`px-2 py-0.5 rounded min-w-[1.75rem] text-center ${tint(value)} ${
                char === state.focus
                  ? 'outline outline-2 outline-offset-1 outline-yellow-400 font-bold'
                  : ''
              }`}
            >
              {text}
            </span>
          );
        })}
      </div>
      {state.next !== null && (
        <span className="text-gray-500">
          next: <span className="text-gray-400">{CHAR_LABELS[state.next] ?? state.next}</span>
        </span>
      )}
    </div>
  );
};
