import { readFileSync, readdirSync } from 'node:fs';

/*
==================================================
  SLAYER TERMINAL - PROOF · PINPOINT RESTRAINT
  (scripts/pinpoint-restraint-proof.ts)
==================================================

  The section's design system, as things a build can fail on. It has been
  rebuilt three times; each time the doctrine lived in a comment and lasted
  until the next hurried edit. These are the rules that were expensive to
  arrive at (components/pinpoint/Desk.tsx says why), checked against the
  source of every page and component in the section:

    ONE TYPE SCALE      five named tokens at three sizes and three weights,
                        and no arbitrary size anywhere. A step a reader
                        cannot perceive is not a level of hierarchy.
    ONE SPACE SCALE     4 · 8 · 12 · 16 · 24 · 32. No half-steps in a page.
    TWO RADII           4px on a control, 6px on the one box.
    NO CARDS            a Region is a heading and a hairline; the Surface
                        that answers a selection is the one box, and a
                        Pane draws its edge because it scrolls.
    ONE CONTROL LOOK    every button on CONTROL; every choice a Segmented
                        or a Select; every clickable row a Row the
                        keyboard can reach.
    COLOUR IS RATIONED  direction, magnitude, three identities, one
                        warning — from ink.ts, never a hex at a call site.
    NOTHING MOVES       by itself. The route swap has no travel and the
                        section honours reduced motion.
    ONE METHOD          per desk, at the foot, where the explaining lives.
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
/** Comments explain the old values on purpose — they are not the surface. */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const short = (f: string) => f.replace('src/', '');

const PAGES = readdirSync('src/pages/pinpoint').filter(f => f.endsWith('.tsx')).map(f => `src/pages/pinpoint/${f}`);
const COMPONENTS = readdirSync('src/components/pinpoint').filter(f => f.endsWith('.tsx')).map(f => `src/components/pinpoint/${f}`);
const FILES = [...PAGES, ...COMPONENTS];
const DESKS = PAGES.filter(f => !/PinpointLayout/.test(f));
/** The two files that ARE the system may spend a 2px inset on a control. */
const CHROME = new Set(['src/components/pinpoint/Desk.tsx', 'src/components/pinpoint/Strip.tsx']);

// ---- one type scale ---------------------------------------------------------------
{
  const desk = read('src/components/pinpoint/Desk.tsx');
  check('the scale is declared once, in Desk.tsx', /export const TYPE = \{/.test(desk));
  for (const step of ['label', 'body', 'title', 'read', 'num', 'figure', 'lead']) {
    check(`  · TYPE.${step} exists`, new RegExp(`\\b${step}:`).test(desk));
  }

  /* The tokens live in the Tailwind config, with their line-heights, and the
     ceiling is Terrain's — measured, not chosen. */
  const tw = read('tailwind.config.ts');
  const tokens = Object.fromEntries(
    [...tw.matchAll(/^\s+(label|body|title|read|num): \['(\d+)px'/gm)].map(m => [m[1], Number(m[2])]),
  );
  check('the five tokens are in the Tailwind config', ['label', 'body', 'title', 'read', 'num'].every(k => k in tokens), Object.entries(tokens).map(([k, v]) => `${k} ${v}`).join(' · '));
  const CEILING = 13;
  check(`nothing in the scale is larger than ${CEILING}px — Terrain's ceiling`, Object.values(tokens).every(v => v <= CEILING));
  check('three sizes and no more', new Set(Object.values(tokens)).size === 3, [...new Set(Object.values(tokens))].sort().join(' · '));

  /* No arbitrary size, and no Tailwind size either: a page writes the role. */
  const strays: string[] = [];
  for (const f of FILES) {
    for (const m of code(f).matchAll(/\btext-(\[\d+(?:\.\d+)?px\]|xs|sm|base|lg|xl|\dxl)\b/g)) strays.push(`${short(f)} :: text-${m[1]}`);
  }
  check('no desk sets a size outside the tokens', strays.length === 0, [...new Set(strays)].slice(0, 6).join(' · ') || 'text-label · body · title · read · num only');

  const badWeight = FILES.filter(f => /font-(medium|black|extrabold|light|thin|extralight)\b/.test(code(f)));
  check('three weights — 400, 600, 700', badWeight.length === 0, badWeight.map(short).join(', ') || 'no 500 and no 900');

  const overspent = DESKS.map(f => [short(f), (code(f).match(/size="lead"/g) ?? []).length] as const).filter(([, n]) => n > 1);
  check('no desk spends `lead` twice', overspent.length === 0, overspent.map(([f, n]) => `${f} ×${n}`).join(', ') || 'at most one per desk');

  /* A region's name is sentence case. Uppercase is the label's, and a title
     that shouts in the label's voice is the reason nothing ranked. */
  const regionH2 = (desk.match(/export const Region[\s\S]*?<h2 className=\{`([^`]*)`\}/) ?? ['', ''])[1];
  check('a region title is sentence case', regionH2.includes('TYPE.title') && !/uppercase/.test(regionH2) && !/uppercase/.test((desk.match(/title: '([^']*)'/) ?? ['', ''])[1]));
}

// ---- one space scale --------------------------------------------------------------
{
  /* 4 · 8 · 12 · 16 · 24 · 32 → Tailwind 1 2 3 4 6 8, plus px and auto. A
     half-step chosen per call site is the most legible sign that nobody
     drew the thing. */
  const OFF = /\b-?(?:p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|gap-x|gap-y|space-x|space-y)-(?:0\.5|1\.5|2\.5|3\.5|5|7|9|10|11|12|14|16|20|\[[^\]]+\])(?=[\s"'`}])/g;
  const offenders: string[] = [];
  for (const f of FILES) {
    const src = code(f);
    for (const m of src.matchAll(OFF)) {
      /* The chrome may inset a control by 2px — that is the one half-step
         the system spends, and it spends it in one place. */
      if (CHROME.has(f) && /-0\.5$/.test(m[0])) continue;
      offenders.push(`${short(f)} :: ${m[0]}`);
    }
  }
  check('every page is on the space scale', offenders.length === 0, [...new Set(offenders)].slice(0, 8).join(' · ') || '1 · 2 · 3 · 4 · 6 · 8');
}

