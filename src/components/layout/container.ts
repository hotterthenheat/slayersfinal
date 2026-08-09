/*
==================================================
  SLAYER TERMINAL - PAGE CONTAINER (layout/container.ts)
  One column the whole site lines up on.

  There were three, and they did not agree. The desks ran full-bleed with the
  shell's gutters; the Guide capped itself at max-w-5xl (1024px); the legal
  pages capped at max-w-6xl and then left-aligned an 768px prose column inside
  that, so the words sat left of the page's centre. Above and below all of it,
  the top bar and the footer ran edge to edge.

  The result was a narrow document floating inside full-bleed chrome — a page in
  the middle of the page — and, on the legal pages, one that was not even
  centred within its own box.

  Everything now shares this: the top bar's contents, the page body, and the
  footer. A page NEVER sets its own width. If a surface needs a narrower
  measure for reading, it centres that measure inside this container rather than
  shrinking the container.

  There is NO max-width. There was one — 1280px — and it was wrong for this
  product. A cap does not centre a terminal, it parks it: measured at a 1600px
  viewport the shell rendered 1280 wide at x=155, so 310px of the screen was
  painted background and nothing else, and the wide tables that are the whole
  point of a desk (the 13-column dark pool tape) had to scroll horizontally
  INSIDE that column while a third of the monitor sat empty beside them.

  So the column is the viewport minus the gutters, at every width. `mx-auto` is
  kept because `w-full` with no cap makes it a no-op today, and it is what makes
  the rule survive if a cap is ever reintroduced for a specific surface.

  Prose is a real exception to "fill the width" — a 2200px line is unreadable —
  but it is NOT an exception to this rule. There used to be a PROSE_MEASURE
  export here (`mx-auto w-full max-w-3xl`) that the legal pages centred inside
  the column, and it measured as 760px of untouched screen at 2560. It is gone.
  A page that needs short lines gets them by laying its content out in columns
  that consume the width, not by shrinking to the middle — see legal/LegalLayout.
==================================================
*/

/** Horizontal gutters — the same three steps every surface used already. */
export const PAGE_GUTTER = 'px-4 lg:px-6 2xl:px-8';

/** The shared column. Apply to a page body, the bar's contents, the footer. */
export const PAGE_CONTAINER = `mx-auto w-full ${PAGE_GUTTER}`;
