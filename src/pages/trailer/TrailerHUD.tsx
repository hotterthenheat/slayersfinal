/*
  The HUD.

  One line of chrome: where you are in the system, what the market is doing right
  now, and the way out. It never covers the instrument — it sits above it in the
  layout rather than floating over it, because a trailer about a dense terminal
  cannot afford to hide a row of data behind its own controls.
*/

import React from 'react';
import { Link } from 'react-router-dom';
import { useTrailer } from './useTrailerState';
import { SCENES, SCENE_SHORT } from './useTrailerTimeline';
import { clock, pct, px } from './format';

const TrailerHUD: React.FC = () => {
  const { thread, timeline, compact } = useTrailer();
  const { scene, sceneIndex } = timeline;

  return (
    <header className="flex items-center gap-3 px-3 sm:px-5 h-11 border-b border-borderSubtle bg-panel/70 shrink-0">
      <Link
        to="/"
        className="font-mono text-label font-bold tracking-tight whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-select/60 rounded"
      >
        <span className="text-textMuted">&gt; </span>
        <span className="holo-text">slayer_terminal</span>
      </Link>

      {!compact && (
        <nav aria-label="Trailer chapters" className="flex items-center gap-1 min-w-0 overflow-hidden">
          {SCENES.slice(1).map((s, i) => {
            const idx = i + 1;
            const active = idx === sceneIndex;
            const seen = idx <= sceneIndex;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => timeline.goToScene(idx)}
                aria-current={active ? 'step' : undefined}
                title={s.product}
                className={`px-1.5 py-0.5 rounded font-mono text-micro uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-select/60 ${
                  active
                    ? 'text-textPrimary bg-white/[0.07]'
                    : seen
                      ? 'text-textSecondary hover:text-textPrimary'
                      : 'text-textMuted/60 hover:text-textSecondary'
                }`}
              >
                {SCENE_SHORT[s.id] ?? s.product}
              </button>
            );
          })}
        </nav>
      )}

      <div className="ml-auto flex items-baseline gap-3 shrink-0 font-mono">
        <span className="text-micro uppercase tracking-widest text-textMuted hidden sm:inline">{scene.product}</span>
        <span className="text-label font-semibold text-textPrimary">{thread.ticker}</span>
        <span className="text-label tnum text-textPrimary">{px(thread.spot)}</span>
        <span className={`text-micro tnum ${thread.changePct >= 0 ? 'text-bull' : 'text-bear'}`}>
          {pct(thread.changePct, 2)}
        </span>
        <span className="text-micro tnum text-textMuted hidden sm:inline">{clock(thread.timestamp)} ET</span>
      </div>
    </header>
  );
};

export default React.memo(TrailerHUD);
