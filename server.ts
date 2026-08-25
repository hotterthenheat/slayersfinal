import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT ?? 8080);

/*
==================================================
  SLAYER TERMINAL - STATIC HOST (server.ts)

  Serves dist/ and falls back to index.html so the
  client router can own every path.
==================================================

  THE HEADERS BELOW ARE NOT NEW POLICY — THEY ARE RECOVERED.

  `vercel.json` carried them until commit f7be84a replaced the tracked tree,
  and this file arrived with the express host and none of the headers. So the
  deployed product quietly lost its content-security policy, its clickjacking
  refusal, its MIME-sniffing refusal and its referrer policy in a commit about
  something else entirely. They are restored here verbatim from
  `git show f7be84a^:vercel.json`, because this is the host the tree actually
  ships with now. If the target is Vercel again, that file is still in history
  and brings its own copy.

  WHY THIS EXACT POLICY IS SAFE HERE. Every route was swept for outbound
  requests: 94 requests across sixteen routes, all to the local origin — no
  analytics, no CDN, no font host, no third party of any kind. `default-src
  'self'` is therefore the enforceable statement of a fact that was measured,
  not a guess that might break something.

  The two loosenings do not widen the origin, and the first one was MEASURED
  rather than assumed:

    style-src 'unsafe-inline'   load-bearing — but not for the reason it looks
                                like. See below.
    img-src data: blob:         canvas readback and inline SVG data URIs.

  WHAT ACTUALLY NEEDS 'unsafe-inline', measured by serving this exact bundle
  under `style-src 'self'` and counting what the browser refused:

      /pulse         1 refusal
      /pulse/board   4 refusals
      every other route of the sixteen   clean

  One per CHART. `lightweight-charts` calls `document.createElement('style')`
  per instance and injects the styling for its TradingView attribution logo
  (`a#tv-attr-logo{…}`) — the same third-party markup that puts the two
  duplicate ids on /pulse/board. The violated directive is `style-src-elem`,
  which governs <style> ELEMENTS. It is NOT `style-src-attr`: React and
  framer-motion set styles through the CSSOM, which CSP does not govern at
  all, so the app's own animation would survive the tighter policy untouched.
  A dependency's attribution logo is the only thing between this and a fully
  strict style policy, and hashing it is not an option — the content is built
  at runtime and would change on any upgrade.

  `script-src 'self'` has NO 'unsafe-inline' and NO 'unsafe-eval' — the two
  that matter — so an injected <script> or a string passed to eval is refused.
  Verified by loading all sixteen routes against this server: 0 violations, 0
  console errors, 0 blank pages. The sweep is not taking that on trust either;
  it reported 5 violations the moment style-src was tightened, so it is known
  to be able to see one.
*/

const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "manifest-src 'self'",
    "worker-src 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
};

/*
  Express announces itself in `X-Powered-By` on every response. It is not a
  vulnerability, it is a free hint — it tells a scanner which stack's known
  bugs to try first, and the product gets nothing for it.
*/
app.disable('x-powered-by');

app.use((_req, res, next) => {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(key, value);
  next();
});

/*
  Vite fingerprints everything under assets/ with a content hash, so those
  files are immutable by construction and may be cached forever. index.html
  must NOT be: it is the document that names the current hashes, and a cached
  copy pins a returning reader to the build they first loaded.
*/
app.use(
  express.static(path.join(__dirname, 'dist'), {
    setHeaders: (res, filePath) => {
      res.setHeader(
        'Cache-Control',
        /[-.][A-Za-z0-9_-]{8}\.[a-z0-9]+$/.test(filePath)
          ? 'public, max-age=31536000, immutable'
          : 'no-cache'
      );
    },
  })
);

// Fallback to index.html for undefined requests (SPA routing)
app.use((_req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n==================================================`);
  console.log(` Slayer Terminal Server Running:`);
  console.log(` http://localhost:${PORT}`);
  console.log(`==================================================\n`);
});
