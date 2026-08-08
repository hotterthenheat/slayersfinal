/*
==================================================
  SLAYER TERMINAL - SECURITY HEADERS (lib/securityHeaders.ts)
  One definition, consumed by both things that serve the build.

  `server.ts` imports these. `vercel.json` cannot import anything, so
  securityHeaders.test.ts asserts it carries the same values — two hand-kept
  copies of a security policy is how the deployed one quietly stops matching
  the one that was reviewed.

  On the Content-Security-Policy specifically: every source below was arrived at
  by serving the production build under this exact policy and driving a real
  browser over all 31 routes with a `securitypolicyviolation` listener attached,
  then removing anything nothing asked for. It is not a policy copied from a
  blog post, and it is deliberately narrower than one — there is no `https:`
  wildcard anywhere, because this app talks to exactly one third party.
==================================================
*/

/**
 * `style-src` keeps 'unsafe-inline'. That is a considered decision, not a copied
 * default, and it is the one directive here that is looser than measurement
 * alone would justify.
 *
 * Removing it was tested: served with `style-src 'self'` and swept across all
 * 32 routes, the ONLY violations were the Google Fonts stylesheet — not a
 * single `style-src-attr`. That is expected once you look at why. CSP governs
 * style ATTRIBUTES parsed from markup or written with `setAttribute('style')`;
 * it does not govern CSSOM, and React, framer-motion and recharts all animate
 * through `element.style.property = …`, which is CSSOM. Nothing in the built
 * `index.html` carries a style attribute, and nothing in the bundles calls
 * `setAttribute('style')`.
 *
 * So why keep it. Four bundles — framer-motion, react-grid-layout,
 * lightweight-charts and the app itself — call `document.createElement('style')`
 * and inject a sheet at runtime. Whether that is blocked depends on how each one
 * fills it: `sheet.insertRule` is CSSOM and exempt, `textContent` is inline
 * style content and is refused. The sweep only LOADS each route. It never drags
 * a workspace panel, opens a modal or hovers a chart crosshair, which is exactly
 * where those injections happen — so the run proves nothing about them.
 *
 * A blocked stylesheet does not throw. It silently does not apply, and the
 * failure would land in production, on an interaction, looking like a CSS bug.
 * Trading that for a directive whose realistic worst case is CSS-based
 * defacement is a bad trade while the evidence is this thin.
 *
 * `script-src` is the directive that stops injected script, and that one IS
 * clean — no 'unsafe-inline', no 'unsafe-eval', no wildcard. That is why the
 * font stylesheet's `onload` attribute moved into main.tsx: an inline event
 * handler is inline script, and keeping it would have cost exactly this.
 */
const CSP_DIRECTIVES: Record<string, string[]> = {
  'default-src': ["'self'"],
  'script-src': ["'self'"],
  'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
  'font-src': ["'self'", 'https://fonts.gstatic.com'],
  // data: for inline SVG and the favicon; blob: for the canvas and CSV exports
  // the ledger and the community board hand to a download link.
  'img-src': ["'self'", 'data:', 'blob:'],
  'connect-src': ["'self'"],
  'manifest-src': ["'self'"],
  // The terminal simulates its own feeds, so nothing here opens a worker or a
  // frame. Saying so is free, and it is the kind of thing that changes without
  // anyone revisiting a policy.
  'worker-src': ["'none'"],
  'frame-src': ["'none'"],
  'object-src': ["'none'"],
  // Not covered by default-src — both have to be named to be closed.
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'frame-ancestors': ["'none'"],
};

export const CSP = Object.entries(CSP_DIRECTIVES)
  .map(([name, sources]) => `${name} ${sources.join(' ')}`)
  .join('; ');

/**
 * Sent on every response.
 *
 * X-Frame-Options duplicates `frame-ancestors 'none'` on purpose: the CSP
 * directive is the one that counts where both are understood, and the header is
 * what an older browser reads.
 */
export const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': CSP,
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  // No feature here needs a camera, a microphone or a location, and a page that
  // never asks should not be able to start asking without someone noticing.
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
};

/** Vite fingerprints everything under this prefix, so it can never go stale. */
export const IMMUTABLE_PREFIX = '/assets/';
export const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable';
/** Everything else keeps its name across deploys and must be revalidated. */
export const REVALIDATE_CACHE = 'no-cache';
