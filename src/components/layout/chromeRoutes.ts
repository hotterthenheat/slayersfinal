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
 * `null` is for a surface that OWNS THE VIEWPORT — a workspace measured against
 * the bottom edge of the glass rather than a document that ends somewhere.
 *
 * Pulse is one: a fixed-height workspace whose panels are dragged, resized and
 * snapped against that edge. Any footer at all turns it into a scroll seam —
 * the drag surface ends and a page begins, and the panel you are dragging
 * scrolls out from under the cursor.
 *
 * Terrain is the other, and it earns it on the same argument rather than on
 * being dense. Its canvas measures itself and draws to the pixels it is given,
 * so with a footer below it the two sizes become circular: the canvas fills the
 * space left over, the leftover depends on how tall the page is, and the page
 * is as tall as its content. Measured before the exception was made, that loop
 * settled with the canvas at 0px and the whole desk collapsed to its toolbar.
 *
 * The bar is the same for the next one: a fixed workspace that owns the
 * viewport, not a long page that would rather not be interrupted.
 */
const TERMINAL_ROUTES = ['/pulse', '/terrain'];

/**
 * A route matches a section when it IS that section or sits under it. The
 * separator is required: without it `/pulse-archive` would match `/pulse`.
 */
const matches = (routes: readonly string[], path: string) =>
  routes.some(r => path === r || path.startsWith(`${r}/`));

/** Pulse: a fixed workspace that owns the viewport and carries no page chrome. */
export const isTerminalRoute = (path: string): boolean => matches(TERMINAL_ROUTES, path);

export const footerVariant = (path: string): 'full' | null => (isTerminalRoute(path) ? null : 'full');
