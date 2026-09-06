/*
  The composition strip — the Live Tape's first row, promoted to every flow
  page (Noah, 2026-08-30: "i want the layout to look like this for each
  section", holding up the tape). Facts on the left, the page's champions as
  pills on the right, anchored by the magenta one. Each page keeps its OWN
  facts and its OWN rules for who earns a pill — only the shape is shared.
*/

import type { ReactNode } from 'react';

type Ink = 'supreme' | 'bull' | 'bear';

/* The pill's tint and border were doing what its LABEL already does — the
   word "TOP BEAR" is not ambiguous — so the container goes and the label
   keeps its ink. A pill is still a door onto a row, so it still lights on
   hover; it just does not need a box at rest to say so. */
const TONE: Record<Ink, string> = {
  supreme: 'hover:bg-supreme/[0.1]',
  bull: 'hover:bg-bull/[0.08]',
  bear: 'hover:bg-bear/[0.08]',
};
const LABEL: Record<Ink, string> = { supreme: 'text-supreme', bull: 'text-bull', bear: 'text-bear' };

/** The tape's whale chip, generalised — a labelled door onto one row. */
export const FactPill = ({
  label,
  ink,
  onOpen,
  title = 'Open the in-depth review',
  children,
}: {
  label: string;
  ink: Ink;
  onOpen: () => void;
  title?: string;
  children: ReactNode;
}) => (
  <button
    onClick={onOpen}
    title={title}
    className={`inline-flex items-center gap-2 px-2 py-1 font-mono transition-colors ${TONE[ink]}`}
  >
    <span className={`text-[9px] font-bold uppercase tracking-widest ${LABEL[ink]}`}>{label}</span>
    <span className="text-[11px] font-semibold tnum text-textPrimary whitespace-nowrap">{children}</span>
  </button>
);

/** A fact in the strip: a figure with its word. */
export const Fact = ({ value, children, tone }: { value: ReactNode; children?: ReactNode; tone?: string }) => (
  <span className={`font-mono text-[10px] tnum whitespace-nowrap ${tone ?? 'text-textSecondary'}`}>
    <span className="text-textPrimary font-semibold">{value}</span>
    {children ? <> {children}</> : null}
  </span>
);

/* THE STRIP IS A LINE, NOT A PANEL. It carried a border, a fill and a
   radius — a card wrapped around one row of facts, on every flow page. A
   hairline under it separates it from the table below at a twelfth of the
   ink, and the facts sit on the page's own ground like everything else. */
const StatsStrip = ({ children, pills }: { children: ReactNode; pills?: ReactNode }) => (
  <div className="flex items-center gap-x-5 gap-y-2 flex-wrap border-b border-borderSubtle px-0.5 py-2 select-none">
    {children}
    {pills && <span className="ml-auto flex items-center gap-2 flex-wrap">{pills}</span>}
  </div>
);

export default StatsStrip;
