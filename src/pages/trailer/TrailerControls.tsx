/*
  The control layer.

  Restrained by design: the film has to be escapable at every moment, and the
  viewer has to know which product they are looking at and how far through they
  are. Controls fade when the pointer is still and come back on any input, but
  they never fully leave while paused — a control you cannot find is a trap.
*/

import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, ChevronLeft, ChevronRight, Pause, Play, RotateCcw, SkipForward, Volume2, VolumeX, X } from 'lucide-react';
import { SCENES, TRAILER_DURATION_MS } from './useTrailerTimeline';
import { useTrailer } from './useTrailerState';
import { useTicker } from '../../context/MarketDataContext';

const Btn: React.FC<{
  onClick: () => void;
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}> = ({ onClick, label, children, wide = false }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    title={label}
    /* 44px minimum target — the controls have to be reachable with a thumb on a
       phone, where this bar sits over live content. */
    className={`inline-flex items-center justify-center gap-1.5 min-h-[44px] ${
      wide ? 'px-3' : 'min-w-[44px]'
    } rounded-md border border-borderSubtle bg-panel/80 text-textSecondary hover:text-textPrimary hover:bg-rowHover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-select/60 transition-colors`}
  >
    {children}
  </button>
);

/**
 * The chapter bar.
 *
 * Eighteen segments across a phone is 15px of tappable width each — a control
 * the rest of this transport deliberately sizes at 44px, shrunk to a third of a
 * fingertip because the desktop layout happened to divide evenly. On compact the
 * row scrolls instead, each chapter keeping a 44×44 hit area with the same 3px
 * bar centred in it; on desktop nothing changes, because there the segments are
 * wide enough already.
 */
export const TrailerProgress: React.FC = () => {
  const { timeline, compact } = useTrailer();
  const { timeMs, sceneIndex, goToScene } = timeline;
  return (
    <div
      className={`flex items-center gap-[3px] w-full ${compact ? 'overflow-x-auto no-scrollbar' : ''}`}
      role="group"
      aria-label="Trailer chapters"
    >
      {SCENES.map((s, i) => {
        const local =
          timeMs <= s.enterAtMs ? 0 : timeMs >= s.exitAtMs ? 1 : (timeMs - s.enterAtMs) / (s.exitAtMs - s.enterAtMs);
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => goToScene(i)}
            aria-label={`Scene ${i + 1} of ${SCENES.length}: ${s.product}`}
            aria-current={i === sceneIndex ? 'step' : undefined}
            title={s.product}
            className={`group relative flex items-center focus-visible:outline-none ${
              compact ? 'shrink-0 min-w-[44px] min-h-[44px] px-1' : 'flex-1 h-6'
            }`}
          >
            <span className="relative block w-full h-[3px] rounded-full bg-white/[0.09] overflow-hidden group-hover:bg-white/20 group-focus-visible:bg-white/25">
              <span
                className="absolute inset-y-0 left-0 bg-select rounded-full"
                style={{ width: `${local * 100}%` }}
              />
            </span>
          </button>
        );
      })}
    </div>
  );
};

const TrailerControls: React.FC<{
  visible: boolean;
  muted: boolean;
  onToggleMute: () => void;
}> = ({ visible, muted, onToggleMute }) => {
  const { timeline, story } = useTrailer();
  const { changeTicker } = useTicker();
  const { playing, scene, sceneIndex, toggle, replay, skipToEnd, step, timeMs } = timeline;

  const remaining = Math.max(0, TRAILER_DURATION_MS - timeMs);
  const mmss = `${Math.floor(remaining / 60000)}:${String(Math.floor((remaining % 60000) / 1000)).padStart(2, '0')}`;

  return (
    <div
      className={`transition-opacity duration-300 ${visible || !playing ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
    >
      <div className="px-3 sm:px-5 pt-2">
        <TrailerProgress />
      </div>
      <div className="px-3 sm:px-5 pb-2 pt-1 flex items-center gap-2 flex-wrap">
        <Btn onClick={toggle} label={playing ? 'Pause' : 'Play'}>
          {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </Btn>
        <Btn onClick={() => step(-1)} label="Previous scene">
          <ChevronLeft className="w-4 h-4" />
        </Btn>
        <Btn onClick={() => step(1)} label="Next scene">
          <ChevronRight className="w-4 h-4" />
        </Btn>
        <Btn onClick={replay} label="Replay from the start">
          <RotateCcw className="w-4 h-4" />
        </Btn>
        <Btn onClick={skipToEnd} label="Skip to the end">
          <SkipForward className="w-4 h-4" />
        </Btn>
        <Btn onClick={onToggleMute} label={muted ? 'Sound off' : 'Sound on'}>
          {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </Btn>

        <div className="flex items-baseline gap-2 min-w-0 ml-1">
          <span className="font-mono text-micro uppercase tracking-widest text-textMuted shrink-0">
            {String(sceneIndex + 1).padStart(2, '0')}/{SCENES.length}
          </span>
          <span className="font-mono text-label uppercase tracking-wider text-textPrimary truncate">{scene.product}</span>
          <span className="font-mono text-micro tnum text-textMuted shrink-0">−{mmss}</span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {scene.route && (
            <Link
              to={scene.route}
              state={{ focusTicker: story.ticker }}
              /*
                Carry the symbol across. Every desk reads the global active
                ticker, which the app opens on SPY — so "Open desk" from a film
                about NVDA used to land on a desk showing something else, and the
                one promise the button makes (this is the real thing you were
                just watching) was the one it broke. `changeTicker` is the same
                call the top-bar switcher makes; the `focusTicker` state is the
                documented Pulse deep-link contract, which also marks the chart.
              */
              onClick={() => changeTicker(story.ticker)}
              className="inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-md border border-select/30 bg-select/10 font-mono text-label font-semibold uppercase tracking-wider text-select hover:bg-select/15 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-select/60 transition-colors"
            >
              Open {story.ticker} desk <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          )}
          <Link
            to="/terminal"
            aria-label="Exit the trailer"
            title="Exit"
            className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] rounded-md border border-borderSubtle bg-panel/80 text-textSecondary hover:text-textPrimary hover:bg-rowHover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-select/60 transition-colors"
          >
            <X className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
};

export default TrailerControls;
