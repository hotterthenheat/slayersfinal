/*
==================================================
  SLAYER TERMINAL - FLOW TOP (the table pages' head)

  One head for every Trace page that is a table —
  Screener, Footprints, Flow Alerts, Windows,
  Multi-Leg — in the LIVE TAPE's exact grammar
  (Noah, 2026-08-30: "why would my ticker/con
  search be on the left side for live tape and on
  the right side for the other pages? the
  formatting of the top sections should ALL be the
  same and i like the look of the live tape more").

  Two rows, same as the tape:
    controls  — search, filters, the page's own
                doors — on the LEFT, where you act;
                the screen's description and the
                row count on the RIGHT, where you
                glance.
    the read  — a labelled strip with a left rail
                (bull / bear / neutral), the
                sentence in the tape's own size,
                the ink key far right.

  Five pages, one component: the head cannot drift
  page to page again.
==================================================
*/

import type { ReactNode } from 'react';
import InkKey from './InkKey';

type Tone = 'bull' | 'bear' | 'neutral';

const RAIL: Record<Tone, string> = {
  bull: 'border-bull/70',
  bear: 'border-bear/70',
  neutral: 'border-borderMuted',
};

const FlowTop = ({
  children,
  hold,
  strip,
  tools,
  hint,
  count,
  read,
  readLabel,
  tone = 'neutral',
}: {
  /** The controls: search, filters, any page-specific door — left cluster */
  children: ReactNode;
  /** The Live/Paused hold — first in the left cluster, where the tape keeps it */
  hold?: ReactNode;
  /** The composition strip — facts + champion pills — above everything */
  strip?: ReactNode;
  /** Right-cluster tools beside the count: the column chooser */
  tools?: ReactNode;
  /** What this screen is — the right cluster's first item */
  hint: ReactNode;
  /** How many rows, and of how many — the right cluster's last item */
  count: ReactNode;
  /** The page's generated sentence (RichRead + doors) */
  read: ReactNode;
  /** The strip's label — "Book read", "Desk read" … the tape says "Tape read" */
  readLabel: string;
  /** Rail colour: the read's lean when it has one, neutral when it doesn't */
  tone?: Tone;
}) => (
  <>
    {strip}
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-3">
        {hold}
        {children}
      </div>
      <div className="ml-auto flex items-center gap-3 min-w-0">
        <span className="truncate font-mono text-[10px] text-textMuted uppercase tracking-wider">{hint}</span>
        {tools}
        <span className="tnum shrink-0 font-mono text-[10px] text-textMuted uppercase tracking-wider whitespace-nowrap">{count}</span>
      </div>
    </div>

    <div className={`flex items-start gap-2.5 border-l-2 pl-3 py-0.5 ${RAIL[tone]}`}>
      <span className="font-mono text-[9px] font-semibold uppercase tracking-widest text-textMuted pt-px shrink-0">{readLabel}</span>
      <p className="text-[11px] text-textSecondary leading-snug tnum line-clamp-2 flex-1 min-w-0">{read}</p>
      <InkKey className="pt-px" />
    </div>
  </>
);

export default FlowTop;
