/*
==================================================
  SLAYER TERMINAL - EARNED INK (trace tables)

  Three registers per column, so a column is never
  a wall of one colour (Noah, 2026-08-30: "make the
  majority of the numbers be the same EXCEPT for
  the outliers... should we have a supreme outlier
  be magenta?" — yes, and 'supreme' is already the
  house's own word for exactly that ink):

    ordinary  the column's bulk — quiet gray, the
              "rest be normal"
    loud      the top quintile of what is actually
              on screen — earns WEIGHT (bold white)
              on magnitudes, DIRECTION ink on
              signed facts (the PressureMatrix rule)
    supreme   the single largest value in the
              column on this screen — the magenta
              standout family (#EA00FF: TOP PICK,
              the whale, the largest print). One
              champion per column, the way the tape
              chart marks its one LARGEST PRINT.

  Each column measures its OWN distribution over
  the rows on screen — sharing one bar would let a
  contracts column silently rank a percent column.
==================================================
*/

export interface InkMarks {
  /** The loud bar — 80th percentile of |value| among nonzero rows on screen */
  bar: number;
  /** The supreme bar — the largest |value| on screen */
  top: number;
}

export function earnMarks<T>(rows: T[], get: (r: T) => number): InkMarks {
  const v = rows
    .map(r => Math.abs(get(r)))
    .filter(x => x > 0)
    .sort((a, b) => a - b);
  if (v.length === 0) return { bar: Infinity, top: Infinity };
  return { bar: v[Math.floor(v.length * 0.8)], top: v[v.length - 1] };
}

/** A magnitude's ink: intensity is weight, never a hue — except the champion. */
export const weightInk = (v: number, m: InkMarks): string =>
  Math.abs(v) >= m.top ? 'text-supreme font-bold' : Math.abs(v) >= m.bar ? 'font-bold text-textPrimary' : 'text-textSecondary';

/** A signed fact's ink: direction colour once loud, magenta for the champion. */
export const directionInk = (v: number, m: InkMarks): string =>
  Math.abs(v) >= m.top
    ? 'text-supreme font-bold'
    : Math.abs(v) >= m.bar
      ? v > 0
        ? 'text-bull'
        : 'text-bear'
      : 'text-textSecondary';

/*
==================================================
  THE TAPE'S DOCTRINE
==================================================

  Written after measuring the rendered section rather than reading it: seven
  type sizes on every page (8, 9, 10, 11, 12, 13, 14 — four of them within
  three pixels of each other), 672 bordered rounded containers on the Live
  Tape alone, and 318 instances of the warning amber on one screen.

  TRACE IS NOT PINPOINT AND SHOULD NOT LOOK LIKE IT. Pinpoint is a STATE you
  study — where dealers are positioned, right now, in one book. Trace is a
  STREAM you scan: five hundred prints arriving newest-first, and the reader
  is hunting the one that matters. That difference sets the rules.

  THE ROW IS THE UNIT, NOT THE CARD. Five hundred rows means zero containers.
  A border that repeats on every row of a table has stopped separating
  anything and become texture — and the tape had one on every print, which
  is where most of those 672 came from. The columns already separate the
  columns.

  COLOUR MARKS THE EXCEPTION, NOT THE RULE. `earnMarks` above is the right
  idea and the section did not follow it: three registers per column,
  measured over what is actually on screen, so the ink lands on the outlier
  rather than on everything. A column where every cell is coloured has told
  the reader nothing.

  AND ONE FACT OWNS DIRECTION. This is the rule the tape broke worst. A
  single row carried green and red in three columns meaning three things:
  which side of the spread the print HIT (mechanical — bid or ask), how the
  day's volume split (a ratio), and what the print IMPLIES (bullish or
  bearish, which accounts for calls against puts). So a put sold on the bid
  read SELL in red, BID 93% in red, and BULLISH in green, all on one line.
  Both colours, three meanings, no way to tell them apart without reading
  the header.

  Direction is the INTERPRETATION — bullish or bearish — because that is
  what a reader means by the word. The mechanical facts keep their words and
  their bars, which say the same thing without spending the same ink.
*/

/**
 * The five sizes.
 *
 * NOT PINPOINT'S FIVE. That desk reads at 10/11/13/18/28; this one is a
 * denser surface and runs a notch tighter, and imposing the other section's
 * numbers on a five-hundred-row tape would be a scale chosen for somewhere
 * else. These are the sizes Trace was ALREADY using at volume — measured on
 * the rendered page, 10px on 5,498 nodes, 9px on 3,120, 11px on 2,511, each
 * with a job: the column head, the cell, the name.
 *
 * What went was the tail: 8px on two nodes, 12px on twenty-seven, 14px on
 * one. A size used once on a page is not a level of hierarchy, it is a
 * decision nobody made twice.
 */
export const TAPE = {
  /** Column heads, chip labels, units — the quietest register. */
  micro: 'font-mono text-[9px] uppercase tracking-wider',
  /** The cell. Every number in a table row lives here. */
  cell: 'font-mono text-[10px] tnum',
  /** The one thing in a row a reader is scanning FOR — a ticker, a strike. */
  name: 'font-mono text-[11px]',
  /** Prose, and a fact worth stopping on: a strip figure, a panel's answer. */
  figure: 'text-[13px]',
  /** The one number a page is about. */
  lead: 'font-mono text-[18px] tnum font-bold',
} as const;

/**
 * A mechanical side — which way the print crossed the spread.
 *
 * NO HUE AND NO CONTAINER. "BUY" and "SELL" are unambiguous words; a chip
 * around each of five hundred of them is 497 borders that separate nothing,
 * and the green/red spent on them is the ink direction needs.
 */
export const sideInk = (side: 'ASK' | 'BID' | 'MID'): string =>
  side === 'MID' ? 'text-textMuted' : 'text-textSecondary';
