import React, { useEffect, useRef } from 'react';
import type { HistorySummary } from '../utils/history';

export interface ResultAction {
  label: string;
  /** Single character that triggers the action directly. */
  shortcut: string;
  onSelect: () => void;
  primary?: boolean;
}

interface ResultCardProps {
  wpm: number;
  accuracy: number;
  errors: number;
  /** Personal best and recent average across stored runs. */
  summary: HistorySummary;
  /** Guided-lesson progress; absent in the quote and word modes. */
  guided?: { focus: string | null; proficiency: number | null; next: string | null };
  actions: ResultAction[];
}

/**
 * End-of-run card. Every action is reachable without the mouse: focus lands on
 * the primary button, Tab and the arrow keys cycle within the card, Enter or
 * Space activates, Escape takes the primary action, and each action has a
 * single-key shortcut.
 */
export const ResultCard: React.FC<ResultCardProps> = ({
  wpm,
  accuracy,
  errors,
  summary,
  guided,
  actions,
}) => {
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  // The run has already been recorded, so a tie with the best is this run.
  const isPersonalBest = summary.runs > 1 && wpm >= summary.best;
  const primaryIndex = Math.max(
    0,
    actions.findIndex(a => a.primary)
  );

  useEffect(() => {
    buttonRefs.current[primaryIndex]?.focus();
  }, [primaryIndex]);

  const moveFocus = (delta: number) => {
    const current = buttonRefs.current.findIndex(b => b === document.activeElement);
    const from = current === -1 ? primaryIndex : current;
    const next = (from + delta + actions.length) % actions.length;
    buttonRefs.current[next]?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Tab') {
      // Trap focus: the page behind the card is not interactive right now.
      e.preventDefault();
      moveFocus(e.shiftKey ? -1 : 1);
      return;
    }
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      moveFocus(1);
      return;
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      moveFocus(-1);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      actions[primaryIndex]?.onSelect();
      return;
    }
    const shortcut = actions.find(a => a.shortcut.toLowerCase() === e.key.toLowerCase());
    if (shortcut && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      shortcut.onSelect();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="result-title"
      onKeyDown={handleKeyDown}
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-40"
    >
      <div className="bg-gray-800 p-8 rounded-lg min-w-[22rem]">
        <h2 id="result-title" className="text-sm font-semibold text-gray-400 mb-4">
          test complete
        </h2>

        <div className="flex items-baseline gap-8 mb-2 font-mono">
          <div>
            <div className="text-xs text-gray-500">wpm</div>
            <div className="text-5xl font-bold text-yellow-400">{wpm}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">acc</div>
            <div className="text-5xl font-bold text-green-400">{accuracy}%</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">err</div>
            <div className="text-5xl font-bold text-red-400">{errors}</div>
          </div>
        </div>

        {guided && guided.focus !== null && (
          <p className="mb-2 font-mono text-xs text-gray-500">
            focus <span className="text-gray-300">{guided.focus}</span>
            {guided.proficiency !== null && (
              <>
                {' — '}
                <span className="text-gray-300">{Math.round(guided.proficiency * 100)}%</span> ready
              </>
            )}
            {guided.next !== null && (
              <>
                {' · '}next unlock <span className="text-gray-300">{guided.next}</span>
              </>
            )}
          </p>
        )}

        <p className="mb-6 font-mono text-xs text-gray-500">
          {isPersonalBest ? (
            <span className="text-yellow-400">new best</span>
          ) : (
            <>
              best <span className="text-gray-300">{summary.best}</span>
            </>
          )}
          {summary.recentAverage !== null && (
            <>
              {' · '}recent avg <span className="text-gray-300">{summary.recentAverage}</span>
            </>
          )}
          {' · '}
          {summary.runs} run{summary.runs === 1 ? '' : 's'}
        </p>

        <div className="flex gap-3">
          {actions.map((action, i) => (
            <button
              key={action.label}
              ref={el => (buttonRefs.current[i] = el)}
              onClick={action.onSelect}
              className={`flex-1 px-5 py-2 rounded font-semibold transition-colors outline-none
                focus-visible:ring-2 focus-visible:ring-yellow-400 focus-visible:ring-offset-2
                focus-visible:ring-offset-gray-800 ${
                  action.primary
                    ? 'bg-yellow-400 text-gray-900 hover:bg-yellow-500'
                    : 'bg-gray-700 text-gray-100 hover:bg-gray-600'
                }`}
            >
              {action.label}
              <kbd
                className={`ml-2 px-1.5 py-0.5 rounded text-xs font-mono border ${
                  action.primary
                    ? 'border-gray-900/40 text-gray-900/70'
                    : 'border-gray-500 text-gray-400'
                }`}
              >
                {action.shortcut}
              </kbd>
            </button>
          ))}
        </div>

        <p className="mt-4 text-xs text-gray-500 font-mono">
          ⏎ select · ⇥ switch · esc retry
        </p>
      </div>
    </div>
  );
};
