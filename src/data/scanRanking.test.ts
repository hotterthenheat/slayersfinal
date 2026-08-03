import { describe, it, expect } from 'vitest';
import Simulator from '../core/simulator';
import { buildScanUniverse, scanEpoch, type ScanName } from '../core/scanUniverse';
import {
  CANDIDATES_PER_NAME,
  buildCompass,
  makeSetup,
  nameEdge01,
  prescreenRank,
  prescreenScore,
  resetCompassCache,
  scannerFloor,
  strikeLadder,
} from './compass';
import { setupState, SETUP_STATES, type SetupState } from '../components/compass/setupState';
import { SCANNERS, type OptionRight, type Setup, type Verdict } from '../types/compass';

/*
  What the Compass board IS, pinned.

  The user's ask is one sentence — "top setups should be the best setups in the
  market no matter what" — and every assertion here exists because some part of
  the sweep used to break it while the suite stayed green. The board was capped
  at eight contracts per ticker across forty tickers, so it filled 193 of a
  240-row cap while 1,745 qualifying contracts were never looked at; the score
  saturated at 99 for every row it did show; and the tie underneath was broken
  on the ticker name, so the board came back ADAP, ALNY, ANFI, BIOL, CMG, COR.
  The tests below re-derive the field independently rather than asking the
  engine to confirm itself.
*/

const EPOCH = 1_800_000_000;
const snap = Simulator.buildSnapshot('SPY');

/** The score a rank rounds to — display rounding, mirrored from the engine. */
const displayScore = (rank: number) => Math.round(Math.min(99, Math.max(8, rank)));

const board = (scanner = 'top-setups' as const, epoch = EPOCH) => {
  resetCompassCache();
  const data = buildCompass(snap, scanner, { epoch });
  const rows = data.groups.flatMap(g => g.setups.map(s => ({ setup: s, spot: g.spot })));
  return { data, rows, setups: rows.map(r => r.setup) };
};

/*
  The sweep's own candidate field, rebuilt from the outside.

  Live names are skipped: their lean is read off the simulator's candle buffer
  rather than the scan walk, and reaching for it here would register tickers and
  put the wide field on the 1.5s tick loop — the one thing core/scanUniverse.ts
  exists to prevent. That leaves 500+ of the 520 names, which is the whole
  question. `top-setups` prunes the counter-trend half of the field on an exact
  bound, so every candidate below is the aligned right.
*/
interface FieldCandidate {
  key: string;
  ticker: string;
  strike: number;
  right: OptionRight;
  rank: number;
}

function scannedField(names: ScanName[], scanner = 'top-setups' as const): FieldCandidate[] {
  const floor = scannerFloor(scanner);
  const out: FieldCandidate[] = [];
  for (const n of names) {
    if (n.live) continue;
    const right: OptionRight = n.trendUp ? 'C' : 'P';
    const edge = nameEdge01(n);
    for (const strike of strikeLadder(n.spot, n.step)) {
      // Mirrors the engine's inputs — sleeve, the name's own edge, its own strike
      // step. Anything less and this is ranking a different field than the board.
      const rank = prescreenRank(n.ticker, n.spot, strike, right, scanner, true, 'odte', edge, n.step);
      if (displayScore(rank) >= floor) {
        out.push({ key: `${n.ticker}|${strike}|${right}`, ticker: n.ticker, strike, right, rank });
      }
    }
  }
  return out;
}

