import { heatInk } from './heatmap';
/*
  Canonical GEX chart colors — single source for JS-API consumers
  (lightweight-charts price lines, canvas primitives). The same values live in
  tailwind.config.ts as `flip` / `king` / `darkpool` tokens for class usage.
  Change here + there together, never one alone.
*/

/** Apple system green — the market's bullish voice (matches the `bull`
    tailwind token). JS-side chart code imports THIS; class-side uses `bull`. */
export const BULL = '#30D158';
/** Soft mint — the Neon candle theme's up-color, and nothing else. It used to
    ink the call-wall line too (Noah's call, 2026-07-24), reversed 2026-08-18:
    the wall line now reads in the same BULL green as every other bullish
    surface. */
export const CHART_MINT = '#CFFFB1';
/** Neon lime — the interface's voice (matches `select`). Selection, brand,
    extreme importance. Never market direction. */
export const LIME = '#D2FF00';

export const CALL_WALL = BULL; // green, not mint — reversed by Noah 2026-08-18
export const PUT_WALL = '#FF3B30'; // bear (hot red)
export const FLIP = '#9CA3AF'; // grey — the regime BORDER, deliberately quieter than direction
export const MOON = '#7DD3FC'; // baby blue — the overnight / after-hours voice
// The magenta `king` token — one king color everywhere. The chart line wore
// holo silver for a while, but silver didn't stand out (Noah, 2026-08-18),
// and it now collides with the heatmap's platinum steel pole. Magenta matches
// the KING badges, ranked-target tags and the positioning map's king rail.
export const KING = '#EA00FF';
export const DARK_POOL = '#2dd4bf'; // teal — institutional reference prints
export const SPOT = '#ededed'; // white — where the market is
export const FOCUS = LIME; // neon lime — what the user clicked (selection language)
/* Amber — a price the reader ASKED to be told about. Deliberately not FOCUS:
   lime already means "what you just clicked", which is transient and goes away,
   while an alert is standing and outlives the click. Amber is the ink the
   Alerts bell in the toolbar already wears, so the line and the control that
   made it match. It carries no market meaning and never marks one. */
export const ALERT = '#FF9500';

// Dealer-gamma sign, for the positioning map. The partner's redesign wears
// gold = SHORT gamma / blue = LONG gamma; Noah's call (2026-08-18) keeps his
// geometry and swaps the ink to the house market pair: red = SHORT gamma
// (dealer hedging amplifies the move), green = LONG gamma (dips absorbed).
// Same values as bull/bear — named by regime so a dealer-inventory surface
// doesn't import "BULL" to paint an absorbing book.
/*
  WHICH INK MEANS WHAT — the whole doctrine, because getting it half-right
  twice is what wrote this comment.

    HEAT (net exposure by strike, any grid or bar of it) — NOT from this
    file at all. heatmap.ts owns it: heatCellStyle for cells, heatRgb +
    heatMagnitude for bars, heatPoles for legends. Steel/gold house ramp,
    Noah's palette round 3, gamma-curved for heavy-tailed books, WCAG-solved
    cell ink. Its own header says "legends must derive from these, never
    hardcode" — that goes for the cells too.

    THE SIDE PAIR (below) — text ink for a CALL/PUT distinction: steel
    calls, gold puts. StrikePressureLadder carried these privately since
    2026-08-22; the glossary promises them by name.

    THE REGIME PAIR (SHORT_GAMMA/LONG_GAMMA) — the WORD on the flip strip
    and regime badges: red amplifying, green absorbing. Not for grids, not
    for bars, not for call/put columns.

    LEVELS — CALL_WALL green, PUT_WALL red, FLIP grey, KING magenta, SPOT
    white, above. A wall keeps its colour on every surface, including
    historical tables.

    ΔOI — no pair of its own: PressureMatrix's pattern, ↑/↓ in bull/bear
    text on significant deltas only.

  The failure mode this prevents: a new surface imports whatever pair is
  nearest and ships an industry-standard heatmap on a desk that spent three
  palette rounds moving off it.
*/
/* DERIVED FROM THE ACTIVE HEAT RAMP. These were literals of steel-gold's
   two poles, which made this file a SECOND generator of the pair it exists
   to be the single source of — the exact failure its own header warns
   about. `heatInk` is the text-legible step of each pole, which is what
   these two are for. */
export const CALL_SIDE = heatInk.neg; // the absorb side, as text
export const PUT_SIDE = heatInk.pos; // the amplify side, as text

export const SHORT_GAMMA = '#FF3B30'; // red — amplifying regime
export const LONG_GAMMA = BULL; // green — absorbing regime
