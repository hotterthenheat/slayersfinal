import { describe, it, expect } from 'vitest';
import { parseContractQuery, expiryLadder, slotValue, type QueryCtx } from './contractQuery';

/** Fri 07/31/26 — the date every number in the build spec was measured on. */
const FRI = new Date(2026, 6, 31);

const KNOWN = new Set(['SPY', 'QQQ', 'AAPL', 'NVDA', 'MSFT', 'SPXL']);

const ctx = (over: Partial<QueryCtx> = {}): QueryCtx => ({
  defaultTicker: 'SPY',
  strikeStep: 1,
  knownTicker: s => KNOWN.has(s),
  suggest: s => [...KNOWN].filter(k => k[0] === s[0]).slice(0, 3),
  now: FRI,
  ...over,
});

describe('parseContractQuery — the three phrasings in the brief', () => {
  const forms = ['07/27 spy 747C', 'SPY 747C 7/27', 'spy 747 call jul 27'];

  it('resolves identically regardless of token order', () => {
    const parsed = forms.map(f => parseContractQuery(f, ctx()));
    for (const q of parsed) {
      expect(q.ticker).toEqual({ state: 'typed', value: 'SPY' });
      expect(q.strike).toEqual({ state: 'typed', value: 747 });
      expect(q.right).toEqual({ state: 'typed', value: 'C' });
      expect(q.expired).toEqual({ label: '07/27/26', weekday: 'Mon', daysAgo: 4 });
      expect(q.leftovers).toEqual([]);
    }
  });

  it('never rolls a bare MM/DD forward into next year', () => {
    // A silent roll would turn this into a 361-day LEAPS: a different sleeve, a
    // different weight vector and a different grade, with nothing on screen.
    for (const f of forms) {
      const q = parseContractQuery(f, ctx());
      expect(q.expiry.state).toBe('missing');
      expect(q.complete).toBe(false);
    }
  });
});

describe('parseContractQuery — slots', () => {
  it('assumes the active ticker for a bare 747C', () => {
    const q = parseContractQuery('747C', ctx({ defaultTicker: 'QQQ' }));
    expect(q.ticker).toEqual({ state: 'assumed', value: 'QQQ', why: 'using the active ticker' });
    expect(slotValue(q.strike)).toBe(747);
    expect(slotValue(q.right)).toBe('C');
    expect(q.complete).toBe(true);
  });

  it('assumes a call when no C or P is typed, and never assumes a strike', () => {
    const q = parseContractQuery('spy', ctx());
    expect(q.right).toEqual({ state: 'assumed', value: 'C', why: 'no C or P in your text' });
    expect(q.strike).toEqual({ state: 'missing' });
    expect(q.expiry.state).toBe('assumed');
    expect(q.complete).toBe(false);
  });

  it('reads lowercase and ragged whitespace', () => {
    const q = parseContractQuery('   spy    505p  ,, 0dte  ', ctx());
    expect(slotValue(q.ticker)).toBe('SPY');
    expect(slotValue(q.strike)).toBe(505);
    expect(slotValue(q.right)).toBe('P');
    expect(slotValue(q.expiry)?.dte).toBe(0);
  });

  it('reads an OCC symbol and stops', () => {
    const q = parseContractQuery('SPY260731C00505000', ctx({ now: new Date(2026, 6, 29) }));
    expect(slotValue(q.ticker)).toBe('SPY');
    expect(slotValue(q.strike)).toBe(505);
    expect(slotValue(q.right)).toBe('C');
    expect(slotValue(q.expiry)?.label).toBe('07/31/26');
    expect(q.complete).toBe(true);
  });

  it('binds every other slot when the ticker is unknown, and suggests', () => {
    const q = parseContractQuery('SPZZ 505c 0dte', ctx());
    expect(q.ticker.state).toBe('unknown');
    if (q.ticker.state === 'unknown') {
      expect(q.ticker.raw).toBe('SPZZ');
      expect(q.ticker.suggestions.length).toBeGreaterThan(0);
      expect(q.ticker.suggestions.length).toBeLessThanOrEqual(3);
    }
    expect(slotValue(q.strike)).toBe(505);
    expect(slotValue(q.right)).toBe('C');
    expect(slotValue(q.expiry)).not.toBeNull();
    expect(q.complete).toBe(false);
  });

  it('lets a resolved symbol outrank an unresolved one already in the slot', () => {
    const q = parseContractQuery('SPZZ SPY 505c', ctx());
    expect(q.ticker).toEqual({ state: 'typed', value: 'SPY' });
    expect(q.leftovers).toEqual(['SPZZ']);
  });
});

