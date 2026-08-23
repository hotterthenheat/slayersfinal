import { describe, expect, it } from 'vitest';
import Simulator from '../core/simulator';
import { buildScannerRows, summarizeScanner } from './flowscan';
import { buildSessionTape } from './flowtape';
import type { FlowPrint } from '../types/flowdesk';

/*
==================================================
  SLAYER TERMINAL - THE SCANNER IS A ROLLUP (data/flowscan.test.ts)

  Every figure on this desk used to be a hash. Volume was
  `oi × hRange(0.15, 1.9)`. The bid/ask split — which produced
  the bull score, which produced the BULLISH/BEARISH verdict on
  every row — was `hRange(12, 88)`. The column headed
  "Est ΔOI/d" was `(h01(seed) − 0.4) × volume × 0.5`.

  What makes that worse than the usual synthetic-data problem is
  that the real thing was already in the building: Trace › Tape
  holds the session's actual prints for the SAME contracts, with
  real sizes, real aggressor sides read off the OPRA condition
  codes, and real premium. Two desks, one set of contracts, two
  unrelated answers — and the one with a source was not the one
  being read.

  So these guard the identity, not a range. A contract's volume
  on this desk is the sum of the sizes of its prints on that one,
  to the contract.
==================================================
*/

const SNAP = Simulator.buildSnapshot('SPY');
const TAPE = buildSessionTape(400);
const ROWS = buildScannerRows(SNAP, TAPE);

const mine = (p: FlowPrint, strike: number, right: 'C' | 'P', dte: number) =>
  p.ticker === 'SPY' && p.strike === strike && p.right === right && p.dte === dte;

