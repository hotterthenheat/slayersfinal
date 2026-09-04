import React from 'react';
import { toneText, type Tone } from './tones';

interface StatCardProps {
  label: React.ReactNode;
  value: React.ReactNode;
  /** Secondary line under the value (context, units, delta) */
  sub?: React.ReactNode;
  tone?: Tone;
  className?: string;
}

/** Compact data-first metric cell. */
const StatCard = ({ label, value, sub, tone = 'neutral', className = '' }: StatCardProps) => {
  return (
    <div className={`border border-borderSubtle bg-panel rounded-lg px-3.5 py-3 min-w-0 ${className}`}>
      <div className="font-mono text-[10px] uppercase tracking-widest text-textSecondary truncate">{label}</div>
      <div className={`mt-1.5 font-mono text-lg font-semibold leading-none ${toneText[tone]}`}>{value}</div>
      {/*
        TWO LINES, NOT ONE ELLIPSIS. `truncate` cost these sub-labels their
        whole sentence rather than a word: measured on /index-futures at
        1440, six of them were cut on one screen — "what the options are
        writte…", "The cash session — the hou…", and every one of the four
        VIX cards — the worst losing 158px of a sentence written to be read.

        A card whose explanatory line is unreadable is worse than a slightly
        taller card, so the line is allowed to wrap and clamps at two. The
        grid rows already size to their tallest card, so nothing shifts
        except the height of a row that needed it.
      */}
      {sub && <div className="mt-1.5 text-[11px] text-textMuted leading-tight line-clamp-2">{sub}</div>}
    </div>
  );
};

export default StatCard;
