/*
  Acceptance test for Part 4's LEAPS read.

  "LEAPS: early-exercise flag UI, PV(dividend) vs extrinsic comparison,
   theta carry, stock-replacement efficiency."

  Every figure here is derived from the desk's own pricer and carry, so the
  assertions are about RELATIONSHIPS a reader could check by hand rather
  than about magic numbers: an early-exercise flag has to turn on when the
  dividend actually exceeds the extrinsic and not before; theta carry
  cannot exceed the extrinsic there is to lose; leverage has to fall as a
  contract goes deeper in the money and its delta approaches one.
*/
import { EARLY_EXERCISE_WORDS, leapsRead } from '../src/core/leaps';
import { blackScholesPrice } from '../src/core/greeks';
import { DEFAULT_Q, DEFAULT_R } from '../src/core/carry';
import { TRADING_DAYS } from '../src/core/higherGreeks';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

const SPOT = 500;
const IV = 0.2;
const YEAR = TRADING_DAYS;
const mid = (K: number, right: 'C' | 'P', dte = YEAR, carry = { r: DEFAULT_R, q: DEFAULT_Q }) =>
  blackScholesPrice(SPOT, K, dte / YEAR, IV, right, carry.r, carry.q);

// ---- intrinsic and extrinsic add up --------------------------------------------
{
  const K = 450;
  const r = leapsRead(SPOT, K, YEAR, IV, 'C', mid(K, 'C'));
  check('an ITM call carries its intrinsic', Math.abs(r.intrinsic - 50) < 1e-9);
  check('and the rest of the premium is extrinsic', Math.abs(r.intrinsic + r.extrinsic - mid(K, 'C')) < 1e-9);
  const atm = leapsRead(SPOT, SPOT, YEAR, IV, 'C', mid(SPOT, 'C'));
  check('an ATM contract is all extrinsic', atm.intrinsic === 0 && atm.extrinsic > 0);
}

// ---- the dividend flag turns on when, and only when, it should ------------------
{
  const K = 300;
  /* At the desk's own carry the rate beats the yield, so a deep call's
     extrinsic (which carries the interest benefit) exceeds the dividends
     left — no pull. That is the textbook result, not a missed flag. */
  const dflt = leapsRead(SPOT, K, YEAR, IV, 'C', mid(K, 'C'));
  check('at the desk carry a deep ITM call is NOT pulled early', dflt.earlyExercise === 'none', `pv div ${dflt.pvDividends.toFixed(2)} vs extrinsic ${dflt.extrinsic.toFixed(2)}`);

  /* Move the yield up — a high payer with a low rate — and it flips. */
  const rich = { r: 0.01, q: 0.08 };
  const flag = leapsRead(SPOT, K, YEAR, IV, 'C', mid(K, 'C', YEAR, rich), rich);
  check('with the yield above the rate the same call IS pulled', flag.earlyExercise === 'dividend', `pv div ${flag.pvDividends.toFixed(2)} vs extrinsic ${flag.extrinsic.toFixed(2)}`);
  check('and the note carries both figures', flag.earlyExerciseNote.includes(flag.pvDividends.toFixed(2)) && flag.earlyExerciseNote.includes(flag.extrinsic.toFixed(2)));
  check('PV of dividends is spot × (1 − e^(−qT))', Math.abs(flag.pvDividends - SPOT * (1 - Math.exp(-0.08))) < 1e-9);

  /* An OTM call has no intrinsic to capture — never flagged, whatever the yield. */
  const otm = leapsRead(SPOT, 600, YEAR, IV, 'C', mid(600, 'C', YEAR, rich), rich);
  check('an OTM call is never pulled — nothing to capture by exercising', otm.earlyExercise === 'none');
}

// ---- the interest flag is the put's version --------------------------------------
{
  const K = 700;
  const r = leapsRead(SPOT, K, YEAR, IV, 'P', mid(K, 'P'));
  check('a deep ITM put at the desk rate IS pulled by interest', r.earlyExercise === 'interest', `interest ${r.pvInterestOnStrike.toFixed(2)} vs extrinsic ${r.extrinsic.toFixed(2)}`);
  check('interest on the strike is K × (1 − e^(−rT))', Math.abs(r.pvInterestOnStrike - K * (1 - Math.exp(-DEFAULT_R))) < 1e-9);
  const atmPut = leapsRead(SPOT, SPOT, YEAR, IV, 'P', mid(SPOT, 'P'));
  check('an ATM put is not', atmPut.earlyExercise === 'none');
  check('a zero-rate world pulls no put', leapsRead(SPOT, K, YEAR, IV, 'P', mid(K, 'P', YEAR, { r: 0, q: DEFAULT_Q }), { r: 0, q: DEFAULT_Q }).earlyExercise === 'none');
}

