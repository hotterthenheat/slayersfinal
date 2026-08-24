/*
  The scoring weights still sum to one, and the News desk stays unwired.

  WHY THIS EXISTS. Removing the news factor from Compass and the news sleeve
  from Stocks meant re-normalising what was left. That is the kind of edit that
  looks finished and is not: drop a 0.14 weight, leave the other five alone,
  and every composite silently rescales by 0.86 — which moves contracts across
  the BUY / WATCH / FADE line for a reason that has nothing to do with the
  contract. Nobody would see it. Two commented claims in the source say "the
  guard asserts it"; this is that guard, and without it those comments are
  decoration.

  It reads the SOURCE rather than importing the tables, because neither table
  is exported and widening a module's public surface to make it testable is a
  worse trade than parsing the file that defines it.

  Run: npx tsx scripts/weights-proof.ts
*/

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');

let pass = 0,
  fail = 0;
const check = (name: string, ok: boolean, detail: string) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} — ${detail}`);
  ok ? pass++ : fail++;
};

/** Every `key: 0.NN` pair inside one braced row. */
function weightsIn(row: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of row.matchAll(/([a-zA-Z]+)\s*:\s*(-?[\d.]+)/g)) out[m[1]] = Number(m[2]);
  return out;
}

// ---- Compass: four horizons, five factors each ------------------------------

const scorer = read('src/core/contractScore.ts');
const weightsBlock = scorer.slice(
  scorer.indexOf('const WEIGHTS'),
  scorer.indexOf('};', scorer.indexOf('const WEIGHTS'))
);

check(
  'the Compass weight table was found',
  weightsBlock.length > 40,
  `${weightsBlock.length} chars parsed`
);

const HORIZONS = ['SAMEDAY', 'WEEKLIES', 'SWINGS', 'LEAPS'];
for (const h of HORIZONS) {
  const row = weightsBlock.match(new RegExp(`${h}\\s*:\\s*\\{([^}]*)\\}`));
  if (!row) {
    check(`${h} row present`, false, 'not found in the table');
    continue;
  }
  const w = weightsIn(row[1]);
  const sum = Object.values(w).reduce((a, b) => a + b, 0);
  // Two decimal places are what the table is written in, so the tolerance is
  // half a unit of the last place — tight enough that a dropped factor fails.
  check(
    `${h} weights sum to 1`,
    Math.abs(sum - 1) < 0.005,
    `${Object.keys(w).length} factors, sum ${sum.toFixed(3)}`
  );
  check(`${h} carries no news factor`, !('news' in w), `keys: ${Object.keys(w).join(', ')}`);
}

// ---- Stocks: three sleeves ---------------------------------------------------

const stocks = read('src/data/stocks.ts');
const sleeveRow = stocks.match(/const SLEEVE_WEIGHTS\s*=\s*\{([^}]*)\}/);
if (!sleeveRow) {
  check('the Stocks sleeve table was found', false, 'SLEEVE_WEIGHTS not found');
} else {
  const w = weightsIn(sleeveRow[1]);
  const sum = Object.values(w).reduce((a, b) => a + b, 0);
  check(
    'Stocks sleeves sum to 1',
    Math.abs(sum - 1) < 0.005,
    `${Object.keys(w).length} sleeves, sum ${sum.toFixed(3)}`
  );
  check('Stocks carries no news sleeve', !('news' in w), `keys: ${Object.keys(w).join(', ')}`);
}

// ---- The News desk stays unwired --------------------------------------------

/*
  The real regression risk is not the arithmetic — it is somebody re-importing
  the news generator and quietly putting invented headlines, and rating actions
  attributed to named banks, back into the shipped bundle. So this walks the
  whole tree.

  A TYPE-only import is allowed and is why the check is not a plain substring
  match: `import type { NewsCategory }` is erased at build time and carries no
  strings into the bundle. A value import does not.
*/
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

const offenders: string[] = [];
for (const file of walk(path.join(ROOT, 'src'))) {
  const rel = path.relative(ROOT, file);
  if (rel === 'src/data/news.ts' || rel === 'src/pages/News.tsx') continue;
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(/import\s+(type\s+)?([^;]*?)from\s+['"][^'"]*data\/news['"]/g)) {
    const isTypeOnly = Boolean(m[1]) || /^\s*\{\s*type\s/.test(m[2]);
    if (!isTypeOnly) offenders.push(`${rel}: ${m[0].replace(/\s+/g, ' ').trim()}`);
  }
}
check(
  'nothing pulls the news generator into the bundle',
  offenders.length === 0,
  offenders.length ? offenders.join(' | ') : 'no value imports of data/news'
);

const routes = read('src/App.tsx');
check(
  '/news is not routed to the News page',
  !/path="\/news"\s+element=\{<News\s*\/>\}/.test(routes),
  '/news redirects instead'
);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
