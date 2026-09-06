/*
  Acceptance test for Part 7.1 and 7.2 — the quality sleeve's inputs and the
  per-sleeve methodology door.

  "The quality sleeve currently has no defined inputs — this panel is where
   they live." · "Per-sleeve methodology door." · "Quality-sleeve
   methodology door — state exactly which fields compose the score and how
   they're normalized."

  The state this replaced is worth naming, because it is the worst shape a
  number can have on a desk like this one. It was not missing and it was not
  approximate:

      quality: Math.round(hRange(`${ticker}-${day}-stk-qual`, 25, 94))

  A seeded random number, rendered as a 0-100 bar, under a note claiming it
  was "balance-sheet and margin health from the last four reported
  quarters". Sourced-sounding and unsourced. A reader could open the
  fundamentals drawer on the same name, read a 39% net margin, and see a
  quality bar of 30.

  So the assertions come in two halves: the score is really composed from
  the statements, and the board no longer claims a source for the two
  sleeves that still do not have one.
*/
import { readFileSync } from 'node:fs';
import {
  LIQUIDITY_CAP,
  QUALITY_FIELD_WORDS,
  QUALITY_WEIGHTS,
  qualityBreakdown,
  qualityScore,
  resetQualityTable,
  type QualityField,
} from '../src/data/qualityScore';
import { SLEEVE_METHOD, SLEEVE_WINDOWS, buildStockBoard } from '../src/data/stocks';
import { buildFundamentals } from '../src/data/fundamentals';
import { UNIVERSE } from '../src/data/universe';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

// ---- the score is composed from the statements ------------------------------
const board = buildStockBoard();
check('PREMISE: the board is the universe', board.length === UNIVERSE.length, `${board.length} rows`);
check(
  'every row s quality IS the composed score, not a seed',
  board.every(p => p.sleeves.quality === qualityScore(p.ticker)),
  ''
);

/* The contradiction that motivated this: the bar and the drawer must now be
   reading the same statements. Checked by driving the composition again from
   `buildFundamentals` directly and landing on the same number. */
{
  const fields = Object.keys(QUALITY_WEIGHTS) as QualityField[];
  const raw = UNIVERSE.map(u => {
    const f = buildFundamentals(u.ticker)!;
    return {
      ticker: u.ticker,
      v: {
        netMargin: f.ratios.netMarginPct,
        roe: f.ratios.roePct ?? 0,
        fcfMargin: f.ratios.fcfMarginPct,
        leverage: -f.ratios.debtToEquity,
        liquidity: Math.min(f.ratios.currentRatio, LIQUIDITY_CAP),
      } as Record<QualityField, number>,
    };
  });
  const mine = (t: string) => {
    const me = raw.find(r => r.ticker === t)!;
    let s = 0;
    for (const f of fields) {
      const vals = raw.map(r => r.v[f]);
      const pct = (vals.filter(v => v < me.v[f]).length / (vals.length - 1)) * 100;
      s += pct * QUALITY_WEIGHTS[f];
    }
    return Math.round(s);
  };
  const agree = UNIVERSE.every(u => mine(u.ticker) === qualityScore(u.ticker));
  check('an independent recomposition from the statements lands on the same score', agree);
}

// ---- the normalisation is a ranking and behaves like one ---------------------
const scores = UNIVERSE.map(u => qualityScore(u.ticker)!);
check('every name scores', scores.every(s => Number.isFinite(s)));
check('the scale spans usefully', Math.max(...scores) - Math.min(...scores) > 40, `${Math.min(...scores)}..${Math.max(...scores)}`);
check('and it is not a constant dressed as a ranking', new Set(scores).size > UNIVERSE.length / 2, `${new Set(scores).size} distinct`);

