/*
==================================================
  SLAYER TERMINAL - WHY THE BOARD IS EMPTY (emptyBoard.ts)
  Part 3 · "Scan empty state that names the binding filter."
==================================================

  An empty board used to say "nothing cleared the bar", which was true of
  every empty board and useful on none of them. The reader has three
  choices on this page — a tenor, a lens, a ticker filter — and an empty
  board is always one of them binding. The page knows which. It says.

  The order is the order a reader can act on:

    ticker   the filter is hiding setups that exist on this lens and tenor
             → clear it, and here is how many come back
    lens     this lens is empty on this tenor but others are not
             → here are the lenses that have something, with counts
    tenor    nothing on this tenor at all, on any lens
             → change the tenor; an empty tenor is a read, not an error
    ineligible  a lens this tenor does not sell (the tabs refuse it, but
             state can arrive from a saved link)

  Only the binding cut is named. Naming all three would be the old sentence
  with more words.
*/

import { SCANNERS, SLEEVES, isScannerEligible, type ScannerKey, type SleeveKey } from '../../types/compass';

export type EmptyCause = 'ticker' | 'lens' | 'tenor' | 'ineligible';

export interface EmptyRead {
  cause: EmptyCause;
  /** What is empty, in one line. */
  headline: string;
  /** The one thing to change, and what changing it gives back. */
  action: string;
}

export interface EmptyInput {
  scanner: ScannerKey;
  sleeve: SleeveKey;
  tickerFilter: string | null;
  /** Setups per lens on THIS tenor, eligible lenses only, plus `all`. */
  counts: Partial<Record<ScannerKey, number>>;
  /** Setups on this lens and tenor BEFORE the ticker filter. */
  unfilteredCount: number;
}

const lensLabel = (k: ScannerKey) => SCANNERS.find(s => s.key === k)?.label ?? k;
const tenorLabel = (k: SleeveKey) => SLEEVES.find(s => s.key === k)?.label ?? k;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function emptyBoardRead({ scanner, sleeve, tickerFilter, counts, unfilteredCount }: EmptyInput): EmptyRead {
  const lens = lensLabel(scanner);
  const tenor = tenorLabel(sleeve);

  if (!isScannerEligible(scanner, sleeve)) {
    const offered = SCANNERS.filter(s => s.key !== 'all' && isScannerEligible(s.key, sleeve)).map(s => s.label);
    return {
      cause: 'ineligible',
      headline: `${lens} is not offered on ${tenor}.`,
      action: `Its thesis needs a different holding window. On ${tenor} the desk runs ${offered.join(', ')}.`,
    };
  }

  if (tickerFilter && unfilteredCount > 0) {
    return {
      cause: 'ticker',
      headline: `No ${lens} setups on ${tenor} for ${tickerFilter}.`,
      action: `The ticker filter is what emptied the board — ${plural(unfilteredCount, 'setup')} on other names cleared the bar. Clear it to see them.`,
    };
  }

  const others = SCANNERS.filter(s => s.key !== 'all' && s.key !== scanner && (counts[s.key] ?? 0) > 0)
    .map(s => ({ label: s.label, n: counts[s.key] ?? 0 }))
    .sort((a, b) => b.n - a.n);

  if (others.length > 0) {
    return {
      cause: 'lens',
      headline: `No ${lens} setups on ${tenor} this sweep.`,
      action: `The lens is what emptied the board — other lenses have them: ${others.map(o => `${o.label} ${o.n}`).join(' · ')}.`,
    };
  }

  return {
    cause: 'tenor',
    headline: `Nothing on ${tenor} cleared the bar this sweep — on any lens.`,
    action: 'The tenor is what emptied the board. Pick another above; an empty tenor is a read, not an error.',
  };
}
