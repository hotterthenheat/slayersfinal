import { describe, it, expect } from 'vitest';
import { parseContractQuery, expiryLadder, slotValue, type QueryCtx } from './contractQuery';

/** Fri 07/31/26 — the date every number in the build spec was measured on. */
const FRI = new Date(2026, 6, 31);

/** C and AUG are the two real collisions: a side letter and a month word that
    are also listed symbols. Both were unreachable before. */
const KNOWN = new Set(['SPY', 'QQQ', 'AAPL', 'NVDA', 'MSFT', 'SPXL', 'C', 'AUG']);

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

describe('parseContractQuery — dates the calendar does not have', () => {
  // `new Date(2026, 1, 30)` is March 2 and throws nothing. Every one of these
  // used to come back complete, gradeable and dated something else, with no
  // note and no leftover: a score for a contract nobody typed.
  const impossible: [string, string][] = [
    ['spy 505c 02/30', '02/30'],
    ['spy 505c 02/31', '02/31'],
    ['spy 505c 04/31', '04/31'],
    ['spy 505c 13/45', '13/45'],
    ['spy 505c 00/15', '00/15'],
    ['spy 505c 08/00', '08/00'],
    ['spy 505c 02/29', '02/29'],
    ['spy 505c 4/31/26', '4/31/26'],
    ['spy 505c 2026-02-29', '2026-02-29'],
    ['spy 505c 2026-13-01', '2026-13-01'],
    ['spy 505c feb 30', 'FEB 30'],
  ];

  it.each(impossible)('%s is a clear miss, not a rolled-over date', (input, raw) => {
    const q = parseContractQuery(input, ctx());
    expect(q.expiry).toEqual({ state: 'missing' });
    expect(q.complete).toBe(false);
    expect(q.leftovers).toContain(raw);
    expect(q.notes).toContainEqual({
      slot: 'expiry',
      text: `${raw} is not a date on the calendar.`,
    });
    // Everything else the text named still binds. Only the date is refused.
    expect(slotValue(q.ticker)).toBe('SPY');
    expect(slotValue(q.strike)).toBe(505);
  });

  it('never lets 02/30 become March 2', () => {
    const q = parseContractQuery('spy 505c 02/30', ctx());
    expect(slotValue(q.expiry)).toBeNull();
    expect(q.expired).toBeNull();
    for (const n of q.notes) expect(n.text).not.toContain('03/02');
  });

  it('takes Feb 29 in a leap year and refuses it in every other', () => {
    const leap = parseContractQuery('spy 505c 2028-02-29', ctx());
    expect(slotValue(leap.expiry)?.label).toBe('02/29/28');
    expect(leap.notes.filter(n => n.slot === 'expiry')).toEqual([]);

    for (const y of [2026, 2027]) {
      const q = parseContractQuery(`spy 505c ${y}-02-29`, ctx());
      expect(q.expiry).toEqual({ state: 'missing' });
    }
  });

  it('refuses a date past the holiday table rather than miscounting its sessions', () => {
    // calendar.ts carries holidays through 2028. Past that, `sessions` counts
    // Thanksgiving as a trading day, and a session count that reads right and
    // is not is the whole failure this module exists to prevent.
    const q = parseContractQuery('spy 505c 2029-06-15', ctx());
    expect(q.expiry).toEqual({ state: 'missing' });
    expect(q.complete).toBe(false);
    expect(q.notes).toContainEqual({
      slot: 'expiry',
      text: '2029-06-15 is past the market calendar, which runs through 2028.',
    });
  });

  it('refuses a day count that lands past it too', () => {
    const q = parseContractQuery('spy 505c 999d', ctx());
    expect(q.expiry).toEqual({ state: 'missing' });
    expect(q.leftovers).toContain('999D');
    expect(q.notes.some(n => n.text.includes('past the market calendar'))).toBe(true);
  });

  it('keeps every other slot when an OCC symbol carries an impossible date', () => {
    const q = parseContractQuery('SPY261331C00505000', ctx());
    expect(slotValue(q.ticker)).toBe('SPY');
    expect(slotValue(q.strike)).toBe(505);
    expect(slotValue(q.right)).toBe('C');
    expect(q.expiry).toEqual({ state: 'missing' });
    expect(q.notes).toContainEqual({
      slot: 'expiry',
      text: '13/31/26 is not a date on the calendar.',
    });
  });
});

