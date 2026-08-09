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
  /** Leading metric on the strip — brighter value ink, no frame. */
  emphasis?: boolean;
  className?: string;
  /** Extra content below the value (e.g. a meter/bar) — not truncated */
  children?: React.ReactNode;
}

/*
  ================================================================
  This used to be a card, and the card was the problem.

  Every desk opened with a row of three-to-ten rounded `inst-surface` tiles,
  each holding a micro-caps label over a big number. It is the single most
  recognisable shape in machine-generated UI — the same row of boxes that
  ships on top of every dashboard template — and on this app it was doing real
  damage besides: on the Dark Pool tape at phone width that strip grew to 568px
  of chrome before the first row of data.

  The metric is now a cell on a ruled strip: label, value, sub-line, separated
  by hairlines and bounded by a rule top and bottom. No surface, no radius, no
  padding box. That is what the header of a terminal actually looks like, and
  it is the same information in roughly a third of the vertical space.

  The component keeps its name and its whole prop signature on purpose. Twenty
  three of these strips exist across twenty one files; changing what the
  primitive PAINTS fixes all of them at once and leaves nothing to drift out of
  sync, where twenty three hand edits would have been twenty three chances to
  leave one behind.
  ================================================================
*/
const StatCard = ({ label, value, sub, tone = 'neutral', emphasis = false, className = '', children }: StatCardProps) => {
  return (
    <div className={`min-w-0 h-full px-3 py-2 first:pl-0 ${className}`}>
      {/* Label and sub-line truncate — carry the text as a native title so a
          clipped metric is still readable. */}
      <div title={label} className="font-mono text-micro uppercase tracking-widest text-textMuted truncate">
        {preserveGreek(label)}
      </div>
      <div
        className={`mt-1 font-mono text-data font-semibold leading-none tnum truncate ${
          emphasis && tone === 'neutral' ? 'text-textPrimary' : toneText[tone]
        }`}
      >
        {value}
      </div>
      {sub && (
        <div title={titleOf(sub)} className="mt-1 font-mono text-micro text-textMuted leading-tight truncate">
          {sub}
        </div>
      )}
      {children && <div className="mt-1.5">{children}</div>}
    </div>
  );
};

export default StatCard;
