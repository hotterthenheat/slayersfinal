import { useMemo, useState } from 'react';
import Simulator from '../../core/simulator';
import { RTH_MINUTES } from '../../core/calendar';
import { buildVannaCharm } from '../../data/vannacharm';
import { buildCharmClock, charmClockWords } from '../../data/charmClock';
import { readSessionClock } from '../../data/moc';
import { buildExposureProfile } from '../../data/exposure';
import { buildNetGexSeries } from '../../data/gexSeries';
import { GREEK_LENSES, LENS_META, buildGreekSurface, surfaceWords, type GreekLens } from '../../data/greekSurfaces';
import { fmtDistance, impliedDaySigma, sessionAtr, type DistanceScales } from '../../data/atr';
import { useDistanceUnit } from '../../data/distanceUnits';
import { fmtUsd } from '../../data/gex';
import { readFlip } from '../../core/walls';
import type { IvShift, KeyLevelKind, ShiftMode } from '../../types/gex';
import DataState from '../../components/ui/DataState';
import ProvenanceChip from '../../components/ui/ProvenanceChip';
import SegmentedControl from '../../components/ui/SegmentedControl';
import MigrationMap from '../../components/gex/vannacharm/MigrationMap';
import WallDrift from '../../components/gex/vannacharm/WallDrift';
import { Bench, Deck, Figure, Legend, Read, Section, Tag } from '../../components/pinpoint/Desk';
import StrikeBars from '../../components/pinpoint/StrikeBars';
import Spark from '../../components/pinpoint/Spark';
import { useScanSnapshot } from '../../components/pinpoint/useScanSnapshot';
import { INK, CALL_WALL, FLIP, LONG_GAMMA, METRICS, PUT_WALL, SHORT_GAMMA, SPOT, fmtStrike } from '../../components/pinpoint/ink';

/*
==================================================
  SLAYER TERMINAL - DRIFT (pages/pinpoint/Drift.tsx)
  Where the levels go as vol moves and time passes.
  Rebuilt from zero, 2026-09-06.
==================================================

  THE QUESTION: the walls and the flip are where they are NOW — where
  will they be at the close, or after a two-point vol move? Two forces
  move them and both are on this desk with their units in the labels:

    CHARM   delta decays as the day runs; the dealers' hedges drift with
            it — dollars per CALENDAR DAY at each strike
    VANNA   delta changes as vol changes — dollars per VOL POINT

  The hero is the migration: the book now against the book under the
  scenario, bar by bar, with the flip's move called out. The clock beside
  it says how much of today's charm has already been paid (it is not
  linear — most of it comes in the last hours). The second-order greeks
  the old "Greek Surfaces" desk carried — color, vomma, speed, veta,
  zomma — are here as a lens under the same bars, because they are the
  same question one derivative further out, and each wears its unit.
*/

const MODE_OPTIONS = [
  { value: 'CHARM', label: 'Charm · into the close' },
  { value: 'VANNA', label: 'Vanna · vol shift' },
] as const;
const IV_OPTIONS = [
  { value: '-2', label: '−2 vol' },
  { value: '-1', label: '−1' },
  { value: '1', label: '+1' },
  { value: '2', label: '+2 vol' },
] as const;
const LENS_OPTIONS = GREEK_LENSES.map(l => ({ value: l, label: LENS_META[l].label }));

const KIND_INK: Record<KeyLevelKind, string> = {
  'call-wall': CALL_WALL,
  'put-wall': PUT_WALL,
  flip: FLIP,
  /* SUPREME's magenta is a CHART label — it exists to be told apart from four
     other lines drawn over the same bars. In a list of words it is a sixth hue
     with nothing to distinguish itself from. */
  supreme: INK.primary,
  pin: INK.secondary,
  spot: SPOT,
};

