/*
  Acceptance test for Part 4's odds.

  "EV, POP, and tail-aware utility shown as distinct numbers with distinct
   meanings — the fixture proof shows utility can reject a +EV trade."
  "SAMEDAY: total-loss probability as the PRIMARY readout, EV secondary,
   position cap shown."

  The primitives are held against the textbook N(−d2); the four numbers are
  held against each other (POP can never exceed the chance of finishing in
  the money; utility can never exceed EV); the fixture's claim is
  reproduced on a real contract rather than on the spec's toy rows.
*/
import {
  BOOK_UNIT,
  MAX_TILT_SIGMA,
  SAMEDAY_RISK_FRACTION,
  impliedSigma,
  oddsSentence,
  outcomeRead,
  samedayCap,
  tiltFor,
  totalLossClosedForm,
} from '../src/core/outcomes';
import { CONTRACT_MULTIPLIER } from '../src/core/contractScore';

let pass = 0,
  fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

const SPOT = 500;
const IV = 0.22;

// ---- the integrator agrees with the closed form ---------------------------
{
  for (const [K, dte, right] of [
    [505, 5, 'C'],
    [480, 30, 'P'],
    [500, 1, 'C'],
    [520, 365, 'C'],
  ] as const) {
    /* At the fair mid the solved σ is IV itself, and the total-loss figure
       is the textbook N(−d2) at that IV. */
    const fair = outcomeRead(SPOT, K, dte, IV, right, 0, 0, 0).ev / CONTRACT_MULTIPLIER;
    const o = outcomeRead(SPOT, K, dte, IV, right, fair, 2, 0);
    const cf = totalLossClosedForm(SPOT, K, dte, IV, right);
    check(`P(total loss) ${K}${right} ${dte}d matches the textbook N(−d2)`, Math.abs(o.pTotalLoss - cf) < 1e-6, `${o.pTotalLoss.toFixed(4)} vs ${cf.toFixed(4)} (σ ${(o.ivUsed * 100).toFixed(3)}%)`);
  }
  /* The decomposition must close: EV is the paying outcomes minus the
     losing ones, each weighted by how often it happens. */
  for (const [K, right, mid] of [
    [505, 'C', 3.2],
    [495, 'P', 3.1],
    [460, 'C', 42],
  ] as const) {
    const o = outcomeRead(SPOT, K, 5, IV, right, mid, 2, 0.2);
    const rebuilt = o.avgWin * o.pop - o.es * (1 - o.pop);
    check(`EV = E[win]·POP − ES·(1 − POP) for ${K}${right}`, Math.abs(rebuilt - o.ev) < 1e-6, `$${rebuilt.toFixed(4)} vs $${o.ev.toFixed(4)}`);
  }
}

// ---- the four numbers hold against each other ------------------------------
{
  const o = outcomeRead(SPOT, 505, 5, IV, 'C', 3.2, 2, 0);
  check('POP never exceeds the chance of finishing in the money', o.pop <= 1 - o.pTotalLoss + 1e-9, `${o.pop.toFixed(3)} ≤ ${(1 - o.pTotalLoss).toFixed(3)}`);
  check('utility never exceeds EV', o.utility <= o.ev);
  check('ES is a positive dollar figure per contract', o.es > 0 && o.es <= o.allIn * CONTRACT_MULTIPLIER + 1e-6, `$${o.es.toFixed(0)} of $${(o.allIn * 100).toFixed(0)} at risk`);
  check('the average win is positive', o.avgWin > 0);
  check('all-in is the mid plus half the round-trip spread', Math.abs(o.allIn - (3.2 + (3.2 * 2) / 200)) < 1e-12);
}

