/*
  Scene 12 — Prove It.

  The language goes clinical. Two distributions are drawn over the same axis —
  what the options market is pricing, and what the model forecasts — because the
  difference between them is the only thing that could be an edge, and showing
  one alone would imply a prediction.

  A challenger with a better sharpness score fails its promotion gate on
  calibration. That is the scene: measured performance, not a leaderboard.
*/

import React from 'react';
import { useTrailer, at, clamp01, ease } from '../useTrailerState';
import { Beat, Caveat, SceneHead, SceneStatement, Verdict } from '../parts';
import { prob, px } from '../format';
import { CHART_FONT } from '../../../components/charts/chartTheme';

const Distributions: React.FC<{ bins: { px: number; physical: number; riskNeutral: number }[]; grow: number; height: number; spot: number; lo: number; hi: number }> = ({
  bins,
  grow,
  height,
  spot,
  lo,
  hi,
}) => {
  const W = 1000;
  const H = height;
  const x = (i: number) => (i / (bins.length - 1)) * W;
  const maxV = Math.max(...bins.map(b => Math.max(b.physical, b.riskNeutral))) || 1;
  const y = (v: number) => H - (v / maxV) * (H - 16) * grow;
  const pathOf = (key: 'physical' | 'riskNeutral') =>
    bins.map((b, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(b[key]).toFixed(1)}`).join('');
  const xOfPx = (v: number) => ((v - bins[0].px) / (bins[bins.length - 1].px - bins[0].px)) * W;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full" style={{ height: H }} role="img" aria-label="Model forecast distribution drawn against the risk-neutral distribution implied by option prices">
      <rect x={xOfPx(lo)} y={0} width={Math.max(0, xOfPx(hi) - xOfPx(lo))} height={H} fill="rgba(228,232,244,0.05)" />
      <path d={`${pathOf('riskNeutral')} L${W},${H} L0,${H} Z`} fill="rgba(125,211,252,0.10)" stroke="#7DD3FC" strokeWidth={1} strokeOpacity={0.7} vectorEffect="non-scaling-stroke" />
      <path d={pathOf('physical')} fill="none" stroke="#E4E8F4" strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
      <line x1={xOfPx(spot)} x2={xOfPx(spot)} y1={0} y2={H} stroke="#E4E8F4" strokeWidth={0.75} strokeDasharray="3 4" opacity={0.5} />
      <text x={xOfPx(spot) + 4} y={11} fill="#7d7d7d" fontSize={10} fontFamily={CHART_FONT}>
        SPOT
      </text>
    </svg>
  );
};

const Calibration: React.FC<{ points: { predicted: number; observed: number }[]; grow: number }> = ({ points, grow }) => {
  const S = 100;
  return (
    <svg viewBox={`0 0 ${S} ${S}`} className="w-full h-full" role="img" aria-label="Reliability curve: predicted probability against observed frequency">
      <line x1={0} y1={S} x2={S} y2={0} stroke="#2a2a2a" strokeWidth={1} strokeDasharray="3 3" />
      <polyline
        points={points.map(pt => `${pt.predicted * S},${S - pt.observed * S * grow}`).join(' ')}
        fill="none"
        stroke="#E4E8F4"
        strokeWidth={1.4}
        vectorEffect="non-scaling-stroke"
      />
      {points.map(pt => (
        <circle key={pt.predicted} cx={pt.predicted * S} cy={S - pt.observed * S * grow} r={1.6} fill="#E4E8F4" />
      ))}
    </svg>
  );
};

const ProveItScene: React.FC = () => {
  const { story, thread, progress: p, reduced, compact } = useTrailer();
  const pi = story.proveIt;
  const grow = ease(at(p, 0.08, 0.46));
  const calT = ease(at(p, 0.3, 0.62));

  return (
    <div className="h-full flex flex-col gap-3 min-h-0">
      <SceneHead product="Prove It" line="Every model starts as a claim." p={p} reduced={reduced} />

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_290px] gap-3">
        <div className="inst-surface rounded-md p-3 flex flex-col min-h-0">
          <div className="flex items-baseline justify-between gap-3 mb-1 flex-wrap">
            <span className="font-mono text-micro uppercase tracking-widest text-textMuted">
              {pi.horizonLabel}
            </span>
            <span className="font-mono text-micro uppercase tracking-wider">
              <span className="text-textPrimary">forecast</span>
              <span className="text-textMuted"> / </span>
              <span className="text-flip">risk-neutral</span>
            </span>
          </div>
          <Distributions
            bins={pi.bins}
            grow={grow}
            height={compact ? 120 : 168}
            spot={thread.spot}
            lo={pi.expectedLow}
            hi={pi.expectedHigh}
          />
          <Beat p={p} from={0.32} reduced={reduced} className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              ['Expected band', `${px(pi.expectedLow)} – ${px(pi.expectedHigh)}`],
              ['Tail beyond band', prob(pi.tailProb)],
              ['Distributional error', pi.models[0].crps.toFixed(4)],
              ['Calibration error', pi.models[0].calibrationErr.toFixed(3)],
            ].map(([k, v]) => (
              <div key={k} className="min-w-0">
                <div className="font-mono text-micro uppercase tracking-widest text-textMuted truncate">{k}</div>
                <div className="font-mono text-caption tnum text-textPrimary truncate">{v}</div>
              </div>
            ))}
          </Beat>
          <Beat p={p} from={0.4} reduced={reduced} className="mt-1.5">
            <p className="font-mono text-micro text-textMuted leading-relaxed">
              A distribution is not a prediction. The band is where the model puts most of its mass over the stated
              horizon; the gap against the risk-neutral curve is the only thing that could be an edge.
            </p>
          </Beat>
        </div>

        <div className="flex flex-col gap-2 min-h-0">
          <Beat p={p} from={0.3} reduced={reduced}>
            <div className="inst-surface rounded-md p-2.5">
              <div className="font-mono text-micro uppercase tracking-widest text-textMuted mb-1">Reliability</div>
              <div className={compact ? 'h-16' : 'h-24'}>
                <Calibration points={pi.calibration} grow={calT} />
              </div>
            </div>
          </Beat>

          <Beat p={p} from={0.46} reduced={reduced} className="flex-1 min-h-0">
            <div className="h-full inst-surface rounded-md p-2.5 flex flex-col justify-evenly gap-1.5">
              <div className="font-mono text-micro uppercase tracking-widest text-textMuted">
                Promotion gate · walk-forward
              </div>
              {pi.models.map((m, i) => {
                const e = clamp01((ease(at(p, 0.5, 0.86)) - i * 0.18) / 0.5);
                if (e <= 0) return null;
                return (
                  <div key={m.name} style={{ opacity: e }} className={`rounded px-2 py-1.5 border ${m.promoted ? 'border-select/30 bg-select/[0.05]' : 'border-borderSubtle'}`}>
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono text-micro text-textPrimary truncate">{m.name}</span>
                      <span className="font-mono text-micro uppercase tracking-wider text-textMuted">{m.role}</span>
                      <span className="ml-auto">
                        <Verdict>{m.promoted ? 'SELECTED' : 'REJECTED'}</Verdict>
                      </span>
                    </div>
                    <div className="mt-0.5 grid grid-cols-3 gap-2 font-mono text-micro tnum text-textSecondary">
                      <span>crps {m.crps.toFixed(4)}</span>
                      <span className={m.calibrationErr > 0.03 ? 'text-bear' : ''}>cal {m.calibrationErr.toFixed(3)}</span>
                      <span className={m.economicValue < 0.02 ? 'text-bear' : ''}>ev {(m.economicValue * 100).toFixed(1)}%</span>
                    </div>
                    <div className="mt-0.5 font-mono text-micro text-textMuted truncate" title={m.gate}>
                      {m.gate}
                    </div>
                  </div>
                );
              })}
            </div>
          </Beat>
        </div>
      </div>

      <div className="space-y-1">
        <SceneStatement p={p} from={0.72} reduced={reduced}>
          The challenger is sharper and still does not ship — its probabilities do not come true at the rate it claims.
        </SceneStatement>
        <Caveat>
          Modelled forecasts on simulated history · walk-forward results are out-of-sample by construction · past
          measurement is not a promise of future performance
        </Caveat>
      </div>
    </div>
  );
};

export default ProveItScene;
