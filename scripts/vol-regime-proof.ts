/*
  Acceptance test for Part 14's vol regime dashboard.

  "VIX term structure, realized vol, IV rank, variance risk premium,
   risk-reversal skew. Feeds Compass eligibility."

  Five figures were asked for and this desk can honestly produce four. The
  assertions below are in two halves, and the second half is the point:

    THE MATHS IS RIGHT — realized vol annualises correctly, the premium is
    implied minus realized and not something else, the risk reversal has
    the equity sign, and the verdict changes at the stated cuts.

    AND THE ABSENT FIGURE STAYS ABSENT. A 52-week IV rank cannot be
    computed from one implied level per tenor. The easiest way to "finish"
    this dashboard would be to rank today's IV against something and call
    it IV rank; these assertions make that impossible to do quietly.
*/
import { readFileSync } from 'node:fs';
import {
  IV_RANK_UNAVAILABLE,
  MIN_RETURNS,
  QUIET_RATIO,
  RR_DELTA,
  RV_WINDOWS,
  STRAINED_RATIO,
  VERDICT_WORDS,
  atmIv,
  buildVolRegime,
  dailyCloses,
  realizedVol,
  regimeAllows,
  regimeGateNote,
  riskReversal,
  termSlope,
  verdictFor,
  type RegimeVerdict,
} from '../src/data/volRegime';
import Simulator from '../src/core/simulator';
import { TRADING_DAYS } from '../src/core/higherGreeks';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

const rows = buildVolRegime('SPY', 30);
check('PREMISE: the whole roster is read', rows.length >= 20, `${rows.length} names`);

// ---- realized vol is a measurement, not a model -----------------------------
const seeded = rows.filter(r => r.rv[20] !== null);
check('some names carry enough history to measure', seeded.length >= 3, `${seeded.length} of ${rows.length}`);
check('and most do not — that is the ordinary case here', rows.length - seeded.length > seeded.length);

/* Annualisation, checked against a series whose vol is known exactly.
   A constant daily return has zero variance; a two-state alternating
   series has a variance we can write down. */
{
  const closes = dailyCloses('SPY');
  check('daily closes come out of the intraday bars', closes.length >= 15, `${closes.length} sessions`);
  check('and they are all real prices', closes.every(c => c > 0));

  /* The recomputation, done here from scratch, must land on the same number
     the module produces — otherwise the module is doing something else. */
  const rets: number[] = [];
  for (let i = 1; i < closes.length; i++) rets.push(Math.log(closes[i] / closes[i - 1]));
  const w = rets.slice(-20);
  const m = w.reduce((a, b) => a + b, 0) / w.length;
  const mine = Math.sqrt((w.reduce((a, b) => a + (b - m) ** 2, 0) / (w.length - 1)) * TRADING_DAYS);
  const theirs = realizedVol('SPY', 20)!;
  check('realized vol matches an independent recomputation', Math.abs(mine - theirs) < 1e-12, `${mine.toFixed(9)} vs ${theirs.toFixed(9)}`);
  check('and it annualises on the desk year, not 365', Math.abs(mine / theirs - 1) < 1e-12 && TRADING_DAYS === 252);
}

/* A name with no bars must return null, not zero. Zero realized vol is a
   claim about a market that never moved; null is the absence of a reading,
   and the difference decides whether the premium tile prints +16% or a dash. */
const unseeded = rows.find(r => r.rv[20] === null);
check('an unmeasured name reads null, never zero', unseeded !== undefined && unseeded.rv[20] === null);
check('and its premium is null too, not the implied level', unseeded !== undefined && unseeded.premium === null);
check('a name the desk has never heard of returns null', realizedVol('ZZZZ', 20) === null);
check('the short-window floor is stated and enforced', MIN_RETURNS >= 10);

