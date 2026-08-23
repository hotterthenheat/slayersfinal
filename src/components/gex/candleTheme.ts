import { BEAR, BULL, FOCUS } from './palette';

/*
==================================================
  SLAYER TERMINAL - CANDLE THEME (gex/candleTheme.ts)
  What an up bar and a down bar are coloured.

  This file used to ship four themes and select a "signature" one: holographic
  silver up, luminous violet down, on the grounds that price should not compete
  with the analytics for the green/red channel.

  Measured on a single Pulse screen, that is not what it did. The price chart
  drew a down bar VIOLET while, in the same viewport, the cumulative delta drew
  down RED, the put wall drew red, the delta-by-price rows drew red and the GEX
  heatmap drew red. One concept, two colours, side by side — and price, the
  largest and most-looked-at object on the desk, was the one element speaking the
  minority language.

  Direction is direction. The candles now read off BULL and BEAR directly, so
  they are the same two values the walls, the tape, the flow and the exposure
  grid use, and they cannot drift from them: there is no second literal to
  update.

  The three unused variants went with the selector. A theme map with no UI to
  switch it is four palettes maintained and one rendered.
==================================================
*/

export interface CandleTheme {
  up: string;
  down: string;
  wickUp: string;
  wickDown: string;
  volUp: string;
  volDown: string;
}

/** `#RRGGBB` → `rgba(r,g,b,a)`. The chart libraries want volume as a tint, and
    an alpha hex suffix is not portable across lightweight-charts' parsers. */
const tint = (hex: string, alpha: number): string => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
};

export const candleTheme: CandleTheme = {
  up: BULL,
  down: BEAR,
  wickUp: BULL,
  wickDown: BEAR,
  // Volume sits behind price, so it takes the same hue at a fraction of the
  // weight rather than a colour of its own.
  volUp: tint(BULL, 0.28),
  volDown: tint(BEAR, 0.28),
};

/*
  THE MONOCHROME SET — for a chart where price is the backdrop, not the read.

  The paragraph above is right about Pulse and stays right: on a desk where the
  cumulative delta, the walls and the exposure grid are all speaking green and
  red, price has to speak it too or it is the one object on screen using a
  minority language.

  Terrain is not that desk. There is no delta panel and no flow grid on it —
  the colour on that screen belongs to the dealer's book, in the ladder and the
  gamma nodes, and a green-and-red candle chart underneath competes with the
  only thing the desk exists to show. It also puts a second directional language
  on a picture whose read is a REGIME, not a direction.

  So price goes monochrome there: hollow when it closed up, filled when it
  closed down, which is the oldest convention there is and needs no hue at all.
  Both inks derive from `FOCUS`, the holographic silver, so this is not a new
  colour — it is the interface accent at two weights.
*/

/** `#RRGGBB` dimmed toward black by `k` (0 = unchanged, 1 = black). */
const dim = (hex: string, k: number): string => {
  const n = parseInt(hex.slice(1), 16);
  const f = (ch: number) => Math.round(ch * (1 - k));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map(c => f(c).toString(16).padStart(2, '0')).join('')}`;
};

const SILVER = FOCUS;
const SILVER_DIM = dim(FOCUS, 0.42);

export const candleThemeMono: CandleTheme = {
  // Hollow: the body is unfilled and the border carries the bar. `transparent`
  // rather than the canvas colour, so a rail or a node drawn underneath still
  // shows through an up bar the way it does through the gaps between bars.
  up: 'transparent',
  down: SILVER_DIM,
  wickUp: SILVER,
  wickDown: SILVER_DIM,
  volUp: tint(SILVER, 0.16),
  volDown: tint(SILVER, 0.1),
};

/** Border inks for the hollow set — `CandleTheme` has no border fields because
    the directional set borders match its fills. */
export const MONO_BORDER = { up: SILVER, down: SILVER_DIM };