describe('parseContractQuery — a resolved date is the date typed, or says otherwise', () => {
  /** [what the user typed, the MM/DD/YY that text names]. */
  const dated: [string, string][] = [
    ['spy 505c 08/07', '08/07/26'],
    ['spy 505c 08/01', '08/01/26'], // Saturday
    ['spy 505c 08/02', '08/02/26'], // Sunday
    ['spy 505c 09/07', '09/07/26'], // Labor Day
    ['spy 505c 2026-08-07', '08/07/26'],
    ['spy 505c 8/7/26', '08/07/26'],
    ['spy 505c aug 7', '08/07/26'],
    ['spy 505c 01/15', '01/15/27'],
    ['spy 505c 2028-02-29', '02/29/28'],
    ['spy 505c 02/30', '02/30/26'],
    ['spy 505c 13/45', '13/45/26'],
    ['spy 505c 2029-06-15', '06/15/29'],
    ['spy 505c 07/27', '07/27/26'], // behind us
  ];

  it.each(dated)('%s resolves to what it named or names the swap', (input, named) => {
    const q = parseContractQuery(input, ctx());
    const got = slotValue(q.expiry);
    if (!got) {
      // A miss is fine. A silent one is not: it owes a note or an expired read.
      expect(q.notes.some(n => n.slot === 'expiry') || q.expired !== null).toBe(true);
      return;
    }
    if (got.label === named) {
      expect(q.notes.filter(n => n.slot === 'expiry')).toEqual([]);
      return;
    }
    expect(
      q.notes.some(n => n.slot === 'expiry' && n.text.includes(named) && n.text.includes(got.label))
    ).toBe(true);
  });

  it('names the weekday of a Sunday and the holiday of a holiday', () => {
    expect(parseContractQuery('spy 505c 08/02', ctx()).notes).toContainEqual({
      slot: 'expiry',
      text: '08/02/26 is a Sunday. Using Mon 08/03/26.',
    });
    expect(parseContractQuery('spy 505c 09/07', ctx()).notes).toContainEqual({
      slot: 'expiry',
      text: '09/07/26 is a market holiday. Using Fri 09/04/26.',
    });
  });

  it('reports a second date instead of dropping it', () => {
    const q = parseContractQuery('spy 505c 08/07 08/14', ctx());
    expect(slotValue(q.expiry)?.label).toBe('08/07/26');
    expect(q.leftovers).toEqual(['08/14']);

    const dte = parseContractQuery('spy 505c 7d 14d', ctx());
    expect(slotValue(dte.expiry)?.label).toBe('08/07/26');
    expect(dte.leftovers).toEqual(['14D']);
  });
});

describe('parseContractQuery — a strike is the strike typed, or says otherwise', () => {
  const striked: [string, string, number][] = [
    ['spy 505c', '505', 1],
    ['spy 747.30c', '747.30', 1],
    ['spy 747c', '747', 5],
    ['aapl 230.7c', '230.7', 0.5],
  ];

  it.each(striked)('%s lands on the grid with the move stated', (input, typed, step) => {
    const q = parseContractQuery(input, ctx({ strikeStep: step }));
    const got = slotValue(q.strike);
    expect(got).not.toBeNull();
    if (String(got) === typed) {
      expect(q.notes.filter(n => n.slot === 'strike')).toEqual([]);
      return;
    }
    expect(
      q.notes.some(n => n.slot === 'strike' && n.text.includes(typed) && n.text.includes(String(got)))
    ).toBe(true);
  });

  it('says which grid it snapped to', () => {
    expect(parseContractQuery('spy 747c', ctx({ strikeStep: 5 })).notes).toContainEqual({
      slot: 'strike',
      text: '747 is not on the $5.00 grid. Using 745.',
    });
  });
});

