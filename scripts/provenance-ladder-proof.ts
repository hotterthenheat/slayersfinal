/*
  Acceptance test for P-1's provenance registry and P-2's expiry ladder.

  Both are honesty machinery as much as they are features: the registry is
  what stops a modelled number from LOOKING sourced, and the ladder is what
  stops a 0DTE artifact from looking like structure. So the assertions are
  about the claims each makes, not about the figures underneath.

  Proves:
  1. Every family reports something today, and the truthful thing: nothing
     is 'measured' while the terminal runs on the simulator
  2. The carry family answers from the SEAM, not from a copy — setting a
     real carry flips it to measured and a reset flips it back, with no
     second call into the registry
  3. weakest() really is the weakest link, in both orders, and an empty
     source list is modelled rather than measured
  4. The swap's one call works, and an unknown family is refused
  5. The ladder is rectangular — every row carries every column — and its
     rows are the profile's own window, descending
  6. Its cells agree with buildExposureProfile under the same lens, cell by
     cell: the ladder is a transpose, not a second opinion
  7. Dominance ignores the ALL aggregate (which would otherwise win every
     row and say nothing), and the share is a share of the dated lenses
  8. rowWords names the 0DTE case in the words that matter and never
     invents one for an empty row
*/
import Simulator from '../src/core/simulator';
import { buildExposureProfile } from '../src/data/exposure';
import { buildExpiryLadder, rowWords, CONCENTRATED, LADDER_COLUMNS, LADDER_EXPIRIES, type LadderRow } from '../src/data/expiryLadder';
import { getProvenance, resetProvenance, setProvenance, weakest, type ProvenanceKey } from '../src/data/provenance';
import { resetCarry, setCarry } from '../src/core/carry';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

const ALL_KEYS: ProvenanceKey[] = ['chain', 'exposure', 'tape', 'prints', 'candles', 'carry', 'earnings', 'macro'];

// ── 1. everything answers, and answers truthfully ─────────────────────────
{
  resetProvenance();
  resetCarry();
  check('every family reports a state and a sentence', ALL_KEYS.every(k => {
    const e = getProvenance(k);
    return ['measured', 'derived', 'modelled'].includes(e.kind) && e.note.length > 10;
  }));
  check(
    'and NOTHING claims to be measured while the simulator is the market',
    ALL_KEYS.every(k => getProvenance(k).kind !== 'measured'),
    ALL_KEYS.map(k => `${k}:${getProvenance(k).kind}`).join(' ')
  );
  check('the macro calendar is derived, not modelled — its dates are real rules', getProvenance('macro').kind === 'derived');
}

// ── 2. the carry family reads the seam itself ─────────────────────────────
{
  resetCarry();
  check('PREMISE: carry starts modelled', getProvenance('carry').kind === 'modelled');
  setCarry({ r: 0.0375, q: 0.0131 });
  check('a real carry makes the family measured, with no second call', getProvenance('carry').kind === 'measured');
  check('and the note carries the figures', /3\.75|0\.0375/.test(getProvenance('carry').note), getProvenance('carry').note);
  resetCarry();
  check('a reset puts it back to modelled', getProvenance('carry').kind === 'modelled');
}

// ── 3. weakest link ───────────────────────────────────────────────────────
{
  resetProvenance();
  setProvenance('exposure', { kind: 'measured', note: 'feed' });
  setProvenance('tape', { kind: 'derived', note: 'computed here' });
  check('a mixture reports its weakest part', weakest(['exposure', 'tape', 'chain']).kind === 'modelled');
  check('— and order does not matter', weakest(['chain', 'tape', 'exposure']).kind === 'modelled');
  check('derived beats modelled but loses to measured', weakest(['exposure', 'tape']).kind === 'derived');
  check('one measured family alone is measured', weakest(['exposure']).kind === 'measured');
  check('naming no source is modelled, not measured', weakest([]).kind === 'modelled');
  resetProvenance();
  check('and a reset restores the defaults', getProvenance('exposure').kind === 'modelled');
}

