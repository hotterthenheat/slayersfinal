/*
  Acceptance test for P-11's map stability.

  The claim this surface makes is unusual: it says the OTHER surfaces are
  showing something less solid than it looks. That is only worth saying if
  the mechanism is real — so what is asserted here is that the read is a
  genuine reprice-and-re-pick, not a decoration:

  1. It agrees with the live map at zero bump — the base levels ARE the map's
     levels, picked through the same shared pickWalls/pickFlip
  2. A book where every strike responds identically to vol does NOT move its
     levels: scaling every strike by the same factor cannot change which
     strike is largest, so a uniform response must read as HOLDS. This is the
     assertion that separates a real re-pick from a gauge that reports motion
     because it re-ran something
  3. A book where one strike is far more vol-sensitive than its neighbour
     DOES swap the wall — staged so the swap is arithmetic, not luck
  4. Travel is a distance and is reported per level; a swap is reported as a
     swap rather than as a large travel
  5. The words carry the actionable half — which level, how far — and say so
     plainly when nothing moves
  6. Degenerate books report null rather than a false verdict
*/
import { buildStability, stabilityWords, VOL_BUMP } from '../src/data/stability';
import { pickFlip, pickWalls } from '../src/core/walls';
import Simulator from '../src/core/simulator';
import type { StrikeNode } from '../src/types/market';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

const node = (strike: number, netGex: number): StrikeNode => ({ strike, netGex } as unknown as StrikeNode);

// ── 1. the base IS the live map ───────────────────────────────────────────
{
  const snap = Simulator.snapshotFor('SPY');
  const s = buildStability(snap.chain, snap.spot, 0.2);
  check('PREMISE: a read builds', s !== null);
  const live = pickWalls(snap.chain, snap.spot, n => n.netGex);
  check(
    'the base levels are the live map, through the same pickers',
    s?.base.callWall === (live.callWall ?? null) && s?.base.putWall === (live.putWall ?? null),
    `${s?.base.callWall}/${s?.base.putWall}`
  );
  check('and the same flip', s?.base.flip === pickFlip(snap.chain, snap.spot, n => n.netGex));
}

// ── 2. a uniform response must HOLD ───────────────────────────────────────
{
  /*
    Every strike the same distance from spot with the same gamma shape
    responds to vol identically, so the bump scales the whole book by one
    factor — and a uniform scale cannot change which strike is largest.
    A gauge that reported motion here would be reporting its own arithmetic.
  */
  const chain = [node(105, -3e8), node(104, -1e8), node(103, -5e7), node(101, 5e7), node(100, 2e8), node(99, 1e8)];
  const s = buildStability(chain, 102, 0.2);
  check('PREMISE: this book has levels to move', s?.base.callWall !== null && s?.base.putWall !== null);
  check('a book that responds uniformly to vol keeps its levels', s?.wallsSwap === false, JSON.stringify({ base: s?.base, up: s?.up }));
  check('— and says it holds', s?.holds === true);
  check('the words say so without hedging', /holds at current vol/.test(stabilityWords(s!)));
}

// ── 3. a differential response swaps the wall ─────────────────────────────
{
  /*
    Two call-side shelves nearly tied, at very different distances from spot.
    The far one is deep out of the money, where gamma is small and zomma is
    proportionally LARGE — so a vol bump lifts it much harder than the near
    one, and the wall changes hands. Staged so the mechanism is the
    arithmetic rather than a coincidence of the book.
  */
  const chain = [node(160, -1.0e8), node(103, -1.02e8), node(100, 1e8), node(95, 2e8)];
  const s = buildStability(chain, 100, 0.2, 1 / 12, 0.05);
  check('PREMISE: the near shelf owns the wall at current vol', s?.base.callWall === 103, String(s?.base.callWall));
  const swapped = s?.up.callWall !== s?.base.callWall || s?.down.callWall !== s?.base.callWall;
  check('a vol move hands the wall to the far shelf', swapped, `base ${s?.base.callWall} up ${s?.up.callWall} down ${s?.down.callWall}`);
  check('and the read reports a swap', s?.wallsSwap === true);
  check('so it does NOT claim to hold', s?.holds === false);
  check('the words name what changed', /which strike is the wall|relocates the flip/.test(stabilityWords(s!)));

  /*
    THE TWO BUMPS ARE GENUINELY OPPOSITE. A mutation that made the down bump
    a second UP bump survived the first cut of this proof: every assertion
    above still held, because the swap was visible either way. Here the far
    shelf takes the wall on the up bump and NOT on the down one, so the two
    sides must disagree — which is only true if one of them is negative.
  */
  check('the down bump is a real down bump — the two sides disagree', s?.up.callWall !== s?.down.callWall, `up ${s?.up.callWall} down ${s?.down.callWall}`);

  /*
    AND TRAVEL IS A DISTANCE. A signed travel survived too, because the only
    book with movement in the first cut had a travel of exactly 0 and the
    assertion was merely `>= 0`. Here the wall jumps 57 points, and a signed
    difference would report −57 — so the maximum would come back 0.
  */
  check('travel is the ABSOLUTE distance a level moved', (s?.wallTravel ?? 0) > 50, String(s?.wallTravel));
}

// ── 4. travel is a distance ───────────────────────────────────────────────
{
  const snap = Simulator.snapshotFor('SPY');
  const s = buildStability(snap.chain, snap.spot, 0.2)!;
  check('flip travel is non-negative or absent', s.flipTravel === null || s.flipTravel >= 0, String(s.flipTravel));
  check('wall travel is non-negative or absent', s.wallTravel === null || s.wallTravel >= 0, String(s.wallTravel));
  check('the default bump is the documented one', VOL_BUMP === 0.02);
  check('and the words state the bump they are about', /±2 vol/.test(stabilityWords(s)));
}

// ── 5+6. degenerate ───────────────────────────────────────────────────────
{
  check('an empty book reports null', buildStability([], 100, 0.2) === null);
  check('no vol reports null rather than a verdict', buildStability([node(100, 1e8)], 100, 0) === null);
  check('no spot likewise', buildStability([node(100, 1e8)], 0, 0.2) === null);
  /* A one-sided book: there is no put wall to move, and that must read as
     absence rather than as stability. */
  const oneSided = buildStability([node(105, -1e8), node(110, -2e8)], 100, 0.2);
  check('a one-sided book reports the missing wall as null', oneSided?.base.putWall === null);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
