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

  The cap is deliberately generous. Below it the container is the full viewport
  minus gutters, which is what a dense desk wants and what every laptop gets; it
  only bites on very wide monitors, where an unbounded terminal stops being
  readable and starts being a smear.
==================================================
*/

/** Horizontal gutters — the same three steps every surface used already. */
export const PAGE_GUTTER = 'px-4 lg:px-6 2xl:px-8';

/** The shared column. Apply to a page body, the bar's contents, the footer. */
export const PAGE_CONTAINER = `mx-auto w-full max-w-[1800px] ${PAGE_GUTTER}`;

/**
 * A readable prose measure, centred in the container rather than pinned left.
 *
 * The legal pages had `max-w-3xl` inside a grid cell with no centring, which is
 * how their text ended up left of the page's midline while the chrome around it
 * was symmetric.
 */
export const PROSE_MEASURE = 'mx-auto w-full max-w-3xl';
