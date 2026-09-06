/*
  Acceptance test for 6.8 — a reconstructed structure is never confirmed.

  The Multi-Leg page names a shape, draws its payoff and prints a max loss.
  That is the strongest way a UI can say "this is a fact", and the fact is
  actually an inference: no exchange publishes "a butterfly traded", so the
  row is a grouping of prints that arrived together. The rule the checklist
  sets is absolute — never present a matched structure as confirmed — and
  the assertions below hold the code to it as a property of the type rather
  than as a discipline somebody has to remember.
*/
import {
  matchScore, matchConfidence, matchCaveats, tradeMatch,
  MATCH_WORDS, MATCH_NOTES, RECONSTRUCTION_NOTE,
} from '../src/data/legMatch';
import type { SpreadLeg } from '../src/data/flowBook';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

const leg = (o: Partial<SpreadLeg> = {}): SpreadLeg => ({
  side: 'BUY', ratio: 1, strike: 100, right: 'C', expiry: '01/16/2027', dte: 30, fill: 2.5, ...o,
});

// ── THE RULE: nothing reaches "confirmed" ────────────────────────────────
{
  /*
    Swept over the whole range the score can take, at fine resolution — the
    top band has to be "likely" at EVERY value, including 1. A fourth word
    above it is the failure this exists to prevent, and it would arrive as a
    threshold edit rather than as a deliberate decision.
  */
  const words = new Set<string>();
  for (let s = 0; s <= 1.0001; s += 0.001) words.add(matchConfidence(Math.min(1, s)));
  check('the score maps to exactly three words, at every value',
    words.size === 3, [...words].join(', '));
  check('the strongest word is "likely", never confirmed',
    matchConfidence(1) === 'likely' && MATCH_WORDS.likely === 'likely match',
    MATCH_WORDS[matchConfidence(1)]);
  const allCopy = [...Object.values(MATCH_WORDS), ...Object.values(MATCH_NOTES), RECONSTRUCTION_NOTE].join(' ').toLowerCase();
  check('the word "confirmed" appears nowhere in the copy except to deny it',
    !/\bconfirmed\b(?!\.)/.test(allCopy.replace('never a confirmation', '')),
    allCopy.includes('confirmed') ? 'present' : 'absent');
  check('the page-level note says the structures are reconstructed',
    /reconstruct/i.test(RECONSTRUCTION_NOTE) && /never a confirmation/i.test(RECONSTRUCTION_NOTE));
}

// ── the score orders the way a real reconstructor would ─────────────────
{
  const clean2 = [leg({ strike: 100 }), leg({ strike: 110, side: 'SELL' })];
  const clean4 = [
    leg({ strike: 95 }), leg({ strike: 100, side: 'SELL' }),
    leg({ strike: 105, side: 'SELL' }), leg({ strike: 110 }),
  ];
  check('four legs beat two — the coincidence gets much less likely',
    matchScore(clean4) > matchScore(clean2),
    `${matchScore(clean4).toFixed(2)} vs ${matchScore(clean2).toFixed(2)}`);

  const calendar = [leg({ expiry: '01/16/2027' }), leg({ expiry: '02/19/2027', side: 'SELL' })];
  check('a split expiry scores below the same trade in one expiry',
    matchScore(calendar) < matchScore(clean2),
    `${matchScore(calendar).toFixed(2)} vs ${matchScore(clean2).toFixed(2)}`);

  const ratio = [leg({ ratio: 1 }), leg({ ratio: 2, side: 'SELL' })];
  check('an uneven ratio scores below an even one',
    matchScore(ratio) < matchScore(clean2),
    `${matchScore(ratio).toFixed(2)} vs ${matchScore(clean2).toFixed(2)}`);

  const mismatched = [leg({ fill: 1 }), leg({ fill: 9, side: 'SELL' })];
  check('legs whose sizes disagree score below legs that agree',
    matchScore(mismatched) < matchScore(clean2),
    `${matchScore(mismatched).toFixed(2)} vs ${matchScore(clean2).toFixed(2)}`);

  /*
    THE FOUR-LEG CONDOR IS THE ONE THE PAGE IS MOST ENTITLED TO NAME, and
    the two-leg calendar the least. If the ordering ever inverted, the badge
    would be reassuring the reader in precisely the wrong place.
  */
  check('the cleanest four-leg outranks the messiest two-leg by a full band',
    matchConfidence(matchScore(clean4)) === 'likely' &&
    matchConfidence(matchScore([leg({ expiry: 'a', ratio: 1, fill: 1 }), leg({ expiry: 'b', ratio: 3, fill: 9 })])) === 'uncertain');
}

// ── refusals and edges ───────────────────────────────────────────────────
{
  check('a single leg is not a structure', matchScore([leg()]) === 0 && matchScore([]) === 0);
  check('the score stays inside 0..1 for every shape tried',
    [[], [leg()], clean(2), clean(4), clean(8)].every(l => {
      const v = matchScore(l);
      return v >= 0 && v <= 1 && Number.isFinite(v);
    }));
  function clean(n: number): SpreadLeg[] {
    return Array.from({ length: n }, (_, i) => leg({ strike: 100 + i * 5, side: i % 2 ? 'SELL' : 'BUY' }));
  }
  check('a zero-size leg does not divide by zero',
    Number.isFinite(matchScore([leg({ fill: 0 }), leg({ fill: 0 })])));

  /*
    A WEAK BADGE HAS TO BE ACTIONABLE. "Uncertain" with no reason teaches
    the reader nothing and gets ignored; the caveats name what is working
    against the match in the terms the row already shows.
  */
  check('two legs always carry the two-leg caveat',
    matchCaveats(clean(2)).some(c => /two legs/i.test(c)));
  check('a split expiry says so', matchCaveats([leg({ expiry: 'a' }), leg({ expiry: 'b' })]).some(c => /expiry/i.test(c)));
  check('an uneven ratio says so', matchCaveats([leg({ ratio: 1 }), leg({ ratio: 2 })]).some(c => /ratio/i.test(c)));
  check('a clean four-leg has nothing held against it', matchCaveats(clean(4)).length === 0,
    matchCaveats(clean(4)).join('; '));

  check('tradeMatch agrees with the pieces it is built from',
    tradeMatch({ legs: clean(4) }).level === matchConfidence(matchScore(clean(4))));
}

// ── the score is a function of the legs, and nothing else ───────────────
{
  /*
    Determinism matters here more than usual: the badge sits beside a max
    loss a reader may act on, and a confidence that flickered between
    renders would be worse than no confidence at all.
  */
  const l = [leg({ strike: 95 }), leg({ strike: 105, side: 'SELL' })];
  const first = matchScore(l);
  let stable = true;
  for (let i = 0; i < 200; i++) if (matchScore(l) !== first) { stable = false; break; }
  check('the same legs always score the same', stable, String(first));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
