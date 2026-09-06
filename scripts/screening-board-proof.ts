import { readFileSync } from 'node:fs';
import { buildSectorBoard, buildStockBoard } from '../src/data/stocks';

/*
==================================================
  SLAYER TERMINAL - PROOF · THE SCREENING BOARD'S AFFORDANCES
  (scripts/screening-board-proof.ts) — Part 7.1
==================================================

  Three things the board had the data for and did not let a reader do.

    SORT BY A SLEEVE   the column draws four bars, so one sort key cannot
                       serve it and the board shipped with none. A screening
                       board you cannot rank by the thing you are screening
                       on is half a tool.
    OPEN A SECTOR      a sector row is an average, and an average with no
                       way to see what it averages is a claim taken on
                       faith. Every row now opens onto its members.
    OPEN THE STORIES   the news sleeve is the one of the four computed from
                       a feed a reader can go and read, and its methodology
                       door has promised that click-through since it was
                       written. Nothing rendered it.

  The first two are about the DATA being sortable and groupable, so they are
  checked against the engine. The third is a wiring claim between two pages,
  so it is checked as a wiring claim: the promise and the link that keeps it.
*/

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
  if (ok) {
    pass += 1;
    console.log(`PASS  ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    fail += 1;
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

const read = (p: string) => readFileSync(p, 'utf8');
const board = buildStockBoard();
const sectors = buildSectorBoard(board);
const page = read('src/pages/Stocks.tsx');

// ---- every sleeve is a sortable quantity ------------------------------------------
{
  const KEYS = ['momentum', 'quality', 'flow', 'news'] as const;
  for (const k of KEYS) {
    const vals = board.map(p => p.sleeves[k]);
    check(`the ${k} sleeve is a number on every row`, vals.every(v => Number.isFinite(v)), `${vals.length} rows`);
    /* A column that sorts but never REORDERS is a control that does nothing.
       Four identical values would pass a "is a number" check and fail a
       reader. */
    check(`  · and it separates the board — ${new Set(vals).size} distinct values`, new Set(vals).size > board.length / 3);
  }
  check('the sleeves column carries a sort key', /key: 'sleeves'[\s\S]{0,2200}?sortValue: p => p\.sleeves\[sortSleeve\]/.test(page));
  check('and the reader picks which sleeve it ranks by', /setSortSleeve\(k\)/.test(page) && /sorting by \{SLEEVE_SHORT\[sortSleeve\]/.test(page));
  check('the chosen sleeve is marked, so the board never ranks by something invisible', /sortSleeve === k \? 'text-select'/.test(page));
}

// ---- a sector opens onto what it averages -----------------------------------------
{
  check('every sector row is an average of covered names', sectors.length > 0);
  const covered = new Set(board.map(p => p.sector));
  const withMembers = sectors.filter(s => covered.has(s.sector));
  check('and most sectors have members to show', withMembers.length >= sectors.length - 2, `${withMembers.length} of ${sectors.length}`);

  /* THE SCORE IS THE MEMBERS' MEAN. If opening a row shows names that do not
     add up to the number on it, the disclosure is worse than none. */
  const off = sectors
    .map(s => {
      const members = board.filter(p => p.sector === s.sector);
      if (members.length === 0) return null;
      const mean = Math.round(members.reduce((a, p) => a + p.composite, 0) / members.length);
      return mean === s.score ? null : `${s.sector} ${s.score} vs ${mean}`;
    })
    .filter(Boolean);
  check('the row’s score is exactly the mean of the names behind it', off.length === 0, off.join(', ') || `${sectors.length} sectors`);

  check('the row is the hit target, and says whether it is open', /aria-expanded=\{open\}/.test(page) && /setOpenSector\(cur =>/.test(page));
  check('one row at a time — the ladder stays a comparison', /cur === s\.sector \? null : s\.sector/.test(page));
  check('members are ranked the way the board ranks them', /sort\(\(a, b\) => b\.composite - a\.composite\)/.test(page));
  check('and an empty sector says so rather than opening onto nothing', /No covered names in this sector/.test(page));
}

// ---- the promise and the link that keeps it ---------------------------------------
{
  const method = read('src/data/stocks.ts');
  const promised = /Click through to the News Room/i.test(method);
  check('the news sleeve promises the articles behind it', promised);
  check('  · and the board renders that click-through', /sleeve="news" onOpen=\{\(\) => navigate\('\/news'/.test(page));
  check('  · on that sleeve only — the other three have nowhere to go', (page.match(/onOpen=\{/g) ?? []).length === 1);

  const room = read('src/pages/newsroom/NewsRoom.tsx');
  check('the News Room opens on the name it is handed', /location\.state as \{ ticker\?: string \}/.test(room) && /openTicker\(t\.toUpperCase\(\)\)/.test(room));
  check('  · reads it once and consumes it from history', /arrived\.current/.test(room) && /window\.history\.replaceState/.test(room));

  /* The IPO row's "open chain" navigated to a search param the Weigher does
     not read, so it opened on whatever name was in localStorage. */
  const hub = read('src/pages/EarningsHub.tsx');
  check('the IPO chain link hands the Weigher a name it can actually read', /navigate\('\/weigher', \{ state: \{ weigh: \{ ticker: d\.ticker \} \} \}\)/.test(hub));
  /* The comment explaining the old bug legitimately names the old URL, so the
     check is against the CODE rather than the file. */
  const hubCode = hub.replace(/\/\*[\s\S]*?\*\//g, '');
  check('  · and no longer uses the search param nothing consumes', !/weigher\?ticker=/.test(hubCode));
  const weigher = read('src/pages/Weigher.tsx');
  check('  · which is the channel the Weigher consumes', /state\?\.weigh\?\.ticker/.test(weigher));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
