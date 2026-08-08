/*
  /trailer — the route.

  A gate first, then the film. Nothing autoplays at someone who has not asked
  for it: browsers block unmuted autoplay anyway, and a 78-second timeline that
  starts running before the viewer is ready is a worse offence than the audio
  policy it would be dodging. The launch card also tells them what they are
  about to watch and gives them the desks directly if they would rather skip it.
*/

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Play } from 'lucide-react';
import { FOCUS_RING_ON_HOLO } from '../../components/ui/focusRing';
import TrailerShell from './TrailerShell';
import { SCENES, TRAILER_DURATION_MS } from './useTrailerTimeline';

const RUNTIME = `${Math.round(TRAILER_DURATION_MS / 1000)}s`;

const LaunchCard: React.FC<{ onStart: () => void }> = ({ onStart }) => (
  <div className="h-screen w-full flex flex-col items-center justify-center gap-7 bg-canvas text-textPrimary px-6">
    <div className="text-center">
      <div className="font-mono text-2xl sm:text-4xl font-bold tracking-tight">
        <span className="text-textMuted">&gt; </span>
        <span className="holo-text">slayer_terminal</span>
      </div>
      <p className="mt-4 font-mono text-label sm:text-caption uppercase tracking-[0.28em] text-textMuted">
        One market event · {SCENES.length} desks · {RUNTIME}
      </p>
    </div>

    <p className="max-w-xl text-center font-mono text-caption sm:text-data text-textSecondary leading-relaxed">
      A single simulated event followed from the pressure that forms it to the contract that expresses it and the
      record that scores it. Every desk is the real one, reading the same state.
    </p>

    <div className="flex items-center gap-3 flex-wrap justify-center">
      <button
        type="button"
        onClick={onStart}
        className={`inline-flex items-center gap-2 min-h-[44px] px-5 rounded-md font-mono text-data font-semibold uppercase tracking-wider text-ink holo-bg transition-transform hover:scale-[1.02] active:scale-[0.98] ${FOCUS_RING_ON_HOLO}`}
      >
        <Play className="w-4 h-4" /> Play trailer
      </button>
      <Link
        to="/terminal"
        className="inline-flex items-center gap-2 min-h-[44px] px-5 rounded-md border border-borderMuted font-mono text-data uppercase tracking-wider text-textSecondary hover:text-textPrimary hover:bg-rowHover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-select/60 transition-colors"
      >
        Skip to the terminal <ArrowRight className="w-4 h-4" />
      </Link>
    </div>

    <p className="font-mono text-micro uppercase tracking-wider text-textMuted text-center max-w-lg leading-relaxed">
      Simulated market data throughout · for informational purposes only · not investment advice
    </p>
  </div>
);

const SlayerTrailer: React.FC = () => {
  const [started, setStarted] = useState(false);

  // The trailer owns the whole viewport; nothing behind it should scroll.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return started ? <TrailerShell autoStart /> : <LaunchCard onStart={() => setStarted(true)} />;
};

export default SlayerTrailer;