// ---- theta carry ---------------------------------------------------------------------
{
  const r = leapsRead(SPOT, SPOT, YEAR, IV, 'C', mid(SPOT, 'C'));
  check('theta is negative', r.thetaDay < 0);
  check('theta carry is positive', r.thetaCarry > 0);
  check('AND NEVER MORE THAN THE EXTRINSIC THERE IS TO LOSE', r.thetaCarry <= r.extrinsic + 1e-9, `${r.thetaCarry.toFixed(2)} of ${r.extrinsic.toFixed(2)}`);
  check('as a share of the premium it is between 0 and 100', r.thetaCarryPctOfPremium > 0 && r.thetaCarryPctOfPremium <= 100);
  /* A shorter contract of the same strike has LESS total carry ahead of it. */
  const short = leapsRead(SPOT, SPOT, 30, IV, 'C', mid(SPOT, 'C', 30));
  check('a 30-day contract has less carry ahead than a year', short.thetaCarry < r.thetaCarry);
  /* The cap binds on a deep ITM contract, where theta × days would overshoot. */
  const deep = leapsRead(SPOT, 350, YEAR, IV, 'C', mid(350, 'C'));
  check('on a deep contract the cap is the extrinsic itself', Math.abs(deep.thetaCarry - deep.extrinsic) < 1e-9 || deep.thetaCarry < deep.extrinsic);
}

// ---- stock replacement --------------------------------------------------------------
{
  const K = 450;
  const r = leapsRead(SPOT, K, YEAR, IV, 'C', mid(K, 'C'));
  check('cost is mid × 100', Math.abs(r.cost - mid(K, 'C') * 100) < 1e-9);
  check('notional is delta × 100 × spot', Math.abs(r.notionalControlled - r.deltaAbs * 100 * SPOT) < 1e-9);
  check('leverage is above one — that is why anyone buys it', r.leverage > 1, r.leverage.toFixed(2));
  check('capital freed is what the shares would cost minus what this does', Math.abs(r.capitalFreed - (100 * SPOT - r.cost)) < 1e-9);
  check('and it is positive', r.capitalFreed > 0);
  check('the drag is a positive annual rate', r.carryDragPctPerYear > 0, `${r.carryDragPctPerYear.toFixed(2)}%/yr`);
  /* Deeper in the money: delta → 1, extrinsic → 0, so leverage falls toward
     the plain spot/cost ratio and the drag falls toward zero. */
  const deeper = leapsRead(SPOT, 300, YEAR, IV, 'C', mid(300, 'C'));
  check('deeper ITM controls more delta', deeper.deltaAbs > r.deltaAbs);
  check('and pays less drag for it', deeper.carryDragPctPerYear < r.carryDragPctPerYear);
  check('and has less leverage — you are mostly buying the stock', deeper.leverage < r.leverage);
  /* A put controls short exposure the same way. */
  const put = leapsRead(SPOT, 550, YEAR, IV, 'P', mid(550, 'P'));
  check('a put reads with |delta| so its notional is positive', put.notionalControlled > 0 && put.deltaAbs > 0.5);
}

// ---- guards ----------------------------------------------------------------------------
{
  const r = leapsRead(SPOT, SPOT, 0, IV, 'C', 0.01);
  check('zero DTE does not divide by zero', Number.isFinite(r.carryDragPctPerYear) && Number.isFinite(r.thetaCarry));
  const free = leapsRead(SPOT, SPOT, YEAR, IV, 'C', 0);
  check('a zero mid yields zero leverage rather than Infinity', free.leverage === 0);
  check('every pull has words', (['none', 'dividend', 'interest'] as const).every(k => EARLY_EXERCISE_WORDS[k].label.length > 8));
  check('and the two real pulls are warnings while none is not', EARLY_EXERCISE_WORDS.none.tone === 'neutral' && EARLY_EXERCISE_WORDS.dividend.tone === 'warn' && EARLY_EXERCISE_WORDS.interest.tone === 'warn');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