// ---- two radii --------------------------------------------------------------------
{
  const radii = new Map<string, Set<string>>();
  for (const f of FILES) {
    for (const m of code(f).matchAll(/\brounded(?:-[\w[\]]+)?/g)) {
      if (!radii.has(m[0])) radii.set(m[0], new Set());
      radii.get(m[0])!.add(short(f));
    }
  }
  const allowed = new Set(['rounded', 'rounded-md', 'rounded-t']);
  const bad = [...radii].filter(([r]) => !allowed.has(r));
  check('two radii — a control and the box', bad.length === 0, bad.map(([r, fs]) => `${r} in ${[...fs].join(', ')}`).join(' · ') || [...radii.keys()].join(' · '));
}

// ---- no cards ---------------------------------------------------------------------
{
  const desk = read('src/components/pinpoint/Desk.tsx');
  const region = (desk.match(/export const Region = [\s\S]*?\n\);/) ?? [''])[0];
  const surface = (desk.match(/export const Surface = [\s\S]*?\n\);/) ?? [''])[0];
  const pane = (desk.match(/export const Pane = [\s\S]*?\n\);/) ?? [''])[0];
  check('a Region is a heading and a hairline — no border, no fill, no radius', region.length > 0 && !/\bborder (?!border-b)|\bbg-panel|\brounded/.test(region.replace(/border-b border-borderSubtle/g, '')));
  check('  · and it separates its heading with a rule', /border-b border-borderSubtle/.test(region));
  check('the Surface is the one box', /rounded-md border border-borderSubtle bg-panel/.test(surface));
  check('the Pane clips and draws its edge', /overflow-auto/.test(pane) && /border border-borderSubtle/.test(pane));
  check('Section is gone', !/export const Section\b/.test(desk) && FILES.every(f => !/<Section\b/.test(code(f))));

  /* No page draws a box of its own. `border-b`/`border-t` are rules, which
     are allowed; a full `border` with a fill is a card. */
  const boxes: string[] = [];
  for (const f of DESKS) {
    for (const line of code(f).split('\n')) {
      if (/\bborder\b(?!-)/.test(line) && /\bborder-borderSubtle\b|\bborder-borderMuted\b/.test(line) && !/<Pane|<Surface|<Segmented|<Select/.test(line)) boxes.push(`${short(f)} :: ${line.trim().slice(0, 70)}`);
    }
  }
  check('no desk draws a box of its own', boxes.length === 0, boxes.slice(0, 5).join(' · ') || 'Surface and Pane only');

  const effects = FILES.filter(f => /gradient|shadow-|backdrop-blur|holo-/.test(code(f).replace(/repeating-linear-gradient[^)]*\)/g, '')));
  check('no gradients, glows, blur or foil', effects.length === 0, effects.map(short).join(', ') || 'none');
}

