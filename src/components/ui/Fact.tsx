import React from 'react';

/**
 * Dot-leader evidence row — the vitals-strip grammar, used wherever a
 * paragraph used to narrate the same numbers (Mo, 2026-08-19: "show the
 * evidence... then a very small conclusion underneath"). Label whispers,
 * leader dots bridge, the value speaks in bright tabular figures. Pass a
 * <Term> as the label when the word needs explaining.
 */
const Fact = ({
  label,
  value,
  valueCls = 'text-textPrimary',
  hint,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  valueCls?: string;
  /**
   * The caveat that belongs TO the number rather than beside it — what was
   * counted, what it was counted against. A row carrying one says so with
   * the help cursor, the same tell the news grades use, so a reader can see
   * there is more here without a marker competing with the figure.
   */
  hint?: string;
}) => (
  <span className={`flex items-baseline gap-2 min-w-0 font-mono ${hint ? 'cursor-help' : ''}`} title={hint}>
    <span className="text-[10px] uppercase tracking-wider text-textSecondary shrink-0">{label}</span>
    <span className="flex-1 self-center border-b border-dotted border-white/15" />
    <span className={`text-[13px] font-bold tnum ${valueCls}`}>{value}</span>
  </span>
);

export default Fact;
