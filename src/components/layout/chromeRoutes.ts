/*
==================================================
  SLAYER TERMINAL - CHROME ROUTES (layout/chromeRoutes.ts)
  How much page furniture a route carries.

  One predicate, consulted by the shell for the footer and the back-to-top
  control, so the two can never disagree about what kind of surface a route is.
==================================================
*/

/**
 * Which footer a route ends on — three answers, not two.
 *
 * `full` is the real thing: wordmark, sitemap, social, copyright, the
 * not-advice line. Documents get it — the terminal index, the guide, the legal
 * pages, community, Stocks, Earnings, Tracker — because on a document the
 * footer IS the next thing you want.
 *
 * `compact` is the same footer as one bar. A desk is a working surface that
 * fills the screen with rows, and parking a five-column sitemap under a 240-row
 * tape is furniture in the middle of the work. The desk still closes properly —
 * wordmark, copyright, disclaimer, legal links — just in 53px rather than 503.
 *
 * `null` is Pulse, and only Pulse. Pulse is the terminal: a fixed-height
 * workspace whose panels are dragged, resized and snapped against the bottom
 * edge of the viewport. Any footer at all turns that edge into a scroll seam —
 * the drag surface ends and a page begins, and the panel you are dragging
 * scrolls out from under the cursor. A terminal ends at the glass.
 */
const DESK_ROUTES = ['/trace', '/pinpoint', '/compass', '/prove-it'];
const TERMINAL_ROUTES = ['/pulse'];

/**
 * A route matches a section when it IS that section or sits under it. The
 * separator is required: without it `/pulse-archive` would match `/pulse`.
 */
const matches = (routes: readonly string[], path: string) =>
  routes.some(r => path === r || path.startsWith(`${r}/`));

/** Pulse: a fixed workspace that owns the viewport and carries no page chrome. */
export const isTerminalRoute = (path: string): boolean => matches(TERMINAL_ROUTES, path);

export const footerVariant = (path: string): 'full' | 'compact' | null => {
  if (isTerminalRoute(path)) return null;
  return matches(DESK_ROUTES, path) ? 'compact' : 'full';
};
