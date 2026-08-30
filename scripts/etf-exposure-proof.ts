/*
  Acceptance test for passive ownership.

  Proves:
  1. A sector fund only ever holds its own sector — the model never
     contradicts its own label
  2. No single name breaches the fund's concentration ceiling, and the
     ceiling is what stops a two-name shelf putting half the fund in its
     leader
  3. A fund's weights sum to the share this desk claims to cover, and
     coverage falls out of how many of its holdings we actually have — a
     utilities fund with one name in the universe does not become 82% that
     name
  4. Shares moved follow weight and fund flow, with the sign of the flow —
     a redemption sells
  5. The passive share is measured against the name's own volume and is
     never above 100%
  6. It is stable within a day and the ranking is by POSITION, not by
     today's flow
*/
import {
  FUNDS,
  weightOf,
  coverageOf,
  exposureFor,
  exposureRead,
  basketFor,
  fundFlow,
} from '../src/data/etfExposure';
import { UNIVERSE, lookup } from '../src/data/universe';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

const DAY = '2026-08-30';
const CEIL: Record<string, number> = { broad: 9, sector: 22, thematic: 28 };

// ── 1. a sector fund holds its own sector ────────────────────────────────
{
  for (const f of FUNDS.filter(f => f.sectors)) {
    const held = UNIVERSE.filter(u => weightOf(f, u.ticker, DAY) > 0);
    check(`${f.ticker}: holds only its mandate`, held.every(u => f.sectors!.includes(u.sector)), `${held.length} names`);
    check(`${f.ticker}: holds something`, held.length > 0);
  }
  const broad = FUNDS.filter(f => !f.sectors);
  check('PREMISE: broad funds exist', broad.length > 0, broad.map(f => f.ticker).join(','));
  for (const f of broad) {
    const held = UNIVERSE.filter(u => weightOf(f, u.ticker, DAY) > 0);
    check(`${f.ticker}: a broad fund holds the whole universe`, held.length === UNIVERSE.length, `${held.length}/${UNIVERSE.length}`);
  }
  check('an unknown name is held by nothing', FUNDS.every(f => weightOf(f, 'ZZZZ', DAY) === 0));
}

// ── 2 & 3. the ceiling and the coverage ──────────────────────────────────
{
  for (const f of FUNDS) {
    const ws = UNIVERSE.map(u => weightOf(f, u.ticker, DAY)).filter(w => w > 0);
    const top = Math.max(...ws, 0);
    check(`${f.ticker}: no name breaches the ceiling`, top <= CEIL[f.kind] + 0.01, `top ${top}% vs ${CEIL[f.kind]}%`);
    const sum = ws.reduce((s, w) => s + w, 0);
    const cov = coverageOf(f, DAY);
    check(`${f.ticker}: weights sum to the covered share`, Math.abs(sum - cov) < 1.5, `${sum.toFixed(1)}% vs ${cov}%`);
    check(`${f.ticker}: coverage is a real fraction`, cov > 0 && cov <= 90, `${cov}%`);
  }
  /* The bug this catches: a flat coverage target handed a one-name shelf
     the whole 82%. Coverage must scale with how many names we hold. */
  const thin = FUNDS.filter(f => f.sectors && UNIVERSE.filter(u => f.sectors!.includes(u.sector)).length <= 2);
  check('PREMISE: some fund has a thin shelf here', thin.length > 0, thin.map(f => f.ticker).join(','));
  for (const f of thin) {
    check(`${f.ticker}: a thin shelf is not claimed as a full book`, coverageOf(f, DAY) <= 45, `${coverageOf(f, DAY)}%`);
  }
}

// ── 4. shares follow weight and flow, and carry its sign ─────────────────
{
  const e = exposureFor('NVDA', DAY);
  check('PREMISE: NVDA is held', e.holdings.length > 0, `${e.holdings.length} funds`);
  const u = lookup('NVDA')!;
  for (const h of e.holdings) {
    const wantUsd = h.fundFlowUsd * (h.weightPct / 100);
    check(`${h.fund.ticker}: dollars moved are flow at weight`, Math.abs(h.usdMoved - wantUsd) < 1);
    check(`${h.fund.ticker}: shares are those dollars at the price`, h.sharesMoved === Math.round(wantUsd / u.px));
    check(
      `${h.fund.ticker}: a redemption sells`,
      h.fundFlowUsd === 0 || Math.sign(h.sharesMoved) === Math.sign(h.fundFlowUsd) || h.sharesMoved === 0
    );
    check(`${h.fund.ticker}: the position is the fund at weight`, Math.abs(h.positionUsd - h.fund.aum * (h.weightPct / 100)) < 1);
  }
  check('the net is the sum of the rows', e.netShares === e.holdings.reduce((s, h) => s + h.sharesMoved, 0));
  check('held dollars are the sum of the positions', Math.abs(e.heldUsd - e.holdings.reduce((s, h) => s + h.positionUsd, 0)) < 1);
  /* Some fund somewhere must actually be redeeming, or the sign test above
     never sees a negative. */
  const anyOut = FUNDS.some(f => fundFlow(f, DAY) < 0);
  check('PREMISE: some fund is redeeming today', anyOut);
}

// ── 5. the passive share ─────────────────────────────────────────────────
{
  for (const t of ['NVDA', 'JPM', 'XOM', 'AAPL']) {
    const e = exposureFor(t, DAY);
    check(`${t}: passive share is a percentage`, e.passivePct >= 0 && e.passivePct <= 100, `${e.passivePct}%`);
    check(
      `${t}: it is net shares over the name's own volume`,
      Math.abs(e.passivePct - Math.min(100, (Math.abs(e.netShares) / e.shareVolume) * 100)) < 0.11,
      `${e.passivePct}%`
    );
    check(`${t}: the sentence names the name`, exposureRead(e).includes(t));
  }
  check('an unknown name reports nothing rather than crashing', exposureFor('ZZZZ', DAY).holdings.length === 0);
}

// ── 6. stability and ranking ─────────────────────────────────────────────
{
  const a = exposureFor('NVDA', DAY);
  const b = exposureFor('NVDA', DAY);
  check('the board is stable within a day', a.netShares === b.netShares && a.passivePct === b.passivePct);
  check(
    'rows are ranked by position, not by today\'s flow',
    a.holdings.every((h, i) => i === 0 || a.holdings[i - 1].positionUsd >= h.positionUsd)
  );
  /* And the ranking is genuinely different from a flow ranking, or the
     claim above is untested. */
  const byFlow = [...a.holdings].sort((x, y) => Math.abs(y.usdMoved) - Math.abs(x.usdMoved));
  check('PREMISE: the two orders differ', byFlow.some((h, i) => h.fund.ticker !== a.holdings[i].fund.ticker));

  const basket = basketFor('XLK', DAY);
  check('a basket resolves', basket !== null);
  check('the basket is ranked by weight', basket!.rows.every((r, i) => i === 0 || basket!.rows[i - 1].weightPct >= r.weightPct));
  check('every basket row is in the mandate', basket!.rows.every(r => basket!.fund.sectors!.includes(r.sector)));
  check('an unknown fund resolves to null, not an empty lie', basketFor('NOPE', DAY) === null);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
