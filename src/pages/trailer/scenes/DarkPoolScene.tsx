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
import { STORY_SECONDS } from '../trailerStory';

const DarkPoolScene: React.FC = () => {
  const { story, thread, progress: p, storyU, reduced } = useTrailer();
  const dp = story.darkPool;

  // Reveals to the session's position — see PulseScene.
  const reveal = storyU;
  const readT = ease(at(p, 0.5, 0.76));

  // Prints arrive when the session reaches them, not when the scene does. Staged
  // on scene progress they marched in evenly over the scene regardless of their
  // own timestamps — so a print stamped early in the session could arrive after
  // one stamped late, on a chart whose live edge was already past both.
  const revealedTo = storyU * STORY_SECONDS;
  const shown = dp.prints.filter(pr => pr.at <= revealedTo);

  /*
    Touches and distance against the session so far, not against its close.

    Both were stored at build time from the closing spot, so mid-film the panel
    read "+1.07%" while the price above it sat under the shelf, and claimed three
    holds before the third probe had happened. Counted off the one revealed path:
    a crossing down is a touch, a recovery back through is a hold.
  */
  let touches = 0;
  let held = 0;
  let below = false;
  for (const pt of story.path) {
    if (pt.t > revealedTo) break;
    if (!below && pt.px < dp.shelf) {
      below = true;
      touches++;
    } else if (below && pt.px > dp.shelf) {
      below = false;
      held++;
    }
  }
  const distancePct = ((thread.spot - dp.shelf) / dp.shelf) * 100;

  return (
    <div className="h-full flex flex-col gap-3 min-h-0">
      <SceneHead product="Trace · Dark Pool" line="Where liquidity left a memory." p={p} reduced={reduced} />

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_248px] gap-3">
        <div className="relative inst-surface rounded-md p-3 flex flex-col min-h-0">
          <div className="font-mono text-micro uppercase tracking-widest text-textMuted mb-1">
            {thread.ticker} · off-exchange prints against the lit path
          </div>
          <FillBox className="relative flex-1" min={120}>
            {(h, w) => (
            <PriceField
              points={story.path}
              width={w}
              reveal={reveal}
              follow
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
            <Cell label="Touches held" value={`${held}/${touches}`} tone={held === touches ? 'bull' : 'warn'} />
            <Cell label="Distance" value={`${distancePct >= 0 ? '+' : ''}${distancePct.toFixed(2)}%`} tone={distancePct >= 0 ? 'bull' : 'bear'} />
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
          {touches === 0
            ? `Price has not reached ${px(dp.shelf)} yet — the shelf is a claim about where size sits, not a prediction.`
            : `${touches} ${touches === 1 ? 'touch' : 'touches'}, ${held} ${held === 1 ? 'hold' : 'holds'} — the shelf is absorbing on the weight of evidence, and that is still a reading, not a direction.`}
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
