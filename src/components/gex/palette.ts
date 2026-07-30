/*
  Canonical GEX chart colors — single source for JS-API consumers
  (lightweight-charts price lines, canvas primitives). The same values live in
  tailwind.config.ts as `flip` / `king` / `darkpool` tokens for class usage.
  Change here + there together, never one alone.
*/

export const CALL_WALL = '#30D158'; // bull (green — silver is selection-only, never direction)
export const PUT_WALL = '#FF3B30'; // bear (hot red)
export const FLIP = '#7DD3FC'; // baby blue — the regime border (cool against silver/red)
export const KING = '#EA00FF'; // magenta — engine-standout family (peak-exposure strike)
export const DARK_POOL = '#2dd4bf'; // teal — institutional reference prints
export const SPOT = '#ededed'; // white — where the market is
export const FOCUS = '#E4E8F4'; // holo silver — what the user clicked (selection language)

// Generic directional ink for JS-API chart consumers (trend lines, cumulative
// delta, sigma tails) — the same values as the bull/bear tokens in
// tailwind.config.ts, named by direction so a chart doesn't import "CALL_WALL"
// to color a line that isn't a wall.
export const BULL = '#30D158'; // up / support (Apple system green)
export const BEAR = '#FF3B30'; // down (hot red)

// Muted ink for SVG / JS-API chart consumers — axis ticks, reference-line
// labels, forward markers. Matches the `textMuted` Tailwind token, which was
// lifted #6b6b6b → #7d7d7d precisely so sub-12px labels clear AA (the old value
// measured ~3.7:1). Exported so a chart that can't reach a Tailwind class can't
// fork the old value back in.
export const MUTED_INK = '#7d7d7d';

// Dealer-gamma sign. The house reads gold = SHORT gamma (dealer hedging
// amplifies the move) and blue = LONG gamma (dips get absorbed). These were the
// only two structural colours with no token, so they were hard-coded at 15 sites
// across 9 files and drifted into six near-duplicates
// (#F0C45C #C89B3C #C49E3C #4E9EF0 #5270A8 #6E8CC6).
export const SHORT_GAMMA = '#E0B84E'; // gold — amplifying regime
export const LONG_GAMMA = '#5EA0EF'; // blue — absorbing regime

// Charm needs its own axis, not a borrowed one. It used to paint blue/gold,
// which is the gamma-sign pair, so a charm panel and a gamma panel side by side
// said opposite things in the same two colours.
export const CHARM_POS = FLIP; // cyan
export const CHARM_NEG = KING; // magenta
