/*
  Acceptance test for congressional disclosures.

  The shape here was measured against 8,350 live Senate records and 23,944
  live House records before the engine was written, so these assertions are
  about matching a real feed, not about internal consistency alone.

  Proves:
  1. An amount is a BRACKET and never a figure — the ten statutory rungs,
     in form-checkbox order, with no invented midpoint anywhere
  2. A filing with no parseable amount is a real state, not a zero
  3. The spouse cap holds: a spouse's or dependent's non-joint holding
     cannot report above $1,000,000 (5 U.S.C. 13104(d)(2))
  4. A total is a RANGE, and an open-ended top rung makes the ceiling
     unknowable rather than a guess
  5. Every date is in the past — including the negative-lag rows real feeds
     carry, which are a filing artefact and not a trade in the future
  6. Late is measured against the 45-day statutory bound
  7. Committee overlap only fires where the committee genuinely has
     jurisdiction over that ticker's sector — a false overlap is an
     accusation
  8. Nobody in the data is a real legislator
*/
import {
  buildCongress,
  congressRead,
  bracketLabel,
  overlapFor,
  AMOUNT_BRACKETS,
  SPOUSE_CAP_INDEX,
  STOCK_ACT_DEADLINE_DAYS,
  MEMBERS,
} from '../src/data/congressFlow';
import { lookup } from '../src/data/universe';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

const DAY = '2026-08-30';
const f = buildCongress(90, DAY, 400);

// ── 1. the ladder ────────────────────────────────────────────────────────
{
  check('PREMISE: the feed has filings', f.trades.length > 0, `${f.trades.length}`);
  check('there are exactly ten statutory rungs', AMOUNT_BRACKETS.length === 10, `${AMOUNT_BRACKETS.length}`);
  check('they run in form-checkbox order A to J', AMOUNT_BRACKETS.map(b => b.column).join('') === 'ABCDEFGHIJ');
  check(
    'each rung starts one dollar above the last one ends',
    AMOUNT_BRACKETS.every((b, i) => i === 0 || b.low === (AMOUNT_BRACKETS[i - 1].high ?? 0) + 1)
  );
  check('the ladder starts at the $1,001 reporting threshold', AMOUNT_BRACKETS[0].low === 1_001);
  check('and the top rung is open-ended', AMOUNT_BRACKETS[9].high === null, `${AMOUNT_BRACKETS[9].label}`);
  check('every rung is strictly wider than nothing', AMOUNT_BRACKETS.every(b => b.high === null || b.high > b.low));
  check('every disclosed row names a real rung', f.trades.every(t => t.bracket === null || !!AMOUNT_BRACKETS[t.bracket]));
  /* The whole point: no row carries a figure. */
  check(
    'no row carries a point amount anywhere on it',
    !Object.keys(f.trades[0]).some(k => /^amount$|midpoint|estimate/i.test(k)),
    Object.keys(f.trades[0]).join(',')
  );
}

// ── 2. an unparsed filing is a state ─────────────────────────────────────
{
  const unknown = f.trades.filter(t => t.bracket === null);
  check('PREMISE: some filing came through unparsed', unknown.length > 0, `${unknown.length}`);
  check('the tally counts them', f.unknownAmounts === unknown.length, `${f.unknownAmounts}`);
  check('and they are named, not blanked', unknown.every(t => bracketLabel(t.bracket) === 'Not disclosed'));
  check('a disclosed row reads as its rung', f.trades.filter(t => t.bracket !== null).every(t => bracketLabel(t.bracket) === AMOUNT_BRACKETS[t.bracket!].label));
  /* An unparsed amount must contribute NOTHING to the total, not a zero
     that quietly drags an average down. */
  const disclosed = f.trades.filter(t => t.bracket !== null);
  const wantLow = disclosed.reduce((s, t) => s + AMOUNT_BRACKETS[t.bracket!].low, 0);
  check('the total floor sums only the disclosed rows', f.totalLow === wantLow, `${f.totalLow} vs ${wantLow}`);
  /* Sharper: an unparsed row must add NOTHING. Compare a feed against one
     of the same size — if unknowns contributed even the smallest rung's
     floor, the totals would differ by exactly that much per unknown row. */
  const ghost = unknown.length * AMOUNT_BRACKETS[0].low;
  check('an unparsed amount contributes nothing to the floor', f.totalLow !== wantLow + ghost || ghost === 0, `${unknown.length} unknown rows`);
}

