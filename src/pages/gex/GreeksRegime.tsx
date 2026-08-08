import { useMemo, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ReferenceArea, ResponsiveContainer } from 'recharts';
import { Grid3x3, Clock, Waves, Sliders, ChevronDown } from 'lucide-react';
import { useMarketData } from '../../context/MarketDataContext';
import { BULL, BEAR, SPOT } from '../../components/gex/palette';
import { buildGreeksRegime, GREEKS, type DealerRegime, type GreekKey, type GreekRow } from '../../data/greeksmatrix';
import Panel from '../../components/ui/Panel';
import StatCard from '../../components/ui/StatCard';
import MetricGrid from '../../components/ui/MetricGrid';
import SegmentedControl from '../../components/ui/SegmentedControl';
import { ChartTip, TipHead, TipRow, TipNote } from '../../components/charts/ChartTip';
import { GRID, CURSOR, valueAxis, categoryAxis, axisUsd, zeroAnchoredDomain, niceTicks, REF_LINE } from '../../components/charts/chartTheme';
import { fmtUsd } from '../../data/gex';
import type { Tone } from '../../components/ui/tones';

/*
  ONE compact signed formatter for this page.

  There were two — `fmtDelta` and `fmtC` — identical except that one rendered
  millions to one decimal and the other to none. They were then applied to the
  same quantity: the charm read-out under the cursor used `fmtDelta` while the
  "Charm to close" stat card used `fmtC`, so the panel could show +2.4M and +2M
  for the same dealer delta drift, half a screen apart. One number, one
  rendering; the extra decimal at M is kept because that is the scale most of
  these exposures land on.
*/
const fmtExp = (v: number): string => {
  const a = Math.abs(v);
  const s = v < 0 ? '−' : '+';
  if (a >= 1e9) return `${s}${(a / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${s}${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${s}${(a / 1e3).toFixed(0)}K`;
  return `${s}${a.toFixed(0)}`;
};

/** The core greeks a dealer-flow read leans on; the rest are specialist. Four
    (not three) so the matrix fills a desktop width with heat instead of leaving
    the strike column a wide black gutter. */
const CORE_KEYS: GreekKey[] = ['delta', 'gamma', 'vanna', 'charm'];

const regimeTone: Record<DealerRegime, Tone> = {
  'PINNED / CHOPPY': 'select',
  'CONTROLLED TREND': 'bull',
  'UNSTABLE BREAKOUT': 'warn',
  'LIQUIDATION CASCADE': 'bear',
};

/** Per-cell exposure heatmap — green for dealer-supportive, red for amplifying. */
const GreekCell = ({ value, max }: { value: number; max: number }) => {
  const intensity = Math.min(1, Math.abs(value) / (max || 1));
  const pos = value >= 0;
  // Direction is carried by the tinted background; keep the number white for both
  // signs so high-magnitude cells stay legible (red-on-red used to wash out).
  const bg = pos ? `rgba(48,209,88,${0.06 + intensity * 0.34})` : `rgba(255,59,48,${0.06 + intensity * 0.3})`;
  return (
    <td className="px-2 py-1.5 text-right" style={{ background: bg }}>
      <span className="font-mono text-label tnum text-textPrimary">{fmtExp(value)}</span>
    </td>
  );
};

interface CharmRow {
  time: string;
  deltaShift: number;
  i: number;
}

