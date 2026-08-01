import { describe, it, expect } from 'vitest';
import Simulator from '../core/simulator';
import * as positioningMap from '../components/gex/positioningMapModel';
import { buildCommandView } from './command';
import { buildExposureProfile } from './exposure';
import { buildGexView, buildLevels, pinStrike } from './gex';
import { buildRankedTargets } from './rankedtargets';
import { buildVannaCharm, levelsOfProfile } from './vannacharm';
import type { IvShift, KeyLevelKind, KeyLevelRow, ShiftMode, TargetTag } from '../types/gex';

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

/*
  The three modules that sat outside the net above, and each of which had rolled
  its own answer to a question gex.ts already answers:

    · vannacharm.ts   scanned a windowed copy for walls / flip / king
    · rankedtargets.ts scanned the chain again for walls / king / pin
    · positioningMapModel.ts took an argmax over the windowed, decayed, jittered bars

  None of them was wrong in a way that shows up as an obviously broken screen —
  the walls agreed most days. The flip did not: it disagreed with the rail on 5
  of these 16 names, the ranked-targets pin sat $10 from the rail's pin on AAPL,
  and the map's crown moved to a different strike on 8 of 32 ticker × expiry
  combinations. Agreement by coincidence is exactly what this file exists to
  stop being mistaken for agreement by construction.
*/
describe('single derivation: the panels that used to roll their own', () => {
  const MODES: ShiftMode[] = ['CHARM', 'VANNA'];

  /*
    Every scenario the panel can actually be put in. Charm ignores the IV shift,
    so it appears once; vanna is swept across the whole `IvShift` union because
    the size of the shock is what decides whether a level moves at all — and the
    sentences that quote a level MOVING are only reachable when one does. At a
    single shift those branches go unread on most names.
  */
  const SCENARIOS: [ShiftMode, IvShift][] = [
    ['CHARM', -1],
    ['VANNA', -2],
    ['VANNA', -1],
    ['VANNA', 1],
    ['VANNA', 2],
  ];

  it.each(snapshots)('$ticker vanna & charm calls the book’s levels "now"', ({ snap }) => {
    const levels = buildLevels(snap);
    for (const mode of MODES) {
      const view = buildVannaCharm(snap, mode, -1, HALF);
      const shift = Object.fromEntries(view.shifts.map(s => [s.kind, s]));

      // Left side of every "now → scenario" arrow. If it is not the rail's
      // number, the arrow is measuring the derivation, not the scenario.
      expect(shift['call-wall'].current).toBe(levels.callWall);
      expect(shift['put-wall'].current).toBe(levels.putWall);
      expect(shift.flip.current).toBe(levels.flip);
      expect(shift.king.current).toBe(levels.king);
      expect(view.flipCurrent).toBe(levels.flip);

      // Exactly one bar carries the pin marker, and it is the rail's pin.
      expect(view.rows.filter(r => r.pin).map(r => r.strike)).toEqual([pinStrike(snap, HALF)]);
    }
  });

  /*
    A projection is a property of the book, like the levels it moves. Charm's
    per-strike normalizer used to be the rendered window's own heaviest charm,
    so the same strike migrated to a different dollar figure depending on how
    many strikes the host panel asked for — and the levels read off it inherited
    that. Widening the window may show more bars; it may not change one.
  */
  it.each(snapshots)('$ticker migration is the book’s, not the window’s', ({ snap }) => {
    for (const mode of MODES) {
      const narrow = buildVannaCharm(snap, mode, -1, 10);
      const wide = buildVannaCharm(snap, mode, -1, 15);
      expect(wide.shifts).toEqual(narrow.shifts);

      const wideAt = new Map(wide.rows.map(r => [r.strike, r.projected]));
      for (const row of narrow.rows) expect(wideAt.get(row.strike)).toBe(row.projected);
    }
  });

  /*
    The scenario and the recorded session are the two profiles no engine can be
    asked about — one is hypothetical, one is already gone — so vannacharm.ts
    carries the plan's RULES to apply to them. This is the seam where a second
    derivation could creep back in, so it is pinned directly: fed today's book,
    that function must return exactly what buildLevels returns.
  */
  it.each(snapshots)('$ticker the scenario rules reproduce buildLevels on today’s book', ({ snap }) => {
    const { callWall, putWall, flip, king } = buildLevels(snap);
    const today = snap.chain.map(n => ({ strike: n.strike, value: n.netGex }));
    expect(levelsOfProfile(today, snap.spot)).toEqual({ callWall, putWall, flip, king });
  });

  /*
    The right-hand side of every arrow is read off a book that does not exist, so
    no engine can be asked to confirm it. What can be checked is that it is still
    a price this book could produce: walls and the king are strikes, and the flip
    is the midpoint of the two strikes the profile crosses zero across, or spot
    when it never crosses. A projected level anywhere else came from arithmetic
    on a level rather than from the profile.
  */
  it.each(snapshots)('$ticker the scenario quotes prices the book has', ({ snap }) => {
    const asc = [...snap.chain].sort((a, b) => a.strike - b.strike);
    const strikes = new Set(asc.map(n => n.strike));
    const midpoints = new Set(asc.slice(1).map((n, i) => (asc[i].strike + n.strike) / 2));

    for (const [mode, ivShift] of SCENARIOS) {
      const view = buildVannaCharm(snap, mode, ivShift, HALF);
      const shift = Object.fromEntries(view.shifts.map(s => [s.kind, s]));

      for (const kind of ['call-wall', 'put-wall', 'king'] as const) {
        expect(strikes.has(shift[kind].projected)).toBe(true);
      }
      expect(midpoints.has(shift.flip.projected) || shift.flip.projected === snap.spot).toBe(true);

      // The chart's own flip fields are the flip row, not a third derivation.
      expect(view.flipCurrent).toBe(shift.flip.current);
      expect(view.flipProjected).toBe(shift.flip.projected);
    }
  });

  /*
    The narrative is prose, so a number in it is the easiest place in the app for
    a figure to appear that nothing computed — and the hardest to notice, because
    a sentence reads as true. Every price it quotes must therefore be one the
    panel is already showing.

    A price is any figure at or above the book's lowest strike; below that the
    sentences quote a bleed percentage, an hour count and the IV shift, none of
    which are prices. The cheapest name here opens its chain at 126.
  */
  it.each(snapshots)('$ticker the migration narrative quotes no price the panel does not carry', ({ snap }) => {
    const asc = [...snap.chain].sort((a, b) => a.strike - b.strike);
    const floor = asc[0].strike;
    const quotable = new Set([
      ...asc.map(n => n.strike),
      ...asc.slice(1).map((n, i) => (asc[i].strike + n.strike) / 2),
      snap.spot,
    ]);

    for (const [mode, ivShift] of SCENARIOS) {
      const view = buildVannaCharm(snap, mode, ivShift, HALF);
      const prose = view.insights.join(' | ');

      const prices = [...prose.matchAll(/\d+(?:\.\d+)?/g)].map(m => Number(m[0])).filter(n => n >= floor);
      // Vacuous otherwise: both modes always name at least the flip.
      expect(prices.length).toBeGreaterThan(0);
      for (const price of prices) expect(quotable.has(price)).toBe(true);

      // Every "now → scenario" the prose draws is a row of the shift table, so
      // the sentence and the table can never quote the level differently.
      const arrows = [...prose.matchAll(/(-?[\d.]+)\s*→\s*(-?[\d.]+)/g)].map(m => `${Number(m[1])}→${Number(m[2])}`);
      const rows = view.shifts.map(s => `${s.current}→${s.projected}`);
      for (const arrow of arrows) expect(rows).toContain(arrow);
    }
  });

  /*
    Pin is the one level that is honestly a function of the window (gex.ts
    `pinStrike`), so a wider panel naming a different strike is correct — but it
    must be THAT panel's window, and it must be marked once. Reading the rail's
    10-wide pin onto a 15-wide panel would put the badge on a strike the panel's
    own heaviest-OI scan disagrees with.
  */
  it.each(snapshots)('$ticker the pin marker follows the panel’s own window', ({ snap }) => {
    for (const mode of MODES) {
      const wide = buildVannaCharm(snap, mode, -1, 15);
      expect(wide.rows.filter(r => r.pin).map(r => r.strike)).toEqual([pinStrike(snap, 15)]);
    }
  });

  /*
    Wall Drift puts the measured session and the scenario on ONE price axis, the
    scenario's "now" dot inches from the measured series' right edge. Those are
    the same moment, so they are the same prices — the sampling stride used to
    stop two bars short and quietly print two.
  */
  it.each(snapshots)('$ticker wall drift ends on the levels the rail prints', ({ snap }) => {
    const levels = buildLevels(snap);
    const { drift } = buildVannaCharm(snap, 'CHARM', -1, HALF);
    expect(drift.length).toBeGreaterThan(1);

    const last = drift[drift.length - 1];
    expect(last.spot).toBe(snap.spot);
    expect(last.callWall).toBe(levels.callWall);
    expect(last.putWall).toBe(levels.putWall);
    expect(last.flip).toBe(levels.flip);
  });

  it.each(snapshots)('$ticker ranked targets badges the shared levels and nothing else', ({ snap }) => {
    const levels = buildLevels(snap);
    const pin = pinStrike(snap, HALF);
    const { targets } = buildRankedTargets(snap);
    const asc = (xs: number[]) => [...xs].sort((a, b) => a - b);
    const badged = (tag: TargetTag) => asc(targets.filter(t => t.tags.includes(tag)).map(t => t.strike));

    expect(badged('KING')).toEqual([levels.king]);
    expect(badged('PIN')).toEqual([pin]);
    expect(badged('WALL')).toEqual(asc([levels.callWall, levels.putWall]));
    // MAGNET is the pin's class by definition, so it names the pin and no one else.
    expect(targets.filter(t => t.hedgingClass === 'MAGNET').map(t => t.strike)).toEqual([pin]);
  });

  /*
    The badges above name book-wide levels, so the table they sit in has to be
    book-wide too. Window this table and the king can simply be absent from it,
    which reads as "no king today" rather than "the king is off-screen" — and the
    rail two panels over would still be naming it.
  */
  it.each(snapshots)('$ticker ranked targets rank the whole book their badges come from', ({ snap }) => {
    const { targets } = buildRankedTargets(snap);
    const asc = (xs: number[]) => [...xs].sort((a, b) => a - b);

    expect(asc(targets.map(t => t.strike))).toEqual(asc(snap.chain.map(n => n.strike)));
    expect(targets.map(t => t.rank)).toEqual(targets.map((_, i) => i + 1));
  });

  it.each(snapshots)('$ticker the positioning map is handed the book’s king', ({ snap }) => {
    expect(buildExposureProfile(snap, '0DTE', HALF).levels.king).toBe(buildLevels(snap).king);
  });

  /*
    The map draws no flip line. It changes the fill colour at a band boundary and
    claims that boundary IS the flip — which holds only because both are the
    midpoint of the same two strikes. Nothing tested it, so a change to how bands
    are edged would have moved the regime boundary a half-strike with no line on
    screen to look wrong.

    The flip is asserted to be inside the rendered window first: the simulator
    pivots it within about 1% of spot, so a flip outside ±10 strikes is itself
    the regression, and without this the boundary check could pass vacuously.
  */
  it.each(snapshots)('$ticker the map’s colour boundary is the engine’s flip', ({ snap }) => {
    const { flip } = buildLevels(snap);
    const { strikes } = buildExposureProfile(snap, '0DTE', HALF);
    const scale = positioningMap.priceScale(strikes, 1);

    expect(flip).toBeGreaterThan(scale.lo);
    expect(flip).toBeLessThan(scale.hi);

    const y = scale.yOf(flip);
    // The last band is squared off at the plot floor, so 1 is an edge too.
    const edges = [...positioningMap.bands(strikes, 1).map(b => b.top), 1];
    const nearest = edges.reduce((best, e) => (Math.abs(e - y) < Math.abs(best - y) ? e : best), edges[0]);
    expect(nearest).toBeCloseTo(y, 9);
  });

  /*
    A tripwire, not a style rule. positioningMapModel.ts only ever receives the
    windowed, expiry-decayed, jittered bars, so any level it exports is a fact
    about the drawing rather than about the book — and one named `kingStrike`
    shipped, and moved when the panel was resized. The module is a geometry
    helper; levels reach it on ExposureLevels or not at all.
  */
  it('the positioning map exports geometry and scales, not levels', () => {
    expect(Object.keys(positioningMap).sort()).toEqual([
      'bands',
      'cumHalfOf',
      'cumulative',
      'ghostRuns',
      'netMaxOf',
      'priceScale',
      'tierFor',
    ]);
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
