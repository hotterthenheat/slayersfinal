/*
  The gate's own assertions have to be able to fail.

  WHY THIS EXISTS. The recurring defect in this repo is not a broken feature,
  it is a GUARD THAT PASSES WITHOUT PROVING ANYTHING. Seven have been found
  here, each by hand and mostly by accident:

    · one satisfied by a code comment rather than the code
    · one whose regex stopped at the first quote, so it matched a prefix
    · one satisfied by a `/* … *​/` block
    · one that asserted `array.length >= 0`, which is true of every array
    · one that searched a file for `Feed.atEnd()` and matched the comment
      explaining why that call is deliberately NOT made
    · one that accepted "some localStorage value matches /mark|star|track/",
      which an unrelated earlier key already satisfied
    · one whose regex was case-sensitive against `text-transform: uppercase`,
      so it reported a working control as broken

  There are over two hundred assertions now. Reading them all again is not a
  plan, and the ones added since are mutation-verified anyway. What this
  catches is the next one.

  WHAT IT DOES NOT CLAIM. It does not prove an assertion is meaningful — only
  that its condition is not one of the shapes that CANNOT fail. A regex that
  matches the wrong thing looks perfectly healthy here; only putting the
  defect back and watching the assertion go red proves that, and that is a
  discipline rather than a script.

  THE RULES ARE DELIBERATELY NARROW, because a meta-guard that cries wolf is
  the very thing it is warning about. A first pass used four looser rules and
  flagged eight assertions, and all eight were fine:

    four   `fixture-proof` uses a different signature — check(name, got,
           want, tol) — and the scanner read `got` as a condition
    two    `check(name, false, …)` inside an `if (!found)` branch. A check
           that always FAILS is a guard, not vacuity; only always-TRUE is.
    one    "the auth/checkout scan ran over the tree" — a companion check
           that exists so its neighbour cannot pass on an empty scan. That
           is the ANTIDOTE to vacuity, and flagging it had it exactly
           backwards.
    one    a detail with no `?:` branch, which said nothing about whether
           the detail was informative — it interpolated the real numbers.

  So the rules below are only the ones where the condition is tautological on
  its face, whatever the surrounding code does.

  Run: npx tsx scripts/gate-proof.ts
*/

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPTS = path.join(ROOT, 'scripts');

let pass = 0,
  fail = 0;
const check = (name: string, ok: boolean, detail: string) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} — ${detail}`);
  ok ? pass++ : fail++;
};

/** Every `check(...)` call, arguments split at top-level commas. */
const callsIn = (src: string): { line: number; args: string[] }[] => {
  const out: { line: number; args: string[] }[] = [];
  const re = /\bcheck\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let i = m.index + m[0].length;
    let depth = 1;
    let quote: string | null = null;
    const start = i;
    while (i < src.length && depth > 0) {
      const c = src[i];
      if (quote) {
        if (c === quote && src[i - 1] !== '\\') quote = null;
      } else if (c === '"' || c === "'" || c === '`') quote = c;
      else if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') depth--;
      i++;
    }
    const body = src.slice(start, i - 1);
    const args: string[] = [];
    let d = 0;
    let q: string | null = null;
    let last = 0;
    for (let j = 0; j < body.length; j++) {
      const c = body[j];
      if (q) {
        if (c === q && body[j - 1] !== '\\') q = null;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') { q = c; continue; }
      if ('([{'.includes(c)) d++;
      else if (')]}'.includes(c)) d--;
      else if (c === ',' && d === 0) { args.push(body.slice(last, j)); last = j + 1; }
    }
    args.push(body.slice(last));
    out.push({ line: src.slice(0, m.index).split('\n').length, args: args.map(s => s.trim()) });
  }
  return out;
};

/*
  A script whose `check` takes numbers rather than a boolean is comparing, not
  asserting a predicate, and its second argument is a VALUE — scanning it for
  tautologies would be reading a measurement as a condition. `fixture-proof`
  is that shape: `check(name, got, want, tol)`.

  Read from the script's own DECLARATION, so a rename cannot silently skip
  one and a new script of either shape is classified correctly. An earlier
  version also accepted the `ok ? pass++ : fail++` idiom as evidence — which
  fixture-proof also has, in the line where it computes `ok` itself — and so
  put it back in the predicate set. It flagged nothing either way today, but
  it would have read a `got` of `1` as a literal-truth condition.
*/
const takesBoolean = (src: string): boolean => /const check\s*=\s*\([^)]*\bok\s*:\s*boolean/.test(src);

