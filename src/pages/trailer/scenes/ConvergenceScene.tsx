/*
  Scene 17 — convergence.

  Pull back. Nine desks on one event at once, each showing the one number it
  owns, connected by the thread that carried the state between them. It is not a
  static frame: the clock runs, the path extends, the scan re-ranks and the
  tracked setup keeps moving, because the last thing a viewer should see is the
  system still working.
*/

import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { useTrailer, at, clamp01, ease } from '../useTrailerState';
import { Beat, Caveat, FillBox, PriceField, SceneHead } from '../parts';
import { clock, prob, px } from '../format';
import { useTicker } from '../../../context/MarketDataContext';

interface Tile {
  product: string;
  route: string;
  label: string;
  value: string;
  tone?: string;
}

const ConvergenceScene: React.FC = () => {
  const { story, thread, timeline, progress: p, storyU, reduced } = useTrailer();
  const { changeTicker } = useTicker();

  const build = ease(at(p, 0.06, 0.5));
  // Reaches the full path here because the session does, not because the scene says so.
  const reveal = storyU;

  const tiles: Tile[] = [
    { product: 'Pulse', route: '/pulse', label: 'Regime', value: thread.regime.split(' · ')[0], tone: 'text-warn' },
    { product: 'Trace · Tape', route: '/trace/live-tape', label: 'Flow', value: thread.flowState },
    { product: 'Trace · Scanner', route: '/trace/scanner', label: 'Rank', value: `#1 of ${story.scanner.length}` },
    { product: 'Trace · Reconstruction', route: '/trace/reconstruction', label: 'Parent likelihood', value: prob(story.metaorder.hypotheses[0].probability) },
    { product: 'Trace · Dark Pool', route: '/trace/dark-pool', label: 'Shelf', value: px(story.darkPool.shelf), tone: 'text-darkpool' },
    { product: 'Pinpoint', route: '/pinpoint/gamma', label: 'Flip', value: px(story.levels.flip), tone: 'text-flip' },
    { product: 'Compass', route: '/compass', label: 'Setup', value: story.packet.setupId, tone: 'text-select' },
    { product: 'Prove It', route: '/prove-it', label: 'Confidence', value: prob(0.63) },
    { product: 'Stocks', route: '/stocks', label: 'Expression', value: 'OPTIONS' },
    { product: 'News', route: '/news', label: 'Repricing', value: `${(story.news.widthAfter * 100).toFixed(1)}% wide` },
    { product: 'Earnings', route: '/earnings', label: 'Verdict', value: story.earnings.selected },
    { product: 'Tracker', route: '/tracker', label: 'Thesis', value: story.outcome.survived ? 'SURVIVED' : 'BROKEN', tone: 'text-bull' },
  ];

  return (
    <div className="h-full flex flex-col gap-3 min-h-0">
      <SceneHead
        product="Slayer Terminal"
        line="One event, nine desks, one state."
        p={p}
        reduced={reduced}
      />

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-3">
        <div className="inst-surface rounded-md p-3 flex flex-col min-h-0">
          <div className="flex items-baseline justify-between gap-2 mb-1">
            <span className="font-mono text-micro uppercase tracking-widest text-textMuted">
              {thread.ticker} · session {clock(thread.timestamp)} ET
            </span>
            <span className="font-mono text-caption tnum text-textPrimary">{px(thread.spot)}</span>
          </div>
          <FillBox className="flex-1" min={110}>
            {(h, w) => (
            <PriceField
              points={story.path}
              width={w}
              reveal={reveal}
              pulse={p * 3}
              height={h}
              ariaLabel="The full simulated session with every structural level the trailer referred to"
              levels={[
                { price: story.levels.callWall, label: `CALL WALL ${px(story.levels.callWall)}`, kind: 'resistance' },
                { price: story.levels.flip, label: `FLIP ${px(story.levels.flip)}`, kind: 'flip' },
                { price: story.level, label: `SHELF ${px(story.level)}`, kind: 'shelf' },
              ]}
            />
            )}
          </FillBox>
        </div>

        <div className="grid grid-cols-2 gap-1.5 content-start min-h-0 overflow-hidden">
          {tiles.map((t, i) => {
            const e = clamp01((build - (i / tiles.length) * 0.5) / 0.5);
            if (e <= 0) return null;
            return (
              <Link
                key={t.product}
                to={t.route}
                state={{ focusTicker: story.ticker }}
                /* Same handoff as the transport's Open desk. Twelve tiles that
                   each summarise the NVDA event but open a desk still showing
                   SPY is the same broken promise, twelve times over. */
                onClick={() => changeTicker(story.ticker)}
                style={{ opacity: e, transform: reduced ? undefined : `translate3d(0, ${(1 - e) * 6}px, 0)` }}
                className="inst-surface rounded px-2 py-1.5 min-w-0 hover:bg-rowHover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-select/60 transition-colors"
              >
                <div className="font-mono text-micro uppercase tracking-wider text-textMuted truncate">{t.product}</div>
                <div className={`font-mono text-micro tnum truncate ${t.tone ?? 'text-textPrimary'}`}>{t.value}</div>
              </Link>
            );
          })}
        </div>
      </div>

      <Beat p={p} from={0.42} reduced={reduced}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-0.5">
          {['Map the force.', 'Weigh the expression.', 'Prove the edge.', 'Track the truth.'].map((line, i) => {
            const e = ease(at(p, 0.44 + i * 0.06, 0.56 + i * 0.06));
            return (
              <span
                key={line}
                style={{ opacity: e }}
                className="font-mono text-label sm:text-caption uppercase tracking-[0.16em] text-textPrimary"
              >
                {line}
              </span>
            );
          })}
        </div>
      </Beat>

      <Beat p={p} from={0.62} reduced={reduced}>
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            to="/terminal"
            onClick={() => changeTicker(story.ticker)}
            className="inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-md font-mono text-label font-semibold uppercase tracking-wider text-ink holo-bg transition-transform active:scale-[0.98]"
          >
            Enter terminal <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
          <button
            type="button"
            onClick={() => timeline.goToScene(1)}
            className="inline-flex items-center min-h-[44px] px-4 rounded-md border border-borderMuted font-mono text-label uppercase tracking-wider text-textSecondary hover:text-textPrimary hover:bg-rowHover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-select/60 transition-colors"
          >
            Explore the system
          </button>
          <button
            type="button"
            onClick={timeline.replay}
            className="inline-flex items-center min-h-[44px] px-4 rounded-md border border-borderSubtle font-mono text-label uppercase tracking-wider text-textMuted hover:text-textPrimary hover:bg-rowHover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-select/60 transition-colors"
          >
            Replay
          </button>
          <Caveat>
            Simulated market data throughout · for informational purposes only · not investment advice
          </Caveat>
        </div>
      </Beat>
    </div>
  );
};

export default ConvergenceScene;
