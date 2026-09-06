/*
  Acceptance test for the sign-confidence derivation (0.9).

  THE CLAIM THIS GUARDS is that confidence is derived from the map's own
  behaviour rather than decorated on. `signFit` reads the travel `buildStability`
  already measures — how far the flip and walls move under a vol bump — so a
  fragile map must score lower than a firm one, on real chains, without anyone
  choosing the number.

  If a tuning change makes every book score the same, the badge stops carrying
  information while still looking like it does. That is the failure here.
*/
import Simulator from '../src/core/simulator';
import { buildStability, signFit } from '../src/data/stability';
import { confidenceOf } from '../src/components/ui/Confidence';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

const NAMES = Simulator.universeQuotes('SPY').slice(0, 18);
const reads = NAMES.map(q => {
  const snap = Simulator.snapshotFor(q.ticker);
  const read = buildStability(snap.chain, snap.spot, q.iv);
  return { ticker: q.ticker, spot: snap.spot, read, fit: signFit(read, snap.spot) };
}).filter(r => r.read !== null);

check('PREMISE: enough books to compare', reads.length >= 10, `${reads.length}`);

// ── 1. it is a fraction, or it is nothing ───────────────────────────────
check(
  'every reading is inside 0..1 or absent',
  reads.every(r => r.fit === null || (r.fit >= 0 && r.fit <= 1)),
);

/* ── 2. THE ONE THIS FILE EXISTS FOR ──────────────────────────────────────
   A confidence badge derived from a constant is worse than no badge: it
   scores the same everywhere while claiming to have measured something. The
   first version of `signFit` did exactly that — 1.00 on all 22 names, because
   levels snap to strikes and a routine vol bump moves none of them. It must
   either VARY or report NOTHING; scoring every book identically is the
   failure. */
{
  const scored = reads.filter(r => r.fit !== null).map(r => r.fit as number);
  const uniq = new Set(scored.map(f => f.toFixed(2)));
  const flat = reads.length - scored.length;
  check(
    'the fit either varies or declines to report — never one score for every book',
    scored.length === 0 || uniq.size >= 2,
    `${scored.length} scored (${uniq.size} distinct), ${flat} reported no reading`,
  );
  check(
    'a map whose levels did not move reports no reading rather than a perfect one',
    reads.filter(r => r.read!.holds).every(r => r.fit === null),
    `${reads.filter(r => r.read!.holds).length} flat books`,
  );
}

// ── 3. more travel must mean less confidence ────────────────────────────
{
  const withTravel = reads
    .filter(r => !r.read!.wallsSwap && r.fit !== null)
    .map(r => ({
      travel: Math.max(r.read!.flipTravel ?? 0, r.read!.wallTravel ?? 0) / r.spot,
      fit: r.fit as number,
    }))
    .sort((a, b) => a.travel - b.travel);
  const firmer = withTravel[0];
  const looser = withTravel[withTravel.length - 1];
  check(
    'the steadiest map scores at least as high as the most mobile one',
    withTravel.length < 2 || firmer.fit >= looser.fit,
    withTravel.length < 2 ? 'no scored books in this sample' : `steadiest ${firmer.fit.toFixed(2)} vs most mobile ${looser.fit.toFixed(2)}`,
  );
  let monotone = true;
  for (let i = 1; i < withTravel.length; i++) {
    if (withTravel[i].fit > withTravel[i - 1].fit + 1e-9) monotone = false;
  }
  check('fit never rises as travel rises', monotone, `${withTravel.length} books ordered by travel`);
}

// ── 4. a wall that changes strike is capped low, whatever else it did ───
{
  const swapped = reads.filter(r => r.read!.wallsSwap && r.fit !== null);
  check(
    'a wall that jumps strike is never called a strong fit',
    swapped.every(r => confidenceOf(r.fit as number) !== 'high'),
    swapped.length ? `${swapped.length} such books` : 'none in this sample',
  );
}

// ── 5. the guards ───────────────────────────────────────────────────────
check('a missing read reports nothing rather than throwing', signFit(null, 100) === null);
check('a nonsense spot reports nothing', signFit(reads[0].read, 0) === null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