/*
  Charm clock — dealer delta drift as the session decays into the close, on
  recharts. The power hour is shaded on the axis rather than drawn as a floating
  rectangle, so it stays aligned with the plot at any width.
*/
const CharmChart = ({ points }: { points: { time: string; deltaShift: number }[] }) => {
  const rows: CharmRow[] = points.map((p, i) => ({ ...p, i }));
  const n = rows.length;
  const last = rows[n - 1].deltaShift;
  const up = last >= 0;
  const domain = zeroAnchoredDomain(rows.map(r => r.deltaShift));
  const powerFrom = Math.max(0, n - 3);
  const xTicks = n > 1 ? [0, Math.round((n - 1) / 2), n - 1] : [0];

  return (
    <div
      style={{ height: 168 }}
      className="w-full"
      role="img"
      aria-label={`Charm clock: dealer delta drift across ${rows[0].time} to ${rows[n - 1].time}, closing ${up ? 'positive' : 'negative'} at ${fmtExp(last)}.`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 14, right: 6, bottom: 2, left: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis
            {...categoryAxis}
            type="number"
            dataKey="i"
            domain={[0, Math.max(n - 1, 1)]}
            ticks={xTicks}
            tickFormatter={(x: number) => rows[Math.round(x)]?.time ?? ''}
          />
          <YAxis {...valueAxis} domain={domain} ticks={niceTicks(domain[0], domain[1])} tickFormatter={fmtExp} width={54} />
          {/* The last three rungs are the power hour — where charm bites hardest. */}
          <ReferenceArea
            x1={powerFrom}
            x2={n - 1}
            fill="#FF9500"
            fillOpacity={0.06}
            label={{ value: 'POWER HOUR', position: 'insideTopLeft', fill: '#FF9500', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}
          />
          <ReferenceLine y={0} stroke={REF_LINE} />
          <Tooltip
            cursor={CURSOR}
            content={
              <ChartTip<CharmRow>
                render={r => {
                  const prev = r.i > 0 ? rows[r.i - 1].deltaShift : 0;
                  const step = r.deltaShift - prev;
                  const inPower = r.i >= powerFrom;
                  return (
                    <>
                      <TipHead sub={inPower ? 'power hour' : undefined}>{r.time}</TipHead>
                      <TipRow
                        label="Dealer Δ drift"
                        value={fmtExp(r.deltaShift)}
                        tone={r.deltaShift >= 0 ? 'text-bull' : 'text-bear'}
                      />
                      <TipRow label="Since last rung" value={fmtExp(step)} tone="text-textSecondary" />
                      <TipNote>
                        {r.deltaShift >= 0
                          ? 'Charm is handing dealers long delta as time passes, so flattening means selling into the close.'
                          : 'Charm is handing dealers short delta as time passes, so flattening means buying into the close.'}
                        {inPower ? ' Decay is steepest in the last hour, which is when this drift actually gets hedged.' : ''}
                      </TipNote>
                    </>
                  );
                }}
              />
            }
          />
          <Area
            type="monotone"
            dataKey="deltaShift"
            stroke={up ? BULL : BEAR}
            strokeWidth={1.75}
            fill={up ? BULL : BEAR}
            fillOpacity={0.14}
            baseValue={0}
            dot={false}
            activeDot={{ r: 3, fill: up ? BULL : BEAR, stroke: 'none' }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

interface VannaRow {
  volShockPct: number;
  hedgeUsd: number;
}

/*
  Vanna shock — the dealer hedge a given IV move forces, on recharts. The x axis
  is the shock itself in vol points, so the zero rule is "no vol move" and the
  reader can locate a scenario directly instead of counting sample positions.
*/
const VannaChart = ({ points }: { points: VannaRow[] }) => {
  const domain = zeroAnchoredDomain(points.map(p => p.hedgeUsd));
  const shocks = points.map(p => p.volShockPct);
  const xLo = Math.min(...shocks);
  const xHi = Math.max(...shocks);

  return (
    <div
      style={{ height: 168 }}
      className="w-full"
      role="img"
      aria-label={`Vanna shock: the dealer hedge forced by an implied-vol move, from ${xLo.toFixed(0)} to ${xHi.toFixed(0)} vol points.`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 12, right: 6, bottom: 2, left: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis
            {...categoryAxis}
            type="number"
            dataKey="volShockPct"
            domain={[xLo, xHi]}
            tickFormatter={(v: number) => `${v > 0 ? '+' : ''}${v.toFixed(0)}%`}
          />
          <YAxis {...valueAxis} domain={domain} ticks={niceTicks(domain[0], domain[1])} tickFormatter={axisUsd} width={56} />
          <ReferenceLine x={0} stroke={REF_LINE} strokeDasharray="3 3" />
          <ReferenceLine y={0} stroke={REF_LINE} />
          <Tooltip
            cursor={CURSOR}
            content={
              <ChartTip<VannaRow>
                render={p => (
                  <>
                    <TipHead sub="IV shock">
                      {p.volShockPct >= 0 ? '+' : '−'}
                      {Math.abs(p.volShockPct).toFixed(1)} vol pts
                    </TipHead>
                    <TipRow
                      label="Dealer hedge"
                      value={`${p.hedgeUsd >= 0 ? '+' : '−'}${fmtUsd(Math.abs(p.hedgeUsd))}`}
                      tone={p.hedgeUsd >= 0 ? 'text-bull' : 'text-bear'}
                    />
                    <TipNote>
                      {Math.abs(p.volShockPct) < 0.05
                        ? 'No vol move, no vanna hedge — this is the anchor the rest of the curve is measured from.'
                        : `An IV move of this size hands dealers delta they did not choose, and flattening it means ${p.hedgeUsd >= 0 ? 'buying' : 'selling'} the underlying. Vanna is why a vol spike moves spot even when nothing traded in the underlying.`}
                    </TipNote>
                  </>
                )}
              />
            }
          />
          <Area
            type="monotone"
            dataKey="hedgeUsd"
            stroke={SPOT}
            strokeWidth={1.75}
            fill={SPOT}
            fillOpacity={0.08}
            baseValue={0}
            dot={false}
            activeDot={{ r: 3, fill: SPOT, stroke: 'none' }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

const GreeksRegime = () => {
  const { marketData } = useMarketData();
  const view = useMemo(() => (marketData ? buildGreeksRegime(marketData) : null), [marketData]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [sortMode, setSortMode] = useState<'strike' | 'mag'>('strike');

  const visibleGreeks = useMemo(() => (showAdvanced ? GREEKS : GREEKS.filter(g => CORE_KEYS.includes(g.key))), [showAdvanced]);

  const colMax = useMemo(
    () => (view ? (Object.fromEntries(GREEKS.map(g => [g.key, Math.max(...view.rows.map(r => Math.abs(r[g.key])), 1)])) as Record<GreekKey, number>) : ({} as Record<GreekKey, number>)),
    [view]
  );

  // Total |exposure| per row across the currently-visible greeks — used for both
  // sort-by-exposure and the top-contributor highlight. Pure read/sum, no new math.
  const rowMag = useMemo(() => {
    const m = new Map<number, number>();
    if (view) for (const r of view.rows) m.set(r.strike, visibleGreeks.reduce((a, g) => a + Math.abs(r[g.key]), 0));
    return m;
  }, [view, visibleGreeks]);

  const topStrike = useMemo<number | null>(() => {
    let best: number | null = null;
    let bestV = -1;
    rowMag.forEach((v, k) => {
      if (v > bestV) {
        bestV = v;
        best = k;
      }
    });
    return best;
  }, [rowMag]);

  const sortedRows = useMemo(() => {
    if (!view) return [];
    if (sortMode === 'mag') return [...view.rows].sort((a, b) => (rowMag.get(b.strike) ?? 0) - (rowMag.get(a.strike) ?? 0));
    return view.rows;
  }, [view, sortMode, rowMag]);

  if (!view) {
    return (
      <Panel title="Greeks & Regime">
        <div className="h-40 flex items-center justify-center font-mono text-label uppercase tracking-widest text-textMuted">Building the exposure surface…</div>
      </Panel>
    );
  }

  const aboveCount = view.rows.filter(r => r.distPct > 0).length;
  const dominant = GREEKS.map(g => ({ g, v: Math.abs(view.netByGreek[g.key]) }))
    .filter(x => ['vanna', 'charm', 'vomma', 'veta', 'speed', 'color', 'ultima', 'zomma'].includes(x.g.key))
    .sort((a, b) => b.v - a.v)[0];

  // "What would change the regime" — from existing probabilities + net gamma.
  const sortedRegimes = [...view.regimes].sort((a, b) => b.prob - a.prob);
  const lead = sortedRegimes[0];
  const runner = sortedRegimes[1];
  const gammaLong = view.netByGreek.gamma >= 0;
  const regimeSwing = `${lead.regime} leads ${runner ? runner.regime : ''} by ${runner ? lead.prob - runner.prob : lead.prob} pts. Net gamma is ${gammaLong ? 'long (dampening)' : 'short (amplifying)'} — a flip in net gamma sign is what would swing the read.`;

  const colSpan = 2 + visibleGreeks.length;

  return (
    <>
      <MetricGrid min="170px">
        <StatCard label="Dealer regime" value={view.topRegime.regime} sub={`${view.topRegime.prob}% probability`} tone={regimeTone[view.topRegime.regime]} />
        <StatCard label="Net gamma" value={fmtExp(view.netByGreek.gamma)} sub={view.netByGreek.gamma >= 0 ? 'long — dampening' : 'short — amplifying'} tone={view.netByGreek.gamma >= 0 ? 'bull' : 'bear'} />
        <StatCard label="Vanna / +1% IV" value={fmtExp(view.vannaPerVol)} sub={view.vannaPerVol >= 0 ? 'vol pop → dealers buy' : 'vol pop → dealers sell'} tone={view.vannaPerVol >= 0 ? 'bull' : 'bear'} />
        <StatCard label="Charm to close" value={fmtExp(view.charmToClose)} sub="delta dealers shed by 16:00" tone={view.charmToClose >= 0 ? 'bull' : 'bear'} />
        <StatCard label="Dominant higher-order" value={dominant.g.label} sub={dominant.g.blurb} tone="neutral" />
      </MetricGrid>

      {/* Greek exposure matrix — core three by default, advanced on demand */}
      <Panel
        title={
          <span className="inline-flex items-center gap-1.5">
            <Grid3x3 className="w-3.5 h-3.5" /> Greek exposure matrix
          </span>
        }
        subtitle="net dealer $ by strike — green supports, red amplifies · hover a header for its meaning"
        flush
        focusable
      >
        <div className="flex items-center gap-3 px-3 py-2 border-b border-borderSubtle flex-wrap">
          <SegmentedControl
            ariaLabel="Sort matrix"
            options={[
              { value: 'strike', label: 'By strike' },
              { value: 'mag', label: 'By |exposure|' },
            ]}
            value={sortMode}
            onChange={setSortMode}
          />
          <button
            onClick={() => setShowAdvanced(v => !v)}
            aria-pressed={showAdvanced}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border font-mono text-label uppercase tracking-wider transition-colors ${
              showAdvanced ? 'border-borderMuted bg-white/[0.05] text-textPrimary' : 'border-borderSubtle text-textSecondary hover:text-textPrimary'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" /> Advanced greeks
            <ChevronDown className={`w-3 h-3 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
          </button>
          {topStrike !== null && (
            <span className="ml-auto font-mono text-micro uppercase tracking-widest text-textMuted tnum">
              top contributor <span className="text-textPrimary font-semibold">${topStrike.toFixed(2)}</span>
            </span>
          )}
        </div>
        <div className="overflow-x-auto">
          {/* table-fixed + colgroup: pin Strike/Dist narrow so the heat-filled
              greek columns absorb the desktop width, instead of Strike ballooning
              into a wide black gutter next to a cluster of numbers. */}
          <table className={`w-full ${showAdvanced ? 'min-w-[760px]' : 'min-w-[640px]'} table-fixed border-collapse`}>
            <colgroup>
              <col className="w-[104px]" />
              <col className="w-[76px]" />
              {visibleGreeks.map(g => (
                <col key={g.key} />
              ))}
            </colgroup>
            <thead>
              <tr className="bg-panelRaised border-b border-borderSubtle">
                <th className="sticky left-0 z-10 bg-inset px-3 py-2 text-left font-mono text-label font-semibold uppercase tracking-wider text-textMuted">Strike</th>
                <th className="px-2 py-2 text-right font-mono text-label font-semibold uppercase tracking-wider text-textMuted">Dist</th>
                {visibleGreeks.map(g => (
                  <th
                    key={g.key}
                    className="px-2 py-2 text-right font-mono text-label font-semibold uppercase tracking-wider text-textMuted cursor-help"
                    title={`${g.label} — ${g.blurb}`}
                  >
                    <span className="border-b border-dotted border-textMuted/40">{g.label}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((r, i) => (
                <RowWithSpot
                  key={r.strike}
                  r={r}
                  greeks={visibleGreeks}
                  colMax={colMax}
                  colSpan={colSpan}
                  isTop={r.strike === topStrike}
                  showSpot={sortMode === 'strike' && i === aboveCount - 1}
                  ticker={view.ticker}
                  spot={view.spot}
                />
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        <Panel title="Dealer regime probability" subtitle="what the net positioning implies" className="xl:col-span-5">
          <div className="flex flex-col gap-3">
            {view.regimes.map(rg => (
              <div key={rg.regime}>
                <div className="flex items-center justify-between mb-1">
                  <span className={`font-mono text-label font-semibold uppercase tracking-wider ${rg === view.topRegime ? 'text-textPrimary' : 'text-textSecondary'}`}>{rg.regime}</span>
                  <span className="font-mono text-caption font-semibold text-textPrimary tnum leading-4">{rg.prob}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                  <span
                    className={`block h-full rounded-full ${
                      rg.regime === 'LIQUIDATION CASCADE' ? 'bg-bear' : rg.regime === 'UNSTABLE BREAKOUT' ? 'bg-warn' : rg.regime === 'CONTROLLED TREND' ? 'data-bar' : 'bg-white/40'
                    }`}
                    style={{ width: `${rg.prob}%` }}
                  />
                </div>
              </div>
            ))}
            <p className="text-label text-textSecondary leading-relaxed border-t border-borderSubtle pt-2.5">{view.topRegime.note}</p>
            <p className="flex items-start gap-2 text-label text-warn/90 leading-relaxed border-t border-borderSubtle pt-2.5">
              <span className="font-mono text-micro font-semibold uppercase tracking-widest text-warn mt-px shrink-0">What flips it</span>
              <span className="text-textSecondary">{regimeSwing}</span>
            </p>
          </div>
        </Panel>

        <div className="xl:col-span-7 flex flex-col gap-4">
          <Panel
            title={
              <span className="inline-flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" /> Charm clock
              </span>
            }
            subtitle="dealer delta drift as the session decays — accelerating into the close"
          >
            <CharmChart points={view.charmClock} />
          </Panel>
          <Panel
            title={
              <span className="inline-flex items-center gap-1.5">
                <Waves className="w-3.5 h-3.5" /> Vanna shock
              </span>
            }
            subtitle="dealer hedge from an IV move, not a price move"
          >
            <VannaChart points={view.vannaShock} />
          </Panel>
        </div>
      </div>
    </>
  );
};

/** A matrix row, optionally followed by the spot rule. */
const RowWithSpot = ({
  r,
  greeks,
  colMax,
  colSpan,
  isTop,
  showSpot,
  ticker,
  spot,
}: {
  r: GreekRow;
  greeks: typeof GREEKS;
  colMax: Record<GreekKey, number>;
  colSpan: number;
  isTop: boolean;
  showSpot: boolean;
  ticker: string;
  spot: number;
}) => (
  <>
    <tr className="border-b border-borderSubtle/40 hover:bg-rowHover">
      <td
        className="sticky left-0 z-10 px-3 py-1.5 font-mono text-caption font-semibold text-textPrimary tnum whitespace-nowrap bg-inset leading-4"
        style={isTop ? { boxShadow: 'inset 3px 0 0 0 rgba(199,211,232,0.85)' } : undefined}
      >
        ${r.strike.toFixed(2)}
        {isTop && <span className="ml-1.5 font-mono text-micro uppercase tracking-widest text-select">top</span>}
      </td>
      <td className={`px-2 py-1.5 text-right font-mono text-label tnum ${r.distPct >= 0 ? 'text-bull' : 'text-bear'}`}>
        {r.distPct >= 0 ? '+' : ''}
        {r.distPct.toFixed(1)}%
      </td>
      {greeks.map(g => (
        <GreekCell key={g.key} value={r[g.key]} max={colMax[g.key]} />
      ))}
    </tr>
    {showSpot && (
      <tr>
        <td colSpan={colSpan} className="px-3 py-0.5">
          <span className="flex items-center gap-2 select-none">
            <span className="h-px flex-grow bg-gradient-to-r from-textPrimary/10 via-textPrimary/40 to-textPrimary/50" />
            <span className="font-mono text-micro uppercase tracking-wider text-textSecondary">{ticker}</span>
            <span className="inline-flex items-center rounded-[3px] bg-textPrimary px-1.5 py-px font-mono text-micro font-bold tnum text-ink">{spot.toFixed(2)}</span>
            <span className="h-px w-3 shrink-0 bg-textPrimary/50" />
          </span>
        </td>
      </tr>
    )}
  </>
);

export default GreeksRegime;
