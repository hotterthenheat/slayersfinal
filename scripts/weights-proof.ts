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

// ---- one dealer ink, in two places that must agree -------------------------

/*
  Gold and steel exist twice by necessity: JS chart code cannot read a Tailwind
  class, and Tailwind's JIT cannot read a JS constant — it scans source for
  complete literal class strings, which is why heatmap.ts writes the hex out
  rather than interpolating the token (an interpolated class compiles fine and
  renders with no colour at all).

  Two copies of one fact is the failure this codebase keeps hitting, so the
  copies are pinned to each other here. The palette file says "change here +
  there together, never one alone"; this is what makes that sentence true.
*/
const palette = read('src/components/gex/palette.ts');
const tw = read('tailwind.config.ts');
const heat = read('src/components/gex/heatmap.ts');

const hexOf = (src: string, re: RegExp) => (src.match(re)?.[1] ?? '').toUpperCase();

const DEALER = [
  {
    name: 'gold (put-dominant)',
    js: hexOf(palette, /export const DEALER_PUT\s*=\s*'(#[0-9a-fA-F]{6})'/),
    css: hexOf(tw, /^\s*gold:\s*'(#[0-9a-fA-F]{6})'/m),
  },
  {
    name: 'steel (call-dominant)',
    js: hexOf(palette, /export const DEALER_CALL\s*=\s*'(#[0-9a-fA-F]{6})'/),
    css: hexOf(tw, /^\s*steel:\s*'(#[0-9a-fA-F]{6})'/m),
  },
  {
    name: 'gold ink',
    js: hexOf(palette, /export const DEALER_PUT_INK\s*=\s*'(#[0-9a-fA-F]{6})'/),
    css: hexOf(tw, /'gold-ink':\s*'(#[0-9a-fA-F]{6})'/),
  },
  {
    name: 'steel ink',
    js: hexOf(palette, /export const DEALER_CALL_INK\s*=\s*'(#[0-9a-fA-F]{6})'/),
    css: hexOf(tw, /'steel-ink':\s*'(#[0-9a-fA-F]{6})'/),
  },
];

for (const d of DEALER) {
  check(
    `${d.name} matches between palette.ts and tailwind.config.ts`,
    Boolean(d.js) && d.js === d.css,
    d.js && d.css ? `${d.js} === ${d.css}` : `palette ${d.js || 'MISSING'} / tailwind ${d.css || 'MISSING'}`
  );
}

// The one place a literal hex is unavoidable, pinned to the same source.
const heatPos = hexOf(heat, /pos:\s*'text-\[(#[0-9a-fA-F]{6})\]'/);
const heatNeg = hexOf(heat, /neg:\s*'text-\[(#[0-9a-fA-F]{6})\]'/);
check(
  'the heatmap scale labels use the dealer inks',
  heatPos === DEALER[0].js && heatNeg === DEALER[1].js,
  `pos ${heatPos} / neg ${heatNeg}`
);

/*
  The dealer book must not be painted in the candles' own colours. This is the
  regression the whole pass exists to prevent, and it is one grep: the map that
  renders dealer gamma may not import BULL, or the direction pair, from the
  palette.
*/
const map = read('src/components/gex/PositioningMap.tsx');
const directionInk = /import\s*\{[^}]*\b(BULL|PUT_WALL|CALL_WALL)\b[^}]*\}\s*from\s*'\.\/palette'/.test(map);
check(
  'the positioning map does not import direction ink',
  !directionInk,
  directionInk ? 'imports a bull/bear token' : 'dealer tokens only'
);

/*
  ---- The Exposure Profile trio agrees on the same day ----------------------

  docs/dealer-ink-pass.md, step 2: the ladder, the positioning map and the
  exposure matrix "sit on one page and must agree on the same day", and
  "nothing is half-migrated on a given surface". For a while that was exactly
  what shipped — two panels in gold/steel with the third painting the same
  put/call split in red and green, side by side on one screen.

  So the assertion is about the SET, not each file: all three take dealer ink
  from the palette, and none of them writes the direction pair as a literal.
  Adding a fourth panel to this page without migrating it fails here.

  The walls are deliberately not covered. docs/dealer-ink-pass.md files
  CW-green / PW-red under "Open decisions (yours)", and palette.ts records the
  call wall being reversed back to green by Noah on 2026-08-18. A guard has no
  business pre-empting that.
*/
const TRIO = [
  'src/components/gex/StrikePressureLadder.tsx',
  'src/components/gex/PositioningMap.tsx',
  'src/components/gex/ExposureMatrix.tsx',
];
// #FF3B30 / #30D158 and their rgb() forms — the direction pair, written out.
const DIRECTION_LITERAL = /#FF3B30|#30D158|rgba?\(\s*255,\s*59,\s*48|rgba?\(\s*48,\s*209,\s*88/i;
// DEALER_PUT/DEALER_CALL, their _INK variants (correct for figures rather than
// bars), or the deprecated aliases that resolve to them. The optional suffix
// matters: \b after DEALER_PUT will not match inside DEALER_PUT_INK, because
// _ is a word character, and the first version of this flagged the ladder for
// using exactly the right token.
const DEALER_IMPORT = /\b(DEALER_(?:PUT|CALL)(?:_INK)?|SHORT_GAMMA|LONG_GAMMA)\b/;

for (const file of TRIO) {
  const src = read(file);
  const name = file.split('/').pop();
  check(
    `${name} takes its side ink from the palette`,
    DEALER_IMPORT.test(src),
    DEALER_IMPORT.test(src) ? 'uses the dealer tokens' : 'no dealer token in the file'
  );
  const literal = src.match(DIRECTION_LITERAL);
  check(
    `${name} writes no direction literal`,
    literal === null,
    literal ? `found ${literal[0]}` : 'no #FF3B30 / #30D158 in any form'
  );
}
// Guard the guard: a typo'd path would make read() throw, but an empty file
// would pass both checks above silently.
check(
  'the trio files actually have content',
  TRIO.every(f => read(f).length > 500),
  TRIO.map(f => `${f.split('/').pop()} ${read(f).length}b`).join(' · ')
);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
