/*
  The State Thread.

  The one object that is on screen for the whole film. It carries the same packet
  between desks — symbol, session clock, spot, the structural level, and the state
  fields each desk contributes — so a viewer can see that Compass is choosing a
  contract for the same event Pulse detected, rather than taking it on faith.

  Fields stay dim until the desk that measures them has been on screen. Pinpoint
  is the only place a dealer state can come from, so it cannot light up before
  Pinpoint has run.
*/

import React from 'react';
import { useTrailer, THREAD_ACQUISITION, threadHas } from './useTrailerState';
import { clock, px, pct } from './format';
import { SCENES } from './useTrailerTimeline';

/** A travelling wave whose phase is story time — motion that means "still live". */
const ThreadWave: React.FC<{ phase: number; energy: number; reduced: boolean }> = ({ phase, energy, reduced }) => {
  const W = 600;
  const H = 22;
  const pts: string[] = [];
  for (let i = 0; i <= 60; i++) {
    const u = i / 60;
    // Two components: a slow carrier plus a faster ripple that grows with the
    // market's own energy, so the line reads calmer or busier with the story.
    const a = Math.sin((u * 4 + (reduced ? 0 : phase)) * Math.PI * 2) * 3.2;
    const b = Math.sin((u * 11 - (reduced ? 0 : phase * 1.7)) * Math.PI * 2) * 2.1 * energy;
    pts.push(`${i === 0 ? 'M' : 'L'}${(u * W).toFixed(1)},${(H / 2 + a + b).toFixed(1)}`);
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-[22px]" aria-hidden>
      <path d={pts.join('')} fill="none" stroke="#E4E8F4" strokeWidth={1} opacity={0.55} vectorEffect="non-scaling-stroke" />
    </svg>
  );
};

const Chip: React.FC<{ label: string; value: string; lit: boolean; justLit: boolean }> = ({ label, value, lit, justLit }) => (
  <div
    className={`flex items-baseline gap-1.5 px-2 py-1 rounded border whitespace-nowrap transition-colors ${
      lit ? 'border-borderMuted bg-white/[0.03]' : 'border-borderSubtle/60'
    }`}
    style={justLit ? { boxShadow: 'inset 0 0 0 1px rgba(228,232,244,0.35)' } : undefined}
  >
    <span className="font-mono text-micro uppercase tracking-widest text-textMuted">{label}</span>
    <span className={`font-mono text-micro tnum ${lit ? 'text-textPrimary' : 'text-textMuted/60'}`}>{lit ? value : '—'}</span>
  </div>
);

const StateThread: React.FC = () => {
  const { thread, timeline, progress, reduced, compact } = useTrailer();
  const { sceneIndex } = timeline;

  const values: Record<string, string> = {
    ticker: thread.ticker,
    timestamp: clock(thread.timestamp),
    spot: px(thread.spot),
    regime: thread.regime.split(' · ')[0],
    activeLevel: px(thread.activeLevel),
    flowState: thread.flowState,
    dealerState: thread.dealerState.replace('INFERRED ', ''),
    gammaState: thread.gammaState,
    volatilityState: thread.volatilityState.split(' · ')[0],
    setupId: thread.setupId ?? '—',
    contractId: thread.contractId ?? '—',
    upProbability: thread.upProbability != null ? `${Math.round(thread.upProbability * 100)}%` : '—',
  };

  // A chip that lit up in this scene gets a one-scene ring: the moment a desk
  // hands something to the thread is the point of the device.
  const currentSceneId = SCENES[sceneIndex]?.id;

  // Energy: how fast price is moving relative to the level, 0..1.
  const energy = Math.min(1, Math.abs(thread.changePct) / 1.6);
  const phase = timeline.timeMs / 4200;

  const shown = compact
    ? THREAD_ACQUISITION.filter(e => ['ticker', 'spot', 'activeLevel', 'regime', 'flowState', 'gammaState'].includes(e.field))
    : THREAD_ACQUISITION;

  return (
    <div className="border-t border-borderSubtle bg-panel/80 px-3 sm:px-5 py-2">
      <div className="flex items-center gap-3 sm:gap-4">
        <div className="flex items-baseline gap-2 shrink-0">
          <span className="font-mono text-micro uppercase tracking-[0.3em] text-textMuted">State thread</span>
          <span className="font-mono text-label font-semibold tnum text-textPrimary">{thread.ticker}</span>
          <span className={`font-mono text-micro tnum ${thread.changePct >= 0 ? 'text-bull' : 'text-bear'}`}>
            {pct(thread.changePct, 2)}
          </span>
        </div>
        <div className="hidden sm:block flex-1 min-w-0">
          <ThreadWave phase={phase} energy={energy} reduced={reduced} />
        </div>
        <span className="font-mono text-micro tnum text-textSecondary shrink-0">{clock(thread.timestamp)} ET</span>
      </div>
      <div className="mt-1 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        {shown.map(entry => {
          const lit = threadHas(entry.field, sceneIndex);
          return (
            <Chip
              key={entry.field}
              label={entry.label}
              value={values[entry.field] ?? '—'}
              lit={lit}
              justLit={lit && entry.sceneId === currentSceneId && progress < 0.85}
            />
          );
        })}
      </div>
    </div>
  );
};

export default React.memo(StateThread);
