/*
  Acceptance test for P-16's cost basis / pain map.

  This is the surface with the most load-bearing ASSUMPTION on the desk: a
  print is a trade between two parties, and calling one of them "the holder"
  is a choice. The choice is that an ASK-side print is an opening long, with
  BID and MID excluded rather than guessed at. Everything below is designed
  to fail if that choice quietly changes — because a basis that mixes longs
  and shorts describes nobody, and it would still look like a number.

  Proves:
  1. The basis is volume-weighted, not a plain average — one big fill moves
     it more than three small ones, computed by hand
  2. BID prints are EXCLUDED, not counted as shorts; MID prints likewise.
     Both are staged so including either would visibly move the answer
  3. Coverage reports what share of the strike's premium the tracked
     population actually is, so a thin slice is visible as thin
  4. The mark is the MODEL at the current spot, not the last fill — a stale
     tape must not produce a stale P&L
  5. Unrealized P&L is signed from the holder's side and scales with
     contracts and the multiplier
  6. The band's breakeven is a SPOT, found by inversion, and it really does
     mark the model price back to the basis — verified by re-pricing there
  7. A basis no spot in range can mark reports null rather than a number,
     and the words say which case they are in
*/
import { buildStrikeBasis, buildBasisBand, bandWords, CONTRACT_MULTIPLIER } from '../src/data/costBasis';
import { blackScholesPrice } from '../src/core/greeks';
import type { FlowPrint } from '../src/types/trace';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};
const near = (a: number | null, b: number, eps = 1e-6) => a !== null && Math.abs(a - b) < eps;

const print = (
  strike: number,
  right: 'C' | 'P',
  fill: number,
  size: number,
  side: 'BID' | 'ASK' | 'MID',
  premium = fill * size * 100
): FlowPrint => ({ strike, right, fill, size, side, premium, id: Math.random() } as unknown as FlowPrint);

const SPOT = 500, T = 30 / 365, IV = 0.25;

// ── 1. volume-weighted ────────────────────────────────────────────────────
{
  /* One 900-lot at 5.00 and three 100-lots at 1.00:
       VWAP = (900·5 + 300·1)/1200 = 4800/1200 = 4.00
       plain mean of the four fills would be 2.00 — a very different number. */
  const prints = [
    print(500, 'C', 5, 900, 'ASK'),
    print(500, 'C', 1, 100, 'ASK'),
    print(500, 'C', 1, 100, 'ASK'),
    print(500, 'C', 1, 100, 'ASK'),
  ];
  const b = buildStrikeBasis(prints, 500, 'C', SPOT, T, IV);
  check('the basis is volume-weighted, by hand', near(b.basis, 4), String(b.basis));
  check('— not the plain mean of the fills', !near(b.basis, 2));
  check('and it counts every contract behind it', b.contracts === 1200);
}

// ── 2. the assumption: ASK only ───────────────────────────────────────────
{
  const asks = [print(500, 'C', 4, 100, 'ASK')];
  const withBid = [...asks, print(500, 'C', 40, 900, 'BID')];
  const withMid = [...asks, print(500, 'C', 40, 900, 'MID')];
  const base = buildStrikeBasis(asks, 500, 'C', SPOT, T, IV);
  check('PREMISE: the ASK-only basis is the fill itself', near(base.basis, 4));
  check(
    'a huge BID print does not move the basis — it is the other side, not a short holder',
    near(buildStrikeBasis(withBid, 500, 'C', SPOT, T, IV).basis, 4),
    String(buildStrikeBasis(withBid, 500, 'C', SPOT, T, IV).basis)
  );
  check('nor does a MID print, whose direction is genuinely unknown', near(buildStrikeBasis(withMid, 500, 'C', SPOT, T, IV).basis, 4));
  check('and a strike with no ASK prints reports no basis, not zero', buildStrikeBasis([print(500, 'C', 4, 100, 'BID')], 500, 'C', SPOT, T, IV).basis === null);
}

// ── 3. coverage ───────────────────────────────────────────────────────────
{
  /* 100 contracts at 4.00 on the ask (premium 40,000) against 900 at 40.00
     on the bid (premium 3,600,000): the tracked population is a thin slice
     and must say so. */
  const prints = [print(500, 'C', 4, 100, 'ASK'), print(500, 'C', 40, 900, 'BID')];
  const b = buildStrikeBasis(prints, 500, 'C', SPOT, T, IV);
  check('coverage is the tracked premium over the strike’s whole premium', near(b.coverage, 40_000 / (40_000 + 3_600_000), 1e-9), String(b.coverage));
  check('— so a thin slice is visible as thin', b.coverage < 0.05);
  const all = buildStrikeBasis([print(500, 'C', 4, 100, 'ASK')], 500, 'C', SPOT, T, IV);
  check('and a strike that is all aggressive longs reads full coverage', near(all.coverage, 1));
}

