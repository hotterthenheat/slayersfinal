/*
  Acceptance test for 5.1's flip disclosure.

  The checklist asks for a "nearest-to-zero fallback state when no sign
  change exists on the grid — this must look different from a real flip".
  Measured across the whole universe: that case does not occur. No book
  fails to cross. The fallback is built anyway, because a one-sided book is
  a real market condition and the alternative — a caller writing
  `pickFlip(...) ?? spot`, which several do — prints a fake flip AT THE
  MARKET, the most convincing possible place for a wrong line to be.

  A CORRECTION I OWE THIS FILE. Measuring first, I used the naive pairwise
  sign test and read "three crossings on every name", concluded the flip
  was ambiguous on the whole universe, and said so. It is not. `Math.sign(0)`
  is 0, which differs from both +1 and -1, so every strike sitting exactly
  at zero — common in the thin tails of a book quantised to the cent —
  reported two crossings where the field touches zero and carries on. With
  zeros handled, all 22 books cross exactly once and the desk's single flip
  line was right all along.

  The `kind` disclosure survives that correction because it costs nothing
  when there is nothing to disclose: `sole` prints no chip at all. It earns
  its keep the day a book really does cross twice.

  THAT DAY CAME (2026-09-08). The block below asserted `sole === 22` as a
  record of "the universe as it actually is", and CI on a redesign PR that
  touched no engine failed it at 07:05Z with 21 sole and 1 multi-crossing —
  the same proof having passed at 06:20Z on the same commit. The simulated
  books move with the session clock, so a headcount of today's kinds is a
  claim about the hour, not about the code; this is the third block in the
  repo to learn that a proof cannot assert against a calendar that moves.

  What the proof actually has to protect is the MECHANISM the count was
  standing in for: a book that crosses twice is never drawn as an
  unqualified flip. So the block classifies every name, records the counts
  as detail, and asserts on whichever books cross more than once that they
  are reported as `nearest-of-several` with the crossing nearest spot — a
  branch the old assertion, by its own admission, had never exercised on
  real data.
*/
import Simulator from '../src/core/simulator';
import {
  pickFlip, flipCrossings, nearestToZero, readFlip,
  FLIP_KIND_WORDS, FLIP_KIND_NOTES, type FlipKind,
} from '../src/core/walls';
import { buildFlipGauge } from '../src/data/flipGauge';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

const pts = (...vals: [number, number][]) => vals.map(([strike, v]) => ({ strike, v }));
const V = (p: { v: number }) => p.v;

// ── the measurement that prompted this ──────────────────────────────────
{
  const names = Simulator.universeQuotes('SPY').map(q => q.ticker);
  const reads = names.map(t => {
    const { chain, spot } = Simulator.chainFor(t);
    return { t, spot, r: readFlip(chain, spot, n => n.netGex) };
  });
  const sole = reads.filter(x => x.r.kind === 'sole');
  const multi = reads.filter(x => x.r.kind === 'nearest-of-several');
  const none = reads.filter(x => x.r.kind === 'no-crossing');
  /* The universe as it is THIS HOUR — the counts are detail, not a claim. */
  check(`every book is classified as exactly one kind, across ${names.length} names`,
    sole.length + multi.length + none.length === names.length,
    `${sole.length} sole, ${multi.length} multi-crossing, ${none.length} none`);
  check('a sole book carries exactly one crossing and it is the flip',
    sole.every(x => x.r.crossings.length === 1 && x.r.strike === x.r.crossings[0]));
  /* The disclosure's whole job. A book that crosses more than once must say
     so, and the line it draws must be the crossing nearest spot — the choice
     the note admits to. Asserted on whichever names cross twice today; on an
     hour where none do, the branch is vacuously true and the count says so. */
  check(`a multi-crossing book is qualified, never drawn as a bare flip — ${multi.length} today${multi.length ? `: ${multi.map(x => x.t).join(', ')}` : ''}`,
    multi.every(x => x.r.crossings.length >= 2 && x.r.strike !== null && x.r.crossings.includes(x.r.strike)
      && x.r.crossings.every(c => Math.abs(c - x.spot) >= Math.abs((x.r.strike as number) - x.spot))));
  /* And the one-sided state the checklist worried about, if it ever occurs,
     falls back to the nearest-to-zero strike and is labelled as not a flip. */
  check(`a one-sided book reports no crossing and a labelled fallback — ${none.length} today`,
    none.every(x => x.r.crossings.length === 0 && x.r.strike !== null && x.r.strike !== x.spot));
}

