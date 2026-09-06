import { useSyncExternalStore } from 'react';
import Simulator from '../core/simulator';

/*
==================================================
  SLAYER TERMINAL - THE WATCHLIST (data/watchlist.ts)
  Part 9.4 — a name a reader can keep, from any calendar row.
==================================================

  THE SAME SHAPE AS prefs.ts AND distanceUnits.ts — a module-level store,
  persisted, read through `useSyncExternalStore` — because a second pattern
  for the same job is how two pieces of desk state end up disagreeing about
  whether they survive a reload.

  ── WHAT WAS THERE BEFORE ─────────────────────────────────────────────────

  `Simulator.WATCHLIST` is a four-symbol constant with no way to change it.
  Every "add to watchlist" the checklist asks for had nowhere to add TO. It
  is the SEED here rather than the list: a first-time reader opens the desk
  with the four names the terminal already showed them, and the moment they
  keep or drop one it becomes theirs.

  ── THE GUARDS, AND WHY EACH ONE ──────────────────────────────────────────

  Everything in this file is defending against the same thing: a list is a
  place a reader puts work, so it must not be losable by anything short of
  the reader saying so.

    A SANITIZED TICKER      the list is addressable from a URL, a calendar
                            row and a search box. `^[A-Z][A-Z.]{0,5}$` after
                            trimming and upcasing; anything else is dropped
                            rather than stored, because a bad symbol in the
                            list is a broken row on every surface that reads
                            it.
    A CAP, WITH THE OLDEST  a watchlist is a short list by definition and an
    ONE LEAVING             unbounded one is a second universe. 40 names,
                            and adding the 41st drops the oldest rather than
                            refusing — a refusal on a click a reader
                            deliberately made is the more annoying failure.
    DEDUPED, ORDER KEPT     insertion order IS the list's meaning: what the
                            reader added last is what they are working on.
    STORAGE MAY FAIL        a private window, a full quota, a browser set to
                            block site data. Every read and every write is
                            wrapped, and the session keeps its own copy so
                            the list works for as long as the tab is open
                            even when nothing can be saved.
    CORRUPT JSON IS EMPTY   not a crash. A parse failure falls back to the
                            seed, which is the state a first-time reader has
                            and therefore a state the whole desk already
                            handles.
*/

const STORAGE_KEY = 'slayer_watchlist_v1';

/** A watchlist is a short list. Past this it is a second universe. */
export const WATCHLIST_CAP = 40;

/** Upper-case, 1–6 characters, letters and dots. Anything else is not a symbol. */
export function normalizeTicker(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim().toUpperCase();
  return /^[A-Z][A-Z.]{0,5}$/.test(t) ? t : null;
}

/** The four names the terminal has always opened on. */
export const SEED: readonly string[] = Object.freeze(
  [...Simulator.WATCHLIST].map(normalizeTicker).filter((t): t is string => t !== null),
);

function load(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [...SEED];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [...SEED];
    const out: string[] = [];
    for (const v of parsed) {
      const t = normalizeTicker(v);
      if (t && !out.includes(t)) out.push(t);
      if (out.length >= WATCHLIST_CAP) break;
    }
    /* An EMPTY stored list is a real state — the reader removed everything —
       and must not be mistaken for "nothing stored yet". The key's presence
       is what separates them, which is why this checks `raw` above rather
       than the parsed length. */
    return out;
  } catch {
    return [...SEED];
  }
}

let current: string[] = load();
const listeners = new Set<() => void>();

function commit(next: string[]): void {
  current = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    /* storage blocked or full — the tab keeps its own copy */
  }
  listeners.forEach(fn => fn());
}

export function getWatchlist(): readonly string[] {
  return current;
}

export function isWatched(ticker: string): boolean {
  const t = normalizeTicker(ticker);
  return t !== null && current.includes(t);
}

/** Add a name. A duplicate is a no-op; the 41st drops the oldest. */
export function watch(ticker: string): void {
  const t = normalizeTicker(ticker);
  if (t === null || current.includes(t)) return;
  const next = [...current, t];
  commit(next.length > WATCHLIST_CAP ? next.slice(next.length - WATCHLIST_CAP) : next);
}

export function unwatch(ticker: string): void {
  const t = normalizeTicker(ticker);
  if (t === null || !current.includes(t)) return;
  commit(current.filter(x => x !== t));
}

/** The one call a button needs. Returns the state it left the name in. */
export function toggleWatch(ticker: string): boolean {
  const t = normalizeTicker(ticker);
  if (t === null) return false;
  if (current.includes(t)) {
    unwatch(t);
    return false;
  }
  watch(t);
  return true;
}

/** Back to the four the terminal opens on. */
export function resetWatchlist(): void {
  commit([...SEED]);
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useWatchlist(): readonly string[] {
  return useSyncExternalStore(subscribe, getWatchlist, getWatchlist);
}

/** TEST-ONLY. Drops the in-memory list without touching storage semantics. */
export function __setForTest(list: string[]): void {
  current = list.map(normalizeTicker).filter((t): t is string => t !== null);
  listeners.forEach(fn => fn());
}
