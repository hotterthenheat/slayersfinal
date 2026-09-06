/*
  Acceptance test for 5.8 — two normalisations, because they answer
  different questions.

  The checklist is right that this is a TOGGLE and not a preference:

    SHAPE divides each book by its own total |GEX| and throws size away on
      purpose, which is the only thing that makes SPX and a mid-cap
      comparable at all — a shelf 2% overhead is a shelf 2% overhead.

    IMPACT divides by the name's dollar turnover and keeps size, asking
      whose dealers have more to do relative to what the name can absorb. A
      $50M shelf is a wall in a name that turns over $200M a day and a
      rounding error in SPY.

  Neither can see what the other sees, so a single normalisation would have
  to pretend one of the questions is the question.
*/
import Simulator from '../src/core/simulator';
import {
  buildExposureCompare, dollarTurnover, COMPARE_MODE_WORDS, type CompareMode,
} from '../src/data/exposureCompare';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

const A = Simulator.snapshotFor('SPY');
const B = Simulator.snapshotFor('QQQ');

// ── both modes build ────────────────────────────────────────────────────
{
  const shape = buildExposureCompare(A, B, 'shape');
  const impact = buildExposureCompare(A, B, 'impact');
  check('shape builds', shape !== null);
  check('impact builds', impact !== null);
  if (!shape || !impact) { console.log('\n0 passed'); process.exit(1); }

  check('both report the mode they applied', shape.mode === 'shape' && impact.mode === 'impact',
    `${shape.mode} / ${impact.mode}`);
  check('the default is shape', buildExposureCompare(A, B)?.mode === 'shape');
  check('both cover the same buckets', shape.buckets.length === impact.buckets.length);

  /*
    THEY MUST ACTUALLY DIFFER. If impact produced the same series as shape
    the toggle would be decoration, and a reader would draw a conclusion
    from a control that does nothing.
  */
  const same = shape.buckets.every((b, i) => b.a === impact.buckets[i].a);
  check('impact is not shape wearing a different label', !same);

  /*
    SHAPE SUMS TO ONE. That is what "share of its own total" means, and the
    property that makes two books comparable at all — if it drifted, the
    divergence column would be reading a scale difference as structure.
  */
  const sumA = shape.buckets.reduce((s, b) => s + Math.abs(b.a), 0);
  const sumB = shape.buckets.reduce((s, b) => s + Math.abs(b.b), 0);
  check('under shape each book is a share of its own total',
    sumA > 0.5 && sumA <= 1.0001 && sumB > 0.5 && sumB <= 1.0001,
    `${sumA.toFixed(3)} / ${sumB.toFixed(3)}`);

  /*
    UNDER IMPACT THEY DO NOT, and must not — that is the whole point. Two
    names with the same shape and different turnover have to come out
    DIFFERENT sizes, or the mode is not measuring impact.
  */
  const iA = impact.buckets.reduce((s, b) => s + Math.abs(b.a), 0);
  const iB = impact.buckets.reduce((s, b) => s + Math.abs(b.b), 0);
  check('under impact the two books keep their different sizes',
    Math.abs(iA - iB) > 1e-12, `${iA.toExponential(2)} vs ${iB.toExponential(2)}`);
}

// ── turnover ─────────────────────────────────────────────────────────────
{
  const t = dollarTurnover(A);
  check('a seeded name has a dollar turnover', t !== null && t > 0, t ? t.toExponential(2) : 'null');
  check('and it is dollars, not shares — spot times volume',
    (t as number) > 1e6, (t as number).toExponential(2));

  /*
    A MISSING TURNOVER FALLS BACK, LOUDLY. Normalising one book by dollars
    and the other by gamma would put the two series on different rulers and
    draw the mismatch as divergence — a chart confidently wrong rather than
    blank. So the fallback is whole-comparison, and `modeRequested` keeps
    the record so the surface can say what happened.
  */
  const thin = { ...A, ticker: 'ZZZZ-NOT-SEEDED' };
  const c = buildExposureCompare(thin as typeof A, B, 'impact');
  check('a name with no history falls the WHOLE comparison back to shape',
    c?.mode === 'shape', String(c?.mode));
  check('and the request is remembered so the surface can say so',
    c?.modeRequested === 'impact', String(c?.modeRequested));
  check('a fallback comparison is still a usable one', (c?.buckets.length ?? 0) > 0);
}

// ── the words ────────────────────────────────────────────────────────────
{
  const modes: CompareMode[] = ['shape', 'impact'];
  check('both modes are worded', modes.every(m => COMPARE_MODE_WORDS[m].label && COMPARE_MODE_WORDS[m].note));
  check('the notes say what each one ANSWERS, not what it divides by',
    /positioned the same way/i.test(COMPARE_MODE_WORDS.shape.note) &&
    /absorb/i.test(COMPARE_MODE_WORDS.impact.note));
  check('and shape admits it discards size on purpose',
    /discard|throw/i.test(COMPARE_MODE_WORDS.shape.note));
}

// ── refusals ─────────────────────────────────────────────────────────────
{
  const empty = { ...A, chain: [] };
  check('an empty book compares to nothing', buildExposureCompare(empty as typeof A, B, 'shape') === null);
  const noSpot = { ...A, spot: 0 };
  check('a zero spot compares to nothing', buildExposureCompare(noSpot as typeof A, B, 'impact') === null);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
