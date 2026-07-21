import React from 'react';
import { toneText, toneDot, type Tone } from './tones';

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

/** Compact data-first metric cell — a machined slug with a tone spine. */
const StatCard = ({ label, value, sub, tone = 'neutral', emphasis = false, className = '' }: StatCardProps) => {
  const spine = tone !== 'neutral';
  return (
    <div
      className={`relative overflow-hidden ${emphasis ? 'inst-emphasis' : 'inst-surface'} rounded-md px-3.5 py-3 min-w-0 ${className}`}
    >
      {spine && (
        <span className={`absolute left-0 top-2 bottom-2 w-[2px] rounded-full ${toneDot[tone]}`} aria-hidden />
      )}
      <div className="flex items-center gap-1.5 min-w-0">
        <span
          className={`inst-eyebrow !h-2 ${emphasis ? 'holo-bar' : spine ? toneDot[tone] : 'bg-borderMuted'}`}
          aria-hidden
        />
        <div className="font-mono text-[10px] uppercase tracking-widest text-textSecondary truncate">{label}</div>
      </div>
      <div
        className={`mt-1.5 font-mono text-lg font-semibold leading-none tnum ${
          emphasis && tone === 'neutral' ? 'holo-text' : toneText[tone]
        }`}
      >
        {value}
      </div>
      {sub && (
        <div className="mt-1.5 pt-1.5 border-t border-white/[0.04] text-[11px] text-textMuted leading-tight truncate">
          {sub}
        </div>
      )}
    </div>
  );
};

export default StatCard;