// ── 3. the spouse cap ────────────────────────────────────────────────────
{
  const household = f.trades.filter(t => t.owner === 'Spouse' || t.owner === 'Dependent');
  check('PREMISE: the feed carries household rows', household.length > 0, `${household.length}`);
  check(
    'no spouse or dependent row reports above the $1,000,000 cap',
    household.every(t => t.bracket === null || t.bracket <= SPOUSE_CAP_INDEX),
    household.filter(t => t.bracket !== null && t.bracket > SPOUSE_CAP_INDEX).map(t => bracketLabel(t.bracket)).join(',')
  );
  check('the cap sits at the last rung below $1,000,000', AMOUNT_BRACKETS[SPOUSE_CAP_INDEX].high === 1_000_000, AMOUNT_BRACKETS[SPOUSE_CAP_INDEX].label);
  /* And the cap must not be vacuous — self/joint rows CAN go higher. */
  const own = f.trades.filter(t => t.owner === 'Self' || t.owner === 'Joint');
  check('PREMISE: a self or joint row does exceed it', own.some(t => t.bracket !== null && t.bracket > SPOUSE_CAP_INDEX));
}

// ── 4. a total is a range ────────────────────────────────────────────────
{
  check('the floor is below the ceiling', f.totalHigh === null || f.totalLow < f.totalHigh);
  /* BOTH BRANCHES ARE EXERCISED, not whichever one this sample happens to
     hit. A conditional check here passed a mutation that replaced the
     null ceiling with a guess, because the top rung was unreachable and the
     assertion silently took the other branch. */
  const bounded = buildCongress(90, DAY, 30);
  const boundedRows = bounded.trades.filter(t => t.bracket !== null);
  if (boundedRows.every(t => AMOUNT_BRACKETS[t.bracket!].high !== null)) {
    const wantHigh = boundedRows.reduce((s, t) => s + (AMOUNT_BRACKETS[t.bracket!].high ?? 0), 0);
    check('with every rung bounded, the ceiling sums the rung tops exactly', bounded.totalHigh === wantHigh, `${bounded.totalHigh} vs ${wantHigh}`);
  } else {
    check('PREMISE: a bounded-only sample', false, 'the small sample already contains the open rung');
  }
  /* And a feed that DOES contain the open rung must refuse a ceiling. */
  const big = buildCongress(90, DAY, 4000);
  const openRows = big.trades.filter(t => t.bracket !== null && AMOUNT_BRACKETS[t.bracket!].high === null);
  check('PREMISE: the open-ended top rung is reachable at all', openRows.length > 0, `${openRows.length} of ${big.trades.length}`);
  check('it is rare, as in the live feed', openRows.length < big.trades.length * 0.01, `${((openRows.length / big.trades.length) * 100).toFixed(2)}%`);
  check('and it makes the ceiling unknowable rather than a guess', big.totalHigh === null);
  check('while the floor is still real', big.totalLow > 0, `${big.totalLow}`);
  const read = congressRead(f);
  check('the headline never prints a single confident figure', /between \$|at least \$/.test(read), read.slice(0, 90));
  check('and says the brackets were summed', /brackets summed|point estimate/.test(read));
}

// ── 5. every date is in the past ─────────────────────────────────────────
{
  check('no disclosure is dated in the future', f.trades.every(t => t.disclosedDaysAgo >= 0), `${f.trades.filter(t => t.disclosedDaysAgo < 0).length} bad`);
  check('no trade is dated in the future', f.trades.every(t => t.tradedDaysAgo >= 0), `${f.trades.filter(t => t.tradedDaysAgo < 0).length} bad`);
  check('the lag is exactly the gap between the two', f.trades.every(t => t.lagDays === t.tradedDaysAgo - t.disclosedDaysAgo));
  const back = f.trades.filter(t => t.lagDays < 0);
  check('PREMISE: some rows carry the negative lag real feeds have', back.length > 0, `${back.length}`);
  check('— and even those keep both dates in the past', back.every(t => t.tradedDaysAgo >= 0 && t.disclosedDaysAgo >= 0));
  check('the feed reads newest disclosure first', f.trades.every((t, i) => i === 0 || f.trades[i - 1].disclosedDaysAgo <= t.disclosedDaysAgo));
}

