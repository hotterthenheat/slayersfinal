import { readFileSync, readdirSync } from 'node:fs';

/*
==================================================
  SLAYER TERMINAL - PROOF · PINPOINT RESTRAINT
  (scripts/pinpoint-restraint-proof.ts)
==================================================

  The section was rebuilt from zero on 2026-09-06 and came out as eight
  identical rounded cards per page, each with a coloured inset rule and a
  coloured dot, ten hues on one screen, eleven type sizes and a subtitle
  under every heading. All of it was removed. This file is why it stays
  removed.

  A doctrine written only in a comment is a doctrine that lasts until the
  next hurried edit. These are the four rules that were expensive to
  arrive at, expressed as things a build can fail on:

    ONE TYPE SCALE      five sizes and three weights, and nothing between
                        them. A step a reader cannot perceive is not a
                        level of hierarchy.
    COLOUR IS RATIONED  direction, magnitude, three identities, one
                        warning. Every other colour on a Pinpoint surface
                        is greyscale, and it comes from the doctrine file
                        rather than a hex typed at the call site.
    NO CARDS            the page is the surface. `Pane` is the single
                        border, and only around content that scrolls.
    THE RAMP IS NOT INK the house heat is for bars and cells. A greek in
                        gold TEXT beside a wall in green is two colour
                        codes doing one job.
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

const FILES = [
  ...readdirSync('src/pages/pinpoint').filter(f => f.endsWith('.tsx')).map(f => `src/pages/pinpoint/${f}`),
  ...readdirSync('src/components/pinpoint').filter(f => f.endsWith('.tsx')).map(f => `src/components/pinpoint/${f}`),
];

// ---- one type scale ---------------------------------------------------------------
{
  const ALLOWED = new Set(['10', '11', '13']);
  const strays = new Map<string, string[]>();
  for (const f of FILES) {
    for (const m of code(f).matchAll(/text-\[(\d+)px\]/g)) {
      if (ALLOWED.has(m[1])) continue;
      strays.set(m[1], [...(strays.get(m[1]) ?? []), f.replace('src/', '')]);
    }
  }
  check(
    'three type sizes and no others',
    strays.size === 0,
    strays.size ? [...strays].map(([px, fs]) => `${px}px in ${[...new Set(fs)].join(', ')}`).join(' · ') : '10 · 11 · 13',
  );

  /*
    THE CEILING, PINNED AGAINST THE DESKS EITHER SIDE OF IT.

    Measured on the built pages: Trace's largest type is 14px and Terrain's
    is 13px. Pinpoint used to print a regime at 28 and a figure at 18, which
    made the section a reader moves between three desks feel like three
    products. The number below is not a preference — it is the measurement,
    and if a future edit reaches for a headline again this fails rather than
    the section quietly drifting apart.
  */
  const CEILING = 13;
  const tallest = Math.max(
    ...FILES.flatMap(f => [...code(f).matchAll(/text-\[(\d+)px\]/g)].map(m => Number(m[1]))),
  );
  check(
    `nothing on a desk is larger than ${CEILING}px — Terrain's ceiling, one under Trace's`,
    tallest <= CEILING,
    `tallest type in the section is ${tallest}px`,
  );

  /* 400, 600, 700. `font-medium` is 500 and `font-black` is 900 — the first
     is a step nobody can see next to 400, the second was two escalations at
     once on a numeral that was already the largest thing on its desk. */
  const badWeight = FILES.filter(f => /font-(medium|black|extrabold|light|thin|extralight)\b/.test(code(f)));
  check('three weights — 400, 600, 700', badWeight.length === 0, badWeight.map(f => f.replace('src/', '')).join(', ') || 'no 500 and no 900');

  /* THE EMPHASIS BUDGET. `lead` is the one number a desk is about, so a desk
     spends it once or not at all — a page with three 28px figures on it has
     not ranked them, it has just shouted three times. Six of the nine desks
     spend nothing here on purpose: their hero is a chart, and the chart is
     the emphasis. */
  const overspent = readdirSync('src/pages/pinpoint')
    .filter(f => f.endsWith('.tsx'))
    .map(f => [f, (code(`src/pages/pinpoint/${f}`).match(/size="lead"/g) ?? []).length] as const)
    .filter(([, n]) => n > 1);
  check('no desk spends `lead` twice', overspent.length === 0, overspent.map(([f, n]) => `${f} ×${n}`).join(', ') || 'at most one per desk');

  const desk = read('src/components/pinpoint/Desk.tsx');
  check('the scale is declared once, in Desk.tsx', /export const TYPE = \{/.test(desk));
  for (const step of ['label', 'body', 'read', 'num', 'figure', 'lead']) {
    check(`  · TYPE.${step} exists`, new RegExp(`\\b${step}:`).test(desk));
  }
}

