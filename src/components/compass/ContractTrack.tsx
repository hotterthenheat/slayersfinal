/*
==================================================
  SLAYER TERMINAL - CONTRACT TRACK (ContractTrack.tsx)
  The monitor's chart: where this contract's premium has
  been (repriced on real bars), what standing still costs
  (theta forward, spot held), what it's worth parked at
  the stop, and every level twice — in premium AND as the
  underlying price that pays it. Math in trackModel.ts;
  this file only draws.

  THE HOUSE CHART, round 4 (both Noah, 2026-08-29). Round
  3 swapped recharts for the lightweight-charts engine
  ("a tradingview chart with tps, stops being labeled on
  the chart") but kept the dossier header above a boxed
  plot — Noah, with his partner's contract chart in hand:
  "what we currently have is NOT close". What IS close is
  our own Weigher contract lens, so this card now speaks
  that grammar: the tape runs edge to edge, and ONE
  transparent strip rides it — contract capsule, live
  mark + change, timeframe chips, the Stock/Premium door
  — with the campaign context and off-scale note as
  whispers beneath. trackModel still owns every number.
==================================================
*/

import { useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import Panel from '../ui/Panel';
import Chip from '../ui/Chip';
import SpotPrice from '../gex/SpotPrice';
import type { Setup } from '../../types/compass';
import Simulator from '../../core/simulator';
import { TIMEFRAMES, tfMinutes, type Timeframe } from '../../data/timeframe';
import { buildSetupTrack, barsToSpan, type TrackLevel } from './trackModel';
import ContractPremiumPane, { type PremiumLevel, type PremiumProjection } from '../gex/ContractPremiumPane';
import { BULL } from '../gex/palette';

const MUTED_INK = '#7d7d7d'; // matches textMuted (the lifted AA value)
const WARN_INK = '#FF9500';
const REF_INK = '#ededed';

/* TPs are ONE family — the stock campaign map's green (hits bright, the
   rest dimmed), never neon (Noah, 2026-08-29: "tps should not be neon.
   even on the premium chart"). The status distinction rides the label
   words, not a third color. */
const LEVEL_INK: Record<TrackLevel['status'], string> = {
  HIT: BULL,
  'IN PROGRESS': BULL,
  PENDING: 'rgba(48,209,88,0.55)',
  STOP: WARN_INK,
  REF: REF_INK,
};

interface ContractTrackProps {
  setup: Setup;
  /** Tick pulse — recomputes the series so the NOW pin follows the live mid. */
  revision: number;
  /** Campaign retired (floor broken): the past stays, the future doesn't —
      no theta-forward, no stop curve, no "time left" for a dead thesis. */
  retired?: boolean;
  /** Extra strip controls — the campaign page mounts its Stock/Premium
      chart toggle here so the way back rides on this panel too. */
  actions?: React.ReactNode;
  /** Fullscreen takeover — state owned by the campaign page (it shares the
      stock view's chartFull, so Esc and the scroll lock come for free). */
  fullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

const ContractTrack = ({ setup, revision, retired = false, actions, fullscreen = false, onToggleFullscreen }: ContractTrackProps) => {
  const [timeframe, setTimeframe] = useState<Timeframe>('1m');

  /* The chrome's real height, handed to the pane as reserved headroom —
     the strip WRAPS at narrow widths and a TP near the top of scale was
     running its label into the timeframe row (Noah, 2026-08-29: "tps
     should not overlap the top section"). Measured, not guessed, so the
     plot starts below the chrome at every card size, fullscreen included. */
  const tapeRef = useRef<HTMLDivElement | null>(null);
  const chromeRef = useRef<HTMLDivElement | null>(null);
  const [topMargin, setTopMargin] = useState(0.2);
  useEffect(() => {
    const measure = () => {
      const tape = tapeRef.current?.clientHeight ?? 0;
      const chrome = chromeRef.current?.clientHeight ?? 0;
      if (tape > 0 && chrome > 0) setTopMargin(Math.min(0.4, Math.max(0.1, (chrome + 16) / tape)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (tapeRef.current) ro.observe(tapeRef.current);
    if (chromeRef.current) ro.observe(chromeRef.current);
    return () => ro.disconnect();
  }, []);

  const { track, projections } = useMemo(() => {
    void revision;
    const bars = Simulator.getCandles(setup.ticker) ?? [];
    const built = buildSetupTrack(setup, bars);
    /* The modeled futures, restated on the clock: trackModel speaks in
       1-minute bar offsets from NOW; the engine wants timestamps. Thinned to
       the shown timeframe so the projected region keeps the tape's own bar
       spacing — minute points between 5m candles would stretch it 5×. */
    const lastT = bars.length ? bars[bars.length - 1].time : 0;
    const step = Math.max(1, Math.round(tfMinutes(timeframe)));
    const toPts = (pts: { bar: number; premium: number }[]) => {
      const lastBar = pts.length ? pts[pts.length - 1].bar : 0;
      return pts
        .filter(q => q.bar >= 0 && (q.bar % step === 0 || q.bar === lastBar))
        .map(q => ({ time: lastT + q.bar * 60, value: q.premium }));
    };
    const projs: PremiumProjection[] = [];
    if (!retired && lastT) {
      const fwd = toPts(built.forward);
      if (fwd.length >= 2) projs.push({ key: 'forward', color: MUTED_INK, points: fwd });
      if (built.stopCurve) {
        const st = toPts(built.stopCurve);
        if (st.length >= 2) projs.push({ key: 'stop', color: WARN_INK, points: st });
      }
    }
    return { track: built, projections: projs };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setup.id, setup.mid, revision, retired, timeframe]);

  const up = track.sessionChangePct >= 0;
  const undocked = track.levels.filter(l => !l.docked);
  const docked = track.levels.filter(l => l.docked);
  const changeAbs = Math.abs((setup.mid * track.sessionChangePct) / 100);

  /* Every rule the model prices, labeled ON the tape — the docked ones stay
     off the plot (their premiums are beyond the shown scale) and keep their
     whisper note. Reference is dotted: it is where you got in, not a target.
     The ink IS the status (green = banked, neon = the one price is working
     on, gray = beyond it) — and the word rides the label so two different
     TP colors read as states, not a rendering bug (Noah, 2026-08-29:
     "interesting enough the tp colors are different"). */
  const paneLevels: PremiumLevel[] = undocked.map(l => ({
    price: l.premium,
    label: `${l.label} $${l.premium.toFixed(2)}${
      l.status === 'HIT' ? ' · hit' : l.status === 'IN PROGRESS' ? ' · in progress' : ''
    }`,
    color: LEVEL_INK[l.status],
    style: l.status === 'REF' ? 'dotted' : 'dashed',
  }));

  return (
    <Panel flush className="w-full flex-1 min-h-0" bodyClassName="flex flex-col flex-1 min-h-0">
      {/* The tape region — edge to edge inside the card, chrome floating
          over it. rounded-t so the canvas honors the panel's corners. */}
      <div ref={tapeRef} className="relative flex-1 min-h-[420px] rounded-t-lg overflow-hidden">
        <ContractPremiumPane
          ticker={setup.ticker}
          strike={setup.strike}
          right={setup.right}
          tYears={Math.max(setup.sessionsLeft, 0.5) / 252}
          iv={setup.greeks.iv / 100}
          timeframe={timeframe}
          revision={revision}
          levels={paneLevels}
          projections={projections}
          topMargin={topMargin}
        />

        {/* The chrome, ONE flow block so the whisper row always sits under
            the strip no matter where it wraps. Transparent — each control
            carries its own pill (the Weigher/Terrain chrome law: a dark band
            over a dark tape is a solid box). Capsule speaks the contract;
            the mark is the live monitored mid with the campaign's change
            against the reference. pr-14/pr-16 keep the right edge — and the
            fullscreen door — off the price axis. */}
        <div ref={chromeRef} className="absolute top-0 inset-x-0 z-20">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 pl-2 pr-14 py-1 select-none">
            <span className="inline-flex items-center h-7 px-3 rounded-full bg-white/[0.06] font-mono text-[11px] font-bold text-textPrimary shrink-0">
              {setup.contract} · {setup.expiry}
            </span>
            <SpotPrice value={setup.mid} />
            <span className={`font-mono text-[11px] font-semibold tnum ${up ? 'text-bull' : 'text-bear'}`}>
              {up ? '▲' : '▼'} ${changeAbs.toFixed(2)} ({up ? '+' : '−'}
              {Math.abs(track.sessionChangePct).toFixed(1)}%)
            </span>
            <span className="inline-flex items-center gap-0.5">
              {TIMEFRAMES.map(t => (
                <Chip key={t.value} active={timeframe === t.value} onClick={() => setTimeframe(t.value)} title={t.label}>
                  {t.label}
                </Chip>
              ))}
            </span>
            <span className="ml-auto flex items-center gap-2">
              {actions}
              {onToggleFullscreen && (
                <button
                  onClick={onToggleFullscreen}
                  title={fullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'}
                  className="p-1 rounded text-textMuted hover:text-textPrimary hover:bg-white/[0.05] transition-colors"
                >
                  {fullscreen ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
                </button>
              )}
            </span>
          </div>

          {/* The context whispers — campaign clock left, off-scale rules right */}
          <div className="pl-3 pr-16 flex items-baseline justify-between gap-3 pointer-events-none">
            <span className="font-mono text-[10px] text-textMuted">
              over {barsToSpan(track.pastMinutes)} · reference ${track.ref.toFixed(2)} ·{' '}
              {retired ? 'setup retired' : `${barsToSpan(track.forwardMinutes)} left`}
            </span>
            {docked.length > 0 && (
              <span className="font-mono text-[10px] text-textMuted tnum text-right">
                Off scale ↑ {docked.map(l => `${l.label} $${l.premium.toFixed(2)}`).join(' · ')}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* The level table — premium AND the underlying price that pays it */}
      <div className="border-t border-borderSubtle px-4 pt-2 pb-1">
        <table className="w-full">
          <thead>
            <tr>
              <th className="text-left font-mono text-[9px] uppercase tracking-wider text-textMuted font-medium pb-1">Level</th>
              <th className="text-right font-mono text-[9px] uppercase tracking-wider text-textMuted font-medium pb-1">Premium</th>
              <th className="text-right font-mono text-[9px] uppercase tracking-wider text-textMuted font-medium pb-1">From reference</th>
              <th className="text-right font-mono text-[9px] uppercase tracking-wider text-textMuted font-medium pb-1">{setup.ticker} needs</th>
            </tr>
          </thead>
          <tbody>
            {track.levels.map(l => (
              <tr key={l.key}>
                <td className="font-mono text-[11px] py-0.5" style={{ color: LEVEL_INK[l.status] }}>
                  {l.label}
                  {l.docked ? ' · off scale' : ''}
                  {l.key === 'stop' ? (
                    <span className="ml-2 text-[9px] text-textMuted">{setup.invalidationReason}</span>
                  ) : (
                    l.status !== 'REF' && (
                      <span className="ml-2 text-[9px] text-textMuted lowercase">{l.status.toLowerCase()}</span>
                    )
                  )}
                </td>
                <td className="font-mono text-[11px] tnum text-textPrimary text-right py-0.5">${l.premium.toFixed(2)}</td>
                <td
                  className={`font-mono text-[11px] tnum text-right py-0.5 ${
                    l.status === 'REF' ? 'text-textMuted' : l.fromRefPct >= 0 ? 'text-bull' : 'text-bear'
                  }`}
                >
                  {l.status === 'REF' ? '—' : `${l.fromRefPct >= 0 ? '+' : ''}${Math.round(l.fromRefPct)}%`}
                </td>
                <td className="font-mono text-[11px] tnum text-textPrimary text-right py-0.5">
                  {l.spotNeeded != null ? l.spotNeeded.toFixed(2) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="font-mono text-[10px] text-textMuted px-4 pb-3 pt-1">
        Modeled from {setup.ticker} 1-minute bars with the same pricing model that quoted this contract. Not a
        traded tape.
      </p>
    </Panel>
  );
};

export default ContractTrack;
