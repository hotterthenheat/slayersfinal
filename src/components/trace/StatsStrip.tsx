/*
  The composition strip — the Live Tape's first row, promoted to every flow
  page (Noah, 2026-08-30: "i want the layout to look like this for each
  section", holding up the tape). Facts on the left, the page's champions as
  pills on the right, anchored by the magenta one. Each page keeps its OWN
  facts and its OWN rules for who earns a pill — only the shape is shared.
*/

import type { ReactNode } from 'react';

type Ink = 'supreme' | 'bull' | 'bear';

const TONE: Record<Ink, string> = {
  supreme: 'border-supreme/40 bg-supreme/[0.06] hover:bg-supreme/[0.12]',
  bull: 'border-bull/40 bg-bull/[0.05] hover:bg-bull/[0.1]',
  bear: 'border-bear/40 bg-bear/[0.05] hover:bg-bear/[0.1]',
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
    className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-md border font-mono transition-colors ${TONE[ink]}`}
  >
    <span className={`text-[8px] font-bold uppercase tracking-widest ${LABEL[ink]}`}>{label}</span>
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

const StatsStrip = ({ children, pills }: { children: ReactNode; pills?: ReactNode }) => (
  <div className="flex items-center gap-x-5 gap-y-2 flex-wrap border border-borderSubtle bg-panel rounded-md px-3.5 py-2 select-none">
    {children}
    {pills && <span className="ml-auto flex items-center gap-2 flex-wrap">{pills}</span>}
  </div>
);

export default StatsStrip;