describe('parseContractQuery — a bare number is never a day count', () => {
  it('reads 7 as a strike and 7d as a DTE', () => {
    const bare = parseContractQuery('spy 7', ctx());
    expect(slotValue(bare.strike)).toBe(7);
    expect(bare.expiry.state).toBe('assumed');

    const dte = parseContractQuery('spy 7d', ctx());
    expect(dte.strike).toEqual({ state: 'missing' });
    expect(dte.expiry.state).toBe('typed');
    expect(slotValue(dte.expiry)?.label).toBe('08/07/26');
  });

  it('keeps only the first bare number and reports the rest', () => {
    const q = parseContractQuery('spy 505 7', ctx());
    expect(slotValue(q.strike)).toBe(505);
    expect(q.leftovers).toEqual(['7']);
  });
});

describe('parseContractQuery — dates', () => {
  it('snaps a future Saturday forward and says so', () => {
    const q = parseContractQuery('spy 505c 08/01', ctx());
    expect(slotValue(q.expiry)?.label).toBe('08/03/26');
    expect(q.notes).toContainEqual({
      slot: 'expiry',
      text: '08/01/26 is a Saturday. Using Mon 08/03/26.',
    });
  });

  it('leaves a listed session untouched and emits no note', () => {
    const q = parseContractQuery('spy 505c 08/07', ctx());
    expect(slotValue(q.expiry)?.label).toBe('08/07/26');
    expect(q.notes.filter(n => n.slot === 'expiry')).toEqual([]);
  });

  it('names a market holiday rather than its weekday', () => {
    const q = parseContractQuery('spy 505c 09/07', ctx());
    expect(slotValue(q.expiry)?.label).toBe('09/04/26');
    expect(q.notes.some(n => n.text.includes('is a market holiday'))).toBe(true);
  });

  it('reads month words in either order and honours an explicit year', () => {
    expect(slotValue(parseContractQuery('spy 505c aug 7', ctx()).expiry)?.label).toBe('08/07/26');
    expect(slotValue(parseContractQuery('spy 505c 7 aug', ctx()).expiry)?.label).toBe('08/07/26');
    expect(slotValue(parseContractQuery('spy 505c aug 7 2027', ctx()).expiry)?.label).toBe('08/06/27');
  });

  it('reads ISO, MM/DD/YY and the relative words', () => {
    expect(slotValue(parseContractQuery('spy 505c 2026-08-07', ctx()).expiry)?.label).toBe('08/07/26');
    expect(slotValue(parseContractQuery('spy 505c 8/7/26', ctx()).expiry)?.label).toBe('08/07/26');
    expect(slotValue(parseContractQuery('spy 505c today', ctx()).expiry)?.dte).toBe(0);
    expect(slotValue(parseContractQuery('spy 505c tomorrow', ctx()).expiry)?.label).toBe('08/03/26');
  });

  it('rolls a bare MM/DD to next year only past the half-year mark', () => {
    // 01/15 is 197 days behind 07/31/26, so it reads as next January.
    const q = parseContractQuery('spy 505c 01/15', ctx());
    expect(q.expired).toBeNull();
    expect(slotValue(q.expiry)?.label).toBe('01/15/27');
  });
});

describe('parseContractQuery — the strike grid', () => {
  it('snaps an off-grid strike and says so', () => {
    const q = parseContractQuery('spy 747.30c', ctx());
    expect(slotValue(q.strike)).toBe(747);
    expect(q.notes).toContainEqual({
      slot: 'strike',
      text: '747.30 is not on the $1.00 grid. Using 747.',
    });
  });

  it('honours a half-dollar grid', () => {
    const q = parseContractQuery('aapl 230.7c', ctx({ strikeStep: 0.5 }));
    expect(slotValue(q.strike)).toBe(230.5);
    expect(q.notes.some(n => n.slot === 'strike')).toBe(true);
  });

  it('says nothing when the strike is already listed', () => {
    const q = parseContractQuery('spy 505c', ctx());
    expect(q.notes.filter(n => n.slot === 'strike')).toEqual([]);
  });

  it('strips a leading dollar sign', () => {
    expect(slotValue(parseContractQuery('spy $505c', ctx()).strike)).toBe(505);
    expect(slotValue(parseContractQuery('spy $505 p', ctx()).strike)).toBe(505);
  });
});

describe('expiryLadder', () => {
  it('dedupes the rungs that land on one session', () => {
    const rungs = expiryLadder(FRI);
    expect(rungs).toHaveLength(14);
    expect(new Set(rungs.map(e => e.label)).size).toBe(14);
    // dte 1, 2 and 3 all resolve to Mon 08/03/26 across the weekend.
    expect(rungs[0].label).toBe('07/31/26');
    expect(rungs[1].label).toBe('08/03/26');
  });

  it('never offers a closed day', () => {
    for (const e of expiryLadder(FRI)) {
      expect(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']).toContain(e.weekday);
    }
  });
});
