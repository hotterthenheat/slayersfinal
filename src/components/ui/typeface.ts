/*
==================================================
  SLAYER TERMINAL - THE FAMILY NAME, ONCE

  Canvas and SVG chart code cannot read a Tailwind
  class, so it writes the font family out as a
  string. There were ten of those strings, each
  spelling the family by hand.

  That is one fact with eleven generators — the
  @font-face in index.css, the two Tailwind stacks,
  and eight chart literals — and the failure is
  silent by construction: rename the face and the
  DOM follows Tailwind while every chart label drops
  to the browser's default sans. Nothing throws,
  typecheck passes, and the only symptom is that
  axis ticks stop matching the table beside them.

  It bit exactly that way when SF Pro came out.
  Now there is one export, and scripts/font-proof.ts
  asserts it against the @font-face and the Tailwind
  stacks so the four cannot drift apart again.
==================================================
*/

/** The one family, spelled once. Chart code that cannot read a class uses this. */
export const FONT_FAMILY = "'Inter', sans-serif";

/** Same family, for the canvas 2D `ctx.font` shorthand (needs double quotes). */
export const canvasFont = (px: number, weight = ''): string =>
  `${weight ? `${weight} ` : ''}${px}px "Inter", sans-serif`;
