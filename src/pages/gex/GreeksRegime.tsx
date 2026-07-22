import { useMemo, useState } from 'react';
import { Grid3x3, Clock, Waves, Sliders, ChevronDown } from 'lucide-react';
import { useMarketData } from '../../context/MarketDataContext';
import { buildGreeksRegime, GREEKS, type DealerRegime, type GreekKey, type GreekRow } from '../../data/greeksmatrix';
import Panel from '../../components/ui/Panel';
import StatCard from '../../components/ui/StatCard';
import MetricGrid from '../../components/ui/MetricGrid';
import SegmentedControl from '../../components/ui/SegmentedControl';
import type { Tone } from '../../components/ui/tones';

/** The three greeks a dealer-flow read leans on; the rest are specialist. */
const CORE_KEYS: GreekKey[] = ['gamma', 'vanna', 'charm'];

const fmtC = (v: number): string => {
  const a = Math.abs(v);
  const s = v < 0 ? '−' : '+';
  if (a >= 1e9) return `${s}${(a / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${s}${(a / 1e6).toFixed(0)}M`;
  if (a >= 1e3) return `${s}${(a / 1e3).toFixed(0)}K`;
  return `${s}${a.toFixed(0)}`;
};

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
      <span className="font-mono text-[11px] tnum text-textPrimary">{fmtC(value)}</span>
    </td>
  );
};

