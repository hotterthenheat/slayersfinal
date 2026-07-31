import { describe, it, expect } from 'vitest';
import Simulator from '../core/simulator';
import { buildCommandView } from './command';
import { buildExposureProfile } from './exposure';
import { buildGexView, buildLevels, pinStrike } from './gex';
import type { KeyLevelKind, KeyLevelRow } from '../types/gex';

/*
  Regression guard for the split-level bug: the key-levels rail and the dealer
  positioning map sit on one screen and each derived its own gamma flip, so SPY
  printed "FLIP LEVEL 501.50" in the rail and "FLIP 500.50" in the map. Across
  the names below the two engines disagreed on the flip 5 times in 16, on the
  call wall 8 times and on the king 5 times — a number that contradicts itself
  intermittently, which is harder to catch than one that is always wrong.

  gex.ts:buildLevels is now the single derivation. These assert that every panel
  fed by it prints one number per level, per ticker, so a failure names the name.
*/

const NAMES = [
  ...Simulator.WATCHLIST,
  // Not core tickers — these register a config on demand, exercising the path
  // where the chain is built fresh rather than replayed.
  'MSFT',
  'AMZN',
  'META',
  'TSLA',
  'GOOGL',
  'AMD',
  'NFLX',
  'AVGO',
  'JPM',
  'COST',
  'ORCL',
  'CRM',
];

/** Window half-width the cockpit uses; the exposure map's default matches it. */
const HALF = 10;

const snapshots = NAMES.map(ticker => ({ ticker, snap: Simulator.buildSnapshot(ticker as never) }));

const railOf = (rows: KeyLevelRow[]): Record<KeyLevelKind, KeyLevelRow> =>
  Object.fromEntries(rows.map(r => [r.kind, r])) as Record<KeyLevelKind, KeyLevelRow>;

describe('structural levels: one derivation, every panel', () => {
  it.each(snapshots)('$ticker rail, chart and matrix print the same levels', ({ snap }) => {
    const levels = buildLevels(snap);
    const rail = railOf(buildCommandView(snap).keyLevels);
    const { levels: chart, matrix } = buildGexView(snap, 'GEX', 10);

    expect(rail.flip.price).toBe(levels.flip);
    expect(rail['call-wall'].price).toBe(levels.callWall);
    expect(rail['put-wall'].price).toBe(levels.putWall);
    expect(rail.king.price).toBe(levels.king);
    expect(rail.spot.price).toBe(levels.spot);
    expect(chart).toEqual(levels);

    const nearestTo = (target: number) =>
      matrix.strikes.reduce(
        (best, s, i) => (Math.abs(s - target) < Math.abs(matrix.strikes[best] - target) ? i : best),
        0
      );
    expect(matrix.callWallIndex).toBe(nearestTo(levels.callWall));
    expect(matrix.putWallIndex).toBe(nearestTo(levels.putWall));
    expect(matrix.spotRowIndex).toBe(nearestTo(levels.spot));

    // The crown belongs to the book's king strike, at 0DTE, and nowhere else.
    const crowned = matrix.cells
      .flatMap((row, r) => row.map((cell, col) => (cell.king ? [matrix.strikes[r], col] : null)))
      .filter(Boolean);
    expect(crowned).toEqual(matrix.strikes.includes(levels.king) ? [[levels.king, 0]] : []);
  });

  it.each(snapshots)('$ticker levels hold their definitions and are pure in the snapshot', ({ snap }) => {
    const levels = buildLevels(snap);
    const strongest = snap.chain.reduce((a, b) => (Math.abs(b.netGex) > Math.abs(a.netGex) ? b : a));

    // King is the whole book's max exposure — it must not move with a window.
    expect(levels.king).toBe(strongest.strike);
    // Walls and flip are the simulator's, not a second scan over the chain.
    expect(levels.callWall).toBe(snap.plan.resistanceWall);
    expect(levels.putWall).toBe(snap.plan.supportWall);
    expect(levels.flip).toBe(snap.plan.flipZone);

    expect(buildLevels(snap)).toEqual(levels);
    expect(pinStrike(snap, HALF)).toBe(pinStrike(snap, HALF));
  });
});

describe('cross-engine agreement: cockpit ↔ exposure map', () => {
  /*
    Every level a reader can see in two places at once is asserted here, because
    that is precisely the failure this file exists to prevent: the landing page
    printed FLIP 501.50 in the levels rail and FLIP 500.50 in the positioning map
    about five hundred pixels below it, same screen, same instrument.

    The block used to carve out callWall / putWall / flip on the grounds that
    exposure.ts still derived its own. It consumes buildLevels now, so the carve
    out is gone and a re-divergence fails here instead of shipping.
  */
  it.each(snapshots)('$ticker structural levels are one number each', ({ snap }) => {
    const rail = railOf(buildCommandView(snap).keyLevels);
    const exposure = buildExposureProfile(snap, '0DTE', HALF);
    const shared = buildLevels(snap);

    expect(exposure.levels.flip).toBe(shared.flip);
    expect(rail.flip.price).toBe(shared.flip);

    expect(exposure.levels.callWall).toBe(shared.callWall);
    expect(exposure.levels.putWall).toBe(shared.putWall);

    expect(rail.pin.price).toBe(pinStrike(snap, HALF));
    expect(exposure.levels.pin).toBe(pinStrike(snap, HALF));

    expect(rail.spot.price).toBe(snap.spot);
    expect(exposure.levels.spot).toBe(snap.spot);
  });

  /*
    The aggregate is a different quantity in each panel and always will be: the
    map sums an expiry-filtered window, the cockpit sums the whole chain. That is
    legitimate, but it must never decide which way dealers lean, because the two
    sums disagreed on the SIGN for two of sixteen names, and one screen said
    dealers amplify while another said they absorb.
  */
  it.each(snapshots)('$ticker dealer bias reads the whole chain, not the window', ({ snap }) => {
    const exposure = buildExposureProfile(snap, '0DTE', HALF);
    const chainNet = snap.chain.reduce((a, n) => a + n.netGex, 0);

    if (exposure.bias === 'BULLISH') expect(chainNet).toBeGreaterThan(0);
    if (exposure.bias === 'BEARISH') expect(chainNet).toBeLessThan(0);
  });
});

describe('key-levels rail shape', () => {
  it.each(snapshots)('$ticker renders one row per level, price-descending, distances honest', ({ snap }) => {
    const rows = buildCommandView(snap).keyLevels;
    const kinds = rows.map(r => r.kind);

    expect([...kinds].sort()).toEqual(['call-wall', 'flip', 'king', 'pin', 'put-wall', 'spot']);
    expect(rows.map(r => r.price)).toEqual([...rows.map(r => r.price)].sort((a, b) => b - a));

    for (const row of rows) {
      expect(row.distPct).toBeCloseTo(((row.price - snap.spot) / snap.spot) * 100, 9);
    }
    // Distances are measured from spot, so spot's own is exactly zero by
    // definition rather than by arithmetic that could round away from it.
    expect(railOf(rows).spot.distPct).toBe(0);
  });
});