// ---- at the market's own odds a long option pays the friction and no more -----
{
  /* Price the contract from the same lognormal it is read against: the
     fair mid is the discounted expected payoff, which is what a read with
     nothing paid returns. Then EV at market is EXACTLY −exit cost, in
     today's dollars — on a five-day contract and on a year-out one. */
  for (const dte of [5, 365]) {
    const K = 505;
    const fair = outcomeRead(SPOT, K, dte, IV, 'C', 0, 0, 0).ev / CONTRACT_MULTIPLIER;
    const o = outcomeRead(SPOT, K, dte, IV, 'C', fair, 2, 0);
    check(`a fairly priced ${dte}d contract has EV at market = −exit friction`, Math.abs(o.evAtMarket + o.exitCost * CONTRACT_MULTIPLIER) < 1e-6, `$${o.evAtMarket.toFixed(4)} vs −$${(o.exitCost * 100).toFixed(4)}`);
    check('and that is NEGATIVE — fairly priced means no free money', o.evAtMarket < 0);
    check('with no tilt the view EV IS the market EV', Math.abs(o.ev - o.evAtMarket) < 1e-9);
  }
}

// ---- the distribution is calibrated to the premium, not to the printed IV --------
{
  /* A mid rounded to the cent and an IV rounded to a tenth of a point:
     read at the printed IV the at-market EV is rounding noise; read at the
     solved σ it is minus the friction, to the cent. */
  const K = 501,
    dte = 0;
  const years = 0.5 / 365;
  const trueIv = 0.3037;
  const fairMid = outcomeRead(SPOT, K, dte, trueIv, 'C', 0, 0, 0).ev / CONTRACT_MULTIPLIER;
  const printedMid = Number(fairMid.toFixed(2));
  const printedIv = Number((trueIv * 100).toFixed(1)) / 100;
  const o = outcomeRead(SPOT, K, dte, printedIv, 'C', printedMid, 0.4, 0);
  check('the σ used is solved from the mid, not the printed IV', Math.abs(o.ivUsed - printedIv) > 1e-6, `used ${(o.ivUsed * 100).toFixed(3)}% for a printed ${(printedIv * 100).toFixed(1)}%`);
  check('and it reproduces the mid', Math.abs(impliedSigma(SPOT, K, 'C', years, printedMid, printedIv) - o.ivUsed) < 1e-12);
  check('so the at-market EV is minus the friction to the cent', Math.abs(o.evAtMarket + o.exitCost * CONTRACT_MULTIPLIER) < 1e-6, `$${o.evAtMarket.toFixed(4)}`);
  check('a mid nothing can reproduce falls back to the printed IV', Math.abs(outcomeRead(SPOT, 400, 5, 0.2, 'C', 50, 1, 0).ivUsed - 0.2) < 1e-12);
  check('as does no premium at all', Math.abs(outcomeRead(SPOT, K, 5, 0.2, 'C', 0, 1, 0).ivUsed - 0.2) < 1e-12);
}

// ---- the tilt is the view, and it moves EV the way a view should ---------------
{
  const K = 505,
    dte = 5,
    mid = 3.2;
  const flat = outcomeRead(SPOT, K, dte, IV, 'C', mid, 2, 0);
  const forC = outcomeRead(SPOT, K, dte, IV, 'C', mid, 2, 0.3);
  const againstC = outcomeRead(SPOT, K, dte, IV, 'C', mid, 2, -0.3);
  check('a tilt in the call\'s favour raises its EV', forC.ev > flat.ev);
  check('and its POP', forC.pop > flat.pop);
  check('a tilt against it lowers both', againstC.ev < flat.ev && againstC.pop < flat.pop);
  const flatP = outcomeRead(SPOT, 495, dte, IV, 'P', mid, 2, 0);
  const forP = outcomeRead(SPOT, 495, dte, IV, 'P', mid, 2, 0.3);
  check('a put\'s favourable tilt is DOWN — positive tilt raises a put\'s EV too', forP.ev > flatP.ev);
  check('the at-market EV does not move with the tilt', Math.abs(forC.evAtMarket - flat.evAtMarket) < 1e-9);
  check('the tilt is reported', forC.tiltSigma === 0.3 && againstC.tiltSigma === -0.3);
}

