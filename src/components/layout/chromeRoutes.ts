/*
==================================================
  SLAYER TERMINAL - CHROME ROUTES (layout/chromeRoutes.ts)
  How much page furniture a route carries.

  One predicate, consulted by the shell for the footer and the back-to-top
  control, so the two can never disagree about what kind of surface a route is.
==================================================
*/

/**
 * Which footer a route ends on — two answers now, not three.
 *
 * `full` is the real thing: wordmark, sitemap, social, copyright, the
 * not-advice line. EVERY page gets it except Pulse.
 *
 * There used to be a `compact` variant — the same footer squeezed to one 53px
 * bar — worn by the four desks on the theory that a five-column sitemap under a
 * 240-row tape is furniture in the middle of the work. That reasoning is real
 * but it produced a site where a page's ending depended on which desk you were
 * standing on, and a reader arriving from anywhere else found the chrome had
 * quietly changed shape. A site ends the same way on every page; the exception
 * has to earn itself, and being dense does not.
 *
 * `null` is Pulse, and only Pulse. Pulse is the terminal: a fixed-height
 * workspace whose panels are dragged, resized and snapped against the bottom
 * edge of the viewport. Any footer at all turns that edge into a scroll seam —
 * the drag surface ends and a page begins, and the panel you are dragging
 * scrolls out from under the cursor. A terminal ends at the glass.
 */
const TERMINAL_ROUTES = ['/pulse'];

/**
 * A route matches a section when it IS that section or sits under it. The
 * separator is required: without it `/pulse-archive` would match `/pulse`.
 */
const matches = (routes: readonly string[], path: string) =>
  routes.some(r => path === r || path.startsWith(`${r}/`));

/** Pulse: a fixed workspace that owns the viewport and carries no page chrome. */
export const isTerminalRoute = (path: string): boolean => matches(TERMINAL_ROUTES, path);

export const footerVariant = (path: string): 'full' | null => (isTerminalRoute(path) ? null : 'full');
