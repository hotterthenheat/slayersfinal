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
export const FLIP = '#7DD3FC'; // baby blue — the regime border (cool against green/red)
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
  THE SIDE PAIR, distinct from the regime pair below.

  A CALL/PUT distinction is not a regime read, and this desk has always
  drawn them differently: red/green says "amplifying or absorbing", steel
  and gold say "call side or put side". StrikePressureLadder has carried
  these two literals privately since 2026-08-22 and the glossary already
  promises them by name ("in gold", "in steel"); they live here now so a new
  surface reaches for the right pair instead of the nearest one. P-12's
  first cut used the regime ink for its Calls and Puts columns — the
  screenshots caught it.
*/
export const CALL_SIDE = '#AAB6C6'; // platinum steel — the call side
export const PUT_SIDE = '#F5C542'; // honey gold — the put side

export const SHORT_GAMMA = '#FF3B30'; // red — amplifying regime
export const LONG_GAMMA = BULL; // green — absorbing regime
