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
import MigrationMap from '../../components/gex/vannacharm/MigrationMap';
import WallDrift from '../../components/gex/vannacharm/WallDrift';
import { Bench, Deck, DeskLoading, Figure, Legend, Method, Note, Read, Region, Segmented, TYPE, Toolbar } from '../../components/pinpoint/Desk';
import StrikeBars from '../../components/pinpoint/StrikeBars';
import Spark from '../../components/pinpoint/Spark';
import { useScanSnapshot } from '../../components/pinpoint/useScanSnapshot';
import { INK, CALL_WALL, FLIP, LONG_GAMMA, METRICS, PUT_WALL, SHORT_GAMMA, SPOT, fmtStrike } from '../../components/pinpoint/ink';

/*
==================================================
  SLAYER TERMINAL - DRIFT (pages/pinpoint/Drift.tsx)
  Where the levels go as vol moves and time passes.
==================================================

  THE QUESTION: the walls and the flip are where they are NOW — where
  will they be at the close, or after a two-point vol move? THE ACTION:
  choose the scenario. Two forces move the levels and both are here with
  their units in the titles: CHARM, dollars per calendar day, and VANNA,
  dollars per vol point. The second-order greeks are a lens under the
  same bars, because they are the same question one derivative out.

  WHAT MOVED IN THE REDESIGN. The second-order section drew its five
  lenses twice — a segmented control in its heading and a column of
  buttons beside the chart. One control now. The scenario caveat and
  the charm clock's non-linearity are the Method.
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
const LENS_OPTIONS = GREEK_LENSES.map(l => ({ value: l, label: LENS_META[l].label, title: `${LENS_META[l].label} — ${LENS_META[l].unit}` }));

const KIND_INK: Record<KeyLevelKind, string> = {
  'call-wall': CALL_WALL,
  'put-wall': PUT_WALL,
  flip: FLIP,
  /* SUPREME's magenta is a chart label; in a list of words it is a sixth hue. */
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

  /* The live clock, read on the scan tier. Zero after the bell. */
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
      <DeskLoading>
        <DataState kind="loading" title="Reading the book" body="The first tick has not arrived yet." />
      </DeskLoading>
    );
  }

  const spot = snapshot.spot;
  const dist = (price: number) => fmtDistance(price - spot, spot, unit, scales);
  const flipMove = view.flipProjected - view.flipCurrent;
  const scenarioWords =
    mode === 'CHARM'
      ? hoursToClose > 0
        ? `${hoursToClose.toFixed(1)} hours of delta decay from here to the bell`
        : 'the session is over — no charm left to come, so the projection is the map as it stands'
      : `implied vol ${Number(ivKey) > 0 ? 'up' : 'down'} ${Math.abs(Number(ivKey))} point${Math.abs(Number(ivKey)) === 1 ? '' : 's'} across the book`;
  const vannaRows = profile.strikes.map(s => ({ strike: s.strike, net: s.vanna.net, put: s.vanna.put, call: s.vanna.call, oi: s.oi, volume: s.volume }));
  const charmRows = profile.strikes.map(s => ({ strike: s.strike, net: s.charm.net, put: s.charm.put, call: s.charm.call, oi: s.oi, volume: s.volume }));
  const flipNow = readFlip(profile.strikes, spot, s => s.gex.net);
  const baseLevels = { spot, flip: flipNow.strike, flipKind: flipNow.kind, callWall: profile.levels.callWall, putWall: profile.levels.putWall, supreme: null };
  const surfaceRows = surface ? surface.rows.map(r => ({ strike: r.strike, net: r.net, put: r.put, call: r.call, oi: 0, volume: 0 })) : [];
  const surfaceFlip = surface ? readFlip(surface.rows, spot, r => r.net) : null;
  const toggle = (s: number) => setPicked(p => (p === s ? null : s));
  const plain = (v: number) => `${v < 0 ? '−' : ''}${Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

  const hero = (
    <Region title="Where the levels go" note={<>the book now against the book under <span className="text-textSecondary font-semibold">{scenarioWords}</span></>}>
      <MigrationMap data={view} />
      <div className="pt-3 border-t border-borderSubtle grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2">
        <Figure label="Flip now" value={fmtStrike(view.flipCurrent)} ink={FLIP} sub={dist(view.flipCurrent)} />
        <Figure label="Flip then" value={fmtStrike(view.flipProjected)} ink={FLIP} sub={dist(view.flipProjected)} />
        <Figure
          label="It moves"
          value={flipMove === 0 ? 'not at all' : `${flipMove > 0 ? '+' : '−'}${Math.abs(flipMove).toFixed(2)}`}
          ink={flipMove === 0 ? INK.secondary : flipMove > 0 ? LONG_GAMMA : SHORT_GAMMA}
          sub={flipMove === 0 ? 'the border holds' : flipMove > 0 ? 'the border rises — more of the book below it turns amplifying' : 'the border falls — more of the book above it turns absorbing'}
        />
        <Figure label="Biggest single change" value={view.read.delta ? fmtStrike(view.read.delta.strike) : '—'} sub={view.read.delta ? `${fmtUsd(view.read.delta.changeUsd)} vs the last scan` : 'no scan history yet'} />
      </div>
    </Region>
  );

  const rail = (
    <>
      <Region title="The levels, now → then">
        <ul className="flex flex-col divide-y divide-borderSubtle/60" data-level-shifts>
          {view.shifts.map(s => {
            const d = s.projected - s.current;
            return (
              <li key={s.label} className="py-2 flex items-center gap-2">
                <span className={`${TYPE.label} font-bold w-24 shrink-0`} style={{ color: KIND_INK[s.kind] }}>
                  {s.label}
                </span>
                <span className={`${TYPE.lead} text-textPrimary`}>{fmtStrike(s.current)}</span>
                <span className={`${TYPE.body} text-textMuted`}>→</span>
                <span className={TYPE.lead} style={{ color: d === 0 ? INK.secondary : KIND_INK[s.kind] }}>
                  {fmtStrike(s.projected)}
                </span>
                <span className={`ml-auto ${TYPE.label} tracking-normal tnum ${d === 0 ? 'text-textMuted' : d > 0 ? 'text-bull' : 'text-bear'}`}>{d === 0 ? 'holds' : `${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(2)}`}</span>
              </li>
            );
          })}
        </ul>
      </Region>

      <Region title="The charm clock" note="how much of today’s delta decay has been paid">
        <div className="flex items-end gap-6">
          <Figure label="Charm paid" value={`${Math.round(clock.realizedShare * 100)}%`} size="lead" sub="of today’s delta decay" />
          <Figure label="Clock run" value={`${Math.round(clock.clockShare * 100)}%`} sub={`${Math.round(clock.remaining)} min to the bell`} />
        </div>
        <div className="mt-2 relative h-[6px] bg-white/[0.06] overflow-hidden" aria-hidden>
          <span className="absolute inset-y-0 left-0" style={{ width: `${clock.realizedShare * 100}%`, background: INK.secondary }} />
          <span className="absolute inset-y-0 w-px bg-white/70" style={{ left: `${clock.clockShare * 100}%` }} title="the wall clock" />
        </div>
        <p className={`${TYPE.body} text-textSecondary pt-2`}>{charmClockWords(clock)}</p>
      </Region>

      <Region title="The read" note="what this scenario computes — never what the market will do">
        <Read>{view.read.line}</Read>
        <div className="pt-3 grid grid-cols-2 gap-x-4 gap-y-2">
          <Figure label="Flip" value={fmtStrike(view.read.flip.price)} sub={`${view.read.flip.distPct > 0 ? '+' : ''}${view.read.flip.distPct.toFixed(2)}% from spot`} ink={FLIP} size="sm" />
          <Figure label="Charm concentrates at" value={fmtStrike(view.read.charm.price)} sub={`${view.read.charm.distPct > 0 ? '+' : ''}${view.read.charm.distPct.toFixed(2)}% from spot`} size="sm" />
          <Figure label="Call wall" value={fmtStrike(view.read.callWall.price)} sub={`${view.read.callWall.distPct > 0 ? '+' : ''}${view.read.callWall.distPct.toFixed(2)}%`} ink={CALL_WALL} size="sm" />
          <Figure label="Put wall" value={fmtStrike(view.read.putWall.price)} sub={`${view.read.putWall.distPct > 0 ? '+' : ''}${view.read.putWall.distPct.toFixed(2)}%`} ink={PUT_WALL} size="sm" />
        </div>
      </Region>
    </>
  );

  return (
    <>
      <Toolbar data-drift-controls>
        <Segmented ariaLabel="Scenario" options={MODE_OPTIONS} value={mode} onChange={setMode} />
        {mode === 'VANNA' && <Segmented ariaLabel="IV shift" options={IV_OPTIONS} value={ivKey} onChange={setIvKey} />}
        <ProvenanceChip sources={['chain', 'exposure', 'carry']} className="ml-auto" note="Every projection here re-prices the book through the desk's rate and yield — the scenario and the second-order surfaces both read the carry seam." />
        <span className={`${TYPE.label} text-textMuted tnum`}>scan {scanAt} · 10s</span>
      </Toolbar>

      <Deck hero={hero} rail={rail}>
        <Bench cols={2}>
          <Region title="Vanna · dollars per vol point">
            <StrikeBars rows={vannaRows} maxAbs={profile.maxAbs.vanna} levels={baseLevels} split={false} fmt={fmtUsd} fmtDist={dist} hoverStrike={hover} selectedStrike={picked} onHover={setHover} onSelect={toggle} />
            <div className="pt-2 border-t border-borderSubtle flex items-start gap-4 flex-wrap">
              <Figure label="Net vanna" value={fmtUsd(profile.netVanna)} sub="per vol point, whole window" size="sm" />
              <span className={`${TYPE.body} text-textMuted max-w-[40ch]`}>Positive net vanna: a vol rise hands the dealers delta they must sell. Negative: a vol rise makes them buy.</span>
            </div>
          </Region>
          <Region title="Charm · dollars per calendar day">
            <StrikeBars rows={charmRows} maxAbs={profile.maxAbs.charm} levels={baseLevels} split={false} fmt={fmtUsd} fmtDist={dist} hoverStrike={hover} selectedStrike={picked} onHover={setHover} onSelect={toggle} />
            <div className="pt-2 border-t border-borderSubtle flex items-start gap-4 flex-wrap">
              <Figure label="Net charm" value={fmtUsd(profile.netCharm)} sub="per calendar day, whole window" size="sm" />
              <span className={`${TYPE.body} text-textMuted max-w-[40ch]`}>The delta the book sheds by itself each day — the hedging flow that arrives with no trade at all, heaviest into the bell.</span>
            </div>
          </Region>
        </Bench>

        <Bench cols={2}>
          <Region title="Where the walls have been today">
            {view.drift.length > 1 ? <WallDrift drift={view.drift} /> : <DataState kind="empty" title="No drift yet" body="The store needs a few scans before there is a path to draw." pad="sm" />}
          </Region>
          <Region title="Net gamma through the session">
            {series && series.points.length > 1 ? (
              <>
                <Spark points={series.points.map(p => ({ x: p.time, y: p.netGex }))} ink={series.points[series.points.length - 1].netGex > 0 ? SHORT_GAMMA : LONG_GAMMA} marks={series.zeroCrossings} markInk={FLIP} height={110} ariaLabel="Net gamma through the session" />
                <div className="pt-2 flex items-end gap-4">
                  <Figure label="Now" value={fmtUsd(series.points[series.points.length - 1].netGex)} ink={series.points[series.points.length - 1].netGex > 0 ? SHORT_GAMMA : LONG_GAMMA} />
                  <Figure label="Crossed zero" value={`${series.zeroCrossings.length}×`} ink={FLIP} size="sm" sub="the book changing sign" />
                </div>
              </>
            ) : (
              <DataState kind="empty" title="No series yet" pad="sm" />
            )}
          </Region>
        </Bench>

        <Region
          title="Second order — the greeks behind the levels"
          note={
            <>
              <span className="text-textSecondary font-semibold">{LENS_META[lens].label}</span>, in <span className="font-semibold text-textPrimary">{LENS_META[lens].unit}</span> — {LENS_META[lens].question}
            </>
          }
          actions={<Segmented ariaLabel="Greek lens" options={LENS_OPTIONS} value={lens} onChange={setLens} />}
        >
          {surface && surface.rows.length > 0 ? (
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
              <div className="xl:col-span-8">
                <StrikeBars
                  rows={surfaceRows}
                  maxAbs={surface.maxAbs}
                  levels={{ spot, flip: surfaceFlip?.strike ?? null, flipKind: surfaceFlip?.kind ?? 'no-crossing', callWall: null, putWall: null, supreme: null }}
                  split={false}
                  fmt={plain}
                  fmtDist={dist}
                  hoverStrike={hover}
                  selectedStrike={picked}
                  onHover={setHover}
                  onSelect={toggle}
                />
              </div>
              <div className="xl:col-span-4 flex flex-col gap-3">
                <Figure label={`Net ${LENS_META[lens].label.toLowerCase()}`} value={plain(surface.net)} sub={LENS_META[lens].unit} />
                <Read>{surfaceWords(surface)}</Read>
                <Legend items={[{ ink: SPOT, label: 'spot' }, { ink: FLIP, label: 'where this greek changes sign', dashed: true }]} />
              </div>
            </div>
          ) : (
            <DataState kind="empty" title="No book to read" pad="sm" />
          )}
        </Region>

        <Method>
          <Note term="The scenario">What this desk computes is the book re-priced under one assumption — {MODE_OPTIONS.map(o => o.label).join(' or ')} — never what the market will do. The bright bar is the book now, the dim bar the book then.</Note>
          <Note term="Charm">The delta an option sheds as a day passes. The dealers’ hedges drift with it, so the book moves with no trade at all — and not linearly: most of a day’s charm arrives in its last hours, which is what the clock measures.</Note>
          <Note term="Vanna">The delta an option gains or loses as vol moves one point. {METRICS.vanna.reads}.</Note>
          <Note term="The second order">
            {GREEK_LENSES.map(l => `${LENS_META[l].label} — ${LENS_META[l].unit}`).join(' · ')}. Each is the same question one derivative further out, drawn on the same bars, and each wears
            its unit because they share none.
          </Note>
        </Method>
      </Deck>
    </>
  );
};

export default Drift;
