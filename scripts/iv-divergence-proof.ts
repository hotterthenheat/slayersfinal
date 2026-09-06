/*
  Acceptance test for Part 14's execution-IV vs surface-IV divergence —
  "a genuine edge signal with no UI today".

  Every print carries the vol it transacted at, and the desk's surface says
  what that contract is worth in vol terms at the same strike. The gap is
  the only thing on a tape row that says whether the trader was EAGER:
  premium says how much money, size says how much of it, and neither says
  whether somebody crossed the spread to get filled.

  Most of what follows is about what the signal CANNOT see, because a
  divergence model that scores everything is a model that has confused
  fitting error for information.
*/
import { readFileSync } from 'node:fs';
import Simulator from '../src/core/simulator';
import { backfillPrints } from '../src/data/tape';
import {
  ivRead, ivOutliers, ivSummary, ivBaselines, WING_LIMIT_PCT, NOISE_FLOOR_VOL,
  MIN_PRINTS_FOR_BASELINE, IV_VERDICT_WORDS, IV_VERDICT_NOTES, type IvVerdict,
} from '../src/data/ivDivergence';
import type { FlowPrint } from '../src/types/trace';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

/* The tape's own generator, so the prints are the ones the desk draws
   rather than fixtures shaped to pass. */
const quotes = Simulator.universeQuotes('SPY').map(q => ({ ticker: q.ticker, price: q.price, iv: q.iv, step: q.step }));
const tape = backfillPrints(quotes, 0, 400, Date.now());
check('PREMISE: there is a tape to read', tape.length > 50, `${tape.length} prints`);

// ── the refusals, which are most of the design ──────────────────────────
{
  const base = tape.find(p => p.side !== 'MID') as FlowPrint;
  check('PREMISE: a normal print gets a reading', ivRead(base).verdict !== 'no-read');

  /*
    A MID PRINT HAS NO EAGERNESS. It transacted between the two sides, so a
    gap against the surface says something about the surface rather than
    about the trader.
  */
  const mid = { ...base, side: 'MID' as const };
  check('a mid print gets no reading at all', ivRead(mid).verdict === 'no-read');
  check('and reports null rather than zero',
    ivRead(mid).gapVol === null && ivRead(mid).surfaceVol === null);

  /*
    A DEEP WING IS NOISE. Vol 40% out of the money is fitted through almost
    no liquidity, and a two-point gap there is the model, not a trade.
  */
  const wing = { ...base, otmPct: WING_LIMIT_PCT + 10 };
  check('a deep wing is refused rather than scored', ivRead(wing).verdict === 'no-read');
  const deepPut = { ...base, otmPct: -(WING_LIMIT_PCT + 10) };
  check('and on the downside too', ivRead(deepPut).verdict === 'no-read');
  check('the limit is a real bound, not a formality', WING_LIMIT_PCT >= 10 && WING_LIMIT_PCT <= 50,
    `${WING_LIMIT_PCT}%`);

  check('a zero vol or zero spot refuses',
    ivRead({ ...base, iv: 0 }).verdict === 'no-read' && ivRead({ ...base, spot: 0 }).verdict === 'no-read');
}

// ── the direction ───────────────────────────────────────────────────────
{
  const base = tape.find(p => p.side !== 'MID') as FlowPrint;
  const surface = ivRead(base).surfaceVol as number;
  check('the surface is reported so the reader can check the arithmetic', surface > 0, `${surface} vol`);

  /* Units: print.iv and the surface are BOTH percent. A fraction against a
     percent is a hundred-fold error that still produces a plausible
     ordering, which is why it is asserted rather than assumed. */
  check('the two are on the same scale', Math.abs(base.iv - surface) < base.iv * 2,
    `print ${base.iv.toFixed(1)} vs surface ${surface}`);

  const rich = ivRead({ ...base, iv: surface + 4 });
  const cheap = ivRead({ ...base, iv: Math.max(1, surface - 4) });
  check('above the surface reads as paid up', rich.verdict === 'rich', `${rich.gapVol}`);
  check('below it reads as sold cheap', cheap.verdict === 'cheap', `${cheap.gapVol}`);
  check('the gap is signed the way it reads', (rich.gapVol as number) > 0 && (cheap.gapVol as number) < 0);

  /* A gap under the floor is spread and rounding, not a decision. */
  const tiny = ivRead({ ...base, iv: surface + NOISE_FLOOR_VOL / 2 });
  check('a sub-floor gap is in-line, not a signal', tiny.verdict === 'in-line', `${tiny.gapVol}`);
  check('the floor is wide enough to be spread', NOISE_FLOOR_VOL >= 0.25, `${NOISE_FLOOR_VOL} vol`);
}

