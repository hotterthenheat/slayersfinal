/*
  Scene 15 — Earnings.

  Three moves on one axis — what the straddle is charging, what the stock has
  actually done, and what the model forecasts — because that comparison is the
  whole decision. Magnitude and direction are kept apart on purpose: the market
  can price the size correctly and the direction wrongly, and a structure list
  that mixes them hides which one the edge is in.
*/

import React from 'react';
import { useTrailer, at, ease } from '../useTrailerState';
import { Beat, Caveat, SceneHead, SceneStatement, Verdict } from '../parts';
import { prob } from '../format';

const MoveBars: React.FC<{ implied: number; realized: number; forecast: number; grow: number }> = ({
  implied,
  realized,
  forecast,
  grow,
}) => {
  const max = Math.max(implied, realized, forecast) * 1.2;
  const rows: [string, number, string][] = [
    ['Implied (straddle)', implied, 'bg-flip/70'],
    ['Realized median', realized, 'bg-white/30'],
    ['Forecast', forecast, 'bg-select/80'],
  ];
  return (
    <div className="space-y-1.5">
      {rows.map(([label, v, cls]) => (
        <div key={label}>
          <div className="flex items-baseline justify-between gap-2 font-mono text-micro">
            <span className="text-textSecondary">{label}</span>
            <span className="tnum text-textPrimary">{v.toFixed(1)}%</span>
          </div>
          <div className="h-[6px] rounded-sm bg-white/[0.06] overflow-hidden">
            <div className={`h-full ${cls}`} style={{ width: `${(v / max) * grow * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
};

const EarningsScene: React.FC = () => {
  const { story, progress: p, reduced } = useTrailer();
  const e = story.earnings;
  const grow = ease(at(p, 0.12, 0.5));

  return (
    <div className="h-full flex flex-col gap-3 min-h-0">
      <SceneHead
        product="Earnings"
        line="The market can price the size correctly and still price the direction incorrectly."
        p={p}
        reduced={reduced}
      />

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_290px] gap-3">
        <div className="inst-surface rounded-md p-3 flex flex-col min-h-0">
          <div className="flex items-baseline justify-between gap-2 flex-wrap mb-2">
            <span className="font-mono text-caption text-textPrimary">
              {story.ticker} · {e.date}
            </span>
            <span className="font-mono text-micro uppercase tracking-wider text-warn">{e.session}</span>
            <span className="font-mono text-micro tnum text-textMuted">{e.daysAway}D away</span>
          </div>

          <MoveBars implied={e.impliedMovePct} realized={e.realizedMedianPct} forecast={e.forecastMovePct} grow={grow} />

          <Beat p={p} from={0.34} reduced={reduced} className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              ['Straddle', `$${e.straddleCost.toFixed(2)}`],
              ['Expected IV crush', prob(e.ivCrush)],
              ['P(direction)', prob(e.pDirection)],
              ['P(magnitude)', prob(e.pMagnitude)],
            ].map(([k, v]) => (
              <div key={k} className="min-w-0">
                <div className="font-mono text-micro uppercase tracking-widest text-textMuted truncate">{k}</div>
                <div
                  className={`font-mono text-caption tnum truncate ${k === 'P(direction)' ? 'text-warn' : 'text-textPrimary'}`}
                >
                  {v}
                </div>
              </div>
            ))}
          </Beat>

          <Beat p={p} from={0.46} reduced={reduced} className="mt-2">
            <p className="font-mono text-micro text-textMuted leading-relaxed">
              Direction sits at {prob(e.pDirection)} — a coin flip with a spread on it. Magnitude carries the only
              measured signal here, and the report time is estimated rather than confirmed.
            </p>
          </Beat>
        </div>

        <div className="inst-surface rounded-md p-2.5 flex flex-col min-h-0">
          <div className="font-mono text-micro uppercase tracking-widest text-textMuted mb-1.5">Structures</div>
          <div className="flex-1 min-h-0 flex flex-col justify-evenly gap-1.5">
            {e.structures.map((s, i) => {
              const from = 0.36 + i * 0.08;
              const vis = ease(at(p, from, from + 0.08));
              if (vis <= 0.01) return null;
              const chosen = s.label === e.selected;
              return (
                <div
                  key={s.label}
                  style={{ opacity: vis }}
                  className={`rounded px-2 py-1.5 border ${chosen ? 'border-select/35 bg-select/[0.06]' : 'border-borderSubtle/60'}`}
                >
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-micro uppercase tracking-wider text-textPrimary">{s.label}</span>
                    <span className="ml-auto">
                      <Verdict>{s.verdict}</Verdict>
                    </span>
                  </div>
                  <p className="mt-0.5 font-mono text-micro text-textMuted leading-snug">{s.note}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="space-y-1">
        <SceneStatement p={p} from={0.72} reduced={reduced}>
          Implied sits above both realized and forecast, so long vol is against — and the desk waits rather than
          manufacturing a position.
        </SceneStatement>
        <Caveat>
          Modelled event · report time estimated, not confirmed · magnitude and direction are stated as separate
          probabilities
        </Caveat>
      </div>
    </div>
  );
};

export default EarningsScene;