/* A percentile within THIS board is the claim. The best name on a field
   must therefore sit at 100 on it, and the worst at 0 — otherwise the
   endpoints are arbitrary and the number is not a percentile. */
{
  const fields = Object.keys(QUALITY_WEIGHTS) as QualityField[];
  for (const f of fields) {
    const all = UNIVERSE.map(u => ({ t: u.ticker, p: qualityBreakdown(u.ticker)!.parts.find(x => x.field === f)! }));
    const top = all.reduce((a, b) => (b.p.raw > a.p.raw ? b : a));
    const bot = all.reduce((a, b) => (b.p.raw < a.p.raw ? b : a));
    const tiedAtTop = all.filter(x => x.p.raw === top.p.raw).length;

    /*
      TIES SHARE THE LOWER PLACING — deliberately, so two identical balance
      sheets are not separated by an accident of iteration order. Which
      means a field with ties at the top CANNOT reach 100, and liquidity
      has them by construction: it is capped at LIQUIDITY_CAP, so every
      name above the cap lands on exactly the same figure.

      Written first as a flat "the best figure reads 100" and it failed on
      liquidity for precisely that reason — a consequence of two stated
      decisions meeting, not a defect in either. The assertion now says
      what each case should actually do.
    */
    if (tiedAtTop === 1) {
      check(`${f}: the best figure on the board reads 100`, Math.abs(top.p.pct - 100) < 1e-9, top.t);
    } else {
      const tied = all.filter(x => x.p.raw === top.p.raw);
      check(
        `${f}: the ${tiedAtTop} names tied at the top share one placing`,
        new Set(tied.map(x => x.p.pct)).size === 1,
        `${tied[0].p.pct.toFixed(1)}`
      );
      check(
        `${f}: and nothing on the board scores above them`,
        all.every(x => x.p.pct <= tied[0].p.pct + 1e-9)
      );
    }
    check(`${f}: and the worst reads 0`, bot.p.pct === 0, bot.t);
  }
}

// ---- liquidity is the one field deliberately not monotone -------------------
/*
  More net margin is better without limit; more CURRENT RATIO is not. Past
  roughly 3 a company is holding idle assets rather than being safer, and
  the top of this universe measures 8.2 — which an uncapped percentile would
  reward as the healthiest balance sheet on the board.
*/
{
  const liq = UNIVERSE.map(u => qualityBreakdown(u.ticker)!.parts.find(p => p.field === 'liquidity')!.raw);
  check('no liquidity figure exceeds the cap', liq.every(v => v <= LIQUIDITY_CAP), `max ${Math.max(...liq)}`);
  const capped = liq.filter(v => v === LIQUIDITY_CAP).length;
  check('and the cap actually binds on this board', capped > 0, `${capped} of ${liq.length} at the cap`);

  /* The raw ratios really do run past it — otherwise the cap is decoration
     and this whole paragraph is describing a decision that does nothing. */
  const rawRatios = UNIVERSE.map(u => buildFundamentals(u.ticker)!.ratios.currentRatio);
  check('PREMISE: the underlying ratios exceed it', Math.max(...rawRatios) > LIQUIDITY_CAP, `max ${Math.max(...rawRatios).toFixed(2)}`);
}

/* Leverage is inverted, so LESS debt must score HIGHER. Stated because the
   sign is the one thing a reader cannot check from the bar. */
{
  const rows = UNIVERSE.map(u => ({
    t: u.ticker,
    de: buildFundamentals(u.ticker)!.ratios.debtToEquity,
    pct: qualityBreakdown(u.ticker)!.parts.find(p => p.field === 'leverage')!.pct,
  }));
  const least = rows.reduce((a, b) => (b.de < a.de ? b : a));
  const most = rows.reduce((a, b) => (b.de > a.de ? b : a));
  check('the least indebted name scores highest on leverage', least.pct > most.pct, `${least.t} ${least.pct.toFixed(0)} vs ${most.t} ${most.pct.toFixed(0)}`);
}

