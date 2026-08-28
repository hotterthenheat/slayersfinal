import { useMemo, useState } from 'react';
import { useMarketData } from '../../context/MarketDataContext';
import {
  levelMigration,
  migrationWords,
  sessionSpans,
  snapshotAt,
  strikeTimeHeat,
} from '../../data/timeMachine';
import { fmtUsd } from '../../data/gex';
import { LONG_GAMMA, SHORT_GAMMA, FLIP, SPOT } from '../../components/gex/palette';
import Panel from '../../components/ui/Panel';
import ProvenanceChip from '../../components/ui/ProvenanceChip';
import Term from '../../components/ui/Term';
import Simulator from '../../core/simulator';

/*
==================================================
  SLAYER TERMINAL - THE TIME MACHINE — P-20
  (pages/pinpoint/GexHistory.tsx)
==================================================

  This page carried three "module scheduled" placeholders since launch.
  Everything they needed was already in the buffer. They are built.

  ONE SESSION PICKER DRIVES ALL THREE, because they are three views of the
  same day and letting each carry its own would be three ways to be looking
  at different afternoons. Sessions with no snapshots are still listed and
  still selectable — and say they are empty, which is more useful than
  hiding them and leaving a reader wondering where Tuesday went.

  NOTHING IS INTERPOLATED anywhere on this page. The scrubber lands on
  snapshots that were actually recorded, the heat cells are real readings
  rather than averages, and a session with no data draws no line.
*/