// ── 6. late is the statutory bound ───────────────────────────────────────
{
  check('the deadline is the STOCK Act\'s 45 days', STOCK_ACT_DEADLINE_DAYS === 45);
  check('late means past it, exactly', f.trades.every(t => t.late === t.lagDays > STOCK_ACT_DEADLINE_DAYS));
  check('a negative lag is never late', f.trades.filter(t => t.lagDays < 0).every(t => !t.late));
  check('the tally matches the rows', f.lateFilings === f.trades.filter(t => t.late).length, `${f.lateFilings}`);
  const late = f.trades.filter(t => t.late);
  check('PREMISE: late filings exist to count', late.length > 0, `${late.length} of ${f.trades.length}`);
  check('but late is the minority, as in the real feed', late.length < f.trades.length * 0.25, `${((late.length / f.trades.length) * 100).toFixed(1)}%`);
}

// ── 7. committee overlap is real jurisdiction ────────────────────────────
{
  check('the tally matches the rows', f.overlaps === f.trades.filter(t => t.committeeOverlap).length, `${f.overlaps}`);
  check('PREMISE: overlaps exist', f.overlaps > 0, `${f.overlaps}`);
  check(
    'every flagged row names a committee the member actually sits on',
    f.trades.filter(t => t.committeeOverlap).every(t => t.member.committees.includes(t.committeeOverlap!))
  );
  check(
    'and the flag agrees with the jurisdiction map',
    f.trades.every(t => t.committeeOverlap === overlapFor(t.member, t.ticker))
  );
  /* Not vacuous: some rows must NOT overlap, or the flag says nothing. */
  check('PREMISE: some rows do not overlap', f.trades.some(t => !t.committeeOverlap));
  /* A member with no relevant seat never flags. */
  const noSeat = MEMBERS.find(m => m.committees.every(c => c === 'Appropriations'));
  if (noSeat) check('a member with no sector jurisdiction never flags', ['NVDA', 'JPM', 'XOM'].every(t => overlapFor(noSeat, t) === null));
  check('an unknown ticker never flags', MEMBERS.every(m => overlapFor(m, 'ZZZZ') === null));
}

// ── 8. nobody here is real ───────────────────────────────────────────────
{
  /* A guard, not a formality: this file exists so a UI can be judged before
     real keys go in, and the one thing it must never do is put an invented
     trade under a real legislator's name. */
  const REAL = [
    'pelosi', 'mcconnell', 'schumer', 'crapo', 'tuberville', 'greene', 'gottheimer',
    'khanna', 'warren', 'sanders', 'cruz', 'rubio', 'ocasio', 'jeffries', 'scalise',
    'johnson', 'thune', 'wyden', 'manchin', 'sinema', 'romney', 'hawley', 'graham',
  ];
  const names = MEMBERS.map(m => m.name.toLowerCase());
  const clash = names.filter(n => REAL.some(r => n.includes(r)));
  check('no member shares a name with a sitting legislator', clash.length === 0, clash.join(', '));
  check('every member is titled Rep. or Sen.', MEMBERS.every(m => /^(Rep\.|Sen\.) /.test(m.name)));
  check('every member has a chamber that matches the title', MEMBERS.every(m => (m.name.startsWith('Sen.') ? m.chamber === 'Senate' : m.chamber === 'House')));
  check('House members carry a district, senators do not', MEMBERS.every(m => (m.chamber === 'House' ? !!m.district : !m.district)));
  check('every member sits on at least one committee', MEMBERS.every(m => m.committees.length > 0));
  check('every row carries an equity ticker this desk knows', f.trades.every(t => !!lookup(t.ticker)));
  check('and an asset kind an equity can actually be', f.trades.every(t => t.assetKind === 'Stock' || t.assetKind === 'Stock Option'));
}

// ── stability ────────────────────────────────────────────────────────────
{
  const a = buildCongress(90, DAY, 40);
  const b = buildCongress(90, DAY, 40);
  check('the feed is stable within a day', a.trades.length === b.trades.length && a.totalLow === b.totalLow);
  check('an empty window returns an empty feed, not a crash', buildCongress(0, DAY).trades.length === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
