/*
  The tape's restraint proof.

  `pinpoint-restraint-proof` fails the build on a sixth type size, a fourth
  weight, a hue typed at a call site, a heat pole used as text, a scrolling
  region with no edge, or a gradient — and it is scoped to ONE DIRECTORY.
  Nothing guarded the other nine sections, which is exactly how Trace came to
  render seven type sizes on every page, 672 bordered containers on the Live
  Tape alone, and green and red doing three jobs in a single row.

  So this is the same discipline pointed at the second desk. It is NOT a copy
  of Pinpoint's numbers: Trace is a denser surface and runs a notch tighter,
  and a scale chosen for somewhere else is not restraint, it is borrowing.
*/
import { readFileSync, readdirSync } from 'node:fs';
import { TAPE, sideInk } from '../src/components/trace/earnedInk';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

const DIRS = ['src/pages/trace', 'src/components/trace'];
const files = DIRS.flatMap(d =>
  readdirSync(d).filter(f => /\.tsx?$/.test(f)).map(f => ({ path: `${d}/${f}`, src: readFileSync(`${d}/${f}`, 'utf8') }))
);
check('PREMISE: the section is here to be measured', files.length > 25, `${files.length} files`);

// ── one type scale ──────────────────────────────────────────────────────
{
  /* Measured on the rendered page before this pass: 10px on 5,498 nodes,
     9px on 3,120, 11px on 2,511 — three sizes each doing a job — and then
     8px on two nodes, 12px on twenty-seven, 14px on one. A size used once
     on a page is not a level of hierarchy; it is a decision nobody made
     twice. The tail is what went. */
  const sizes = new Set<string>();
  for (const f of files) for (const m of f.src.matchAll(/text-\[(\d+)px\]/g)) sizes.add(m[1]);
  const allowed = new Set(['9', '10', '11', '13', '18']);
  const extra = [...sizes].filter(s => !allowed.has(s));
  check('the section sets five type sizes and no others', extra.length === 0 && sizes.size <= 5,
    extra.length ? `stray: ${extra.map(s => s + 'px').join(', ')}` : `${[...sizes].sort((a, b) => +a - +b).map(s => s + 'px').join(' ')}`);

  /* The doctrine has to be the sizes, or it is a comment. */
  const declared = Object.values(TAPE).join(' ');
  check('  · and the doctrine names exactly those', [...allowed].every(a => declared.includes(`text-[${a}px]`)));
  check('  · saying why they are not Pinpoint’s five',
    /NOT PINPOINT’S FIVE|NOT PINPOINT'S FIVE/.test(readFileSync('src/components/trace/earnedInk.ts', 'utf8')));
}

// ── one fact owns direction ─────────────────────────────────────────────
{
  /*
    THE WORST THING THIS SECTION DID. A single tape row carried green and
    red in three columns meaning three different things: which side of the
    spread the print HIT (mechanical), how the day's volume split (a
    ratio), and what the print IMPLIES (bullish/bearish, which accounts for
    calls against puts). A put sold on the bid read SELL in red, BID 93% in
    red and BULLISH in green, on one line.

    Direction is the interpretation, because that is what a reader means by
    the word. The mechanical facts keep their words and their bars.
  */
  const tape = files.find(f => f.path.endsWith('LiveTape.tsx'))!.src;

  check('the mechanical side is not inked as a direction',
    !/print\.side === 'ASK'[\s\S]{0,200}text-bull/.test(tape) && /sideInk\(print\.side\)/.test(tape));
  check('  · and its ink function refuses the direction hues',
    !/bull|bear/.test(sideInk('ASK') + sideInk('BID') + sideInk('MID')),
    `${sideInk('ASK')} · ${sideInk('BID')} · ${sideInk('MID')}`);
  check('  · while the words themselves survive, because they are the fact',
    /BUY/.test(tape) && /SELL/.test(tape) && /MID/.test(tape));

  check('the day-ratio label is not a second direction code',
    !/ratioBidPct >= 50 \? 'text-bear'/.test(tape));
  /* Its BAR keeps both tones: a magnitude display is what the doctrine
     reserves them for, and a split is a magnitude. */
  check('  · but its split bar keeps its two tones, being a magnitude',
    /bg-bear\/80[\s\S]{0,200}ratioBidPct/.test(tape) || /ratioBidPct[\s\S]{0,200}bg-bull\/90/.test(tape));

  check('the open-interest change states direction in its glyph, not a hue',
    /deltaOI > 0 \? '↑' : '↓'/.test(tape) && !/tnum \$\{r\.deltaOI > 0 \? 'text-bull'/.test(tape));

  /* The verdict keeps it — that is the one job. */
  check('and the bullish/bearish read keeps the ink', /BULLISH: 'text-bull'/.test(tape) && /BEARISH: 'text-bear'/.test(tape));
}

// ── the row is the unit, not the card ───────────────────────────────────
{
  /*
    Five hundred rows means zero containers. A border that repeats on every
    row of a table has stopped separating anything and become texture: the
    side chip alone put one on all 497 prints, and the page measured 672
    bordered rounded containers. The columns already separate the columns.
  */
  const tape = files.find(f => f.path.endsWith('LiveTape.tsx'))!.src;
  check('the per-row side chip is a word, not a bordered box',
    !/rounded border px-1 py-px font-mono/.test(tape));
  check('the six concentration cards are columns, not panels',
    !/rounded-md border px-2\.5 py-2 text-left/.test(tape));
  check('  · and still answer a pointer, with the hover and inset the desk already uses',
    /hover:bg-white\/\[0\.03\]/.test(tape) && /shadow-\[inset_2px_0_0_0_/.test(tape));

  const strip = readFileSync('src/components/trace/StatsStrip.tsx', 'utf8');
  check('the stats strip is a line under a hairline, not a panel',
    /border-b border-borderSubtle/.test(strip) && !/border border-borderSubtle bg-panel rounded-md/.test(strip));
  check('and a fact pill is a label, not a tinted box',
    !/border-supreme\/40 bg-supreme/.test(strip) && !/border-supreme\/40 bg-supreme/.test(tape));
}

// ── what was deliberately kept ──────────────────────────────────────────
{
  /*
    RESTRAINT IS NOT SUBTRACTION. `earnedInk` was already right and the
    pages simply bypassed it: three registers per column, measured over the
    rows on screen, so ink lands on the outlier rather than on everything.
    The magenta champion is a SYSTEM — one per column, applied by a shared
    function — and the measurement bore that out: two magenta nodes on the
    whole tape. It stays.
  */
  const ink = readFileSync('src/components/trace/earnedInk.ts', 'utf8');
  check('the three registers survive', /export function earnMarks/.test(ink) && /export const weightInk/.test(ink) && /export const directionInk/.test(ink));
  check('  · and the champion is still one per column, not a spray',
    /Math\.abs\(v\) >= m\.top \? 'text-supreme font-bold'/.test(ink));
  check('  · with intensity as weight rather than a hue', /intensity is weight, never a hue/.test(ink));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
