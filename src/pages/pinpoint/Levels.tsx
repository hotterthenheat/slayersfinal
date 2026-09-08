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
import { attributionWords, buildStrikeAttribution } from '../../data/attribution';
import { fmtDistance, impliedDaySigma, sessionAtr, type DistanceScales } from '../../data/atr';
import { useDistanceUnit } from '../../data/distanceUnits';
import { fmtUsd } from '../../data/gex';
import type { ExposureExpiry } from '../../types/gex';
import DataState from '../../components/ui/DataState';
import Term from '../../components/ui/Term';
import { CONTROL, CONTROL_OFF, CONTROL_OUTLINE, Cell, DeskLoading, Figure, Group, Pane, Read, Row, Segmented, Select, Stat, TYPE, Table, Tag, Toolbar, Workspace } from '../../components/pinpoint/Desk';
import StrikeProfile, { type ProfileLevel, type ProfileRow } from '../../components/pinpoint/StrikeProfile';
import Series from '../../components/pinpoint/Series';
import { useScanSnapshot } from '../../components/pinpoint/useScanSnapshot';
import { CALL_WALL, FLIP, INK, LONG_GAMMA, METRICS, PUT_WALL, SHORT_GAMMA, SPOT, SUPREME, WARN, ZONE_WORDS, fmtStrike, gradeInk, regimeInk, signInk, type MetricKey } from '../../components/pinpoint/ink';

/*
  LEVELS — where the walls and the flip are, and which side of them you are
  on. The profile is the picture; the levels are rules across it and rows in
  the inspector; a picked strike opens its prints under the picture.
*/

const METRIC_OPTIONS = [{ value: 'gex', label: 'GEX' }, { value: 'dex', label: 'DEX' }, { value: 'vex', label: 'VEX' }] as const;
const UNIT_OPTIONS = [{ value: 'usd', label: '$' }, { value: 'shares', label: 'Sh' }] as const;
const LENS_OPTIONS = [{ value: 'ALL', label: 'All' }, { value: '0DTE', label: '0DTE' }, { value: '1D', label: '1D' }, { value: '2D', label: '2D' }, { value: '5D', label: '5D' }, { value: '7D', label: '7D' }, { value: 'OPEX', label: 'OPEX' }] as const;
const WINDOW_OPTIONS = STRIKE_WINDOWS.map(w => ({ value: String(w), label: `±${w}` }));
const BAR_OPTIONS = [{ value: 'net', label: 'Net' }, { value: 'split', label: 'Split' }] as const;
const STICKY_OPTIONS = [{ value: 'strike', label: STICKY_WORDS.strike.label }, { value: 'delta', label: STICKY_WORDS.delta.label }] as const;

