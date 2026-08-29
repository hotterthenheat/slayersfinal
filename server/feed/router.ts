import express, { type Request, type Response, type Router } from 'express';
import { RestCache } from './cache';
import { redact, secretFor, type Vault } from './vault';
import type { FeedSource, FeedVendor } from './types';

/*
==================================================
  SLAYER TERMINAL - THE PROXY ROUTE (server/feed/router.ts)

  The browser's only door to a vendor.
==================================================

  THE WHOLE POINT: the browser never holds a key and never talks to a vendor.
  It asks this server, this server asks the vendor with the key attached, and
  the answer comes back scrubbed. Everything else here follows from that.

  THE CACHE SITS INSIDE THE ROUTE, not around it, because the thing worth
  coalescing is the FACT, not the HTTP request — two browsers asking for
  SPY's chain with different headers are one upstream call.

  A MISSING KEY IS A 503 THAT SAYS WHICH VENDOR. Not a 500, and not an empty
  200 that a widget would render as zero: the desk already has a vocabulary
  for "this number has no source", and a route that returned a plausible
  empty body would defeat it.

  EVERY RESPONSE — including every error — GOES OUT THROUGH `redact`. An
  upstream 401 body routinely echoes the key back, and forwarding that
  verbatim is the leak the vault exists to prevent.

  THE ALLOWLIST IS A PREFIX LIST, deliberately dumb. Without it this is an
  open proxy: anyone could ask this server to fetch anything with our
  credentials attached. Paths are matched against known vendor prefixes and
  anything else is refused before a key is ever touched.
*/

/** What a vendor adapter needs to make a real call. Injected so the proof
    can stage an upstream without a network. */
export interface VendorTransport {
  /** Absolute base, e.g. https://api.massive.example/v3 */
  baseUrl: string;
  /** Path prefixes this vendor will answer. Anything else is refused. */
  allow: string[];
  /** How the key rides — most vendors take a header, some a query param. */
  auth: (secret: string) => { headers?: Record<string, string>; query?: Record<string, string> };
}

export interface RouterDeps {
  vault: Vault;
  cache: RestCache;
  /** Live vendors. Absent vendor = 503 naming it. */
  transports: Partial<Record<FeedVendor, VendorTransport>>;
  /** The simulator, always available — demo mode's source. */
  sim: FeedSource;
  /** Injected for the proof; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

const DEFAULT_TTL_MS = 5_000;

export function createFeedRouter(deps: RouterDeps): Router {
  const router = express.Router();
  const doFetch = deps.fetchImpl ?? fetch;

  /** What the desk is running on — the honest provenance readout. */
  router.get('/health', (_req: Request, res: Response) => {
    res.json({
      configured: deps.vault.configured,
      missing: deps.vault.missing,
      /* Named so a reader can tell "demo" from "live" without guessing from
         the numbers, which is the failure this whole product argues against. */
      mode: deps.vault.configured.length === 0 ? 'demo' : 'live',
      cache: deps.cache.readStats(),
    });
  });

  /* `*splat`, not a bare `*`: Express 5 moved to path-to-regexp v8, where an
     unnamed wildcard is a PathError at mount time — the route never binds and
     the server dies on boot. Typecheck cannot see it; the end-to-end proof
     caught it on the first run. */
  router.get('/:vendor/*splat', async (req: Request, res: Response) => {
    const vendor = req.params.vendor as FeedVendor;
    const splat = (req.params as unknown as { splat?: string[] | string }).splat;
    const path = '/' + (Array.isArray(splat) ? splat.join('/') : (splat ?? ''));
    const ttlMs = Number(req.query.__ttl ?? DEFAULT_TTL_MS);

    try {
      if (vendor === 'sim') {
        const out = await deps.cache.get(`sim:${path}`, ttlMs, () => deps.sim.rest({ path, ttlMs }));
        res.json(out);
        return;
      }

      const transport = deps.transports[vendor];
      if (!transport) {
        res.status(503).json({ error: `vendor ${vendor} is not configured on this server`, vendor });
        return;
      }
      /* Refused BEFORE a key is touched — see the allowlist note above. */
      if (!transport.allow.some(p => path.startsWith(p))) {
        res.status(403).json({ error: `path ${path} is not on the allowlist for ${vendor}`, vendor });
        return;
      }
      const secret = secretFor(deps.vault, vendor);
      if (!secret) {
        res.status(503).json({ error: `no credential configured for ${vendor}`, vendor, missing: true });
        return;
      }

      const auth = transport.auth(secret);
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(req.query)) {
        if (k === '__ttl' || v === undefined) continue;
        qs.set(k, String(v));
      }
      for (const [k, v] of Object.entries(auth.query ?? {})) qs.set(k, v);
      const url = `${transport.baseUrl}${path}${qs.toString() ? `?${qs}` : ''}`;

      /* Keyed on the FACT: the url WITHOUT credentials, so two browsers with
         different sessions share one upstream call — and so a secret never
         becomes a cache key sitting in memory. */
      const cacheKey = `${vendor}:${path}?${[...qs].filter(([k]) => !(k in (auth.query ?? {}))).map(([k, v]) => `${k}=${v}`).sort().join('&')}`;

      const out = await deps.cache.get(cacheKey, ttlMs, async () => {
        const r = await doFetch(url, { headers: auth.headers });
        const body = await r.text();
        if (!r.ok) throw new Error(`${vendor} ${r.status}: ${body.slice(0, 400)}`);
        try {
          return JSON.parse(body);
        } catch {
          throw new Error(`${vendor} returned non-JSON for ${path}`);
        }
      });

      res.json(redact(out, deps.vault));
    } catch (err) {
      /* The error path is the one that leaks — an upstream 401 echoes the
         key back routinely. Scrubbed like everything else. */
      const clean = redact(err instanceof Error ? err.message : String(err), deps.vault);
      res.status(502).json({ error: clean, vendor });
    }
  });

  return router;
}