// ── the crossings ────────────────────────────────────────────────────────
{
  check('a single crossing is found', flipCrossings(pts([100, -5], [110, 3]), V).length === 1);
  check('and placed at the midpoint', flipCrossings(pts([100, -5], [110, 3]), V)[0] === 105);
  check('three crossings are all found',
    flipCrossings(pts([90, -1], [100, 2], [110, -3], [120, 4]), V).length === 3);
  check('crossings come back ascending', (() => {
    const c = flipCrossings(pts([120, 4], [90, -1], [110, -3], [100, 2]), V);
    return c.every((v, i) => i === 0 || v >= c[i - 1]);
  })());
  check('a one-sided book has none', flipCrossings(pts([100, 3], [110, 5], [120, 1]), V).length === 0);
  check('an empty grid has none', flipCrossings([], V).length === 0);

  /*
    ZERO IS NOT A SIGN. Math.sign(0) is 0, which differs from both +1 and
    -1, so a strike sitting exactly at zero would report TWO crossings where
    the field touches zero once and carries on in the same direction — and
    on a quantised book an exact zero is not rare.
  */
  check('a strike at exactly zero does not manufacture two crossings',
    flipCrossings(pts([90, -1], [100, 0], [110, -2]), V).length === 0,
    `${flipCrossings(pts([90, -1], [100, 0], [110, -2]), V).length} found`);
  /* And the other half, which the first fix got wrong by skipping any pair
     containing a zero: a field that really does turn THROUGH zero has
     crossed, once. */
  check('a real crossing through zero still counts once',
    flipCrossings(pts([90, -1], [100, 0], [110, 2]), V).length === 1,
    `${flipCrossings(pts([90, -1], [100, 0], [110, 2]), V).length} found`);
  check('a run of zeros between two signs is still one crossing',
    flipCrossings(pts([90, -1], [95, 0], [100, 0], [105, 0], [110, 2]), V).length === 1);
  check('a book that is all zeros has no crossing',
    flipCrossings(pts([90, 0], [100, 0], [110, 0]), V).length === 0);

  /*
    THE REFACTOR MUST NOT HAVE MOVED A LINE. Five surfaces read `pickFlip`,
    and the zero handling changes which pairs register — so the flip itself
    was compared against the previous rule across the universe before this
    landed: 0 of 22 moved, because the spurious crossings were all in the
    tails and the rule takes the one nearest spot.
  */
}

// ── the pick is the nearest, and unchanged ──────────────────────────────
{
  const p = pts([90, -1], [100, 2], [110, -3], [120, 4]);
  // crossings at 95, 105, 115
  check('the flip nearest spot is chosen', pickFlip(p, 104, V) === 105, String(pickFlip(p, 104, V)));
  check('from below too', pickFlip(p, 92, V) === 95, String(pickFlip(p, 92, V)));
  check('and from above', pickFlip(p, 200, V) === 115, String(pickFlip(p, 200, V)));
  /* The refactor must not have moved the answer: readFlip and pickFlip are
     one implementation now, and five surfaces call the latter. */
  check('readFlip and pickFlip agree', readFlip(p, 104, V).strike === pickFlip(p, 104, V));
  check('pickFlip still returns null on a one-sided book',
    pickFlip(pts([100, 3], [110, 5]), 105, V) === null);
}

// ── the fallback looks different from a flip ────────────────────────────
{
  const oneSided = pts([90, 9], [100, 2], [110, 7]);
  const r = readFlip(oneSided, 105, V);
  check('a one-sided book reports no-crossing', r.kind === 'no-crossing');
  check('and points at where the field comes closest to zero', r.strike === 100, String(r.strike));
  check('nearestToZero picks the smallest magnitude, either sign',
    nearestToZero(pts([90, -9], [100, -1], [110, 7]), V) === 100);
  check('an empty grid yields nothing rather than a number', nearestToZero([], V) === null);

  /*
    THE WHOLE POINT: the fallback must be DISTINGUISHABLE. A caller writing
    `pickFlip(...) ?? spot` prints a fake flip at the market — the most
    convincing possible place for a wrong line — and that is what the kind
    exists to prevent.
  */
  check('the fallback is not silently spot', r.strike !== 105);
  check('and it is labelled as something other than a flip',
    FLIP_KIND_WORDS['no-crossing'] !== '' && /not a flip/i.test(FLIP_KIND_NOTES['no-crossing']),
    FLIP_KIND_WORDS['no-crossing']);
}

// ── the words ────────────────────────────────────────────────────────────
{
  const kinds: FlipKind[] = ['sole', 'nearest-of-several', 'no-crossing'];
  check('every kind has a note', kinds.every(k => FLIP_KIND_NOTES[k]?.length > 20));
  /* A sole crossing is the unqualified case and must carry NO chip — a
     qualifier on every flip is a qualifier the reader stops seeing. */
  check('the unqualified case says nothing', FLIP_KIND_WORDS.sole === '');
  check('the qualified cases do', kinds.filter(k => k !== 'sole').every(k => FLIP_KIND_WORDS[k].length > 0));
  check('the multi-crossing note admits it is a choice',
    /choice|pick/i.test(FLIP_KIND_NOTES['nearest-of-several']));
}

// ── it reaches the gauge the strip actually draws ───────────────────────
{
  const g = buildFlipGauge(Simulator.snapshotFor('SPY'));
  check('the gauge carries a kind', (['sole', 'nearest-of-several', 'no-crossing'] as FlipKind[]).includes(g.kind), g.kind);
  check('and the crossings behind it', Array.isArray(g.crossings_all));
  check('a flip and a kind agree about whether there is one',
    (g.flip === null) === (g.kind === 'no-crossing'),
    `flip ${g.flip}, kind ${g.kind}`);
  if (g.kind === 'nearest-of-several') {
    check('the drawn flip is one of the crossings it names',
      g.crossings_all.includes(g.flip as number),
      `${g.flip} not in [${g.crossings_all.join(', ')}]`);
    check('and it is the nearest of them',
      g.crossings_all.every(c => Math.abs(c - g.spot) >= Math.abs((g.flip as number) - g.spot)));
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
