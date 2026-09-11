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

  ══ WHAT THE PANEL IS MADE OF NOW ══════════════════════════════════════════

  Three things, and the widths are in priority order:

    the TABLE    the strike and its net. Never goes.
    the LANE     the zero-anchored picture of the book. The reader's toggle.
    the DRAWER   everything that is about ONE strike — the legs, the greeks,
                 every window's change, the shortlist, the controls.

  The put and call columns are gone from the table (Noah: "i dont think you
  should have call and put on it at all times ... the overlay gives the
  infomation"), which is why the table's floor is a hundred and
  eighty-eight pixels rather than three hundred and fifty-two, and why a
  pane fits over it on a board where a rail did not.

  ══ WHAT GOES, AND IN WHICH ORDER ══════════════════════════════════════════

      the drawer  ->  the lane  ->  nothing else

  What NEVER goes: the spot rule, the strike numbers, the net, and the
  per-strike time strip — the strip costs no width at all, because it is
  drawn inside the cell the net figure already occupies.

  ══ AND HOW TALL THE TABLE IS ═════════════════════════════════════════════

  Noah, on a competitor's board: "you see how full on the screen and how
  well everything fits?" Theirs is full because it draws exactly as many
  strikes as the screen has rows for. Ours drew fifteen either side of spot
  whatever the screen was, which on a tall monitor left a third of the panel
  black and on a short one scrolled. FIT is the same arithmetic theirs is
  doing, stated: rows that fit the measured body, centred on the money, no
  scroll and no blank — see `fitReach`.
*/

/** One strike. A figure and a time strip in each cell — the leading is what
    keeps a column of money from reading as a block of digits. The panel
    draws with this and the fit arithmetic below counts with it; one
    definition, so they cannot disagree about how many rows a box holds. */
export const ROW_H = 29;
/** The two chain-edge rows, and the spot rule, which share the body with
    the strikes and are counted before them. */
export const EDGE_H = 18;
export const SPOT_H = 20;
/** The table is a table: however short the box, this many strikes are
    drawn, and the body scrolls. */
export const FIT_MIN = 7;

/**
 * Strikes a body this tall can hold without scrolling.
 *
 * The body carries two edge rows, the spot rule and the strikes, so this is
 * that sum inverted and floored — to the ROW, not to a symmetric span, so a
 * box with room for one more strike gets it rather than a strip of nothing
 * at the foot. It is read off the body's OWN measured height rather than
 * the panel's less a count of the chrome above it, because the chrome
 * changes with width — the book line drops clauses, the family tabs become
 * a cycler — and a count of it would be a guess where a measurement is
 * available.
 */
export function fitRows(bodyH: number): number {
  return Math.max(FIT_MIN, Math.floor((bodyH - 2 * EDGE_H - SPOT_H) / ROW_H));
}

export interface Density {
  /**
   * The drawer that comes out of the side of the pane.
   *
   * ══ IT MAY NOT TAKE ROOM THE FIGURES OR THE PICTURE NEED ════════════════
   *
   * The floor is arithmetic — see `drawerFloor`. Below it the drawer is not
   * drawn at rest; the reader can still open it, and it takes the panel
   * whole when they do, because a drawer squeezed to a hundred pixels is a
   * column of truncated words.
   *
   * `showDrawer` is whether there is room BESIDE the table — the reader's
   * stored preference applies there. `drawerW` is what the pane is when it
   * is open at this width, above the floor or below it, so the door is
   * offered everywhere: Noah, "where is the button to see the slider panel
   * comes and goes?" — it was gated on this flag, and below the floor there
   * was no button at all.
   */
  showDrawer: boolean;
  drawerW: number;
  /** How many shortlist rows there is room for under everything else. */
  loadedRows: number;
  /** Chrome font sizes. */
  chromeFont: number;
  labelFont: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** What the strike and the net want before anything else may have a pixel —
    `TABLE_MAX_PX` in BoardPanel, and the two must not drift apart. */
const TABLE_W = 216;

/** The panel's own horizontal padding and borders. */
const PAD = 16;

/**
 * The narrowest pane worth drawing.
 *
 * ══ THE READER SETS THE WIDTH; THESE ARE THE ENDS OF THE RANGE ════════════
 *
 * Noah: "let people be able to customize how big the slide screener is,
 * some people may want it smaller." The pane has a grip on its table edge
 * and a stored width per panel; what is fixed is only where the range
 * ends. Under 340 every grid in the pane reflows to fewer columns — see
 * `narrow` in Drawer.tsx — and 300 is where, with every section on and a
 * strike held, nothing inside is cut or truncated: measured at 260 a
 * change badge ran nineteen pixels past the edge and seven of the money
 * figures wore an ellipsis, which on a figure is a wrong number.
 */
const DRAWER_MIN_W = 300;

/** The width the pane OPENS at, absent a reader's own — two cards and a
    feed are not easier to read wider than this. A reader may drag past it
    up to `DRAWER_HARD_MAX`, or as far as the table allows, whichever comes
    first. */
const DRAWER_MAX_W = 460;
/** Past this a pane is a page. */
const DRAWER_HARD_MAX = 720;

/** A drawer shorter than this cannot hold the detail and the shortlist. */
const DRAWER_MIN_H = 380;

/**
 * What the panel must be able to hold before the overlay is offered.
 *
 * ══ IT FLOATS, SO IT MAY COVER THE PICTURE BUT NOT THE FIGURES ════════════
 *
 * The overlay lies over the lane, the way the reference lies over its chart,
 * and the lane is a picture a reader has chosen to look at THROUGH the panel
 * — that is fine. What it may not cover is the strike and its net, which
 * are the two things every card and every feed line is about. So the floor
 * is the table's own width plus the narrowest overlay worth drawing, and
 * the lane does not enter into it: the toggle changes what is under the
 * overlay, not whether there is room for one.
 */
export const drawerFloor = (_lane: boolean) => TABLE_W + DRAWER_MIN_W + PAD;

/**
 * How narrow and how wide the reader may drag the pane in a panel this
 * wide. The ceiling is whatever the table leaves — the pane may never
 * cover the strike or its net, which is the one rule the grip cannot
 * break — capped where a pane stops being a pane.
 */
export function paneBounds(w: number): { min: number; max: number } {
  const room = Math.round(w - TABLE_W - PAD);
  return { min: DRAWER_MIN_W, max: Math.max(DRAWER_MIN_W, Math.min(DRAWER_HARD_MAX, room)) };
}

/** What this panel can hold. `lane` is the reader's own choice and is kept
    in the signature because callers and proofs pass it; the overlay's
    arithmetic no longer depends on it — see `drawerFloor`. `paneW` is the
    reader's stored width, or null for the opening width. */
export function densityFor(w: number, h: number, lane: boolean, paneW: number | null = null): Density {
  void lane;
  const full = w >= 700;
  const showDrawer = w >= drawerFloor(lane) && h >= DRAWER_MIN_H;
  const bounds = paneBounds(w);
  /* The reader's width, held to the range; else the opening width —
     everything past the strike and the net, up to what two cards and a
     feed actually use. The lane under it is covered, not squeezed. */
  const beside =
    paneW != null && Number.isFinite(paneW)
      ? clamp(Math.round(paneW), bounds.min, bounds.max)
      : clamp(Math.round(w - TABLE_W - PAD), DRAWER_MIN_W, DRAWER_MAX_W);

  return {
    showDrawer,
    drawerW: showDrawer ? beside : Math.max(0, Math.round(w - PAD)),
    loadedRows: h >= 760 ? 5 : h >= 620 ? 4 : 3,
    chromeFont: full ? 10 : 9,
    labelFont: full ? 9 : 8,
  };
}
