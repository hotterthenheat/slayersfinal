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
  browser over all 32 routes with a `securitypolicyviolation` listener attached
  — `npm run audit:csp`, and `--interact` for the paths a page load never
  reaches — then removing anything nothing asked for. It is not a policy copied
  from a blog post, and it is deliberately narrower than one: there is no
  `https:` wildcard anywhere, because this app talks to exactly one third party.
==================================================
*/

/**
 * `style-src` keeps 'unsafe-inline'. Removing it was tried, measured, and would
 * break the app.
 *
 * Loading all 32 routes under `style-src 'self'` reports only the Google Fonts
 * stylesheet — not one `style-src-attr` — and that clean result is a trap. CSP
 * governs style ATTRIBUTES parsed from markup or set with
 * `setAttribute('style')`; it does not govern CSSOM, and React, framer-motion
 * and recharts all animate through `element.style.property = …`. Nothing in the
 * built index.html carries a style attribute and nothing in the bundles calls
 * `setAttribute('style')`, so a load-only sweep has nothing to find.
 *
 * What it misses is the four bundles that call `createElement('style')` and
 * inject a sheet at RUNTIME, every one of them behind a user action:
 *
 *   react-draggable      `n.innerHTML = '.react-draggable-transparent-selection…'`
 *   lightweight-charts   `this.Uv.innerText = 'a#tv-attr-logo{…}'`
 *   src/pages/pulse/detach.ts  `l.textContent = i.textContent`  (pop-out window)
 *   framer-motion        `V.sheet.insertRule(…)`
 *
 * `npm run audit:csp -- --interact` drives those paths — chart crosshairs, the
 * command palette, and Pulse's workspace drag behind its `E` toggle. Under the
 * real policy: 0 violations, and one <style> element genuinely injected, so the
 * run reaches them. Under `style-src 'self'`: FIVE `style-src-elem | inline`
 * refusals, on the landing's motion layer and on the Pulse drag.
 *
 * Note what the element count does in that failing run: it still goes up. The
 * <style> element is appended either way; only its CSS is dropped. Nothing
 * throws, nothing logs, and the damage is invisible without the violation
 * listener — which is the whole failure mode. It would land in production, on
 * an interaction, looking like a CSS bug.
 *
 * That, against a directive whose realistic worst case is CSS-based defacement,
 * is not a trade worth making. (lightweight-charts' path happens to be dormant —
 * both charts pass `attributionLogo: false` — but the other two are live.)
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
