/*
  Scene 8 — Compass, setups.

  Everything upstream converges here. Each candidate shows its anatomy — the six
  contributions and their weights — rather than a bare composite, so the winner
  can be seen to earn it against visible alternatives.

  The candidate with the best flow score on the board is rejected. That is the
  point of the scene: a system that never says no is not choosing.
*/

import React from 'react';
import { useTrailer, at, clamp01, ease } from '../useTrailerState';
import { Bar, Caveat, SceneHead, SceneStatement, Verdict } from '../parts';
import { prob } from '../format';
import type { SetupCandidate } from '../trailerTypes';

const Anatomy: React.FC<{ setup: SetupCandidate; grow: number; compact: boolean }> = ({ setup, grow, compact }) => (
  <div className={`grid ${compact ? 'grid-cols-3' : 'grid-cols-6'} gap-1.5`}>
    {setup.factors.map(f => (
      <div key={f.key} className="min-w-0">
        <div className="font-mono text-micro uppercase tracking-wider text-textMuted truncate" title={f.label}>
          {f.label.split(' ')[0]}
        </div>
        <Bar
          value={f.value}
          grow={grow}
          tone={setup.verdict === 'SELECTED' ? 'select' : setup.verdict === 'REJECTED' ? 'bear' : 'neutral'}
          height={3}
        />
        <div className="mt-0.5 font-mono text-micro tnum text-textSecondary">
          {Math.round(f.value * 100)}
          <span className="text-textMuted"> ×{f.weight.toFixed(2)}</span>
        </div>
      </div>
    ))}
  </div>
);

const CompassScene: React.FC = () => {
  const { story, progress: p, reduced, compact } = useTrailer();

  return (
    <div className="h-full flex flex-col gap-3 min-h-0">
      <SceneHead
        product="Compass · Setups"
        line="Not the loudest setup. The setup that survives the math."
        p={p}
        reduced={reduced}
      />

      <div className="flex-1 min-h-0 flex flex-col justify-between gap-2 overflow-hidden">
        {story.setups.map((s, i) => {
          const from = 0.06 + i * 0.11;
          const e = ease(at(p, from, from + 0.14));
          if (e <= 0.01) return null;
          const grow = ease(at(p, from + 0.06, from + 0.26));
          const selected = s.verdict === 'SELECTED';
          const rejected = s.verdict === 'REJECTED';
          return (
            <div
              key={s.id}
              className={`rounded-md border px-3 py-2 ${
                selected ? 'border-select/35 bg-select/[0.05]' : rejected ? 'border-bear/25 bg-bear/[0.035]' : 'inst-surface'
              }`}
              style={{ opacity: e, transform: reduced ? undefined : `translate3d(0, ${(1 - e) * 8}px, 0)` }}
            >
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="font-mono text-micro tnum text-textMuted">{s.id}</span>
                <span className="font-mono text-caption text-textPrimary truncate">{s.label}</span>
                <span className="font-mono text-micro uppercase tracking-wider text-textMuted">{s.horizon}</span>
                <span className="ml-auto flex items-center gap-2">
                  <Verdict>{s.verdict}</Verdict>
                </span>
              </div>

              <div className="mt-1.5 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_240px] gap-2 items-center">
                <Anatomy setup={s} grow={grow} compact={compact} />
                <div className="grid grid-cols-3 gap-2 font-mono text-micro tnum">
                  <div>
                    <div className="text-textMuted uppercase tracking-wider">P(tgt&lt;stop)</div>
                    <div className="text-textPrimary">{prob(s.pTargetBeforeStop)}</div>
                  </div>
                  <div>
                    <div className="text-textMuted uppercase tracking-wider">EV net</div>
                    <div className={s.evAfterCosts >= 0 ? 'text-bull' : 'text-bear'}>
                      {(s.evAfterCosts * 100).toFixed(1)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-textMuted uppercase tracking-wider">ES</div>
                    <div className="text-textSecondary">{(s.expectedShortfall * 100).toFixed(0)}%</div>
                  </div>
                </div>
              </div>

              {rejected && ease(at(p, from + 0.14, from + 0.28)) > 0.2 && (
                <p className="mt-1.5 font-mono text-micro uppercase tracking-wider text-bear/90">{s.rejectReason}</p>
              )}
              {selected && (
                <p className="mt-1.5 font-mono text-micro text-textMuted leading-snug">
                  Invalidation · {s.invalidation}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="space-y-1">
        <SceneStatement p={p} from={0.68} reduced={reduced}>
          The best flow score on the board failed the data-quality gate. A setup nobody can be filled on is not a setup.
        </SceneStatement>
        <Caveat>
          Modelled candidates · probabilities are stated over the setup&apos;s own horizon · a NO TRADE outcome is a
          valid result of this desk
        </Caveat>
      </div>
      <div className="sr-only" aria-live="polite">
        {clamp01(p) > 0.6
          ? `Selected setup ${story.setups[0].id}. Rejected: ${story.setups
              .filter(s => s.verdict === 'REJECTED')
              .map(s => s.id)
              .join(', ')}.`
          : ''}
      </div>
    </div>
  );
};

export default CompassScene;
