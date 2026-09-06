/*
  Acceptance test for PART 16 — the seeding walk's gamma-only GEX snapshot.

  THE MEASUREMENT THAT PROMPTED IT. The first snapshotFor on a name outside
  the four pre-seeded ones cost 2.0–3.7 seconds — 50.6s across the 22-name
  universe, a 4,509ms long task, and the reason LaunchTransition's 1,350ms
  hold was observed running 4–6.4s: the timer could not fire. seedCandles
  walks 22 sessions x 390 bars and takes a GEX snapshot at every one, and a
  snapshot reads four fields: strike, netGex, callOI, putOI. It was getting
  them from generateOptionsChain, which computes delta, vega, vanna, charm
  and rho as well, quantises five exposure families, allocates a 22-field
  node per strike, and memoises the result under a key that includes the
  spot — so every bar wrote a cache entry that nothing could ever hit.

  THE RISK THE FIX CARRIES is that the snapshot path and the display path
  drift: history would disagree with the live chain about the same strike,
  in cents, from nowhere. This proof denies that, and it denies it to the
  BIT rather than to a tolerance — the whole point of reusing the chain's
  arithmetic in the chain's order is that no epsilon should be needed.
*/
import Simulator from '../src/core/simulator';
import { blackScholesGreeks, blackScholesGamma } from '../src/core/greeks';
import { hash, h01 } from '../src/core/rng';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

const NAMES = ['SPY', 'QQQ', 'AAPL', 'NVDA', 'TSLA', 'META', 'MSFT', 'AMZN'];
const CHAIN_T = 0.003;      // the horizon the chain and the snapshot share
const DEALER_CALL_DIR = -0.55;
const DEALER_PUT_DIR = -0.53;
const qMoney = (v: number) => Math.round(v * 100) / 100;

// ── 16.1 the fast gamma is the SAME gamma, bit for bit ───────────────────
{
  /*
    Swept over the real grid: every name's own spot, IV and step, across the
    full +/-30 strike window the chain builds, plus a deliberately hostile
    tail (deep wings, tiny and huge IV, near-zero time) where the two
    formulas would part company first if they were going to.
  */
  let n = 0, worst = 0, mismatch = 0;
  for (const sym of NAMES) {
    const { chain, spot } = Simulator.chainFor(sym);
    const iv = Simulator.TICKERS[sym].iv;
    for (const node of chain) {
      const full = blackScholesGreeks(spot, node.strike, CHAIN_T, iv).gamma;
      const fast = blackScholesGamma(spot, node.strike, CHAIN_T, iv);
      n++;
      if (fast !== full) { mismatch++; worst = Math.max(worst, Math.abs(fast - full)); }
    }
  }
  check(`fast gamma === full gamma on ${n} real chain strikes`, mismatch === 0,
    mismatch ? `${mismatch} differ, worst ${worst}` : 'bit-identical');

  let hostile = 0, hMismatch = 0;
  for (const S of [1, 15.5, 100, 437.21, 1000, 9999.99]) {
    for (const km of [0.2, 0.5, 0.9, 0.99, 1, 1.01, 1.1, 2, 5]) {
      for (const v of [0.01, 0.05, 0.15, 0.6, 1.5, 4]) {
        for (const t of [0.0001, 0.003, 0.25, 2]) {
          hostile++;
          if (blackScholesGamma(S, S * km, t, v) !== blackScholesGreeks(S, S * km, t, v).gamma) hMismatch++;
        }
      }
    }
  }
  check(`fast gamma === full gamma on ${hostile} hostile inputs`, hMismatch === 0, `${hMismatch} differ`);

  // The clamps are part of the contract, not incidental: t<=0 and v<=0 are
  // rewritten identically by both, so a degenerate input cannot split them.
  check('degenerate t and v clamp the same way',
    blackScholesGamma(100, 100, 0, 0.2) === blackScholesGreeks(100, 100, 0, 0.2).gamma &&
    blackScholesGamma(100, 100, 0.003, 0) === blackScholesGreeks(100, 100, 0.003, 0).gamma);
}

// ── 16.2 the snapshot's net is the chain's net, from the chain's legs ────
{
  /*
    The snapshot does not round its net; it sums the ROUNDED legs, because
    that is what the chain does and exposure-canon-proof already insists the
    net equal its own legs. Recomputing every live node's net by the
    snapshot's formula, from that node's own gamma and OI, is the strongest
    available statement that the two paths cannot disagree: real data, real
    gamma, and equality demanded exactly.
  */
  let n = 0, off = 0, worst = 0;
  for (const sym of NAMES) {
    const { chain, spot } = Simulator.chainFor(sym);
    const iv = Simulator.TICKERS[sym].iv;
    for (const node of chain) {
      const gamma = blackScholesGamma(spot, node.strike, CHAIN_T, iv);
      const callGex = node.callOI * 100 * gamma * spot * spot * 0.01 * DEALER_CALL_DIR;
      const putGex = node.putOI * 100 * gamma * spot * spot * 0.01 * DEALER_PUT_DIR * -1;
      const snapValue = qMoney(callGex) + qMoney(putGex);
      n++;
      if (snapValue !== node.netGex) { off++; worst = Math.max(worst, Math.abs(snapValue - node.netGex)); }
    }
  }
  check(`snapshot net === chain netGex on ${n} strikes`, off === 0,
    off ? `${off} differ, worst ${worst}` : 'exact');
}