describe('scan board: it is the global top-N, with nothing in between', () => {
  it('no contract off the board outranks a contract on it', () => {
    const { rows } = board();
    const onBoard = new Map(rows.map(r => [`${r.setup.ticker}|${r.setup.strike}|${r.setup.right}`, r]));

    // Rank every board row from the outside, off the same spot its group prints.
    const byTicker = new Map(buildScanUniverse(EPOCH).map(n => [n.ticker, n]));
    const boardRanks = rows.map(r => {
      const n = byTicker.get(r.setup.ticker);
      return prescreenRank(
        r.setup.ticker,
        r.spot,
        r.setup.strike,
        r.setup.right,
        'top-setups',
        true,
        'odte',
        n ? nameEdge01(n) : 0.5,
        n?.step ?? 1
      );
    });
    const weakestOnBoard = Math.min(...boardRanks);

    const missed = scannedField(buildScanUniverse(EPOCH)).filter(
      c => c.rank > weakestOnBoard && !onBoard.has(c.key)
    );
    // The old per-ticker/group quotas made this list ~1,700 long.
    expect(missed).toEqual([]);
  });

  it('a name is never held back by a quota — its depth is its rank and nothing else', () => {
    const universe = buildScanUniverse(EPOCH);
    const { rows } = board();
    const live = new Set(universe.filter(n => n.live).map(n => n.ticker));

    const perTicker = new Map<string, number>();
    for (const r of rows) perTicker.set(r.setup.ticker, (perTicker.get(r.setup.ticker) ?? 0) + 1);
    // The only ceiling on one name is the size of its own candidate set, which
    // is arithmetic rather than policy, not a quota anyone chose.
    for (const count of perTicker.values()) expect(count).toBeLessThanOrEqual(CANDIDATES_PER_NAME);

    /*
      Depth is earned. A global ranking restricted to the scanned (non-live)
      names is still a ranking, so the non-live rows on the board have to BE the
      head of the non-live field — same length, same contracts. A quota shows up
      here as a name holding rows it did not earn while another holds none.
    */
    const onBoard = rows.filter(r => !live.has(r.setup.ticker));
    const head = scannedField(universe)
      .sort((a, b) => b.rank - a.rank)
      .slice(0, onBoard.length);
    expect(head.length).toBe(onBoard.length);
    expect(new Set(head.map(c => c.key))).toEqual(
      new Set(onBoard.map(r => `${r.setup.ticker}|${r.setup.strike}|${r.setup.right}`))
    );
  });

  it('the board never shows more than the field holds', () => {
    for (const s of SCANNERS) {
      const { data, rows } = board(s.key as 'top-setups');
      expect(rows.length).toBe(data.shown);
      expect(data.shown).toBeLessThanOrEqual(data.totalFound);
    }
  });

  it('the broad screens leave something out, so "top" means something', () => {
    /*
      Only the broad ones. This used to assert it of all six, which was true
      while every style ranked on proximity alone — they all qualified thousands
      and the cap did the selecting.

      A style with a real strike preference qualifies far fewer: Quick Scalp
      wants the gamma peak and nothing else, Whale Sweeps wants block strikes
      near the money, and both of those legitimately return a board smaller than
      the cap. That is the screen doing its job, not the cap failing to bite, and
      asserting otherwise would force every style to be broad.
    */
    for (const key of ['top-setups', 'all'] as const) {
      const { data } = board(key as 'top-setups');
      expect(data.totalFound, key).toBeGreaterThan(data.shown);
    }
  });

  it('every row on the board is a distinct contract', () => {
    for (const s of SCANNERS) {
      const ids = board(s.key as 'top-setups').setups.map(x => x.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe('scan board: ranked by the field, never by the alphabet', () => {
  it('the score is a display rounding of the rank the sweep sorts on', () => {
    for (let k = -6; k <= 6; k++) {
      for (const r of ['C', 'P'] as const) {
        for (const aligned of [true, false]) {
          const rank = prescreenRank('AAPL', 100, 100 + k * 0.4, r, 'top-setups', aligned);
          expect(prescreenScore('AAPL', 100, 100 + k * 0.4, r, 'top-setups', aligned)).toBe(displayScore(rank));
        }
      }
    }
  });

  it('the rank separates candidates the score cannot', () => {
    const field = scannedField(buildScanUniverse(EPOCH));
    const ranks = new Set(field.map(c => c.rank));
    const scores = new Set(field.map(c => displayScore(c.rank)));

    // The whole defect in one comparison: above a floor of 84 the score holds
    // sixteen values, and every candidate past the sixteenth is a tie the score
    // cannot break. The rank has one value per candidate.
    expect(scores.size).toBeLessThanOrEqual(16);
    expect(field.length).toBeGreaterThan(scores.size * 20);
    expect(ranks.size).toBe(field.length);
  });

  it('board order carries no alphabetical bias', () => {
    const tickers = board().setups.map(s => s.ticker);
    expect(tickers.length).toBeGreaterThan(100);

    /*
      Measured only where the NAME changes.

      A name's contracts now sit next to each other on the board, because the
      rank carries a per-name term that is constant across its ladder. Counting
      every adjacent pair therefore counts a run of one ticker as "not
      ascending" and drags the share down without any spelling bias existing —
      measured 0.32 on a board that is not alphabetical at all. Comparing at the
      transitions asks the question the test means to ask.
    */
    const changes: number[] = [];
    for (let i = 1; i < tickers.length; i++) {
      if (tickers[i] !== tickers[i - 1]) changes.push(tickers[i] > tickers[i - 1] ? 1 : 0);
    }
    expect(changes.length).toBeGreaterThan(50);
    const ascending = changes.reduce((a, b) => a + b, 0);
    const share = ascending / changes.length;
    expect(share).toBeGreaterThan(0.35);
    expect(share).toBeLessThan(0.65);
    expect([...tickers].sort()).not.toEqual(tickers);
  });

  it('the ranking is reproducible at a fixed epoch', () => {
    const a = board().setups.map(s => s.id);
    const b = board().setups.map(s => s.id);
    expect(b).toEqual(a);
  });
});

describe('strike ladder: rungs are a share of spot, not a count of steps', () => {
  const universe = buildScanUniverse(EPOCH);

  it('every name gets nine distinct, evenly spaced strikes', () => {
    for (const n of universe) {
      const ladder = strikeLadder(n.spot, n.step);
      expect(ladder.length).toBe(CANDIDATES_PER_NAME / 2);
      expect(new Set(ladder).size).toBe(ladder.length);
      expect(ladder[0]).toBeGreaterThan(0);
      const gap = ladder[1] - ladder[0];
      for (let i = 1; i < ladder.length; i++) expect(ladder[i] - ladder[i - 1]).toBeCloseTo(gap, 8);
      // Never finer than the name's own grid.
      expect(gap).toBeGreaterThanOrEqual(n.step - 1e-9);
    }
  });

  it('the ladder spans a comparable share of spot on a cheap name and an expensive one', () => {
    // The defect it replaces: ±4 fixed steps put a $600 name's nine strikes
    // inside 0.7% of spot — every one of them at the money by the score's
    // reckoning — while the same ladder ran clean off a $20 name's window.
    for (const spot of [120, 180, 240, 320, 480, 600]) {
      const ladder = strikeLadder(spot, 1);
      const span = (ladder[8] - ladder[0]) / spot;
      expect(span).toBeGreaterThan(0.025);
      expect(span).toBeLessThan(0.07);
    }
  });

  it('the outer rungs are genuinely out of the money on every name the grid allows', () => {
    for (const n of universe) {
      if (n.step / n.spot > 0.005) continue; // grid coarser than one rung — see strikeLadder
      const ladder = strikeLadder(n.spot, n.step);
      const reach = Math.max(...ladder.map(k => Math.abs(k - n.spot))) / n.spot;
      expect(reach).toBeGreaterThan(0.012);
    }
  });

  it('the ladder produces a real spread of scores rather than one saturated value', () => {
    // A $600 name used to score 96+ on all nine of its strikes.
    const spot = 600;
    const scores = strikeLadder(spot, 1).map(k => prescreenScore('NVDA', spot, k, 'C', 'top-setups', true));
    expect(Math.max(...scores) - Math.min(...scores)).toBeGreaterThan(30);
    expect(new Set(scores).size).toBeGreaterThan(5);
  });

  it('the jitter can never lift a strike above one nearer the money', () => {
    // The jitter is a tiebreaker between names, not a ranking signal. If it
    // could reorder rungs, "near the money ranks highest" would be a slogan.
    for (const [spot, step] of [[600, 1], [180, 1], [60, 0.5]] as const) {
      const ladder = strikeLadder(spot, step);
      for (const t of ['AAPL', 'NVDA', 'PG', 'F']) {
        const byRung = ladder.map(k => ({
          dist: Math.abs(k - spot),
          rank: prescreenRank(t, spot, k, 'C', 'top-setups', true),
        }));
        for (const a of byRung) {
          for (const b of byRung) {
            if (a.dist - b.dist > step) expect(a.rank).toBeLessThan(b.rank);
          }
        }
      }
    }
  });
});

describe('the vocabulary is reachable: no dead verdicts, no dead states', () => {
  /** A contract far enough out that the engine steps aside. */
  const setupAt = (strike: number, right: OptionRight = 'C') =>
    makeSetup('AAPL', 200, strike, right, 'top-setups', 0.3, true);

  it('every verdict is reachable on a contract the engine merely evaluates', () => {
    const seen = new Set<Verdict>();
    for (let strike = 180; strike <= 220; strike += 0.5) seen.add(setupAt(strike).verdict);
    expect(seen).toEqual(new Set<Verdict>(['ENTER', 'WATCH', 'EXIT']));
  });

  it('every lifecycle state is reachable', () => {
    const seen = new Set<SetupState>();
    for (let strike = 180; strike <= 220; strike += 0.5) {
      for (const right of ['C', 'P'] as const) seen.add(setupState(setupAt(strike, right)));
    }
    // ARMED was structurally impossible until the take-profit ladder stopped
    // deciding it with an RNG draw.
    expect([...seen].sort()).toEqual([...SETUP_STATES].sort());
  });

  it('a ranked feed shows only the head of the distribution, and says so', () => {
    for (const s of SCANNERS) {
      const setups = board(s.key as 'top-setups').setups;
      // A scanner ranks; its feed is the top of the field by construction, so a
      // faded contract cannot appear in one. EXIT reaches a screen through
      // Tracker and the Weigher, which evaluate rather than rank.
      expect(setups.some(x => x.verdict === 'EXIT')).toBe(false);
    }
  });

  it('the lifecycle vocabulary is reachable across the strip', () => {
    /*
      ARMED and TRIGGERED both have to exist somewhere, or one of them is dead
      language. They used to be asserted of EVERY board, which held while all six
      styles ranked on proximity and therefore all picked at-the-money contracts.

      A style with a real strike preference cannot promise both. TRIGGERED means
      price has taken the strike — |delta| at or past 0.50 — so a style that buys
      out of the money by construction never shows one, and a style that leans in
      the money never shows ARMED. Measured, Discounted's rows sit under 0.50
      delta and Rebounds' sit at or over it, so the two boards carry opposite
      halves of the vocabulary. That is both styles doing exactly what their tabs
      claim, and pinning it is a stronger check than the uniformity it replaces.
    */
    const seen = new Set<SetupState>();
    for (const s of SCANNERS) board(s.key as 'top-setups').setups.forEach(x => seen.add(setupState(x)));
    expect(seen.has('ARMED')).toBe(true);
    expect(seen.has('TRIGGERED')).toBe(true);

    const sideOf = (key: 'discounted' | 'rebounds') => {
      const rows = board(key as 'top-setups').setups;
      return rows.filter(r => Math.abs(r.greeks.delta) >= 0.5).length / rows.length;
    };
    // Discounted reaches for a stretch; Rebounds pays for delta. Opposite ends.
    expect(sideOf('discounted')).toBeLessThan(0.1);
    expect(sideOf('rebounds')).toBeGreaterThan(0.9);
  });

  it('a scanned setup carries an untouched ladder, because nothing was entered', () => {
    const setups = board().setups;
    for (const s of setups.slice(0, 40)) {
      expect(s.takeProfits.map(tp => tp.status)).toEqual(['PENDING', 'PENDING', 'PENDING', 'PENDING']);
      // Targets still climb, and still hang off the mid they are measured from.
      const pcts = s.takeProfits.map(tp => tp.expectedPct);
      expect([...pcts].sort((a, b) => a - b)).toEqual(pcts);
      expect(s.takeProfits[0].target).toBeGreaterThan(s.mid);
    }
  });

  it('the lifecycle splits on the strike, not on the score', () => {
    // TRIGGERED and ARMED have to mean something a score cannot already say.
    const rows = board().setups.filter(s => s.verdict === 'ENTER');
    const armed = rows.filter(s => setupState(s) === 'ARMED');
    const triggered = rows.filter(s => setupState(s) === 'TRIGGERED');
    expect(armed.length).toBeGreaterThan(rows.length * 0.15);
    expect(triggered.length).toBeGreaterThan(rows.length * 0.15);
    for (const s of triggered) expect(Math.abs(s.greeks.delta)).toBeGreaterThanOrEqual(0.5);
    for (const s of armed) expect(Math.abs(s.greeks.delta)).toBeLessThan(0.5);
  });
});

describe('scan board: continuity across sweeps', () => {
  /*
    The board turns over because PRICE moved, which is the only reason it should.
    Its old stability was an artifact of the alphabetical tiebreak: the same
    forty names held their seats through any amount of movement. There is no
    hysteresis here on purpose — a sticky board is not the global top-N, and
    holding a seat across sweeps would need state the sweep does not have (it is
    a pure function of the epoch, which is what makes it reproducible).
  */
  it('a sweep moves the board without replacing it', () => {
    const now = board('top-setups', EPOCH).setups;
    const next = board('top-setups', EPOCH + 1).setups;
    const ids = new Set(now.map(s => s.id));
    const names = new Set(now.map(s => s.ticker));
    expect(next.filter(s => ids.has(s.id)).length / next.length).toBeGreaterThan(0.5);
    expect(next.filter(s => names.has(s.ticker)).length / next.length).toBeGreaterThan(0.6);
  });

  it('the contract a user opened is not held by the board', () => {
    // Review mode and Tracker rebuild a setup from its identity, so a contract
    // dropping off the ranking never moves out from under an open pane.
    const first = board().setups[0];
    const rebuilt = makeSetup(first.ticker, snap.spot, first.strike, first.right, 'top-setups', 0.3);
    expect(rebuilt.id).toBe(first.id);
    expect(rebuilt.contract).toBe(first.contract);
  });
});

describe('scan board: the sweep stays a pure function of the clock', () => {
  it('the epoch, not the tick, decides the field', () => {
    expect(scanEpoch(0)).toBe(0);
    const a = board('top-setups', EPOCH).setups.map(s => `${s.id}@${s.score}`);
    const b = board('top-setups', EPOCH).setups.map(s => `${s.id}@${s.score}`);
    expect(a).toEqual(b);
  });

  it('a sweep registers no simulator tickers', () => {
    const before = Object.keys(Simulator.TICKERS).length;
    for (const s of SCANNERS) board(s.key as 'top-setups').setups.forEach((x: Setup) => x.score);
    expect(Object.keys(Simulator.TICKERS).length).toBe(before);
  });
});
