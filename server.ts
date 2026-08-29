import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFeedRouter, type VendorTransport } from './server/feed/router';
import { RestCache } from './server/feed/cache';
import { FeedHub } from './server/feed/hub';
import { attachFeedSocket } from './server/feed/wsServer';
import { simSource } from './server/feed/sources/sim';
import { readVault, BundledKeyError } from './server/feed/vault';
import type { FeedVendor } from './server/feed/types';

/*
==================================================
  SLAYER TERMINAL - SERVER

  Static files, the vendor proxy, and the feed
  socket. Runs with no keys at all.
==================================================

  WHAT CHANGED AND WHY. This served `dist/` and nothing else, because every
  number in the product came from the simulator running INSIDE the browser.
  The vendor plan needs a server that holds two keys, so it now also mounts:

    /api/feed/health      what is configured, what is missing, demo or live
    /api/feed/:vendor/*   the keyed, cached, scrubbed proxy
    /ws                   one upstream subscription, fanned to every browser

  IT BOOTS WITH NO CREDENTIALS, deliberately. With neither key set the health
  route says `mode: "demo"`, the simulator answers as a source, and the desk
  runs exactly as it does today. That is the "keep the simulator as a replay
  mode, not the default" rule made structural: demo is a configuration, not a
  fork in the code.

  A BUNDLED KEY STOPS THE BOOT. `readVault` throws on a VITE_-prefixed
  credential — Vite would inline that into the browser bundle — and this
  refuses to start rather than serving a build that leaks it. Failing at boot
  is the cheapest place to catch it.

  NO VENDOR TRANSPORT IS REGISTERED YET. `TRANSPORTS` is empty until each
  vendor's base URL, path allowlist and auth shape are confirmed against real
  documentation with a real key. An unverified adapter that looks right is
  worse than an absent one: it fails at the worst moment and it lies in
  review.
*/

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 8080);

let vault;
try {
  vault = readVault();
} catch (err) {
  if (err instanceof BundledKeyError) {
    console.error(`\n${err.message}\n`);
    process.exit(1);
  }
  throw err;
}

/* Empty until verified against a live key — see the header. */
const TRANSPORTS: Partial<Record<FeedVendor, VendorTransport>> = {};

const app = express();
const cache = new RestCache();

app.use('/api/feed', createFeedRouter({ vault, cache, transports: TRANSPORTS, sim: simSource }));

app.use(express.static(path.join(__dirname, 'dist')));
app.use((_req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const server = http.createServer(app);
const hub = new FeedHub(simSource);
attachFeedSocket(server, hub);

server.listen(PORT, () => {
  const mode = vault.configured.length === 0 ? 'DEMO (simulator)' : `LIVE (${vault.configured.join(', ')})`;
  console.log(`\n==================================================`);
  console.log(` Slayer Terminal Server Running:`);
  console.log(` http://localhost:${PORT}`);
  console.log(` feed: ${mode}`);
  if (vault.missing.length) console.log(` no credential: ${vault.missing.join(', ')}`);
  console.log(`==================================================\n`);
});
