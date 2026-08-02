import { describe, it, expect } from 'vitest';
import Simulator from '../core/simulator';
import { buildCompass, resetCompassCache } from './compass';
import { SCANNERS, type Setup } from '../types/compass';

/*
  What the Compass board sorts on.

  `score` is a display rounding of the continuous quantity the sweep ranks with,
  and above a floor of 84 it holds sixteen values on an 8 to 99 scale. Measured on
  the shipped field: 240 rows, 240 distinct ranks, TEN distinct scores. Sorting on
  the score therefore sorts a 230-way sequence of ties, and whatever breaks those
  ties is what really ranks the board — which is precisely the defect the engine's
  own global sort was fixed for.

  So `Setup` carries the rank, and the board sorts on it. These assertions are
  about that comparator rather than about the engine: that the rank still rounds
  to the printed score, that ordering by it never contradicts the score, and that
  the result is a total order which does not depend on the sequence rows arrived
  in. The last one is the whole point, and it is checked by shuffling.
*/

const EPOCH = 1_800_000_000;

/** The engine's display rounding, mirrored so the round trip can be checked. */
const displayScore = (rank: number) => Math.round(Math.min(99, Math.max(8, rank)));

/** The board's comparator, verbatim from pages/Compass.tsx. */
const byRank = (rows: Setup[]) => [...rows].sort((a, b) => b.rank - a.rank);

/** The comparator this replaced, kept so the defect can be demonstrated. */
const byScore = (rows: Setup[]) => [...rows].sort((a, b) => b.score - a.score);

/** Seeded shuffle. A random one would make a failure unreproducible. */
function shuffle<T>(rows: T[], seed = 0x9e3779b9): T[] {
  const out = [...rows];
  let a = seed;
  for (let i = out.length - 1; i > 0; i--) {
    a = (Math.imul(a ^ (a >>> 15), 1 | a) + 0x6d2b79f5) | 0;
    const j = Math.abs(a) % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function boardOf(scanner: (typeof SCANNERS)[number]['key']): Setup[] {
  Simulator.ensureTicker('SPY');
  const snap = Simulator.buildSnapshot('SPY');
  resetCompassCache();
  return buildCompass(snap, scanner, { epoch: EPOCH }).groups.flatMap(g => g.setups);
}

const ids = (rows: Setup[]) => rows.map(r => r.id);

describe('board ranking: the continuous rank, not the printed integer', () => {
  it('the score every row prints is the rounding of the rank it carries', () => {
    for (const s of SCANNERS) {
      for (const row of boardOf(s.key)) {
        expect(row.score, `${s.key} ${row.id}`).toBe(displayScore(row.rank));
      }
    }
  });

  it('ordering by rank never contradicts the score', () => {
    // The rank REFINES the score, it does not disagree with it: walking the
    // ranked board, the printed number may only stay level or fall.
    for (const s of SCANNERS) {
      const ranked = byRank(boardOf(s.key));
      for (let i = 1; i < ranked.length; i++) {
        expect(ranked[i].score, `${s.key} row ${i}`).toBeLessThanOrEqual(ranked[i - 1].score);
      }
    }
  });

  it('the rank separates rows the score cannot', () => {
    for (const s of SCANNERS) {
      const rows = boardOf(s.key);
      const ranks = new Set(rows.map(r => r.rank));
      const scores = new Set(rows.map(r => r.score));
      // Measured on the shipped field: 240 and 10. Every row is its own rank;
      // the score is a ten-way bucketing of the same 240.
      expect(ranks.size, s.key).toBe(rows.length);
      expect(scores.size * 4, `${s.key}: ${scores.size} scores for ${rows.length} rows`).toBeLessThan(rows.length);
    }
  });

  it('the order does not depend on the order rows arrived in', () => {
    // A total order, so a shuffled board sorts back to the identical sequence.
    // This is the assertion the old comparator could not pass.
    for (const s of SCANNERS) {
      const rows = boardOf(s.key);
      expect(ids(byRank(shuffle(rows))), s.key).toEqual(ids(byRank(rows)));
      expect(ids(byRank(shuffle(rows, 0x85ebca6b))), s.key).toEqual(ids(byRank(rows)));
    }
  });

  it('sorting on the printed score does depend on it, which is the defect', () => {
    const rows = boardOf('top-setups');
    // Array#sort is stable, so a score sort preserves whatever order fed it.
    // Feed it a different one and a different board comes out.
    expect(ids(byScore(shuffle(rows)))).not.toEqual(ids(byScore(rows)));
  });

  it('the ties the score leaves are not resolved by the alphabet', () => {
    // The old engine defect, measured the way it was found: of the adjacent pairs
    // sharing a score, how many are in ascending ticker order. It came back at
    // 96% then. On the rank it is a coin flip, 0.47 to 0.52 across the presets.
    for (const s of SCANNERS) {
      const ranked = byRank(boardOf(s.key));
      let tied = 0;
      let ascending = 0;
      for (let i = 1; i < ranked.length; i++) {
        if (ranked[i].score !== ranked[i - 1].score) continue;
        tied++;
        if (ranked[i - 1].ticker <= ranked[i].ticker) ascending++;
      }
      expect(tied, `${s.key} has no ties to check`).toBeGreaterThan(20);
      expect(ascending / tied, s.key).toBeLessThan(0.8);
    }
  });
});
