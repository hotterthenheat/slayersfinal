/*
  Acceptance test for the wire's sector awareness.

  Proves:
  1. No name is ever handed a headline about a business it is not in — the
     shelved templates only reach the sectors that named them
  2. Every sector still has a real pool to draw from, so gating did not
     starve one of them down to two lines
  3. A ticker item never carries the Macro category — that shelf is for
     prints with no name on them
  4. The feed is deterministic within a day and actually varied — the point
     of the shelves is that a reader does not see one company's news with
     the ticker swapped
  5. Every headline names its own company, so a template cannot silently
     drop the subject
*/
import { buildNewsFeed, templatesFor } from '../src/data/news';
import { UNIVERSE, lookup, type Sector } from '../src/data/universe';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

const SECTORS = [...new Set(UNIVERSE.map(u => u.sector))] as Sector[];

// ── 1 & 2. the gate holds, and nothing is starved ────────────────────────
{
  check('PREMISE: the universe spans many sectors', SECTORS.length >= 8, `${SECTORS.length}`);
  for (const s of SECTORS) {
    const pool = templatesFor(s);
    check(`${s}: every template in its pool admits it`, pool.every(t => !t.sectors || t.sectors.includes(s)));
    check(`${s}: the pool is big enough to vary`, pool.length >= 8, `${pool.length}`);
  }
  // The gate must actually EXCLUDE something, or it is decoration.
  const all = templatesFor(SECTORS[0]).length;
  const differs = SECTORS.some(s => templatesFor(s).length !== all);
  check('the sector gate genuinely excludes lines', differs, SECTORS.map(s => `${s}:${templatesFor(s).length}`).join(' '));
  // And a shelved line reaches its own sector and no other.
  const shelved = templatesFor('Health Care').filter(t => t.sectors?.includes('Health Care'));
  check('PREMISE: Health Care has its own shelf', shelved.length > 0, `${shelved.length}`);
  check('— and none of it reaches Financials', templatesFor('Financials').every(t => !t.sectors?.includes('Health Care')));
}

// ── 3, 4 & 5. the feed the reader actually gets ──────────────────────────
{
  const feed = buildNewsFeed();
  check('PREMISE: there is a feed', feed.length > 0, `${feed.length}`);

  const named = feed.filter(n => n.ticker);
  check('PREMISE: most items name a company', named.length > 0, `${named.length}`);
  check('a named item is never filed under Macro', named.every(n => n.category !== 'Macro'));
  check('a macro item names no company', feed.filter(n => n.category === 'Macro').every(n => n.ticker === null));

  // Every headline contains its own company's name.
  const orphans = named.filter(n => {
    const u = lookup(n.ticker!);
    return !u || !n.headline.includes(u.name);
  });
  check('every headline names its own company', orphans.length === 0, orphans.map(o => o.headline).join(' | '));

  // Deterministic within a day.
  const again = buildNewsFeed();
  check(
    'the feed is stable across calls',
    again.length === feed.length && again.every((n, i) => n.headline === feed[i].headline)
  );

  /* Varied — and measured on the SHAPE of each story rather than its
     rendered text. A wire that is every-name-gets-an-upgrade renders 16
     different sentences (different bank, different price target) while
     being one template; comparing strings calls that variety and it is
     not. The category is the shape. */
  const cats = named.map(n => n.category);
  const kinds = new Set(cats);
  check('the wire runs more than one kind of story', kinds.size >= 3, [...kinds].join(', '));
  const commonest = Math.max(...[...kinds].map(k => cats.filter(c => c === k).length));
  check(
    'no single kind dominates the wire',
    commonest <= Math.ceil(named.length * 0.6),
    `${commonest} of ${named.length}`
  );
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
