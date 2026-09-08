import { readFileSync, readdirSync, existsSync } from 'node:fs';

/*
==================================================
  SLAYER TERMINAL - PROOF · PINPOINT RESTRAINT
  (scripts/pinpoint-restraint-proof.ts)
==================================================

  The section's design system, as things a build can fail on.

  IT HAS BEEN REBUILT FOUR TIMES and the fourth is the one this file was
  rewritten for. The first three argued about CONTAINERS — cards, then no
  cards, then regions and one box — and every one of them kept the same
  skeleton underneath: a hero, a rail, benches of small regions, each
  picture wrapped in a titled block and each block trailed by a sentence
  explaining it. Noah's verdict on the third: "no completely 100% redesign
  it."

  So the rules below are no longer about which box a thing sits in. They
  are about the grammar that replaced the boxes (components/pinpoint/Desk.tsx
  says why):

    ONE WORKSPACE       a desk is a toolbar, ONE picture, an inspector and
                        a strip of figures. No hero, no rail, no benches.
    THREE PICTURES      StrikeProfile, Series, HeatField. A desk draws one
                        of them large; anything else is a figure.
    NO PROSE            a desk gets ONE sentence, in <Read>. Everything
                        else is a label, a figure or a ten-pixel qualifier.
    ONE TYPE SCALE      five tokens at three sizes and three weights, and
                        no arbitrary size anywhere.
    ONE SPACE SCALE     4 · 8 · 12 · 16 · 24 · 32. No half-steps in a page.
    ONE RADIUS ON A CONTROL, and no desk draws a box at all — the only
                        bordered container left is the Pane that scrolls.
    ONE CONTROL LOOK    every button on CONTROL; every choice a Segmented
                        or a Select; every row the keyboard can reach.
    COLOUR IS RATIONED  direction, magnitude, three identities, one
                        warning — from ink.ts, never a hex at a call site.
    NOTHING MOVES       by itself. The route swap has no travel and the
                        section honours reduced motion.
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
const PICTURES = ['src/components/pinpoint/StrikeProfile.tsx', 'src/components/pinpoint/Series.tsx', 'src/components/pinpoint/HeatField.tsx'];

// ---- one workspace, and one picture in it -----------------------------------------
{
  const desk = read('src/components/pinpoint/Desk.tsx');
  check('the grammar is declared once, in Desk.tsx', /export const Workspace = /.test(desk));
  check('  · a toolbar, a picture, an inspector, a strip', ['toolbar', 'picture', 'inspector', 'strip'].every(k => new RegExp(`\\b${k}[,?}:]`).test(desk)));
  check('  · the picture gets the window and the inspector scrolls beside it', /lg:h-\[calc\(100vh/.test(desk) && /lg:overflow-y-auto/.test(desk));

  /* The shapes the last three versions were built from are GONE, not merely
     unused — a Deck left in the file is the next hurried edit's temptation. */
  for (const dead of ['Deck', 'Region', 'Surface', 'Section', 'Bench', 'Method', 'Note']) {
    check(`  · ${dead} is gone from the grammar`, !new RegExp(`export const ${dead}\\b|export function ${dead}\\b`).test(desk) && FILES.every(f => !new RegExp(`<${dead}\\b`).test(code(f))));
  }

  const noWorkspace = DESKS.filter(f => !/<Workspace\b/.test(code(f)));
  check('every desk is one Workspace', noWorkspace.length === 0, noWorkspace.map(short).join(', ') || `${DESKS.length} desks`);
  const halves = DESKS.filter(f => !/\bpicture=/.test(code(f)) || !/\binspector=/.test(code(f)));
  check('  · with both halves filled', halves.length === 0, halves.map(short).join(', '));
  const twice = DESKS.map(f => [short(f), (code(f).match(/<Workspace\b/g) ?? []).length] as const).filter(([, n]) => n > 2);
  check('  · and no desk stacks workspaces', twice.length === 0, twice.map(([f, n]) => `${f} ×${n}`).join(', ') || 'one, or one plus an empty state');

  /* THREE PICTURES, and they are the only large drawings in the section.
     A fourth chart component is how the last version ended up with six. */
  for (const p of PICTURES) check(`${short(p)} exists`, existsSync(p));
  const extras = COMPONENTS.filter(f => !CHROME.has(f) && !PICTURES.includes(f) && /<svg/.test(code(f)));
  check('no fourth picture', extras.length === 0, extras.map(short).join(', ') || PICTURES.map(short).join(' · '));
  const noPicture = DESKS.filter(f => !/<StrikeProfile|<Series\b|<HeatField/.test(code(f)));
  check('every desk draws one of the three', noPicture.length === 0, noPicture.map(short).join(', '));
  /* A picture draws to the box it is given rather than to a number a page
     guessed — the reason the old desks had a 720px chart in a 502px column. */
  for (const p of PICTURES) check(`  · ${short(p)} measures its box`, /useSize/.test(read(p)));
  const hardcoded = DESKS.flatMap(f => [...code(f).matchAll(/<(?:StrikeProfile|HeatField)[^>]*\bwidth=\{/g)].map(() => short(f)));
  check('  · and no desk hands one a fixed width', hardcoded.length === 0, [...new Set(hardcoded)].join(', ') || 'none');
}

