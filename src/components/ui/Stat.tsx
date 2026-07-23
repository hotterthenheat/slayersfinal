import React from 'react';
import { toneText, type Tone } from './tones';

interface StatProps {
  /** Micro-caps label above the value. */
  label: React.ReactNode;
  /** The metric itself — tinted by `tone`. Numeric values read with `tnum`. */
  value: React.ReactNode;
  /** Optional secondary line under the value (units, context, delta). */
  sub?: React.ReactNode;
  /** Directional / status colour, applied to the value only. Defaults to neutral. */
  tone?: Tone;
  /** Right-align the cell — for right-hand or numeric grids. Defaults to left. */
  align?: 'left' | 'right';
  className?: string;
}

/**
 * Dense metric cell — the compact sibling of {@link StatCard} for inline grids
 * and stat rows. One machined `inst-surface` tile: a micro-caps label, a
 * data-size value tinted by `tone`, and an optional sub-line. Tone lives in the
 * value, never in the chrome (house rule). Reach for StatCard when the metric
 * is a hero readout that wants the larger frame.
 */
const Stat = ({ label, value, sub, tone = 'neutral', align = 'left', className = '' }: StatProps) => (
  <div className={`inst-surface rounded-md px-2.5 py-2 min-w-0 ${align === 'right' ? 'text-right' : ''} ${className}`}>
    <div className="font-mono text-micro uppercase tracking-widest text-textMuted truncate">{label}</div>
    <div className={`mt-0.5 font-mono text-data font-semibold tnum truncate ${toneText[tone]}`}>{value}</div>
    {sub && <div className="mt-0.5 text-micro text-textMuted leading-tight truncate">{sub}</div>}
  </div>
);

export default Stat;
