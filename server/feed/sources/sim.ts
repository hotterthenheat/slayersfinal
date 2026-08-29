import Simulator from '../../../src/core/simulator';
import type { FeedMessage, FeedRequest, FeedSource, FeedTopic } from '../types';

/*
==================================================
  SLAYER TERMINAL - THE SIMULATOR AS A SOURCE
  (server/feed/sources/sim.ts)
==================================================

  The task list is explicit: keep the simulator as a replay/demo mode, NOT as
  the default, and do not delete it — 45 proof scripts run against it.

  This is how it stops being the default without becoming a second code path.
  Behind `FeedSource` the simulator is one source among three, so "demo mode"
  is a ROUTING choice: the same hub, the same cache, the same wire format,
  the same components. A desk with no keys configured runs the whole product
  off this file and every byte reaching the browser has the shape a vendor
  will fill in later.

  ONE TICKER PER PROCESS, ONE INTERVAL FOR ALL SUBSCRIBERS. The simulator is
  a singleton with global state, so the tick loop belongs to the MODULE, not
  to a subscription — otherwise ten browsers on ten topics would advance the
  same book ten times per interval and the price would run ten times fast.
  It starts on the first subscription and stops on the last, which is the
  same refcount discipline the hub applies upstream.
*/

/** The wall-clock cadence of the fake tape. Matches the old client loop. */
const TICK_MS = 1500;

type Listener = { topic: FeedTopic; onMessage: (m: FeedMessage) => void };

let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<Listener>();

function pump(): void {
  Simulator.tick(() => {});
  const at = Date.now();
  for (const l of listeners) {
    const sym = l.topic.symbol?.toUpperCase();
    try {
      switch (l.topic.channel) {
        case 'minuteAggs':
        case 'secondAggs':
        case 'trades': {
          if (!sym) break;
          const snap = Simulator.snapshotFor(sym);
          l.onMessage({ topic: l.topic, at, payload: { spot: snap.spot, ticker: sym } });
          break;
        }
        case 'gex': {
          if (!sym) break;
          const snap = Simulator.snapshotFor(sym);
          l.onMessage({ topic: l.topic, at, payload: { ticker: sym, spot: snap.spot, chain: snap.chain } });
          break;
        }
        default:
          /* A channel the simulator cannot fake stays SILENT rather than
             emitting a plausible shape — a demo that invents dark pool
             prints teaches the reader something false. */
          break;
      }
    } catch {
      /* One bad topic must not stop the pump for the others. */
    }
  }
}

export const simSource: FeedSource = {
  vendor: 'sim',

  async rest<T>(req: FeedRequest): Promise<T> {
    const m = /^\/snapshot\/([A-Za-z.:-]+)$/.exec(req.path);
    if (m) {
      const snap = Simulator.snapshotFor(m[1].toUpperCase());
      return { spot: snap.spot, ticker: snap.ticker } as T;
    }
    throw new Error(`sim source has no route for ${req.path}`);
  },

  subscribe(topic, onMessage) {
    const l: Listener = { topic, onMessage };
    listeners.add(l);
    if (!timer) timer = setInterval(pump, TICK_MS);
    return () => {
      listeners.delete(l);
      if (listeners.size === 0 && timer) {
        clearInterval(timer);
        timer = null;
      }
    };
  },
};

/** Test seam: advance the fake tape without waiting on wall clock. */
export const __pumpOnce = pump;
/** Test seam: are we holding a timer? Proves the refcounted stop. */
export const __isRunning = (): boolean => timer !== null;
