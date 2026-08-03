/*
  Scene 11 — Compass, quick scalp and rebound.

  Two models, side by side, because they are not the same claim. In negative
  gamma the hedge feeds the move and the model is continuation; in positive gamma
  the same hedge absorbs it and the model is reversion. The split makes the
  dependency explicit — there is no universal reversal rule here, only a regime
  the read is conditional on.
*/

import React from 'react';
import { useTrailer, at, ease } from '../useTrailerState';
import { Bar, Beat, Caveat, SceneHead, SceneStatement } from '../parts';
import { prob, px } from '../format';

const Side: React.FC<{
  title: string;
  regime: string;
  model: string;
  tone: 'warn' | 'info';
  rows: [string, string, number][];
  grow: number;
}> = ({ title, regime, model, tone, rows, grow }) => (
  <div className={`h-full rounded-md border p-2.5 flex flex-col min-h-0 ${tone === 'warn' ? 'border-shortGamma/30 bg-shortGamma/[0.04]' : 'border-longGamma/30 bg-longGamma/[0.04]'}`}>
    <div className="flex items-baseline justify-between gap-2">
      <span className={`font-mono text-label font-semibold uppercase tracking-wider ${tone === 'warn' ? 'text-shortGamma' : 'text-longGamma'}`}>
        {regime}
      </span>
      <span className="font-mono text-micro uppercase tracking-widest text-textMuted">{model}</span>
    </div>
    <div className="mt-0.5 font-mono text-caption text-textPrimary">{title}</div>
    <div className="mt-2 flex-1 min-h-0 flex flex-col justify-evenly gap-1.5">
      {rows.map(([k, v, bar]) => (
        <div key={k}>
          <div className="flex items-baseline justify-between gap-2 font-mono text-micro">
            <span className="text-textSecondary">{k}</span>
            <span className="tnum text-textPrimary">{v}</span>
          </div>
          <Bar value={bar} grow={grow} tone={tone === 'warn' ? 'warn' : 'info'} height={3} />
        </div>
      ))}
    </div>
  </div>
);

const ScalpReboundScene: React.FC = () => {
  const { story, thread, progress: p, reduced } = useTrailer();
  // Live spot against the flip — the one fact both read-outs below derive from.
  const negativeGamma = thread.spot < story.levels.flip;
  const grow = ease(at(p, 0.2, 0.6));
  const s = story.scalp;
  const r = story.rebound;

  return (
    <div className="h-full flex flex-col gap-3 min-h-0">
      <SceneHead
        product="Compass · Scalp and Rebound"
        line="Two intraday models. The regime decides which one is even applicable."
        p={p}
        reduced={reduced}
      />

      <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 gap-3">
        <Beat p={p} from={0.06} reduced={reduced} className="min-h-0 h-full">
          <Side
            title="Quick Scalp"
            regime="Negative gamma"
            model="Continuation state"
            tone="warn"
            grow={grow}
            rows={[
              ['P(target before stop)', prob(s.pTargetBeforeStop), s.pTargetBeforeStop],
              ['Spread cost', `${(s.spreadCost * 100).toFixed(1)}%`, s.spreadCost * 12],
              ['Quote stability', prob(s.quoteStability), s.quoteStability],
              ['Gamma efficiency', prob(s.gammaEfficiency), s.gammaEfficiency],
              ['Horizon', `${s.horizonMin} min · cutoff in ${s.minutesToCutoff}`, s.horizonMin / 60],
            ]}
          />
        </Beat>

        <Beat p={p} from={0.2} reduced={reduced} className="min-h-0 h-full">
          <Side
            title="Rebound"
            regime="Positive gamma"
            model="Reversion state"
            tone="info"
            grow={grow}
            rows={[
              [`Support touch`, px(r.touch), 0.82],
              ['Oversold displacement', `${r.displacement.toFixed(1)}σ`, Math.abs(r.displacement) / 3],
              ['Absorption', prob(r.absorption), r.absorption],
              ['Flow reversal', prob(r.flowReversal), r.flowReversal],
              ['Dealer support', prob(r.dealerSupport), r.dealerSupport],
            ]}
          />
        </Beat>
      </div>

      {/*
        Both tiles read the same live spot.

        They used to disagree: the regime tile tested the session OPEN against the
        flip while the applicable-model tile was a hard-coded string, so the desk
        announced a positive-gamma regime and a continuation model in the same row.
        That is the exact failure the rest of this trailer argues against, and it
        is only impossible if one value derives the other.
      */}
      <Beat p={p} from={0.5} reduced={reduced} className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          ['Reversal excursion', `${story.rebound.excursion.toFixed(1)}%`],
          ['Invalidation', px(story.rebound.invalidation)],
          ['Active regime', negativeGamma ? 'NEGATIVE' : 'POSITIVE'],
          ['Applicable model', negativeGamma ? 'CONTINUATION' : 'REVERSION'],
        ].map(([k, v]) => (
          <div key={k} className="inst-surface rounded px-2.5 py-1.5 min-w-0">
            <div className="font-mono text-micro uppercase tracking-widest text-textMuted truncate">{k}</div>
            <div className="font-mono text-caption tnum text-textPrimary truncate">{v}</div>
          </div>
        ))}
      </Beat>

      <div className="space-y-1">
        <SceneStatement p={p} from={0.66} reduced={reduced}>
          Neither model is wrong here. One of them is not applicable — its edge is measured in the regime the market is
          not currently in, and which one that is changes when spot crosses the flip.
        </SceneStatement>
        <Caveat>
          Modelled reads over stated horizons · both models are conditional on the inferred dealer regime, which is not
          observed
        </Caveat>
      </div>
    </div>
  );
};

export default ScalpReboundScene;
