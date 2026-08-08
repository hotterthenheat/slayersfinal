/*
==================================================
  SLAYER TERMINAL - FOCUS RINGS (ui/focusRing.ts)
  One ring for dark surfaces, one for the silver ones.

  The app has a single focus ring — a 1px inset silver hairline — and index.css
  carries the same thing as a bare `:focus-visible` outline for everything that
  does not spell it out. That works because almost every surface in the terminal
  is near-black.

  It stops working the moment a control is painted on holographic silver. Three
  of them are: the terminal index's Resume button, the tape's jump-to-live pill,
  and the trailer's replay button. All three set `outline-none` — which throws
  away the browser's own indicator — and then drew a silver ring on silver. Two
  of them were inset, so the ring landed entirely inside the foil and vanished;
  the third sat flush outside it and simply made the pill look 2px fatter.

  ON_HOLO is the same idea inverted: ink, outside the pill, with a canvas-tinted
  offset so it reads as a ring rather than a thicker border. Ink on the foil
  measures about 16:1.

  The dark-surface spelling below is the one the rest of the app already uses
  verbatim; it lives here so the two are defined together and so the guard in
  focusRing.test.ts has something to compare against. Existing call sites are
  deliberately NOT rewritten to import it — they are already identical strings,
  and a sixty-file mechanical edit is churn, not craft.
==================================================
*/

/** The house ring: a silver hairline inside the control. Dark surfaces only. */
export const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-select/60';

/** For controls painted on `holo-bg`, where a silver ring is invisible. */
export const FOCUS_RING_ON_HOLO =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-1 focus-visible:ring-offset-canvas';
