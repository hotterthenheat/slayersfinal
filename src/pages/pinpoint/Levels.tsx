import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, X } from 'lucide-react';
import { useMarketData } from '../../context/MarketDataContext';
import Simulator from '../../core/simulator';
import { readFlip } from '../../core/walls';
import { STRIKE_WINDOWS, buildExposureProfile, type StrikeWindow } from '../../data/exposure';
import { REGIME_WORDS, buildExpiryFlips, buildFlipGauge } from '../../data/flipGauge';
import { buildGexPercentile, buildNetGexSeries, ordinal } from '../../data/gexSeries';
import { buildPins } from '../../data/pins';
import { buildWallConviction, convictionGrade, convictionWords } from '../../data/wallConviction';
import { buildStability, stabilityWords } from '../../data/stability';
import { HEDGING_ASSUMPTION, buildSpotScenario, flowWords } from '../../data/spotScenario';
import { STICKY_WORDS, buildStickyRead, stickyWords, type StickyMode } from '../../data/stickyBook';
import { fmtDistance, impliedDaySigma, sessionAtr, type DistanceScales } from '../../data/atr';
import { useDistanceUnit } from '../../data/distanceUnits';
import { fmtUsd } from '../../data/gex';
import type { ExposureExpiry } from '../../types/gex';
import DataState from '../../components/ui/DataState';
import ProvenanceChip from '../../components/ui/ProvenanceChip';
import RichRead from '../../components/ui/RichRead';
import Term from '../../components/ui/Term';
import { OiAsOf } from '../../components/ui/AsOf';
import StrikeAttributionPanel from '../../components/gex/StrikeAttributionPanel';
import { heatInk } from '../../components/gex/heatmap';
import { Bench, CONTROL, CONTROL_OFF, CONTROL_OUTLINE, Deck, DeskLoading, Figure, Legend, Method, Note, ROW, Read, Region, Segmented, Select, Surface, TYPE, Tag, Toolbar } from '../../components/pinpoint/Desk';
import StrikeBars, { type BarRow } from '../../components/pinpoint/StrikeBars';
import Spark from '../../components/pinpoint/Spark';
import { useScanSnapshot } from '../../components/pinpoint/useScanSnapshot';
import { CALL_WALL, FLIP, INK, LONG_GAMMA, METRICS, PUT_WALL, SHORT_GAMMA, SPOT, SUPREME, ZONE_WORDS, fmtStrike, gradeInk, regimeInk, signInk, type MetricKey } from '../../components/pinpoint/ink';

/*
==================================================
  SLAYER TERMINAL - LEVELS (pages/pinpoint/Levels.tsx)
  Where the walls and the flip are, and which side of them you are on.
==================================================

  THE QUESTION is in the title. THE ACTION is to pick a strike — on the
  bars or in the list — and read what is there and what built it.

  WHAT MOVED IN THE REDESIGN. Twenty-one buttons in a row above the desk
  were a form, not a toolbar; every one of them changes the picture, so
  they sit on the picture's own heading now, and the row of chrome is
  gone. The picked strike opens directly under the bars rather than
  above them. The levels list is a list of buttons the keyboard can
  reach. The definitions of a grade, a pin and a zone are the desk's
  Method rather than a sentence under every row.
*/

const METRIC_OPTIONS = [
  { value: 'gex', label: 'GEX' },
  { value: 'dex', label: 'DEX' },
  { value: 'vex', label: 'VEX' },
] as const;
const UNIT_OPTIONS = [
  { value: 'usd', label: '$' },
  { value: 'shares', label: 'Shares' },
] as const;
const LENS_OPTIONS = [
  { value: 'ALL', label: 'All' },
  { value: '0DTE', label: '0DTE' },
  { value: '1D', label: '1D' },
  { value: '2D', label: '2D' },
  { value: '5D', label: '5D' },
  { value: '7D', label: '7D' },
  { value: 'OPEX', label: 'OPEX' },
] as const;
const WINDOW_OPTIONS = STRIKE_WINDOWS.map(w => ({ value: String(w), label: `±${w} strikes` }));
const BAR_OPTIONS = [
  { value: 'net', label: 'Net' },
  { value: 'split', label: 'Puts · calls' },
] as const;
const STICKY_OPTIONS = [
  { value: 'strike', label: STICKY_WORDS.strike.label },
  { value: 'delta', label: STICKY_WORDS.delta.label },
] as const;

