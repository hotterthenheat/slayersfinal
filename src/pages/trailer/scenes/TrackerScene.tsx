/*
  Scene 16 — Tracker.

  The payoff of the whole film. The decision that Compass selected and the
  Weigher priced is frozen into a packet — including the alternatives it beat —
  and then the market is allowed to move.

  What comes back is not a win column. It is the counterfactual: every rejected
  alternative scored on the same path, so "was the selected contract actually
  better" has an answer instead of a story. The learning line is deliberately
  modest — one outcome updates a weight inside its prior, it does not crown a
  model.
*/

import React from 'react';
import { useTrailer, at, clamp01, ease } from '../useTrailerState';
import { Beat, Caveat, PriceField, SceneHead, SceneStatement, Verdict } from '../parts';
import { clock, prob, px } from '../format';

const TrackerScene: React.FC = () => {
  const { story, progress: p, reduced, compact } = useTrailer();
  const k = story.packet;
  const o = story.outcome;

  const freeze = ease(at(p, 0.04, 0.24));
  const advance = ease(at(p, 0.24, 0.62));
  const counter = ease(at(p, 0.5, 0.82));

  return (
    <div className="h-full flex flex-col gap-3 min-h-0">
      <SceneHead product="Tracker" line="The trade ends. The learning begins." p={p} reduced={reduced} />

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-3">
        {/* the frozen packet */}
        <div
          className="rounded-md border border-select/30 bg-select/[0.04] p-2.5 flex flex-col min-h-0"
          style={{ opacity: freeze, transform: reduced ? undefined : `scale(${0.985 + freeze * 0.015})` }}
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-mono text-micro uppercase tracking-widest text-select">Decision packet</span>
            <span className="font-mono text-micro tnum text-textMuted">{k.id}</span>
          </div>
          <div className="mt-1.5 space-y-[3px]">
            {[
              ['Frozen', clock(k.frozenAt)],
              ['Setup', k.setupId],
              ['Contract', k.contractId],
              ['Level', px(k.level)],
              ['Entry', k.entry.toFixed(2)],
              ['Stop', px(k.stop)],
              ['Target', px(k.target)],
              ['EV net', `${(k.ev * 100).toFixed(1)}%`],
              ['ES', `${(k.expectedShortfall * 100).toFixed(0)}%`],
              ['Data quality', prob(k.dataQuality)],
              ['Model', k.modelVersion],
            ].map(([a, b]) => (
              <div key={a} className="flex items-baseline justify-between gap-2 font-mono text-micro">
                <span className="text-textMuted uppercase tracking-wider">{a}</span>
                <span className="tnum text-textPrimary truncate">{b}</span>
              </div>
            ))}
          </div>
          <div className="mt-1.5 pt-1.5 border-t border-select/20">
            <div className="font-mono text-micro uppercase tracking-wider text-textMuted">Alternatives carried</div>
            <div className="font-mono text-micro text-textSecondary leading-snug">{k.alternatives.join(' · ')}</div>
          </div>
        </div>

        {/* what happened */}
        <div className="flex flex-col gap-2 min-h-0">
          <div className="inst-surface rounded-md p-2.5 flex flex-col min-h-0">
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <span className="font-mono text-micro uppercase tracking-widest text-textMuted">After the freeze</span>
              <span className="font-mono text-micro uppercase tracking-wider">
                <Verdict>{o.outcome === 'TARGET' ? 'SELECTED' : 'ALTERNATIVE'}</Verdict>
                <span className="ml-2 text-textPrimary">{o.outcome}</span>
              </span>
            </div>
            <PriceField
              points={o.path}
              reveal={advance}
              markLive
              pulse={p * 3}
              height={compact ? 92 : 118}
              ariaLabel="Modelled path after the decision was frozen, against the stop and target"
              levels={[
                { price: k.target, label: `TARGET ${px(k.target)}`, kind: 'resistance' },
                { price: k.level, label: `LEVEL ${px(k.level)}`, kind: 'shelf' },
                { price: k.stop, label: `STOP ${px(k.stop)}`, kind: 'support' },
              ]}
            />
            <div className="mt-1.5 grid grid-cols-3 gap-2 font-mono text-micro">
              <div>
                <div className="text-textMuted uppercase tracking-wider">Target progress</div>
                <div className="tnum text-bull">{prob(o.targetProgress * advance)}</div>
              </div>
              <div>
                <div className="text-textMuted uppercase tracking-wider">Invalidation risk</div>
                <div className="tnum text-textPrimary">{prob(o.invalidationRisk)}</div>
              </div>
              <div>
                <div className="text-textMuted uppercase tracking-wider">Thesis</div>
                <div className="tnum text-textPrimary">{o.survived ? 'SURVIVED' : 'BROKEN'}</div>
              </div>
            </div>
          </div>

          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2 min-h-0">
            <Beat p={p} from={0.5} reduced={reduced} className="h-full">
              <div className="h-full inst-surface rounded-md p-2.5 flex flex-col justify-center">
                <div className="font-mono text-micro uppercase tracking-widest text-textMuted mb-1">
                  Counterfactual · same path
                </div>
                {o.counterfactuals.map((c, i) => {
                  const e = clamp01((counter - i * 0.12) / 0.5);
                  if (e <= 0) return null;
                  return (
                    <div key={c.label} style={{ opacity: e }} className="flex items-baseline justify-between gap-2 font-mono text-micro py-[2px]">
                      <span className="text-textSecondary truncate">{c.label}</span>
                      <span className={`tnum ${c.result >= 0 ? 'text-bull' : 'text-bear'}`}>
                        {(c.result * 100).toFixed(0)}%
                      </span>
                    </div>
                  );
                })}
                <div className="mt-1 pt-1 border-t border-borderSubtle font-mono text-micro text-textMuted">
                  The selected contract beat all four on this path.
                </div>
              </div>
            </Beat>

            <Beat p={p} from={0.6} reduced={reduced} className="h-full">
              <div className="h-full inst-surface rounded-md p-2.5 flex flex-col justify-center">
                <div className="font-mono text-micro uppercase tracking-widest text-textMuted mb-1">Attribution</div>
                {o.attribution.map(a => (
                  <div key={a.label} className="flex items-center gap-2 py-[2px]">
                    <span className="font-mono text-micro text-textSecondary w-[92px] truncate">{a.label}</span>
                    <span className="relative flex-1 h-[4px] rounded-sm bg-white/[0.06] overflow-hidden">
                      <span
                        className={`absolute inset-y-0 ${a.contribution >= 0 ? 'left-1/2 bg-bull/70' : 'right-1/2 bg-bear/70'}`}
                        style={{ width: `${Math.abs(a.contribution) * counter * 50}%` }}
                      />
                    </span>
                    <span className={`font-mono text-micro tnum w-8 text-right ${a.contribution >= 0 ? 'text-bull' : 'text-bear'}`}>
                      {(a.contribution * 100).toFixed(0)}
                    </span>
                  </div>
                ))}
              </div>
            </Beat>
          </div>
        </div>
      </div>

      <div className="space-y-1">
        <Beat p={p} from={0.7} reduced={reduced}>
          <div className="flex items-start gap-2 flex-wrap">
            <Verdict>{o.learning === 'LEARN' ? 'SELECTED' : 'ALTERNATIVE'}</Verdict>
            <span className="font-mono text-label uppercase tracking-wider text-textPrimary">{o.learning}</span>
            <p className="font-mono text-micro text-textSecondary leading-relaxed max-w-[70ch]">{o.learningNote}</p>
          </div>
        </Beat>
        <SceneStatement p={p} from={0.78} reduced={reduced}>
          Every decision becomes evidence — including the ones the desk turned down.
        </SceneStatement>
        <Caveat>
          Modelled outcome on the simulated path · counterfactuals are re-priced on the same path, not re-simulated ·
          one outcome updates a weight, it does not validate a model
        </Caveat>
      </div>
    </div>
  );
};

export default TrackerScene;
