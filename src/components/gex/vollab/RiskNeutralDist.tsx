import { useState } from 'react';
import type { RndData } from '../../../types/gex';
import HoverReadout, { svgHoverIndex } from '../../ui/HoverReadout';

interface RiskNeutralDistProps {
  data: RndData;
}

const W = 100;
const H = 42;

/** Options-implied price density with σ markers — where the market prices the odds. */
const RiskNeutralDist = ({ data }: RiskNeutralDistProps) => {
  const { prices, density, forward, sigma1, sigma2, stats } = data;
  const lo = prices[0];
  const hi = prices[prices.length - 1];
  const span = hi - lo || 1;
  const x = (price: number) => ((price - lo) / span) * W;
  const [h, setH] = useState<{ i: number; x: number; y: number } | null>(null);

  // Market-implied cumulative probability below each grid price (density is the
  // plotting-normalised curve, so its running share IS the CDF).
  const total = density.reduce((s, d) => s + d, 0) || 1;
  const cumBelow = (idx: number): number => {
    let s = 0;
    for (let i = 0; i <= idx; i++) s += density[i];
    return (s / total) * 100;
  };

  const line = prices.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p).toFixed(2)},${(H - density[i] * (H - 4)).toFixed(2)}`).join(' ');
  const area = `${line} L${W},${H} L0,${H} Z`;

  const markers: { price: number; label: string; cls: string; dash?: string }[] = [
    { price: sigma2[0], label: '-2σ', cls: 'rgba(255,59,48,0.7)', dash: '2 2' },
    { price: sigma1[0], label: '-1σ', cls: 'rgba(143,143,143,0.7)', dash: '3 2' },
    { price: forward, label: 'Fwd', cls: '#ededed' },
    { price: sigma1[1], label: '+1σ', cls: 'rgba(143,143,143,0.7)', dash: '3 2' },
    { price: sigma2[1], label: '+2σ', cls: 'rgba(48,209,88,0.85)', dash: '2 2' },
  ];

  const statCells: { label: string; value: string; tone?: string }[] = [
    { label: 'Exp Move', value: `±${stats.expMoveAbs.toFixed(1)} (±${stats.expMovePct.toFixed(2)}%)` },
    { label: 'Skew', value: stats.skew.toFixed(2), tone: 'text-bear' },
    { label: 'Kurtosis', value: stats.kurtosis.toFixed(2) },
    { label: 'P(>+2σ)', value: `${stats.pAbove2.toFixed(2)}%` },
    { label: 'P(<-2σ)', value: `${stats.pBelow2.toFixed(2)}%` },
    { label: 'Risk Rev 25Δ', value: `${stats.riskReversal.toFixed(2)} vol`, tone: 'text-bear' },
    { label: 'Butterfly 25Δ', value: `${stats.butterfly.toFixed(2)} vol` },
  ];

  return (
    <div className="flex flex-col gap-2 h-full min-h-0">
      {/* Marker labels */}
      <div className="relative h-4 select-none">
        {markers.map(m => (
          <span
            key={m.label}
            className={`absolute -translate-x-1/2 font-mono text-micro tnum ${m.label === 'Fwd' ? 'text-textPrimary font-semibold' : 'text-textMuted'}`}
            style={{ left: `${x(m.price)}%` }}
          >
            {m.label} {m.price.toFixed(0)}
          </span>
        ))}
      </div>

      {/* Density */}
      <div className="flex-grow min-h-0">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="w-full h-full cursor-crosshair"
          role="img"
          aria-label="Options-implied risk-neutral price density with sigma markers"
          onMouseMove={e => setH({ i: svgHoverIndex(e, prices.length), x: e.clientX, y: e.clientY })}
          onMouseLeave={() => setH(null)}
        >
          <path d={area} fill="rgba(151,136,196,0.12)" />
          <path d={line} fill="none" stroke="rgba(151,136,196,0.9)" strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
          {markers.map(m => (
            <line
              key={m.label}
              x1={x(m.price)}
              y1="0"
              x2={x(m.price)}
              y2={H}
              stroke={m.cls}
              strokeWidth={m.label === 'Fwd' ? 0.7 : 0.5}
              strokeDasharray={m.dash}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {h && (
            <line x1={x(prices[h.i])} x2={x(prices[h.i])} y1={0} y2={H} stroke="rgba(255,255,255,0.4)" strokeWidth="0.4" vectorEffect="non-scaling-stroke" />
          )}
        </svg>
      </div>
      {h && prices[h.i] != null && (
        <HoverReadout x={h.x} y={h.y}>
          <div className="font-mono text-micro uppercase tracking-widest text-textMuted">
            {prices[h.i].toFixed(0)} · {((prices[h.i] - forward) / forward >= 0 ? '+' : '')}
            {(((prices[h.i] - forward) / forward) * 100).toFixed(1)}% vs fwd
          </div>
          <div className="mt-1 flex items-center gap-2.5 font-mono text-label tnum">
            <span className="text-bear">P&lt; {cumBelow(h.i).toFixed(1)}%</span>
            <span className="text-bull">P&gt; {(100 - cumBelow(h.i)).toFixed(1)}%</span>
          </div>
        </HoverReadout>
      )}
      <div className="flex justify-between font-mono text-micro tnum text-textMuted select-none">
        <span>{lo.toFixed(0)}</span>
        <span className="uppercase tracking-wider">underlying price</span>
        <span>{hi.toFixed(0)}</span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 pt-2 border-t border-borderSubtle">
        {statCells.map(s => (
          <span key={s.label} className="min-w-0">
            <span className="block font-mono text-micro uppercase tracking-widest text-textMuted truncate">{s.label}</span>
            <span className={`block font-mono text-micro font-semibold tnum ${s.tone ?? 'text-textPrimary'}`}>{s.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
};

export default RiskNeutralDist;
