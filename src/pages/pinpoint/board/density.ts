/*
==================================================
  SLAYER TERMINAL - PANEL DENSITY
  (pages/pinpoint/board/density.ts)
==================================================

  ══ DENSITY IS MEASURED, NOT BREAKPOINTED ══════════════════════════════════

  A CSS breakpoint knows the window. It does not know that this is one of
  five panels sharing that window, so the same `xl:` that is roomy on a
  single board hides things that fit and shows things that do not. Every
  number below comes from the panel's OWN measured box.

  ══ WHAT SHRINKS, AND IN WHICH ORDER ═══════════════════════════════════════

  Not everything at once, and not proportionally — a terminal that scales
  uniformly until the text is unreadable has failed at exactly the size
  where it matters most. The order is the reader's priority order, from the
  outside in:

      the strike card  ->  the loaded list  ->  the whole rail
      ->  the longest windows in the flow band  ->  the profile lane

  The rail goes BEFORE the lane, not after it, because they are the same
  shortlist read two ways and only one of them is a picture of the book.

  What NEVER goes: the spot rule, the strike numbers, the leg bars, and the
  net. Those are the reading, and none of them costs width that is in
  contention — the bars are drawn inside cells the figures already occupy.

  ══ WHAT HAPPENS BELOW THE RAIL, HONESTLY ══════════════════════════════════

  This file used to claim the rail's three regions "stack under the ladder
  instead". They do not, and never did: below the floor they are simply not
  drawn, because stacking them would take the vertical room from the book,
  and the book is the page. What survives instead is the marking — a loaded
  strike keeps its rule down the row's left edge at every width — so the
  shortlist is still answerable when the list itself is gone.
*/

export interface Density {
  /**
   * The right-hand rail, which carries the flow overlay, the loaded list and
   * the strike card.
   *
   * ══ THE RAIL MAY NOT TAKE ROOM THE FIGURES STILL NEED ════════════════════
   *
   * The floor is arithmetic, not taste — see `RAIL_FLOOR`. It was 760, a
   * rounder number that happened to land between the two boards it decides,
   * and neither of them by measurement.
   */
  showRail: boolean;
  /**
   * ══ THE RAIL TAKES WHAT IS LEFT, NOT A SHARE ═════════════════════════════
   *
   * It was `w * 0.3`, written when the ladder was a page of its own and the
   * rail's only competition was empty space. On the merged board the rail
   * and the PROFILE LANE draw from the same slack, and a proportional rail
   * wins every time — at 788px it took 236 and left the lane 90, six pixels
   * under the floor, so two panels on a 1600 had a shortlist and no picture
   * of the book to find it in.
   *
   * The order is the reader's: the figures get `TABLE_MAX_PX`, the lane gets
   * its floor, and the rail gets the remainder between its own useful
   * minimum and the width past which a list of five strikes stops improving.
   */
  railW: number;
  /** The loaded-strike list — the first whole region to go. */
  showLoaded: boolean;
  /** How many loaded rows there is room for. */
  loadedRows: number;
  /** The change overlay's shape. */
  overlay: 'row' | 'column' | 'mini';
  /**
   * How many windows the overlay can actually draw.
   *
   * ══ A CONTROL THAT OVERFLOWS IS WORSE THAN A SHORTER ONE ════════════════
   *
   * The first cut laid out all seven at every width and the measurement
   * caught it immediately: at 377px the 4H entry ended a hundred pixels past
   * the panel's right edge, on top of the panel beside it. Not clipped —
   * ESCAPED, which is the failure that makes a board of five look broken.
   *
   * So the count is derived from the measured width, and the ones dropped
   * are the LONGEST windows: a panel too narrow for seven is a panel being
   * used for a quick read, and a quick read is about the last few minutes.
   */
  overlayWindows: number;
  /** Chrome font sizes. */
  chromeFont: number;
  labelFont: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** What the figures want before anything else may have a pixel — this is
    `TABLE_MAX_PX` in BoardPanel, and the two must not drift apart. */
const TABLE_W = 462;

/** The lane's own floor — `PROFILE_MIN_PX` in BoardPanel. */
const LANE_W = 96;

/** The panel's own horizontal padding and borders. */
const PAD = 16;

/** Narrower than this a rail holds a heading and a truncated line. */
const RAIL_MIN_W = 210;

/** Wider than this a list of five strikes stops getting easier to read. */
const RAIL_MAX_W = 360;

/**
 * What the table AND the lane want before the rail may have anything.
 *
 * ══ THE RAIL NEVER COSTS THE BOOK ITS PICTURE ═════════════════════════════
 *
 * The lane is the board's one drawing: the whole book on one centre line,
 * put-dominant one way and call-dominant the other, with the shortlist
 * marked where it lives. The rail is a ranking and a card — the same
 * shortlist, read a second way. When a panel can afford only one of them,
 * the picture wins, so the rail's floor includes the lane's floor rather
 * than competing with it.
 *
 * At 708px — two panels on a 1440 — a rail fits and a rail plus a lane does
 * not, and a floor of 688 bought the list by deleting the drawing. 784 is
 * what both actually cost.
 */
const RAIL_FLOOR = TABLE_W + LANE_W + RAIL_MIN_W + PAD;

/** A rail shorter than this holds a heading and nothing under it. */
const RAIL_MIN_H = 380;

/** What this panel can hold. */
export function densityFor(w: number, h: number): Density {
  const full = w >= 700;
  const showRail = w >= RAIL_FLOOR && h >= RAIL_MIN_H;

  return {
    showRail,
    railW: showRail ? clamp(Math.round(w - TABLE_W - LANE_W - PAD), RAIL_MIN_W, RAIL_MAX_W) : 0,
    showLoaded: showRail ? h >= 470 : h >= 560,
    loadedRows: showRail ? (h >= 620 ? 5 : 3) : 3,
    overlay: showRail ? 'column' : w >= 520 ? 'row' : 'mini',
    /* Measured from the room each entry needs — a label, a figure and an
       acceleration mark — against what is left after the band's own
       content. The rail stacks them vertically and has room for all. */
    overlayWindows: showRail
      ? 7
      : w >= 520
        ? clamp(Math.floor((w - 250) / 72), 3, 7)
        : clamp(Math.floor((w - 62) / 66), 3, 6),
    chromeFont: full ? 10 : 9,
    labelFont: full ? 9 : 8,
  };
}