// ---- one control look -------------------------------------------------------------
{
  const desk = read('src/components/pinpoint/Desk.tsx');
  check('every control shares one exported look', /export const CONTROL =/.test(desk));
  check('  · and it can be seen from the keyboard', /focus-visible:ring/.test(desk));
  check('  · in the product’s own focus colour', /focus-visible:ring-select/.test(desk));
  check('a choice of N is a Segmented, with aria-pressed', /export const Segmented/.test(desk) && /aria-pressed=\{o\.value === value\}/.test(desk));
  check('a choice from a list is a native Select', /export const Select/.test(desk) && /<select/.test((desk.match(/export const Select[\s\S]*?\n\);/) ?? [''])[0]));

  const ownStates: string[] = [];
  for (const f of FILES) {
    if (CHROME.has(f)) continue;
    for (const line of code(f).split('\n')) {
      if (/<button/.test(line) && /hover:bg-|hover:text-/.test(line) && !/\bCONTROL\b|\bROW\b/.test(line)) ownStates.push(`${short(f)} :: ${line.trim().slice(0, 60)}`);
    }
  }
  check('no desk rolls its own control look', ownStates.length === 0, ownStates.slice(0, 4).join(' · ') || 'every button is on CONTROL');

  const imported = DESKS.filter(f => /components\/ui\/(SegmentedControl|FilterTabs|Chip)'/.test(read(f)));
  check('no desk imports a second control grammar', imported.length === 0, imported.map(short).join(', ') || 'Segmented and Select only');

  /* A row a mouse can click and a keyboard cannot. */
  const deaf: string[] = [];
  for (const f of DESKS) {
    for (const line of code(f).split('\n')) {
      if (/<(tr|li|div|td|span)\b[^>]*\bonClick=/.test(line)) deaf.push(`${short(f)} :: ${line.trim().slice(0, 60)}`);
    }
  }
  check('every clickable row is a Row, which the keyboard can reach', deaf.length === 0, deaf.slice(0, 5).join(' · ') || 'no bare onClick on a row');
  const row = (desk.match(/export const Row = [\s\S]*?\n\);/) ?? [''])[0];
  check('  · and Row carries the contract', /interactiveRowProps/.test(row) && /ROW_INTERACTIVE/.test(row));
  const bars = read('src/components/pinpoint/StrikeBars.tsx');
  check('  · the strike bars too', /tabIndex=\{0\}/.test(bars) && /onKeyDown/.test(bars));
}