describe('parseContractQuery — symbols that collide with the syntax', () => {
  it('reaches the ticker C once the side is spoken for by a word', () => {
    const q = parseContractQuery('c 505 call', ctx());
    expect(q.ticker).toEqual({ state: 'typed', value: 'C' });
    expect(slotValue(q.strike)).toBe(505);
    expect(slotValue(q.right)).toBe('C');
    expect(q.leftovers).toEqual([]);
  });

  it('reaches it from the compact form too', () => {
    const q = parseContractQuery('c 505c', ctx());
    expect(q.ticker).toEqual({ state: 'typed', value: 'C' });
    expect(slotValue(q.strike)).toBe(505);
    expect(slotValue(q.right)).toBe('C');
  });

  it('still reads a lone c as the side when nothing else names one', () => {
    const q = parseContractQuery('spy 505 c', ctx());
    expect(slotValue(q.right)).toBe('C');
    expect(q.ticker).toEqual({ state: 'typed', value: 'SPY' });
    expect(q.notes.filter(n => n.slot === 'right')).toEqual([]);
  });

  it('says so when the letter it took as a side is the only symbol in reach', () => {
    const q = parseContractQuery('505 c', ctx());
    expect(slotValue(q.right)).toBe('C');
    expect(q.notes).toContainEqual({
      slot: 'right',
      text: 'Read C as the side. Spell the side out to search the symbol C.',
    });
  });

  it('reports a second side word instead of swallowing it', () => {
    const q = parseContractQuery('spy 505c put', ctx());
    expect(slotValue(q.right)).toBe('C');
    expect(q.leftovers).toEqual(['PUT']);
  });

  it('keeps a month-word symbol and the strike beside it', () => {
    const q = parseContractQuery('aug 20c', ctx());
    expect(q.ticker).toEqual({ state: 'typed', value: 'AUG' });
    expect(slotValue(q.strike)).toBe(20);
    expect(slotValue(q.right)).toBe('C');
    expect(q.leftovers).toEqual([]);
    expect(q.notes).toContainEqual({
      slot: 'ticker',
      text: 'AUG read as the symbol. For the month, type 08/20.',
    });
  });

  it('reads the same word as a month when another symbol is named', () => {
    const q = parseContractQuery('spy aug 20c', ctx());
    expect(q.ticker).toEqual({ state: 'typed', value: 'SPY' });
    expect(slotValue(q.expiry)?.label).toBe('08/20/26');
    expect(q.strike).toEqual({ state: 'missing' });
    expect(q.complete).toBe(false);
  });

  it('names what a dayless month word is missing, and grades nothing on it', () => {
    const q = parseContractQuery('spy 505c jul', ctx());
    expect(q.ticker).toEqual({ state: 'typed', value: 'SPY' });
    expect(q.leftovers).toEqual(['JUL']);
    expect(q.expiry).toEqual({ state: 'missing' });
    expect(q.complete).toBe(false);
    expect(q.notes).toContainEqual({
      slot: 'expiry',
      text: 'JUL needs a day beside it, like JUL 27.',
    });
  });

  it('reports every word an OCC symbol overrides, before it or after', () => {
    const q = parseContractQuery('jul 27 qqq SPY260731C00505000 9', ctx({ now: new Date(2026, 6, 29) }));
    expect(slotValue(q.ticker)).toBe('SPY');
    expect(slotValue(q.expiry)?.label).toBe('07/31/26');
    expect(q.expired).toBeNull();
    expect(q.leftovers).toEqual(['JUL', '27', 'QQQ', '9']);
  });
});

describe('parseContractQuery — the listing that has not loaded yet', () => {
  // The pane wires knownTicker to a lazily imported 6,300-row file and answers
  // true for everything until it lands. Binding on that answer minted a
  // synthetic price series in the simulator for whatever was in the box.
  const loading = ctx({ knownTicker: () => true, suggest: () => [] });

  it('holds an unconfirmed symbol without pricing it', () => {
    const q = parseContractQuery('zzzz 505c 0dte', loading);
    expect(q.ticker).toEqual({ state: 'pending', raw: 'ZZZZ' });
    expect(slotValue(q.ticker)).toBeNull();
    expect(q.complete).toBe(false);
    expect(q.notes).toContainEqual({
      slot: 'ticker',
      text: 'Still loading the listed symbols, so ZZZZ is not confirmed yet.',
    });
  });

  it('does not call it a missing listing either', () => {
    // "No listing for SPY" because a JSON was in flight is the opposite lie.
    expect(parseContractQuery('spy 505c', loading).ticker.state).toBe('pending');
  });

  it('binds normally once the listing can answer', () => {
    const q = parseContractQuery('spy 505c 0dte', ctx());
    expect(q.ticker).toEqual({ state: 'typed', value: 'SPY' });
    expect(q.complete).toBe(true);
  });
});

describe('parseContractQuery — text it cannot use', () => {
  it('reads empty and whitespace-only input as nothing typed', () => {
    for (const s of ['', '   ', '\t\n ', ' , , ']) {
      const q = parseContractQuery(s, ctx());
      expect(q.ticker).toEqual({ state: 'assumed', value: 'SPY', why: 'using the active ticker' });
      expect(q.strike).toEqual({ state: 'missing' });
      expect(q.notes).toEqual([]);
      expect(q.leftovers).toEqual([]);
      expect(q.expired).toBeNull();
      expect(q.complete).toBe(false);
    }
  });

  it('reports characters it cannot classify instead of eating them', () => {
    const q = parseContractQuery('spy 505c ✨ 日本 Ω', ctx());
    expect(slotValue(q.ticker)).toBe('SPY');
    expect(slotValue(q.strike)).toBe(505);
    expect(q.leftovers).toEqual(['✨', '日本', 'Ω']);
  });

  it('never reads a full-width look-alike as the symbol it resembles', () => {
    const q = parseContractQuery('ＳＰＹ 505c', ctx({ defaultTicker: 'QQQ' }));
    // It is not SPY, so it does not bind. It is reported, not quietly upgraded.
    expect(q.ticker).toEqual({ state: 'assumed', value: 'QQQ', why: 'using the active ticker' });
    expect(q.leftovers).toEqual(['ＳＰＹ']);
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