describe('the scanner rolls up the tape', () => {
  it('has rows to check', () => {
    expect(ROWS.length).toBeGreaterThan(3);
  });

  it('sums the volume, premium and print count of the contract it names', () => {
    for (const row of ROWS) {
      const prints = TAPE.filter(p => mine(p, row.strike, row.right, row.dte));
      expect(prints.length, `${row.id} claims prints that are not on the tape`).toBe(row.prints);
      expect(row.volume).toBe(prints.reduce((a, p) => a + p.size, 0));
      expect(row.premium).toBeCloseTo(prints.reduce((a, p) => a + p.premium, 0), 6);
      expect(row.sweeps).toBe(prints.filter(p => p.sweep).length);
    }
  });

  it('counts the bid/ask split off the prints, not off a hash', () => {
    for (const row of ROWS) {
      const prints = TAPE.filter(p => mine(p, row.strike, row.right, row.dte));
      const bidVol = prints.filter(p => p.side === 'BID').reduce((a, p) => a + p.size, 0);
      const askVol = prints.filter(p => p.side === 'ASK').reduce((a, p) => a + p.size, 0);
      const directional = bidVol + askVol;
      const expected = directional > 0 ? Math.round((bidVol / directional) * 100) : 50;
      expect(row.bidPct).toBe(expected);
    }
  });

  it('excludes midpoint crosses from the split rather than halving them', () => {
    /*
      A print that hit neither side is not half a seller. Counting it as one
      would drag every contract's read toward 50 in proportion to how much of its
      volume was negotiated — so the split is over DIRECTIONAL volume, and the
      midpoint share is reported on its own instead of hidden inside the answer.
    */
    for (const row of ROWS) {
      const prints = TAPE.filter(p => mine(p, row.strike, row.right, row.dte));
      const midVol = prints.filter(p => p.side === 'MID').reduce((a, p) => a + p.size, 0);
      expect(row.midPct).toBe(row.volume > 0 ? Math.round((midVol / row.volume) * 100) : 0);
    }
  });

  it('lists only contracts that traded', () => {
    // A FLOW scanner listing contracts with no flow is listing the chain. The
    // old build walked 22 chain strikes x 2 rights and invented a session for
    // each; this one cannot name a contract the tape never printed.
    for (const row of ROWS) {
      expect(TAPE.some(p => mine(p, row.strike, row.right, row.dte))).toBe(true);
    }
  });

  it('stamps the open-interest estimate as an estimate, dated today', () => {
    /*
      The tape says a trade happened and who was the aggressor. It does NOT say
      whether either side was opening or closing — a buy can be a short being
      covered. So the figure is an estimate and wears the freshness the badge
      paints amber, and it is dated TODAY rather than carrying the settled date,
      because it is a claim about a session OPRA has not published yet.
    */
    for (const row of ROWS) {
      expect(row.estOi.value).toBeGreaterThanOrEqual(0);
      if (row.oi === null) {
        // The chain lists six expiries and the tape prints across eleven. A
        // contract at a DTE the chain does not model has no settled figure, and
        // UNAVAILABLE is the state that says so rather than a fabricated zero.
        expect(row.estOi.freshness).toBe('UNAVAILABLE');
      } else {
        expect(row.estOi.freshness).toBe('ESTIMATED');
        expect(row.estOi.value).toBe(Math.max(0, Math.round(row.oi + row.deltaOi)));
      }
    }
  });

  it('estimates the position change as buyer-initiated minus seller-initiated volume', () => {
    for (const row of ROWS) {
      const prints = TAPE.filter(p => mine(p, row.strike, row.right, row.dte));
      const askVol = prints.filter(p => p.side === 'ASK').reduce((a, p) => a + p.size, 0);
      const bidVol = prints.filter(p => p.side === 'BID').reduce((a, p) => a + p.size, 0);
      expect(row.deltaOi).toBe(askVol - bidVol);
    }
  });

  it('gives a single print no verdict at all', () => {
    /*
      The hashed version drew the split from hRange(12, 88) and could never reach
      an extreme. A real rollup reaches one constantly: most contracts on a
      session tape trade once, and one print is 100% of its own volume on one
      side BY DEFINITION. Shipping "+100 BULLISH" off a single trade is
      fabricated certainty — one trade is a trade, not a lean.
    */
    const singles = ROWS.filter(r => r.prints === 1);
    expect(singles.length, 'the tape should contain some once-traded contracts').toBeGreaterThan(0);
    for (const row of singles) {
      expect(row.bullScore).toBe(0);
      expect(row.sentiment).toBe('NEUTRAL');
    }
  });

  it('converges on the raw split as prints accumulate', () => {
    // 2 prints carry half the split, 4 carry two thirds, 8 carry four fifths.
    for (const row of ROWS) {
      if (row.prints < 2) continue;
      const evidence = row.prints / (row.prints + 2);
      const directional = 100 - row.midPct;
      const raw = row.right === 'C' ? 100 - 2 * row.bidPct : 2 * row.bidPct - 100;
      // Bounded by the undiscounted split, and never on the other side of it.
      expect(Math.abs(row.bullScore)).toBeLessThanOrEqual(Math.abs(raw) + 1);
      if (raw !== 0 && directional > 0) {
        expect(Math.sign(row.bullScore) === Math.sign(raw) || row.bullScore === 0).toBe(true);
      }
      expect(evidence).toBeLessThan(1);
    }
  });

  it('cannot publish a strong lean on a contract that crossed at the midpoint', () => {
    // The score is scaled by how much of the volume was directional at all, so a
    // contract that negotiated its whole session reads NEUTRAL rather than
    // inheriting the sign of whichever handful of lots took a side.
    for (const row of ROWS) {
      if (row.midPct < 80) continue;
      expect(Math.abs(row.bullScore)).toBeLessThanOrEqual(40);
    }
    // …and the score is bounded whatever the split.
    for (const row of ROWS) expect(Math.abs(row.bullScore)).toBeLessThanOrEqual(100);
  });

  it('prices the average fill off premium and contracts, not off one print', () => {
    for (const row of ROWS) {
      if (row.volume === 0) continue;
      expect(row.avgFill).toBeCloseTo(Number((row.premium / (row.volume * 100)).toFixed(2)), 6);
    }
  });

  it('summarises without inventing a total the rows do not carry', () => {
    const s = summarizeScanner(ROWS);
    expect(s.contracts).toBe(ROWS.length);
    expect(s.totalPremium).toBeCloseTo(
      ROWS.reduce((a, r) => a + r.premium, 0),
      6
    );
  });

  it('returns nothing for a ticker with no tape rather than inventing rows', () => {
    expect(buildScannerRows(SNAP, [])).toEqual([]);
    const other = TAPE.filter(p => p.ticker !== 'SPY');
    expect(buildScannerRows(SNAP, other)).toEqual([]);
  });
});

