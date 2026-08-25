import { useCallback, useSyncExternalStore } from 'react';

/*
==================================================
  SLAYER TERMINAL - PRICE ALERTS (gex/alertStore.ts)

  A price you asked to be told about, kept per
  symbol and drawn on every chart showing it.
==================================================

  WHY THIS IS A MODULE-LEVEL STORE AND NOT COMPONENT STATE.

  Terrain mounts up to four panes and two of them can be on the same symbol.
  Alerts are keyed by symbol, so with per-component state and a shared key the
  second pane's save silently overwrites the first pane's alert — and the first
  pane goes on drawing a line for something that is no longer stored. One store
  with subscribers means both panes read the same list and both repaint when
  either changes.

  Persistence is the drawings store's shape verbatim, including the
  self-healing validator: anything that is not a well-formed alert is dropped
  on read rather than thrown, so a half-written key from a previous version
  cannot take a chart down with it.

  WHAT AN ALERT IS AND IS NOT.

  It is a line on a chart that changes when the price reaches it, while you are
  watching. It is not a notification: nothing runs when the tab is closed, and
  the menu says so in as many words. A promise to tell someone about a price
  and then not telling them is worse than not offering it.
*/

export interface PriceAlert {
  id: string;
  price: number;
  /** Which way it has to be crossed — fixed when the alert is armed, from the
      side of the market the price was on at that moment. Recomputing it later
      would let an alert re-arm itself behind the price and never fire. */
  above: boolean;
  /** When it fired, in epoch ms. 0 while it is still waiting. */
  firedAt: number;
}

const storageKey = (ticker: string) => `slayer_price_alerts_${ticker}`;

const isAlert = (a: unknown): a is PriceAlert =>
  typeof a === 'object' &&
  a !== null &&
  typeof (a as PriceAlert).id === 'string' &&
  typeof (a as PriceAlert).price === 'number' &&
  Number.isFinite((a as PriceAlert).price) &&
  typeof (a as PriceAlert).above === 'boolean' &&
  typeof (a as PriceAlert).firedAt === 'number';

const load = (ticker: string): PriceAlert[] => {
  try {
    const raw = localStorage.getItem(storageKey(ticker));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isAlert) : [];
  } catch {
    return [];
  }
};

const save = (ticker: string, list: PriceAlert[]) => {
  try {
    if (list.length === 0) localStorage.removeItem(storageKey(ticker));
    else localStorage.setItem(storageKey(ticker), JSON.stringify(list));
  } catch {
    /* storage full, private, or switched off — never fatal */
  }
};

/* The cached array IS the snapshot. useSyncExternalStore compares snapshots by
   identity, so returning a fresh array each read would re-render forever. */
const cache = new Map<string, PriceAlert[]>();
const subs = new Map<string, Set<() => void>>();

const read = (ticker: string): PriceAlert[] => {
  let list = cache.get(ticker);
  if (!list) {
    list = load(ticker);
    cache.set(ticker, list);
  }
  return list;
};

const write = (ticker: string, next: PriceAlert[]) => {
  cache.set(ticker, next);
  save(ticker, next);
  subs.get(ticker)?.forEach(fn => fn());
};

let seq = 0;

/** The most a chart is worth cluttering. Past this the lines stop being
    readable and the column of them stops being a set of decisions. */
export const MAX_ALERTS = 8;

export const getAlerts = read;

/** `spot` fixes which way the alert has to be crossed. Refused if it is not a
    real number, or if the price is already the wrong side of the market. */
export function addAlert(ticker: string, price: number, spot: number): PriceAlert | null {
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(spot)) return null;
  const list = read(ticker);
  if (list.length >= MAX_ALERTS) return null;
  if (list.some(a => Math.abs(a.price - price) < 1e-9)) return null;
  const alert: PriceAlert = { id: `${Date.now()}-${++seq}`, price, above: price > spot, firedAt: 0 };
  write(ticker, [...list, alert].sort((a, b) => b.price - a.price));
  return alert;
}

export function removeAlert(ticker: string, id: string): void {
  const list = read(ticker);
  const next = list.filter(a => a.id !== id);
  if (next.length !== list.length) write(ticker, next);
}

export function clearAlerts(ticker: string): void {
  if (read(ticker).length) write(ticker, []);
}

/** Idempotent: a chart calls this on every tick a crossed alert is seen, and
    only the first call changes anything. Without that guard the fired time
    would keep moving and every pane would repaint on every tick. */
export function markFired(ticker: string, id: string, at: number): void {
  const list = read(ticker);
  const hit = list.find(a => a.id === id);
  if (!hit || hit.firedAt !== 0) return;
  write(ticker, list.map(a => (a.id === id ? { ...a, firedAt: at } : a)));
}

/** Arm it again where it is — the reader has seen it and wants it back. The
    side is taken fresh, so an alert re-armed below the market waits to be
    crossed from below. */
export function rearmAlert(ticker: string, id: string, spot: number): void {
  const list = read(ticker);
  const hit = list.find(a => a.id === id);
  if (!hit || !Number.isFinite(spot)) return;
  write(ticker, list.map(a => (a.id === id ? { ...a, firedAt: 0, above: a.price > spot } : a)));
}

export function useAlerts(ticker: string): PriceAlert[] {
  const subscribe = useCallback(
    (fn: () => void) => {
      let set = subs.get(ticker);
      if (!set) {
        set = new Set();
        subs.set(ticker, set);
      }
      set.add(fn);
      return () => {
        set?.delete(fn);
      };
    },
    [ticker]
  );
  const snapshot = useCallback(() => read(ticker), [ticker]);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