/** Shares of stock, compact. Dollars per 1% move ÷ spot. */
const fmtShares = (v: number): string => {
  const a = Math.abs(v);
  const s = a >= 1e6 ? `${(a / 1e6).toFixed(1)}M` : a >= 1e3 ? `${(a / 1e3).toFixed(0)}K` : a.toFixed(0);
  return `${v < 0 ? '−' : ''}${s} sh`;
};

const Levels = () => {
  const navigate = useNavigate();
  const { flowTape } = useMarketData();
  const { snapshot, scanAt } = useScanSnapshot();
  const unit = useDistanceUnit();

  const [metric, setMetric] = useState<MetricKey>('gex');
  const [units, setUnits] = useState<'usd' | 'shares'>('usd');
  const [lens, setLens] = useState<ExposureExpiry>('ALL');
  const [half, setHalf] = useState<StrikeWindow>(15);
  const [bars, setBars] = useState<'net' | 'split'>('net');
  const [sticky, setSticky] = useState<StickyMode>('strike');
  const [hoverStrike, setHoverStrike] = useState<number | null>(null);
  const [selectedStrike, setSelectedStrike] = useState<number | null>(null);
  const [scenarioAt, setScenarioAt] = useState<number | null>(null);

  const data = useMemo(() => (snapshot ? buildExposureProfile(snapshot, lens, half) : null), [snapshot, lens, half]);
  const gauge = useMemo(() => (snapshot ? buildFlipGauge(snapshot) : null), [snapshot]);
  const scales = useMemo<DistanceScales>(() => {
    if (!snapshot) return { atr: null, sigma: null };
    return { atr: sessionAtr(Simulator.getCandles(snapshot.ticker) ?? []), sigma: impliedDaySigma(snapshot.spot, Simulator.TICKERS[snapshot.ticker]?.iv ?? 0) };
  }, [snapshot]);
  const conviction = useMemo(() => {
    if (!snapshot) return { call: null, put: null };
    const snaps = Simulator.getGexHistory(snapshot.ticker) ?? [];
    const candles = Simulator.getCandles(snapshot.ticker) ?? [];
    return { call: buildWallConviction(snaps, candles, snapshot.spot, 'call'), put: buildWallConviction(snaps, candles, snapshot.spot, 'put') };
  }, [snapshot]);
  const series = useMemo(() => (snapshot ? buildNetGexSeries(snapshot.ticker) : null), [snapshot]);
  const pctile = useMemo(() => {
    if (!snapshot || !series) return null;
    const last = series.points[series.points.length - 1];
    return last ? buildGexPercentile(snapshot.ticker, last.netGex) : null;
  }, [snapshot, series]);
  const pins = useMemo(() => (snapshot ? buildPins(snapshot.chain, snapshot.spot) : null), [snapshot]);
  const expiryFlips = useMemo(() => (snapshot ? buildExpiryFlips(snapshot) : null), [snapshot]);
  const iv = snapshot ? (Simulator.TICKERS[snapshot.ticker]?.iv ?? 0.2) : 0.2;
  const stability = useMemo(() => (snapshot ? buildStability(snapshot.chain, snapshot.spot, iv) : null), [snapshot, iv]);
  const scenarioTarget = scenarioAt ?? snapshot?.spot ?? 0;
  const scenario = useMemo(() => (snapshot ? buildSpotScenario(snapshot.chain, snapshot.spot, scenarioTarget) : null), [snapshot, scenarioTarget]);
  const stickyRead = useMemo(() => (snapshot ? buildStickyRead(snapshot.chain, snapshot.spot, scenarioTarget, iv) : null), [snapshot, scenarioTarget, iv]);

  if (!snapshot || !data || !gauge) {
    return (
      <DeskLoading>
        <DataState kind="loading" title="Building the book" body="The first tick has not arrived yet." />
      </DeskLoading>
    );
  }

  const spot = snapshot.spot;
  const m = METRICS[metric];
  const fmtV = (v: number) => (units === 'shares' ? fmtShares(v / spot) : fmtUsd(v));
  const dist = (price: number | null) => (price === null ? '' : fmtDistance(price - spot, spot, unit, scales));
  const rows: BarRow[] = data.strikes.map(s => ({ strike: s.strike, net: s[metric].net, put: s[metric].put, call: s[metric].call, oi: s.oi, volume: s.volume }));
  const flip = readFlip(data.strikes, spot, s => s.gex.net);
  const flipOn = flip.strike !== null && flip.kind !== 'no-crossing';
  const selected = selectedStrike != null ? data.strikes.find(s => s.strike === selectedStrike) : undefined;
  const strikeStep = data.strikes.length > 1 ? Math.abs(data.strikes[0].strike - data.strikes[1].strike) : 1;
  const chainLo = Math.min(...snapshot.chain.map(n => n.strike));
  const chainHi = Math.max(...snapshot.chain.map(n => n.strike));
  const netWords = data.netGex > 0 ? 'moves get amplified' : 'dips get absorbed';
  const biasInk = data.bias === 'BULLISH' ? LONG_GAMMA : data.bias === 'BEARISH' ? SHORT_GAMMA : INK.secondary;
  /* Conviction RANKS a level; it does not point anywhere. Brightness. */
  const convInk = (g: 'STRONG' | 'HOLDING' | 'THIN') => gradeInk(g === 'STRONG' ? 0 : g === 'HOLDING' ? 1 : 2);
  const pick = (s: number | null) => s !== null && setSelectedStrike(prev => (prev === s ? null : s));

  const hero = (
    <Region
      title="Where the dealers are positioned"
      actions={
        <>
          <Segmented ariaLabel="Metric" options={METRIC_OPTIONS} value={metric} onChange={setMetric} />
          <Segmented ariaLabel="Bars" options={BAR_OPTIONS} value={bars} onChange={setBars} />
          <Segmented ariaLabel="Expiry lens" options={LENS_OPTIONS} value={lens} onChange={setLens} />
          <Select ariaLabel="Strike window" options={WINDOW_OPTIONS} value={String(half)} onChange={v => setHalf(Number(v) as StrikeWindow)} />
          <Segmented ariaLabel="Units" options={UNIT_OPTIONS} value={units} onChange={setUnits} />
        </>
      }
    >
      <StrikeBars
        rows={rows}
        maxAbs={data.maxAbs[metric]}
        levels={{
          spot,
          flip: flip.strike,
          flipKind: flip.kind,
          callWall: data.levels.callWall,
          putWall: data.levels.putWall,
          supreme: data.levels.supreme,
          ticks: pins ? [...(pins.maxPain !== null ? [{ price: pins.maxPain, label: 'Max pain', ink: INK.secondary }] : []), ...(pins.gammaPin !== null ? [{ price: pins.gammaPin, label: 'Gamma pin', ink: FLIP }] : [])] : [],
        }}
        zones={data.zones}
        split={bars === 'split'}
        fmt={fmtV}
        fmtDist={s => dist(s)}
        hoverStrike={hoverStrike}
        selectedStrike={selectedStrike}
        onHover={setHoverStrike}
        onSelect={pick}
      />
      <div className="pt-3 border-t border-borderSubtle flex flex-col gap-3">
        <div className="flex items-center gap-x-4 gap-y-1 flex-wrap">
          <Legend
            items={[
              { ink: heatInk.pos, label: 'amplifies (dealers short gamma)' },
              { ink: heatInk.neg, label: 'absorbs (dealers long gamma)' },
              { ink: SPOT, label: 'spot' },
              { ink: FLIP, label: flipOn ? 'flip' : 'nearest to zero — not a flip', dashed: !flipOn || flip.kind !== 'sole' },
              { ink: CALL_WALL, label: 'call wall' },
              { ink: PUT_WALL, label: 'put wall' },
              { ink: SUPREME, label: 'supreme — heaviest strike' },
            ]}
          />
          <span className="ml-auto">
            <OiAsOf />
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2">
          <Figure label={<Term k="Net GEX" />} value={fmtV(data.netGex)} sub={netWords} ink={data.netGex > 0 ? SHORT_GAMMA : LONG_GAMMA} />
          <Figure label={<Term k="Net DEX" />} value={fmtV(data.netDex)} sub="directional inventory" />
          <Figure label={<Term k="Net VEX" />} value={fmtV(data.netVex)} sub="per vol point" />
          {pctile ? (
            <Figure label={<Term k="GEX percentile" />} value={ordinal(pctile.pctile)} sub={`of the whole book's last ${pctile.sessions} sessions`} />
          ) : (
            <Figure label={<Term k="GEX percentile" />} value={<span className="text-textMuted">not yet</span>} sub="needs more sessions in the store" />
          )}
        </div>
      </div>
    </Region>
  );

  const rail = (
    <>
      <Region title="The levels that matter">
        <ul className="flex flex-col divide-y divide-borderSubtle/60" data-levels-list>
          <LevelRow ink={CALL_WALL} name={<Term k="Call wall">Call wall</Term>} price={data.levels.callWall} dist={dist(data.levels.callWall)} active={selectedStrike === data.levels.callWall} onClick={() => pick(data.levels.callWall)}>
            {conviction.call && (
              <>
                <Tag ink={convInk(convictionGrade(conviction.call))}>{convictionGrade(conviction.call)}</Tag>
                <span className={`${TYPE.body} text-textMuted`}>{convictionWords(conviction.call)}</span>
              </>
            )}
          </LevelRow>
          <LevelRow ink={PUT_WALL} name={<Term k="Put wall">Put wall</Term>} price={data.levels.putWall} dist={dist(data.levels.putWall)} active={selectedStrike === data.levels.putWall} onClick={() => pick(data.levels.putWall)}>
            {conviction.put && (
              <>
                <Tag ink={convInk(convictionGrade(conviction.put))}>{convictionGrade(conviction.put)}</Tag>
                <span className={`${TYPE.body} text-textMuted`}>{convictionWords(conviction.put)}</span>
              </>
            )}
          </LevelRow>
          <LevelRow ink={FLIP} name={<Term k="Gamma flip">{flipOn ? 'Gamma flip' : 'Nearest to zero'}</Term>} price={flip.strike} dist={dist(flip.strike)} active={selectedStrike === flip.strike} onClick={() => pick(flip.strike)} data-flip-kind={flip.kind}>
            {flip.kind === 'no-crossing' && <Tag ink={FLIP}>not a flip</Tag>}
            {flip.kind === 'nearest-of-several' && <Tag ink={FLIP}>nearest of {flip.crossings.length}</Tag>}
            {flip.kind !== 'sole' && (
              <span className={`${TYPE.body} text-textMuted`}>
                {flip.kind === 'nearest-of-several' ? `also crosses at ${flip.crossings.filter(c => c !== flip.strike).map(fmtStrike).join(', ')}` : 'no regime border on this grid — the line is a place a flip would be'}
              </span>
            )}
          </LevelRow>
          <LevelRow ink={INK.primary} name="Supreme" price={data.levels.supreme} dist={dist(data.levels.supreme)} active={selectedStrike === data.levels.supreme} onClick={() => pick(data.levels.supreme)}>
            <span className={`${TYPE.body} text-textMuted`}>the single heaviest strike on the whole book</span>
          </LevelRow>
          {pins && (
            <>
              <LevelRow ink={INK.secondary} name={<Term k="Max pain">Max pain</Term>} price={pins.maxPain} dist={dist(pins.maxPain)} onClick={() => pick(pins.maxPain)} active={selectedStrike === pins.maxPain} />
              <LevelRow ink={INK.secondary} name={<Term k="Gamma pin">Gamma pin</Term>} price={pins.gammaPin} dist={dist(pins.gammaPin)}>
                <span className={`${TYPE.body} text-textMuted`}>
                  {pins.gap === null ? 'the gamma-weighted centre of the book' : `the gamma-weighted centre — ${Math.abs(pins.gap).toFixed(2)} ${pins.gap > 0 ? 'above' : pins.gap < 0 ? 'below' : 'on'} max pain; a wide gap says the OI is parked where the hedging is not`}
                </span>
              </LevelRow>
            </>
          )}
        </ul>
      </Region>

      <Region title="Which side you are on">
        <Read>
          {gauge.regime === 'LONG'
            ? 'Above the flip the dealers are long gamma: they sell rallies and buy dips to stay hedged, so moves fade and price pins toward the heavy strikes. Range tactics; fade the edges.'
            : gauge.regime === 'SHORT'
              ? 'Below the flip the dealers are short gamma: they sell into weakness and buy into strength to stay hedged, so moves extend. Trend tactics; respect the momentum and the walls.'
              : 'With no sign change on the book there is no regime border — treat the walls as the only structure and read the net total for the lean.'}
        </Read>
        {/* How many times price has crossed the flip today — against the flip
            AS IT STOOD at each bar. Null is a real state and prints as one. */}
        <p className={`${TYPE.body} text-textMuted pt-2`} data-flip-crossings={gauge.crossings ?? 'unknown'}>
          Crossed today <span className="font-mono text-textSecondary tnum">{gauge.crossings === null ? 'too early to say' : `${gauge.crossings}×`}</span>
          {gauge.crossings === null
            ? ` — ${gauge.bars} bars into the session, and two bars can cross at most once.`
            : gauge.crossings === 0
              ? ' — price has stayed on one side of it all session.'
              : ' — against the flip as it stood at each bar, not today’s line laid over the morning.'}
        </p>
      </Region>

      <Region title="The read" note={data.biasNote} actions={<Tag ink={biasInk}>{data.bias}</Tag>}>
        <ul className={`${TYPE.read} text-textPrimary list-disc pl-4 marker:text-textMuted flex flex-col gap-2`} data-read-list>
          {data.insights.map((line, i) => (
            <li key={i} className="tnum">
              <RichRead text={line} />
            </li>
          ))}
        </ul>
      </Region>
    </>
  );

  return (
    <>
      <Deck hero={hero} rail={rail}>
        {/* A picked strike — its numbers, and the trades behind it. Directly
            under the bars it was picked from. */}
        {selected && (
          <Surface
            title={`${data.ticker} ${fmtStrike(selected.strike)}`}
            note={`${dist(selected.strike)} — puts, calls and net on each greek, and the prints that built it`}
            actions={
              <>
                <button onClick={() => navigate('/pulse', { state: { focusPrice: selected.strike } })} className={`${CONTROL} ${CONTROL_OFF} ${CONTROL_OUTLINE}`}>
                  View on chart <ArrowUpRight className="w-3 h-3" aria-hidden />
                </button>
                <button onClick={() => setSelectedStrike(null)} aria-label="Clear selection" className={`${CONTROL} ${CONTROL_OFF} px-1`}>
                  <X className="w-3 h-3" aria-hidden />
                </button>
              </>
            }
          >
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-x-4 gap-y-2">
              {(['gex', 'dex', 'vex', 'vanna', 'charm'] as const).map(k => (
                <Figure
                  key={k}
                  label={METRICS[k].label}
                  value={fmtV(selected[k].net)}
                  sub={
                    <span className="tnum">
                      puts <span style={{ color: PUT_WALL }}>{fmtV(selected[k].put)}</span> · calls <span style={{ color: CALL_WALL }}>{fmtV(selected[k].call)}</span>
                    </span>
                  }
                />
              ))}
            </div>
            <div className="mt-3 border-t border-borderSubtle/60 pt-3">
              <StrikeAttributionPanel prints={flowTape} strike={selected.strike} step={strikeStep} />
            </div>
          </Surface>
        )}

        <Bench cols={3}>
          <Region title="Today’s net gamma">
            {series && series.points.length > 1 ? (
              <>
                <Spark points={series.points.map(p => ({ x: p.time, y: p.netGex }))} ink={series.points[series.points.length - 1].netGex > 0 ? SHORT_GAMMA : LONG_GAMMA} marks={series.zeroCrossings} markInk={FLIP} height={84} ariaLabel="Net gamma through the session" />
                <div className="pt-2 flex items-end gap-4 flex-wrap">
                  <Figure label="Now" value={fmtV(series.points[series.points.length - 1].netGex)} ink={series.points[series.points.length - 1].netGex > 0 ? SHORT_GAMMA : LONG_GAMMA} />
                  <Figure label="Session range" value={`${fmtV(series.min)} … ${fmtV(series.max)}`} size="sm" />
                  <Figure label="Crossed zero" value={`${series.zeroCrossings.length}×`} sub="the whole book changing sign — not spot vs the flip" size="sm" ink={FLIP} />
                </div>
              </>
            ) : (
              <DataState kind="empty" title="No series yet" body="The store needs a few bars before there is a line to draw." pad="sm" />
            )}
          </Region>

          <Region title="The flip, by expiry" note="today’s artifact against the structure underneath it">
            {expiryFlips && (
              <>
                <div className="grid grid-cols-3 gap-x-4">
                  {(
                    [
                      { label: '0DTE', v: expiryFlips.d0, hint: 'gone at the bell' },
                      { label: 'Weekly', v: expiryFlips.weekly, hint: 'the carried trade' },
                      { label: 'Whole book', v: expiryFlips.book, hint: 'the structure' },
                    ] as const
                  ).map(r => (
                    <Figure key={r.label} label={r.label} value={r.v === null ? <span className="text-textMuted">no flip</span> : fmtStrike(r.v)} sub={r.hint} ink={FLIP} />
                  ))}
                </div>
                <p className={`${TYPE.body} text-textSecondary pt-3 tnum`}>
                  {expiryFlips.spread === null
                    ? 'No spread — at least one lens holds a single sign across its window.'
                    : expiryFlips.spread === 0
                      ? 'The lenses agree, and on this feed they must — see Method.'
                      : `Spread ${Math.abs(expiryFlips.spread).toFixed(2)}: the structural flip sits ${expiryFlips.spread > 0 ? 'above' : 'below'} today’s — what pins this morning is not what governs after the bell.`}
                </p>
              </>
            )}
          </Region>

          <Region title="Do the levels survive a vol move?" actions={<span className={`${TYPE.label} text-textMuted`}>±2 vol points</span>}>
            {stability ? (
              <>
                <table className="w-full font-mono text-body tnum" data-stability>
                  <thead>
                    <tr className={`${TYPE.label} text-textMuted`}>
                      <th scope="col" className="text-left font-normal pb-1">Level</th>
                      <th scope="col" className="text-right font-normal pb-1">Vol −2</th>
                      <th scope="col" className="text-right font-semibold pb-1 text-textSecondary">Now</th>
                      <th scope="col" className="text-right font-normal pb-1">Vol +2</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(
                      [
                        { label: 'Call wall', ink: CALL_WALL, k: 'callWall' },
                        { label: 'Put wall', ink: PUT_WALL, k: 'putWall' },
                        { label: 'Flip', ink: FLIP, k: 'flip' },
                      ] as const
                    ).map(r => {
                      const base = stability.base[r.k];
                      const cell = (v: number | null) => (v === null ? '—' : fmtStrike(v));
                      const moved = (v: number | null) => v !== null && base !== null && v !== base;
                      return (
                        <tr key={r.k} className="border-t border-borderSubtle/50">
                          <td className="py-1 font-semibold" style={{ color: r.ink }}>
                            {r.label}
                          </td>
                          <td className={`py-1 text-right ${moved(stability.down[r.k]) ? 'text-warn font-semibold' : 'text-textSecondary'}`}>{cell(stability.down[r.k])}</td>
                          <td className="py-1 text-right text-textPrimary font-semibold">{cell(base)}</td>
                          <td className={`py-1 text-right ${moved(stability.up[r.k]) ? 'text-warn font-semibold' : 'text-textSecondary'}`}>{cell(stability.up[r.k])}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <Read className="pt-3">{stabilityWords(stability)}</Read>
              </>
            ) : (
              <DataState kind="empty" title="Nothing to bump" pad="sm" />
            )}
          </Region>
        </Bench>

        <Bench cols={2}>
          <Region title="If price were somewhere else" note="drag spot — the levels re-pick, the flow the move forces, and what each vol assumption does to the flip">
            <div className="flex items-center gap-3">
              <span className={`${TYPE.label} text-textMuted shrink-0`}>Spot at</span>
              <input type="range" min={chainLo} max={chainHi} step={strikeStep / 2} value={scenarioTarget} onChange={e => setScenarioAt(Number(e.target.value))} aria-label="Scenario spot" className="flex-1 accent-white" />
              <span className={`${TYPE.lead} text-textPrimary w-20 text-right`}>{fmtStrike(Number(scenarioTarget.toFixed(2)))}</span>
              <button onClick={() => setScenarioAt(null)} className={`${CONTROL} ${CONTROL_OFF}`} disabled={scenarioAt === null}>
                reset
              </button>
            </div>
            {scenario && (
              <div className="pt-3 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2">
                <Figure label="Regime there" value={REGIME_WORDS[scenario.regime].label} ink={regimeInk(scenario.regime)} size="sm" />
                <Figure label="Call wall" value={scenario.callWall === null ? '—' : fmtStrike(scenario.callWall)} ink={CALL_WALL} size="sm" />
                <Figure label="Put wall" value={scenario.putWall === null ? '—' : fmtStrike(scenario.putWall)} ink={PUT_WALL} size="sm" />
                <Figure label="Hedging flow forced" value={fmtUsd(scenario.hedgingFlow)} ink={signInk(scenario.hedgingFlow)} size="sm" sub={scenario.hedgingFlow > 0 ? 'dealers buy' : scenario.hedgingFlow < 0 ? 'dealers sell' : 'nothing forced'} />
              </div>
            )}
            {scenario && <p className={`${TYPE.body} text-textSecondary pt-2`}>{flowWords(scenario)}</p>}

            {stickyRead && (
              <div className="mt-3 border-t border-borderSubtle/60 pt-3" data-sticky-read data-sticky={sticky} data-sticky-agree={stickyRead.agree}>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className={`${TYPE.label} text-textMuted`}>What vol does when spot moves</span>
                  <Segmented ariaLabel="Vol assumption" options={STICKY_OPTIONS} value={sticky} onChange={setSticky} />
                </div>
                <p className={`${TYPE.body} text-textSecondary pt-2`}>{STICKY_WORDS[sticky].note}</p>
                <div className="pt-2 grid grid-cols-2 gap-x-4">
                  <Figure label={`Flip · ${STICKY_WORDS.strike.label}`} value={stickyRead.strike.flip === null ? 'no flip' : fmtStrike(stickyRead.strike.flip)} ink={sticky === 'strike' ? FLIP : INK.secondary} sub={sticky === 'strike' ? 'the assumption you chose' : 'the other assumption'} />
                  <Figure label={`Flip · ${STICKY_WORDS.delta.label}`} value={stickyRead.delta.flip === null ? 'no flip' : fmtStrike(stickyRead.delta.flip)} ink={sticky === 'delta' ? FLIP : INK.secondary} sub={sticky === 'delta' ? 'the assumption you chose' : 'the other assumption'} />
                </div>
                <p className={`${TYPE.body} text-textPrimary pt-2`}>{stickyWords(stickyRead)}</p>
              </div>
            )}
            <p className={`${TYPE.body} text-textMuted pt-2`}>{HEDGING_ASSUMPTION}</p>
          </Region>

          <Region title="The zones">
            {data.zones.length === 0 ? (
              <DataState kind="empty" title="No zones on this window" body="Widen the strike window — the bands live where the shelves are." pad="sm" />
            ) : (
              <ul className="flex flex-col divide-y divide-borderSubtle/60" data-zones-list>
                {data.zones.map((z, i) => {
                  const w = ZONE_WORDS[z.kind];
                  return (
                    <li key={i} className="py-2">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className={`${TYPE.label} font-bold`} style={{ color: w.ink }}>
                          {w.label}
                        </span>
                        <span className={`${TYPE.num} text-textPrimary`}>
                          {fmtStrike(z.to)} – {fmtStrike(z.from)}
                        </span>
                        <span className={`${TYPE.label} tracking-normal text-textMuted tnum`}>
                          {dist(z.to)} … {dist(z.from)}
                        </span>
                      </div>
                      <p className={`${TYPE.body} text-textSecondary`}>{z.label && z.label.toLowerCase() !== w.label.toLowerCase() ? z.label : w.reads}</p>
                    </li>
                  );
                })}
              </ul>
            )}
          </Region>
        </Bench>

        <Toolbar>
          <ProvenanceChip sources={['chain', 'exposure', 'carry']} note="The stability read re-prices the book at a bumped vol through the desk's own rate and yield, so this desk stands on the carry seam as well as the chain." />
          <span className={`${TYPE.label} text-textMuted tnum ml-auto`}>scan {scanAt} · 10s</span>
        </Toolbar>

        <Method>
          <Note term="The walls">The heaviest call strike above spot and the heaviest put strike below it, on the whole book. A wall is graded STRONG only with a clear margin over its runner-up and an unbroken record today; HOLDING has one of the two; THIN has neither.</Note>
          <Note term="The flip">The strike where net gamma changes sign nearest spot. A book that never changes sign has no flip — the line drawn is where one would be, and the list says so.</Note>
          <Note term="Supreme">The single heaviest strike on the whole book, whichever side of spot it sits.</Note>
          <Note term="The pins">Max pain is the expiry price that minimises the open interest’s payout; the gamma pin is the gamma-weighted centre of the book. A wide gap between them says the OI is parked where the hedging is not.</Note>
          <Note term="The flip by expiry">On this feed the lenses must agree: the expiry view scales the whole book by one factor, which cannot move where it changes sign. A chain with real per-expiry open interest separates them.</Note>
          <Note term="The zones">{Object.values(ZONE_WORDS).map(w => `${w.label} — ${w.reads}`).join('. ')}.</Note>
        </Method>
      </Deck>
    </>
  );
};

/** One level in the rail: a button the keyboard can reach. Ink, name, price, distance, and what qualifies it. */
const LevelRow = ({
  ink,
  name,
  price,
  dist,
  active = false,
  onClick,
  children,
  ...rest
}: {
  ink: string;
  name: React.ReactNode;
  price: number | null;
  dist: string;
  active?: boolean;
  onClick?: () => void;
  children?: React.ReactNode;
  'data-flip-kind'?: string;
}) => (
  <li data-level-row {...rest}>
    <button
      type="button"
      onClick={price !== null ? onClick : undefined}
      disabled={price === null || !onClick}
      aria-current={active || undefined}
      className={`${ROW} px-2 -mx-2 py-2 flex flex-col gap-1 disabled:cursor-default disabled:hover:bg-transparent ${active ? 'bg-select/[0.06]' : ''}`}
    >
      <span className="flex items-baseline gap-2 flex-wrap">
        <span className={`${TYPE.label} font-bold`} style={{ color: ink }}>
          {name}
        </span>
        <span className={`${TYPE.lead} text-textPrimary`}>{price === null ? '—' : fmtStrike(price)}</span>
        <span className={`${TYPE.label} tracking-normal text-textSecondary tnum`}>{dist}</span>
      </span>
      {children && <span className="flex items-center gap-2 flex-wrap">{children}</span>}
    </button>
  </li>
);

export default Levels;
