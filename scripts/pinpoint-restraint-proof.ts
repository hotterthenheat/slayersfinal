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
  const ALLOWED = new Set(['10', '11', '13', '18', '28']);
  const strays = new Map<string, string[]>();
  for (const f of FILES) {
    for (const m of code(f).matchAll(/text-\[(\d+)px\]/g)) {
      if (ALLOWED.has(m[1])) continue;
      strays.set(m[1], [...(strays.get(m[1]) ?? []), f.replace('src/', '')]);
    }
  }
  check(
    'five type sizes and no others',
    strays.size === 0,
    strays.size ? [...strays].map(([px, fs]) => `${px}px in ${[...new Set(fs)].join(', ')}`).join(' · ') : '10 · 11 · 13 · 18 · 28',
  );

  /* 400, 600, 700. `font-medium` is 500 and `font-black` is 900 — the first
     is a step nobody can see next to 400, the second was two escalations at
     once on a numeral that was already the largest thing on its desk. */
  const badWeight = FILES.filter(f => /font-(medium|black|extrabold|light|thin|extralight)\b/.test(code(f)));
  check('three weights — 400, 600, 700', badWeight.length === 0, badWeight.map(f => f.replace('src/', '')).join(', ') || 'no 500 and no 900');

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

// ---- no cards ---------------------------------------------------------------------
{
  const desk = read('src/components/pinpoint/Desk.tsx');
  check('Section draws a label, a hairline and its content', /border-b border-borderSubtle/.test(desk));
  check('  · and no border, radius or fill of its own', !/<section className=\{`[^`]*(rounded|bg-panel|border border)/.test(desk));
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

  /* The effects that made version one look like a template. */
  const effects = FILES.filter(f => /gradient|shadow-|backdrop-blur|rounded-(xl|2xl|3xl)/.test(code(f).replace(/repeating-linear-gradient[^)]*\)/g, '')));
  check('no gradients, glows or big radii', effects.length === 0, effects.map(f => f.replace('src/', '')).join(', ') || 'none');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