const TAUTOLOGIES: { re: RegExp; why: string }[] = [
  { re: /^(true|1|!0|!!1)$/, why: 'the condition is a literal truth' },
  { re: /\|\|\s*(true|1)\b/, why: '`|| true` makes every other clause decorative' },
  { re: /\.length\s*>=\s*0\b/, why: '`length >= 0` is true of every array' },
  { re: /\blength\s*>=\s*0\b/, why: '`length >= 0` is true of every array' },
  { re: /^([A-Za-z_$][\w$.]*)\s*===?\s*\1$/, why: 'the condition compares a value with itself' },
  { re: /\?\s*true\s*:\s*true\b/, why: 'both branches are true' },
];

const files = readdirSync(SCRIPTS).filter(f => f.endsWith('-proof.ts') && f !== 'gate-proof.ts');
const offenders: string[] = [];
let sites = 0;
let boolScripts = 0;

for (const f of files) {
  const src = readFileSync(path.join(SCRIPTS, f), 'utf8');
  if (!takesBoolean(src)) continue; // a numeric comparator — its 2nd arg is a value
  boolScripts++;
  for (const c of callsIn(src)) {
    if (c.args.length < 2) continue;
    sites++;
    const cond = c.args[1].replace(/\s+/g, ' ');
    for (const t of TAUTOLOGIES) {
      if (t.re.test(cond)) {
        offenders.push(`${f}:${c.line} — ${t.why} — \`${cond.slice(0, 60)}\``);
        break;
      }
    }
  }
}

check(
  'the assertion scan actually read the proof scripts',
  files.length >= 8 && boolScripts >= 6 && boolScripts < files.length && sites >= 120,
  `${files.length} proof scripts, ${boolScripts} predicate-based (${files.length - boolScripts} numeric comparator), ${sites} check() call sites parsed`
);

check(
  'no assertion in the gate has a condition that cannot fail',
  offenders.length === 0,
  offenders.length ? offenders.join(' | ') : `${sites} conditions, none tautological`
);

/*
  And the gate has to be RUN. An assertion script nobody invokes is the same
  defect one level up — it passes, in a file nothing opens. Every proof script
  on disk must appear in the npm test chain.

  This file is included in that list, which is honest but not complete: if
  somebody drops gate-proof from the chain, gate-proof stops running and
  cannot object. It catches the case where it is removed and still run by
  hand, and no further. Nothing inside a gate can guard the gate's own
  invocation — that is what CI's `npm test` step is for, and ci.yml says so.
*/
const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>;
};
const testCmd = pkg.scripts?.test ?? '';
const onDisk = readdirSync(SCRIPTS).filter(f => f.endsWith('-proof.ts'));
const unwired = onDisk.filter(f => !testCmd.includes(f));
check(
  'every proof script on disk is wired into npm test',
  unwired.length === 0 && onDisk.length >= 9,
  unwired.length ? `not run: ${unwired.join(', ')}` : `all ${onDisk.length} are in the test chain`
);

/*
  The README describes this gate, and a description with a number in it goes
  stale the moment a script is added — quietly, because nothing reads prose.
  It said "seven scripts" while ten were running. So both halves are pinned:
  the count it states, and a row in its table for every script on disk.

  An earlier pass met this exact shape in docs/dealer-ink-pass.md, which
  claimed the alias scan covered "all 183 files under src" when there were
  184, and solved it by printing the count instead of pinning one. That works
  for a scan's own output; it does not work for prose somebody has to read,
  so here the prose stays and the assertion holds it honest.
*/
const readme = readFileSync(path.join(ROOT, 'README.md'), 'utf8');
const WORDS: Record<string, number> = {
  five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};
const stated = readme.match(/`npm test` runs (\w+) scripts/);
const statedN = stated ? (WORDS[stated[1].toLowerCase()] ?? Number(stated[1])) : NaN;
check(
  'the README states the number of proof scripts there actually are',
  statedN === onDisk.length,
  Number.isNaN(statedN)
    ? 'could not find the sentence in README.md'
    : `README says ${stated?.[1]} (${statedN}), ${onDisk.length} on disk`
);

/*
  Scoped to the TABLE, not the whole file. The first version searched the
  README for the backticked name anywhere, and removing gate-proof's table
  row did not fail it — because the prose two paragraphs down also names
  gate-proof. The assertion was called "has a row in the README table" and
  actually tested "is mentioned somewhere", which is a check whose NAME
  overstates its condition.

  Worth noting what caught that: not the scan in this same file, which reads
  conditions and cannot see that a name promises more than a condition
  delivers. Mutation verification caught it, on the second of two mutations.
*/
const tableRows = readme.split('\n').filter(l => l.trim().startsWith('|'));
const undocumented = onDisk
  .map(f => f.replace(/\.ts$/, ''))
  .filter(name => !tableRows.some(row => row.includes(`\`${name}\``)));
check(
  'every proof script has a row in the README table',
  undocumented.length === 0,
  undocumented.length
    ? `no table row for: ${undocumented.join(', ')}`
    : `all ${onDisk.length} have a row among ${tableRows.length} table lines`
);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
