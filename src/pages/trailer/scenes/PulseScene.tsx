/*
  Scene 1 — Pulse.

  Cause and response, in one frame: price walks down into the structural level,
  order-flow pressure builds against it, liquidity thins, and the regime read
  turns. The chart is the same shaped path every later scene refers back to, so
  the level here is the level Compass trades and Tracker freezes.
*/

import React from 'react';
import { useTrailer, at, clamp01, ease } from '../useTrailerState';
import { Bar, Beat, Caveat, Cell, FillBox, KeyValue, PriceField, SceneHead, SceneStatement } from '../parts';
import { px, pct } from '../format';

const PulseScene: React.FC = () => {
  const { story, thread, progress: p, storyU, reduced } = useTrailer();

  // The chart reveals to the session's own position, never past it. Staging this
  // scene-locally drew the whole path — including the closing rebound — while the
  // spot beside it still read the open, so the pulsing live edge and the price it
  // sat next to described different moments.
  const reveal = storyU;
  const grow = ease(at(p, 0.3, 0.62));
  const belowFlip = thread.spot < story.levels.flip;

  // Pressure is a story quantity, not a random walk: it builds as price closes
  // on the level and eases once the level holds.
  const distance = Math.abs(thread.spot - story.level) / story.level;
  const pressure = clamp01(1 - distance * 140);
  const thinning = clamp01(0.28 + pressure * 0.6);

  return (
    <div className="h-full flex flex-col gap-3 min-h-0">
      <SceneHead product="Pulse" line="The market state before the trade." p={p} reduced={reduced} />

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_260px] gap-3">
        <div className="inst-surface rounded-md p-3 flex flex-col min-h-0">
          <div className="flex items-baseline justify-between gap-3 mb-1">
            <span className="font-mono text-micro uppercase tracking-widest text-textMuted">
              {thread.ticker} · 1M · session
            </span>
            <span className="font-mono text-caption tnum text-textPrimary">
              {px(thread.spot)}{' '}
              <span className={thread.changePct >= 0 ? 'text-bull' : 'text-bear'}>{pct(thread.changePct, 2)}</span>
            </span>
          </div>
          <FillBox className="flex-1" min={130}>
            {h => (
            <PriceField
              points={story.path}
              reveal={reveal}
              follow
              pulse={p * 3}
              height={h}
              ariaLabel={`Simulated ${thread.ticker} session path pressing into the ${px(story.level)} structural level`}
              levels={[
                { price: story.levels.callWall, label: `CALL WALL ${px(story.levels.callWall)}`, kind: 'resistance' },
                { price: story.levels.flip, label: `FLIP ${px(story.levels.flip)}`, kind: 'flip' },
                { price: story.level, label: `SHELF ${px(story.level)}`, kind: 'support' },
              ]}
            />
            )}
          </FillBox>
        </div>

        <div className="flex flex-col gap-2 min-h-0">
          <Beat p={p} from={0.24} reduced={reduced}>
            <div className="inst-surface rounded-md p-2.5">
              <div className="font-mono text-micro uppercase tracking-widest text-textMuted mb-1.5">
                Order-flow pressure
              </div>
              <div className="space-y-1.5">
                <div>
                  <div className="flex items-baseline justify-between font-mono text-micro">
                    <span className="text-textSecondary">Against the level</span>
                    <span className="tnum text-textPrimary">{Math.round(pressure * 100)}</span>
                  </div>
                  <Bar value={pressure} grow={grow} tone="bear" />
                </div>
                <div>
                  <div className="flex items-baseline justify-between font-mono text-micro">
                    <span className="text-textSecondary">Resting depth</span>
                    <span className="tnum text-textPrimary">{Math.round((1 - thinning) * 100)}</span>
                  </div>
                  <Bar value={1 - thinning} grow={grow} tone="neutral" />
                </div>
              </div>
            </div>
          </Beat>

          <Beat p={p} from={0.36} reduced={reduced}>
            <div className="inst-surface rounded-md p-2.5">
              <div className="font-mono text-micro uppercase tracking-widest text-textMuted mb-1">Dealer pressure</div>
              <KeyValue k="Regime" v={thread.regime} tone={belowFlip ? 'warn' : 'info'} />
              <KeyValue k="Flip" v={px(story.levels.flip)} tone="info" />
              <KeyValue k="Put wall" v={px(story.levels.putWall)} tone="bull" />
              <KeyValue k="Call wall" v={px(story.levels.callWall)} tone="bear" />
            </div>
          </Beat>

          <Beat p={p} from={0.48} reduced={reduced} className="grid grid-cols-2 gap-2">
            <Cell label="Distance to shelf" value={pct(((thread.spot - story.level) / story.level) * 100, 2)} tone={thread.spot >= story.level ? 'bull' : 'bear'} />
            <Cell label="Regime read" value={belowFlip ? 'PRESSURE' : 'STABILIZING'} tone={belowFlip ? 'warn' : 'info'} />
          </Beat>
        </div>
      </div>

      <div className="space-y-1">
        <SceneStatement p={p} from={0.58} reduced={reduced}>
          Pressure is forming against {px(story.level)} — and the regime changes on the way through it, not at it.
        </SceneStatement>
        <Caveat>
          Modelled session · levels derived from the simulated chain · regime is an inference from dealer positioning,
          not an observation
        </Caveat>
      </div>
    </div>
  );
};

export default PulseScene;