// ── 16.3 the snapshot covers the chain's strikes, and only those ─────────
{
  /*
    Same window, same step, same base. This is what the shared CHAIN_RANGE
    constant buys; the check is here so a future edit to one loop that
    forgets the other fails loudly instead of quietly truncating history.
  */
  let ok = true, detail = '';
  for (const sym of NAMES) {
    const { chain } = Simulator.chainFor(sym);
    const hist = Simulator.getGexHistory(sym);
    if (!hist.length) { ok = false; detail = `${sym} has no history`; break; }
    const snapLen = hist[hist.length - 1].levels.length;
    if (snapLen !== chain.length) { ok = false; detail = `${sym}: snapshot ${snapLen} vs chain ${chain.length}`; break; }
    if (snapLen !== 61) { ok = false; detail = `${sym}: ${snapLen} levels, expected 61`; break; }
  }
  check('every snapshot carries the chain\'s 61 strikes', ok, detail);

  // Strike spacing inside a snapshot is the ticker's step, uniformly.
  let spacingOk = true, sDetail = '';
  for (const sym of NAMES) {
    const step = Simulator.TICKERS[sym].step;
    const lv = Simulator.getGexHistory(sym)[0].levels;
    for (let i = 1; i < lv.length; i++) {
      if (Math.abs(lv[i].strike - lv[i - 1].strike - step) > 1e-9) {
        spacingOk = false; sDetail = `${sym} at ${lv[i].strike}`; break;
      }
    }
    if (!spacingOk) break;
  }
  check('snapshot strikes step by the ticker\'s own increment', spacingOk, sDetail);
}

// ── 16.4 history is real depth, not a truncated remnant ──────────────────
{
  /*
    22 sessions x 390 bars. The reason this is asserted: the cheap way to
    make seeding fast is to take fewer snapshots, and that silently shortens
    every consumer that reads getGexHistory — StrikeChart, PositioningMap
    and MigrationMap all walk it. Speed had to come from the per-snapshot
    cost, and this is the line that says so.
  */
  const EXPECTED = 22 * 390;
  let ok = true, detail = '';
  for (const sym of NAMES) {
    const len = Simulator.getGexHistory(sym).length;
    if (len !== EXPECTED) { ok = false; detail = `${sym}: ${len} snapshots, expected ${EXPECTED}`; break; }
  }
  check(`${EXPECTED} snapshots per name survive the change`, ok, detail);
}

// ── 16.5 OI in a snapshot is the book's OI, not a fresh curve ────────────
{
  /*
    P-8: the OI must be the one the gamma was computed against. The book has
    memory and freshOI does not, so a snapshot that silently fell back to
    freshOI everywhere would still look like a plausible smile. Walls having
    ASYMMETRY the fresh curve cannot produce is the tell.
  */
  let asymmetric = 0;
  for (const sym of NAMES) {
    const lv = Simulator.getGexHistory(sym)[Simulator.getGexHistory(sym).length - 1].levels;
    for (let i = 1; i < lv.length - 1; i++) {
      // callOI is optional on the level type — a snapshot that omitted it
      // would fail the peak count rather than pass on undefined comparisons
      const l = lv[i - 1].callOI, c = lv[i].callOI, r = lv[i + 1].callOI;
      if (l === undefined || c === undefined || r === undefined) continue;
      if (c > l && c > r) asymmetric++;
    }
  }
  check('the book leaves local OI peaks a smooth curve could not', asymmetric > 0,
    `${asymmetric} interior call-OI peaks`);
}

// ── 16.6 the FNV fold, which the seeded stream now leans on ─────────────
{
  /*
    `seededStream` used to build `${seed}|${i}` and hash the whole string on
    every draw — ~1.1M strings per name during seeding, each one re-hashing
    an unchanging 20-character prefix. It now folds the prefix once and
    resumes over the digits of i.

    That is only sound because FNV-1a is a LEFT FOLD: hashing `ab` is
    hashing `a` and then continuing with `b`, from the same state. The
    seeding walk's entire price history rests on that identity holding, so
    it is asserted here against the real `hash`, not assumed from the shape
    of the loop.
  */
  const FNV_PRIME = 16777619;
  const contin = (state: number, suffix: string): number => {
    let h = state;
    for (let k = 0; k < suffix.length; k++) { h ^= suffix.charCodeAt(k); h = Math.imul(h, FNV_PRIME); }
    return h >>> 0;
  };
  // hash() returns the folded state already >>> 0, which is the same 32 bits
  // the running fold carries — that is what makes resumption legal.
  let bad = 0, n = 0;
  for (const seed of ['TSLA|2026-09-05|seed', 'SPY|2026-01-01|seed', 'x', '']) {
    const prefix = `${seed}|`;
    const state = hash(prefix);
    for (let i = 0; i < 5000; i++) {
      n++;
      if (contin(state, String(i)) !== hash(`${prefix}${i}`)) bad++;
    }
    // and through h01's final step, which is what callers actually see
    for (const i of [0, 1, 9, 10, 99, 100, 12345, 1046759]) {
      n++;
      if ((contin(state, String(i)) % 10000) / 10000 !== h01(`${seed}|${i}`)) bad++;
    }
  }
  check(`FNV resumes from a folded prefix on ${n} cases`, bad === 0, `${bad} differ`);

  // The digit buffer is 12 bytes and indexes with (n / 10) | 0, so the claim
  // is bounded at 2^31. The walk asks for ~1.1M draws per name.
  const DRAWS_PER_NAME = 22 * 390 * (2 * 61 + 3);
  check('the walk stays far inside the digit buffer\'s range',
    DRAWS_PER_NAME < 2 ** 31 && String(2 ** 31).length <= 12, `${DRAWS_PER_NAME} draws`);
}

