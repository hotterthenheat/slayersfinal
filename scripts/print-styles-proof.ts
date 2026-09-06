/*
  Acceptance test for Part 15's "print/export styles where relevant", and
  for the air-pocket honesty note.

  A print stylesheet is untestable in the useful sense — nobody here can
  read the paper. What CAN be asserted is that the four failures that make
  a dark single-page app unprintable are each addressed, because each has a
  specific cause in the CSS and each is invisible on screen. A rule that
  silently stops matching is exactly the kind of regression nobody notices
  until somebody prints.
*/
import { readFileSync } from 'node:fs';
import { POCKET_NOT_DEPTH } from '../src/data/airPockets';
import { TERMS } from '../src/data/terms';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

const css = readFileSync('src/index.css', 'utf8');
const at = css.indexOf('@media print');
check('there is a print sheet at all', at > 0);

/* The block, isolated — every assertion below must be about rules that are
   INSIDE it. A rule that reaches the screen would break the desk. */
const block = css.slice(at);
check('and it is the last block, so nothing follows it out of scope', !block.slice(14).includes('@media print'));

// ---- 1 · the background inverts ----------------------------------------------
check('paper is white', /background:\s*#ffffff\s*!important/i.test(block));
check('and the ink is dark', /--print-ink:\s*#1/.test(block));
check('the panel fills are cleared too, not just the body', /\.bg-panel[\s\S]{0,120}background:\s*#ffffff/i.test(block));
/* Without this the printed page is a set of unlabelled rectangles: the fill
   that separated panels is gone, so the border has to do the work. */
check('and borders darken to carry the separation', /border-color:\s*#bbbbbb/i.test(block));

// ---- 2 · the chrome goes --------------------------------------------------
for (const el of ['header', 'footer', 'nav']) {
  check(`${el} is hidden`, new RegExp(`(^|[\\s,])${el},`, 'm').test(block));
}
check('and an opt-out hook exists for anything else', /\[data-print='hide'\]/.test(block));

// ---- 3 · THE SCROLL PRISON, which is the one that silently prints a stub ----
/* `h-screen` + `overflow-y-auto` means the printed output is one viewport
   tall and the rest is gone. Both have to be released; either alone still
   clips. */
check('height is released', /height:\s*auto\s*!important/.test(block));
check('max-height too', /max-height:\s*none\s*!important/.test(block));
check('AND overflow, or it still clips at the viewport', /overflow:\s*visible\s*!important/.test(block));
{
  /* The selector list the release is attached to — everything between the
     previous rule's close and this rule's open. Read exactly rather than
     with a loose "does the word appear anywhere above" test, which would
     pass on `main` appearing in a comment. */
  const at = block.indexOf('height: auto');
  const open = block.lastIndexOf('{', at);
  const prevClose = block.lastIndexOf('}', open);
  /* Comments come out BEFORE the split, not after: a comment containing a
     comma would otherwise be split into fragments, one of which could match
     a selector name and pass this test for the wrong reason. */
  const selector = block.slice(prevClose + 1, open).replace(/\/\*[\s\S]*?\*\//g, '');
  const parts = selector.split(',').map(x => x.trim()).filter(Boolean);
  check('the release names main', parts.includes('main'), parts.join(' | '));
  check('and the app root, which is the other half of the prison', parts.includes('#root'));
  check('and body, so a page that scrolls the document is freed too', parts.includes('body'));
}
/* The shell really does impose it — if that ever changes, the rules above
   are dead weight and this assertion is what says so. */
{
  const shell = readFileSync('src/components/layout/AppShell.tsx', 'utf8');
  check('PREMISE: the shell is h-screen', /h-screen/.test(shell));
  check('PREMISE: and the main column scrolls', /overflow-y-auto/.test(shell));
}

// ---- 4 · nothing animated, blurred or floating ------------------------------
for (const [what, re] of [
  ['animation', /animation:\s*none\s*!important/],
  ['transitions', /transition:\s*none\s*!important/],
  ['shadows', /box-shadow:\s*none\s*!important/],
  ['backdrop blur', /backdrop-filter:\s*none\s*!important/],
] as const) {
  check(`no ${what} on paper`, re.test(block));
}

// ---- direction survives ------------------------------------------------------
/* An exposure table printed with every figure the same colour has lost the
   thing the table is for. */
check('bull keeps a hue', /text-bull[\s\S]{0,80}color:\s*#0/.test(block));
check('bear keeps a hue', /text-bear[\s\S]{0,80}color:\s*#9/.test(block));
check('and the two differ', /#076b3a/.test(block) && /#92160f/.test(block));

// ---- table and page-break manners --------------------------------------------
check('a panel is kept off a page break where it can be', /break-inside:\s*avoid/.test(block));
check('and a table repeats its headings', /display:\s*table-header-group/.test(block));

// ---- the air pocket is not a depth read --------------------------------------
/*
  "Air pocket" is a DEPTH word — a trader reads it as a thin order book.
  This desk has no level-two source at all, and the read is a gamma void in
  the options chain, which is a different claim. Said in three places
  because the wrong reading happens at the words, not in the header.
*/
check('the note refuses the depth reading', /order-book depth/i.test(POCKET_NOT_DEPTH));
check('and says no level-two source exists', /level-two/i.test(POCKET_NOT_DEPTH));
check('and states the claim it DOES make', /obliged to lean/i.test(POCKET_NOT_DEPTH));
check('the glossary entry says it too', /order-book depth/i.test(TERMS['Air pocket']));
check('and the glossary says which one it is', /not that no buyer is there/i.test(TERMS['Air pocket']));
{
  const src = readFileSync('src/data/airPockets.ts', 'utf8');
  check('the module header explains why the name misleads', /DEPTH word/i.test(src));
  check('and that a thin gamma band is not a thin book', /still absorbs size/i.test(src));

  const map = readFileSync('src/components/gex/PositioningMap.tsx', 'utf8');
  check('the map label carries the note', /POCKET_NOT_DEPTH/.test(map));
  check('for a screen reader as well as a hover', /aria-label=\{zone\.kind === 'air-pocket'/.test(map));
  /* Only that zone: the walls are exactly what they say they are, and
     hanging a disclaimer on them would teach the reader to ignore it. */
  check('and only on the pocket, not on every zone', /zone\.kind === 'air-pocket' \? POCKET_NOT_DEPTH : undefined/.test(map));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
