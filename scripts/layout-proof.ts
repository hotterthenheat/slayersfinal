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

import { readFileSync } from 'node:fs';
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

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
