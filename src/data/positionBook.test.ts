import { describe, expect, it } from 'vitest';
import { bookTotals, isUsableFill, markPosition, MIN_BOOK_FOR_STATS } from './positionBook';
import type { TrackedFill } from '../types/tracker';

/*
==================================================
  SLAYER TERMINAL - POSITION BOOK GUARD (positionBook.test.ts)
  The arithmetic, and the two things it must keep refusing to compute.

  The refusals matter more than the sums here. `pathUnknown` and
  `MIN_BOOK_FOR_STATS` are the whole reason this module can sit next to
  edgeledger.ts — which computes MFE, MAE, capture ratio and expectancy over a
  book it GENERATES — without the two quietly merging into one panel where a
  reader cannot tell which numbers came from their own trading.
==================================================
*/

const DAY = 86_400_000;
const AT = 1_700_000_000_000;

const open = (over: Partial<TrackedFill> = {}): TrackedFill => ({
  entryPrice: 2.5,
  size: 4,
  entryAt: AT,
  ...over,
});

describe('marking a position', () => {
  it('costs premium x contracts x the 100-share multiplier', () => {
    const m = markPosition(open(), 3);
    expect(m.state).toBe('OPEN');
    expect(m.costBasis).toBe(1000); // 2.50 x 4 x 100
    expect(m.marketValue).toBe(1200); // 3.00 x 4 x 100
    expect(m.openPnl).toBe(200);
  });

  it('takes fees out of a realized P&L, and only a realized one', () => {
    // An open position has not paid the exit half of a round-trip commission.
    // Charging all of it while the trade is live understates every winner.
    expect(markPosition(open({ fees: 6 }), 3).openPnl).toBe(200);
    const closed = markPosition(open({ exitPrice: 3, fees: 6 }), 999);
    expect(closed.state).toBe('CLOSED');
    expect(closed.realizedPnl).toBe(194); // (3.00 - 2.50) x 4 x 100 - 6
  });

  it('ignores the live mark once an exit price exists', () => {
    // 999 is nonsense on purpose: a closed position is worth what it sold for,
    // and reading the tape for it would make a settled figure move on a tick.
    const closed = markPosition(open({ exitPrice: 1.25 }), 999);
    expect(closed.realizedPnl).toBe(-500);
    expect(closed.realizedPct).toBeCloseTo(-0.5, 10);
    expect(closed.marketValue).toBeUndefined();
    expect(closed.openPnl).toBeUndefined();
  });

  it('counts the hold in calendar days, and leaves it absent without an exit time', () => {
    expect(markPosition(open({ exitPrice: 3, exitAt: AT + 3 * DAY }), 3).heldDays).toBe(3);
    expect(markPosition(open({ exitPrice: 3 }), 3).heldDays).toBeUndefined();
  });

  it('NEVER claims to know the path, open or closed', () => {
    // The load-bearing assertion in this file. MFE, MAE, capture ratio and exit
    // quality need the excursion between entry and exit, which nothing records
    // for a position the operator holds. Deriving them from two endpoints would
    // produce a different quantity wearing the name of the one a trader acts
    // on. If this flag ever goes false, something started guessing.
    expect(markPosition(open(), 3).pathUnknown).toBe(true);
    expect(markPosition(open({ exitPrice: 9 }), 3).pathUnknown).toBe(true);
  });
});

describe('what counts as a fill', () => {
  it('rejects a half-typed one rather than marking it', () => {
    expect(isUsableFill(undefined)).toBe(false);
    expect(isUsableFill({ entryPrice: 0, size: 4, entryAt: AT })).toBe(false);
    expect(isUsableFill({ entryPrice: 2.5, size: 0, entryAt: AT })).toBe(false);
    expect(isUsableFill({ entryPrice: NaN, size: 4, entryAt: AT })).toBe(false);
    expect(isUsableFill({ entryPrice: 2.5, size: 4, entryAt: AT })).toBe(true);
  });
});

describe('the book', () => {
  const marks = [
    markPosition(open({ entryPrice: 1, size: 1 }), 2), // open, +100
    markPosition(open({ entryPrice: 1, size: 1, exitPrice: 2 }), 0), // closed, +100
    markPosition(open({ entryPrice: 2, size: 1, exitPrice: 1 }), 0), // closed, -100
  ];

  it('separates what is realized from what is only marked', () => {
    const t = bookTotals(marks);
    expect(t.recorded).toBe(3);
    expect(t.open).toBe(1);
    expect(t.closed).toBe(2);
    expect(t.realizedPnl).toBe(0); // +100 and -100
    expect(t.openPnl).toBe(100);
    expect(t.committed).toBe(100); // only the open position ties up capital
  });

  it('refuses to call a handful of trades a statistic', () => {
    expect(bookTotals(marks).statsReady).toBe(false);
    const enough = Array.from({ length: MIN_BOOK_FOR_STATS }, () =>
      markPosition(open({ exitPrice: 3 }), 0)
    );
    expect(bookTotals(enough).statsReady).toBe(true);
    expect(bookTotals(enough.slice(0, MIN_BOOK_FOR_STATS - 1)).statsReady).toBe(false);
  });

  it('is empty, not zeroed, with nothing recorded', () => {
    const t = bookTotals([]);
    expect(t.recorded).toBe(0);
    expect(t.statsReady).toBe(false);
  });
});