// ---- the premium is what it says it is --------------------------------------
for (const r of seeded) {
  check(
    `${r.ticker}: premium is implied minus realized, exactly`,
    Math.abs(r.premium! - (r.iv - r.rv[20]!)) < 1e-12
  );
}
check('every measurable premium is positive on this engine', seeded.every(r => r.premium! > 0), seeded.map(r => `${r.ticker} ${(r.premium! * 100).toFixed(1)}`).join(' '));

// ---- the risk reversal has the equity sign, and it is not a constant --------
check('every name prices the put wing over the call wing', rows.every(r => r.rr > 0));
const norm = rows.map(r => r.rr / r.iv);
check(
  'and normalised by ATM it still varies across names',
  Math.max(...norm) / Math.min(...norm) > 2,
  `${Math.min(...norm).toFixed(4)}..${Math.max(...norm).toFixed(4)}`
);
check('the read delta is the market convention', RR_DELTA === 0.25);

/* The wing gap must WIDEN as tenor shortens — that is the whole reason a
   near-dated wing looks expensive, and it is the behaviour a skew read is
   for. Checked on one name across three tenors. */
{
  const q = Simulator.universeQuotes('SPY').find(x => x.ticker === 'SPY')!;
  const near = riskReversal(q.price, q.iv, 7);
  const mid = riskReversal(q.price, q.iv, 30);
  const far = riskReversal(q.price, q.iv, 60);
  check('the skew steepens into the front end', near > mid && mid > far, `${(near * 100).toFixed(2)} > ${(mid * 100).toFixed(2)} > ${(far * 100).toFixed(2)}`);
}

// ---- the term slope is true and deliberately mute ---------------------------
{
  const slopes = rows.map(r => r.slope);
  const spread = Math.max(...slopes) - Math.min(...slopes);
  check(
    'the term slope is the SAME on every name — the reason it does not vote',
    spread < 1e-9,
    `spread ${spread.toExponential(2)}`
  );
  check('and it is front-over-back, so above one', slopes.every(s => s > 1));
  const src = readFileSync('src/pages/pinpoint/VolRegime.tsx', 'utf8');
  check('the page says so rather than drawing a regime chip from it', /decoration rather than a read/.test(src));
  /* The words appear in the paragraph EXPLAINING why there is no verdict,
     so searching for them finds my own prose. What actually distinguishes a
     verdict from a read-out is a THRESHOLD: a contango chip has to compare
     the slope to something. Nothing does. */
  check('nothing compares the slope to a threshold', !/slope\s*[<>]|slope\s*[!=]==/.test(src));
  check('and no chip is built from it', !/SignalBadge[^>]*slope/.test(src));
}

