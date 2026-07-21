import React from 'react';
import { toneText, type Tone } from './tones';

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  /** Secondary line under the value (context, units, delta) */
  sub?: React.ReactNode;
  tone?: Tone;
  /** Hero metric — living holo frame instead of the flat machined surface */
  emphasis?: boolean;
  className?: string;
}

/** Compact data-first metric cell. Tone lives in the value, not in ornament. */
const StatCard = ({ label, value, sub, tone = 'neutral', emphasis = false, className = '' }: StatCardProps) => {
  return (
    <div className={`${emphasis ? 'inst-emphasis' : 'inst-surface'} rounded-md px-3.5 py-3 min-w-0 ${className}`}>
      <div className="font-mono text-[10px] uppercase tracking-widest text-textSecondary truncate">{label}</div>
      <div
        className={`mt-1.5 font-mono text-lg font-semibold leading-none tnum ${
          emphasis && tone === 'neutral' ? 'holo-text' : toneText[tone]
        }`}
      >
        {value}
      </div>
      {sub && <div className="mt-1 text-[11px] text-textMuted leading-tight truncate">{sub}</div>}
    </div>
  );
};

export default StatCard;
