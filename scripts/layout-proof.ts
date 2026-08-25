/*
  The header fits the bar it is drawn in.

  WHY THIS EXISTS. The top nav switches on at `md` (768px) and wants 462px
  there. The right cluster — search chip, ticker, price, change, Sim badge,
  clock — wants another 355. With 32px of horizontal padding and two 16px
  gaps that is 881px of content in a 768px bar, and a flex row does not
  scroll: it clips. Measured in a browser at 768px, before the fix:

    header  scrollWidth 865  clientWidth 768   OVERFLOWS
    past the edge:  SPY $512.37 +2.47%   22:04:49 ET

  So on an iPad in portrait, and on every laptop between 768 and about 880,
  the terminal's own price readout and clock were cut off the right end — and
  `flex-1` on the brand mark absorbed the shortfall by shrinking it to exactly
  0px wide, so the logo silently vanished too. Nothing errored. Nothing
  scrolled. There was no symptom except missing pixels.

  Fixed by making the tabs labels-only below `lg` (the icon and the chevron
  are decoration beside a word that already names the tab) and holding the
  clock back to `lg`. Re-measured: 768px fits at exactly 768, with 157px back
  for the brand mark.

  WHAT THIS SCRIPT CAN AND CANNOT DO. It cannot measure — that needs a
  browser, and the CI gate has none. What it can do is pin the class ladder
  that the measurement validated, so the specific regression that produced
  the overflow cannot land silently: something inside the nav becoming
  visible at `md` again, or the clock dropping back to `md`.

  Run: npx tsx scripts/layout-proof.ts
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

const topbar = read('src/components/layout/TopBar.tsx');

check(
  'the TopBar source was found',
  topbar.length > 2000 && topbar.includes('<header'),
  `${topbar.length} chars`
);

// The nav itself still appears at md — that is deliberate. Below md there is
// no nav at all and the command palette is the only way around, so pushing it
// to lg would make a worse problem than the one being fixed.
check(
  'the nav still appears at md',
  /<nav className="hidden md:flex/.test(topbar),
  /<nav className="hidden md:flex/.test(topbar) ? 'hidden md:flex' : 'nav breakpoint moved — re-measure the budget'
);

// What must NOT come back at md: the per-tab icon, the chevron, the clock.
const GATED = [
  { what: 'the group icon', re: /<GroupIcon className=\{`hidden lg:block/ },
  { what: 'the tab chevron', re: /<ChevronDown className="hidden lg:block/ },
  { what: 'the header clock', re: /<span className="hidden lg:flex items-baseline gap-1 font-mono text-xs text-textSecondary/ },
];
for (const g of GATED) {
  check(
    `${g.what} stays behind lg`,
    g.re.test(topbar),
    g.re.test(topbar) ? 'gated at lg' : 'NOT gated at lg — the 768px bar overflows again'
  );
}

// And the tab padding tightens below lg, which is the rest of the saving.
check(
  'the tab padding tightens below lg',
  /px-2 lg:px-3/.test(topbar),
  /px-2 lg:px-3/.test(topbar) ? 'px-2 lg:px-3' : 'padding no longer steps down'
);

/*
  Guard the guard. Every check above is a regex against one file, so a
  wholesale rewrite of TopBar would fail them loudly — but a RENAME of the
  file would make read() throw, which is also loud. The quiet failure mode is
  a matched pattern that no longer means anything, so this asserts the two
  landmarks the ladder hangs off are both present and distinct.
*/
const mdCount = (topbar.match(/\bmd:/g) ?? []).length;
const lgCount = (topbar.match(/\blg:/g) ?? []).length;
check(
  'the header still has a two-step responsive ladder',
  mdCount >= 2 && lgCount >= 4,
  `${mdCount} md: rules, ${lgCount} lg: rules`
);

