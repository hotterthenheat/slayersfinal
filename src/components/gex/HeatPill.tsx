import type { ReactNode } from 'react';
import { heatCellStyle } from './heatmap';

/*
==================================================
  SLAYER TERMINAL - THE HEAT CELL, AS A PILL
  (components/gex/HeatPill.tsx)

  One cell of a heat surface: a rounded capsule
  carrying its own value, floating on the surface
  rather than tiling with its neighbours.

  WHY A PILL AND NOT A TILE. The old cell was the
  table cell — a flat rectangle with a background
  colour, edge to edge, so a row of them read as one
  continuous band and the eye had to find the seams
  before it could count columns. Reading a strike
  across five expiries meant tracking a colour change
  with no boundary to hold on to.

  A capsule with air around it is a COUNTABLE object.
  The gap does the work the borders used to: columns
  separate without a single rule being drawn, and a
  quiet cell reads as a quiet cell rather than as a
  gap in the band.

  THE COLOUR IS UNCHANGED, deliberately. This is the
  same `heatCellStyle` ramp every heat surface has
  used — gold is put-dominant and amplifying, steel
  is call-dominant and absorbing, ink is chosen by
  measured contrast against the fill it lands on.
  Only the SHAPE moved. A form change that also moves
  the colours is two changes wearing one commit, and
  the next person cannot tell which one they are
  looking at.
==================================================
*/

export interface HeatPillProps {
  /** Signed value — decides both the pole and the intensity. */
  value: number;
  /** The scale this surface paints against. */
  maxAbs: number;
  /** What to print inside. Right-aligned, because a column of numbers is read
      down its last digit, not its first. */
  children: ReactNode;
  /**
   * Ringed rather than recoloured.
   *
   * A selected cell cannot be marked by changing its fill: the fill IS the
   * value, and overriding it makes the one cell the reader is looking at the
   * one cell that no longer says what it holds.
   */
  selected?: boolean;
  /** Override the ring's colour — the king strike wears magenta, not the
      selection lime, because it is a property of the BOOK rather than of what
      the reader clicked. */
  ringColor?: string;
  /** A mark at the leading edge — the king strike, a held position. Sits in its
      own lane so it never collides with the number. */
  marker?: ReactNode;
  /** Height of the capsule. The row owns its rhythm; this only fills it. */
  className?: string;
  title?: string;
  onClick?: () => void;
}

/*
  The ring is the SELECTION voice (lime), not a heat colour, so it cannot be
  mistaken for a value. It is drawn as an inset shadow rather than a border:
  a border would add a pixel to the box and shift every neighbour by half a
  row when one cell is picked.
*/
const SELECTION_INK = '#D2FF00';
/* Two rings, not one: the accent alone vanishes against the ramp's bright
   platinum pole, so a dark outer ring gives it an edge to sit on at both ends
   of the scale. Same trick the old king cell used. */
const ring = (ink: string) => `inset 0 0 0 1.5px ${ink}, inset 0 0 0 3px rgba(10,10,10,0.8)`;

const HeatPill = ({
  value,
  maxAbs,
  children,
  selected = false,
  ringColor,
  marker,
  className = '',
  title,
  onClick,
}: HeatPillProps) => {
  const heat = heatCellStyle(value, maxAbs);
  return (
    <span
      title={title}
      onClick={onClick}
      style={{ ...heat, ...(selected ? { boxShadow: ring(ringColor ?? SELECTION_INK) } : null) }}
      className={`flex min-w-0 items-center justify-end gap-1 rounded-full px-2 font-mono text-[10px] font-semibold tnum leading-none transition-colors duration-700 ${
        onClick ? 'cursor-pointer' : ''
      } ${className}`}
    >
      {marker && <span className="mr-auto flex shrink-0 items-center">{marker}</span>}
      <span className="truncate">{children}</span>
    </span>
  );
};

export default HeatPill;

/*
  A RUN OF QUIET STRIKES, FOLDED.

  The reference collapses contiguous rows that carry nothing into a single
  line saying how many went. That is worth copying for a reason beyond space:
  a chain is mostly empty away from the money, and rendering forty near-zero
  rows at full height buries the dozen that matter inside a wall of almost-
  black. Folding them keeps the surface honest about where the book actually
  is, and says the count out loud so nothing is silently dropped.
*/
export const HiddenStrikes = ({ count, cols }: { count: number; cols?: number }) => (
  <div
    className="flex items-center gap-2 border-y border-dashed border-borderSubtle/50 px-2 py-[3px] font-mono text-[9px] uppercase tracking-wider text-textMuted"
    {...(cols ? { style: { gridColumn: `span ${cols}` } } : null)}
  >
    <span aria-hidden className="text-textMuted/60">
      ··
    </span>
    {count} {count === 1 ? 'strike' : 'strikes'} hidden
  </div>
);
