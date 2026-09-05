/*
  Acceptance test for 1.9 and 5.2 — the two places this desk ranks things
  with numbers it did not fit.

  THE SHARED FAILURE. A ranked list with a score, a factor bar and a
  confident sentence underneath reads exactly like the output of a fitted
  model, and a reader extends it the trust a fitted model earns. When the
  numbers behind it are hand-set constants, or when the thesis behind a
  lens has not been written at all, nothing on screen says so — and there
  is no way for the reader to find out.

  Both are fixed by disclosure rather than by removal, because both are
  live product that people may be using. What the assertions below hold is
  that the disclosure is TRUE — tied to the spec and to the code, not to a
  hardcoded list that can drift away from either.
*/
import { readFileSync, existsSync } from 'node:fs';
import {
  SCANNERS, SCANNER_SPECIFIED, METHODOLOGY_PENDING_NOTE, type ScannerKey,
} from '../src/types/compass';
import { WEIGHTS_ARE_FITTED, WEIGHTS_NOTE, RANK_WEIGHTS, RANK_FACTORS } from '../src/data/rankedtargets';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

// ── 1.9 · the unspecified lenses, against the spec itself ───────────────
{
  const SPEC = 'docs/compass-backtest-spec.md';
  check('the backtest spec is where it is expected to be', existsSync(SPEC));
  const spec = readFileSync(SPEC, 'utf8');

  /*
    THE FLAG IS CHECKED AGAINST THE DOCUMENT, not against my memory of it.
    The spec marks a lens "NOT SPECIFIED" in a table row; anything flagged
    here has to be flagged there and vice versa, so the two cannot drift.
  */
  const notSpecified = new Set<string>();
  for (const line of spec.split('\n')) {
    const m = line.match(/^\|\s*`([a-z-]+)`\s*\|/);
    if (m && /NOT SPECIFIED/i.test(line)) notSpecified.add(m[1]);
  }
  check('the spec really does mark some lenses unspecified', notSpecified.size > 0,
    [...notSpecified].join(', '));

  const flagged = SCANNERS.filter(s => !SCANNER_SPECIFIED[s.key]).map(s => s.key);
  const missing = [...notSpecified].filter(k => SCANNER_SPECIFIED[k as ScannerKey] !== false);
  const extra = flagged.filter(k => !notSpecified.has(k));
  check('every lens the spec calls unspecified is flagged in the product',
    missing.length === 0, missing.length ? `not flagged: ${missing.join(', ')}` : `${flagged.length} flagged`);
  check('and nothing is flagged that the spec does specify',
    extra.length === 0, extra.length ? `wrongly flagged: ${extra.join(', ')}` : 'none');

  check('the majority of lenses ARE specified — this is a gap, not the norm',
    SCANNERS.filter(s => SCANNER_SPECIFIED[s.key]).length > flagged.length,
    `${SCANNERS.length - flagged.length} of ${SCANNERS.length}`);
  check('every scanner has a verdict either way',
    SCANNERS.every(s => typeof SCANNER_SPECIFIED[s.key] === 'boolean'));

  /* The note has to say what is missing — a thesis — rather than hedge. */
  check('the pending note names what is absent',
    /thesis/i.test(METHODOLOGY_PENDING_NOTE) && /not specified/i.test(METHODOLOGY_PENDING_NOTE));
  check('and tells the reader what to do instead of trusting the rank',
    /read the contract/i.test(METHODOLOGY_PENDING_NOTE));

  // The surface must actually consult the flag.
  const page = readFileSync('src/pages/Compass.tsx', 'utf8');
  check('the Compass board reads the flag rather than hardcoding a list',
    /SCANNER_SPECIFIED\[/.test(page) && !/quick-scalp'\s*\|\|/.test(page));
  check('and shows the pending note', page.includes('METHODOLOGY_PENDING_NOTE'));
}

// ── 5.2 · the hand-set weights ───────────────────────────────────────────
{
  check('the weights are declared unfitted', WEIGHTS_ARE_FITTED === false);
  check('the note says hand-set, not merely "default"',
    /hand-set/i.test(WEIGHTS_NOTE) && /not fitted/i.test(WEIGHTS_NOTE));
  /*
    AND IT SAYS WHY THERE IS NO FIT. "Uncalibrated" alone reads as an
    oversight somebody will get around to; the real reason is that nothing
    on this desk has a labelled record of targets reached and missed, so
    there is no objective to fit against at all.
  */
  check('and why no fit is possible', /labelled|labeled|objective/i.test(WEIGHTS_NOTE));

  const sum = RANK_FACTORS.reduce((a, k) => a + RANK_WEIGHTS[k], 0);
  check('the weights still sum to 1', Math.abs(sum - 1) < 1e-9, String(sum));
  check('every factor carries one', RANK_FACTORS.every(k => RANK_WEIGHTS[k] > 0));

  const page = readFileSync('src/pages/pinpoint/RankedTargets.tsx', 'utf8');
  check('the page renders the chip from the flag, not a literal',
    page.includes('WEIGHTS_ARE_FITTED') && page.includes('WEIGHTS_NOTE'));
  /* If the weights are ever genuinely fitted, the chip must change with
     them rather than needing a second edit somewhere else. */
  check('the chip text is derived, so it cannot be left stale',
    /WEIGHTS_ARE_FITTED \? 'fitted' : 'default'/.test(page));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
