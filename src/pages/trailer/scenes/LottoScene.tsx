/*
  Scene 10 — Compass, Lotto.

  Not gambling: a terminal-outcome problem with a clock on it. The payoff region
  is drawn against the distribution of paths that can still reach it before
  expiration, so the cheap contract's problem is visible rather than asserted —
  its required move sits in the tail, and the mass under that tail is the whole
  argument.
*/

import React from 'react';
import { useTrailer, at, ease } from '../useTrailerState';
import { Beat, Caveat, HeadRow, SceneHead, SceneStatement, Verdict } from '../parts';
import { prob } from '../format';
import { LOTTO_P_GATE } from '../trailerStory';
import { CHART_FONT } from '../../../components/charts/chartTheme';

const GRID = '76px 62px 74px 74px 78px 74px 96px';
const GRID_SM = '70px 74px 96px';

/** Probability mass against the strikes that need to be reached. */
const PathMass: React.FC<{ rows: { requiredMove: number; verdict: string }[]; grow: number; height: number }> = ({
  rows,
  grow,
  height,
}) => {
  const W = 1000;
  const H = height;
  const maxMove = Math.max(...rows.map(r => r.requiredMove)) * 1.35 || 1;
  const bars: string[] = [];
  const N = 56;
  for (let i = 0; i < N; i++) {
    const m = (i / (N - 1)) * maxMove;
    // Intraday move distribution — fat near zero, thin in the tail.
    const d = Math.exp(-Math.pow(m / (maxMove * 0.22), 1.6));
    bars.push(`${((i / (N - 1)) * W).toFixed(1)},${(H - d * (H - 14) * grow).toFixed(1)}`);
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full" style={{ height: H }} role="img" aria-label="Distribution of intraday moves against the move each contract requires before the close">
      <polyline points={`0,${H} ${bars.join(' ')} ${W},${H}`} fill="rgba(228,232,244,0.10)" stroke="#E4E8F4" strokeWidth={1} strokeOpacity={0.5} vectorEffect="non-scaling-stroke" />
      {rows.map(r => {
        const x = (r.requiredMove / maxMove) * W;
        const no = r.verdict === 'NO TRADE';
        return (
          <g key={r.requiredMove}>
            <line x1={x} x2={x} y1={0} y2={H} stroke={no ? '#FF9500' : '#30D158'} strokeWidth={1} strokeDasharray={no ? '4 4' : undefined} opacity={0.9} />
            <text x={x + 4} y={11} fill={no ? '#FF9500' : '#30D158'} fontSize={10} fontFamily={CHART_FONT}>
              +{r.requiredMove.toFixed(1)}%
            </text>
          </g>
        );
      })}
    </svg>
  );
};

