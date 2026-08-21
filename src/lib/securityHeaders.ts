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
 * Loading all 32 routes under `style-src 'self'` reported only the Google Fonts
 * stylesheet — not one `style-src-attr` — and that clean result is a trap. (The
 * font is self-hosted now, so that one reported violation is gone too, and a
 * load-only sweep under `style-src 'self'` would come back completely silent —
 * which makes the trap below sharper, not weaker.) CSP
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
 * `npm run audit:csp -- --interact` drives THREE of them — chart crosshairs, the
 * command palette, and Pulse's workspace drag behind its `E` toggle. It does not
 * open the pop-out window, so `detach.ts` is reasoned about here rather than
 * measured; the checker now drains violations from every page in the context, so
 * a pop-out that is opened will at least be seen. Under the real policy: 0
 * violations, and one <style> element genuinely injected, so the run does reach
 * the paths it claims. Under `style-src 'self'`: FIVE `style-src-elem | inline`
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
 * clean — no 'unsafe-inline', no 'unsafe-eval', no wildcard.
 */
const CSP_DIRECTIVES: Record<string, string[]> = {
  'default-src': ["'self'"],
  'script-src': ["'self'"],
  'style-src': ["'self'", "'unsafe-inline'"],
  // Self alone. The two Google Fonts hosts were here for a two-family webfont
  // stylesheet; the family is one self-hosted file now (public/fonts), so the
  // page reaches no third party for type at all and the allowance goes with it.
  'font-src': ["'self'"],
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

export const IMMUTABLE_PREFIX = '/assets/';
export const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable';
/** Everything else keeps its name across deploys and must be revalidated. */
export const REVALIDATE_CACHE = 'no-cache';

/**
 * A Vite content hash: `[name]-[hash][ext]`, hash being 8 base64url characters.
 *
 * This exists because "under /assets/" is NOT the same claim as "fingerprinted",
 * and the difference was a live bug. Vite copies `public/assets/*` into
 * `dist/assets/` verbatim, so hand-authored files land in the same directory as
 * the hashed build output — `og-cover.png` sat next to `charts-CJ9089NK.js`.
 * A prefix rule therefore promised a year of `immutable` on 20 files whose names
 * never change, the social preview image among them. Publishing a new
 * `og-cover.png` would have reached nobody who had already loaded the old one,
 * and no deploy could fix it, because `immutable` tells the browser not to
 * revalidate even on reload.
 *
 * Immutability is a property of content-addressed NAMES, so it is tested for
 * directly. Anything else under /assets/ falls back to revalidation, which is
 * merely slower — the safe direction to be wrong in.
 */
export const FINGERPRINTED = /-[A-Za-z0-9_-]{8}\.[a-z0-9]+$/;

/** True when a URL path may be cached forever. */
export function isImmutable(urlPath: string): boolean {
  return urlPath.startsWith(IMMUTABLE_PREFIX) && FINGERPRINTED.test(urlPath);
}
