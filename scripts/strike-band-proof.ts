/*
  Acceptance test for the strike band's geometry. Runs the ACTUAL module.

  Proves:
  1. Bars fill the width without overlapping, whatever the count
  2. A positive bar goes UP from the zero rule and a negative one goes DOWN,
     and neither ever crosses it
  3. A value past the scale is clamped to the edge rather than spilling over
  4. A real-but-tiny value is drawn, and a true zero is not
  5. Degenerate scales, sizes and values never throw and never invent a bar
  6. Labels are thinned only as far as they have to be
  7. The spot rule lands between strikes and is dropped when it is off-band

  Run: npx tsx scripts/strike-band-proof.ts
*/
import { ascendingSpotIndex, barGap, labelStride, layoutBand, spotX, type BandBar } from '../src/components/gex/strikeBand';

let pass = 0,
  fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

const W = 400;
const H = 100;
const MID = H / 2;
const rows = (vals: number[]) => vals.map((v, i) => ({ strike: 100 + i, v }));
const band = (vals: number[], maxAbs = 100, w = W, h = H, gap = 2): BandBar[] =>
  layoutBand(rows(vals), r => (r as { v: number }).v, maxAbs, w, h, gap);

// ---- 1. the bars tile the width ----------------------------------------------
{
  const b = band([50, -50, 25, -25, 0, 100, -100, 10]);
  check('one bar per row', b.length === 8, `${b.length}`);
  let overlap = false;
  let inside = true;
  for (let i = 0; i < b.length; i++) {
    if (b[i].x < -0.001 || b[i].x + b[i].w > W + 0.001) inside = false;
    if (i > 0 && b[i].x < b[i - 1].x + b[i - 1].w - 0.001) overlap = true;
  }
  check('no bar overlaps its neighbour', !overlap);
  check('and none escapes the width', inside, `last ends at ${(b[7].x + b[7].w).toFixed(2)} of ${W}`);
  /* Even slots: the gap between consecutive lefts is constant, so the band
     reads as a grid rather than as drift accumulating left to right. */
  const steps = b.slice(1).map((x, i) => x.x - b[i].x);
  check('the slots are evenly spaced', Math.max(...steps) - Math.min(...steps) < 1e-9, `${steps[0]}`);
  /* One row must still fill the band rather than sitting in a corner. */
  check('a single row still gets a real bar', band([50]).length === 1 && band([50])[0].w > 1);
}

// ---- 2. direction, and the zero rule -----------------------------------------
{
  const b = band([60, -60, 0]);
  check('a positive bar sits ABOVE the rule', b[0].positive && b[0].y + b[0].h <= MID + 1e-9, JSON.stringify(b[0]));
  check('a negative bar sits BELOW it', !b[1].positive && b[1].y >= MID - 1e-9, JSON.stringify(b[1]));
  check('and the two are the same height for the same magnitude', Math.abs(b[0].h - b[1].h) < 1e-9);
  /* Zero is neither side. A `>= 0` test would call it positive and draw a
     zero-height bar hanging off the top of the rule instead of on it. */
  check('a zero value is not positive', !b[2].positive && b[2].h === 0, JSON.stringify(b[2]));
  check('60% of the scale is 60% of the half', Math.abs(b[0].h - MID * 0.6) < 1e-9, `${b[0].h} vs ${MID * 0.6}`);
}

// ---- 3. clamping ---------------------------------------------------------------
{
  const b = band([500, -500], 100);
  check('a value past the scale stops at the edge', b[0].h === MID && b[1].h === MID, `${b[0].h}`);
  check('and does not cross the rule', b[0].y >= 0 && b[1].y + b[1].h <= H, JSON.stringify(b.map(x => [x.y, x.h])));
}

