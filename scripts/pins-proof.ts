/*
  Acceptance test for P-10's two pins. Runs the ACTUAL module against staged
  chains where the answers are computable by hand, then against the simulator
  for the structural claims.

  Proves:
  1. Max pain really minimises the total intrinsic payout — checked against a
     brute-force recomputation, and against a hand-built book whose answer is
     known
  2. The two definitions DISAGREE on a book built to split them — the entire
     reason the pair exists
  3. Ties in the pain valley resolve toward spot, not toward an end
  4. The gamma pin is the |netGex|-weighted centroid, unsigned — a book with
     equal opposite shelves pins BETWEEN them only when both really carry mass
  5. Empty and degenerate books report null, never a made-up strike
  6. The gap is the difference, and carries its sign
*/
import Simulator from '../src/core/simulator';
import { buildPins } from '../src/data/pins';
import type { StrikeNode } from '../src/types/market';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

/** A bare strike node — only the fields the pins read are meaningful. */
const node = (strike: number, callOI: number, putOI: number, netGex: number): StrikeNode => ({
  strike, callOI, putOI, netGex,
  gamma: 0, callGex: 0, putGex: 0, callDex: 0, putDex: 0, netDex: 0,
  callVex: 0, putVex: 0, netVex: 0, vanna: 0, charm: 0,
});

// ── 1. max pain is the payout minimiser ───────────────────────────────────
{
  /*
    A book anyone can settle by hand: heavy calls at 100, heavy puts at 110.
    Settling at 100 pays the puts 10 points; at 110 pays the calls 10 points;
    at 105 pays five points each — with equal OI the pain curve is flat
    BETWEEN the strikes it is anchored by, and V-shaped outside them. With
    MORE put OI, settlement wants to be higher: pain is minimised at 110.
  */
  const book = [node(100, 1000, 0, 0), node(105, 0, 0, 0), node(110, 0, 2000, 0)];
  const p = buildPins(book, 105);
  check('a put-heavy book settles high — max pain at the put strike', p.maxPain === 110, String(p.maxPain));

  const flipped = buildPins([node(100, 2000, 0, 0), node(105, 0, 0, 0), node(110, 0, 1000, 0)], 105);
  check('a call-heavy book settles low', flipped.maxPain === 100, String(flipped.maxPain));

  /* And against the simulator's real chain, by brute force. */
  const snap = Simulator.snapshotFor('SPY');
  const got = buildPins(snap.chain, snap.spot);
  const strikes = [...snap.chain].sort((a, b) => a.strike - b.strike);
  const painAt = (S: number) => {
    let t = 0;
    for (const n of strikes) {
      if (S > n.strike) t += n.callOI * (S - n.strike) * 100;
      if (n.strike > S) t += n.putOI * (n.strike - S) * 100;
    }
    return t;
  };
  const minPain = Math.min(...strikes.map(n => painAt(n.strike)));
  check(
    'on the live chain, no listed strike pays out less than max pain does',
    got.maxPain !== null && painAt(got.maxPain) === minPain,
    `${got.maxPain} pays ${got.maxPain !== null ? painAt(got.maxPain).toExponential(3) : '—'}`
  );
}

// ── 2. the two definitions disagree when the masses do ────────────────────
{
  /*
    OI mass at 100 (huge, balanced — pain pins there), gamma mass at 120
    (all of the book's netGex). The pair exists because these are different
    questions; this book makes them give different answers.
  */
  const split = [node(100, 5000, 5000, 1e6), node(120, 10, 10, 9e8)];
  const p = buildPins(split, 110);
  check('PREMISE: the split book yields both pins', p.maxPain !== null && p.gammaPin !== null);
  check('and they disagree — OI mass and gamma mass are different questions', p.maxPain === 100 && (p.gammaPin ?? 0) > 119, `maxPain ${p.maxPain}, gammaPin ${p.gammaPin?.toFixed(2)}`);
  check('the gap carries the sign of the disagreement', (p.gap ?? 0) > 19, String(p.gap?.toFixed(2)));
}

// ── 3. ties resolve toward spot ───────────────────────────────────────────
{
  /* Equal OI on both wings makes the whole middle a flat pain valley:
     100/110/120 all pay the same. The nearest candidate to spot wins. */
  const flat = [node(100, 1000, 0, 0), node(110, 0, 0, 0), node(120, 0, 1000, 0)];
  check('a flat pain valley resolves to the candidate nearest spot (spot 112)', buildPins(flat, 112).maxPain === 110, String(buildPins(flat, 112).maxPain));
  check('— and follows spot, not the strike list (spot 101)', buildPins(flat, 101).maxPain === 100, String(buildPins(flat, 101).maxPain));
}

// ── 4. the gamma pin is an unsigned centroid ──────────────────────────────
{
  const twoShelves = [node(100, 0, 0, -5e8), node(110, 0, 0, 5e8)];
  const p = buildPins(twoShelves, 105);
  check('equal opposite shelves centre the gamma pin between them', p.gammaPin === 105, String(p.gammaPin));
  /* Signed weights would have cancelled to zero mass and returned null or
     landed at an extreme — the unsigned centroid is the claim. */
  const lopsided = buildPins([node(100, 0, 0, -3e8), node(110, 0, 0, 1e8)], 105);
  check('and the heavier shelf pulls it, sign ignored', (lopsided.gammaPin ?? 0) < 105, lopsided.gammaPin?.toFixed(2));
}

// ── 5. the states that are not measurements ───────────────────────────────
{
  const empty = buildPins([], 100);
  check('an empty chain reports no pins and no gap', empty.maxPain === null && empty.gammaPin === null && empty.gap === null);
  const noOI = buildPins([node(100, 0, 0, 5e8)], 100);
  check('a book with no open interest has no max pain', noOI.maxPain === null);
  check('but still has a gamma pin if it carries gamma', noOI.gammaPin === 100);
  check('and no gap with only one of the two', noOI.gap === null);
  const noGamma = buildPins([node(100, 500, 500, 0)], 100);
  check('a book with no gamma has no gamma pin', noGamma.gammaPin === null && noGamma.maxPain === 100);
}

// ── 6. the live pair is inside the book ───────────────────────────────────
{
  const snap = Simulator.snapshotFor('SPY');
  const p = buildPins(snap.chain, snap.spot);
  const lo = Math.min(...snap.chain.map(n => n.strike));
  const hi = Math.max(...snap.chain.map(n => n.strike));
  check('both live pins land inside the chain', p.maxPain !== null && p.gammaPin !== null && p.maxPain >= lo && p.maxPain <= hi && p.gammaPin >= lo && p.gammaPin <= hi, `maxPain ${p.maxPain}, gammaPin ${p.gammaPin?.toFixed(2)} in [${lo}, ${hi}]`);
  check('and the gap is their difference', p.gap !== null && Math.abs(p.gap - (p.gammaPin! - p.maxPain!)) < 1e-9, p.gap?.toFixed(2));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
