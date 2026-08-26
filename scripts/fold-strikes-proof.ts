/*
  Acceptance test for the heat surface's strike folding. Runs the ACTUAL module.

  Proves:
  1. A quiet run folds into ONE marker carrying its true count
  2. Nothing near the money is folded, however quiet
  3. Loud rows always survive
  4. A run shorter than minRun is put back rather than folded
  5. No row is ever silently lost — kept + hidden always equals the input
  6. Degenerate scales and non-finite values never fold the whole surface away

  Run: npx tsx scripts/fold-strikes-proof.ts
*/
import { foldQuietStrikes, hiddenCount, type FoldedRow } from '../src/components/gex/foldStrikes';

let pass = 0,
  fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

const loud = (v: number) => v;
const kept = <T,>(f: FoldedRow<T>[]) => f.filter(x => x.kind === 'row').length;

/* No spot pinning unless a test asks for it — spotIndex -1 — so the folding
   rule is tested on its own before the keep-near rule is layered on. */
const NO_SPOT = -1;

// ---- 1. a quiet run folds, and says how many ---------------------------------
{
  const rows = [100, 0, 0, 0, 0, 100];
  const f = foldQuietStrikes(rows, loud, 100, NO_SPOT);
  check('a quiet run becomes one marker', f.length === 3, `${f.length} entries`);
  const hidden = f.find(x => x.kind === 'hidden');
  check('and the marker carries the run length', hidden?.kind === 'hidden' && hidden.count === 4, JSON.stringify(hidden));
  check('the loud rows on either side survive', kept(f) === 2);
}

// ---- 2. the money is never folded --------------------------------------------
{
  /* Twenty-one silent rows, spot dead centre. Without the pin this is one fold
     of 21; with it, the band around spot has to survive being empty. */
  const rows = new Array(21).fill(0);
  const f = foldQuietStrikes(rows, loud, 100, 10, { keepNear: 3 });
  check('a silent band AROUND SPOT is still drawn', kept(f) === 7, `${kept(f)} rows kept`);
  check('and the far quiet runs still fold', f.filter(x => x.kind === 'hidden').length === 2);
  check('nothing is lost in the process', kept(f) + hiddenCount(f) === rows.length);
  /* The pin is what makes this different from rule 1 — without it the whole
     thing collapses, which is the behaviour this asserts against. */
  const unpinned = foldQuietStrikes(rows, loud, 100, NO_SPOT);
  check('and without the pin it WOULD have collapsed', kept(unpinned) === 0, `${kept(unpinned)} kept`);
}

// ---- 3. loud rows always survive ---------------------------------------------
{
  const rows = [0, 0, 50, 0, 0, -80, 0, 0];
  const f = foldQuietStrikes(rows, loud, 100, NO_SPOT, { threshold: 0.02 });
  check('a loud row is never folded', kept(f) === 2, `${kept(f)} kept`);
  const rowsKept = f.filter(x => x.kind === 'row').map(x => (x.kind === 'row' ? x.row : 0));
  check('and it is the RIGHT rows', rowsKept.join(',') === '50,-80', rowsKept.join(','));
  check('a negative is judged on magnitude, not sign', rowsKept.includes(-80));
}

// ---- 4. a short run is not worth folding -------------------------------------
{
  const rows = [100, 0, 100];
  const f = foldQuietStrikes(rows, loud, 100, NO_SPOT, { minRun: 2 });
  check('a single quiet row is left alone', kept(f) === 3 && hiddenCount(f) === 0, JSON.stringify(f.map(x => x.kind)));
  const f2 = foldQuietStrikes(rows, loud, 100, NO_SPOT, { minRun: 1 });
  check('unless the caller lowers the bar', hiddenCount(f2) === 1);
}

// ---- 5. nothing is ever silently lost -----------------------------------------
{
  /* The property that matters most: a surface that drops rows without saying so
     is lying about the chain. Checked across a spread of shapes. */
  const shapes: number[][] = [
    [],
    [0],
    [100],
    [0, 0, 0, 0, 0],
    [100, 0, 0, 100, 0, 0, 0, 100],
    [0, 0, 100, 100, 0, 0],
  ];
  let allHold = true;
  for (const rows of shapes) {
    for (const spot of [NO_SPOT, 0, Math.floor(rows.length / 2)]) {
      const f = foldQuietStrikes(rows, loud, 100, spot, { keepNear: 1 });
      if (kept(f) + hiddenCount(f) !== rows.length) allHold = false;
    }
  }
  check('kept + hidden === input, across every shape and spot', allHold);
}

// ---- 6. degenerate inputs ------------------------------------------------------
{
  const rows = [0, 0, 0, 0];
  check(
    'a zero scale folds nothing — an empty surface is not "all hidden"',
    kept(foldQuietStrikes(rows, loud, 0, NO_SPOT)) === rows.length
  );
  check(
    'a NaN scale folds nothing either',
    kept(foldQuietStrikes(rows, loud, Number.NaN, NO_SPOT)) === rows.length
  );
  const withNaN = [100, Number.NaN, Number.NaN, 100];
  check(
    'a row whose value cannot be read is KEPT, never folded away',
    kept(foldQuietStrikes(withNaN, loud, 100, NO_SPOT)) === 4,
    `${kept(foldQuietStrikes(withNaN, loud, 100, NO_SPOT))} kept`
  );
  check('an empty list yields nothing', foldQuietStrikes([], loud, 100, NO_SPOT).length === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
