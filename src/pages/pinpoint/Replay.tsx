import { useEffect, useMemo, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import Simulator from '../../core/simulator';
import { pickFlip, pickWalls } from '../../core/walls';
import { levelMigration, migrationWords, sessionSpans, strikeTimeHeat } from '../../data/timeMachine';
import { fmtUsd } from '../../data/gex';
import DataState from '../../components/ui/DataState';
import { CONTROL, CONTROL_OFF, CONTROL_OUTLINE, DeskLoading, Figure, Group, Legend, Read, Segmented, Select, Stat, TYPE, Tag, Toolbar, Workspace } from '../../components/pinpoint/Desk';
import HeatField, { type HeatColumn, type HeatRow } from '../../components/pinpoint/HeatField';
import Series from '../../components/pinpoint/Series';
import { useScanSnapshot } from '../../components/pinpoint/useScanSnapshot';
import { CALL_WALL, FLIP, INK, PUT_WALL, SELECT, SPOT, WARN, fmtStrike, signInk } from '../../components/pinpoint/ink';
import { heatInk } from '../../components/gex/heatmap';

/*
  REPLAY — a past session, scrubbed. The field is net dealer gamma at every
  strike in each slice of the day, real readings never averages; the ringed
  column is where the scrubber stands, and the book beside it is re-picked
  from the levels recorded at that moment. Nothing is interpolated or
  backfilled.
*/

const SPEEDS = [
  { value: '1', label: '1×' },
  { value: '4', label: '4×' },
  { value: '12', label: '12×' },
] as const;

const hhmm = (t: number) => {
  const d = new Date(t * 1000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const dayLabel = (t: number) => new Date(t * 1000).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const NO_BACKFILL = 'Every cell and every level on this desk is a reading recorded at that moment. Nothing is interpolated or backfilled; a session the buffer did not capture is listed as a gap.';

const Replay = () => {
  const { snapshot } = useScanSnapshot();
  const ticker = snapshot?.ticker;
  const { snaps, bars } = useMemo(() => ({ snaps: ticker ? (Simulator.getGexHistory(ticker) ?? []) : [], bars: ticker ? (Simulator.getCandles(ticker) ?? []) : [] }), [ticker]);
  const spans = useMemo(() => sessionSpans(bars, snaps), [bars, snaps]);
  const [pick, setPick] = useState<number | null>(null);
  const span = spans.length > 0 ? (spans.find(s => s.index === pick) ?? spans[spans.length - 1]) : undefined;
  const inSpan = useMemo(() => (span ? snaps.filter(s => s.time >= span.from && s.time <= span.to) : []), [snaps, span]);
  const migration = useMemo(() => levelMigration(snaps, bars, span), [snaps, bars, span]);
  const heat = useMemo(() => strikeTimeHeat(snaps, span, 12), [snaps, span]);
  const [scrub, setScrub] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<'1' | '4' | '12'>('4');
  const [cell, setCell] = useState<{ strike: string; time: string; value: number | null } | null>(null);

  /* The scrubber is an INDEX into the recorded readings. */
  const idx = inSpan.length === 0 ? -1 : Math.min(inSpan.length - 1, scrub ?? inSpan.length - 1);
  const at = idx >= 0 ? inSpan[idx] : null;
  useEffect(() => {
    if (!playing || inSpan.length < 2) return;
    const id = window.setInterval(() => {
      setScrub(s => {
        const cur = s ?? inSpan.length - 1;
        const next = cur + 1;
        if (next >= inSpan.length) {
          setPlaying(false);
          return inSpan.length - 1;
        }
        return next;
      });
    }, 1000 / Number(speed));
    return () => window.clearInterval(id);
  }, [playing, speed, inSpan.length]);
  useEffect(() => {
    setScrub(null);
    setPlaying(false);
  }, [span?.index, ticker]);

  const book = useMemo(() => {
    if (!at) return null;
    const rows = at.levels.map(l => ({ strike: l.strike, netGex: l.value }));
    const spotAt = migration.length ? migration.reduce((best, p) => (Math.abs(p.time - at.time) < Math.abs(best.time - at.time) ? p : best), migration[0]).spot : (snapshot?.spot ?? 0);
    const w = pickWalls(rows, spotAt, n => n.netGex);
    let supreme: number | null = null;
    let max = 0;
    for (const r of rows)
      if (Math.abs(r.netGex) > max) {
        max = Math.abs(r.netGex);
        supreme = r.strike;
      }
    return { spot: spotAt, callWall: w.callWall ?? null, putWall: w.putWall ?? null, flip: pickFlip(rows, spotAt, n => n.netGex), supreme, net: rows.reduce((a, r) => a + r.netGex, 0), strikes: rows.length };
  }, [at, migration, snapshot?.spot]);

  if (!snapshot) {
    return (
      <DeskLoading>
        <DataState kind="loading" title="Opening the buffer" body="The first tick has not arrived yet." />
      </DeskLoading>
    );
  }
  if (spans.length === 0) {
    return (
      <Workspace
        toolbar={
          <Toolbar data-replay-controls>
            <Tag title={NO_BACKFILL}>point-in-time · no backfill</Tag>
          </Toolbar>
        }
        picture={<DataState kind="empty" title="No sessions in the buffer yet" body="Replay needs at least one session of recorded snapshots. They accumulate as the desk runs." pad="lg" />}
        inspector={
          <Group title="Buffer">
            <Stat label="Sessions" value="0" />
            <Stat label="Readings" value={String(snaps.length)} />
          </Group>
        }
      />
    );
  }

  const gap = span !== undefined && span.snapshots === 0;
  const scrubCol = at ? heat.columns.reduce((best, c) => (Math.abs(c - at.time) < Math.abs(best - at.time) ? c : best), heat.columns[0] ?? 0) : null;
  const columns: HeatColumn[] = heat.columns.map(c => ({ key: String(c), label: hhmm(c) }));
  const rows: HeatRow[] = heat.rows.map(r => ({
    key: String(r.strike),
    label: fmtStrike(r.strike),
    ink: book && r.strike === book.callWall ? CALL_WALL : book && r.strike === book.putWall ? PUT_WALL : undefined,
    cells: r.cells.map(c => c.netGex),
  }));
  /* TWENTY-TWO SESSIONS IS A LIST, NOT A SET OF CHOICES. As a segmented
     control it wrapped to three rows and took more of the desk than the
     scrubber it feeds; a native select is the grammar for this. The gap
     sessions stay in it, labelled, because a Tuesday the buffer missed is
     a fact about the buffer. */
  const SESSION_OPTIONS = spans.map(s => ({
    value: String(s.index),
    label: `${dayLabel(s.from)}${s.snapshots === 0 ? ' · gap' : ` · ${s.snapshots}`}`,
  }));
  const firstFlip = migration.find(p => p.flip !== null)?.flip ?? null;
  const lastFlip = [...migration].reverse().find(p => p.flip !== null)?.flip ?? null;
  const walked = migration.filter(p => p.callWall !== null && p.putWall !== null && p.flip !== null);

  return (
    <Workspace
      toolbar={
        <Toolbar data-replay-controls>
          <span className={`${TYPE.label} text-textMuted`}>Session</span>
          <Select ariaLabel="Sessions in the buffer" options={SESSION_OPTIONS} value={String(span?.index ?? '')} onChange={v => setPick(Number(v))} />
          {gap && <Tag ink={WARN}>not captured</Tag>}
          <Tag title={NO_BACKFILL}>point-in-time · no backfill</Tag>
        </Toolbar>
      }
      picture={
        gap ? (
          <DataState kind="unavailable" title="This session was not captured" body={`${span ? dayLabel(span.from) : 'The session'} has bars but no snapshots in the buffer — the desk was not recording. It is listed so the gap is visible rather than a missing Tuesday.`} pad="lg" />
        ) : heat.rows.length === 0 ? (
          <DataState kind="empty" title="No readings in this session" pad="lg" />
        ) : (
          <>
            <HeatField
              columns={columns}
              rows={rows}
              scale={{ kind: 'diverging', maxAbs: heat.maxAbs }}
              hotColumn={scrubCol === null ? null : String(scrubCol)}
              fmt={fmtUsd}
              onHover={c => setCell(c ? { strike: c.row.label, time: c.column.label, value: c.value } : null)}
              ariaLabel={`Net dealer gamma at ${heat.rows.length} strikes across ${heat.columns.length} slices of ${span ? dayLabel(span.from) : 'the session'}. The scrubber is on ${at ? hhmm(at.time) : 'no reading'}.`}
            />
            <Legend className="pt-1" items={[{ ink: heatInk.pos, label: 'amplifies' }, { ink: heatInk.neg, label: 'absorbs' }, { ink: SELECT, label: 'the scrubbed slice' }, { ink: CALL_WALL, label: 'call wall then' }, { ink: PUT_WALL, label: 'put wall then' }]} />
          </>
        )
      }
      drawer={
        inSpan.length > 0 ? (
          <div className="flex items-center gap-3 flex-wrap" data-replay-scrubber>
            <button onClick={() => setPlaying(p => !p)} className={`${CONTROL} ${CONTROL_OFF} ${CONTROL_OUTLINE} px-1`} aria-label={playing ? 'Pause' : 'Play'} aria-pressed={playing} data-replay-play>
              {playing ? <Pause className="w-3 h-3" aria-hidden /> : <Play className="w-3 h-3" aria-hidden />}
            </button>
            <input
              type="range"
              min={0}
              max={inSpan.length - 1}
              step={1}
              value={idx}
              onChange={e => {
                setPlaying(false);
                setScrub(Number(e.target.value));
              }}
              aria-label="Session scrubber"
              className="flex-1 min-w-[160px] accent-white"
              data-replay-scrub
            />
            <Segmented ariaLabel="Playback speed" options={SPEEDS} value={speed} onChange={setSpeed} />
            <span className={`${TYPE.num} text-textPrimary`}>{at ? hhmm(at.time) : '—'}</span>
            <span className={`${TYPE.label} tracking-normal normal-case text-textMuted tnum`}>
              reading {idx + 1} of {inSpan.length}
            </span>
          </div>
        ) : undefined
      }
      inspector={
        <>
          <Group title={at ? `Book at ${hhmm(at.time)}` : 'Book'} data-replay-book>
            {book ? (
              <>
                <Stat label="Spot then" value={fmtStrike(book.spot)} ink={SPOT} />
                <Stat label="Net gamma" value={fmtUsd(book.net)} ink={signInk(book.net)} sub={book.net > 0 ? 'absorbing' : 'amplifying'} />
                <Stat label="Call wall" value={book.callWall === null ? '—' : fmtStrike(book.callWall)} ink={CALL_WALL} />
                <Stat label="Put wall" value={book.putWall === null ? '—' : fmtStrike(book.putWall)} ink={PUT_WALL} />
                <Stat label="Flip" value={book.flip === null ? 'none' : fmtStrike(book.flip)} ink={FLIP} />
                <Stat label="Supreme" value={book.supreme === null ? '—' : fmtStrike(book.supreme)} />
                <Stat label="Strikes recorded" value={String(book.strikes)} />
              </>
            ) : (
              <Stat label="—" value="no reading here" />
            )}
          </Group>
          <Group title="Cell" data-group="cell">
            {cell ? <Stat label={`${cell.strike} at ${cell.time}`} value={cell.value === null ? '—' : fmtUsd(cell.value)} ink={cell.value === null ? undefined : signInk(cell.value)} data-cell /> : <Stat label="—" value="point at a cell" />}
          </Group>
          <Group title="Levels walked" data-group="walked">
            {walked.length > 1 ? (
              <div className="pt-2">
                <Series
                  lines={[
                    { key: 'spot', points: walked.map(p => ({ x: p.time, y: p.spot })), ink: SPOT, width: 1 },
                    { key: 'callWall', points: walked.map(p => ({ x: p.time, y: p.callWall as number })), ink: CALL_WALL, width: 1 },
                    { key: 'putWall', points: walked.map(p => ({ x: p.time, y: p.putWall as number })), ink: PUT_WALL, width: 1 },
                    { key: 'flip', points: walked.map(p => ({ x: p.time, y: p.flip as number })), ink: FLIP, dashed: true, width: 1 },
                  ]}
                  marks={at ? [{ x: at.time, ink: SELECT }] : []}
                  fmtX={hhmm}
                  fmtY={fmtStrike}
                  height={120}
                  ariaLabel="Spot, the walls and the flip through the session"
                />
              </div>
            ) : (
              <Stat label="—" value="no migration to draw" sub="needs readings where both walls and the flip existed" />
            )}
          </Group>
          <Group title="Session" data-group="session">
            <Stat label="Day" value={span ? dayLabel(span.from) : '—'} sub={span ? `${hhmm(span.from)} to ${hhmm(span.to)}` : undefined} />
            <Stat label="Readings" value={String(inSpan.length)} sub={`${snaps.length} in the buffer across ${spans.length} session${spans.length === 1 ? '' : 's'}`} />
            <Stat label="Slices" value={String(heat.columns.length)} sub="the last reading in each, never an average" />
          </Group>
        </>
      }
      strip={
        <>
          <Figure label="Flip, open → close" value={firstFlip === null || lastFlip === null ? '—' : `${fmtStrike(firstFlip)} → ${fmtStrike(lastFlip)}`} ink={FLIP} size="lead" />
          <Figure label="It moved" value={firstFlip === null || lastFlip === null ? '—' : `${lastFlip - firstFlip >= 0 ? '+' : '−'}${Math.abs(lastFlip - firstFlip).toFixed(2)}`} />
          <Figure label="Readings" value={String(inSpan.length)} sub={span ? dayLabel(span.from) : undefined} />
          <Read>{migrationWords(migration)}</Read>
        </>
      }
    />
  );
};

export default Replay;