const CharmChart = ({ points }: { points: { time: string; deltaShift: number }[] }) => {
  const W = 560;
  const H = 150;
  const vals = points.map(p => p.deltaShift);
  const lo = Math.min(...vals, 0);
  const hi = Math.max(...vals, 0);
  const X = (i: number) => (i / (points.length - 1)) * W;
  const Y = (v: number) => H - ((v - lo) / (hi - lo || 1)) * (H - 8) - 4;
  const zeroY = Y(0);
  const last = points[points.length - 1].deltaShift;
  const up = last >= 0;
  const area =
    points.map((p, i) => `${i === 0 ? 'M' : 'L'}${X(i).toFixed(1)},${Y(p.deltaShift).toFixed(1)}`).join(' ') +
    ` L${W},${zeroY} L0,${zeroY} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }} preserveAspectRatio="none">
      <line x1={0} x2={W} y1={zeroY} y2={zeroY} stroke="#fff" strokeOpacity={0.12} />
      <rect x={X(points.length - 3)} y={0} width={W - X(points.length - 3)} height={H} fill="rgba(255,149,0,0.06)" />
      <path d={area} fill={up ? 'rgba(48,209,88,0.14)' : 'rgba(255,59,48,0.14)'} />
      <path d={points.map((p, i) => `${i === 0 ? 'M' : 'L'}${X(i).toFixed(1)},${Y(p.deltaShift).toFixed(1)}`).join(' ')} fill="none" stroke={up ? '#30D158' : '#FF3B30'} strokeWidth={1.75} />
      <text x={X(points.length - 3) + 4} y={12} fontSize={8} fill="#FF9500" fontFamily="monospace">POWER HOUR</text>
    </svg>
  );
};

const VannaChart = ({ points }: { points: { volShockPct: number; hedgeUsd: number }[] }) => {
  const W = 560;
  const H = 150;
  const vals = points.map(p => p.hedgeUsd);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const X = (i: number) => (i / (points.length - 1)) * W;
  const Y = (v: number) => H - ((v - lo) / (hi - lo || 1)) * (H - 8) - 4;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }} preserveAspectRatio="none">
      <line x1={W / 2} x2={W / 2} y1={0} y2={H} stroke="#fff" strokeOpacity={0.12} strokeDasharray="3 3" />
      <line x1={0} x2={W} y1={Y(0)} y2={Y(0)} stroke="#fff" strokeOpacity={0.12} />
      <path d={points.map((p, i) => `${i === 0 ? 'M' : 'L'}${X(i).toFixed(1)},${Y(p.hedgeUsd).toFixed(1)}`).join(' ')} fill="none" stroke="#ededed" strokeWidth={1.75} />
      <text x={6} y={H - 4} fontSize={8} fill="#7d7d7d" fontFamily="monospace">−3% IV</text>
      <text x={W - 40} y={H - 4} fontSize={8} fill="#7d7d7d" fontFamily="monospace">+3% IV</text>
    </svg>
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
        <div className="h-40 flex items-center justify-center font-mono text-[11px] uppercase tracking-widest text-textMuted">Building the exposure surface…</div>
      </Panel>
    );
  }

  const aboveCount = view.rows.filter(r => r.distPct > 0).length;
  const dominant = GREEKS.map(g => ({ g, v: Math.abs(view.netByGreek[g.key]) }))
    .filter(x => ['vanna', 'charm', 'vomma', 'speed', 'color', 'ultima'].includes(x.g.key))
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
        <StatCard label="Net gamma" value={fmtC(view.netByGreek.gamma)} sub={view.netByGreek.gamma >= 0 ? 'long — dampening' : 'short — amplifying'} tone={view.netByGreek.gamma >= 0 ? 'bull' : 'bear'} />
        <StatCard label="Vanna / +1% IV" value={fmtC(view.vannaPerVol)} sub={view.vannaPerVol >= 0 ? 'vol pop → dealers buy' : 'vol pop → dealers sell'} tone={view.vannaPerVol >= 0 ? 'bull' : 'bear'} />
        <StatCard label="Charm to close" value={fmtC(view.charmToClose)} sub="delta dealers shed by 16:00" tone={view.charmToClose >= 0 ? 'bull' : 'bear'} />
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
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border font-mono text-[11px] uppercase tracking-wider transition-colors ${
              showAdvanced ? 'border-borderMuted bg-white/[0.05] text-textPrimary' : 'border-borderSubtle text-textSecondary hover:text-textPrimary'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" /> Advanced greeks
            <ChevronDown className={`w-3 h-3 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
          </button>
          {topStrike !== null && (
            <span className="ml-auto font-mono text-[10px] uppercase tracking-widest text-textMuted tnum">
              top contributor <span className="text-textPrimary font-semibold">${topStrike.toFixed(2)}</span>
            </span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-panelRaised border-b border-borderSubtle">
                <th className="sticky left-0 z-10 bg-inset px-3 py-2 text-left font-mono text-[11px] font-semibold uppercase tracking-wider text-textMuted">Strike</th>
                <th className="px-2 py-2 text-right font-mono text-[11px] font-semibold uppercase tracking-wider text-textMuted">Dist</th>
                {visibleGreeks.map(g => (
                  <th
                    key={g.key}
                    className="px-2 py-2 text-right font-mono text-[11px] font-semibold uppercase tracking-wider text-textMuted cursor-help"
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
                  <span className={`font-mono text-[11px] font-semibold uppercase tracking-wider ${rg === view.topRegime ? 'text-textPrimary' : 'text-textSecondary'}`}>{rg.regime}</span>
                  <span className="font-mono text-xs font-semibold text-textPrimary tnum">{rg.prob}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                  <span
                    className={`block h-full rounded-full ${
                      rg.regime === 'LIQUIDATION CASCADE' ? 'bg-bear' : rg.regime === 'UNSTABLE BREAKOUT' ? 'bg-warn' : rg.regime === 'CONTROLLED TREND' ? 'holo-bar' : 'bg-white/40'
                    }`}
                    style={{ width: `${rg.prob}%` }}
                  />
                </div>
              </div>
            ))}
            <p className="text-[11px] text-textSecondary leading-relaxed border-t border-borderSubtle pt-2.5">{view.topRegime.note}</p>
            <p className="flex items-start gap-2 text-[11px] text-warn/90 leading-relaxed border-t border-borderSubtle pt-2.5">
              <span className="font-mono text-[9px] font-semibold uppercase tracking-widest text-warn mt-px shrink-0">What flips it</span>
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
    <tr className="border-b border-borderSubtle/40 hover:bg-white/[0.02]">
      <td
        className="sticky left-0 z-10 px-3 py-1.5 font-mono text-xs font-semibold text-textPrimary tnum whitespace-nowrap bg-inset"
        style={isTop ? { boxShadow: 'inset 3px 0 0 0 rgba(199,211,232,0.85)' } : undefined}
      >
        ${r.strike.toFixed(2)}
        {isTop && <span className="ml-1.5 font-mono text-[8px] uppercase tracking-widest text-select">top</span>}
      </td>
      <td className={`px-2 py-1.5 text-right font-mono text-[11px] tnum ${r.distPct >= 0 ? 'text-bull' : 'text-bear'}`}>
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
            <span className="font-mono text-[9px] uppercase tracking-wider text-textSecondary">{ticker}</span>
            <span className="inline-flex items-center rounded-[3px] bg-textPrimary px-1.5 py-px font-mono text-[10px] font-bold tnum text-[#0a0a0a]">{spot.toFixed(2)}</span>
            <span className="h-px w-3 shrink-0 bg-textPrimary/50" />
          </span>
        </td>
      </tr>
    )}
  </>
);

export default GreeksRegime;