// ---- 4. the smallest real value is still visible --------------------------------
{
  const tiny = band([0.0001, -0.0001, 0], 1_000_000);
  /* Scaled honestly these are ~5e-9 px. Drawn at zero they would assert the
     book is EMPTY at those strikes, which is a stronger claim than "there is
     very little here". */
  check('a real but tiny value still gets ink', tiny[0].h >= 1 && tiny[1].h >= 1, `${tiny[0].h}`);
  check('and it is only one pixel of it', tiny[0].h === 1);
  check('a TRUE zero gets none', tiny[2].h === 0);
  /* The floor must not lift ordinary bars. */
  const normal = band([50], 100);
  check('the floor never inflates a bar that was already visible', normal[0].h === MID * 0.5, `${normal[0].h}`);
}

// ---- 5. degenerate inputs --------------------------------------------------------
{
  check('no rows yields no bars', band([]).length === 0);
  check('a zero width yields no bars', band([50], 100, 0).length === 0);
  check('a zero height yields no bars', band([50], 100, W, 0).length === 0);
  const flat = band([50, -50], 0);
  check('a zero scale lays every bar flat rather than dividing by it', flat.every(b => b.h === 0), JSON.stringify(flat.map(b => b.h)));
  check('a NaN scale does the same', band([50], Number.NaN).every(b => b.h === 0));
  const bad = band([Number.NaN, Number.POSITIVE_INFINITY, -0]);
  check('an unreadable value is drawn as nothing, not as a spike', bad.every(b => b.h === 0), JSON.stringify(bad.map(b => b.h)));
  check('and its slot is still held', bad.length === 3);
  /* A gap wider than the slot must not produce a negative width. */
  const squeezed = band([1, 2, 3], 100, 6, H, 50);
  check('an absurd gap never yields a negative width', squeezed.every(b => b.w >= 1), JSON.stringify(squeezed.map(b => b.w)));
}

// ---- 6. label thinning -----------------------------------------------------------
{
  check('labels that fit are all printed', labelStride(5, 400, 40) === 1, `${labelStride(5, 400, 40)}`);
  check('a crowded axis prints every other', labelStride(20, 400, 40) === 2, `${labelStride(20, 400, 40)}`);
  check('a very crowded one thins further', labelStride(80, 400, 40) === 8, `${labelStride(80, 400, 40)}`);
  check('the stride is never 0 — that would be an infinite loop', [0, 1, 1000].every(c => labelStride(c, 400, 40) >= 1));
  check('degenerate sizes fall back to every label', labelStride(10, 0, 40) === 1 && labelStride(10, 400, 0) === 1);
  /* The thinning must be as gentle as it can be: stride 2 where 2 suffices,
     never 3 "to be safe" — every skipped label is a strike the reader has to
     count to. */
  check('and it thins no further than it must', labelStride(21, 400, 40) === 3, `${labelStride(21, 400, 40)}`);
}

// ---- 7. the spot rule ------------------------------------------------------------
{
  const slot = W / 10;
  check('spot after row 4 lands on that row\'s trailing edge', spotX(4, 10, W) === 5 * slot, `${spotX(4, 10, W)}`);
  check('a half index lands between two slots', spotX(-0.5, 10, W) === 0.5 * slot, `${spotX(-0.5, 10, W)}`);
  check('spot after the last row lands at the right edge', spotX(9, 10, W) === W);
  check('an off-band index draws no rule at all', spotX(50, 10, W) === null && spotX(-20, 10, W) === null);
  check('a NaN index draws no rule', spotX(Number.NaN, 10, W) === null);
  check('no rows means no rule', spotX(0, 0, W) === null);
}

