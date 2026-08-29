/*
==================================================
  SLAYER TERMINAL - THE FEED SEAM (server/feed/types.ts)

  One contract, three implementations: the simulator,
  Massive (the code's `MKT`), and UW.
==================================================

  WHAT THIS FILE IS FOR. Until now the terminal had no network layer at all —
  `server.ts` served files and every number came from `core/simulator.ts`. The
  vendor plan replaces those numbers, and the temptation is to reach for
  `fetch` from whichever component wants a figure. That is how a desk ends up
  with a hundred sockets, a key in a bundle, and four components asking the
  same question four times.

  So every read goes through ONE shape:

    REST        `FeedSource.rest(req)`  — cached and single-flighted upstream
    STREAMING   `FeedSource.subscribe()` — one upstream subscription per
                (vendor, channel, symbol), fanned out to every browser

  THE VENDOR IS A DETAIL, DELIBERATELY. Nothing in this file names Massive or
  UW, because the task list's own merge rules say the same fact arrives from
  both (the options tape, the dark pool prints, top movers, fundamentals,
  short interest, IPOs, news). A caller asks for a FACT and the router
  decides which key answers — which is also what makes the "tag yours
  `derived` and theirs `measured`" provenance rule implementable later
  without touching a single page.

  AND THE SIMULATOR IS A SOURCE LIKE ANY OTHER. The list is explicit: keep it
  as a replay/demo mode, not as the default, because 45 proof scripts run
  against it. Behind this seam it is one `FeedSource` among three, which
  means "demo mode" is a routing choice rather than a second code path
  through the product.
*/

/** Vendors, plus the simulator. `sim` is not a vendor; it is a source. */
export type FeedVendor = 'massive' | 'uw' | 'sim';

/**
 * A streaming channel, named by WHAT IT CARRIES rather than by whose socket
 * it arrives on — the task list assigns several of these to a specific key
 * (`option_trades` to UW, `T`/`Q`/`A`/`AM` to Massive), but that assignment
 * is the router's business, not the caller's.
 */
export type FeedChannel =
  | 'trades' //        Massive `T`
  | 'quotes' //        Massive `Q`
  | 'secondAggs' //    Massive `A`      → un-gates the 1s/5s rows
  | 'minuteAggs' //    Massive `AM`     → the base bar of the whole app
  | 'indexValue' //    Massive indices  → SPX/NDX/RUT/VIX
  | 'optionTrades' //  UW               → Trace's tape
  | 'gex' //           UW               → Pinpoint live
  | 'periscope' //     UW               → Model Error's actualized series
  | 'marketTide' //    UW
  | 'offLitTrades' //  UW               → dark pool crosses
  | 'news' //          UW
  | 'tradingHalts' //  UW               → the TopBar banner
  | 'flowAlerts'; //   UW

/** What a browser subscribes to. Symbol is absent for market-wide channels. */
export interface FeedTopic {
  channel: FeedChannel;
  /** Uppercase ticker, or undefined for a market-wide channel. */
  symbol?: string;
}

/** Topics compare and map by VALUE — the hub keys its refcounts on this. */
export const topicKey = (t: FeedTopic): string => `${t.channel}:${t.symbol?.toUpperCase() ?? '*'}`;

/** A message on its way to the browsers. */
export interface FeedMessage<T = unknown> {
  topic: FeedTopic;
  /** Vendor epoch ms where the vendor stamps it, else arrival. */
  at: number;
  payload: T;
}

/** One REST read. `path` is vendor-relative; the adapter owns the base URL. */
export interface FeedRequest {
  path: string;
  query?: Record<string, string | number | undefined>;
  /**
   * How long this answer stays good, in ms. The caller sets it because only
   * the caller knows the shape of the fact: a chain snapshot is worth
   * seconds, the holiday calendar is worth a day, and daily open interest
   * changes once — after the close (the list is emphatic that intraday OI
   * does not exist).
   */
  ttlMs: number;
}

export interface FeedSource {
  vendor: FeedVendor;
  /** Fetch, already keyed — the vault injects credentials here, never above. */
  rest<T>(req: FeedRequest): Promise<T>;
  /**
   * Open ONE upstream subscription. Returns an unsubscribe. The hub calls
   * this at most once per topic no matter how many browsers are watching.
   */
  subscribe(topic: FeedTopic, onMessage: (m: FeedMessage) => void): () => void;
}
