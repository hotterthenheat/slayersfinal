/*
  Acceptance test for T-10's volume profile. Runs the ACTUAL engine against
  staged bars where every bin is computable by hand.

  Proves:
  1. Overlap-proportional binning: a bar's volume lands across the bins its
     range covers in proportion to overlap, and a flat bar leaves everything
     in its one bin
  2. VPOC ties resolve toward the session's LAST CLOSE
  3. The 70% value area annexes the heavier neighbour, ties UPWARD (pinned on
     a case where the tie decides the outcome), and VAH/VAL are the area's
     outer EDGES, not bin centres
  4. Degenerate sessions report nulls, never invented prices
  5. The wrapper profiles TODAY only — yesterday's volume is not in it
*/
import { buildVolumeProfile, sessionVolumeProfile, VALUE_AREA_FRACTION } from '../src/data/volumeProfile';
import type { Candle } from '../src/types/market';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};
const near = (a: number | null | undefined, b: number, eps = 1e-9) => a != null && Math.abs(a - b) < eps;

const T0 = 1_760_000_000;
const B = (i: number, high: number, low: number, close: number, volume: number): Candle => ({
  time: T0 + i * 60, open: close, high, low, close, volume,
});
/** A flat bar — the whole minute at one price. */
const F = (i: number, price: number, volume: number): Candle => B(i, price, price, price, volume);

// ── 1. binning ────────────────────────────────────────────────────────────
{
  /* binSize 1 from base 100: a [100,102] bar splits half-and-half across the
     two bins it covers; a flat bar at 101.5 drops whole into the second. */
  const p = buildVolumeProfile([B(0, 102, 100, 101, 300), F(1, 101.5, 80)], 1);
  check('PREMISE: three bins spanning the range', p.bins.length === 3, p.bins.map(b => b.price).join(','));
  check('a ranging bar splits by overlap', near(p.bins[0].volume, 150) && near(p.bins[2].volume, 0), p.bins.map(b => b.volume.toFixed(0)).join(','));
  check('a flat bar leaves everything in its one bin', near(p.bins[1].volume, 150 + 80));
  check('and the total is conserved', near(p.totalVolume, 380));
}

// ── 2. VPOC ties toward the last close ────────────────────────────────────
{
  const twin = (lastAt: number) => [F(0, 100.5, 100), F(1, 104.5, 100), B(2, lastAt, lastAt, lastAt, 0)];
  check('a flat-topped profile resolves its VPOC toward the market', near(buildVolumeProfile(twin(104.2), 1).vpoc, 104.5) && near(buildVolumeProfile(twin(100.2), 1).vpoc, 100.5));
}

// ── 3. the value area ─────────────────────────────────────────────────────
{
  /* vols 10·20·40·20·10 across bins 100..105: POC holds 40, annex up (tie
     rule idle here), then down — area is bins 101–104, so VAL 101, VAH 104,
     edges not centres. */
  const p = buildVolumeProfile([F(0, 100.5, 10), F(1, 101.5, 20), F(2, 102.5, 40), F(3, 103.5, 20), F(4, 104.5, 10)], 1);
  check(`the ${VALUE_AREA_FRACTION * 100}% area holds POC ± the heavier neighbours`, near(p.val, 101) && near(p.vah, 104), `val ${p.val} vah ${p.vah}`);
  check('VPOC is the heavy bin\'s centre', near(p.vpoc, 102.5));

  /* 30·40·30: the target is REACHED on the tie step itself, so the tie rule
     decides the answer — upward, the TPO convention. */
  const tie = buildVolumeProfile([F(0, 100.5, 30), F(1, 101.5, 40), F(2, 102.5, 30)], 1);
  check('a deciding tie annexes UPWARD', near(tie.val, 101) && near(tie.vah, 103), `val ${tie.val} vah ${tie.vah}`);
}

// ── 4. degenerate honesty ─────────────────────────────────────────────────
{
  check('no bars is the empty profile', buildVolumeProfile([], 1).vpoc === null);
  const dead = buildVolumeProfile([F(0, 100.5, 0), F(1, 101.5, 0)], 1);
  check('a volumeless session has bins but no VPOC and no area', dead.bins.length > 0 && dead.vpoc === null && dead.vah === null && dead.val === null);
  check('a broken bin size is refused', buildVolumeProfile([F(0, 100.5, 10)], 0).bins.length === 0);
}

// ── 5. the wrapper is today's ─────────────────────────────────────────────
{
  const yesterday = Array.from({ length: 5 }, (_, i) => ({ ...F(i, 200.5, 9999), time: T0 - 86400 + i * 60 }));
  const today = [F(0, 100.2, 50), F(1, 100.4, 70)];
  const p = sessionVolumeProfile([...yesterday, ...today]);
  check('yesterday\'s mountain of volume is not in today\'s profile', p.vpoc !== null && Math.abs(p.vpoc - 100.3) < 1 && p.totalVolume < 200, `vpoc ${p.vpoc?.toFixed(2)} total ${p.totalVolume.toFixed(0)}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