// ---- 8. mirroring the profile's descending spot index --------------------------------
{
  /*
    The profile sorts strikes HIGH to low; the band draws them LOW to high. The
    thing being mirrored is a BOUNDARY ("after row k"), not a row, and mirroring
    it as a row is off by one — a mistake that draws the spot rule one strike
    from the market and looks entirely plausible.

    Checked against the boundary itself: the strike immediately BELOW spot in
    the descending list must end up immediately LEFT of the rule.
  */
  const desc = [120, 115, 110, 105, 100];      // high to low
  const asc = [...desc].reverse();              // 100 .. 120
  /* The only values the profile ever produces: -0.5, or a row index. Sweeping
     past the end would be testing an input that cannot occur and would fail on
     the module's correct refusal to place it. */
  const cases: number[] = [-0.5, ...desc.map((_, i) => i)];
  let allMirror = true;
  const notes: string[] = [];
  for (const k of cases) {
    const x = spotX(ascendingSpotIndex(k, desc.length), desc.length, W);
    if (x === null) { allMirror = false; notes.push(`k=${k} produced no rule`); continue; }
    /* How many ascending slots sit LEFT of the rule must equal how many strikes
       are at or below spot — which descending is `n-1-k`. That is the boundary
       the profile meant, expressed without reusing the mirror's own formula. */
    const slotsLeft = x / (W / desc.length);
    const expected = desc.length - 1 - k;
    if (Math.abs(slotsLeft - expected) > 1e-9) {
      allMirror = false;
      notes.push(`k=${k}: ${slotsLeft} slots vs ${expected}`);
    }
  }
  check('every descending boundary mirrors to the same ascending one', allMirror, notes.join('; ') || `${cases.length} cases`);
  /* And that the sweep above was not vacuously green. */
  check('the sweep actually covered every case the profile can produce', cases.length === desc.length + 1, `${cases.length}`);
  /* asc(desc) is a genuine round trip, so the reversed rows really do line up
     with the mirrored index rather than merely both being plausible. */
  check('the fixture is the reverse of itself', asc[0] === desc[desc.length - 1] && asc[asc.length - 1] === desc[0]);
  /* The two ends, spelled out, because they are the ones a reader notices. */
  check(
    'spot above every strike puts the rule at the HIGH end',
    spotX(ascendingSpotIndex(-0.5, 5), 5, W) === W - 0.5 * (W / 5),
    `${spotX(ascendingSpotIndex(-0.5, 5), 5, W)} of ${W}`
  );
  check('spot below every strike puts it at the LOW end', spotX(ascendingSpotIndex(4, 5), 5, W) === 0);
  /* And the naive mirror — treating the boundary as a row — is excluded. */
  const naive = 5 - 1 - 2;
  check('the off-by-one mirror is not what ships', ascendingSpotIndex(2, 5) !== naive, `naive ${naive} vs ${ascendingSpotIndex(2, 5)}`);
}

// ---- 9. the air between bars scales with the band --------------------------------
{
  /*
    The bars must keep the SAME PROPORTIONS at every width. A fixed gap does
    not: two pixels between 21 bars is generous on a phone and invisible on a
    desk, and measured at 1600px the band fused into one continuous block.
  */
  const widths = [320, 760, 1600, 2560];
  const n = 21;
  const fractions = widths.map(w => {
    const b = layoutBand(rows(new Array(n).fill(50)), r => (r as { v: number }).v, 100, w, H, barGap(w, n));
    return b[0].w / (w / n);
  });
  const spread = Math.max(...fractions) - Math.min(...fractions);
  check('a bar keeps the same share of its slot at every width', spread < 1e-9, fractions.map(f => f.toFixed(3)).join(' '));
  check('and that share leaves real air', fractions[0] > 0.4 && fractions[0] < 0.85, `${fractions[0].toFixed(2)}`);
  /* The failure this replaced: a fixed 2px gap at desk width. */
  const fixed = layoutBand(rows(new Array(n).fill(50)), r => (r as { v: number }).v, 100, 1600, H, 2);
  check('the fixed gap it replaced really did fuse the bars', fixed[0].w / (1600 / n) > 0.95, `${(fixed[0].w / (1600 / n)).toFixed(3)} of the slot`);
  /* Degenerate ends: never zero, never negative, never wider than the slot. */
  check('a band narrower than its strike count still gets a gap', barGap(10, 40) >= 1, `${barGap(10, 40)}`);
  check('no rows means no division by zero', barGap(400, 0) === 1);
  check('a zero width falls back rather than returning 0', barGap(0, 21) === 1);
  check('an absurd fraction is clamped, not obeyed', barGap(400, 20, 5) >= 1 && barGap(400, 20, -3) < 400 / 20);
  check('a NaN fraction falls back to the default', barGap(400, 20, Number.NaN) === barGap(400, 20));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
