import { useState } from 'react';
import SignalBadge from '../../ui/SignalBadge';
import HoverReadout, { svgHoverIndex } from '../../ui/HoverReadout';
import type { RegimeData, VolRegime } from '../../../types/gex';
import type { Tone } from '../../ui/tones';

interface RegimePanelProps {
  data: RegimeData;
}

const W = 100;
const H = 40;

const regimeTone: Record<VolRegime, Tone> = {
  'LOW VOL': 'bull',
  NORMAL: 'neutral',
  'HIGH VOL': 'bear',
};

/** Stacked band path between cumulative series `lower` and `upper` (0–1). */
function bandPath(lower: number[], upper: number[]): string {
  const n = lower.length;
  const x = (i: number) => (i / (n - 1)) * W;
  const y = (v: number) => H - v * H;
  const top = upper.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(' ');
  const bottom = [...lower]
    .reverse()
    .map((v, i) => `L${x(n - 1 - i).toFixed(2)},${y(v).toFixed(2)}`)
    .join(' ');
  return `${top} ${bottom} Z`;
}

/** Vol-regime probability history (stacked) + current regime read. */
const RegimePanel = ({ data }: RegimePanelProps) => {
  const { series, current, prob, since, avgDurationDays, nextLow, nextHigh } = data;

  const lowTop = series.map(s => s.low);
  const normTop = series.map(s => s.low + s.normal);
  const fullTop = series.map(() => 1);
  const zero = series.map(() => 0);
  const [h, setH] = useState<{ i: number; x: number; y: number } | null>(null);
  const cx = (i: number) => (i / (series.length - 1)) * W;

  const stats: { label: string; value: string }[] = [
    { label: 'Confidence', value: `${prob}%` },
    { label: 'Since', value: since },
    { label: 'Avg Duration', value: `${avgDurationDays}d` },
    { label: 'Next Low 1M', value: `${nextLow}%` },
    { label: 'Next High 1M', value: `${nextHigh}%` },
  ];

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      {/* Legend + current badge */}
      <div className="flex items-center gap-3 flex-wrap select-none">
        {[
          { label: 'Low vol', cls: 'bg-bull/60' },
          { label: 'Normal', cls: 'bg-white/[0.18]' },
          { label: 'High vol', cls: 'bg-bear/50' },
        ].map(item => (
          <span key={item.label} className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-textMuted">
            <span className={`inline-block w-2.5 h-2 rounded-[2px] ${item.cls}`} />
            {item.label}
          </span>
        ))}
        <span className="ml-auto">
          <SignalBadge tone={regimeTone[current]} dot>
            {current}
          </SignalBadge>
        </span>
      </div>

      {/* Stacked probability bands */}
      <div className="flex-grow min-h-0">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="w-full h-full cursor-crosshair"
          role="img"
          aria-label="Volatility-regime probability history — low, normal and high vol bands"
          onMouseMove={e => setH({ i: svgHoverIndex(e, series.length), x: e.clientX, y: e.clientY })}
          onMouseLeave={() => setH(null)}
        >
          <path d={bandPath(zero, lowTop)} fill="rgba(48,209,88,0.5)" />
          <path d={bandPath(lowTop, normTop)} fill="rgba(255,255,255,0.18)" />
          <path d={bandPath(normTop, fullTop)} fill="rgba(255,59,48,0.45)" />
          {h && <line x1={cx(h.i)} x2={cx(h.i)} y1={0} y2={H} stroke="rgba(255,255,255,0.4)" strokeWidth="0.4" vectorEffect="non-scaling-stroke" />}
        </svg>
      </div>
      {h && series[h.i] && (
        <HoverReadout x={h.x} y={h.y}>
          <div className="font-mono text-[10px] uppercase tracking-widest text-textMuted">{series[h.i].month}</div>
          <div className="mt-1 flex items-center gap-2.5 font-mono text-[11px] tnum">
            <span className="text-bull">Low {Math.round(series[h.i].low * 100)}%</span>
            <span className="text-textSecondary">Norm {Math.round(series[h.i].normal * 100)}%</span>
            <span className="text-bear">High {Math.round(series[h.i].high * 100)}%</span>
          </div>
        </HoverReadout>
      )}
      <div className="flex justify-between font-mono text-[10px] text-textMuted select-none">
        {series.filter((_, i) => i % 6 === 0).map(s => (
          <span key={s.month}>{s.month}</span>
        ))}
        <span>{series[series.length - 1]?.month}</span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-5 gap-2 pt-2 border-t border-borderSubtle">
        {stats.map(s => (
          <span key={s.label} className="min-w-0">
            <span className="block font-mono text-[10px] uppercase tracking-widest text-textMuted truncate">{s.label}</span>
            <span className="block font-mono text-[10px] font-semibold tnum text-textPrimary">{s.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
};

export default RegimePanel;
