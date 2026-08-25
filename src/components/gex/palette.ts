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

/*
  ── DEALER SIDE: GOLD AND STEEL ───────────────────────────────────────────

  Red and green carried TWO meanings in this terminal:

    1. price direction — candles, up/down, bull/bear verdicts, P&L, change %
    2. dealer side — who owns a strike's gamma, and whether hedging amplifies
       or absorbs

  On most surfaces only one is present, so it survived. On the live chart both
  are present at once, which is why the chart's own field already moved to
  gold/steel. `docs/dealer-ink-pass.md` (2026-08-22) made that the rule
  everywhere and specified these tokens — and then nothing implemented it, so
  the doc described a palette that did not exist while `PositioningMap` went on
  painting a dealer book in the candles' own red and green.

  A NOTE ON THE REVERSAL, because it is a real one. The block these replace
  recorded the opposite call: "the partner's redesign wears gold = SHORT gamma
  / blue = LONG gamma; Noah's call (2026-08-18) keeps his geometry and swaps
  the ink to the house market pair." The dealer-ink doc is dated four days
  later, argues the case explicitly, and is the more recent recorded decision,
  so it wins. To reverse it, point the four tokens below back at the market
  pair — every surface reads them from here now, which is the point.

  Gold and steel also separate by LUMINANCE as well as hue, so the dealer-side
  split survives red/green colour blindness. The old pair does not.
*/
/** Put-dominant, dealer hedging amplifies — bars, bands, lines. */
export const DEALER_PUT = '#F5C542';
/** Call-dominant, dips absorbed — bars, bands, lines. */
export const DEALER_CALL = '#E2EAF4';
/** Figures and labels. Gold reads on dark at 11px; platinum does not — at
    #E2EAF4 a number is indistinguishable from textPrimary, so the ink variant
    steps down to a tone that still reads as "steel" rather than "body text". */
export const DEALER_PUT_INK = '#F5C542';
export const DEALER_CALL_INK = '#AAB6C6';
