/*
  Acceptance test for the campaign level nodes' one piece of arithmetic.

  Proves:
  1. Capsules that already clear each other are NOT moved — a level sits on
     its own price whenever it can
  2. Capsules that would overlap are pushed apart to exactly the gap, never
     more, so the name stays as near its price as it can be
  3. The result is returned in the CALLER'S order, not sorted order — the
     renderer zips it against its own list and a reordered return would put
     every label on the wrong level
  4. The push is stable: the same set in a different input order gives the
     same answer, so a level does not jump when the caller reorders
  5. Degenerate input is handled — one level, none, identical prices
*/
import { stackCapsules, CAMPAIGN_LAYER } from '../src/components/compass/campaignLevelsPrimitive';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};
const GAP = CAMPAIGN_LAYER.CAPSULE_H + 3;

// ── 1. room to breathe: nothing moves ─────────────────────────────────────
{
  const ys = [10, 100, 200];
  const out = stackCapsules(ys, GAP);
  check('levels that already clear each other are left alone', JSON.stringify(out) === JSON.stringify(ys), out.join(','));
}

// ── 2. the push, and its size ─────────────────────────────────────────────
{
  /* Three levels within a few px — they must end up exactly GAP apart,
     starting from the topmost, which does not move. */
  const out = stackCapsules([100, 102, 104], GAP);
  check('the topmost keeps its price', out[0] === 100, out.join(','));
  check('the others are pushed to exactly the gap', out[1] === 100 + GAP && out[2] === 100 + 2 * GAP, out.join(','));
  check('— never further than needed', out[2] - out[0] === 2 * GAP);
  /* A pair that clears by MORE than the gap keeps its own spacing. */
  const wide = stackCapsules([100, 100 + GAP * 3], GAP);
  check('a comfortable pair keeps its real spacing', wide[1] - wide[0] === GAP * 3, wide.join(','));
}

// ── 3. caller order is preserved ──────────────────────────────────────────
{
  /* Listed bottom-to-top: the RETURN must line up with the input, or every
     capsule gets another level's name. */
  const out = stackCapsules([300, 100, 200], GAP);
  check('the answer comes back in the caller\'s order', out[1] < out[2] && out[2] < out[0], out.join(','));
  check('— and the lowest y is still the one that was 100', out[1] === 100, String(out[1]));
}

// ── 4. stable under reordering ────────────────────────────────────────────
{
  const a = stackCapsules([100, 102, 104], GAP);
  const b = stackCapsules([104, 102, 100], GAP);
  /* Same three levels, listed backwards: each level must land on the same y
     as before, which means b reversed equals a. */
  check('the same levels in a different order give the same layout', JSON.stringify([...b].reverse()) === JSON.stringify(a), `${a.join(',')} vs ${b.join(',')}`);
}

// ── 5. degenerate ─────────────────────────────────────────────────────────
{
  check('one level is returned untouched', JSON.stringify(stackCapsules([42], GAP)) === '[42]');
  check('no levels is an empty answer, not a crash', stackCapsules([], GAP).length === 0);
  const same = stackCapsules([100, 100, 100], GAP);
  check('identical prices fan out rather than stacking invisibly', same[0] === 100 && same[1] === 100 + GAP && same[2] === 100 + 2 * GAP, same.join(','));
}

// ── the layer's inks ──────────────────────────────────────────────────────
{
  check('a target is green, a floor is red', CAMPAIGN_LAYER.INK.target.startsWith('48,') && CAMPAIGN_LAYER.INK.floor.startsWith('255,59'));
  check('the strike is chrome steel, not a heat pole', CAMPAIGN_LAYER.INK.strike === '226,234,244');
  check('the lead-in starts partway across the plot, not at its edge', CAMPAIGN_LAYER.LEAD_FROM > 0.1 && CAMPAIGN_LAYER.LEAD_FROM < 0.6, String(CAMPAIGN_LAYER.LEAD_FROM));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
