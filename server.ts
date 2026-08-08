import express from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/*
==================================================
  SLAYER TERMINAL - PRODUCTION PREVIEW SERVER (server.ts)
  `npm run serve` — serves the built `dist/` the way a static host would.

  The previous version was four lines: static `dist`, then a catch-all that
  answered every remaining request with index.html. That catch-all is the whole
  problem. It could not tell a route from a missing file, so:

  - A deploy that shipped without its JS answered `/assets/index-a1b2.js` with
    200 and the contents of index.html. The browser then failed on
    "Unexpected token '<'" — a parse error pointing at a file that parses fine,
    for a request that was never a miss as far as the server was concerned.
    A 404 says what actually happened.
  - `app.use` with no method guard answers POST, PUT and DELETE to any path
    with 200 and the SPA shell. Nothing here accepts writes; saying 200 to one
    is a claim that something was accepted.
  - Nothing set Cache-Control. Vite fingerprints everything under `assets/`,
    so those are safe to cache for a year and were being re-fetched or
    revalidated instead; index.html is the one file that must NOT be cached,
    because it is what points at the current fingerprints, and it was getting
    the same silence.

  Header choices are deliberately narrow. nosniff, DENY and a referrer policy
  are safe for a same-origin SPA with no embeds. A Content-Security-Policy is
  NOT set here: this app loads a third-party font stylesheet, and three.js,
  framer-motion and recharts all write inline styles, so an honest policy needs
  `style-src 'unsafe-inline'` and careful per-directive verification against a
  real render. That is worth doing as its own change, with the same policy
  mirrored into vercel.json — guessing at one here would either break the app
  or read as protection it isn't providing.
==================================================
*/

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, 'dist');
const INDEX = path.join(DIST, 'index.html');
const ASSETS = path.join(DIST, 'assets') + path.sep;
const PORT = Number(process.env.PORT ?? 8080);

// Without this the server starts happily and every route 404s, which reads as
// a routing bug rather than "there is no build here".
if (!existsSync(INDEX)) {
  console.error(`\nNo build found at ${DIST}\nRun \`npm run build\` first.\n`);
  process.exit(1);
}

const app = express();
app.disable('x-powered-by');

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use(
  express.static(DIST, {
    // index.html is served by the fallback below, so it gets one set of headers
    // from one place rather than two that can drift.
    index: false,
    setHeaders(res, filePath) {
      res.setHeader(
        'Cache-Control',
        // Fingerprinted by Vite: the name changes when the bytes do, so it can
        // never be stale. Everything else (favicon, manifest, robots, sitemap)
        // keeps its name across deploys and must be revalidated.
        filePath.startsWith(ASSETS) ? 'public, max-age=31536000, immutable' : 'no-cache',
      );
    },
  }),
);

app.use((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.set('Allow', 'GET, HEAD').status(405).type('text/plain').send('Method Not Allowed\n');
    return;
  }
  // An extension means the caller wanted a file, and static already looked. No
  // route in App.tsx contains a dot — there are no dynamic segments at all — so
  // this cannot swallow a real page.
  if (path.extname(req.path)) {
    res.status(404).type('text/plain').send('Not Found\n');
    return;
  }
  // The client router owns the path from here. 200 is correct even for a path
  // it will render as 404: the SPA shell is what was asked for and what is
  // being sent.
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(INDEX);
});

app.listen(PORT, () => {
  console.log(`\n==================================================`);
  console.log(` Slayer Terminal Server Running:`);
  console.log(` http://localhost:${PORT}`);
  console.log(`==================================================\n`);
});
