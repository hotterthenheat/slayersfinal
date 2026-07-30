import React from 'react';
import { toneText, type Tone } from './tones';
import { titleOf } from './truncation';
import { preserveGreek } from './greek';

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  /** Secondary line under the value (context, units, delta) */
  sub?: React.ReactNode;
  tone?: Tone;
  /** Hero metric — living holo frame instead of the flat machined surface */
  emphasis?: boolean;
  className?: string;
  /** Extra content below the value (e.g. a meter/bar) — not truncated */
  children?: React.ReactNode;
}

/** Compact data-first metric cell. Tone lives in the value, not in ornament. */
const StatCard = ({ label, value, sub, tone = 'neutral', emphasis = false, className = '', children }: StatCardProps) => {
  return (
    <div className={`${emphasis ? 'inst-emphasis' : 'inst-surface'} rounded-md px-3.5 py-3 min-w-0 ${className}`}>
      {/* Label and sub-line truncate — carry the text as a native title so a
          clipped metric is still readable. */}
      <div title={label} className="font-mono text-label uppercase tracking-widest text-textSecondary truncate">
        {preserveGreek(label)}
      </div>
      <div
        className={`mt-1.5 font-mono text-lg font-semibold leading-none tnum ${
          emphasis && tone === 'neutral' ? 'text-textPrimary' : toneText[tone]
        }`}
      >
        {value}
      </div>
      {sub && (
        <div title={titleOf(sub)} className="mt-1 text-label text-textMuted leading-tight truncate">
          {sub}
        </div>
      )}
      {children && <div className="mt-1.5">{children}</div>}
    </div>
  );
};

export default StatCard;