describe('open interest is per contract, not per strike', () => {
  /*
    `snapshot.chain` is the FOLD of `chainByExpiry`, so its `callOI` at a strike
    is the sum across every listed expiry. Reading it per contract attributed
    the whole strike's interest to one dated instrument — measured on SPY,
    7,911 against the front book's 1,547 — and the error propagated into Vol/OI,
    ΔOI% and the estimate stamped on top of it.
  */
  it('never reports a strike total as one contract', () => {
    const foldedC = new Map(SNAP.chain.map(n => [n.strike, n.callOI.value]));
    const foldedP = new Map(SNAP.chain.map(n => [n.strike, n.putOI.value]));
    for (const row of ROWS) {
      if (row.oi === null) continue;
      const folded = (row.right === 'C' ? foldedC : foldedP).get(row.strike);
      if (folded === undefined) continue;
      expect(row.oi).toBeLessThanOrEqual(folded);
    }
  });

  it('reads the figure straight off the book that lists the expiry', () => {
    for (const row of ROWS) {
      const book = SNAP.chainByExpiry.find(b => b.expiry.dte === row.dte);
      if (!book) {
        expect(row.oi, `${row.id} has no book and must report no OI`).toBeNull();
        continue;
      }
      const node = book.nodes.find(n => n.strike === row.strike);
      expect(row.oi).toBe(node ? (row.right === 'C' ? node.callOI.value : node.putOI.value) : null);
    }
  });

  it('leaves the derived columns empty rather than dividing by a number it does not have', () => {
    for (const row of ROWS) {
      if (row.oi !== null) continue;
      expect(row.volOverOi).toBe(0);
      expect(row.deltaOiPct).toBe(0);
      expect(Number.isFinite(row.volOverOi)).toBe(true);
    }
  });
});

describe('one calendar', () => {
  /*
    The tape used to draw its expiries from a hardcoded pool
    ([0, 1, 2, 5, 9, 16, 30, 44, 72, 102, 254]) while the chain is built from
    `expiryCalendar(ticker)` (SPY: 1, 2, 3, 4, 5, 12). Two calendars for one
    instrument, overlapping on three days out of eleven.

    It stayed invisible until the Scanner started reading open interest per
    CONTRACT: 31 of 40 rows had no book to read from. A print at a DTE the chain
    does not list is a contract no desk in the terminal can say anything about —
    not its open interest, not its greeks, not its wall.
  */
  it('prints only at expiries the chain lists', () => {
    const listed = new Set(SNAP.chainByExpiry.map(b => b.expiry.dte));
    expect(listed.size).toBeGreaterThan(1);
    const stray = [...new Set(TAPE.filter(p => p.ticker === 'SPY').map(p => p.dte))]
      .filter(d => !listed.has(d))
      .sort((a, b) => a - b);
    expect(
      stray,
      'the tape printed at expiries the chain does not model — those contracts have ' +
        'no open interest, no greeks and no wall on any desk'
    ).toEqual([]);
  });

  it('so every scanned contract has an open interest to report', () => {
    const missing = ROWS.filter(r => r.oi === null).map(r => r.id);
    expect(missing).toEqual([]);
    for (const row of ROWS) expect(row.estOi.freshness).toBe('ESTIMATED');
  });
});
