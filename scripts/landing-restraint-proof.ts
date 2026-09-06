/*
  THE DESIGN PASS REACHES THE PAGE EVERYONE SEES FIRST.

  `pinpoint-restraint-proof` and `trace-restraint-proof` guard two desks.
  Nothing guarded the landing page, which is the one surface a reader meets
  before they have any reason to trust the product — and it was carrying
  thirteen type sizes, seven of them used once or twice.

  THE LANDING PAGE IS NOT A DESK, AND ITS DOCTRINE IS NOT A DESK'S.

  A desk is a state you study; its scale is built for density. A landing
  page is a sequence of claims, and it needs exactly six voices:

      60  the line that stops you        (one per page, by definition)
      36  the claim                      (one per section)
      30  the number the claim turns on  (a price)
      15  the sentence that explains it  (lead, and a card's title in bold)
      12  what you read at length, and the words you act on
      10  the labels that name what you are looking at

  Anything else is a size somebody typed once. Six, not five, because a
  marketing page has two things a desk has no use for: a display line and a
  price.

  AND IT QUOTES THE PRODUCT, WHICH KEEPS ITS OWN VOICE.

  `LiveSections` mounts the real panels — "Not screenshots. The actual
  panels, printing." is a true claim and the point of the page. Forcing
  those interiors onto the page's scale would make the product stop looking
  like itself in the one place a reader can see it working. So a panel
  interior may speak in a DESK's scale. What it may not do is invent a third
  vocabulary: `text-[17px]` and `text-[8px]` belonged to no scale at all,
  which is how they got there.
*/
import { readFileSync } from 'node:fs';

let pass = 0,
  fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

const read = (f: string) => readFileSync(`src/pages/landing/${f}`, 'utf8');
/* Prose and comments are not markup. A comment naming a banned size would
   otherwise trip the check that bans it — the same trap `landing-claims-proof`
   documents for copy. */
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

/** Tailwind's default scale, for the steps this page actually uses. */
const NAMED: Record<string, number> = { '2xl': 24, '3xl': 30, '4xl': 36, '5xl': 48, '6xl': 60, '7xl': 72, base: 16, lg: 18, xl: 20, sm: 14, xs: 12 };

const sizesIn = (src: string): Map<number, number> => {
  const out = new Map<number, number>();
  const bump = (px: number) => out.set(px, (out.get(px) ?? 0) + 1);
  for (const m of stripComments(src).matchAll(/text-\[(\d+)px\]/g)) bump(Number(m[1]));
  for (const m of stripComments(src).matchAll(/\btext-(2xl|3xl|4xl|5xl|6xl|7xl|base|lg|xl|sm|xs)\b/g)) bump(NAMED[m[1]]);
  return out;
};

const PAGE_VOICE = [60, 36, 30, 15, 12, 10];
/* What the desks themselves speak, so a quoted panel can be quoted. Trace's
   scale is 9/10/11/13/18 and Pinpoint's is 10/11/13/18/28; these are their
   union, and they are asserted in those sections' own proofs. */
const DESK_VOICE = [9, 10, 11, 13, 18, 28];

const list = (m: Map<number, number>) =>
  [...m.entries()].sort((a, b) => b[0] - a[0]).map(([px, n]) => `${px}px×${n}`).join(' ');

// ── the page's own voice ────────────────────────────────────────────────
{
  const own = new Map<number, number>();
  for (const f of ['Landing.tsx', 'PricingExtras.tsx']) {
    for (const [px, n] of sizesIn(read(f))) own.set(px, (own.get(px) ?? 0) + n);
  }
  check('PREMISE: the page has type to audit', own.size > 0, list(own));

  const stray = [...own.keys()].filter(px => !PAGE_VOICE.includes(px)).sort((a, b) => b - a);
  check('the page speaks in six sizes and no more', stray.length === 0,
    stray.length ? `${stray.map(p => `${p}px`).join(', ')} belongs to no voice` : list(own));

  /* A scale nobody reaches for is not a scale. Every one of the six has to
     be earning its place, or the number six is just a different arbitrary. */
  const unused = PAGE_VOICE.filter(px => !own.has(px));
  check('  · and every one of the six is actually used', unused.length === 0,
    unused.length ? `${unused.join(', ')} declared but never drawn` : `${own.size} in use`);

  /* The display line is display BECAUSE it is alone. Two of them is two
     first impressions, which is none. */
  check('  · with exactly one display line on the page', (own.get(60) ?? 0) === 1, `${own.get(60) ?? 0}× 60px`);
}

// ── the quoted panels keep a real scale, not a third one ────────────────
{
  const quoted = sizesIn(read('LiveSections.tsx'));
  const allowed = [...new Set([...PAGE_VOICE, ...DESK_VOICE])];
  const stray = [...quoted.keys()].filter(px => !allowed.includes(px)).sort((a, b) => b - a);
  check('a quoted panel may speak in a desk’s scale, but not invent a third',
    stray.length === 0,
    stray.length ? `${stray.map(p => `${p}px`).join(', ')} is in neither vocabulary` : list(quoted));

  /* The claim the page makes about these panels is that they are the real
     ones. If they ever stop using a desk scale entirely, the claim is the
     first thing that has quietly become false. */
  const deskish = [...quoted.keys()].filter(px => DESK_VOICE.includes(px) && !PAGE_VOICE.includes(px));
  check('  · and it still sounds like a desk, which is the page’s whole claim',
    deskish.length > 0, `${deskish.sort((a, b) => b - a).join(', ')}px are the desks’ own`);
}

// ── a counter is not a direction ────────────────────────────────────────
{
  const live = stripComments(read('LiveSections.tsx'));
  const block = live.slice(live.indexOf('const PILLARS'), live.indexOf('const Pillars'));
  check('PREMISE: the three pillars are on the page', /'01'/.test(block) && /'03'/.test(block));
  /*
    They carried `text-select`, `text-flip` and `text-bear` on the numerals
    01, 02 and 03. Only the flip's blue was true. "The flow" printed in bear
    red on the page whose job is to teach a reader that red means price
    going down, before they have ever opened a desk.
  */
  const painted = [...block.matchAll(/text-(select|flip|bear|bull|warn|supreme)\b/g)].map(m => m[0]);
  check('  · and none of them spends a direction token on a numeral',
    painted.length === 0, painted.length ? painted.join(', ') : 'the counters are ink');
}

// ── the nav has a ground, not just a filter ─────────────────────────────
{
  const src = stripComments(read('Landing.tsx'));
  const bar = src.slice(src.indexOf('header className="fixed'), src.indexOf('</header>'));
  check('PREMISE: the page has a fixed nav', bar.length > 0);
  /*
    It was `bg-white/[0.045]` and leaned entirely on `backdrop-blur`.
    Measured on the same pixels with the two grounds swapped live, the bar's
    background went mean 28.94 / brightest 150 over copy, against mean 5.90
    / brightest 22 with a ground — and its own secondary labels sit near 163,
    so body text scrolling under it was competing with its own navigation.
    A blur redistributes brightness; it does not remove it.
  */
  const ground = bar.match(/bg-(canvas|panel|inset)\/\[?([0-9.]+)\]?/);
  check('the nav is legible over anything, not only over the hero',
    !!ground && Number(ground[2]) >= 0.8,
    ground ? `bg-${ground[1]} at ${ground[2]}` : 'no opaque ground on the bar');
  check('  · and the glass is still glass', /backdrop-blur/.test(bar));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
