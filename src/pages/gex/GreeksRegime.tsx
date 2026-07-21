import { useMemo } from 'react';
import { Grid3x3, Clock, Waves } from 'lucide-react';
import { useMarketData } from '../../context/MarketDataContext';
import { buildGreeksRegime, GREEKS, type DealerRegime, type GreekKey, type GreekRow } from '../../data/greeksmatrix';
import { SPOT } from '../../components/gex/palette';
import Panel from '../../components/ui/Panel';
import StatCard from '../../components/ui/StatCard';
import MetricGrid from '../../components/ui/MetricGrid';
import SignalBadge from '../../components/ui/SignalBadge';
import type { Tone } from '../../components/ui/tones';

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

/** Per-cell exposure heatmap — silver for dealer-supportive, red for amplifying. */
const GreekCell = ({ value, max }: { value: number; max: number }) => {
  const intensity = Math.min(1, Math.abs(value) / (max || 1));
  const pos = value >= 0;
  const bg = pos ? `rgba(199,211,232,${0.06 + intensity * 0.34})` : `rgba(255,59,48,${0.06 + intensity * 0.34})`;
  return (
    <td className="px-2 py-1.5 text-right" style={{ background: bg }}>
      <span className={`font-mono text-[10.5px] tnum ${pos ? 'text-textPrimary' : 'text-bear'}`}>{fmtC(value)}</span>
    </td>
  );
};

/** Charm clock — dealer delta drift accelerating into the close. */
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
      {/* last-hour shade */}
      <rect x={X(points.length - 3)} y={0} width={W - X(points.length - 3)} height={H} fill="rgba(255,149,0,0.06)" />
      <path d={area} fill={up ? 'rgba(199,211,232,0.14)' : 'rgba(255,59,48,0.14)'} />
      <path d={points.map((p, i) => `${i === 0 ? 'M' : 'L'}${X(i).toFixed(1)},${Y(p.deltaShift).toFixed(1)}`).join(' ')} fill="none" stroke={up ? '#C7D3E8' : '#FF3B30'} strokeWidth={1.75} />
      <text x={X(points.length - 3) + 4} y={12} fontSize={8} fill="#FF9500" fontFamily="monospace">POWER HOUR</text>
    </svg>
  );
};

/** Vanna shock — dealer hedge vs an IV move (not a price move). */
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
      <path d={points.map((p, i) => `${i === 0 ? 'M' : 'L'}${X(i).toFixed(1)},${Y(p.hedgeUsd).toFixed(1)}`).join(' ')} fill="none" stroke="#7DD3FC" strokeWidth={1.75} />
      <text x={6} y={H - 4} fontSize={8} fill="#a1a1aa" fontFamily="monospace">−3% IV</text>
      <text x={W - 40} y={H - 4} fontSize={8} fill="#a1a1aa" fontFamily="monospace">+3% IV</text>
    </svg>
  );
};

const GreeksRegime = () => {
  const { marketData } = useMarketData();
  const view = useMemo(() => (marketData ? buildGreeksRegime(marketData) : null), [marketData]);

  if (!view) {
    return (
      <Panel title="Greeks & Regime">
        <div className="h-40 flex items-center justify-center font-mono text-xs text-textMuted">Building the exposure surface…</div>
      </Panel>
    );
  }

  const colMax = Object.fromEntries(
    GREEKS.map(g => [g.key, Math.max(...view.rows.map(r => Math.abs(r[g.key])), 1)])
  ) as Record<GreekKey, number>;
  const aboveCount = view.rows.filter(r => r.distPct > 0).length;
  const dominant = GREEKS.map(g => ({ g, v: Math.abs(view.netByGreek[g.key]) }))
    .filter(x => ['vanna', 'charm', 'vomma', 'speed', 'color', 'ultima'].includes(x.g.key))
    .sort((a, b) => b.v - a.v)[0];

  return (
    <>
      <MetricGrid min="170px">
        <StatCard label="Dealer regime" value={view.topRegime.regime} sub={`${view.topRegime.prob}% probability`} tone={regimeTone[view.topRegime.regime]} />
        <StatCard label="Net gamma" value={fmtC(view.netByGreek.gamma)} sub={view.netByGreek.gamma >= 0 ? 'long — dampening' : 'short — amplifying'} tone={view.netByGreek.gamma >= 0 ? 'bull' : 'bear'} />
        <StatCard label="Vanna / +1% IV" value={fmtC(view.vannaPerVol)} sub={view.vannaPerVol >= 0 ? 'vol pop → dealers buy' : 'vol pop → dealers sell'} tone="select" />
        <StatCard label="Charm to close" value={fmtC(view.charmToClose)} sub="delta dealers shed by 16:00" tone={view.charmToClose >= 0 ? 'bull' : 'bear'} />
        <StatCard label="Dominant higher-order" value={dominant.g.label} sub={dominant.g.blurb} tone="magenta" />
      </MetricGrid>

      {/* Full greek exposure matrix */}
      <Panel
        title={
          <span className="inline-flex items-center gap-1.5">
            <Grid3x3 className="w-3.5 h-3.5" /> Full greek exposure matrix
          </span>
        }
        subtitle="net dealer $ by strike — silver supports, red amplifies"
        flush
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-[#0c0c0c] border-b border-borderSubtle">
                <th className="px-3 py-2 text-left font-mono text-[10px] font-semibold uppercase tracking-wider text-textMuted">Strike</th>
                <th className="px-2 py-2 text-right font-mono text-[10px] font-semibold uppercase tracking-wider text-textMuted">Dist</th>
                {GREEKS.map(g => (
                  <th key={g.key} className="px-2 py-2 text-right font-mono text-[10px] font-semibold uppercase tracking-wider text-textMuted" title={g.blurb}>
                    {g.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {view.rows.map((r, i) => (
                <RowWithSpot key={r.strike} r={r} colMax={colMax} showSpot={i === aboveCount - 1} ticker={view.ticker} spot={view.spot} />
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* Dealer regime probability */}
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
          </div>
        </Panel>

        {/* Charm clock + vanna shock */}
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
const RowWithSpot = ({ r, colMax, showSpot, ticker, spot }: { r: GreekRow; colMax: Record<GreekKey, number>; showSpot: boolean; ticker: string; spot: number }) => (
  <>
    <tr className="border-b border-borderSubtle/40 hover:bg-white/[0.02]">
      <td className="px-3 py-1.5 font-mono text-xs font-semibold text-textPrimary tnum whitespace-nowrap">${r.strike.toFixed(2)}</td>
      <td className={`px-2 py-1.5 text-right font-mono text-[10px] tnum ${r.distPct >= 0 ? 'text-bull' : 'text-bear'}`}>
        {r.distPct >= 0 ? '+' : ''}
        {r.distPct.toFixed(1)}%
      </td>
      {GREEKS.map(g => (
        <GreekCell key={g.key} value={r[g.key]} max={colMax[g.key]} />
      ))}
    </tr>
    {showSpot && (
      <tr>
        <td colSpan={10} className="px-3 py-0.5">
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
