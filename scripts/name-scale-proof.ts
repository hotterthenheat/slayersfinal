/*
  Acceptance test for 6.5 — an alert threshold that is not a list of the
  four biggest tickers.

  THE DEFECT, stated so it cannot come back: the flow rules were written in
  absolute dollars. `premium >= 25_000_000` is an ordinary Tuesday in SPY
  and has never happened in a small cap, so "big money" fired constantly on
  the index names and never on anything else. It was not a watcher — it was
  a list of the biggest names, refreshed.

  The scale a print needs is its OWN name's day, and the book already holds
  it. What follows checks that the share is arithmetically sound, that it
  actually neutralises the size bias, and that the floor underneath it still
  keeps a rounding error out of the feed.
*/
import Simulator from '../src/core/simulator';
import {
  buildFlowBook, buildFlowAlerts, BIG_MONEY_SHARE_PCT, BIG_MONEY_FLOOR,
} from '../src/data/flowBook';
import { REASON_FIELDS, reasonMatches, type UserReason } from '../src/data/flowReasons';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

const book = buildFlowBook(Simulator.universeQuotes('SPY'));
check('PREMISE: there is a book to reason about', book.length > 200, `${book.length} contracts`);

// ── the share is a share ────────────────────────────────────────────────
{
  const byName = new Map<string, typeof book>();
  for (const r of book) {
    const list = byName.get(r.ticker) ?? [];
    list.push(r);
    byName.set(r.ticker, list);
  }
  let worst = 0, worstName = '';
  for (const [t, rows] of byName) {
    const sum = rows.reduce((a, r) => a + r.nameSharePct, 0);
    const off = Math.abs(sum - 100);
    if (off > worst) { worst = off; worstName = t; }
  }
  /* Rounded to two decimals per row, so a name with many contracts can
     drift a little; a whole point would mean the denominator is wrong. */
  check(`every name's shares sum to 100 across ${byName.size} names`, worst < 1,
    `worst ${worstName} off by ${worst.toFixed(2)}`);

  check('every share is inside 0..100', book.every(r => r.nameSharePct >= 0 && r.nameSharePct <= 100));
  check('no share is NaN', book.every(r => Number.isFinite(r.nameSharePct)));
  check('the biggest contract on a name has its biggest share', (() => {
    for (const rows of byName.values()) {
      const byPrem = [...rows].sort((a, b) => b.premium - a.premium)[0];
      const byShare = [...rows].sort((a, b) => b.nameSharePct - a.nameSharePct)[0];
      if (byPrem.key !== byShare.key && byPrem.premium !== byShare.premium) return false;
    }
    return true;
  })());
}

// ── THE POINT: the size bias is gone ────────────────────────────────────
{
  /*
    Split the universe by how much option money each name trades, then ask
    each rule how many names it can EVER name. The absolute rule's answer is
    a handful of the largest; the share rule's answer should reach across
    the whole book, because 12% of your own day is 12% of your own day
    whether that day is $900M or $900K.
  */
  const dayByName = new Map<string, number>();
  for (const r of book) dayByName.set(r.ticker, (dayByName.get(r.ticker) ?? 0) + r.premium);
  const ranked = [...dayByName.entries()].sort((a, b) => b[1] - a[1]);
  const bigNames = new Set(ranked.slice(0, Math.ceil(ranked.length / 3)).map(x => x[0]));
  const smallNames = new Set(ranked.slice(-Math.ceil(ranked.length / 3)).map(x => x[0]));

  const OLD_ABS = 25_000_000;
  const absHits = book.filter(r => r.premium >= OLD_ABS);
  const relHits = book.filter(r => r.nameSharePct >= BIG_MONEY_SHARE_PCT && r.premium >= BIG_MONEY_FLOOR);

  const absNames = new Set(absHits.map(r => r.ticker));
  const relNames = new Set(relHits.map(r => r.ticker));
  const absSmall = [...absNames].filter(t => smallNames.has(t)).length;
  const relSmall = [...relNames].filter(t => smallNames.has(t)).length;
  const absBig = [...absNames].filter(t => bigNames.has(t)).length;

  check('PREMISE: the universe really does span orders of magnitude',
    ranked.length > 6 && ranked[0][1] > ranked[ranked.length - 1][1] * 20,
    `${Math.round(ranked[0][1] / Math.max(1, ranked[ranked.length - 1][1]))}x between the biggest and smallest day`);

  check('the absolute rule reaches almost none of the smaller third',
    absSmall <= 1, `${absSmall} small name(s) vs ${absBig} large`);
  check('the share rule reaches the smaller third',
    relSmall > absSmall, `${relSmall} small names, up from ${absSmall}`);

  /*
    THE CLAIM THAT MATTERS IS CONCENTRATION, NOT COUNT — and the first
    version of this proof asserted the count. It passed alone and failed in
    the suite, because the book DRIPS through the session: run it at 09:40
    and at 15:20 and there are different numbers of contracts, so "names
    more of the universe" is a fact about the clock as much as the rule.

    What is true at any hour is that the absolute rule's hits pile up in
    the largest names and the share rule's do not. That is the defect,
    stated as a distribution rather than as a tally.
  */
  const share = (hit: Set<string>, group: Set<string>) =>
    hit.size === 0 ? 0 : [...hit].filter(t => group.has(t)).length / hit.size;
  check('the absolute rule is concentrated in the biggest names',
    share(absNames, bigNames) >= 0.7,
    `${(share(absNames, bigNames) * 100).toFixed(0)}% of its names are in the top third`);
  check('the share rule is not',
    share(relNames, bigNames) < share(absNames, bigNames),
    `${(share(relNames, bigNames) * 100).toFixed(0)}% vs ${(share(absNames, bigNames) * 100).toFixed(0)}%`);

  /*
    AND IT DOES NOT SIMPLY OPEN THE GATES. A rule that fires on everything
    is the same uselessness from the other end — the reader stops reading it
    either way. The share rule must still be selective.
  */
  check('the rule stays rare', relHits.length < book.length * 0.06,
    `${relHits.length} of ${book.length} contracts (${((relHits.length / book.length) * 100).toFixed(1)}%)`);
  /* The threshold has to sit well ABOVE the average contract's share or it
     is not selecting anything — with ~19.5 contracts a name the mean share
     is about 5%, and a bar at 12% (the first draft) tripped an eighth of
     the book. This is the assertion that caught that. */
  const meanShare = 100 / (book.length / new Set(book.map(r => r.ticker)).size);
  check('the bar sits several times the average contract\'s share',
    BIG_MONEY_SHARE_PCT >= meanShare * 3,
    `bar ${BIG_MONEY_SHARE_PCT}% vs mean ${meanShare.toFixed(1)}%`);
}

