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
import { CALL_WALL, FLIP, LONG_GAMMA, METRICS, PUT_WALL, SHORT_GAMMA, SPOT, SUPREME, fmtStrike } from '../../components/pinpoint/ink';

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
  supreme: SUPREME,
  pin: '#a3a3a3',
  spot: SPOT,
};

const LENS_INK: Record<GreekLens, string> = {
  color: METRICS.charm.ink,
  vomma: METRICS.vex.ink,
  speed: METRICS.gex.ink,
  veta: METRICS.vanna.ink,
  zomma: '#7DD3FC',
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
  const modeInk = mode === 'CHARM' ? METRICS.charm.ink : METRICS.vanna.ink;
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
      question={
        <>
          the book now against the book under <span style={{ color: modeInk }} className="font-semibold">{scenarioWords}</span> — the bright bar is now, the dim one is then
        </>
      }
      accent={modeInk}
      flush
      className="h-full"
      bodyClassName="flex flex-col"
    >
      <div className="px-2 pt-1 flex-1 min-h-0">
        <MigrationMap data={view} />
      </div>
      <div className="mt-auto border-t border-borderSubtle px-3.5 py-2.5 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2">
        <Figure label="Flip now" value={fmtStrike(view.flipCurrent)} ink={FLIP} sub={dist(view.flipCurrent)} />
        <Figure label="Flip then" value={fmtStrike(view.flipProjected)} ink={FLIP} sub={dist(view.flipProjected)} />
        <Figure label="It moves" value={flipMove === 0 ? 'not at all' : `${flipMove > 0 ? '+' : '−'}${Math.abs(flipMove).toFixed(2)}`} ink={flipMove === 0 ? '#a3a3a3' : flipMove > 0 ? LONG_GAMMA : SHORT_GAMMA} sub={flipMove === 0 ? 'the border holds' : flipMove > 0 ? 'the border rises — more of the book below it turns amplifying' : 'the border falls — more of the book above it turns absorbing'} />
        <Figure label="Biggest single change" value={view.read.delta ? fmtStrike(view.read.delta.strike) : '—'} sub={view.read.delta ? `${fmtUsd(view.read.delta.changeUsd)} vs the last scan` : 'no scan history yet'} ink={SUPREME} />
      </div>
    </Section>
  );

  const rail = (
    <>
      <Section title="The levels, now → then" question="each level re-picked under the scenario" accent={modeInk}>
        <ul className="flex flex-col divide-y divide-borderSubtle/60" data-level-shifts>
          {view.shifts.map(s => {
            const d = s.projected - s.current;
            return (
              <li key={s.label} className="py-2 flex items-center gap-3">
                <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: KIND_INK[s.kind] }} />
                <span className="w-28 shrink-0 font-mono text-[10px] font-bold uppercase tracking-wider whitespace-nowrap" style={{ color: KIND_INK[s.kind] }}>
                  {s.label}
                </span>
                <span className="font-mono text-[13px] font-bold tnum text-textPrimary">{fmtStrike(s.current)}</span>
                <span className="text-textMuted">→</span>
                <span className="font-mono text-[13px] font-bold tnum" style={{ color: d === 0 ? '#a3a3a3' : KIND_INK[s.kind] }}>
                  {fmtStrike(s.projected)}
                </span>
                <span className={`ml-auto font-mono text-[10px] tnum ${d === 0 ? 'text-textMuted' : d > 0 ? 'text-bull' : 'text-bear'}`}>{d === 0 ? 'holds' : `${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(2)}`}</span>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="The charm clock" question="how much of today’s delta decay has been paid — it is not linear" accent={METRICS.charm.ink}>
        <div className="flex items-end gap-4">
          <Figure label="Charm paid" value={`${Math.round(clock.realizedShare * 100)}%`} ink={METRICS.charm.ink} size="xl" />
          <Figure label="Clock run" value={`${Math.round(clock.clockShare * 100)}%`} sub={`${Math.round(clock.elapsed)} of ${RTH_MINUTES} minutes`} />
          <Figure label="Still ahead" value={`${Math.round(clock.remainingShare * 100)}%`} sub={`${Math.round(clock.remaining)} min to the bell`} />
        </div>
        <div className="mt-2 relative h-[6px] rounded-full bg-white/[0.06] overflow-hidden" aria-hidden>
          <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${clock.realizedShare * 100}%`, background: METRICS.charm.ink }} />
          <span className="absolute inset-y-0 w-px bg-white/70" style={{ left: `${clock.clockShare * 100}%` }} title="the wall clock" />
        </div>
        <p className="mt-2 text-[11px] text-textSecondary leading-relaxed">{charmClockWords(clock)}</p>
      </Section>

      <Section title="The read" question="what this scenario computes — never what the market will do" accent={modeInk}>
        <Read ink={modeInk}>{view.read.line}</Read>
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
          <Figure label="Flip" value={fmtStrike(view.read.flip.price)} sub={`${view.read.flip.distPct > 0 ? '+' : ''}${view.read.flip.distPct.toFixed(2)}% from spot`} ink={FLIP} size="sm" />
          <Figure label="Charm concentrates at" value={fmtStrike(view.read.charm.price)} sub={`${view.read.charm.distPct > 0 ? '+' : ''}${view.read.charm.distPct.toFixed(2)}% from spot`} ink={METRICS.charm.ink} size="sm" />
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
          <Section title="Vanna · dollars per vol point" question={METRICS.vanna.reads} accent={METRICS.vanna.ink} flush>
            <div className="px-2 pt-1 pb-2">
              <StrikeBars rows={vannaRows} maxAbs={profile.maxAbs.vanna} levels={baseLevels} split={false} fmt={fmtUsd} fmtDist={dist} hoverStrike={hover} selectedStrike={picked} onHover={setHover} onSelect={s => setPicked(p => (p === s ? null : s))} />
            </div>
            <div className="border-t border-borderSubtle px-3.5 py-2 flex items-center gap-4 flex-wrap">
              <Figure label="Net vanna" value={fmtUsd(profile.netVanna)} ink={METRICS.vanna.ink} sub="per vol point, whole window" size="sm" />
              <span className="text-[10px] text-textMuted leading-snug max-w-[40ch]">Positive net vanna: a vol rise hands the dealers delta they must sell. Negative: a vol rise makes them buy.</span>
            </div>
          </Section>
          <Section title="Charm · dollars per calendar day" question={METRICS.charm.reads} accent={METRICS.charm.ink} flush>
            <div className="px-2 pt-1 pb-2">
              <StrikeBars rows={charmRows} maxAbs={profile.maxAbs.charm} levels={baseLevels} split={false} fmt={fmtUsd} fmtDist={dist} hoverStrike={hover} selectedStrike={picked} onHover={setHover} onSelect={s => setPicked(p => (p === s ? null : s))} />
            </div>
            <div className="border-t border-borderSubtle px-3.5 py-2 flex items-center gap-4 flex-wrap">
              <Figure label="Net charm" value={fmtUsd(profile.netCharm)} ink={METRICS.charm.ink} sub="per calendar day, whole window" size="sm" />
              <span className="text-[10px] text-textMuted leading-snug max-w-[40ch]">The delta the book sheds by itself each day — the hedging flow that arrives with no trade at all, heaviest into the bell.</span>
            </div>
          </Section>
        </Bench>

        <Bench cols={2}>
          <Section title="Where the walls have been today" question="the call wall, the put wall and the flip through the session, with spot" accent={SPOT}>
            {view.drift.length > 1 ? <WallDrift drift={view.drift} /> : <DataState kind="empty" title="No drift yet" body="The store needs a few scans before there is a path to draw." pad="sm" />}
          </Section>
          <Section title="Net gamma through the session" question="the whole book’s total — the regime line" accent={METRICS.gex.ink}>
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
          question={
            <>
              <span style={{ color: LENS_INK[lens] }} className="font-semibold">
                {LENS_META[lens].label}
              </span>
              , in <span className="font-semibold text-textPrimary">{LENS_META[lens].unit}</span> — {LENS_META[lens].question}
            </>
          }
          accent={LENS_INK[lens]}
          actions={<SegmentedControl ariaLabel="Greek lens" options={LENS_OPTIONS} value={lens} onChange={v => setLens(v)} />}
          flush
        >
          {surface && surface.rows.length > 0 ? (
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-0">
              <div className="xl:col-span-8 px-2 pt-1 pb-2 border-b xl:border-b-0 xl:border-r border-borderSubtle">
                <StrikeBars rows={surfaceRows} maxAbs={surface.maxAbs} levels={{ spot, flip: surfaceFlip?.strike ?? null, flipKind: surfaceFlip?.kind ?? 'no-crossing', callWall: null, putWall: null, supreme: null }} split={false} fmt={v => `${v < 0 ? '−' : ''}${Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}`} fmtDist={dist} hoverStrike={hover} selectedStrike={picked} onHover={setHover} onSelect={s => setPicked(p => (p === s ? null : s))} />
              </div>
              <div className="xl:col-span-4 px-3.5 py-3 flex flex-col gap-3">
                <Figure label={`Net ${LENS_META[lens].label.toLowerCase()}`} value={`${surface.net < 0 ? '−' : ''}${Math.abs(surface.net).toLocaleString('en-US', { maximumFractionDigits: 0 })}`} sub={LENS_META[lens].unit} ink={LENS_INK[lens]} size="lg" />
                <Read ink={LENS_INK[lens]}>{surfaceWords(surface)}</Read>
                <div className="flex flex-col gap-1">
                  {GREEK_LENSES.map(l => (
                    <button key={l} onClick={() => setLens(l)} className={`text-left rounded px-2 py-1 transition-colors ${l === lens ? 'bg-white/[0.05]' : 'hover:bg-white/[0.03]'}`}>
                      <span className="font-mono text-[10px] font-bold uppercase tracking-wider" style={{ color: LENS_INK[l] }}>
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