const Drift = () => {
  const { snapshot, scanAt } = useScanSnapshot();
  const unit = useDistanceUnit();
  const [mode, setMode] = useState<ShiftMode>('CHARM');
  const [ivKey, setIvKey] = useState<'-2' | '-1' | '1' | '2'>('-1');
  const [lens, setLens] = useState<GreekLens>('color');
  const [hover, setHover] = useState<number | null>(null);
  const [picked, setPicked] = useState<number | null>(null);

  /* The live clock, read on the scan tier — a charm map that shifts under
     the cursor every render is noise, not freshness. Zero after the bell. */
  const hoursToClose = useMemo(() => readSessionClock().secondsToClose / 3600, [scanAt]);
  const view = useMemo(() => (snapshot ? buildVannaCharm(snapshot, mode, Number(ivKey) as IvShift, 10, hoursToClose) : null), [snapshot, mode, ivKey, hoursToClose]);
  const clock = useMemo(() => buildCharmClock(RTH_MINUTES - hoursToClose * 60), [hoursToClose]);
  const profile = useMemo(() => (snapshot ? buildExposureProfile(snapshot, 'ALL', 15) : null), [snapshot]);
  const series = useMemo(() => (snapshot ? buildNetGexSeries(snapshot.ticker) : null), [snapshot]);
  const iv = snapshot ? (Simulator.TICKERS[snapshot.ticker]?.iv ?? 0.2) : 0.2;
  const surface = useMemo(() => (snapshot ? buildGreekSurface(snapshot.chain, snapshot.spot, iv, lens) : null), [snapshot, iv, lens]);
  const scales = useMemo<DistanceScales>(() => {
    if (!snapshot) return { atr: null, sigma: null };
    return { atr: sessionAtr(Simulator.getCandles(snapshot.ticker) ?? []), sigma: impliedDaySigma(snapshot.spot, iv) };
  }, [snapshot, iv]);

  if (!snapshot || !view || !profile) {
    return (
      <Section title="Drift">
        <DataState kind="loading" title="Reading the book" body="The first tick has not arrived yet." />
      </Section>
    );
  }

  const spot = snapshot.spot;
  const dist = (price: number) => fmtDistance(price - spot, spot, unit, scales);
  const flipMove = view.flipProjected - view.flipCurrent;
  const modeInk = mode === 'CHARM' ? INK.secondary : INK.secondary;
  const scenarioWords = mode === 'CHARM' ? (hoursToClose > 0 ? `${hoursToClose.toFixed(1)} hours of delta decay from here to the bell` : 'the session is over — no charm left to come, so the projection is the map as it stands') : `implied vol ${Number(ivKey) > 0 ? 'up' : 'down'} ${Math.abs(Number(ivKey))} point${Math.abs(Number(ivKey)) === 1 ? '' : 's'} across the book`;
  const vannaRows = profile.strikes.map(s => ({ strike: s.strike, net: s.vanna.net, put: s.vanna.put, call: s.vanna.call, oi: s.oi, volume: s.volume }));
  const charmRows = profile.strikes.map(s => ({ strike: s.strike, net: s.charm.net, put: s.charm.put, call: s.charm.call, oi: s.oi, volume: s.volume }));
  const flipNow = readFlip(profile.strikes, spot, s => s.gex.net);
  const baseLevels = { spot, flip: flipNow.strike, flipKind: flipNow.kind, callWall: profile.levels.callWall, putWall: profile.levels.putWall, supreme: null };
  const surfaceRows = surface ? surface.rows.map(r => ({ strike: r.strike, net: r.net, put: r.put, call: r.call, oi: 0, volume: 0 })) : [];
  const surfaceFlip = surface ? readFlip(surface.rows, spot, r => r.net) : null;

  const hero = (
    <Section
      title="Where the levels go"
      /* "the bright bar is now, the dim one is then" used to close this line.
         The chart's own key says it, and the footnote under the bars says it
         again — three statements of one fact before a reader reaches a bar. */
      note={
        <>
          the book now against the book under <span style={{ color: modeInk }} className="font-semibold">{scenarioWords}</span>
        </>
      }
      className="h-full"
      bodyClassName="flex flex-col"
    >
      <div className="px-2 pt-1 flex-1 min-h-0">
        <MigrationMap data={view} />
      </div>
      <div className="mt-auto border-t border-borderSubtle px-3.5 py-2.5 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2">
        <Figure label="Flip now" value={fmtStrike(view.flipCurrent)} ink={FLIP} sub={dist(view.flipCurrent)} />
        <Figure label="Flip then" value={fmtStrike(view.flipProjected)} ink={FLIP} sub={dist(view.flipProjected)} />
        <Figure label="It moves" value={flipMove === 0 ? 'not at all' : `${flipMove > 0 ? '+' : '−'}${Math.abs(flipMove).toFixed(2)}`} ink={flipMove === 0 ? INK.secondary : flipMove > 0 ? LONG_GAMMA : SHORT_GAMMA} sub={flipMove === 0 ? 'the border holds' : flipMove > 0 ? 'the border rises — more of the book below it turns amplifying' : 'the border falls — more of the book above it turns absorbing'} />
        <Figure label="Biggest single change" value={view.read.delta ? fmtStrike(view.read.delta.strike) : '—'} sub={view.read.delta ? `${fmtUsd(view.read.delta.changeUsd)} vs the last scan` : 'no scan history yet'} />
      </div>
    </Section>
  );

  const rail = (
    <>
      <Section title="The levels, now → then">
        <ul className="flex flex-col divide-y divide-borderSubtle/60" data-level-shifts>
          {view.shifts.map(s => {
            const d = s.projected - s.current;
            return (
              <li key={s.label} className="py-2 flex items-center gap-2.5">
                <span className="w-28 shrink-0 font-mono text-[10px] font-bold uppercase tracking-wider whitespace-nowrap" style={{ color: KIND_INK[s.kind] }}>
                  {s.label}
                </span>
                <span className="font-mono text-[13px] font-bold tnum text-textPrimary">{fmtStrike(s.current)}</span>
                {/* The arrow inherits 16px with no size class of its own — the
                    one glyph on this section taller than the numbers it sits
                    between. It is punctuation, so it takes the small step. */}
                <span className="text-[11px] text-textMuted">→</span>
                <span className="font-mono text-[13px] font-bold tnum" style={{ color: d === 0 ? INK.secondary : KIND_INK[s.kind] }}>
                  {fmtStrike(s.projected)}
                </span>
                <span className={`ml-auto font-mono text-[10px] tnum ${d === 0 ? 'text-textMuted' : d > 0 ? 'text-bull' : 'text-bear'}`}>{d === 0 ? 'holds' : `${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(2)}`}</span>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="The charm clock" note="how much of today’s delta decay has been paid — it is not linear">
        {/* Three percentages that were one fact: paid, run, and still ahead are
            each other's complement, and printing all three at once made the
            reader do arithmetic to discover they had learned nothing. The
            figure is the share PAID; the wall clock rides under it as the tick
            on the bar, which is where a comparison belongs. */}
        <div className="flex items-end gap-8">
          <Figure label="Charm paid" value={`${Math.round(clock.realizedShare * 100)}%`} size="lead" sub={`of today’s delta decay`} />
          <Figure label="Clock run" value={`${Math.round(clock.clockShare * 100)}%`} sub={`${Math.round(clock.remaining)} min to the bell`} />
        </div>
        <div className="mt-2 relative h-[6px] rounded-full bg-white/[0.06] overflow-hidden" aria-hidden>
          <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${clock.realizedShare * 100}%`, background: INK.secondary }} />
          <span className="absolute inset-y-0 w-px bg-white/70" style={{ left: `${clock.clockShare * 100}%` }} title="the wall clock" />
        </div>
        <p className="mt-2 text-[11px] text-textSecondary leading-relaxed">{charmClockWords(clock)}</p>
      </Section>

      <Section title="The read" note="what this scenario computes — never what the market will do">
        <Read>{view.read.line}</Read>
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
          <Figure label="Flip" value={fmtStrike(view.read.flip.price)} sub={`${view.read.flip.distPct > 0 ? '+' : ''}${view.read.flip.distPct.toFixed(2)}% from spot`} ink={FLIP} size="sm" />
          <Figure label="Charm concentrates at" value={fmtStrike(view.read.charm.price)} sub={`${view.read.charm.distPct > 0 ? '+' : ''}${view.read.charm.distPct.toFixed(2)}% from spot`} size="sm" />
          <Figure label="Call wall" value={fmtStrike(view.read.callWall.price)} sub={`${view.read.callWall.distPct > 0 ? '+' : ''}${view.read.callWall.distPct.toFixed(2)}%`} ink={CALL_WALL} size="sm" />
          <Figure label="Put wall" value={fmtStrike(view.read.putWall.price)} sub={`${view.read.putWall.distPct > 0 ? '+' : ''}${view.read.putWall.distPct.toFixed(2)}%`} ink={PUT_WALL} size="sm" />
        </div>
      </Section>
    </>
  );

  return (
    <>
      <div className="flex items-center gap-2.5 flex-wrap" data-drift-controls>
        <SegmentedControl ariaLabel="Scenario" options={MODE_OPTIONS} value={mode} onChange={v => setMode(v)} />
        {mode === 'VANNA' && <SegmentedControl ariaLabel="IV shift" options={IV_OPTIONS} value={ivKey} onChange={v => setIvKey(v)} />}
        <ProvenanceChip sources={['chain', 'exposure', 'carry']} className="ml-auto" note="Every projection here re-prices the book through the desk's rate and yield — the scenario and the second-order surfaces both read the carry seam." />
        <span className="font-mono text-[10px] text-textMuted uppercase tracking-widest tnum">scan {scanAt} · 10s</span>
      </div>
      <Deck hero={hero} rail={rail}>
        <Bench cols={2}>
          <Section title="Vanna · dollars per vol point">
            <div className="px-2 pt-1 pb-2">
              <StrikeBars rows={vannaRows} maxAbs={profile.maxAbs.vanna} levels={baseLevels} split={false} fmt={fmtUsd} fmtDist={dist} hoverStrike={hover} selectedStrike={picked} onHover={setHover} onSelect={s => setPicked(p => (p === s ? null : s))} />
            </div>
            <div className="border-t border-borderSubtle px-3.5 py-2 flex items-center gap-4 flex-wrap">
              <Figure label="Net vanna" value={fmtUsd(profile.netVanna)} sub="per vol point, whole window" size="sm" />
              <span className="text-[10px] text-textMuted leading-snug max-w-[40ch]">Positive net vanna: a vol rise hands the dealers delta they must sell. Negative: a vol rise makes them buy.</span>
            </div>
          </Section>
          <Section title="Charm · dollars per calendar day">
            <div className="px-2 pt-1 pb-2">
              <StrikeBars rows={charmRows} maxAbs={profile.maxAbs.charm} levels={baseLevels} split={false} fmt={fmtUsd} fmtDist={dist} hoverStrike={hover} selectedStrike={picked} onHover={setHover} onSelect={s => setPicked(p => (p === s ? null : s))} />
            </div>
            <div className="border-t border-borderSubtle px-3.5 py-2 flex items-center gap-4 flex-wrap">
              <Figure label="Net charm" value={fmtUsd(profile.netCharm)} sub="per calendar day, whole window" size="sm" />
              <span className="text-[10px] text-textMuted leading-snug max-w-[40ch]">The delta the book sheds by itself each day — the hedging flow that arrives with no trade at all, heaviest into the bell.</span>
            </div>
          </Section>
        </Bench>

        <Bench cols={2}>
          <Section title="Where the walls have been today">
            {view.drift.length > 1 ? <WallDrift drift={view.drift} /> : <DataState kind="empty" title="No drift yet" body="The store needs a few scans before there is a path to draw." pad="sm" />}
          </Section>
          <Section title="Net gamma through the session">
            {series && series.points.length > 1 ? (
              <>
                <Spark points={series.points.map(p => ({ x: p.time, y: p.netGex }))} ink={series.points[series.points.length - 1].netGex > 0 ? SHORT_GAMMA : LONG_GAMMA} marks={series.zeroCrossings} markInk={FLIP} height={110} ariaLabel="Net gamma through the session" />
                <div className="mt-2 flex items-end gap-4">
                  <Figure label="Now" value={fmtUsd(series.points[series.points.length - 1].netGex)} ink={series.points[series.points.length - 1].netGex > 0 ? SHORT_GAMMA : LONG_GAMMA} />
                  <Figure label="Crossed zero" value={`${series.zeroCrossings.length}×`} ink={FLIP} size="sm" sub="the book changing sign" />
                </div>
              </>
            ) : (
              <DataState kind="empty" title="No series yet" pad="sm" />
            )}
          </Section>
        </Bench>

        <Section
          title="Second order — the greeks behind the levels"
          note={
            <>
              <span style={{ color: INK.secondary }} className="font-semibold">
                {LENS_META[lens].label}
              </span>
              , in <span className="font-semibold text-textPrimary">{LENS_META[lens].unit}</span> — {LENS_META[lens].question}
            </>
          }
          actions={<SegmentedControl ariaLabel="Greek lens" options={LENS_OPTIONS} value={lens} onChange={v => setLens(v)} />}
        >
          {surface && surface.rows.length > 0 ? (
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-0">
              <div className="xl:col-span-8 px-2 pt-1 pb-2 border-b xl:border-b-0 xl:border-r border-borderSubtle">
                <StrikeBars rows={surfaceRows} maxAbs={surface.maxAbs} levels={{ spot, flip: surfaceFlip?.strike ?? null, flipKind: surfaceFlip?.kind ?? 'no-crossing', callWall: null, putWall: null, supreme: null }} split={false} fmt={v => `${v < 0 ? '−' : ''}${Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}`} fmtDist={dist} hoverStrike={hover} selectedStrike={picked} onHover={setHover} onSelect={s => setPicked(p => (p === s ? null : s))} />
              </div>
              <div className="xl:col-span-4 px-3.5 py-3 flex flex-col gap-3">
                <Figure label={`Net ${LENS_META[lens].label.toLowerCase()}`} value={`${surface.net < 0 ? '−' : ''}${Math.abs(surface.net).toLocaleString('en-US', { maximumFractionDigits: 0 })}`} sub={LENS_META[lens].unit} ink={INK.secondary} size="figure" />
                <Read>{surfaceWords(surface)}</Read>
                <div className="flex flex-col gap-1">
                  {GREEK_LENSES.map(l => (
                    <button key={l} onClick={() => setLens(l)} className={`text-left rounded px-2 py-1 transition-colors ${l === lens ? 'bg-white/[0.05]' : 'hover:bg-white/[0.03]'}`}>
                      <span className="font-mono text-[10px] font-bold uppercase tracking-wider" style={{ color: INK.secondary }}>
                        {LENS_META[l].label}
                      </span>
                      <Tag ink="#a3a3a3" className="ml-2">
                        {LENS_META[l].unit}
                      </Tag>
                    </button>
                  ))}
                </div>
                <Legend items={[{ ink: SPOT, label: 'spot' }, { ink: FLIP, label: 'where this greek changes sign', dashed: true }]} />
              </div>
            </div>
          ) : (
            <DataState kind="empty" title="No book to read" pad="sm" />
          )}
        </Section>
      </Deck>
    </>
  );
};

export default Drift;
