/*
==================================================
  SLAYER TERMINAL - THE REST CACHE (server/feed/cache.ts)

  100 users, 1 upstream call — and the half that
  a TTL alone does not buy you.
==================================================

  THE TTL IS THE EASY HALF. A cache with an expiry turns a hundred SEQUENTIAL
  readers into one call. It does nothing for a hundred SIMULTANEOUS ones,
  which is the shape the desk actually produces: every browser opens on the
  same four tickers at the same bell, and a widget that mounts on ten pages
  asks ten times in the same frame. Ten misses race, ten upstream calls go
  out, and the vendor sees the burst the cache was bought to prevent.

  SO EVERY KEY IS SINGLE-FLIGHTED. The first caller for a cold key starts the
  load and parks its PROMISE in the map; everyone arriving while it is in
  flight gets that same promise. One upstream call, N resolutions, and the
  property is exact rather than statistical — the proof asserts the loader
  ran exactly once against a hundred concurrent callers.

  A FAILED LOAD IS NOT AN ANSWER. If the load rejects, the in-flight entry is
  removed rather than cached — otherwise one blip during a burst would be
  served to every reader for the whole TTL, and a desk full of stale errors
  is worse than a desk that retries. Every waiter on that flight still sees
  the rejection: they asked, it failed, they are told.

  STALE-WHILE-REVALIDATE IS DELIBERATELY ABSENT. It would be easy here and it
  is wrong for this product: serving a price that is knowingly expired, while
  a refresh runs, is exactly the "number the app cannot source" the house
  rules keep out. When an entry expires the next reader waits for a real one.
*/

interface Entry<T> {
  /** Resolved value, present once the flight lands. */
  value?: T;
  /** The flight itself, present while in flight — this is the single-flight. */
  inFlight?: Promise<T>;
  /** Epoch ms after which `value` is no longer served. */
  expiresAt: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  /** Callers who joined a flight already in progress — the burst absorbed. */
  coalesced: number;
  /** Upstream loads actually started. The number the vendor bills for. */
  loads: number;
  errors: number;
}

/** Injectable so the proof can advance time without sleeping. */
export type Clock = () => number;

export class RestCache {
  private map = new Map<string, Entry<unknown>>();
  private stats: CacheStats = { hits: 0, misses: 0, coalesced: 0, loads: 0, errors: 0 };

  constructor(private now: Clock = Date.now) {}

  /**
   * The cached read.
   *
   * @param key    identity of the FACT, not of the caller
   * @param ttlMs  how long the answer stays good; <= 0 disables caching but
   *               still single-flights, which is what a live quote wants —
   *               never stale, never a stampede
   * @param loader the upstream call, invoked at most once per flight
   */
  async get<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
    const t = this.now();
    const hit = this.map.get(key) as Entry<T> | undefined;

    if (hit) {
      /* A flight in progress serves everyone who arrives during it. */
      if (hit.inFlight) {
        this.stats.coalesced++;
        return hit.inFlight;
      }
      if (hit.expiresAt > t && 'value' in hit) {
        this.stats.hits++;
        return hit.value as T;
      }
    }

    this.stats.misses++;
    this.stats.loads++;
    const flight = loader().then(
      value => {
        /* ttl <= 0 means "never serve this again from memory" — the flight
           still coalesced its burst, which is the half that matters for a
           live figure. */
        if (ttlMs > 0) this.map.set(key, { value, expiresAt: this.now() + ttlMs });
        else this.map.delete(key);
        return value;
      },
      err => {
        this.stats.errors++;
        this.map.delete(key); // a failure is never cached — see the header
        throw err;
      }
    );
    this.map.set(key, { inFlight: flight, expiresAt: 0 });
    return flight;
  }

  /** Drop one key, or everything. The nightly job calls this after a write. */
  invalidate(key?: string): void {
    if (key === undefined) this.map.clear();
    else this.map.delete(key);
  }

  /** Entries currently held, in flight or resolved. */
  get size(): number {
    return this.map.size;
  }

  /**
   * The keys currently held.
   *
   * For an ops readout — and for the assertion that keeps a CREDENTIAL out
   * of them. A secret in a cache key is three problems: it sits in memory as
   * a map key, it splits the cache per-credential and so defeats the whole
   * "many readers, one call" property, and it leaks the moment anything
   * surfaces this list. The route keys on the fact, never on the key.
   */
  keys(): string[] {
    return [...this.map.keys()];
  }

  readStats(): Readonly<CacheStats> {
    return { ...this.stats };
  }
}