const fmtShares = (v: number): string => {
  const a = Math.abs(v);
  const s = a >= 1e6 ? `${(a / 1e6).toFixed(1)}M` : a >= 1e3 ? `${(a / 1e3).toFixed(0)}K` : a.toFixed(0);
  return `${v < 0 ? '−' : ''}${s} sh`;
};
const hhmm = (t: number) => {
  const d = new Date(t * 1000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
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
  const [hover, setHover] = useState<number | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [scenarioAt, setScenarioAt] = useState<number | null>(null);

  const data = useMemo(() => (snapshot ? buildExposureProfile(snapshot, lens, half) : null), [snapshot, lens, half]);
  const gauge = useMemo(() => (snapshot ? buildFlipGauge(snapshot) : null), [snapshot]);
  const scales = useMemo<DistanceScales>(() => (snapshot ? { atr: sessionAtr(Simulator.getCandles(snapshot.ticker) ?? []), sigma: impliedDaySigma(snapshot.spot, Simulator.TICKERS[snapshot.ticker]?.iv ?? 0) } : { atr: null, sigma: null }), [snapshot]);
  const conviction = useMemo(() => {
    if (!snapshot) return { call: null, put: null };
    const snaps = Simulator.getGexHistory(snapshot.ticker) ?? [];
    const candles = Simulator.getCandles(snapshot.ticker) ?? [];
    return { call: buildWallConviction(snaps, candles, snapshot.spot, 'call'), put: buildWallConviction(snaps, candles, snapshot.spot, 'put') };
  }, [snapshot]);
  const series = useMemo(() => (snapshot ? buildNetGexSeries(snapshot.ticker) : null), [snapshot]);
  const pctile = useMemo(() => {
    const last = series?.points[series.points.length - 1];
    return snapshot && last ? buildGexPercentile(snapshot.ticker, last.netGex) : null;
  }, [snapshot, series]);
  const pins = useMemo(() => (snapshot ? buildPins(snapshot.chain, snapshot.spot) : null), [snapshot]);
  const expiryFlips = useMemo(() => (snapshot ? buildExpiryFlips(snapshot) : null), [snapshot]);
  const iv = snapshot ? (Simulator.TICKERS[snapshot.ticker]?.iv ?? 0.2) : 0.2;
  const stability = useMemo(() => (snapshot ? buildStability(snapshot.chain, snapshot.spot, iv) : null), [snapshot, iv]);
  const scenarioTarget = scenarioAt ?? snapshot?.spot ?? 0;
  const scenario = useMemo(() => (snapshot ? buildSpotScenario(snapshot.chain, snapshot.spot, scenarioTarget) : null), [snapshot, scenarioTarget]);
  const stickyRead = useMemo(() => (snapshot ? buildStickyRead(snapshot.chain, snapshot.spot, scenarioTarget, iv) : null), [snapshot, scenarioTarget, iv]);
  const step = data && data.strikes.length > 1 ? Math.abs(data.strikes[0].strike - data.strikes[1].strike) : 1;
  const attribution = useMemo(() => (picked !== null ? buildStrikeAttribution(flowTape, picked, step) : null), [flowTape, picked, step]);

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
  const flip = readFlip(data.strikes, spot, s => s.gex.net);
  const flipOn = flip.strike !== null && flip.kind !== 'no-crossing';
  const rows: ProfileRow[] = data.strikes.map(s => ({ strike: s.strike, values: { net: s[metric].net, put: Math.abs(s[metric].put), call: Math.abs(s[metric].call) } }));
  const maxAbs = bars === 'split' ? Math.max(1, ...data.strikes.map(s => Math.max(Math.abs(s[metric].put), Math.abs(s[metric].call)))) : data.maxAbs[metric];
  const levels: ProfileLevel[] = [
    { kind: 'spot', price: spot, tag: `SPOT ${fmtStrike(spot)}`, ink: SPOT },
    ...(flip.strike !== null ? [{ kind: 'flip' as const, price: flip.strike, tag: `${flipOn ? 'FLIP' : '≈0'} ${fmtStrike(flip.strike)}`, ink: FLIP, dashed: !flipOn || flip.kind !== 'sole' }] : []),
    { kind: 'call-wall', price: data.levels.callWall, tag: `CW ${fmtStrike(data.levels.callWall)}`, ink: CALL_WALL },
    { kind: 'put-wall', price: data.levels.putWall, tag: `PW ${fmtStrike(data.levels.putWall)}`, ink: PUT_WALL },
    { kind: 'supreme', price: data.levels.supreme, tag: `SUP ${fmtStrike(data.levels.supreme)}`, ink: SUPREME },
    ...(pins?.maxPain != null ? [{ kind: 'max-pain' as const, price: pins.maxPain, tag: `PAIN ${fmtStrike(pins.maxPain)}`, ink: INK.secondary, dashed: true }] : []),
  ];
  const selected = picked !== null ? data.strikes.find(s => s.strike === picked) : undefined;
  const pick = (s: number | null) => s !== null && setPicked(p => (p === s ? null : s));
  const convInk = (g: 'STRONG' | 'HOLDING' | 'THIN') => gradeInk(g === 'STRONG' ? 0 : g === 'HOLDING' ? 1 : 2);
  const regimeWords = gauge.regime ? REGIME_WORDS[gauge.regime] : null;
  const chainLo = Math.min(...snapshot.chain.map(n => n.strike));
  const chainHi = Math.max(...snapshot.chain.map(n => n.strike));
  const last = series?.points[series.points.length - 1];

  return (
    <Workspace
      toolbar={
        <Toolbar data-levels-controls>
          <Segmented ariaLabel="Metric" options={METRIC_OPTIONS} value={metric} onChange={setMetric} />
          <Segmented ariaLabel="Bars" options={BAR_OPTIONS} value={bars} onChange={setBars} />
          <Segmented ariaLabel="Expiry lens" options={LENS_OPTIONS} value={lens} onChange={setLens} />
          <Select ariaLabel="Strike window" options={WINDOW_OPTIONS} value={String(half)} onChange={v => setHalf(Number(v) as StrikeWindow)} />
          <Segmented ariaLabel="Units" options={UNIT_OPTIONS} value={units} onChange={setUnits} />
          <span className={`${TYPE.label} text-textMuted tnum ml-auto`}>scan {scanAt}</span>
        </Toolbar>
      }
      picture={
        <StrikeProfile
          mode={bars === 'split' ? 'mirror' : 'diverge'}
          rows={rows}
          series={bars === 'split' ? [{ key: 'put', label: 'puts', ink: PUT_WALL, side: 'left' }, { key: 'call', label: 'calls', ink: CALL_WALL, side: 'right' }] : [{ key: 'net', label: m.label, ink: 'heat' }]}
          maxAbs={maxAbs}
          levels={levels}
          zones={data.zones.map(z => ({ from: z.from, to: z.to, kind: z.kind }))}
          fmt={fmtV}
          figures
          hoverStrike={hover}
          onHover={setHover}
          selectedStrike={picked}
          onSelect={s => pick(s)}
          ariaLabel={`${m.name} by strike. Spot ${fmtStrike(spot)}, call wall ${fmtStrike(data.levels.callWall)}, put wall ${fmtStrike(data.levels.putWall)}${flip.strike !== null ? `, flip ${fmtStrike(flip.strike)}` : ''}.`}
        />
      }
      drawer={
        selected && attribution ? (
          <div className="flex flex-col gap-2" data-picked-strike={selected.strike}>
            <div className="flex items-center gap-3 flex-wrap">
              <span className={`${TYPE.num} text-textPrimary`}>
                {data.ticker} {fmtStrike(selected.strike)}
              </span>
              <span className={`${TYPE.label} tracking-normal text-textMuted tnum`}>{dist(selected.strike)}</span>
              {(['gex', 'dex', 'vex', 'vanna', 'charm'] as const).map(k => (
                <span key={k} className={`${TYPE.label} tracking-normal text-textSecondary tnum`}>
                  {METRICS[k].label} <span className="text-textPrimary">{fmtV(selected[k].net)}</span>
                </span>
              ))}
              <span className={`${TYPE.body} text-textSecondary`}>{attributionWords(attribution)}</span>
              <span className="ml-auto flex items-center gap-2">
                <button onClick={() => navigate('/pulse', { state: { focusPrice: selected.strike } })} className={`${CONTROL} ${CONTROL_OFF} ${CONTROL_OUTLINE}`}>
                  chart <ArrowUpRight className="w-3 h-3" aria-hidden />
                </button>
                <button onClick={() => setPicked(null)} aria-label="Clear selection" className={`${CONTROL} ${CONTROL_OFF} px-1`}>
                  <X className="w-3 h-3" aria-hidden />
                </button>
              </span>
            </div>
            {attribution.prints.length > 0 && (
              <Pane className="max-h-[160px]" data-attribution>
                <Table sticky cols={[{ key: 't', label: 'Time' }, { key: 'c', label: 'Contract' }, { key: 's', label: 'Size', align: 'right' }, { key: 'p', label: 'Premium', align: 'right' }, { key: 'f', label: 'Fill', align: 'right' }]}>
                  {attribution.prints.slice(0, 12).map(p => (
                    <Row key={p.id}>
                      <Cell className="text-textMuted">{p.time}</Cell>
                      <Cell className={TYPE.num}>
                        {fmtStrike(p.strike)}
                        <span className="ml-1" style={{ color: p.right === 'C' ? CALL_WALL : PUT_WALL }}>
                          {p.right}
                        </span>
                        <span className="ml-2 text-textMuted font-normal">{p.dte}d</span>
                      </Cell>
                      <Cell num>{p.size}</Cell>
                      <Cell num>{fmtUsd(p.premium)}</Cell>
                      <Cell num className="font-normal text-textSecondary">
                        {p.side} {p.fill.toFixed(2)}
                      </Cell>
                    </Row>
                  ))}
                </Table>
              </Pane>
            )}
          </div>
        ) : undefined
      }
      inspector={
        <>
          <Group title="Levels" data-group="levels">
            <Stat label={<Term k="Call wall">Call wall</Term>} value={fmtStrike(data.levels.callWall)} ink={CALL_WALL} sub={conviction.call ? `${dist(data.levels.callWall)} · ${convictionGrade(conviction.call)} · ${convictionWords(conviction.call)}` : dist(data.levels.callWall)} onSelect={() => pick(data.levels.callWall)} selected={picked === data.levels.callWall} data-level-row="call-wall" data-grade={conviction.call ? convictionGrade(conviction.call) : undefined} />
            <Stat label={<Term k="Put wall">Put wall</Term>} value={fmtStrike(data.levels.putWall)} ink={PUT_WALL} sub={conviction.put ? `${dist(data.levels.putWall)} · ${convictionGrade(conviction.put)} · ${convictionWords(conviction.put)}` : dist(data.levels.putWall)} onSelect={() => pick(data.levels.putWall)} selected={picked === data.levels.putWall} data-level-row="put-wall" data-grade={conviction.put ? convictionGrade(conviction.put) : undefined} />
            <Stat label={<Term k="Gamma flip">{flipOn ? 'Gamma flip' : 'Nearest to zero'}</Term>} value={flip.strike === null ? '—' : fmtStrike(flip.strike)} ink={FLIP} sub={`${dist(flip.strike)}${flip.kind === 'nearest-of-several' ? ` · nearest of ${flip.crossings.length}` : flip.kind === 'no-crossing' ? ' · not a flip' : ''}`} onSelect={() => pick(flip.strike)} selected={picked === flip.strike} data-level-row="flip" data-flip-kind={flip.kind} />
            <Stat label="Supreme" value={fmtStrike(data.levels.supreme)} ink={SUPREME} sub={`${dist(data.levels.supreme)} · heaviest strike`} onSelect={() => pick(data.levels.supreme)} selected={picked === data.levels.supreme} data-level-row="supreme" />
            {pins && (
              <>
                <Stat label={<Term k="Max pain">Max pain</Term>} value={pins.maxPain === null ? '—' : fmtStrike(pins.maxPain)} sub={dist(pins.maxPain)} onSelect={() => pick(pins.maxPain)} selected={picked === pins.maxPain} data-level-row="max-pain" />
                <Stat label={<Term k="Gamma pin">Gamma pin</Term>} value={pins.gammaPin === null ? '—' : fmtStrike(pins.gammaPin)} sub={pins.gap === null ? dist(pins.gammaPin) : `${Math.abs(pins.gap).toFixed(2)} ${pins.gap > 0 ? 'above' : pins.gap < 0 ? 'below' : 'on'} max pain`} data-level-row="gamma-pin" />
              </>
            )}
          </Group>

          <Group title="Regime" data-group="regime">
            <Stat label="Side of the flip" value={regimeWords ? regimeWords.label : 'NO FLIP'} ink={regimeInk(gauge.regime)} sub={regimeWords ? regimeWords.blurb : 'the book does not change sign'} />
            <Stat label="Crossed today" value={gauge.crossings === null ? 'too early' : `${gauge.crossings}×`} sub={gauge.crossings === null ? `${gauge.bars} bars in` : 'against the flip as it stood at each bar'} data-flip-crossings={gauge.crossings ?? 'unknown'} />
            <Stat label="Book" value={data.bias} ink={data.bias === 'BULLISH' ? LONG_GAMMA : data.bias === 'BEARISH' ? SHORT_GAMMA : INK.secondary} sub={data.biasNote} />
          </Group>

          {stability && (
            <Group title="Under a ±2 vol move" data-group="stability" data-stability>
              {(
                [
                  { label: 'Call wall', ink: CALL_WALL, k: 'callWall' },
                  { label: 'Put wall', ink: PUT_WALL, k: 'putWall' },
                  { label: 'Flip', ink: FLIP, k: 'flip' },
                ] as const
              ).map(r => {
                const base = stability.base[r.k];
                const dn = stability.down[r.k];
                const up = stability.up[r.k];
                const moved = (dn !== null && base !== null && dn !== base) || (up !== null && base !== null && up !== base);
                const cell = (v: number | null) => (v === null ? '—' : fmtStrike(v));
                return <Stat key={r.k} label={<span style={{ color: r.ink }}>{r.label}</span>} value={`${cell(dn)} · ${cell(base)} · ${cell(up)}`} ink={moved ? WARN : undefined} sub={moved ? 'moves' : 'holds · −2 / now / +2'} data-stability-row={r.k} />;
              })}
              <p className={`${TYPE.label} tracking-normal normal-case text-textMuted pt-1`}>{stabilityWords(stability)}</p>
            </Group>
          )}

          <Group title="If spot were" data-group="scenario">
            <div className="flex items-center gap-2 py-1">
              <input type="range" min={chainLo} max={chainHi} step={step / 2} value={scenarioTarget} onChange={e => setScenarioAt(Number(e.target.value))} aria-label="Scenario spot" className="flex-1 accent-white" />
              <span className={`${TYPE.num} text-textPrimary w-16 text-right`}>{fmtStrike(Number(scenarioTarget.toFixed(2)))}</span>
              <button onClick={() => setScenarioAt(null)} className={`${CONTROL} ${CONTROL_OFF}`} disabled={scenarioAt === null}>
                reset
              </button>
            </div>
            {scenario && (
              <>
                <Stat label="Regime there" value={REGIME_WORDS[scenario.regime].label} ink={regimeInk(scenario.regime)} />
                <Stat label="Call wall" value={scenario.callWall === null ? '—' : fmtStrike(scenario.callWall)} ink={CALL_WALL} />
                <Stat label="Put wall" value={scenario.putWall === null ? '—' : fmtStrike(scenario.putWall)} ink={PUT_WALL} />
                <Stat label="Hedging flow forced" value={fmtUsd(scenario.hedgingFlow)} ink={signInk(scenario.hedgingFlow)} sub={flowWords(scenario)} />
              </>
            )}
            {stickyRead && (
              <div className="pt-2 flex flex-col" data-sticky-read data-sticky={sticky} data-sticky-agree={stickyRead.agree}>
                <div className="flex items-center justify-between gap-2 py-1">
                  <span className={`${TYPE.label} text-textMuted`}>Vol assumption</span>
                  <Segmented ariaLabel="Vol assumption" options={STICKY_OPTIONS} value={sticky} onChange={setSticky} />
                </div>
                <Stat label={`Flip · ${STICKY_WORDS.strike.label}`} value={stickyRead.strike.flip === null ? 'no flip' : fmtStrike(stickyRead.strike.flip)} ink={sticky === 'strike' ? FLIP : undefined} sub={sticky === 'strike' ? 'the assumption you chose' : 'the other assumption'} />
                <Stat label={`Flip · ${STICKY_WORDS.delta.label}`} value={stickyRead.delta.flip === null ? 'no flip' : fmtStrike(stickyRead.delta.flip)} ink={sticky === 'delta' ? FLIP : undefined} sub={sticky === 'delta' ? 'the assumption you chose' : 'the other assumption'} />
                <p className={`${TYPE.label} tracking-normal normal-case text-textMuted pt-1`}>{stickyWords(stickyRead)}</p>
              </div>
            )}
            <p className={`${TYPE.label} tracking-normal normal-case text-textMuted pt-1`}>{HEDGING_ASSUMPTION}</p>
          </Group>

          {expiryFlips && (
            <Group title="Flip by expiry" data-group="flip-by-expiry">
              <Stat label="0DTE" value={expiryFlips.d0 === null ? 'no flip' : fmtStrike(expiryFlips.d0)} ink={FLIP} sub="gone at the bell" />
              <Stat label="Weekly" value={expiryFlips.weekly === null ? 'no flip' : fmtStrike(expiryFlips.weekly)} ink={FLIP} sub="the carried trade" />
              <Stat label="Whole book" value={expiryFlips.book === null ? 'no flip' : fmtStrike(expiryFlips.book)} ink={FLIP} sub={expiryFlips.spread === null ? 'one lens is one-sided' : expiryFlips.spread === 0 ? 'the lenses agree' : `spread ${Math.abs(expiryFlips.spread).toFixed(2)}`} />
            </Group>
          )}

          <Group title="Zones" data-group="zones">
            {data.zones.length === 0 ? (
              <Stat label="none on this window" value="—" sub="widen the window" />
            ) : (
              data.zones.map((z, i) => {
                const w = ZONE_WORDS[z.kind];
                return <Stat key={i} label={<span style={{ color: w.ink }}>{w.label}</span>} value={`${fmtStrike(z.to)} – ${fmtStrike(z.from)}`} sub={w.reads} data-zone-row={z.kind} />;
              })
            )}
          </Group>

          {series && series.points.length > 1 && last && (
            <Group title="Net gamma today" data-group="session">
              <div className="py-1">
                <Series lines={[{ key: 'net', points: series.points.map(p => ({ x: p.time, y: p.netGex })), ink: last.netGex > 0 ? SHORT_GAMMA : LONG_GAMMA, area: true }]} zero marks={series.zeroCrossings.map(i => ({ x: series.points[i].time, ink: FLIP }))} fmtX={hhmm} fmtY={v => fmtUsd(v)} height={72} ariaLabel="Net gamma through the session" />
              </div>
              <Stat label="Now" value={fmtV(last.netGex)} ink={last.netGex > 0 ? SHORT_GAMMA : LONG_GAMMA} />
              <Stat label="Range" value={`${fmtV(series.min)} … ${fmtV(series.max)}`} />
              <Stat label="Crossed zero" value={`${series.zeroCrossings.length}×`} ink={FLIP} sub="the whole book changing sign" />
            </Group>
          )}

          <Group title="Read" data-group="read">
            <ul className={`${TYPE.body} text-textSecondary list-disc pl-4 marker:text-textMuted flex flex-col gap-1 py-1`} data-read-list>
              {data.insights.map((line, i) => (
                <li key={i} className="tnum">
                  {line}
                </li>
              ))}
            </ul>
          </Group>
        </>
      }
      strip={
        <>
          <Figure label={<Term k="Net GEX" />} value={fmtV(data.netGex)} ink={data.netGex > 0 ? SHORT_GAMMA : LONG_GAMMA} sub={data.netGex > 0 ? 'moves get amplified' : 'dips get absorbed'} size="lead" />
          <Figure label={<Term k="Net DEX" />} value={fmtV(data.netDex)} sub="directional inventory" />
          <Figure label={<Term k="Net VEX" />} value={fmtV(data.netVex)} sub="per vol point" />
          <Figure label={<Term k="GEX percentile" />} value={pctile ? ordinal(pctile.pctile) : '—'} sub={pctile ? `of the last ${pctile.sessions} sessions` : 'needs more sessions'} />
          <Figure label="Regime" value={<Tag ink={regimeInk(gauge.regime)}>{regimeWords ? regimeWords.label : 'NO FLIP'}</Tag>} sub={`crossed ${gauge.crossings === null ? '—' : `${gauge.crossings}×`} today`} />
          <Read>
            {gauge.regime === 'LONG' ? 'Above the flip: dealers sell rallies and buy dips, so moves fade and price pins toward the heavy strikes.' : gauge.regime === 'SHORT' ? 'Below the flip: dealers sell weakness and buy strength, so moves extend — respect the walls.' : 'No sign change on the book: the walls are the only structure.'}
          </Read>
        </>
      }
    />
  );
};

export default Levels;
