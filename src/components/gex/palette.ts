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