// ── 4+5. the mark and the pain ────────────────────────────────────────────
{
  const model = blackScholesPrice(SPOT, 500, T, IV, 'C');
  /* Basis deliberately far ABOVE the model mark: these holders are down. */
  const under = buildStrikeBasis([print(500, 'C', model * 3, 200, 'ASK')], 500, 'C', SPOT, T, IV);
  check('the mark is the MODEL at the current spot, not the last fill', near(under.mark, model), `${under.mark} vs ${model}`);
  check('holders above the mark read as underwater', under.underwater === true);
  check('and their P&L is negative', (under.unrealized ?? 0) < 0, String(under.unrealized));
  check(
    'P&L is (mark − basis) × contracts × 100',
    near(under.unrealized, (model - model * 3) * 200 * CONTRACT_MULTIPLIER, 1e-6),
    String(under.unrealized)
  );
  const over = buildStrikeBasis([print(500, 'C', model / 3, 200, 'ASK')], 500, 'C', SPOT, T, IV);
  check('holders below it are green', over.underwater === false && (over.unrealized ?? 0) > 0);
  /* Twice the contracts at the same basis is twice the pain. */
  const twice = buildStrikeBasis([print(500, 'C', model * 3, 400, 'ASK')], 500, 'C', SPOT, T, IV);
  check('and it scales with contracts', near(twice.unrealized, (under.unrealized ?? 0) * 2, 1e-6));
  /* No mark to be had: the P&L must be absent, not zero. */
  const noMark = buildStrikeBasis([print(500, 'C', 4, 100, 'ASK')], 500, 'C', 0, T, IV);
  check('with no spot there is no mark and no P&L — absent, not zero', noMark.mark === null && noMark.unrealized === null && noMark.underwater === null);
}

// ── 6. the band's breakeven is a real inversion ───────────────────────────
{
  /* Buyers paid a premium the model only reaches at a HIGHER spot. */
  const basisPaid = blackScholesPrice(SPOT * 1.04, 505, T, IV, 'C');
  const band = buildBasisBand([print(505, 'C', basisPaid, 500, 'ASK')], 'C', SPOT, T, IV);
  check('PREMISE: the band has a basis', near(band.basis, basisPaid));
  check('the breakeven is a SPOT, above today’s', (band.breakevenSpot ?? 0) > SPOT, String(band.breakevenSpot));
  /* THE REAL TEST: re-price at the breakeven and the model must mark the
     contract at exactly the holders' basis. */
  const remarked = band.breakevenSpot !== null ? blackScholesPrice(band.breakevenSpot, 505, T, IV, 'C') : null;
  check('and re-pricing there marks the contract back at the basis', near(remarked, basisPaid, 1e-4), `${remarked} vs ${basisPaid}`);
  check('the words name the flip and its distance', /turn green at/.test(bandWords(band, SPOT)), bandWords(band, SPOT).slice(0, 80));

  /* A put band inverts the other way — the model rises as spot FALLS. */
  const putPaid = blackScholesPrice(SPOT * 0.96, 495, T, IV, 'P');
  const putBand = buildBasisBand([print(495, 'P', putPaid, 500, 'ASK')], 'P', SPOT, T, IV);
  check('a put band breaks even BELOW spot', (putBand.breakevenSpot ?? Infinity) < SPOT, String(putBand.breakevenSpot));
  const putRemark = putBand.breakevenSpot !== null ? blackScholesPrice(putBand.breakevenSpot, 495, T, IV, 'P') : null;
  check('and its inversion marks back to the basis too', near(putRemark, putPaid, 1e-4));
}

// ── 7. absence ────────────────────────────────────────────────────────────
{
  const none = buildBasisBand([], 'C', SPOT, T, IV);
  check('no aggressive buying means no band', none.basis === null && none.breakevenSpot === null);
  check('and the words say that, not a number', /No aggressive call buying/.test(bandWords(none, SPOT)));
  /* A basis no spot in the bracket can produce. */
  const absurd = buildBasisBand([print(505, 'C', 5_000, 100, 'ASK')], 'C', SPOT, T, IV);
  check('a basis outside what the model can mark reports null', absurd.breakevenSpot === null);
  check('— and says so rather than printing a spot', /outside what the model can mark/.test(bandWords(absurd, SPOT)));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