const LottoScene: React.FC = () => {
  const { story, progress: p, reduced, compact } = useTrailer();
  const grow = ease(at(p, 0.12, 0.5));
  const furthest = story.lotto[story.lotto.length - 1];
  const gated = story.lotto.filter(l => l.verdict === 'NO TRADE').length;
  const reachable = story.lotto.length - gated;

  return (
    <div className="h-full flex flex-col gap-3 min-h-0">
      <SceneHead product="Compass · Lotto" line="Convexity without fantasy." p={p} reduced={reduced} />

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_236px] gap-3">
        <div className="inst-surface rounded-md p-3 flex flex-col min-h-0">
          <div className="font-mono text-micro uppercase tracking-widest text-textMuted mb-1">
            Required move vs. what the session can still deliver · {story.scalp.minutesToCutoff} min to cutoff
          </div>
          <PathMass rows={story.lotto} grow={grow} height={compact ? 84 : 108} />

          <div className="mt-2 flex-1 min-h-0 flex flex-col">
            <HeadRow
              cols={
                compact
                  ? ['STRIKE', 'P(CLOSE)', 'VERDICT']
                  : ['STRIKE', 'ASK', 'REQUIRED', 'BREAKEVEN', 'P(TOUCH)', 'P(CLOSE)', 'VERDICT']
              }
              grid={compact ? GRID_SM : GRID}
            />
            <div className="mt-1 flex-1 min-h-0 flex flex-col justify-evenly">
              {story.lotto.map((l, i) => {
                const from = 0.24 + i * 0.12;
                const e = ease(at(p, from, from + 0.12));
                if (e <= 0.01) return null;
                const no = l.verdict === 'NO TRADE';
                return (
                  <div key={l.id} style={{ opacity: e }}>
                    <div
                      className={`grid gap-2 items-center font-mono text-micro sm:text-label tnum ${no ? 'text-textMuted' : 'text-textPrimary'}`}
                      style={{ gridTemplateColumns: compact ? GRID_SM : GRID }}
                    >
                      <span>{l.strike}C</span>
                      {!compact && <span>{l.ask.toFixed(2)}</span>}
                      {!compact && <span>+{l.requiredMove.toFixed(2)}%</span>}
                      {!compact && <span>+{l.breakevenMove.toFixed(2)}%</span>}
                      {!compact && <span>{prob(l.pFirstPassage)}</span>}
                      <span className={l.pTargetBeforeClose > 0.2 ? 'text-bull' : 'text-warn'}>
                        {prob(l.pTargetBeforeClose)}
                      </span>
                      <Verdict>{l.verdict}</Verdict>
                    </div>
                    {!compact && <div className="font-mono text-micro text-textMuted truncate">{l.why}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Beat p={p} from={0.42} reduced={reduced}>
            <div className="inst-surface rounded-md p-2.5 space-y-1.5">
              <div className="font-mono text-micro uppercase tracking-widest text-textMuted">Terminal risks</div>
              {[
                ['Theta burn / hour', `${(story.lotto[2].thetaBurnPerHour * 100).toFixed(0)}% of premium`],
                ['Spread cost', `${(story.lotto[2].spreadCost * 100).toFixed(0)}%`],
                ['Terminal liquidity', prob(story.lotto[2].terminalLiquidity)],
                ['Pinning risk', prob(story.lotto[2].pinRisk)],
                ['Maximum loss', '100% of premium'],
              ].map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-2 font-mono text-micro">
                  <span className="text-textSecondary">{k}</span>
                  <span className="tnum text-textPrimary">{v}</span>
                </div>
              ))}
            </div>
          </Beat>

          <Beat p={p} from={0.58} reduced={reduced}>
            <div className="rounded-md border border-warn/30 bg-warn/[0.06] p-2.5">
              <div className="flex items-center gap-2">
                {/* The verdict comes from the gate in `trailerStory`, not from
                    this component — the gate is the claim, and a hard-coded word
                    beside a computed probability is how the two drift apart. */}
                <Verdict>{furthest.verdict}</Verdict>
                <span className="font-mono text-label tnum text-textPrimary">{furthest.strike}C</span>
              </div>
              <p className="mt-1 font-mono text-micro text-textSecondary leading-relaxed">
                A cheap contract is not cheap when the required path is a tail. It needs{' '}
                {furthest.requiredMove.toFixed(2)}% inside the session and finishes through the strike at{' '}
                {prob(furthest.pTargetBeforeClose)}{' '}
                by the close — under the {prob(LOTTO_P_GATE)} the desk requires before a far strike is worth pricing.
              </p>
            </div>
          </Beat>
        </div>
      </div>

      <div className="space-y-1">
        <SceneStatement p={p} from={0.7} reduced={reduced}>
          Same session, same clock — {reachable === 1 ? 'one strike is' : `${reachable} strikes are`} reachable on the
          modelled path and {gated === 1 ? 'one is' : `${gated} are`} not.
        </SceneStatement>
        <Caveat>
          Modelled probabilities over the remaining session · horizon is the close, events are touching the strike and
          finishing through it · maximum loss on any of these is the full premium
        </Caveat>
      </div>
    </div>
  );
};

export default LottoScene;