// ---- IV rank: absent, and loudly ---------------------------------------------
check('the missing rank has a stated reason', IV_RANK_UNAVAILABLE.length > 120);
check('which names what is actually missing', /implied/i.test(IV_RANK_UNAVAILABLE) && /52/.test(IV_RANK_UNAVAILABLE));
{
  const src = readFileSync('src/pages/pinpoint/VolRegime.tsx', 'utf8');
  check('the page renders it as unavailable, not empty', /kind="unavailable"/.test(src));
  check('and the substitute is labelled across the roster, not across time', /of the roster today/.test(src));
  check('the words "IV rank" are never attached to the percentile', !/IV rank[^<]*\{me\.crossSectionalIvPct/.test(src));
}
/* The cross-sectional percentile spans its full range, which is what makes
   it a percentile rather than a decoration: something is at the bottom and
   something is at the top. */
{
  const ps = rows.map(r => r.crossSectionalIvPct);
  check('the roster percentile reaches 0', Math.min(...ps) === 0);
  check('and reaches 100', Math.max(...ps) === 100);
  const richest = rows.reduce((a, b) => (b.iv > a.iv ? b : a));
  check('and the richest name is the one at 100', richest.crossSectionalIvPct === 100, richest.ticker);
}

// ---- the verdict, driven at every branch ------------------------------------
/* The live engine reads 'ordinary' everywhere it can read at all, which the
   module's header states as a measured finding rather than fixing. That is
   exactly why the branches are exercised here with chosen inputs: code no
   demo can reach is code no demo can check. */
check('a market realising everything it is charged for is strained', verdictFor(0.20, 0.20) === 'strained');
check('and so is one realising more', verdictFor(0.20, 0.30) === 'strained');
check('a fat premium is quiet', verdictFor(0.20, 0.05) === 'quiet');
check('the ordinary band sits between them', verdictFor(0.20, 0.20 * (1 - (STRAINED_RATIO + QUIET_RATIO) / 2)) === 'ordinary');
check('no realized reading is no verdict', verdictFor(0.20, null) === 'unknown');
check('and a nonsense implied is no verdict either', verdictFor(0, 0.1) === 'unknown');
/* THE CUTS, APPROACHED FROM BOTH SIDES. Written first as an equality at the
   boundary and it failed — 1 − 0.15 is 0.85, and (1 − 0.85)/1 comes back as
   0.15000000000000002, a hair OVER the cut. That is not a bug in the
   verdict; it is what asserting on a float boundary is worth. What matters
   to a reader is that the bands are ordered and that crossing a cut changes
   the answer, so that is what is asserted. */
const eps = 1e-6;
check('just inside the strained cut is strained', verdictFor(1, 1 - STRAINED_RATIO + eps) === 'strained');
check('just outside it is ordinary', verdictFor(1, 1 - STRAINED_RATIO - eps) === 'ordinary');
check('just inside the quiet cut is quiet', verdictFor(1, 1 - QUIET_RATIO - eps) === 'quiet');
check('just outside it is ordinary', verdictFor(1, 1 - QUIET_RATIO + eps) === 'ordinary');
check('and the two cuts are the right way round', STRAINED_RATIO < QUIET_RATIO);
check('the live board is ordinary wherever it can read', seeded.every(r => r.verdict === 'ordinary'));
check('and says so in the module rather than tuning to fix it', /ordinary' EVERYWHERE IT CAN BE/.test(readFileSync('src/data/volRegime.ts', 'utf8')));

const VERDICTS: RegimeVerdict[] = ['quiet', 'ordinary', 'strained', 'unknown'];
check('every verdict has words', VERDICTS.every(v => VERDICT_WORDS[v].label && VERDICT_WORDS[v].note.length > 40));
check('and no two share a label', new Set(VERDICTS.map(v => VERDICT_WORDS[v].label)).size === 4);

// ---- the Compass gate is narrow, on purpose ---------------------------------
check('a strained tape holds setups back', !regimeAllows('strained'));
check('a quiet one does not', regimeAllows('quiet'));
check('an ordinary one does not', regimeAllows('ordinary'));
check('AND A MISSING MEASUREMENT DOES NOT', regimeAllows('unknown'));
check('the gate explains itself in every state', VERDICTS.every(v => regimeGateNote(v).length > 30));
check('and the unknown note says absence is not a refusal', /not a reason to refuse/i.test(regimeGateNote('unknown')));

// ---- windows and tenors are coherent ----------------------------------------
check('three realized windows are offered', RV_WINDOWS.length === 3);
check('and they ascend', RV_WINDOWS.every((w, i) => i === 0 || w > RV_WINDOWS[i - 1]));
{
  const q = Simulator.universeQuotes('SPY').find(x => x.ticker === 'SPY')!;
  check('implied falls with tenor — the front-end lift', atmIv(q.price, q.iv, 1) > atmIv(q.price, q.iv, 30));
  check('and keeps falling', atmIv(q.price, q.iv, 30) > atmIv(q.price, q.iv, 60));
  check('the slope is that ratio and nothing else', Math.abs(termSlope(q.price, q.iv) - atmIv(q.price, q.iv, 1) / atmIv(q.price, q.iv, 60)) < 1e-12);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
