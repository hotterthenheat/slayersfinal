/*
  Scene 5 — Trace, dark pool.

  Off-exchange prints stop being a feed and become a spatial object: a shelf
  sitting in price, at the same level Pulse was pressing into. Four readings are
  shown weighted rather than one arrow, because a print off-exchange is a record
  of size changing hands, not a direction.
*/

import React from 'react';
import { useTrailer, at, clamp01, ease } from '../useTrailerState';
import { Beat, Caveat, Cell, FillBox, PriceField, SceneHead, SceneStatement } from '../parts';
import { px, usd } from '../format';

const DarkPoolScene: React.FC = () => {
  const { story, thread, progress: p, reduced } = useTrailer();
  const dp = story.darkPool;

  const reveal = clamp01(0.2 + ease(at(p, 0.04, 0.6)) * 0.8);
  const readT = ease(at(p, 0.5, 0.76));

  const shown = dp.prints.filter((_, i) => p > 0.12 + (i / dp.prints.length) * 0.42);

  return (
    <div className="h-full flex flex-col gap-3 min-h-0">
      <SceneHead product="Trace · Dark Pool" line="Where liquidity left a memory." p={p} reduced={reduced} />

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_248px] gap-3">
        <div className="relative inst-surface rounded-md p-3 flex flex-col min-h-0">
          <div className="font-mono text-micro uppercase tracking-widest text-textMuted mb-1">
            {thread.ticker} · off-exchange prints against the lit path
          </div>
          <FillBox className="relative flex-1" min={120}>
            {h => (
            <PriceField
              points={story.path}
              reveal={reveal}
              pulse={p * 3}
              height={h}
              ariaLabel={`Off-exchange prints forming a shelf at ${px(dp.shelf)} beneath the simulated price path`}
              levels={[{ price: dp.shelf, label: `SHELF ${px(dp.shelf)} · ${usd(dp.shelfNotional)}`, kind: 'shelf' }]}
            />
            )}
          </FillBox>
          <Beat p={p} from={0.34} reduced={reduced} className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Cell label="Shelf" value={px(dp.shelf)} tone="info" />
            <Cell label="Notional" value={usd(dp.shelfNotional)} />
            <Cell label="Touches held" value={`${dp.survivedTouches}/${dp.touches}`} tone="bull" />
            <Cell label="Distance" value={`${dp.distancePct >= 0 ? '+' : ''}${dp.distancePct}%`} />
          </Beat>
        </div>

        <div className="flex flex-col gap-2 min-h-0">
          <Beat p={p} from={0.44} reduced={reduced}>
            <div className="inst-surface rounded-md p-2.5">
              <div className="font-mono text-micro uppercase tracking-widest text-textMuted mb-1.5">
                Readings that fit
              </div>
              <div className="space-y-1.5">
                {dp.readings.map((r, i) => (
                  <div key={r.label}>
                    <div className="flex items-baseline justify-between gap-2 font-mono text-micro">
                      <span className={i === 0 ? 'text-textPrimary' : 'text-textSecondary'}>{r.label}</span>
                      <span className="tnum text-textPrimary">{Math.round(r.weight * readT * 100)}%</span>
                    </div>
                    <div className="h-[3px] rounded-full bg-white/[0.06] overflow-hidden mt-0.5">
                      <div
                        className={i === 0 ? 'h-full bg-darkpool' : 'h-full bg-white/25'}
                        style={{ width: `${clamp01(r.weight * readT) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Beat>

          <Beat p={p} from={0.56} reduced={reduced} className="min-h-0">
            <div className="inst-surface rounded-md p-2.5">
              <div className="font-mono text-micro uppercase tracking-widest text-textMuted mb-1">Prints</div>
              <div className="space-y-[3px]">
                {shown.slice(-5).map(pr => (
                  <div key={`${pr.at}-${pr.px}`} className="flex items-baseline justify-between gap-2 font-mono text-micro tnum">
                    <span className="text-textMuted truncate">{pr.venue}</span>
                    <span className="text-textSecondary">{px(pr.px)}</span>
                    <span className="text-textPrimary">{usd(pr.notional)}</span>
                  </div>
                ))}
              </div>
            </div>
          </Beat>
        </div>
      </div>

      <div className="space-y-1">
        <SceneStatement p={p} from={0.66} reduced={reduced}>
          Three touches, three holds — the shelf is absorbing on the weight of evidence, and that is still a reading, not
          a direction.
        </SceneStatement>
        <Caveat>
          Modelled off-exchange prints · a print records size, never intent · absorption is the best-supported of four
          readings, not a confirmed one
        </Caveat>
      </div>
    </div>
  );
};

export default DarkPoolScene;
