import { BEAR, BULL } from './palette';

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