/*
  ---- Two panels that measure themselves rather than the window -------------

  Both of these live inside containers whose width comes from a layout, not
  from the viewport: the Key Levels rail sits in a Pulse widget on a
  12-column drag grid, and the Exposure Matrix sits in a page column. A media
  query cannot see either, so a viewport breakpoint would be a guess at the
  number that actually matters.

  The rail was the one that proved it. Three data columns need ~190px before
  the level name gets anything; six of twelve columns on a 390px phone gives
  171. The first fix put a minmax floor on the name and only moved the damage
  — the name fitted and the pressure figure clipped by 15px instead. There is
  no arrangement of three columns that reads at 171px, so below a threshold it
  shows two.

  Measured after the fix: 171px -> 2 columns, and 360 / 608 / 760 -> 3, all
  fitting. What is pinned here is the mechanism, since the gate has no browser
  to re-measure with.
*/
const SELF_MEASURING = [
  { file: 'src/components/gex/KeyLevelsRail.tsx', what: 'the Key Levels rail' },
  { file: 'src/components/gex/ExposureMatrix.tsx', what: 'the Exposure Matrix' },
];
for (const { file, what } of SELF_MEASURING) {
  const src = read(file);
  const observes = /new ResizeObserver\(/.test(src) && /\.observe\(/.test(src);
  const reads = /clientWidth|scrollWidth/.test(src);
  check(
    `${what} measures its own container`,
    observes && reads,
    observes && reads ? 'ResizeObserver + a width read' : `observer:${observes} widthRead:${reads}`
  );
  check(
    `${what} disconnects its observer`,
    /ro\.disconnect\(\)/.test(src),
    /ro\.disconnect\(\)/.test(src) ? 'cleaned up on unmount' : 'observer leaks past unmount'
  );
}

// The rail's threshold has to stay a real number, not drift to 0 (always three
// columns, back to the clipping) or to Infinity (always two, on a 27in screen).
const rail = read('src/components/gex/KeyLevelsRail.tsx');
const threshold = Number(rail.match(/const DIST_COLUMN_MIN = (\d+)/)?.[1] ?? NaN);
check(
  'the rail keeps a sane width threshold',
  threshold >= 180 && threshold <= 400,
  Number.isFinite(threshold) ? `DIST_COLUMN_MIN = ${threshold}` : 'DIST_COLUMN_MIN not found'
);

// ---- Nothing clickable is mouse-only --------------------------------------

/*
  A div with an onClick and a cursor-pointer looks interactive, answers a
  mouse, and does not exist for a keyboard. src/components/ui/interactiveRow.ts
  was written for exactly this and says so in its own header — and until now
  ONE file imported it. Eight hand-rolled clickable rows had between them: no
  tab stop, no key handler, and in two cases a role="button" that announced a
  control to a screen reader and then ignored Enter.

  THE SCAN NEEDS A REAL PARSER, NOT A REGEX. The first version of this matched
  JSX attributes with `(?:[^<>]|\{[^{}]*\})*?`, which cannot survive a
  multi-line arrow function in an onKeyDown — so it reported two components as
  broken that were already correct. Attributes are extracted here by walking
  forward from the tag name tracking brace depth and quote state, which is the
  only way to know where the tag actually ends.

  Verified in a browser, not just in the source: a Live Tape row takes focus
  and Enter opens the drilldown; a Stocks header button takes focus and Enter
  re-sorts the table (JPM -> XOM) with aria-sort following; and Compass reports
  87 focus stops with zero role="button" elements that cannot be focused.

  ONE PATTERN THAT LOOKS LIKE THE DEFECT AND IS NOT. The positioning map's 21
  strike bands are a roving tabindex: exactly one carries tabIndex 0 and the
  other twenty carry -1, with arrow keys moving focus along the rail. A
  browser sweep counting "role=button that cannot be focused" reports twenty
  offenders there and is wrong every time — that is the standard ARIA
  composite-widget pattern, it is documented at the call site against WCAG
  2.5.8, and it works: arrows walk the strikes and Enter selects one. This
  scan reads the SOURCE, where the band's spread carries both tabIndex and
  onKeyDown, so it passes correctly. Anyone re-checking this in a browser
  should expect those twenty and leave them alone.
*/
function attrsOf(src: string, from: number): string | null {
  let i = from, depth = 0, quote: string | null = null;
  while (i < src.length) {
    const c = src[i];
    if (quote) {
      if (c === quote && src[i - 1] !== '\\') quote = null;
    } else if (c === '"' || c === "'" || c === '`') {
      quote = c;
    } else if (c === '{') {
      depth++;
    } else if (c === '}') {
      depth--;
    } else if (c === '>' && depth === 0) {
      return src.slice(from, i);
    } else if (c === '<' && depth === 0) {
      return null; // ran into the next tag — malformed for our purposes
    }
    i++;
  }
  return null;
}

const NATIVE = new Set(['button', 'a', 'input', 'select', 'textarea', 'summary', 'label']);
const mouseOnly: string[] = [];
let clickSites = 0;

function walkTsx(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walkTsx(full, out);
    else if (entry.endsWith('.tsx')) out.push(full);
  }
  return out;
}

for (const file of walkTsx(path.join(ROOT, 'src'))) {
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(/<([a-z][a-zA-Z0-9]*)\s/g)) {
    const tag = m[1];
    if (NATIVE.has(tag)) continue;
    const attrs = attrsOf(src, m.index! + m[0].length);
    if (attrs === null || !/\bonClick\b/.test(attrs)) continue;
    // A backdrop closes on Escape and must not be a tab stop of its own.
    if (/aria-hidden/.test(attrs)) continue;
    // role="tooltip" with a stopPropagation click is not a control.
    if (/role="tooltip"/.test(attrs)) continue;
    clickSites++;
    const reachable =
      (/\btabIndex\b/.test(attrs) && /\bonKeyDown\b/.test(attrs)) ||
      /interactiveRowProps\(/.test(attrs);
    if (!reachable) mouseOnly.push(`${rel}:${src.slice(0, m.index!).split('\n').length}<${tag}>`);
  }
}

check(
  'the clickable-element scan found sites to check',
  clickSites >= 6,
  `${clickSites} non-native clickable element(s) parsed`
);
check(
  'no clickable element is mouse-only',
  mouseOnly.length === 0,
  mouseOnly.length ? mouseOnly.join(', ') : `all ${clickSites} reachable by keyboard`
);

/*
  And the helper has to keep doing its job. It is spread onto elements, so a
  version of it that quietly stopped returning tabIndex or onKeyDown would
  leave every adopter mouse-only again with nothing else to notice.
*/
const helper = read('src/components/ui/interactiveRow.ts');
check(
  'interactiveRowProps still returns a tab stop and a key handler',
  /tabIndex: 0/.test(helper) && /onKeyDown: rowKeyDown\(/.test(helper),
  /tabIndex: 0/.test(helper) ? 'tabIndex 0 + onKeyDown' : 'the helper stopped returning them'
);
const answersBoth = /e\.key !== 'Enter' && e\.key !== ' '/.test(helper);
check(
  'the row key handler answers Enter and Space',
  answersBoth,
  answersBoth ? 'Enter and Space' : 'the key set changed — Space is the one browsers do not fire click for on a tr'
);

// ---- Nothing loops forever against the reader's wishes --------------------

/*
  This codebase honours prefers-reduced-motion carefully — four @media blocks
  in index.css, a <MotionConfig reducedMotion="user"> around the whole app, and
  three useReducedMotion call sites where finer control was wanted. Two
  animations still slipped past all of it: `.custom-pulse`, the live-indicator
  dot on every SignalBadge, and Tailwind's own `animate-pulse` and
  `animate-bounce`, which the config never disables.

  Measured in a browser before and after: infinite animations still running
  with reducedMotion=reduce went from 10 to 0. The live dot stays visible and
  stops moving — opacity 1, transform none — which is the point. Turning it
  off entirely would have hidden the fact that the desk is live.

  Two checks, because the two families fail differently: an infinite animation
  declared in index.css must have its selector inside a reduce block, and a
  Tailwind infinite-animation utility used anywhere in src must be named in
  one.
*/
const css = read('src/index.css');

/*
  Every reduce block's body, WITH COMMENTS STRIPPED.

  The first version kept them, and the comment above the block names
  `.custom-pulse` in its prose — so deleting the selector left the check green,
  because the string was still in there. That is the fourth guard in this
  session to pass on a comment describing the thing rather than the thing.
  Comments come out before anything is matched against.
*/
const stripComments = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '');
const reduceBodies = [...css.matchAll(/@media \(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\n\}/g)]
  .map(m => stripComments(m[1]))
  .join('\n');

check(
  'index.css still has reduced-motion blocks',
  reduceBodies.length > 100,
  `${reduceBodies.split('\n').length} lines across the reduce blocks`
);

// Selectors that declare an infinite animation outside a reduce block.
const infiniteSelectors: string[] = [];
for (const m of css.matchAll(/(\.[a-zA-Z][\w-]*)\s*\{[^}]*animation:[^;}]*\binfinite\b/g)) {
  const sel = m[1];
  // Skip declarations that are themselves inside a reduce block.
  if (reduceBodies.includes(sel)) continue;
  infiniteSelectors.push(sel);
}
check(
  'every infinite CSS animation is disabled under reduced motion',
  infiniteSelectors.length === 0,
  infiniteSelectors.length ? infiniteSelectors.join(', ') : 'all covered'
);

/*
  Tailwind's four looping utilities are not in index.css at all — they arrive
  from the framework, and nothing disables them by default.
*/
const TAILWIND_LOOPS = ['animate-spin', 'animate-ping', 'animate-pulse', 'animate-bounce'];
const usedLoops: string[] = [];
const uncovered: string[] = [];
for (const cls of TAILWIND_LOOPS) {
  const used = walkTsx(path.join(ROOT, 'src')).some(f =>
    new RegExp(`\\b${cls}\\b`).test(readFileSync(f, 'utf8'))
  );
  if (!used) continue;
  usedLoops.push(cls);
  if (!reduceBodies.includes(`.${cls}`)) uncovered.push(cls);
}
check(
  'the Tailwind loop scan found utilities in use',
  usedLoops.length > 0,
  usedLoops.length ? usedLoops.join(', ') : 'none used — did the scan break?'
);
check(
  'every Tailwind looping utility in use is disabled under reduced motion',
  uncovered.length === 0,
  uncovered.length ? `not covered: ${uncovered.join(', ')}` : `${usedLoops.length} in use, all covered`
);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
