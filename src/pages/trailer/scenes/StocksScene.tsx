/*
  Scene 13 — Stocks.

  Short, but it carries the piece that makes the desk a system rather than an
  options screener: routing. A thesis is not automatically an option. The same
  composite that ranks the name also decides whether it should be expressed in
  stock, options, a spread, or not at all.
*/

import React from 'react';
import { useTrailer, at, clamp01, ease } from '../useTrailerState';
import { Bar, Beat, Caveat, HeadRow, SceneHead, SceneStatement, Verdict } from '../parts';

const GRID = '64px 1fr 1fr 1fr 1fr 74px 92px';
const GRID_SM = '58px 1fr 92px';

const FACTORS: { key: 'momentum' | 'quality' | 'flow' | 'news'; label: string }[] = [
  { key: 'momentum', label: 'MOM' },
  { key: 'quality', label: 'QUAL' },
  { key: 'flow', label: 'FLOW' },
  { key: 'news', label: 'NEWS' },
];

const StocksScene: React.FC = () => {
  const { story, progress: p, reduced, compact } = useTrailer();
  const grow = ease(at(p, 0.14, 0.56));

  return (
    <div className="h-full flex flex-col gap-3 min-h-0">
      <SceneHead product="Stocks" line="One thesis. Multiple instruments. One capital decision." p={p} reduced={reduced} />

      <div className="flex-1 min-h-0 inst-surface rounded-md p-3 flex flex-col overflow-hidden">
        <div className="flex items-baseline justify-between gap-2 mb-1.5">
          <span className="font-mono text-micro uppercase tracking-widest text-textMuted">
            Semis · relative strength and breadth
          </span>
          <span className="font-mono text-micro uppercase tracking-wider text-textSecondary">
            sector {story.stocks[0].sector} · breadth 62%
          </span>
        </div>
        <HeadRow
          cols={compact ? ['TICKER', 'COMPOSITE', 'EXPRESSION'] : ['TICKER', ...FACTORS.map(f => f.label), 'COMPOSITE', 'EXPRESSION']}
          grid={compact ? GRID_SM : GRID}
        />
        <div className="mt-1 flex-1 min-h-0 flex flex-col justify-evenly">
          {story.stocks.map((s, i) => {
            const e = clamp01((ease(at(p, 0.1, 0.7)) - i * 0.1) / 0.5);
            if (e <= 0) return null;
            return (
              <div
                key={s.ticker}
                className={`grid gap-2 items-center py-1 rounded ${s.ours ? 'inst-selected pl-1.5' : ''}`}
                /* Grid template on the row itself so columns line up with the
                   header without a wrapper that would break the selected rail. */
                style={{ opacity: e, gridTemplateColumns: compact ? GRID_SM : GRID }}
              >
                <span className={`font-mono text-label font-semibold ${s.ours ? 'text-textPrimary' : 'text-textSecondary'}`}>
                  {s.ticker}
                </span>
                {!compact &&
                  FACTORS.map(f => (
                    <span key={f.key} className="min-w-0">
                      <Bar value={s[f.key]} grow={grow} tone={s.ours ? 'select' : 'neutral'} height={4} />
                    </span>
                  ))}
                <span className="font-mono text-label tnum text-textPrimary">{(s.composite * 100).toFixed(0)}</span>
                {/* The routing itself, not a verdict word standing in for it.
                    Mapped to SELECTED/ALTERNATIVE, STOCK and SPREAD both rendered
                    ALTERNATIVE — so a column headed EXPRESSION hid the one thing
                    it exists to show, and the scene's whole argument about
                    routing to different instruments was invisible. */}
                <Verdict>{s.routing}</Verdict>
              </div>
            );
          })}
        </div>

        <Beat p={p} from={0.5} reduced={reduced} className="mt-auto pt-2 border-t border-borderSubtle">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 font-mono text-micro">
            <span className="uppercase tracking-widest text-textMuted">Expression for {story.stocks[0].ticker}</span>
            <span className="text-select uppercase tracking-wider">OPTIONS</span>
            <span className="text-textMuted">
              convexity is worth its cost at this horizon · stock and spread both scored lower after financing and
              slippage
            </span>
          </div>
        </Beat>
      </div>

      <div className="space-y-1">
        <SceneStatement p={p} from={0.62} reduced={reduced}>
          The system chooses the instrument, not just the name — and one of these names routes to no trade at all.
        </SceneStatement>
        <Caveat>Modelled factor scores · routing compares modelled net outcomes across instruments, after costs</Caveat>
      </div>
    </div>
  );
};

export default StocksScene;