const hhmm = (t: number) => {
  const d = new Date(t * 1000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const dayLabel = (t: number) => new Date(t * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

const GexHistory = () => {
  const { marketData } = useMarketData();
  const ticker = marketData?.ticker;

  const { snaps, bars } = useMemo(
    () => ({
      snaps: ticker ? (Simulator.getGexHistory(ticker) ?? []) : [],
      bars: ticker ? (Simulator.getCandles(ticker) ?? []) : [],
    }),
    [ticker]
  );

  const spans = useMemo(() => sessionSpans(bars, snaps), [bars, snaps]);
  const [pick, setPick] = useState<number | null>(null);
  const span = spans.length > 0 ? (spans.find(s => s.index === pick) ?? spans[spans.length - 1]) : undefined;

  const migration = useMemo(() => levelMigration(snaps, bars, span), [snaps, bars, span]);
  const heat = useMemo(() => strikeTimeHeat(snaps, span, 10), [snaps, span]);

  const [scrub, setScrub] = useState<number | null>(null);
  const scrubTime = scrub ?? (migration.length > 0 ? migration[migration.length - 1].time : null);
  const scrubbed = scrubTime !== null ? snapshotAt(migration.length > 0 ? snaps.filter(s => span && s.time >= span.from && s.time <= span.to) : [], scrubTime) : null;

  if (spans.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 font-mono text-[11px] uppercase tracking-widest text-textMuted">
        No sessions in the buffer yet…
      </div>
    );
  }

  const ink = (v: number) => {
    if (heat.maxAbs === 0 || v === 0) return 'transparent';
    const a = Math.min(0.85, 0.08 + (Math.abs(v) / heat.maxAbs) * 0.77);
    const rgb = v > 0 ? SHORT_GAMMA : LONG_GAMMA;
    return `${rgb}${Math.round(a * 255).toString(16).padStart(2, '0')}`;
  };

  const heatRows = [...heat.rows]
    .sort((a, b) => Math.max(...b.cells.map(c => Math.abs(c.netGex))) - Math.max(...a.cells.map(c => Math.abs(c.netGex))))
    .slice(0, 12)
    .sort((a, b) => b.strike - a.strike);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="font-mono text-[10px] uppercase tracking-widest text-textMuted">
          <Term k="Time machine">Session</Term>
        </span>
        <select
          aria-label="Session"
          value={span?.index ?? ''}
          onChange={e => {
            setPick(Number(e.target.value));
            setScrub(null);
          }}
          className="bg-panel border border-borderSubtle rounded px-2 py-1 font-mono text-[10px] text-textPrimary"
        >
          {spans.map(s => (
            <option key={s.index} value={s.index}>
              {dayLabel(s.from)} — {s.snapshots} snapshot{s.snapshots === 1 ? '' : 's'}
            </option>
          ))}
        </select>
        <ProvenanceChip sources={['chain', 'exposure']} />
      </div>

      {/* HIST_01 */}
      <Panel title="Level Migration Timeline" subtitle="HIST_01 — walls, flip and king through the session" className="w-full">
        <p className="font-mono text-[11px] leading-relaxed text-textPrimary mb-2">{migrationWords(migration)}</p>
        {migration.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {['Time', 'Call wall', 'Put wall', 'Flip', 'King'].map(h => (
                    <th key={h} className="px-2 py-0.5 text-left font-mono text-[9px] uppercase tracking-wider text-textMuted">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {migration.slice(-12).map(p => (
                  <tr key={p.time}>
                    <td className="px-2 py-0.5 font-mono text-[10px] tnum text-textMuted">{hhmm(p.time)}</td>
                    <td className="px-2 py-0.5 font-mono text-[10px] tnum" style={{ color: SHORT_GAMMA }}>
                      {p.callWall?.toFixed(2) ?? '—'}
                    </td>
                    <td className="px-2 py-0.5 font-mono text-[10px] tnum" style={{ color: LONG_GAMMA }}>
                      {p.putWall?.toFixed(2) ?? '—'}
                    </td>
                    <td className="px-2 py-0.5 font-mono text-[10px] tnum" style={{ color: FLIP }}>
                      {p.flip?.toFixed(2) ?? '—'}
                    </td>
                    <td className="px-2 py-0.5 font-mono text-[10px] tnum text-textPrimary">{p.king?.toFixed(2) ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* HIST_02 */}
      <Panel title="Strike × Time Heatmap" subtitle="HIST_02 — exposure building and decaying through the day" className="w-full">
        {heat.rows.length === 0 ? (
          <span className="font-mono text-[10px] text-textMuted">No snapshots recorded for this session.</span>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="px-1.5 py-0.5 text-left font-mono text-[9px] uppercase tracking-wider text-textMuted">
                    Strike
                  </th>
                  {heat.columns.map(c => (
                    <th key={c} className="px-1.5 py-0.5 text-right font-mono text-[9px] tnum text-textMuted">
                      {hhmm(c)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {heatRows.map(r => (
                  <tr key={r.strike}>
                    <td className="px-1.5 py-0.5 font-mono text-[10px] tnum text-textPrimary">{r.strike}</td>
                    {r.cells.map(c => (
                      <td
                        key={c.time}
                        style={{ background: ink(c.netGex) }}
                        title={`${r.strike} · ${hhmm(c.time)} · ${fmtUsd(c.netGex)}`}
                        className="px-1.5 py-0.5 text-right font-mono text-[9px] tnum text-textSecondary"
                      >
                        {c.netGex === 0 ? '·' : fmtUsd(c.netGex)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* HIST_03 */}
      <Panel title="Session Snapshots + Replay" subtitle="HIST_03 — scrub the session, land on real readings" className="w-full">
        {migration.length === 0 ? (
          <span className="font-mono text-[10px] text-textMuted">No snapshots to scrub for this session.</span>
        ) : (
          <div className="flex flex-col gap-2">
            <input
              type="range"
              aria-label="Scrub the session"
              min={migration[0].time}
              max={migration[migration.length - 1].time}
              step={1}
              value={scrubTime ?? migration[0].time}
              onChange={e => setScrub(Number(e.target.value))}
              className="w-full accent-white"
            />
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="font-mono text-[11px] font-bold tnum" style={{ color: SPOT }}>
                {scrubbed ? hhmm(scrubbed.time) : '—'}
              </span>
              <span className="font-mono text-[10px] text-textMuted">
                {scrubbed ? `${scrubbed.levels.length} strikes recorded at this moment` : 'no reading'}
              </span>
            </div>
            <p className="font-mono text-[9px] leading-relaxed text-textMuted">
              The scrubber lands on snapshots that were actually recorded — never between two. A time machine that
              interpolates the past is a worse tool than one that admits its gaps.
            </p>
          </div>
        )}
      </Panel>
    </div>
  );
};

export default GexHistory;
