/*
  Scene 9 — Compass, contract weigher.

  One thesis expands into five ways to express it. The waterfall is the point:
  gross expected value, then execution cost, then the moneyness penalty, arriving
  at a utility that can be compared. The contract with the highest headline
  return is last on utility, which is the whole argument for weighing rather than
  ranking.
*/

import React from 'react';
import { useTrailer, at, clamp01, ease } from '../useTrailerState';
import { Beat, Caveat, HeadRow, SceneHead, SceneStatement, Verdict } from '../parts';
import { px } from '../format';

const GRID = '96px 58px 62px 56px 54px 62px 62px 70px 86px';
const GRID_SM = '84px 62px 62px 74px';

const WeigherScene: React.FC = () => {
  const { story, progress: p, reduced, compact } = useTrailer();
  const rows = story.contracts;
  const selected = rows.find(r => r.verdict === 'SELECTED')!;
  const maxUtil = Math.max(...rows.map(r => Math.abs(r.utility)), 0.001);

  return (
    <div className="h-full flex flex-col gap-3 min-h-0">
      <SceneHead
        product="Compass · Contract Weigher"
        line="Same thesis. Different contracts. Different outcomes."
        p={p}
        reduced={reduced}
      />

      <div className="flex-1 min-h-0 inst-surface rounded-md p-3 flex flex-col overflow-hidden">
        <HeadRow
          cols={
            compact
              ? ['CONTRACT', 'MID', 'EV', 'UTILITY']
              : ['CONTRACT', 'BID/ASK', 'SPREAD', 'DELTA', 'THETA', 'BREAKEVEN', 'EXEC', 'EV NET', 'UTILITY']
          }
          grid={compact ? GRID_SM : GRID}
        />
        <div className="mt-1 flex-1 min-h-0 flex flex-col justify-evenly">
          {rows.map((r, i) => {
            const from = 0.06 + i * 0.08;
            const e = ease(at(p, from, from + 0.1));
            if (e <= 0.01) return null;
            const grow = ease(at(p, from + 0.08, from + 0.3));
            const selectedRow = r.verdict === 'SELECTED';
            return (
              <div
                key={r.id}
                style={{ opacity: e, transform: reduced ? undefined : `translate3d(${(1 - e) * -8}px,0,0)` }}
                className={`rounded px-1.5 py-1 ${selectedRow ? 'inst-selected' : r.verdict === 'REJECTED' ? 'opacity-70' : ''}`}
              >
                <div
                  className="grid gap-2 items-center font-mono text-micro sm:text-label tnum text-textSecondary"
                  style={{ gridTemplateColumns: compact ? GRID_SM : GRID }}
                >
                  <span className={`truncate ${selectedRow ? 'text-textPrimary' : ''}`}>
                    {r.strike}
                    {r.right} {r.expiry}
                  </span>
                  {!compact && (
                    <span>
                      {r.bid.toFixed(2)}/{r.ask.toFixed(2)}
                    </span>
                  )}
                  {compact && <span>{r.mid.toFixed(2)}</span>}
                  {!compact && <span className={r.spreadPct > 0.06 ? 'text-warn' : ''}>{(r.spreadPct * 100).toFixed(1)}%</span>}
                  {!compact && <span>{r.delta.toFixed(2)}</span>}
                  {!compact && <span className="text-bear">{r.theta.toFixed(2)}</span>}
                  {!compact && <span>{px(r.breakeven)}</span>}
                  {!compact && <span className="text-warn">{(r.executionCost * 100).toFixed(1)}%</span>}
                  <span className={r.ev >= 0 ? 'text-bull' : 'text-bear'}>{(r.ev * 100).toFixed(1)}%</span>
                  <span className="flex items-center gap-1.5 min-w-0">
                    <span className={selectedRow ? 'text-select' : ''}>{(r.utility * 100).toFixed(1)}</span>
                    <span className="relative flex-1 h-[4px] rounded-sm bg-white/[0.06] overflow-hidden min-w-[24px]">
                      <span
                        className={`absolute inset-y-0 ${r.utility >= 0 ? 'left-1/2 bg-select/80' : 'right-1/2 bg-bear/70'}`}
                        style={{ width: `${(clamp01(Math.abs(r.utility) / maxUtil) * grow * 50).toFixed(1)}%` }}
                      />
                    </span>
                  </span>
                </div>
                {ease(at(p, from + 0.1, from + 0.22)) > 0.4 && (
                  <div className="mt-0.5 flex items-center gap-2 min-w-0">
                    <Verdict>{r.verdict}</Verdict>
                    <span className="font-mono text-micro text-textMuted truncate">{r.why}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <Beat p={p} from={0.62} reduced={reduced} className="mt-auto pt-2 border-t border-borderSubtle">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 font-mono text-micro">
            <span className="uppercase tracking-widest text-textMuted">Best expression of this setup</span>
            <span className="text-select tnum">
              {selected.strike}
              {selected.right} {selected.expiry}
            </span>
            <span className="text-textMuted">
              quote age {selected.quoteAgeMs}ms · OI {selected.oi.toLocaleString()} · liquidity risk{' '}
              {(selected.liquidityRisk * 100).toFixed(0)}%
            </span>
          </div>
        </Beat>
      </div>

      <div className="space-y-1">
        <SceneStatement p={p} from={0.7} reduced={reduced}>
          The Weigher prices the difference — the cheapest contract on the board has the highest headline return and the
          worst utility once execution is paid for.
        </SceneStatement>
        <Caveat>
          Modelled chain and quotes · expected value is net of the modelled spread and slippage · not a recommendation
        </Caveat>
      </div>
    </div>
  );
};

export default WeigherScene;
