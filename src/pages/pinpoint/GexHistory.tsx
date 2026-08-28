import { useMemo, useState } from 'react';
import { useMarketData } from '../../context/MarketDataContext';
import {
  levelMigration,
  migrationWords,
  sessionSpans,
  snapshotAt,
  strikeTimeHeat,
} from '../../data/timeMachine';
import GexMatrix from '../../components/gex/GexMatrix';
import { CALL_WALL, FLIP, KING, PUT_WALL, SPOT } from '../../components/gex/palette';
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

  TWO INK CORRECTIONS from the first cut, both of the same species. The
  migration table drew the call wall RED and the put wall GREEN — exactly
  inverted against CALL_WALL/PUT_WALL in palette.ts, which every zone rail
  and badge on the desk has followed since 2026-08-18; the king now wears
  its magenta too. And HIST_02's heat was a hand-rolled red/green wash where
  net GEX heat on this desk has exactly one rendering: heatCellStyle. Level
  inks come from palette.ts, heat comes from heatmap.ts — nothing on this
  page invents either any more.
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


  /* HIST_02 as the house matrix: time buckets for expiries, the fold doing
     the row triage the hand-sorted top-12 used to fake. warnFirstColumn off
     — the first bucket is a moment, not a 0DTE emphasis. */
  const heatData = useMemo(() => {
    if (heat.rows.length === 0) return null;
    return {
      expiries: heat.columns.map(hhmm),
      strikes: heat.rows.map(r => r.strike),
      cells: heat.rows.map(r => r.cells.map(c => ({ value: c.netGex }))),
      maxAbs: heat.maxAbs,
      spotRowIndex: -1,
      callWallIndex: -1,
      putWallIndex: -1,
    };
  }, [heat]);

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
                    <td className="px-2 py-0.5 font-mono text-[10px] tnum" style={{ color: CALL_WALL }}>
                      {p.callWall?.toFixed(2) ?? '—'}
                    </td>
                    <td className="px-2 py-0.5 font-mono text-[10px] tnum" style={{ color: PUT_WALL }}>
                      {p.putWall?.toFixed(2) ?? '—'}
                    </td>
                    <td className="px-2 py-0.5 font-mono text-[10px] tnum" style={{ color: FLIP }}>
                      {p.flip?.toFixed(2) ?? '—'}
                    </td>
                    <td className="px-2 py-0.5 font-mono text-[10px] tnum" style={{ color: KING }}>{p.king?.toFixed(2) ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* HIST_02 */}
      <Panel title="Strike × Time Heatmap" subtitle="HIST_02 — exposure building and decaying through the day" className="w-full">
        {heatData === null ? (
          <span className="font-mono text-[10px] text-textMuted">No snapshots recorded for this session.</span>
        ) : (
          <div className="max-h-[560px] flex min-h-0">
            <GexMatrix data={heatData} spot={0} warnFirstColumn={false} />
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