// ---- colour is rationed -----------------------------------------------------------
{
  /* The doctrine file may spell hexes; it is the definition. Everywhere else
     imports a name, so a palette change reaches the whole section at once.
     FACTOR_STEP in Targets is the one exception and it is greyscale by
     construction — five steps down the same neutral, checked below. */
  const offenders: string[] = [];
  for (const f of FILES) {
    for (const m of code(f).matchAll(/#[0-9A-Fa-f]{6}/g)) {
      const hex = m[0].toLowerCase();
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      const grey = Math.max(r, g, b) - Math.min(r, g, b) <= 6;
      if (grey) continue;
      offenders.push(`${f.replace('src/', '')} :: ${m[0]}`);
    }
  }
  check('no desk invents a hue at the call site', offenders.length === 0, offenders.join(' · ') || 'every colour comes from ink.ts');

  const ink = read('src/components/pinpoint/ink.ts');
  check('the doctrine names direction', /export const regimeInk/.test(ink) && /export const signInk/.test(ink));
  check('the doctrine names the identities', /export const SELECT/.test(ink) && /FLIP/.test(ink) && /SPOT/.test(ink));
  check('the doctrine names one warning', /export const WARN/.test(ink));
  check('a grade is brightness, not a traffic light', /export const gradeInk/.test(ink) && !/gradeInk[\s\S]{0,220}(LONG_GAMMA|SHORT_GAMMA|#F2C94C)/.test(ink));
  check('the metric hues are gone — a desk says which greek in words', !/\bink:\s*'#/.test(ink) && /reads:/.test(ink));

  /* Targets' five-segment bar. The copy claims position is what names a
     segment, so the fill may only mark where one ends and the next begins. */
  const targets = read('src/pages/pinpoint/Targets.tsx');
  const steps = [...targets.matchAll(/#([0-9a-f]{6})/gi)].map(m => m[1].toLowerCase());
  check(
    'the factor bar is greyscale in five steps',
    steps.length === 5 && steps.every(h => {
      const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
      return r === g && g === b;
    }),
    steps.join(' '),
  );
  const lum = steps.map(h => parseInt(h.slice(0, 2), 16));
  check('  · and it descends, so the leading reason is the brightest', lum.every((v, i) => i === 0 || v < lum[i - 1]), lum.join(' > '));
}

// ---- the ramp is not ink ----------------------------------------------------------
{
  /* heatInk.pos / heatInk.neg are the two poles of the house heat as TEXT.
     They belong to bars and cells; a desk that prints a word in them is
     running a second direction code beside green and red. The Legend under
     a chart is the exception — it is labelling the bars themselves. */
  const offenders: string[] = [];
  for (const f of FILES) {
    for (const line of code(f).split('\n')) {
      if (!/heatInk\.(pos|neg)/.test(line)) continue;
      if (/Legend|items=|label:/.test(line)) continue;
      if (/background|fill|stroke/.test(line)) continue;
      offenders.push(`${f.replace('src/', '')} :: ${line.trim().slice(0, 90)}`);
    }
  }
  check('the heat poles never colour a word', offenders.length === 0, offenders.join(' · ') || 'bars and cells only');

  /* Its only two consumers outside the section print calls and puts, and
     they sit inches from walls drawn in green and red. */
  for (const f of ['src/components/gex/BasisDrift.tsx', 'src/components/gex/StrikeAttributionPanel.tsx']) {
    check(`${f.replace('src/components/gex/', '')} speaks the direction pair`, /CALL_WALL/.test(read(f)) && !/CALL_SIDE/.test(read(f)));
  }
}

// ---- one surface, one radius, one rhythm --------------------------------------------
{
  /*
    THIS RULE USED TO SAY THE OPPOSITE, and it was wrong in a way worth
    recording rather than quietly reversing.

    It asserted that Section had NO border, radius or fill: version one had
    given every card a box and a coloured stripe, the section came out as a
    scatter of identical floating panels, and the correction was to delete
    the decoration. But the fault was never that the cards had a border —
    it was that the border was UNIFORM, so it distinguished nothing. What
    the deletion produced was one flat black plane with grey text on it, and
    Noah's verdict on that was "looks very ai slop and not polished".

    So the guard is not "no surface" any more. It is ONE surface, ONE
    radius, and one rhythm — which is what actually stops a UI from looking
    unfinished, and which a uniform-decoration failure would still break.
  */
  const desk = read('src/components/pinpoint/Desk.tsx');
  check('Section is a panel — a surface, a header rule, its content',
    /<section className=\{`[^`]*bg-panel/.test(desk) && /border-b border-borderSubtle/.test(desk));
  check('  · and it takes its surface from the palette rather than a hex', !/<section[\s\S]{0,200}#[0-9a-f]{6}/i.test(desk));

  /* ONE RADIUS PER ROLE. `rounded-lg` on a panel, `rounded-md` on a control
     and a nested grid, and nothing else — a radius that varies component by
     component is the same failure as spacing that does. */
  const radii = [...new Set([...desk.matchAll(/rounded-(\w+)/g)].map(m => m[1]))].sort();
  check('two radii and no more — a panel and a control',
    radii.length <= 2 && radii.every(r => ['lg', 'md'].includes(r)),
    radii.join(', ') || 'none');

  /* ONE CONTROL LOOK, and it carries a focus ring. A keyboard reader could
     tab the whole metric rail with nothing on screen saying where they were. */
  check('every control shares one exported look', /export const CONTROL =/.test(desk));
  check('  · and it can be seen from the keyboard', /focus-visible:ring/.test(desk));
  /*
    BUTTONS, not rows. A table row's hover is a row hover — it marks what the
    pointer is over in a list, it is not a control, and it has no focus ring
    to share. What must be uniform is the thing a reader CLICKS: the first
    cut of this rule flagged six desks and half of them were `<tr>`.
  */
  const ownStates: string[] = [];
  for (const f of FILES) {
    if (f === 'src/components/pinpoint/Desk.tsx') continue;
    for (const line of code(f).split('\n')) {
      if (!/<button/.test(line)) continue;
      if (!/hover:bg-/.test(line)) continue;
      if (/CONTROL/.test(line)) continue;
      ownStates.push(`${f.replace('src/', '')} :: ${line.trim().slice(0, 60)}`);
    }
  }
  check('no desk rolls its own control look', ownStates.length === 0, ownStates.join(' · ') || 'every button is on CONTROL');
  check('Pane is the one box, and it is for scrolling content', /export const Pane/.test(desk) && /border border-borderSubtle/.test(desk));

  /* Every clipped, scrolling region draws its edge. A list that was cut off
     and a list that ended look identical without one. */
  const unfenced: string[] = [];
  for (const f of FILES) {
    for (const line of code(f).split('\n')) {
      if (!/overflow-(y-)?auto/.test(line)) continue;
      if (/<Pane|border border-borderSubtle/.test(line)) continue;
      unfenced.push(`${f.replace('src/', '')} :: ${line.trim().slice(0, 80)}`);
    }
  }
  check('every scrolling region draws its edge', unfenced.length === 0, unfenced.join(' · ') || 'all fenced');

  /*
    AND THE INVERSE, which is the half that was missing and the half that
    actually shipped a bug.

    The rule above asks "does every scrolling region have an edge". Nothing
    asked the opposite: does every region with a CAPPED HEIGHT actually clip?
    A `max-h` with visible overflow caps the box and lets the content paint
    straight out of the bottom of it — on the Flow desk the print tape ran
    out of its pane and through the site footer, so the page's footer links
    sat interleaved with rows of prints. It only appears once the tape is
    long enough to exceed the cap, so every freshly loaded screenshot and
    every sweep run showed it correct.

    `Pane` owns the overflow now, so this catches the other shape: a bare
    element given a height cap and nothing to clip it.
  */
  /* The components that clip for their caller, verified by this same file:
     each sets `overflow-auto` on its own root, so a height cap handed to one
     of them is clipped by it. Named rather than pattern-matched — a
     whitelist a reader can check against the source beats a regex that
     silently absolves anything shaped like a component. */
  const CLIPS_ITSELF = /<Pane|<ExposureLadder|<HeatGrid/;
  /*
    AND THE WHITELIST IS VERIFIED, NOT ASSUMED — which is the difference
    between a guard and a comment.

    The first cut of this absolved `<Pane` on sight. Deleting `overflow-auto`
    from Pane, which is EXACTLY the bug that shipped, still passed: every
    call site says `<Pane`, the whitelist waved them all through, and the
    rule proved nothing about the one component it most needed to. Each
    clipper's own definition is checked here, so the absolution is earned.

    Pane is matched on its declaration rather than the whole file, or any
    stray `overflow-auto` elsewhere in Desk.tsx would vouch for it.
  */
  const paneDecl = (desk.match(/export const Pane = [\s\S]*?\n\);/) ?? [''])[0];
  const clippers: [string, string][] = [
    ['Pane', paneDecl],
    ['ExposureLadder', read('src/components/pinpoint/ExposureLadder.tsx')],
    ['HeatGrid', read('src/components/pinpoint/HeatGrid.tsx')],
  ];
  const notClipping = clippers.filter(([, src]) => !/overflow-auto/.test(src)).map(([n]) => n);
  check('the components that clip for their callers still do', notClipping.length === 0,
    notClipping.length ? `${notClipping.join(', ')} no longer clips` : clippers.map(([n]) => n).join(', '));

  /* A cap often sits on its own `className` line inside a multi-line element,
     so the line alone cannot say what it belongs to. Track the last element
     opened and attribute the cap to it. */
  const uncapped: string[] = [];
  for (const f of FILES) {
    let openTag = '';
    for (const line of code(f).split('\n')) {
      const tag = line.match(/<([A-Za-z][\w.]*)/);
      if (tag) openTag = `<${tag[1]}`;
      if (!/max-h-\[/.test(line)) continue;
      if (CLIPS_ITSELF.test(line) || CLIPS_ITSELF.test(openTag)) continue;
      if (/overflow-(y-)?(auto|hidden|scroll)/.test(line)) continue;
      uncapped.push(`${f.replace('src/', '')} :: ${openTag} ${line.trim().slice(0, 60)}`);
    }
  }
  check('every capped height also clips', uncapped.length === 0, uncapped.join(' · ') || 'no height cap leaks its content');

  /* The effects that made version one look like a template. */
  const effects = FILES.filter(f => /gradient|shadow-|backdrop-blur|rounded-(xl|2xl|3xl)/.test(code(f).replace(/repeating-linear-gradient[^)]*\)/g, '')));
  check('no gradients, glows or big radii', effects.length === 0, effects.map(f => f.replace('src/', '')).join(', ') || 'none');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