// ---- weights are declared, sum to one, and are described --------------------
const fields = Object.keys(QUALITY_WEIGHTS) as QualityField[];
check('five fields compose it', fields.length === 5);
check(
  'the weights sum to one',
  Math.abs(fields.reduce((a, f) => a + QUALITY_WEIGHTS[f], 0) - 1) < 1e-12
);
check(
  'profitability carries the majority, as the header claims',
  QUALITY_WEIGHTS.netMargin + QUALITY_WEIGHTS.roe + QUALITY_WEIGHTS.fcfMargin > 0.6
);
check('every field has words', fields.every(f => QUALITY_FIELD_WORDS[f].label && QUALITY_FIELD_WORDS[f].note.length > 20));
check('leverage says it is inverted', /invert/i.test(QUALITY_FIELD_WORDS.leverage.note));
check('liquidity says where the credit stops', QUALITY_FIELD_WORDS.liquidity.note.includes(String(LIQUIDITY_CAP)));

// ---- a name with no statements gets null, never a zero ----------------------
/*
  An ETF or an index has no filings at all. Zero there would read as the
  worst balance sheet on the board rather than as the absence of one — the
  exact confusion DataState's `empty` vs `unavailable` split exists to stop.
*/
check('an ETF has no quality score', qualityScore('SPY') === null);
check('nor does an unknown symbol', qualityScore('ZZZZ') === null);
check('and the breakdown is null too, not an empty shape', qualityBreakdown('SPY') === null);

// ---- the two modelled sleeves stop claiming a source ------------------------
const modelled = (Object.keys(SLEEVE_METHOD) as (keyof typeof SLEEVE_METHOD)[]).filter(k => !SLEEVE_METHOD[k].derived);
const derived = (Object.keys(SLEEVE_METHOD) as (keyof typeof SLEEVE_METHOD)[]).filter(k => SLEEVE_METHOD[k].derived);
check('two sleeves are computed', derived.length === 2, derived.join(', '));
check('and two are modelled', modelled.length === 2, modelled.join(', '));
check('quality is one of the computed ones now', SLEEVE_METHOD.quality.derived);
check('news is the other', SLEEVE_METHOD.news.derived);
check('every sleeve names its source', Object.values(SLEEVE_METHOD).every(m => m.source.length > 20));
check('and shows its working', Object.values(SLEEVE_METHOD).every(m => m.detail.length > 120));
check('the modelled ones say so in the source line', modelled.every(k => /simulator/i.test(SLEEVE_METHOD[k].source)));
check('and each explains what it would take to compute it', modelled.every(k => /seam|until|rather than/i.test(SLEEVE_METHOD[k].detail)));

/*
  THE NOTE THAT USED TO LIE. `SLEEVE_WINDOWS` asserted inputs for all four,
  which for momentum and flow described a computation that does not happen.
  A modelled sleeve's note must now carry the conditional tense.
*/
for (const k of modelled) {
  check(`${k}'s window note does not assert a computation`, /intended/i.test(SLEEVE_WINDOWS[k].note), SLEEVE_WINDOWS[k].note.slice(0, 60));
}
for (const k of derived) {
  check(`${k}'s note still states its window plainly`, !/intended/i.test(SLEEVE_WINDOWS[k].note));
}

// ---- and the board shows the difference without a hover ---------------------
{
  const page = readFileSync('src/pages/Stocks.tsx', 'utf8');
  check('a modelled bar is drawn differently from a computed one', /method\.derived[\s\S]{0,200}border-dashed/.test(page));
  check('the door is reachable from the header', /How the sleeves are scored/.test(page));
  check('and it labels each sleeve computed or modelled', /'computed' : 'modelled'/.test(page));
  check('and prints the quality weights rather than describing them', /QUALITY_WEIGHTS\[f\]/.test(page));
  check('and says a 50 is the middle of the board, not a grade', /middle of this universe rather than a grade/.test(page));
}

resetQualityTable();
check('the cached table can be dropped for a test', qualityScore(UNIVERSE[0].ticker) !== null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