// ── 16.7 the strike grid is exact, which is what killed the toFixed ─────
{
  /*
    `gridStrike` rounds with arithmetic instead of formatting a string. That
    is only equivalent because every strike reaching it is an exact multiple
    of a half, which needs `step` to be one too. The first version of this
    check asserted `step === 1 || step === 0.5` and TSLA failed it at 2.5 —
    the ladder widens with price (0.5/1/2.5/5). The looser invariant is the
    true one; a step of 0.25 or 0.1 would still break the identity, so it is
    asserted across the WHOLE price domain rather than across whichever
    names happen to be seeded.
  */
  const universe = Simulator.universeQuotes('SPY').map(q => q.ticker);
  let badStep = '';
  for (const t of universe) {
    const cfg = Simulator.TICKERS[t];
    if (!cfg) continue;
    if (cfg.step * 2 !== Math.round(cfg.step * 2)) { badStep = `${t} step ${cfg.step}`; break; }
  }
  check('every seeded ticker\'s step is a multiple of a half', badStep === '', badStep);

  // stepFor's whole domain, not just the names that happen to be seeded.
  let badSpan = '';
  for (let px = 0.5; px < 1200 && !badSpan; px += 0.5) {
    const step = px < 50 ? 0.5 : px < 150 ? 1 : px < 400 ? 2.5 : 5;   // stepFor
    if (step * 2 !== Math.round(step * 2)) { badSpan = `price ${px} -> step ${step}`; break; }
    const base = Math.round(px / step) * step;
    for (let i = -30; i <= 30; i++) {
      const v = base + i * step;
      if (Math.round(v * 100) / 100 !== Number(v.toFixed(2))) { badSpan = `price ${px}, strike ${v}`; break; }
    }
  }
  check('the grid stays exact across every price band', badSpan === '', badSpan);

  let n = 0, differ = 0, notExact = 0;
  for (const sym of NAMES) {
    const { chain } = Simulator.chainFor(sym);
    for (const node of chain) {
      n++;
      const s = node.strike;
      if (Math.round(s * 100) / 100 !== Number(s.toFixed(2))) differ++;
      if (s * 2 !== Math.round(s * 2)) notExact++;   // a multiple of a half
    }
  }
  check(`arithmetic rounding === toFixed on ${n} live strikes`, differ === 0, `${differ} differ`);
  check('every live strike is an exact multiple of a half', notExact === 0, `${notExact} are not`);

  // Same claim on the history, which is the path that changed.
  let histOff = 0, histN = 0;
  for (const sym of NAMES) {
    const hist = Simulator.getGexHistory(sym);
    for (const snap of [hist[0], hist[Math.floor(hist.length / 2)], hist[hist.length - 1]]) {
      for (const l of snap.levels) { histN++; if (l.strike * 2 !== Math.round(l.strike * 2)) histOff++; }
    }
  }
  check(`${histN} historical strikes land on the half-cent grid`, histOff === 0, `${histOff} do not`);
}

// ── 16.8 the live window is a contiguous range, so a Set was redundant ──
{
  /*
    evolveBook culled strikes with a per-bar Set of the 61 live ones. The
    window is `base +/- 30 * step` with every book key on the same grid, so
    membership is two comparisons. This asserts the premise: within a
    snapshot the strikes are contiguous on the step, with no interlopers a
    range test would wrongly keep alive.
  */
  let ok = true, detail = '';
  for (const sym of NAMES) {
    const step = Simulator.TICKERS[sym].step;
    const lv = Simulator.getGexHistory(sym)[Simulator.getGexHistory(sym).length - 1].levels;
    const lo = lv[0].strike, hi = lv[lv.length - 1].strike;
    if (Math.abs(hi - lo - 60 * step) > 1e-9) { ok = false; detail = `${sym}: span ${hi - lo}, expected ${60 * step}`; break; }
    for (const l of lv) {
      const idx = (l.strike - lo) / step;
      if (Math.abs(idx - Math.round(idx)) > 1e-9) { ok = false; detail = `${sym}: ${l.strike} off the grid`; break; }
    }
    if (!ok) break;
  }
  check('the live window is contiguous on the step, end to end', ok, detail);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