// ── 4. the swap's call ────────────────────────────────────────────────────
{
  check('the swap can set a family', setProvenance('chain', { kind: 'measured', note: 'UW chain' }) === true && getProvenance('chain').kind === 'measured');
  check('an unknown family is refused', setProvenance('nonsense' as ProvenanceKey, { kind: 'measured', note: 'x' }) === false);
  resetProvenance();
}

// ── 5+6. the ladder is a transpose, not a second opinion ──────────────────
{
  const snap = Simulator.snapshotFor('SPY');
  const ladder = buildExpiryLadder(snap, 10);
  check('PREMISE: the ladder has rows', ladder.rows.length > 0, `${ladder.rows.length} rows`);
  check('every row carries every column', ladder.rows.every(r => r.cells.length === LADDER_COLUMNS.length));
  check('rows descend by strike, like the profile', ladder.rows.every((r, i, a) => i === 0 || r.strike < a[i - 1].strike));

  /* Cell by cell against the profile each column is built from. */
  let mismatches = 0;
  for (const e of LADDER_COLUMNS) {
    const profile = buildExposureProfile(snap, e, 10);
    const byStrike = new Map(profile.strikes.map(s => [s.strike, s.gex.net]));
    for (const row of ladder.rows) {
      const cell = row.cells.find(c => c.expiry === e);
      if (!cell || Math.abs((byStrike.get(row.strike) ?? 0) - cell.netGex) > 1e-9) mismatches++;
    }
  }
  check('every cell equals the profile under its own lens', mismatches === 0, `${mismatches} mismatched`);
  check('the heat scale is the largest cell', ladder.maxAbs === Math.max(...ladder.rows.flatMap(r => r.cells.map(c => Math.abs(c.netGex)))));
  check('and the spot marker splits the rows', ladder.rows.some(r => r.aboveSpot) && ladder.rows.some(r => !r.aboveSpot));
}

// ── 7. dominance ignores the aggregate ────────────────────────────────────
{
  const snap = Simulator.snapshotFor('SPY');
  const ladder = buildExpiryLadder(snap, 10);
  check('no row is dominated by ALL — it is the aggregate, not a lens', ladder.rows.every(r => r.dominant !== 'ALL'));
  check('every dominant is a dated lens', ladder.rows.every(r => r.dominant === null || LADDER_EXPIRIES.includes(r.dominant)));
  /* The share is over the DATED lenses: recompute one row by hand. */
  const row = ladder.rows.find(r => r.dominant !== null)!;
  const dated = row.cells.filter(c => c.expiry !== 'ALL');
  const total = dated.reduce((a, c) => a + Math.abs(c.netGex), 0);
  const best = Math.max(...dated.map(c => Math.abs(c.netGex)));
  check('and the share is that lens over the dated total', Math.abs((row.dominantShare ?? 0) - best / total) < 1e-12, String(row.dominantShare));
  check('a share is a share — never above 1', ladder.rows.every(r => r.dominantShare === null || (r.dominantShare > 0 && r.dominantShare <= 1)));
}

// ── 8. the words ──────────────────────────────────────────────────────────
{
  const mk = (dominant: LadderRow['dominant'], share: number | null): LadderRow => ({
    strike: 500, cells: [], dominant, dominantShare: share, aboveSpot: true,
  });
  check('a concentrated 0DTE row says what that means for the level', /evaporates at the bell/.test(rowWords(mk('0DTE', 0.8))));
  check('exactly at the threshold counts as concentrated', /sits in OPEX/.test(rowWords(mk('OPEX', CONCENTRATED))));
  check('a spread row says spread, and names the leader', /spread across expiries — 1D leads with 40%/.test(rowWords(mk('1D', 0.4))));
  check('an empty row invents nothing', rowWords(mk(null, null)) === 'no gamma at this strike');
}

// ── the degenerate book ───────────────────────────────────────────────────
{
  const snap = { ...Simulator.snapshotFor('SPY'), chain: [] };
  const ladder = buildExpiryLadder(snap, 10);
  check('an empty chain yields an empty ladder, not a throw', ladder.rows.length === 0 && ladder.maxAbs === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
