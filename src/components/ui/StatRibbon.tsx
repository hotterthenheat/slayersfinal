import type { Tone } from './tones';
import { toneText } from './tones';

export interface RibbonStat {
  label: string;
  value: string;
  tone?: Tone;
  /** Render the value as a filled tone pill instead of plain text */
  pill?: boolean;
}

interface StatRibbonProps {
  stats: RibbonStat[];
  className?: string;
  /** 'center' fills a header/toolbar dead band; 'strip' is a full-width row */
  variant?: 'center' | 'strip';
}

const pillTone: Record<Tone, string> = {
  bull: 'bg-bull/10 text-bull',
  bear: 'bg-bear/10 text-bear',
  warn: 'bg-warn/10 text-warn',
  info: 'bg-flip/10 text-flip',
  select: 'bg-select/10 text-select',
  magenta: 'bg-king/10 text-king',
  neutral: 'bg-white/[0.05] text-textSecondary',
};

/**
 * Dense inline stat strip — the house cure for empty header/toolbar center
 * bands. Each cell is a mono label + value; a tone colors the value (paired
 * with the label, never color-only). Scrolls rather than wraps so it stays one
 * clean line inside a fixed-height bar.
 */
const StatRibbon = ({ stats, className = '', variant = 'center' }: StatRibbonProps) => {
  if (stats.length === 0) return null;
  return (
    <div
      className={`flex items-center gap-0 overflow-x-auto no-scrollbar ${
        variant === 'center' ? 'min-w-0' : 'w-full inst-surface rounded-md px-1'
      } ${className}`}
    >
      {stats.map((s, i) => (
        <div
          key={s.label}
          className={`flex items-baseline gap-1.5 px-3 py-1.5 whitespace-nowrap shrink-0 ${
            i > 0 ? 'border-l border-borderSubtle' : ''
          }`}
        >
          <span className="font-mono text-[10px] uppercase tracking-widest text-textSecondary">{s.label}</span>
          {s.pill ? (
            <span
              className={`font-mono text-[10px] font-semibold uppercase tracking-wider rounded px-1.5 py-0.5 ${
                pillTone[s.tone ?? 'neutral']
              }`}
            >
              {s.value}
            </span>
          ) : (
            <span className={`font-mono text-[12px] font-semibold tnum ${toneText[s.tone ?? 'neutral']}`}>
              {s.value}
            </span>
          )}
        </div>
      ))}
    </div>
  );
};

export default StatRibbon;