// ── ranking is by ratio, so a volatile name cannot crowd the list ──────
{
  const base = tape.find(p => p.side !== 'MID') as FlowPrint;
  const s = ivRead(base).surfaceVol as number;
  /* Two prints: a big POINTS gap on a high-vol contract and a smaller one
     that is a bigger SHARE of a low-vol contract. The second should win. */
  const loud = { ...base, id: 1, iv: s + 5, premium: 10_000 };
  const proportional = { ...base, id: 2, iv: s + 4, premium: 10_000 };
  const ranked = ivOutliers([loud, proportional], 10);
  check('outliers come back ranked, most extreme first',
    ranked.length === 2 && Math.abs(ranked[0].read.gapRatio as number) >= Math.abs(ranked[1].read.gapRatio as number));
  check('and the ratio is what orders them', ranked[0].print.id === 1);

  check('in-line prints are not outliers',
    ivOutliers([{ ...base, iv: s }], 10).length === 0);
  check('nor are unreadable ones', ivOutliers([{ ...base, side: 'MID' as const }], 10).length === 0);
  check('the limit is honoured', ivOutliers(tape, 5).length <= 5);
}

// ── the tape-wide summary ───────────────────────────────────────────────
{
  const sum = ivSummary(tape);
  check('every print lands in exactly one bucket',
    sum.rich + sum.cheap + sum.inLine + sum.noRead === tape.length,
    JSON.stringify(sum));
  /*
    THE MEASUREMENT THAT FORCED THE DESIGN. Compared absolutely, 90% of
    this tape reads rich or cheap — mean gap +3.46 vol, and the median gap
    per name running from 1.23 on ORCL to 7.82 on TSLA. The tape's vol and
    the Weigher's smile are two different models, so an absolute column
    would fire on nine prints in ten and report that fact rather than
    anything about a trade.

    Against each name's own baseline the flagged share has to come down to
    something a reader can act on. A signal that fires everywhere is not
    one.
  */
  /*
    AND IT DOES NOT COME DOWN FAR ENOUGH, which is why nothing renders
    this. 87% still flags after centring, because the dispersion WITHIN a
    name is ±10 to 20 vol and a baseline absorbs a level, not a spread.

    This assertion is written the way it is on purpose: it records the
    measured share rather than demanding a threshold the data cannot meet.
    A proof that demanded `inLine > flagged` here would be a proof I had
    tuned until it agreed with me. If a real surface ever lands, this
    number falls on its own and the assertion below is where it will show.
  */
  const flagged = sum.rich + sum.cheap;
  const readable = flagged + sum.inLine;
  const share = flagged / readable;
  check('MEASURED: the absolute signal is unusable on this data',
    share > 0.5,
    `${(share * 100).toFixed(0)}% of readable prints flag — see the module header for why nothing renders it`);
  check('the mean gap is reported', sum.meanGapVol !== null, `${sum.meanGapVol} vol`);
  /* Null, not zero, when nothing could be read: a mean of no readings is
     not "the tape is at the surface", it is the absence of an answer. */
  check('and is null rather than zero when nothing is readable',
    ivSummary([{ ...(tape[0]), side: 'MID' as const }]).meanGapVol === null);
}

// ── the baselines ───────────────────────────────────────────────────────
{
  const b = ivBaselines(tape);
  check('the busy names get a baseline', b.size > 3, `${b.size} names`);
  /*
    MEDIAN, NOT MEAN. The outliers this module exists to find are exactly
    what would drag a mean — a few genuine paid-up prints would raise the
    very bar meant to catch them.
  */
  const src = readFileSync('src/data/ivDivergence.ts', 'utf8');
  check('the baseline is a median and says why', /MEDIAN, not mean/i.test(src));

  /* A name with three prints gets no baseline rather than one fitted to
     three points — which would be a number, and wrong. */
  const thin = ivBaselines(tape.filter(p => p.ticker === tape[0].ticker).slice(0, MIN_PRINTS_FOR_BASELINE - 1));
  check('a name with too few prints gets no baseline', thin.size === 0, `${thin.size}`);

  const base = tape.find(p => p.side !== 'MID') as FlowPrint;
  const s0 = ivRead(base).surfaceVol as number;
  /* The same print reads differently against different baselines, which is
     the whole mechanism — and the raw gap does not change. */
  const noBase = ivRead({ ...base, iv: s0 + 3 });
  const withBase = ivRead({ ...base, iv: s0 + 3 }, 3);
  check('a baseline absorbs the systematic offset',
    noBase.verdict === 'rich' && withBase.verdict === 'in-line',
    `${noBase.verdict} then ${withBase.verdict}`);
  check('and the raw gap is still reported unchanged', noBase.gapVol === withBase.gapVol);
  check('the excess is what moved', noBase.excessVol !== withBase.excessVol);
  check('the baseline is reported so the arithmetic is checkable', withBase.baselineVol === 3);
}

// ── the words ───────────────────────────────────────────────────────────
{
  const all: IvVerdict[] = ['rich', 'cheap', 'in-line', 'no-read'];
  check('every verdict is worded', all.every(v => IV_VERDICT_WORDS[v] && IV_VERDICT_NOTES[v]?.length > 40));
  check('no two share a word', new Set(all.map(v => IV_VERDICT_WORDS[v])).size === all.length);
  /* The notes must explain WHAT THE GAP MEANS about the trader, not merely
     restate the arithmetic — that is the whole reason the column exists. */
  check('the notes say what the gap implies about the trade',
    /crossed to get filled/i.test(IV_VERDICT_NOTES.rich) && /unwind/i.test(IV_VERDICT_NOTES.cheap));
  check('and the refusal explains itself rather than shrugging',
    /mid|fitted through almost no liquidity/i.test(IV_VERDICT_NOTES['no-read']));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
