/*
==================================================
  SLAYER TERMINAL - CONTRACT TRACK (ContractTrack.tsx)
  The monitor's chart: where this contract's premium has
  been (repriced on real bars), what standing still costs
  (theta forward, spot held), what it's worth parked at
  the stop, and every level twice — in premium AND as the
  underlying price that pays it. Math in trackModel.ts;
  this file only draws.

  RECHARTS, not hand-rolled SVG (Noah, 2026-08-08: "there
  should be tools for this and the fonts are so large" —
  a scaled viewBox turned 11px labels into 20px+; the
  house rule since the Earnings arc is reputable-library
  graphs for statistical charts). Fonts here are real
  pixels. Animations off: the series re-pins every tick.
==================================================
*/

import { useMemo } from 'react';
import {
  Area,
  ComposedChart,
  Line,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import Panel from '../ui/Panel';
import type { Setup } from '../../types/compass';
import Feed from '../../core/feed';
import { buildSetupTrack, barsToSpan, barsToOffset, type TrackLevel } from './trackModel';
import { BULL, PUT_WALL } from '../gex/palette';
import { FONT_FAMILY } from '../ui/typeface';

const BEAR = PUT_WALL; // #FF3B30 — the bear token, named by direction here
const MUTED_INK = '#7d7d7d'; // matches textMuted (the lifted AA value)
const WARN_INK = '#FF9500';
const REF_INK = '#ededed';
const MONO = FONT_FAMILY;

const LEVEL_INK: Record<TrackLevel['status'], string> = {
  HIT: BULL,
  'IN PROGRESS': '#D2FF00',
  PENDING: MUTED_INK,
  STOP: WARN_INK,
  REF: REF_INK,
};

interface TrackRow {
  bar: number;
  past?: number;
  forward?: number;
  stop?: number;
}

/* Multi-series tooltip rule (the drilldown crash lesson): pick entries with
   find(), treat every field as optional, never index payload[0]. */
const TrackTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { dataKey?: string | number; value?: number }[];
  label?: number | string;
}) => {
  if (!active || !payload || payload.length === 0) return null;
  const past = payload.find(p => p.dataKey === 'past')?.value;
  const forward = payload.find(p => p.dataKey === 'forward')?.value;
  const stop = payload.find(p => p.dataKey === 'stop')?.value;
  const bar = Number(label ?? 0);
  return (
    <div className="border border-borderSubtle bg-panel rounded-md px-2.5 py-1.5 font-mono text-[10px] shadow-lg">
      <div className="text-textMuted">{barsToOffset(bar)}</div>
      {past != null && <div className="text-textPrimary tnum">${past.toFixed(2)}</div>}
      {past == null && forward != null && (
        <div className="text-textSecondary tnum">${forward.toFixed(2)} held flat</div>
      )}
      {past == null && stop != null && <div className="text-warn tnum">${stop.toFixed(2)} at the stop</div>}
    </div>
  );
};

interface ContractTrackProps {
  setup: Setup;
  /** Tick pulse — recomputes the series so the NOW pin follows the live mid. */
  revision: number;
  /** Campaign retired (floor broken): the past stays, the future doesn't —
      no theta-forward, no stop curve, no "time left" for a dead thesis. */
  retired?: boolean;
  /** Extra header controls — the campaign page mounts its Stock/Premium
      chart toggle here so the way back rides on this panel too. */
  actions?: React.ReactNode;
}

