import type { FlowPrint } from '../types/trace';
import { contractKey } from './flowScanner';

/*
==================================================
  SLAYER TERMINAL - THE WATCH LIST (data/flowWatch.ts)

  What the reader has bookmarked off the tape, and
  which contracts they are following.
==================================================

  TWO KINDS OF BOOKMARK, because a reader wants two different things:

    a PRINT   — "that $2M sweep at 10:41, I want to see how it aged"
    a CONTRACT — "SPY 500C this Friday, show me everything it does"

  They are stored separately because they answer differently: a print is a
  frozen moment and never changes, while a contract keeps accumulating. A
  single list would have to pretend one of those was the other.

  THE STORE IS THE candleTheme PATTERN the desk already uses everywhere — a
  module-level value, a subscriber set, and a localStorage write — so every
  surface watching it re-renders together. That matters here because the
  bookmark control lives on the Live Tape while the list lives on the
  Tracker: two pages, one truth, no prop drilling between them.

  PRINTS ARE STORED WHOLE, not by id. A print id is only meaningful inside
  the session that produced it; the tape rolls and the id is reused. Keeping
  the whole record means a bookmark survives the tape scrolling past it,
  which is the entire point of bookmarking it.
*/

const PRINTS_KEY = 'slayer_watch_prints_v1';
const CONTRACTS_KEY = 'slayer_watch_contracts_v1';
/** Enough to be useful, small enough that localStorage never becomes a problem. */
const MAX_PRINTS = 200;
const MAX_CONTRACTS = 60;

export interface WatchedPrint {
  /** The print exactly as it appeared, frozen. */
  print: FlowPrint;
  /** When the reader bookmarked it — epoch ms. */
  savedAt: number;
  note?: string;
}

export interface WatchedContract {
  key: string;
  ticker: string;
  strike: number;
  right: 'C' | 'P';
  expiry: string;
  savedAt: number;
}

const read = <T>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    /* A private window, a cleared store, a quota error — a watch list is a
       convenience and must never be the reason a page fails to render. */
    return fallback;
  }
};
const write = (key: string, v: unknown): void => {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* Same: a full quota drops the write, not the desk. */
  }
};

let prints: WatchedPrint[] = read<WatchedPrint[]>(PRINTS_KEY, []);
let contracts: WatchedContract[] = read<WatchedContract[]>(CONTRACTS_KEY, []);

const subs = new Set<() => void>();
const emit = () => subs.forEach(f => f());

export const subscribeWatch = (fn: () => void): (() => void) => {
  subs.add(fn);
  return () => subs.delete(fn);
};

export const getWatchedPrints = (): WatchedPrint[] => prints;
export const getWatchedContracts = (): WatchedContract[] => contracts;

/** Stable identity for a print across a session — time plus contract plus size. */
export const printKey = (p: FlowPrint): string => `${contractKey(p)}@${p.time}#${p.size}#${p.premium}`;

export const isPrintWatched = (p: FlowPrint): boolean => prints.some(w => printKey(w.print) === printKey(p));
export const isContractWatched = (p: Pick<FlowPrint, 'ticker' | 'strike' | 'right' | 'expiry'>): boolean =>
  contracts.some(c => c.key === contractKey(p));

/** Bookmark a print, or remove it if it is already bookmarked. */
export function togglePrint(p: FlowPrint): void {
  const k = printKey(p);
  const at = prints.findIndex(w => printKey(w.print) === k);
  if (at >= 0) prints = prints.filter((_, i) => i !== at);
  else prints = [{ print: p, savedAt: Date.now() }, ...prints].slice(0, MAX_PRINTS);
  write(PRINTS_KEY, prints);
  emit();
}

export function toggleContract(p: Pick<FlowPrint, 'ticker' | 'strike' | 'right' | 'expiry'>): void {
  const key = contractKey(p);
  const at = contracts.findIndex(c => c.key === key);
  if (at >= 0) contracts = contracts.filter((_, i) => i !== at);
  else
    contracts = [
      { key, ticker: p.ticker, strike: p.strike, right: p.right, expiry: p.expiry, savedAt: Date.now() },
      ...contracts,
    ].slice(0, MAX_CONTRACTS);
  write(CONTRACTS_KEY, contracts);
  emit();
}

export function setPrintNote(p: FlowPrint, note: string): void {
  const k = printKey(p);
  prints = prints.map(w => (printKey(w.print) === k ? { ...w, note: note.trim() || undefined } : w));
  write(PRINTS_KEY, prints);
  emit();
}

export function clearWatch(kind: 'prints' | 'contracts'): void {
  if (kind === 'prints') {
    prints = [];
    write(PRINTS_KEY, prints);
  } else {
    contracts = [];
    write(CONTRACTS_KEY, contracts);
  }
  emit();
}

/**
 * How a bookmarked print has AGED — the follow-up the reader saved it for.
 *
 * Given the session's current prints for the same contract, this answers:
 * has the contract kept trading, and on which side since. Null when the tape
 * carries nothing further, which is itself the answer ("nothing since").
 */
export interface PrintFollowUp {
  printsSince: number;
  premiumSince: number;
  /** Premium share on the ask, of the flow that came after. */
  askPctSince: number;
  /** Latest volume/OI reading for the contract, or null if it went quiet. */
  volume: number | null;
  oi: number | null;
}

export function followUp(w: WatchedPrint, sessionPrints: readonly FlowPrint[]): PrintFollowUp {
  const key = contractKey(w.print);
  /* "Since" is by CLOCK, not by array position: the tape is newest-first and
     a bookmark taken at 10:41 is asking about 10:41 onward. */
  const after = sessionPrints.filter(p => contractKey(p) === key && p.time > w.print.time);
  let prem = 0, askPrem = 0;
  for (const p of after) {
    prem += p.premium;
    if (p.side === 'ASK') askPrem += p.premium;
  }
  const latest = after.length > 0 ? after.reduce((a, b) => (a.time >= b.time ? a : b)) : null;
  return {
    printsSince: after.length,
    premiumSince: prem,
    askPctSince: prem > 0 ? (askPrem / prem) * 100 : 0,
    volume: latest?.volume ?? null,
    oi: latest?.oi ?? null,
  };
}
