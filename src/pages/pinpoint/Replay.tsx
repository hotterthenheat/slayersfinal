import { useEffect, useMemo, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import Simulator from '../../core/simulator';
import { pickFlip, pickWalls } from '../../core/walls';
import { levelMigration, migrationWords, sessionSpans, strikeTimeHeat } from '../../data/timeMachine';
import { fmtUsd } from '../../data/gex';
import DataState from '../../components/ui/DataState';
import ProvenanceChip from '../../components/ui/ProvenanceChip';
import WallDrift from '../../components/gex/vannacharm/WallDrift';
import { CONTROL, CONTROL_OFF, CONTROL_OUTLINE, Deck, DeskLoading, Figure, Legend, Method, Note, Read, Region, Segmented, Surface, TYPE, Tag, Toolbar } from '../../components/pinpoint/Desk';
import HeatGrid, { type HeatColumn, type HeatRow } from '../../components/pinpoint/HeatGrid';
import { useScanSnapshot } from '../../components/pinpoint/useScanSnapshot';
import { CALL_WALL, FLIP, PUT_WALL, SELECT, SPOT, fmtStrike } from '../../components/pinpoint/ink';
import { heatInk } from '../../components/gex/heatmap';

/*
==================================================
  SLAYER TERMINAL - REPLAY (pages/pinpoint/Replay.tsx)
  Any past session, scrubbed — how the levels migrated.
==================================================

  THE QUESTION: how did the walls and the flip walk through a session.
  THE ACTION: pick a session, scrub it.

  One session picker drives everything, because the heat, the migration
  and the scrubbed book are three views of the same afternoon. The
  scrubber lands only on readings that were recorded; the heat cells are
  real readings rather than averages; a session the buffer did not
  capture is listed, selectable, and says it is empty. Nothing is
  interpolated and nothing is backfilled — the tag on the desk is a
  guarantee, not a decoration.
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
  const drift = useMemo(
    () => migration.filter(p => p.callWall !== null && p.putWall !== null && p.flip !== null).map(p => ({ time: p.time, spot: p.spot, callWall: p.callWall as number, putWall: p.putWall as number, flip: p.flip as number })),
    [migration]
  );

  if (!snapshot) {
    return (
      <DeskLoading>
        <DataState kind="loading" title="Opening the buffer" body="The first tick has not arrived yet." />
      </DeskLoading>
    );
  }
  if (spans.length === 0) {
    return (
      <Region title="Replay">
        <DataState kind="empty" title="No sessions in the buffer yet" body="Replay needs at least one session of recorded snapshots. They accumulate as the desk runs." />
      </Region>
    );
  }

  const scrubCol = at ? heat.columns.reduce((best, c) => (Math.abs(c - at.time) < Math.abs(best - at.time) ? c : best), heat.columns[0] ?? 0) : null;
  const columns: HeatColumn[] = heat.columns.map(c => ({ key: String(c), label: hhmm(c), note: c === scrubCol ? 'here' : undefined }));
  const rows: HeatRow[] = heat.rows.map(r => ({
    strike: r.strike,
    ink: book && r.strike === book.callWall ? CALL_WALL : book && r.strike === book.putWall ? PUT_WALL : undefined,
    cells: r.cells.map(c => ({ col: String(c.time), value: c.netGex, hot: c.time === scrubCol, title: `${fmtStrike(r.strike)} at ${hhmm(c.time)}: ${fmtUsd(c.netGex)}` })),
  }));
  const gap = span && span.snapshots === 0;
  const SESSION_OPTIONS = spans.map(s => ({
    value: String(s.index),
    label: (
      <>
        {dayLabel(s.from)}
        {s.snapshots === 0 && <span className="ml-1 text-warn">gap</span>}
      </>
    ),
    title: s.snapshots === 0 ? 'bars only — no snapshots were recorded' : `${s.snapshots} snapshots`,
  }));

  const hero = (
    <Region
      title={span ? `${dayLabel(span.from)} — strike by strike, through the session` : 'Strike × time'}
      note="net dealer gamma at every strike in each slice of the day — real readings, never averages; the ringed column is the moment the scrubber is on"
      actions={
        <Tag ink={CALL_WALL} title="Every cell and every level on this desk is a reading recorded at that moment. Nothing is interpolated or backfilled.">
          point-in-time · no backfill
        </Tag>
      }
    >
      {gap ? (
        <DataState kind="unavailable" title="This session was not captured" body={`${span ? dayLabel(span.from) : 'The session'} has bars but no snapshots in the buffer — the desk was not recording. It is listed so the gap is visible rather than a missing Tuesday.`} />
      ) : heat.rows.length === 0 ? (
        <DataState kind="empty" title="No readings in this session" pad="sm" />
      ) : (
        <HeatGrid columns={columns} rows={rows} maxAbs={heat.maxAbs} spot={book?.spot ?? snapshot.spot} fmt={fmtUsd} className="max-h-[560px]" dense cornerLabel="Strike" />
      )}
      <div className="pt-3 flex items-center gap-4 flex-wrap">
        <Legend items={[{ ink: heatInk.pos, label: 'amplifies' }, { ink: heatInk.neg, label: 'absorbs' }, { ink: SELECT, label: 'ring — the scrubbed moment' }, { ink: CALL_WALL, label: 'call wall row, then' }, { ink: PUT_WALL, label: 'put wall row, then' }]} />
        <span className={`ml-auto ${TYPE.label} text-textMuted`}>nothing here is interpolated or backfilled</span>
      </div>
    </Region>
  );

  const rail = (
    <>
      <Region title="Scrub the session" note="the slider lands only on readings that were recorded">
        {inSpan.length === 0 ? (
          <DataState kind="empty" title="Nothing to scrub" pad="sm" />
        ) : (
          <>
            <div className="flex items-center gap-2">
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
                className="flex-1 accent-white"
                data-replay-scrub
              />
              <Segmented ariaLabel="Playback speed" options={SPEEDS} value={speed} onChange={setSpeed} />
            </div>
            <div className="pt-2 flex items-baseline gap-3">
              <span className={`${TYPE.lead} text-textPrimary`}>{at ? hhmm(at.time) : '—'}</span>
              <span className={`${TYPE.label} tracking-normal text-textMuted tnum`}>
                reading {idx + 1} of {inSpan.length} · {at ? `${at.levels.length} strikes recorded` : ''}
              </span>
            </div>
          </>
        )}
      </Region>

      {/* The book at the scrubbed moment — follows the slider, so it is the box. */}
      <Surface title={at ? `The book at ${hhmm(at.time)}` : 'The book'} note="walls and flip re-picked from the levels recorded at that moment — the same rule the live desk uses">
        {book ? (
          <div className="grid grid-cols-2 gap-x-4 gap-y-3" data-replay-book>
            <Figure label="Spot then" value={fmtStrike(book.spot)} ink={SPOT} />
            <Figure label="Net gamma" value={fmtUsd(book.net)} ink={book.net > 0 ? PUT_WALL : CALL_WALL} sub={book.net > 0 ? 'amplifying' : 'absorbing'} />
            <Figure label="Call wall" value={book.callWall === null ? '—' : fmtStrike(book.callWall)} ink={CALL_WALL} />
            <Figure label="Put wall" value={book.putWall === null ? '—' : fmtStrike(book.putWall)} ink={PUT_WALL} />
            <Figure label="Flip" value={book.flip === null ? 'no flip' : fmtStrike(book.flip)} ink={FLIP} />
            <Figure label="Supreme" value={book.supreme === null ? '—' : fmtStrike(book.supreme)} />
          </div>
        ) : (
          <DataState kind="empty" title="No reading here" pad="sm" />
        )}
      </Surface>

      <Region title="What the session did">
        <Read>{migrationWords(migration)}</Read>
      </Region>
    </>
  );

  return (
    <>
      <Toolbar data-replay-controls>
        <span className={`${TYPE.label} text-textMuted`}>Session</span>
        <Segmented ariaLabel="Sessions in the buffer" options={SESSION_OPTIONS} value={String(span?.index ?? '')} onChange={v => setPick(Number(v))} className="flex-wrap" />
        <ProvenanceChip sources={['exposure', 'candles']} className="ml-auto" />
      </Toolbar>

      <Deck hero={hero} rail={rail}>
        <Region title="How the levels walked">
          {drift.length > 1 ? <WallDrift drift={drift} /> : <DataState kind="empty" title="No migration to draw" body="The session needs readings where both walls and the flip existed." pad="sm" />}
        </Region>

        <Method>
          <Note term="Point in time">Every cell and every level is a reading recorded at that moment. The scrubber cannot land between two readings, and a session the buffer did not capture is listed as a gap rather than filled in.</Note>
          <Note term="The book then">The walls are the heaviest call strike above and the heaviest put strike below the spot recorded at that reading; the flip is the nearest sign change. The same rule the live desk uses, applied to the levels as they were.</Note>
          <Note term="The buffer">Readings accumulate as the desk runs. {snaps.length} are in the buffer for {ticker}, across {spans.length} session{spans.length === 1 ? '' : 's'}.</Note>
        </Method>
      </Deck>
    </>
  );
};

export default Replay;
