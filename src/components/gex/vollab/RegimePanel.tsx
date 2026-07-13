import SignalBadge from '../../ui/SignalBadge';
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
          { label: 'Normal', cls: 'bg-white/20' },
          { label: 'High vol', cls: 'bg-bear/50' },
        ].map(item => (
          <span key={item.label} className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-textMuted">
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
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-full">
          <path d={bandPath(zero, lowTop)} fill="rgba(199,211,232,0.55)" />
          <path d={bandPath(lowTop, normTop)} fill="rgba(255,255,255,0.07)" />
          <path d={bandPath(normTop, fullTop)} fill="rgba(255,59,48,0.45)" />
        </svg>
      </div>
      <div className="flex justify-between font-mono text-[8px] text-textMuted select-none">
        {series.filter((_, i) => i % 6 === 0).map(s => (
          <span key={s.month}>{s.month}</span>
        ))}
        <span>{series[series.length - 1]?.month}</span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-5 gap-2 pt-2 border-t border-borderSubtle">
        {stats.map(s => (
          <span key={s.label} className="min-w-0">
            <span className="block font-mono text-[8px] uppercase tracking-widest text-textMuted truncate">{s.label}</span>
            <span className="block font-mono text-[10px] font-semibold tnum text-textPrimary">{s.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
};

export default RegimePanel;
