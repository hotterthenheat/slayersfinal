/*
  Scene 0 — terminal ignition.

  The terminal assembles out of structural lines and a clock, not out of fake
  command-line typing. Three status lines resolve, the symbol locks, and the film
  hands straight over to Pulse. No matrix rain, no hex, no logo bloom.
*/

import React from 'react';
import { useTrailer, at, ease } from '../useTrailerState';
import { Beat, Caveat } from '../parts';
import { clock, px } from '../format';

const STATUS = ['MARKET SESSION DETECTED', 'DATA STATE SYNCHRONIZED', 'SLAYER TERMINAL ONLINE'];

/** A heartbeat, drawn once and swept by phase — the machine having a pulse. */
const Heartbeat: React.FC<{ phase: number; reduced: boolean }> = ({ phase, reduced }) => {
  const W = 900;
  const H = 44;
  const pts: string[] = [];
  for (let i = 0; i <= 90; i++) {
    const u = i / 90;
    const d = Math.abs(((u * 3 + (reduced ? 0.5 : phase)) % 1) - 0.5);
    // A narrow spike rather than a sine — a data tick, not decoration.
    const spike = d < 0.06 ? Math.cos((d / 0.06) * Math.PI * 0.5) * 15 : 0;
    pts.push(`${i === 0 ? 'M' : 'L'}${(u * W).toFixed(1)},${(H / 2 - spike).toFixed(1)}`);
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full" style={{ height: H }} aria-hidden>
      <path d={pts.join('')} fill="none" stroke="#E4E8F4" strokeWidth={1} opacity={0.7} vectorEffect="non-scaling-stroke" />
    </svg>
  );
};

const IgnitionScene: React.FC = () => {
  const { thread, progress: p, reduced, story } = useTrailer();

  // Structural rules draw outward from the centre before anything else appears.
  const rule = ease(at(p, 0, 0.22));

  return (
    <div className="h-full flex flex-col items-center justify-center gap-6 min-h-0 px-2">
      <div className="w-full max-w-3xl">
        <div className="relative h-px bg-borderSubtle">
          <div
            className="absolute inset-y-0 left-1/2 -translate-x-1/2 bg-select"
            style={{ width: `${rule * 100}%`, opacity: 0.8 }}
          />
        </div>
      </div>

      <Beat p={p} from={0.14} to={0.3} reduced={reduced} className="text-center">
        <div className="flex items-baseline justify-center gap-3 font-mono">
          <span className="text-micro uppercase tracking-[0.4em] text-textMuted">Session</span>
          <span className="text-caption tnum text-textPrimary">{clock(thread.timestamp)} ET</span>
          <span className="text-micro uppercase tracking-[0.4em] text-textMuted">Symbol</span>
          <span className="text-caption font-semibold text-textPrimary">{thread.ticker}</span>
          <span className="text-caption tnum text-textPrimary">{px(thread.spot)}</span>
        </div>
      </Beat>

      <Beat p={p} from={0.2} to={0.34} reduced={reduced} className="w-full max-w-3xl">
        <Heartbeat phase={p * 2.2} reduced={reduced} />
      </Beat>

      <ol className="w-full max-w-md space-y-1.5">
        {STATUS.map((s, i) => {
          const from = 0.26 + i * 0.11;
          const e = ease(at(p, from, from + 0.07));
          return (
            <li key={s} className="flex items-center gap-3" style={{ opacity: e }}>
              <span className="w-1.5 h-1.5 rounded-full bg-bull shrink-0" style={{ opacity: e }} />
              <span className="font-mono text-label uppercase tracking-[0.22em] text-textSecondary">{s}</span>
              <span className="ml-auto font-mono text-micro tnum text-textMuted">OK</span>
            </li>
          );
        })}
      </ol>

      <Beat p={p} from={0.62} to={0.82} reduced={reduced} className="text-center px-2">
        <p className="font-mono text-caption sm:text-lead uppercase tracking-[0.18em] text-textPrimary leading-relaxed">
          The market is not a chart.
          <br />
          It is a field of pressure.
        </p>
      </Beat>

      <Beat p={p} from={0.72} to={0.9} reduced={reduced} className="text-center">
        <Caveat>
          Simulated session · {thread.ticker} · structural level {px(story.level)} · every value modelled, not a live feed
        </Caveat>
      </Beat>
    </div>
  );
};

export default IgnitionScene;