const ContractTrack = ({ setup, revision, retired = false, actions }: ContractTrackProps) => {
  const track = useMemo(() => {
    void revision;
    const bars = Feed.getCandles(setup.ticker) ?? [];
    return buildSetupTrack(setup, bars);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setup.id, setup.mid, revision]);

  // One row per bar so the three series share an axis; the seam row at bar 0
  // carries both past and forward, which is what joins the lines.
  const data = useMemo<TrackRow[]>(() => {
    const rows = new Map<number, TrackRow>();
    for (const p of track.past) rows.set(p.bar, { bar: p.bar, past: p.premium });
    for (const p of track.forward) {
      const r = rows.get(p.bar) ?? { bar: p.bar };
      r.forward = p.premium;
      rows.set(p.bar, r);
    }
    if (track.stopCurve) {
      for (const p of track.stopCurve) {
        const r = rows.get(p.bar) ?? { bar: p.bar };
        r.stop = p.premium;
        rows.set(p.bar, r);
      }
    }
    return [...rows.values()].sort((a, b) => a.bar - b.bar);
  }, [track]);

  const up = track.sessionChangePct >= 0;
  const lineInk = up ? BULL : BEAR;
  const undocked = track.levels.filter(l => !l.docked);
  const docked = track.levels.filter(l => l.docked);
  const changeAbs = Math.abs((setup.mid * track.sessionChangePct) / 100);

  return (
    <Panel
      title={`${setup.contract} · ${setup.expiry}`}
      className="w-full flex-1 min-h-0"
      bodyClassName="flex flex-col flex-1 min-h-0"
      actions={
        <span className="flex items-center gap-3">
          {actions}
          <span className="font-mono text-[9px] uppercase tracking-widest text-textMuted">Modeled</span>
        </span>
      }
    >
      <div className="flex flex-col gap-3 flex-1 min-h-0">
        {/* Header numbers */}
        <div className="flex items-baseline gap-3 flex-wrap">
          <span className="font-mono text-xl font-bold tnum text-textPrimary">${setup.mid.toFixed(2)}</span>
          <span className={`font-mono text-[12px] font-semibold tnum ${up ? 'text-bull' : 'text-bear'}`}>
            {up ? '+' : '−'}${changeAbs.toFixed(2)} ({up ? '+' : '−'}
            {Math.abs(track.sessionChangePct).toFixed(1)}%)
          </span>
          <span className="font-mono text-[10px] text-textMuted">
            over {barsToSpan(track.pastMinutes)} · reference ${track.ref.toFixed(2)} ·{' '}
            {retired ? 'campaign retired' : `${barsToSpan(track.forwardMinutes)} left`}
          </span>
          {docked.length > 0 && (
            <span className="ml-auto font-mono text-[10px] text-textMuted tnum">
              Off scale ↑ {docked.map(l => `${l.label} $${l.premium.toFixed(2)}`).join(' · ')}
            </span>
          )}
        </div>

        {/* The chart — real pixels, real library. flex-1 with a floor: on the
            campaign page the panel stretches to the card's row height and the
            CHART absorbs the slack (Noah, 2026-08-17: "make sure it fills its
            container... no huge empty spaces"); standalone it bottoms at 260. */}
        <div className="flex-1 min-h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 6, right: 118, bottom: 2, left: 8 }}>
            <XAxis
              dataKey="bar"
              type="number"
              domain={[track.xMin, track.xMax]}
              ticks={[track.xMin, 0, track.xMax]}
              tickFormatter={v => (v === 0 ? 'NOW' : v < 0 ? `${barsToSpan(v)} ago` : `${barsToSpan(v)} left`)}
              stroke="#1c1c1c"
              tick={{ fill: MUTED_INK, fontSize: 10, fontFamily: MONO }}
              tickLine={false}
            />
            <YAxis domain={[0, track.yMax]} hide />
            <Tooltip content={<TrackTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.2)' }} />

            {undocked.map(l => (
              <ReferenceLine
                key={l.key}
                y={l.premium}
                stroke={LEVEL_INK[l.status]}
                strokeOpacity={l.status === 'PENDING' ? 0.35 : 0.55}
                strokeDasharray={l.status === 'REF' ? '2 4' : '6 5'}
                label={{
                  value: `${l.label} $${l.premium.toFixed(2)}`,
                  position: 'right',
                  fill: LEVEL_INK[l.status],
                  fontSize: 11,
                  fontFamily: MONO,
                }}
              />
            ))}
            <ReferenceLine x={0} stroke="rgba(255,255,255,0.18)" />

            <Area
              dataKey="past"
              type="monotone"
              stroke={lineInk}
              strokeWidth={1.6}
              fill={lineInk}
              fillOpacity={0.07}
              dot={false}
              isAnimationActive={false}
              connectNulls={false}
            />
            {!retired && (
              <Line
                dataKey="forward"
                type="monotone"
                stroke={MUTED_INK}
                strokeWidth={1.2}
                strokeDasharray="2 4"
                dot={false}
                isAnimationActive={false}
                connectNulls={false}
              />
            )}
            {!retired && track.stopCurve && (
              <Line
                dataKey="stop"
                type="monotone"
                stroke={WARN_INK}
                strokeOpacity={0.55}
                strokeWidth={1.2}
                strokeDasharray="2 4"
                dot={false}
                isAnimationActive={false}
                connectNulls={false}
              />
            )}
            <ReferenceDot x={0} y={track.ref} r={3} fill={lineInk} stroke="none" />
          </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* The level table — premium AND the underlying price that pays it */}
        <div className="border-t border-borderSubtle pt-2">
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
                    {l.key === 'stop' && (
                      <span className="ml-2 text-[9px] text-textMuted">{setup.invalidationReason}</span>
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

        <p className="font-mono text-[10px] text-textMuted">
          Modeled from {setup.ticker} 1-minute bars with the same pricing model that quoted this contract. Not a
          traded tape.
        </p>
      </div>
    </Panel>
  );
};

export default ContractTrack;