// ---- tiltFor: the weigh becomes a lean, and FADE never leans in ------------------
{
  check('a middling weigh does not tilt', tiltFor(50, 'WATCH') === 0);
  check('a perfect weigh tilts the maximum', Math.abs(tiltFor(100, 'BUY') - MAX_TILT_SIGMA) < 1e-12);
  check('a zero weigh tilts the maximum against', Math.abs(tiltFor(0, 'FADE') + MAX_TILT_SIGMA) < 1e-12);
  check('the lean is symmetric', Math.abs(tiltFor(75, 'BUY') + tiltFor(25, 'WATCH')) < 1e-12);
  check('a FADE verdict never tilts in the trade\'s favour, whatever the composite', tiltFor(90, 'FADE') === 0);
  check('and is clamped past the ends', Math.abs(tiltFor(140, 'BUY')) <= MAX_TILT_SIGMA + 1e-12);
}

// ---- THE FIXTURE'S CLAIM ON A REAL CONTRACT: utility can reject a +EV trade ------
{
  /* Walk the tilt up on an out-of-the-money call until EV turns positive and
     show that utility is still negative there. */
  const K = 515,
    dte = 5,
    mid = 1.1;
  let found: ReturnType<typeof outcomeRead> | null = null;
  for (let t = 0; t <= MAX_TILT_SIGMA + 1e-9; t += 0.01) {
    const o = outcomeRead(SPOT, K, dte, IV, 'C', mid, 3, t);
    if (o.ev > 0) {
      found = o;
      break;
    }
  }
  check('an OTM call reaches positive EV inside the allowed tilt', found !== null, found ? `at +${found.tiltSigma.toFixed(2)}σ, EV $${found.ev.toFixed(0)}` : '');
  if (found) {
    check('AND UTILITY STILL SAYS NO', found.utility < 0, `utility $${found.utility.toFixed(0)}, ES $${found.es.toFixed(0)}`);
    check('the read flags it', found.utilityRejects);
    check('and the sentence says both things', /positive on average/i.test(oddsSentence(found)) && /negative after the tail/i.test(oddsSentence(found)));
  }
  /* A deep ITM call has little tail — utility can be positive there. */
  const deep = outcomeRead(SPOT, 450, 30, IV, 'C', 52, 1, 0.3);
  check('a deep ITM call with a favourable view can clear the tail', deep.utility > 0 || deep.ev > deep.utility, `EV $${deep.ev.toFixed(0)}, utility $${deep.utility.toFixed(0)}`);
  check('a rejected trade and a cleared trade get different sentences', oddsSentence(found!) !== oddsSentence(deep));
  const dead = outcomeRead(SPOT, 515, 5, IV, 'C', 1.1, 3, -0.2);
  check('a losing read says the view does not lift it', /does not lift/i.test(oddsSentence(dead)) && !dead.utilityRejects);
}

// ---- same-day: the total-loss figure is a real probability, and the cap is arithmetic --
{
  const o = outcomeRead(SPOT, 503, 0, IV, 'C', 1.4, 4, 0);
  check('a 0DTE slightly OTM call goes to zero more often than not', o.pTotalLoss > 0.5, `${(o.pTotalLoss * 100).toFixed(0)}%`);
  check('half a day is the floor, as in the pricer', Math.abs(o.years - 0.5 / 365) < 1e-12);

  const unit = samedayCap(1.4, null);
  check('with no book the cap is per $10,000', unit.perUnit && unit.riskDollars === BOOK_UNIT * SAMEDAY_RISK_FRACTION);
  check('and it is whole contracts', unit.contracts === Math.floor((BOOK_UNIT * SAMEDAY_RISK_FRACTION) / 140), `${unit.contracts}`);
  const real = samedayCap(1.4, 50_000);
  check('with a book it reads against the book', !real.perUnit && real.riskDollars === 500 && real.contracts === 3);
  check('a ticket bigger than the whole cap reads as zero contracts, not a fraction', samedayCap(2.5, 10_000).contracts === 0);
  check('a zero mid cannot divide by zero', Number.isFinite(samedayCap(0, 10_000).contracts));
  check('a non-positive book falls back to the unit', samedayCap(1, 0).perUnit && samedayCap(1, -5).perUnit);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