// ── the floor still does its job ────────────────────────────────────────
{
  check('there is a dollar floor at all', BIG_MONEY_FLOOR > 0);
  const tiny = book.filter(r => r.nameSharePct >= BIG_MONEY_SHARE_PCT && r.premium < BIG_MONEY_FLOOR);
  const alerts = buildFlowAlerts(book);
  const bigMoney = alerts.filter(a => a.rule === 'big-money');
  const tinyKeys = new Set(tiny.map(r => r.key));
  check('a big share of a tiny day does not reach the feed',
    bigMoney.every(a => !tinyKeys.has(a.row.key)),
    `${tiny.length} contract(s) held back by the floor on this day`);
  /* Asserted as a PREDICATE, not against whatever this day happened to
     produce: the floor's whole job is a case that may not occur today, and
     a guard only tested when the data obliges is not tested. */
  const wouldFire = (share: number, premium: number) => share >= BIG_MONEY_SHARE_PCT && premium >= BIG_MONEY_FLOOR;
  check('20% of a $40,000 day is refused by the floor', !wouldFire(20, 40_000));
  check('20% of a $4,000,000 day is not', wouldFire(20, 4_000_000));
  check('and a huge print with a small share is refused by the share test',
    !wouldFire(2, 90_000_000));
  check('but the rule still fires on something', bigMoney.length > 0, `${bigMoney.length} alert(s)`);
}

// ── the reader can write the same kind of rule ──────────────────────────
{
  /*
    6.5 asks for per-name relative thresholds IN THE UI, not just in the
    house rules. The editor reads its fields through this registry, so the
    field existing and reading the row is the whole of that.
  */
  check('the editor offers a share-of-the-name field', !!REASON_FIELDS.nameSharePct);
  check('and it reads the row, not a constant',
    REASON_FIELDS.nameSharePct.read(book[0]) === book[0].nameSharePct);
  check('its sentence names what it measures',
    /its name/i.test(REASON_FIELDS.nameSharePct.clause('atLeast', 10)),
    REASON_FIELDS.nameSharePct.clause('atLeast', 10));

  const reason: UserReason = {
    id: 'r1', name: 'big for its name', right: 'ANY', createdAt: 0,
    terms: [{ field: 'nameSharePct', cmp: 'atLeast', value: 15 }],
  };
  const caught = book.filter(r => reasonMatches(reason, r));
  check('a reader-built share rule catches rows', caught.length > 0, `${caught.length} rows`);
  check('and only rows that really clear the bar', caught.every(r => r.nameSharePct >= 15));

  /* Paired with a dollar floor, exactly as the field's own note advises. */
  const floored: UserReason = {
    ...reason,
    terms: [...reason.terms, { field: 'premium', cmp: 'atLeast', value: 250_000 }],
  };
  const both = book.filter(r => reasonMatches(floored, r));
  check('adding a dollar floor narrows it rather than widening it',
    both.length <= caught.length && both.every(r => r.premium >= 250_000),
    `${both.length} of ${caught.length}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