// ---- no prose ---------------------------------------------------------------------
{
  /* THE RULE THAT MADE THIS A REDESIGN. Every desk used to carry two to
     four regions of explanation — a method disclosure, a note under each
     title, a paragraph under each picture. Noah: "i don't need to be told
     what page i'm on i know what i clicked." A desk gets one sentence. */
  const overspent = DESKS.map(f => [short(f), (code(f).match(/<Read>/g) ?? []).length] as const).filter(([, n]) => n > 1);
  check('a desk gets ONE sentence', overspent.length === 0, overspent.map(([f, n]) => `${f} ×${n}`).join(', ') || `${DESKS.length} desks`);

  /* Anything else that is a paragraph must be a ten-pixel qualifier — the
     size says it is a footnote rather than something to read. */
  const paras: string[] = [];
  for (const f of DESKS) {
    for (const line of code(f).split('\n')) {
      if (!/<p[\s>]/.test(line)) continue;
      if (/TYPE\.label/.test(line)) continue;
      paras.push(`${short(f)} :: ${line.trim().slice(0, 70)}`);
    }
  }
  check('  · and every other paragraph is a ten-pixel qualifier', paras.length === 0, paras.slice(0, 4).join(' · ') || 'no prose blocks left');

  /* A <details> disclosure was the Method's last hiding place. */
  check('no desk hides prose in a disclosure', DESKS.every(f => !/<details/.test(code(f))));
}

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

  /* A GROUP'S NAME IS A LABEL, which is the change the workspace made: the
     inspector is a column of ten-pixel names over hairlines, not a stack of
     sentence-case section titles competing with the picture. */
  const groupH2 = (desk.match(/export const Group[\s\S]*?<h2 className=\{`([^`]*)`\}/) ?? ['', ''])[1];
  check('a group is named in the label voice', groupH2.includes('TYPE.label') && groupH2.includes('text-textMuted'), groupH2 || 'no h2 in Group');
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

// ---- one radius, and no boxes -----------------------------------------------------
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
  check('one radius on a control, one on the pane', bad.length === 0, bad.map(([r, fs]) => `${r} in ${[...fs].join(', ')}`).join(' · ') || [...radii.keys()].join(' · '));
  const deskRadii = DESKS.filter(f => /\brounded/.test(code(f)));
  check('  · and no desk sets one of its own', deskRadii.length === 0, deskRadii.map(short).join(', ') || 'the chrome owns the corners');

  const desk = read('src/components/pinpoint/Desk.tsx');
  const group = (desk.match(/export const Group = [\s\S]*?\n\);/) ?? [''])[0];
  const pane = (desk.match(/export const Pane = [\s\S]*?\n\);/) ?? [''])[0];
  check('a Group is a name and a hairline — no border, no fill, no radius', group.length > 0 && !/\bbg-panel|\brounded/.test(group) && !/\bborder\b(?!-)/.test(group));
  check('  · and it separates its name with a rule', /border-b border-borderSubtle/.test(group));
  check('the Pane is the one bordered container, and it clips', /overflow-auto/.test(pane) && /border border-borderSubtle/.test(pane));

  /* No page draws a box of its own. `border-b`/`border-t`/`border-l` are
     rules, which are allowed; a full `border` is a card. */
  const boxes: string[] = [];
  for (const f of DESKS) {
    for (const line of code(f).split('\n')) {
      /* `border` the English word appears in this section's copy — the flip
         IS a border. A box is the class next to a border colour. */
      if (!/\bborder\b(?!-)/.test(line) || !/border-border(Subtle|Muted)|border-white/.test(line)) continue;
      if (/<Pane|<Segmented|<Select/.test(line)) continue;
      boxes.push(`${short(f)} :: ${line.trim().slice(0, 70)}`);
    }
  }
  check('no desk draws a box of its own', boxes.length === 0, boxes.slice(0, 5).join(' · ') || 'the Pane only');

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
  check('every clickable row is a Row or a Stat, which the keyboard can reach', deaf.length === 0, deaf.slice(0, 5).join(' · ') || 'no bare onClick on a row');
  const row = (desk.match(/export const Row = [\s\S]*?\n\);/) ?? [''])[0];
  check('  · and Row carries the contract', /interactiveRowProps/.test(row) && /ROW_INTERACTIVE/.test(row));
  const stat = (desk.match(/export const Stat = [\s\S]*?\n\};/) ?? [''])[0];
  check('  · a selectable Stat is a real button', /onSelect \?/.test(stat) && /<button/.test(stat) && /aria-current/.test(stat));
  const profile = read('src/components/pinpoint/StrikeProfile.tsx');
  check('  · and every row of the picture is a tab stop that answers Enter', /tabIndex=\{0\}/.test(profile) && /onKeyDown/.test(profile) && /role="button"/.test(profile));
  /* A picture a screen reader meets as an unlabelled graphic is a picture
     nobody without eyes can read. All three carry a written name. */
  const mute = PICTURES.filter(p => !/role="img"/.test(read(p)) || !/aria-label=\{ariaLabel\}/.test(read(p)));
  check('every picture states in words what it draws', mute.length === 0, mute.map(short).join(', ') || 'three pictures, three names');
  const noAria = DESKS.filter(f => !/ariaLabel=/.test(code(f)));
  check('  · and every desk fills that name in', noAria.length === 0, noAria.map(short).join(', '));
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
      /* The claim is about TEXT. The pictures resolve a BAR's ink from the
         same poles, which is the one place the ramp belongs. */
      if (!/\bcolor:|text-\[|className/.test(line)) continue;
      if (/Legend|items=|label:|background|fill|stroke/.test(line)) continue;
      heatWords.push(`${short(f)} :: ${line.trim().slice(0, 90)}`);
    }
  }
  check('the heat poles never colour a word', heatWords.length === 0, heatWords.join(' · ') || 'bars and cells only');
}

// ---- what scrolls, and what clips -------------------------------------------------
{
  const desk = read('src/components/pinpoint/Desk.tsx');
  /* A scroller with no edge stops mid-content with nothing to say it did.
     Either it draws a rule of its own, or it IS the picture, which fills a
     box the workspace already fenced. */
  const unfenced: string[] = [];
  for (const f of FILES) {
    for (const line of code(f).split('\n')) {
      if (!/overflow-(y-)?auto/.test(line)) continue;
      if (/border/.test(line) || /data-(strike-profile|heat-field)/.test(line) || /flex-1 min-h-0/.test(line)) continue;
      unfenced.push(`${short(f)} :: ${line.trim().slice(0, 80)}`);
    }
  }
  check('every scrolling region draws its edge or fills its picture', unfenced.length === 0, unfenced.join(' · ') || 'all fenced');

  /* The inverse — a capped height that does not clip paints straight
     through whatever sits below it. The clippers are verified, not assumed. */
  const CLIPS_ITSELF = /<Pane|<StrikeProfile|<HeatField/;
  const paneDecl = (desk.match(/export const Pane = [\s\S]*?\n\);/) ?? [''])[0];
  const clippers: [string, string][] = [
    ['Pane', paneDecl],
    ['StrikeProfile', read('src/components/pinpoint/StrikeProfile.tsx')],
    ['HeatField', read('src/components/pinpoint/HeatField.tsx')],
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
