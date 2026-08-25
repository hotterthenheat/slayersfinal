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

/*
  ---- A canvas whose pixels were resized by a price change ------------------

  MonteCarloPanel sets `canvas.width` from `clientWidth` inside its drawing
  effect, and that effect was keyed on the market data alone. So the backing
  store was resized by a PRICE TICK and by nothing else. Dragging the viewport
  left the chart stretched for 950-1507ms — which is the 1500ms feed tick, and
  reads as a slow redraw.

  It is not slow, it is absent, and playback is finite: once the active name's
  playhead pins (tick 78 for the eighteen short recordings, one minute
  fifty-seven), `spot` stops changing and the dependency that was accidentally
  standing in for a resize handler stops firing too. A window resize after that
  leaves the chart stretched for as long as the tab is open.

  Both halves are pinned, because either alone is a guard that proves nothing:
  an observer nothing depends on is dead code, and a dependency with no
  observer never updates.

  Surface3D is deliberately NOT in this list — it re-checks its size on every
  animation frame because it is always spinning, so an observer would be a
  second mechanism for a fact already covered.
*/
{
  const src = read('src/pages/proveit/MonteCarloPanel.tsx');
  const observes = /new ResizeObserver\(/.test(src) && /\.observe\(/.test(src);
  const cleans = /ro\.disconnect\(\)/.test(src);
  check(
    'the Monte Carlo canvas observes its own width',
    observes && cleans,
    observes ? (cleans ? 'ResizeObserver, disconnected on unmount' : 'observer leaks past unmount') : 'no observer — the canvas is resized by the feed tick'
  );
  // the drawing effect must actually depend on it
  const wired = /\}, \[[^\]]*\bspot\b[^\]]*\bboxWidth\b[^\]]*\]\);/.test(src);
  check(
    'the Monte Carlo draw depends on the observed width, not only on the data',
    wired,
    wired
      ? 'the draw effect lists boxWidth alongside the market data'
      : 'the observed width is not in the draw effect deps — the observer changes nothing (renamed? update this check)'
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

// ---- One bad panel does not cost you the desk -----------------------------

/*
  Two nets, and only one of them was hung.

  AppShell's RouteBoundary catches anything a page throws and shows a fault
  card with a reload and a way back — so nothing could ever white-screen the
  terminal. But it catches at the ROUTE, which means a fault inside one Pulse
  widget replaces the WHOLE desk, and the reader loses a layout they arranged
  by hand to a hiccup in one panel.

  ErrorBoundary was written for exactly that and names it in its own header:
  "for surfaces that read live feed data and must fail small — a drilldown, a
  widget, a chart". One file had adopted it.

  Proved by breaking a widget on purpose rather than by reading the code: a
  deliberate throw in KeyLevelsWidget renders "KEY LEVELS COULD NOT RENDER"
  inside that panel's frame, with its header, ticker picker and close button
  intact, while the Live Chart, the pressure ladder and the positioning map
  carry on and no page fault appears.
*/
const shell = read('src/components/layout/AppShell.tsx');
check(
  'the route-level boundary is still wired',
  /class RouteBoundary/.test(shell) && /<RouteBoundary/.test(shell),
  /<RouteBoundary/.test(shell) ? 'AppShell wraps the outlet' : 'the page-level net is gone'
);
const routeResets = /prevProps\.resetKey !== this\.props\.resetKey/.test(shell);
check(
  'the route boundary clears itself on navigation',
  routeResets,
  routeResets ? 'resets on pathname change' : 'a page fault would stick across navigation'
);

const pulse = read('src/pages/workspace/Pulse.tsx');
check(
  'every Pulse widget renders inside its own boundary',
  /<ErrorBoundary label=\{def\.title\}/.test(pulse),
  /<ErrorBoundary/.test(pulse) ? 'wrapped per widget, labelled by title' : 'one widget can still take the desk'
);
const widgetResets = /resetKey=\{`\$\{inst\.id\}-\$\{inst\.ticker\}`\}/.test(pulse);
check(
  'a faulted widget retries when its ticker changes',
  widgetResets,
  widgetResets ? 'keyed on instance + ticker' : 'no resetKey — a faulted widget would stay stuck'
);

/*
  A panel that flips its own content on a timer must not use AnimatePresence
  mode="wait".

  MEASURED, on the landing page's "It calls the fade, too." card: 160 samples
  at 100ms over the card body, reading the MAX opacity across whatever states
  were mounted — the reader's question is "is anything legible right now", not
  "is the first child visible".

    mode="wait"  →  12 frames under 0.35 opacity, 9 of them at exactly 0
    crossfade    →   0 frames under 0.35, floor 0.7

  mode="wait" serialises exit-then-enter, so for the length of the exit there
  is nothing mounted at all. On a card that flips itself every 4.5s forever,
  that is a 290px hole roughly one frame in eighteen — which is how a landing
  screenshot caught it as a blank box. Fixed by stacking both states in one
  grid cell so they overlap and crossfade.

  The four other mode="wait" sites are route transitions: the reader pressed
  something, and a beat of blank between two pages is the transition. None of
  them holds a timer, which is exactly what this checks — a file that swaps on
  its own clock AND serialises the swap is the combination that blanks.

  The scan is file-level, not call-level: it cannot tell TopBar's clock timer
  from a timer that drives its dropdown. That direction is safe — it only ever
  widens the net, and a wider net on "never blank a panel the reader did not
  touch" costs nothing.
*/
const TIMER = /\bsetInterval\s*\(/;
const WAIT = /<AnimatePresence[^>]*\bmode=["']wait["']/;
const selfAdvancing = walkTsx(path.join(ROOT, 'src'))
  .map(f => ({ f: path.relative(ROOT, f).split(path.sep).join('/'), src: readFileSync(f, 'utf8') }))
  .filter(({ src }) => TIMER.test(src) && /<AnimatePresence/.test(src));
const blanking = selfAdvancing.filter(({ src }) => WAIT.test(src));
check(
  'nothing that swaps on its own timer serialises the swap',
  blanking.length === 0,
  blanking.length
    ? `${blanking.map(b => b.f).join(', ')} — mode="wait" leaves the panel empty between states`
    : `${selfAdvancing.length} file(s) hold both a timer and an AnimatePresence; none serialises`
);
const live = read('src/pages/landing/LiveSections.tsx');
const stacked = /min-h-\[290px\] grid grid-cols-1/.test(live) && /key=\{mode\}\s*\n\s*className="col-start-1 row-start-1"/.test(live);
check(
  'the fade card stacks its two states in one grid cell',
  stacked,
  stacked
    ? 'both states share col-start-1/row-start-1 — they overlap, so the height never jumps either'
    : 'the states no longer share a cell; a crossfade would stack them vertically or blank the card'
);

/*
  The landing tape demo accumulates the way the real tape does.

  `snapshot.tape` is what is NEW this tick — core/feed.ts serves each print
  exactly once, and LiveTape.tsx:1011-1024 accumulates. The landing demo read
  it as a window instead and rendered `.slice(0, 7)` of a four-print batch:

      measured, steady state:  4 rows, 143px of the 296px body empty

  48% void under a heading that reads "Not screenshots. The actual panels,
  printing." After mirroring LiveTape: 7 rows, 29px.

  The batch must also be reversed before it is prepended. The feed serves a
  tick chronologically and the list is newest-first, so prepending as-is makes
  the time column climb for four rows, drop back 23 seconds, and climb again.
  That is the same sawtooth LiveTape documents at line 1013 — it would have
  been reintroduced here the moment this demo started accumulating.
*/
const liveTape = read('src/pages/trace/LiveTape.tsx');
const ACCUM = /setRows\(prev => \[\.\.\.\[\.\.\.fresh\]\.reverse\(\), \.\.\.prev\]\.slice\(0, MAX_ROWS\)\)/;
check(
  'the real tape still prepends its batch reversed',
  ACCUM.test(liveTape),
  ACCUM.test(liveTape) ? 'LiveTape reverses the batch before prepending' : 'LiveTape changed shape — the demo below now mirrors nothing'
);
const demoAccum = /setPrints\(prev => \[\.\.\.\[\.\.\.fresh\]\.reverse\(\), \.\.\.prev\]\.slice\(0, DEMO_TAPE_ROWS\)\)/.test(live);
check(
  'the landing tape demo accumulates the same way',
  demoAccum,
  demoAccum ? 'same reversed prepend, capped at DEMO_TAPE_ROWS' : 'the demo no longer mirrors LiveTape — it will half-fill or sawtooth'
);
const readsAsWindow = /snapshot\.tape\.slice\(/.test(live);
check(
  'the landing demo does not read the tick batch as a window',
  !readsAsWindow,
  readsAsWindow ? 'snapshot.tape.slice(...) is back — that is a 4-print batch, not a window' : 'no slice of snapshot.tape'
);

/*
  Nothing paints a second label at a strike the chart already badges.

  MEASURED on /pulse/board at 1440x900. lightweight-charts draws a price
  line's axis badge on a layer ABOVE the series pane, so a canvas label at the
  same price loses whatever it paints behind itself:

      AAPL   "187.50 · 18%"  bottom half under PUT WALL · KING
      QQQ    "420 · 14%"     bottom half under CALL WALL · KING

  Two labels for one strike. The badge already names the level, so the
  strength label stands down and keeps its ink for the heavy strikes nothing
  else is naming. Both sides are asserted: the primitive has to consult the
  set, and StrikeChart has to fill it.

  The same label's dark backing pad was also mis-centred — the rect ran from
  yPix - padY to yPix + 12*vr because a `- 6*vr + 6*vr` in it cancelled, so
  the glyphs' top half sat on bare canvas while textBaseline was 'middle'.
  Pinned here as a symmetric rect around yPix.
*/
const prim = read('src/components/gex/gexNodesPrimitive.ts');
const chart = read('src/components/gex/StrikeChart.tsx');
const standsDown = /if \(lineKeys\.has\(lvl\.strike\.toFixed\(2\)\)\) return;/.test(prim);
check(
  'the trails label skips a strike that already carries a price line',
  standsDown,
  standsDown ? 'drawLabel returns early on a badged strike' : 'the label draws under the axis badge again'
);
const fed = /trailsRef\.current\?\.setPriceLines\(\[\.\.\.groups\.keys\(\)\]\.map\(Number\)\)/.test(chart);
const cleared = /trailsRef\.current\?\.setPriceLines\(\[\]\)/.test(chart);
check(
  'StrikeChart tells the trails which strikes it badged',
  fed && cleared,
  fed
    ? cleared
      ? 'set on every rebuild, cleared before it'
      : 'never cleared — turning levels off would keep the labels suppressed'
    : 'the set is never filled, so the primitive skips nothing'
);
const centred = /const halfH = 6 \* vr \+ padY;[\s\S]{0,220}?fillRect\(xRight - w - padX, yPix - halfH, w \+ padX \* 2, halfH \* 2\)/.test(prim);
check(
  "the label's backing pad is centred on the text it backs",
  centred,
  centred ? 'symmetric halfH either side of yPix' : 'the pad is offset from its glyphs again'
);

/*
  The spot marker's ticker carries its own plate.

  SpotRule is the shared "where the market is" rule — ten call sites across
  seven components — and it crosses the dealer-pressure fills. Its price is an
  inverted pill so it reads on anything; its ticker was plain textSecondary.
  Measured from rendered pixels on /pinpoint/exposure-profile at 390px:

      before   fg rgb(163,163,163) on the gold bar rgb(216,174,59)   1.21:1
      after    same fg on the plated rgb(36,30,12)                   6.58:1
      (over plain panel, unchanged in feel: 8.08:1)

  1.21:1 is not "hard to read". It is gone.
*/
const spotRule = read('src/components/ui/SpotRule.tsx');
const plated = /bg-canvas\/85[^"]*text-textSecondary|text-textSecondary[^"]*bg-canvas\/85/.test(spotRule);
check(
  'the spot rule plates its ticker so a coloured fill cannot eat it',
  plated,
  plated ? 'bg-canvas/85 behind the textSecondary ticker' : 'the ticker is unplated — it vanishes where the rule crosses a fill'
);

/*
  Two surfaces that only exist after a click, and were therefore in no sweep
  until now. Every measurement before this one — spill, unreachable content,
  contrast, panel fill — ran against pages in their default state. A drawer or
  a click-gated view could have been broken end to end and nothing would have
  said so. Both of these were.

  THE TIMEFRAME STRIP DID NOT WRAP. Seven buttons run 252px. The toolbar row
  holding them IS `flex-wrap`, but a flex ITEM wider than its line does not
  split — it spills. Measured on the Campaign Analysis chart at 390px:

      strip 163→416 inside a 198px lane; "1W" at 382–416

  on a 390px viewport, with every ancestor at overflow:visible. Not clipped,
  not scrollable — off the screen, unreachable, and the only way back to a
  weekly chart. Wrapping the strip itself puts 1D and 1W on a second line.

  THE MODAL HEADER HELD THREE TRACKS AT EVERY WIDTH. grid-cols-[1fr_auto_1fr]
  needs three tracks' worth of room. On the print drilldown at 390px the
  identity track was squeezed to about 100px and wrapped to seven lines, with
  the stepper and close button floating vertically centred in the middle of
  that stack. Measured header height, same print, same viewport:

      before   268px — 32% of an 844px phone
      after    110px — 13%
      768px     84px, 1440px 51px — both unchanged, the grid returns at sm
*/
const toolbar = read('src/components/gex/ChartToolbar.tsx');
const stripWraps = /role="group" aria-label="Timeframe" className="inline-flex flex-wrap items-center/.test(toolbar);
check(
  'the timeframe strip wraps instead of spilling off the screen',
  stripWraps,
  stripWraps ? 'inline-flex flex-wrap' : 'the strip is nowrap again — 1W leaves the viewport at 390px'
);
const modal = read('src/components/ui/Modal.tsx');
const headerStacks = /flex flex-wrap items-center[^"]*sm:grid sm:grid-cols-\[1fr_auto_1fr\]/.test(modal);
const identityFull = /className="w-full min-w-0 sm:w-auto">\{header\}/.test(modal);
check(
  'the modal header stacks below sm instead of squeezing three tracks',
  headerStacks && identityFull,
  headerStacks
    ? identityFull
      ? 'wraps under sm, grid at sm and up'
      : 'the identity no longer takes the full first row, so it squeezes again'
    : 'the header is back to a fixed three-track grid at every width'
);

/*
  A flex ITEM wider than its line does not split — it spills. Third instance
  in this pass, so it is a pattern rather than an accident:

      the chart's timeframe strip   7 buttons, 252px, 1W off the screen
      the modal's header identity   squeezed to ~100px, seven wrapped lines
      the tape's footer group       179→413 on a 390px viewport

  In each case the ROW was `flex-wrap` and the group inside it was not, so
  wrapping never reached the thing that needed it. Each fix is the same shape:
  let the inner group wrap too.

  These are class pins, not the measurement. The measurement is a browser
  sweep for text whose box crosses a viewport edge with nothing to scroll —
  which the earlier version of that sweep missed, because it only flagged runs
  whose LEFT edge was already past the edge.
*/
const tape = read('src/pages/trace/LiveTape.tsx');
const footerWraps = /ml-auto flex flex-wrap items-center justify-end gap-x-3 gap-y-1\.5/.test(tape);
check(
  "the tape's footer group wraps rather than running off the edge",
  footerWraps,
  footerWraps ? 'ml-auto group is flex-wrap' : 'the group is nowrap again — the marked count leaves a 390px screen'
);
const subnav = read('src/components/ui/SubNav.tsx');
const subnavWraps = /className="inline-flex flex-wrap items-center gap-0\.5 border border-borderSubtle/.test(subnav);
check(
  'the sub-page tab strip wraps rather than pushing the page sideways',
  subnavWraps,
  subnavWraps
    ? 'inline-flex flex-wrap'
    : "nowrap again — Pinpoint's three tabs run 411px into a 356px lane and <main> starts scrolling sideways"
);
const stocks = read('src/pages/Stocks.tsx');
const sectorScrolls = /<div className="flex flex-col overflow-x-auto">/.test(stocks);
check(
  'the sector rotation list takes its own overflow instead of the page',
  sectorScrolls,
  sectorScrolls
    ? 'overflow-x-auto on the list'
    : "the list is static again — its 614px grid minimum makes <main> 647px wide on a 390px screen"
);
const beamClipped = /<div className="relative h-\[16px\] overflow-x-clip">/.test(tape);
check(
  "the tape beam's positioning span cannot push the page sideways",
  beamClipped,
  beamClipped
    ? 'overflow-x-clip on the seam label wrapper'
    : 'unclipped again — the full-width translateX span hangs 97px past the panel at 390px'
);
const ranked = read('src/pages/pinpoint/RankedTargets.tsx');
const verdictWraps = /border-t border-borderSubtle\/60 flex flex-wrap items-center gap-x-2 gap-y-1/.test(ranked);
const netGexResponsive = (ranked.match(/hidden sm:block ml-auto w-24 shrink-0/g) ?? []).length === 2;
check(
  'the ranked ladder drops Net GEX on a phone, as it already drops its neighbours',
  netGexResponsive,
  netGexResponsive
    ? 'header and row both hidden below sm'
    : 'held at every width — 85px of sideways page scroll at 390px, for a number the podium already carries'
);
check(
  "the ranked target's verdict strip wraps rather than being eaten by its card",
  verdictWraps,
  verdictWraps
    ? 'flex-wrap with a row gap'
    : 'nowrap again — "DOWNSIDE CUSHION" ran 69px past the card edge at 768px and the card clipped it'
);

/*
  Free text the reader typed has to break.

  The community boards render whatever was put in the composer. Prose is
  fine; a pasted URL is not, and a URL in a trade idea is an ordinary thing
  to paste. Measured at 1440px by posting one and reading <main>:

      400-character unbroken token   main 2041px wider than the viewport
      a pasted URL                    main  748px wider
      long prose                      main  0px — which is why nothing
                                      caught this until something did

  The whole terminal slid sideways off one post, at every width, not just
  on a phone.

  The field list is derived from the types rather than typed here: every
  `string` member of the community entities that is not an id, an author, a
  timestamp or an enum is free text, and every place it is rendered must
  carry `break-words`. Add a field to the composer and it must be handled
  here too, or this fails.
*/
const communityTypes = read('src/types/community.ts');
const FREE_TEXT_EXCLUDE = new Set(['id', 'author', 'createdAt', 'ticker']);
const freeTextFields = [...new Set(
  [...communityTypes.matchAll(/^\s{2}([a-zA-Z]+)\??:\s*string;/gm)].map(m => m[1])
)].filter(f => !FREE_TEXT_EXCLUDE.has(f));
check(
  'the free-text field list came off the types',
  freeTextFields.length >= 4,
  freeTextFields.length ? `${freeTextFields.join(', ')}` : 'no string fields found — the types moved'
);
const communityPages = walkTsx(path.join(ROOT, 'src/pages/community'));
const unbroken: string[] = [];
let renderSites = 0;
for (const file of communityPages) {
  const src = readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  for (const field of freeTextFields) {
    // a JSX interpolation of that field, e.g. {idea.thesis} or {fb.message}
    for (const m of src.matchAll(new RegExp(`\\{[a-zA-Z]+\\.${field}\\}`, 'g'))) {
      const before = src.slice(Math.max(0, m.index! - 400), m.index!);
      // `key={item.title}` is a React key, not rendered text
      if (/(?:key|aria-label|title)=$/.test(before)) continue;
      renderSites++;
      const tagStart = before.lastIndexOf('<');
      const tag = tagStart === -1 ? before : before.slice(tagStart);
      if (!/break-words/.test(tag)) unbroken.push(`${rel}: ${m[0]}`);
    }
  }
}
check(
  'the free-text render sites were found',
  renderSites >= 4,
  `${renderSites} interpolation(s) of ${freeTextFields.length} field(s) across ${communityPages.length} page(s)`
);
check(
  'every rendered free-text field breaks long words',
  unbroken.length === 0,
  unbroken.length ? `no break-words on: ${unbroken.join(', ')}` : `all ${renderSites} render sites carry break-words`
);

/*
  Every write to localStorage is guarded.

  `setItem` throws — quota exceeded, a browser with site data switched off,
  Safari private mode. Six of the eight writes in this tree already caught
  it, with comments saying why. Two did not:

      data/community.ts saveCommunity        called straight out of a click
      CampaignAnalysis chart-prefs effect    throws inside useEffect

  Losing one saved preference is nothing. A throw out of a click handler or
  an effect is a page fault, and the reader loses the board rather than the
  post. Both now match their six neighbours.

  The scan is over the whole tree rather than a list, so a ninth write has
  to guard itself too.
*/
const writes: string[] = [];
let writeSites = 0;
for (const file of walkTsx(path.join(ROOT, 'src')).concat(
  // walkTsx only returns .tsx; the plain .ts modules write too
  (function walkTs(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walkTs(full, out);
      else if (entry.endsWith('.ts')) out.push(full);
    }
    return out;
  })(path.join(ROOT, 'src'))
)) {
  const src = readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  for (const m of src.matchAll(/localStorage\.setItem\(/g)) {
    // walk backwards counting braces to the enclosing function, looking for a try
    const before = src.slice(0, m.index!);
    const lastTry = before.lastIndexOf('try {');
    const lastFn = Math.max(before.lastIndexOf('function '), before.lastIndexOf('=> {'));
    writeSites++;
    if (lastTry === -1 || lastTry < lastFn) writes.push(`${rel}:${before.split('\n').length}`);
  }
}
check(
  'the localStorage write scan found the writes',
  writeSites >= 8,
  `${writeSites} setItem call(s) across src — the scan is looking at something`
);
check(
  'every localStorage write is inside a try',
  writes.length === 0,
  writes.length
    ? `unguarded: ${writes.join(', ')} — a full quota or a private window takes the page down, not the preference`
    : 'all guarded'
);

/*
  Everything in public/ is actually used.

  `public/` is copied verbatim into the build, so anything sitting there
  ships to every visitor whether or not a line of code asks for it. It held
  `assets/` — 19 PNGs, 2.1MB, arrived with the revamp-1 upload, not one of
  them referenced from src, index.html, docs or scripts. Five pairs were
  byte-identical duplicates of each other, and one was `auditor-ledger.png`,
  a screenshot of a feature that had already been deleted. That was 38% of
  the deployed bundle: 5.5MB down to 3.4MB by removing files nothing asked
  for. Git keeps every byte.

  Two directories are referenced by paths BUILT AT RUNTIME rather than
  written as literals, so a grep for their filenames finds nothing and they
  are allowed here by name with the reason:

      fonts/   the @font-face src in index.css, and the preload in index.html
      logos/   CompanyLogo.tsx builds `/logos/${TICKER}.svg` per row

  Anything else new in public/ has to be referenced or listed, which is the
  point: the next 2MB of screenshots cannot land quietly.
*/
const PUBLIC_ALLOW = new Map([
  ['fonts', '@font-face in index.css and the preload in index.html'],
  ['logos', 'CompanyLogo builds /logos/${TICKER}.svg at runtime'],
]);
const publicDir = path.join(ROOT, 'public');
const searchable = walkTsx(path.join(ROOT, 'src'))
  .concat((function walkAll(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walkAll(full, out);
      else if (/\.(ts|tsx|css|html|md|json)$/.test(entry)) out.push(full);
    }
    return out;
  })(path.join(ROOT, 'src')))
  .concat([path.join(ROOT, 'index.html')])
  .filter((f, i, a) => a.indexOf(f) === i);
const haystack = searchable.map(f => readFileSync(f, 'utf8')).join('\n');
const orphans: string[] = [];
for (const entry of readdirSync(publicDir)) {
  if (PUBLIC_ALLOW.has(entry)) continue;
  const full = path.join(publicDir, entry);
  const names = statSync(full).isDirectory() ? readdirSync(full).map(n => `${entry}/${n}`) : [entry];
  for (const n of names) {
    const stem = path.basename(n).replace(/\.[a-z0-9]+$/i, '');
    if (!haystack.includes(stem)) orphans.push(`public/${n}`);
  }
}
check(
  'the public/ scan had somewhere to look',
  searchable.length > 50 && haystack.length > 10000,
  `${searchable.length} source files searched`
);
check(
  'nothing in public/ ships without being asked for',
  orphans.length === 0,
  orphans.length
    ? `unreferenced, and shipping to every visitor: ${orphans.slice(0, 8).join(', ')}${orphans.length > 8 ? ` (+${orphans.length - 8} more)` : ''}`
    : `every entry is referenced, or allowed by name: ${[...PUBLIC_ALLOW.keys()].join(', ')}`
);

/*
  The heading outline does not skip a rank.

  Every desk renders exactly one h1 — the page name — and then nothing but
  Panels. Panel titled itself h3, so the outline read h1 -> h3 on twelve of
  the sixteen routes, and a reader navigating by heading level hears a
  section that is not there. Measured before and after with a walk of every
  visible h1..h6 in document order: 12 skips -> 0.

  Panel is not used on the landing page, whose own order was already correct,
  so this straightened the desks and left the marketing site alone. Anything
  nested INSIDE a panel — SignalMonitor's setup headline — stays h3, which is
  the right level under an h2.
*/
const panel = read('src/components/ui/Panel.tsx');
const titleIsH2 = /<h2 className="font-mono text-\[11px\] font-semibold uppercase tracking-widest text-textPrimary truncate">/.test(panel);
const noH3Title = !/<h3[^>]*>\s*\{title\}/.test(panel);
check(
  'Panel titles itself one level under the page, not two',
  titleIsH2 && noH3Title,
  titleIsH2 ? 'h2 under the page h1' : 'the panel title is not an h2 — the desk outline skips a rank again'
);
const nested = read('src/components/compass/SignalMonitor.tsx');
check(
  "a heading nested inside a panel stays under the panel's level",
  /<h3 className=\{`text-base font-semibold/.test(nested),
  /<h3/.test(nested) ? 'SignalMonitor headline is h3, under the panel h2' : 'the nested headline moved — check it still sits under h2'
);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