// ---- colour is rationed -----------------------------------------------------------
{
  const offenders: string[] = [];
  for (const f of FILES) {
    for (const m of code(f).matchAll(/#[0-9A-Fa-f]{6}\b/g)) {
      const hex = m[0].toLowerCase();
      const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
      if (Math.max(r, g, b) - Math.min(r, g, b) <= 6) continue;
      offenders.push(`${short(f)} :: ${m[0]}`);
    }
  }
  check('no desk invents a hue at the call site', offenders.length === 0, offenders.join(' · ') || 'every colour comes from ink.ts');

  const ink = read('src/components/pinpoint/ink.ts');
  check('the doctrine names direction', /export const regimeInk/.test(ink) && /export const signInk/.test(ink));
  check('the doctrine names the identities', /export const SELECT/.test(ink) && /FLIP/.test(ink) && /SPOT/.test(ink));
  check('the doctrine names one warning', /export const WARN/.test(ink));
  check('a grade is brightness, not a traffic light', /export const gradeInk/.test(ink) && !/gradeInk[\s\S]{0,220}(LONG_GAMMA|SHORT_GAMMA|#F2C94C)/.test(ink));
  check('the metric hues are gone — a desk says which greek in words', !/\bink:\s*'#/.test(ink) && /reads:/.test(ink));

  const targets = read('src/pages/pinpoint/Targets.tsx');
  const steps = [...targets.matchAll(/#([0-9a-f]{6})/gi)].map(m => m[1].toLowerCase());
  check('the factor bar is greyscale in five steps', steps.length === 5 && steps.every(h => h.slice(0, 2) === h.slice(2, 4) && h.slice(2, 4) === h.slice(4, 6)), steps.join(' '));
  const lum = steps.map(h => parseInt(h.slice(0, 2), 16));
  check('  · and it descends, so the leading reason is the brightest', lum.every((v, i) => i === 0 || v < lum[i - 1]), lum.join(' > '));

  const heatWords: string[] = [];
  for (const f of FILES) {
    for (const line of code(f).split('\n')) {
      if (!/heatInk\.(pos|neg)/.test(line)) continue;
      if (/Legend|items=|label:|background|fill|stroke/.test(line)) continue;
      heatWords.push(`${short(f)} :: ${line.trim().slice(0, 90)}`);
    }
  }
  check('the heat poles never colour a word', heatWords.length === 0, heatWords.join(' · ') || 'bars and cells only');
  for (const f of ['src/components/gex/BasisDrift.tsx', 'src/components/gex/StrikeAttributionPanel.tsx']) {
    check(`${f.replace('src/components/gex/', '')} speaks the direction pair`, /CALL_WALL/.test(read(f)) && !/CALL_SIDE/.test(read(f)));
  }
}

// ---- what scrolls, and what clips -------------------------------------------------
{
  const desk = read('src/components/pinpoint/Desk.tsx');
  const unfenced: string[] = [];
  for (const f of FILES) {
    for (const line of code(f).split('\n')) {
      if (/overflow-(y-)?auto/.test(line) && !/<Pane|border border-borderSubtle/.test(line)) unfenced.push(`${short(f)} :: ${line.trim().slice(0, 80)}`);
    }
  }
  check('every scrolling region draws its edge', unfenced.length === 0, unfenced.join(' · ') || 'all fenced');

  /* The inverse — a capped height that does not clip paints straight
     through whatever sits below it. The clippers are verified, not assumed:
     each one's own declaration is checked for the overflow it promises. */
  const CLIPS_ITSELF = /<Pane|<ExposureLadder|<HeatGrid/;
  const paneDecl = (desk.match(/export const Pane = [\s\S]*?\n\);/) ?? [''])[0];
  const clippers: [string, string][] = [
    ['Pane', paneDecl],
    ['ExposureLadder', read('src/components/pinpoint/ExposureLadder.tsx')],
    ['HeatGrid', read('src/components/pinpoint/HeatGrid.tsx')],
  ];
  const notClipping = clippers.filter(([, src]) => !/overflow-auto/.test(src)).map(([n]) => n);
  check('the components that clip for their callers still do', notClipping.length === 0, notClipping.length ? `${notClipping.join(', ')} no longer clips` : clippers.map(([n]) => n).join(', '));
  const uncapped: string[] = [];
  for (const f of FILES) {
    let openTag = '';
    for (const line of code(f).split('\n')) {
      const tag = line.match(/<([A-Za-z][\w.]*)/);
      if (tag) openTag = `<${tag[1]}`;
      if (!/max-h-\[/.test(line)) continue;
      if (CLIPS_ITSELF.test(line) || CLIPS_ITSELF.test(openTag)) continue;
      if (/overflow-(y-)?(auto|hidden|scroll)/.test(line)) continue;
      uncapped.push(`${short(f)} :: ${openTag} ${line.trim().slice(0, 60)}`);
    }
  }
  check('every capped height also clips', uncapped.length === 0, uncapped.join(' · ') || 'no height cap leaks its content');
}

// ---- nothing moves by itself --------------------------------------------------------
{
  const layoutPath = 'src/pages/pinpoint/PinpointLayout.tsx';
  const layout = read(layoutPath);
  check('the route swap is a cross-fade with no travel', !/\by:\s*-?\d/.test(code(layoutPath)) && /opacity/.test(layout));
  check('the section honours reduced motion', /<MotionConfig reducedMotion="user">/.test(layout));
  check('the shell imports no boxed rail', !/components\/ui\/SubNav/.test(layout) && /components\/pinpoint\/Strip/.test(layout));
  const stripPath = 'src/components/pinpoint/Strip.tsx';
  const strip = read(stripPath);
  check('the strip is one hairline, not a box', (code(stripPath).match(/\bborder-b\b/g) ?? []).length === 1 && !/bg-panel|holo-/.test(code(stripPath)));
  check('  · with the desks reachable below xl', /data-subnav-select/.test(strip) && /xl:hidden/.test(strip));
  check('  · and no icon beside a tab', !/page\.icon|<page\.icon|<TabIcon/.test(strip));
  const animated = FILES.filter(f => /animate-(pulse|bounce|spin|marquee|border-trace|cursor-blink)|custom-pulse/.test(code(f)));
  check('no desk animates at rest', animated.length === 0, animated.map(short).join(', ') || 'none');
}

// ---- one method per desk ----------------------------------------------------------
{
  const counts = DESKS.map(f => [short(f), (code(f).match(/<Method\b/g) ?? []).length] as const);
  const wrong = counts.filter(([, n]) => n !== 1);
  check('every desk explains itself once, at the foot', wrong.length === 0, wrong.map(([f, n]) => `${f} ×${n}`).join(', ') || `${counts.length} desks`);
  const desk = read('src/components/pinpoint/Desk.tsx');
  check('  · as a native disclosure the keyboard can open', /<details/.test(desk) && /<summary/.test(desk));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
