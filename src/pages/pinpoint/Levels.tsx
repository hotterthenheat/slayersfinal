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
import SegmentedControl from '../../components/ui/SegmentedControl';
import ProvenanceChip from '../../components/ui/ProvenanceChip';
import RichRead from '../../components/ui/RichRead';
import Term from '../../components/ui/Term';
import { OiAsOf } from '../../components/ui/AsOf';
import StrikeAttributionPanel from '../../components/gex/StrikeAttributionPanel';
import { heatInk } from '../../components/gex/heatmap';
import { Bench, Deck, Figure, Legend, Read, Section, TYPE, Tag } from '../../components/pinpoint/Desk';
import StrikeBars, { type BarRow } from '../../components/pinpoint/StrikeBars';
import Spark from '../../components/pinpoint/Spark';
import { useScanSnapshot } from '../../components/pinpoint/useScanSnapshot';
import { CALL_WALL, FLIP, INK, LONG_GAMMA, METRICS, PUT_WALL, SHORT_GAMMA, SPOT, SUPREME, ZONE_WORDS, fmtStrike, gradeInk, regimeInk, signInk, type MetricKey } from '../../components/pinpoint/ink';

/*
==================================================
  SLAYER TERMINAL - LEVELS (pages/pinpoint/Levels.tsx)
  The desk Pinpoint opens on. Rebuilt from zero, 2026-09-06.
==================================================

  THE QUESTION: where are the walls and the flip, and which side of them
  am I on. Everything on this desk serves that, in the order a trader
  asks it — the picture first, the levels beside it with their distances,
  then the reads that qualify the levels (how sure the walls are, whether
  they survive a vol move, what the book looks like if price were
  elsewhere), then the zones.

  WHAT WENT, AND WHY. The old desk stacked a canvas map, a matrix of
  fifteen columns, eight stat boxes, five panels and a narrative card, and
  the reader had to know which of them mattered. The matrix is gone —
  the bars, a hover and a click carry every number it printed. The
  narrative is a rail card titled "The read". The levels are rows with
  their distances in the reader's ruler and a grade beside each wall,
  because "call wall 505" and "call wall 505, STRONG, 2.4× its runner-up
  and unbroken today" are different facts.

  THE ENGINES ARE THE SAME. data/exposure, core/walls, wallConviction,
  flipGauge, gexSeries, pins, stability, spotScenario — nothing here is
  computed a second way. What is new is data/stickyBook: the sticky-strike
  / sticky-delta selector the checklist asked for, stated on the surface
  with both flips side by side.
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
  { value: '0DTE', label: '0DTE' },
  { value: '1D', label: '1D' },
  { value: '2D', label: '2D' },
  { value: '5D', label: '5D' },
  { value: '7D', label: '7D' },
  { value: 'OPEX', label: 'OPEX' },
  { value: 'ALL', label: 'All' },
] as const;
const WINDOW_OPTIONS = STRIKE_WINDOWS.map(w => ({ value: String(w), label: `±${w}` }));
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
    return {
      atr: sessionAtr(Simulator.getCandles(snapshot.ticker) ?? []),
      sigma: impliedDaySigma(snapshot.spot, Simulator.TICKERS[snapshot.ticker]?.iv ?? 0),
    };
  }, [snapshot]);
  const conviction = useMemo(() => {
    if (!snapshot) return { call: null, put: null };
    const snaps = Simulator.getGexHistory(snapshot.ticker) ?? [];
    const candles = Simulator.getCandles(snapshot.ticker) ?? [];
    return {
      call: buildWallConviction(snaps, candles, snapshot.spot, 'call'),
      put: buildWallConviction(snaps, candles, snapshot.spot, 'put'),
    };
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
      <Section title="Levels">
        <DataState kind="loading" title="Building the book" body="The first tick has not arrived yet." />
      </Section>
    );
  }

  const spot = snapshot.spot;
  const m = METRICS[metric];
  const fmtV = (v: number) => (units === 'shares' ? fmtShares(v / spot) : fmtUsd(v));
  const dist = (price: number | null) => (price === null ? '' : fmtDistance(price - spot, spot, unit, scales));
  const rows: BarRow[] = data.strikes.map(s => ({ strike: s.strike, net: s[metric].net, put: s[metric].put, call: s[metric].call, oi: s.oi, volume: s.volume }));
  /* The flip of the DRAWN book, with its kind — so the line on the bars and
     the word beside it are about the same rows. */
  const flip = readFlip(data.strikes, spot, s => s.gex.net);
  const flipOn = flip.strike !== null && flip.kind !== 'no-crossing';
  const rInk = regimeInk(gauge.regime);
  const regimeWords = gauge.regime ? REGIME_WORDS[gauge.regime] : null;
  const selected = selectedStrike != null ? data.strikes.find(s => s.strike === selectedStrike) : undefined;
  const strikeStep = data.strikes.length > 1 ? Math.abs(data.strikes[0].strike - data.strikes[1].strike) : 1;
  const chainLo = Math.min(...snapshot.chain.map(n => n.strike));
  const chainHi = Math.max(...snapshot.chain.map(n => n.strike));
  const netWords = data.netGex > 0 ? 'moves get amplified' : 'dips get absorbed';
  const biasInk = data.bias === 'BULLISH' ? LONG_GAMMA : data.bias === 'BEARISH' ? SHORT_GAMMA : INK.secondary;
  /* Conviction RANKS a level; it does not point anywhere. Brightness. */
  const convInk = (g: 'STRONG' | 'HOLDING' | 'THIN') => gradeInk(g === 'STRONG' ? 0 : g === 'HOLDING' ? 1 : 2);

  const hero = (
    <Section
      title="Where the dealers are positioned"
      note={<><span className="text-textSecondary">{m.name}</span> by strike — right of centre the book amplifies a move, left of centre it absorbs one</>}
      actions={<OiAsOf />}
      className="h-full"
      bodyClassName="flex flex-col"
    >
      <div className="px-2 pt-1 pb-2">
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
          onSelect={s => setSelectedStrike(prev => (prev === s ? null : s))}
        />
      </div>
      <div className="mt-auto border-t border-borderSubtle px-3.5 py-2.5 flex flex-col gap-2">
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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2">
          <Figure label={<Term k="Net GEX" />} value={fmtV(data.netGex)} sub={netWords} ink={data.netGex > 0 ? SHORT_GAMMA : LONG_GAMMA} />
          <Figure label={<Term k="Net DEX" />} value={fmtV(data.netDex)} sub="directional inventory" />
          <Figure label={<Term k="Net VEX" />} value={fmtV(data.netVex)} sub="per vol point" />
          {pctile ? (
            <Figure label={<Term k="GEX percentile" />} value={ordinal(pctile.pctile)} sub={`of the whole book's last ${pctile.sessions} sessions`} />
          ) : (
            <Figure label={<Term k="GEX percentile" />} value={<span className="text-textMuted text-[13px]">not yet</span>} sub="needs more sessions in the store" />
          )}
        </div>
      </div>
    </Section>
  );

  const rail = (
    <>
      <Section title="The levels that matter">
        <ul className="flex flex-col divide-y divide-borderSubtle/60" data-levels-list>
          <LevelRow ink={CALL_WALL} name={<Term k="Call wall">Call wall</Term>} price={data.levels.callWall} dist={dist(data.levels.callWall)} active={selectedStrike === data.levels.callWall} onClick={() => setSelectedStrike(data.levels.callWall)}>
            {conviction.call && (
              <>
                <Tag ink={convInk(convictionGrade(conviction.call))} title="STRONG needs both a clear margin over the runner-up and an unbroken record today">
                  {convictionGrade(conviction.call)}
                </Tag>
                <span className="text-[10px] text-textMuted leading-snug">{convictionWords(conviction.call)}</span>
              </>
            )}
          </LevelRow>
          <LevelRow ink={PUT_WALL} name={<Term k="Put wall">Put wall</Term>} price={data.levels.putWall} dist={dist(data.levels.putWall)} active={selectedStrike === data.levels.putWall} onClick={() => setSelectedStrike(data.levels.putWall)}>
            {conviction.put && (
              <>
                <Tag ink={convInk(convictionGrade(conviction.put))} title="STRONG needs both a clear margin over the runner-up and an unbroken record today">
                  {convictionGrade(conviction.put)}
                </Tag>
                <span className="text-[10px] text-textMuted leading-snug">{convictionWords(conviction.put)}</span>
              </>
            )}
          </LevelRow>
          <LevelRow ink={FLIP} name={<Term k="Gamma flip">{flipOn ? 'Gamma flip' : 'Nearest to zero'}</Term>} price={flip.strike} dist={dist(flip.strike)} active={selectedStrike === flip.strike} onClick={() => flip.strike !== null && setSelectedStrike(flip.strike)} data-flip-kind={flip.kind}>
            {flip.kind === 'no-crossing' && (
              <Tag ink={FLIP} title="The book never changes sign on this grid — this is where it comes closest to zero, not a flip">
                not a flip
              </Tag>
            )}
            {flip.kind === 'nearest-of-several' && (
              <Tag ink={FLIP} title={`The book changes sign ${flip.crossings.length} times on this grid; this is the crossing nearest spot`}>
                nearest of {flip.crossings.length}
              </Tag>
            )}
            {/* Only when the flip is NOT the plain single crossing. "The one
                place the book changes sign" is what the Term on the name says
                when a reader clicks it — printing it under every row made the
                list a glossary that never stopped talking. */}
            {flip.kind !== 'sole' && (
              <span className="text-[10px] text-textMuted leading-snug">
                {flip.kind === 'nearest-of-several' ? `also crosses at ${flip.crossings.filter(c => c !== flip.strike).map(fmtStrike).join(', ')}` : 'no regime border on this grid — the line is a place a flip would be'}
              </span>
            )}
          </LevelRow>
          <LevelRow ink={INK.primary} name="Supreme" price={data.levels.supreme} dist={dist(data.levels.supreme)} active={selectedStrike === data.levels.supreme} onClick={() => setSelectedStrike(data.levels.supreme)}>
            <span className="text-[10px] text-textMuted leading-snug">the single heaviest strike on the whole book</span>
          </LevelRow>
          {pins && (
            <>
              <LevelRow ink={INK.secondary} name={<Term k="Max pain">Max pain</Term>} price={pins.maxPain} dist={dist(pins.maxPain)} onClick={() => pins.maxPain !== null && setSelectedStrike(pins.maxPain)} active={selectedStrike === pins.maxPain} />
              <LevelRow ink={INK.secondary} name={<Term k="Gamma pin">Gamma pin</Term>} price={pins.gammaPin} dist={dist(pins.gammaPin)}>
                <span className="text-[10px] text-textMuted leading-snug">
                  {pins.gap === null ? 'the gamma-weighted centre of the book' : `the gamma-weighted centre — ${Math.abs(pins.gap).toFixed(2)} ${pins.gap > 0 ? 'above' : pins.gap < 0 ? 'below' : 'on'} max pain; a wide gap says the OI is parked where the hedging is not`}
                </span>
              </LevelRow>
            </>
          )}
        </ul>
      </Section>

      {/* THIS SECTION USED TO REPRINT THE MASTHEAD. It carried the regime word
          at the same size, the distance to the flip and the crossing count —
          all three already standing 500px away at the top of every desk in the
          section. What only this section has is the SO-WHAT, so that is all it
          keeps. */}
      <Section title="Which side you are on" className="relative">
        <Read>
          {gauge.regime === 'LONG'
            ? 'Above the flip the dealers are long gamma: they sell rallies and buy dips to stay hedged, so moves fade and price pins toward the heavy strikes. Range tactics; fade the edges.'
            : gauge.regime === 'SHORT'
              ? 'Below the flip the dealers are short gamma: they sell into weakness and buy into strength to stay hedged, so moves extend. Trend tactics; respect the momentum and the walls.'
              : 'With no sign change on the book there is no regime border — treat the walls as the only structure and read the net total for the lean.'}
        </Read>
      </Section>

      <Section title="The read" note={data.biasNote} actions={<Tag ink={biasInk}>{data.bias}</Tag>}>
        <ul className="flex flex-col gap-2" data-read-list>
          {data.insights.map((line, i) => (
            <li key={i} className="flex items-start gap-2 text-[13px] text-textPrimary leading-relaxed">
              <span className="mt-[7px] inline-block w-1 h-1 rounded-full shrink-0" style={{ background: biasInk }} />
              <span className="tnum">
                <RichRead text={line} />
              </span>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );

  return (
    <>
      {/* controls — every choice that changes the picture, on one line */}
      {/* TWENTY-ONE BUTTONS IN ONE ROW, in three jobs. They used to run in an
          undifferentiated line and a reader had to read every label to find
          the one they wanted. A hairline between the groups is enough: WHAT is
          drawn, WHICH rows are in it, HOW the bars are split. */}
      <div className="flex items-center gap-2.5 flex-wrap" data-levels-controls>
        <SegmentedControl ariaLabel="Metric" options={METRIC_OPTIONS} value={metric} onChange={v => setMetric(v)} />
        <SegmentedControl ariaLabel="Units" options={UNIT_OPTIONS} value={units} onChange={v => setUnits(v)} />
        <span className="h-4 w-px bg-borderSubtle" aria-hidden />
        <SegmentedControl ariaLabel="Expiry lens" options={LENS_OPTIONS} value={lens} onChange={v => setLens(v)} />
        <SegmentedControl ariaLabel="Strike window" options={WINDOW_OPTIONS} value={String(half)} onChange={v => setHalf(Number(v) as StrikeWindow)} />
        <span className="h-4 w-px bg-borderSubtle" aria-hidden />
        <SegmentedControl ariaLabel="Bars" options={BAR_OPTIONS} value={bars} onChange={v => setBars(v)} />
        <ProvenanceChip sources={['chain', 'exposure', 'carry']} className="ml-auto" note="The stability read re-prices the book at a bumped vol through the desk's own rate and yield, so this desk stands on the carry seam as well as the chain." />
        <span className="font-mono text-[10px] text-textMuted uppercase tracking-widest tnum">scan {scanAt} · 10s</span>
      </div>

      {/* a picked strike — its numbers, and the trades behind it */}
      {selected && (
        <Section
          title={
            <span className="inline-flex items-center gap-2">
              {data.ticker} {fmtStrike(selected.strike)}
              <span className="font-mono text-[10px] font-normal text-textMuted">{dist(selected.strike)}</span>
            </span>
          }
          note="the strike you picked — puts, calls and net on each greek, and the prints that built it"
          actions={
            <>
              <button
                onClick={() => navigate('/pulse', { state: { focusPrice: selected.strike } })}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-borderSubtle bg-white/[0.03] hover:bg-white/[0.06] font-mono text-[10px] font-semibold uppercase tracking-wider text-textPrimary transition-colors"
              >
                View on chart <ArrowUpRight className="w-3 h-3" />
              </button>
              <button onClick={() => setSelectedStrike(null)} aria-label="Clear selection" className="text-textMuted hover:text-textPrimary transition-colors">
                <X className="w-3.5 h-3.5" />
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
          <div className="mt-3 border-t border-borderSubtle/60 pt-2.5">
            <StrikeAttributionPanel prints={flowTape} strike={selected.strike} step={strikeStep} />
          </div>
        </Section>
      )}

      <Deck hero={hero} rail={rail}>
        <Bench cols={3}>
          <Section title="Today’s net gamma">
            {series && series.points.length > 1 ? (
              <>
                <Spark points={series.points.map(p => ({ x: p.time, y: p.netGex }))} ink={series.points[series.points.length - 1].netGex > 0 ? SHORT_GAMMA : LONG_GAMMA} marks={series.zeroCrossings} markInk={FLIP} height={84} ariaLabel="Net gamma through the session" />
                <div className="mt-2 flex items-end gap-4 flex-wrap">
                  <Figure label="Now" value={fmtV(series.points[series.points.length - 1].netGex)} ink={series.points[series.points.length - 1].netGex > 0 ? SHORT_GAMMA : LONG_GAMMA} />
                  <Figure label="Session range" value={`${fmtV(series.min)} … ${fmtV(series.max)}`} size="sm" />
                  <Figure label="Crossed zero" value={`${series.zeroCrossings.length}×`} sub="the whole book changing sign — not spot vs the flip" size="sm" ink={FLIP} />
                </div>
              </>
            ) : (
              <DataState kind="empty" title="No series yet" body="The store needs a few bars before there is a line to draw." pad="sm" />
            )}
          </Section>

          <Section title="The flip, by expiry" note="today’s artifact against the structure underneath it">
            {expiryFlips ? (
              <>
                <div className="grid grid-cols-3 gap-x-4">
                  {(
                    [
                      { label: '0DTE', v: expiryFlips.d0, hint: 'gone at the bell' },
                      { label: 'Weekly', v: expiryFlips.weekly, hint: 'the carried trade' },
                      { label: 'Whole book', v: expiryFlips.book, hint: 'the structure' },
                    ] as const
                  ).map(r => (
                    <Figure key={r.label} label={r.label} value={r.v === null ? <span className="text-textMuted text-[13px]">no flip</span> : fmtStrike(r.v)} sub={r.hint} ink={FLIP} />
                  ))}
                </div>
                <p className="mt-3 text-[11px] text-textSecondary leading-relaxed tnum">
                  {expiryFlips.spread === null
                    ? 'No spread — at least one lens holds a single sign across its window.'
                    : expiryFlips.spread === 0
                      ? 'The lenses agree, and on this feed they must: the expiry view scales the whole book by one factor, which cannot move where it changes sign. A chain with real per-expiry open interest separates them.'
                      : `Spread ${Math.abs(expiryFlips.spread).toFixed(2)}: the structural flip sits ${expiryFlips.spread > 0 ? 'above' : 'below'} today’s — what pins this morning is not what governs after the bell.`}
                </p>
              </>
            ) : null}
          </Section>

          <Section title="Do the levels survive a vol move?" actions={<span className={`${TYPE.label} text-textMuted`}>±2 vol points</span>}>
            {stability ? (
              <>
                <table className="w-full font-mono text-[11px] tnum" data-stability>
                  <thead>
                    <tr className="text-[10px] uppercase tracking-widest text-textMuted">
                      <th className="text-left font-normal pb-1">Level</th>
                      <th className="text-right font-normal pb-1">Vol −2</th>
                      <th className="text-right font-semibold pb-1 text-textSecondary">Now</th>
                      <th className="text-right font-normal pb-1">Vol +2</th>
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
                <Read className="mt-3">
                  {stabilityWords(stability)}
                </Read>
              </>
            ) : (
              <DataState kind="empty" title="Nothing to bump" pad="sm" />
            )}
          </Section>
        </Bench>

        <Bench cols={2}>
          <Section title="If price were somewhere else" note="drag spot — the levels re-pick, the flow the move forces, and what each vol assumption does to the flip">
            <div className="flex items-center gap-3">
              <span className="font-mono text-[10px] uppercase tracking-widest text-textMuted shrink-0">Spot at</span>
              <input
                type="range"
                min={chainLo}
                max={chainHi}
                step={strikeStep / 2}
                value={scenarioTarget}
                onChange={e => setScenarioAt(Number(e.target.value))}
                aria-label="Scenario spot"
                className="flex-1 accent-white"
              />
              <span className="font-mono text-[13px] font-bold tnum text-textPrimary w-20 text-right">{fmtStrike(Number(scenarioTarget.toFixed(2)))}</span>
              <button onClick={() => setScenarioAt(null)} className="font-mono text-[10px] uppercase tracking-wider text-textMuted hover:text-textPrimary transition-colors" disabled={scenarioAt === null}>
                reset
              </button>
            </div>
            {scenario && (
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2">
                <Figure label="Regime there" value={REGIME_WORDS[scenario.regime].label} ink={regimeInk(scenario.regime)} size="sm" />
                <Figure label="Call wall" value={scenario.callWall === null ? '—' : fmtStrike(scenario.callWall)} ink={CALL_WALL} size="sm" />
                <Figure label="Put wall" value={scenario.putWall === null ? '—' : fmtStrike(scenario.putWall)} ink={PUT_WALL} size="sm" />
                <Figure label="Hedging flow forced" value={fmtUsd(scenario.hedgingFlow)} ink={signInk(scenario.hedgingFlow)} size="sm" sub={scenario.hedgingFlow > 0 ? 'dealers buy' : scenario.hedgingFlow < 0 ? 'dealers sell' : 'nothing forced'} />
              </div>
            )}
            {scenario && <p className="mt-2 text-[11px] text-textSecondary leading-relaxed">{flowWords(scenario)}</p>}

            {/* the sticky selector — stated on the surface, both flips shown */}
            {stickyRead && (
              <div className="mt-3 border-t border-borderSubtle/60 pt-3" data-sticky-read data-sticky={sticky} data-sticky-agree={stickyRead.agree}>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-textMuted">What vol does when spot moves</span>
                  <SegmentedControl ariaLabel="Vol assumption" options={STICKY_OPTIONS} value={sticky} onChange={v => setSticky(v)} />
                </div>
                <p className="mt-1.5 text-[11px] text-textSecondary leading-snug">{STICKY_WORDS[sticky].note}</p>
                <div className="mt-2 grid grid-cols-2 gap-x-4">
                  <Figure
                    label={`Flip · ${STICKY_WORDS.strike.label}`}
                    value={stickyRead.strike.flip === null ? 'no flip' : fmtStrike(stickyRead.strike.flip)}
                    ink={sticky === 'strike' ? FLIP : INK.secondary}
                    sub={sticky === 'strike' ? 'the assumption you chose' : 'the other assumption'}
                  />
                  <Figure
                    label={`Flip · ${STICKY_WORDS.delta.label}`}
                    value={stickyRead.delta.flip === null ? 'no flip' : fmtStrike(stickyRead.delta.flip)}
                    ink={sticky === 'delta' ? FLIP : INK.secondary}
                    sub={sticky === 'delta' ? 'the assumption you chose' : 'the other assumption'}
                  />
                </div>
                <p className="mt-2 text-[11px] text-textPrimary leading-relaxed">{stickyWords(stickyRead)}</p>
              </div>
            )}
            <p className="mt-2 text-[10px] text-textMuted leading-relaxed">{HEDGING_ASSUMPTION}</p>
          </Section>

          <Section title="The zones">
            {data.zones.length === 0 ? (
              <DataState kind="empty" title="No zones on this window" body="Widen the strike window — the bands live where the shelves are." pad="sm" />
            ) : (
              <ul className="flex flex-col divide-y divide-borderSubtle/60" data-zones-list>
                {data.zones.map((z, i) => {
                  const w = ZONE_WORDS[z.kind];
                  return (
                    <li key={i} className="py-2 flex items-start">
                      {/* No swatch. The zone's NAME is already in the zone's ink
                          on the next line — the square said it a second time. */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className="font-mono text-[11px] font-bold uppercase tracking-wider" style={{ color: w.ink }}>
                            {w.label}
                          </span>
                          <span className="font-mono text-[13px] font-semibold tnum text-textPrimary">
                            {fmtStrike(z.to)} – {fmtStrike(z.from)}
                          </span>
                          <span className="font-mono text-[10px] text-textMuted tnum">
                            {dist(z.to)} … {dist(z.from)}
                          </span>
                        </div>
                        {/* The engine's own label for the band is usually the
                            band's name, which is the word two pixels above it.
                            Print it only when it says something the name did
                            not; otherwise say what the band MEANS. */}
                        <p className="text-[11px] text-textSecondary leading-snug">
                          {z.label && z.label.toLowerCase() !== w.label.toLowerCase() ? z.label : w.reads}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
        </Bench>
      </Deck>
    </>
  );
};

/** One level in the rail: ink, name, price, distance, and what qualifies it. */
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
  <li
    className={`py-2 flex items-start ${onClick && price !== null ? 'cursor-pointer hover:bg-white/[0.03] -mx-2 px-2 rounded' : ''} ${active ? 'bg-select/[0.06] -mx-2 px-2 rounded' : ''}`}
    onClick={price !== null ? onClick : undefined}
    data-level-row
    {...rest}
  >
    {/* The dot is gone. It repeated the ink that the level's NAME already
        carries two millimetres to its right — one fact, two marks, on every
        row of the list. */}
    <div className="min-w-0 flex-1">
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="font-mono text-[10px] font-bold uppercase tracking-wider" style={{ color: ink }}>
          {name}
        </span>
        <span className="font-mono text-[18px] font-bold tnum text-textPrimary leading-none">{price === null ? '—' : fmtStrike(price)}</span>
        <span className="font-mono text-[10px] text-textSecondary tnum">{dist}</span>
      </div>
      {children && <div className="mt-1 flex items-center gap-2 flex-wrap">{children}</div>}
    </div>
  </li>
);

export default Levels;
