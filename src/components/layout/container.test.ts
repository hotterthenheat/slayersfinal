import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PAGE_CONTAINER, PAGE_GUTTER } from './container';

/*
==================================================
  SLAYER TERMINAL - ONE COLUMN (layout/container.test.ts)
  Every surface inside the shell lines up on the same left and right edge.

  It did not. Three widths were in play at once: the desks ran full-bleed with
  the shell's gutters, the Guide capped itself at max-w-5xl, and the legal pages
  capped at max-w-6xl and then left-aligned a narrower prose column inside that
  — so their text sat left of the page's midline while the bar above and the
  footer below were symmetric. A narrow document floating inside full-bleed
  chrome, and not even centred in its own box.

  Measured in a browser after the fix: 23 routes at 1280 / 1440 / 1920 / 2560,
  bar, body and footer sharing identical edges, the column centred, and every
  page's top-level blocks filling it. This suite keeps the SOURCE honest so that
  stays true without re-running a browser.
==================================================
*/

const SRC = join(process.cwd(), 'src');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

const FILES = walk(SRC).map(path => ({ path, text: readFileSync(path, 'utf8') }));
const rel = (p: string) => p.slice(SRC.length + 1);

/**
 * The landing page and the trailer live OUTSIDE the app shell — they are their
 * own full-bleed documents with their own measure, which is why they are not
 * held to the shell's column.
 */
const OUTSIDE_SHELL = /^pages\/(landing|trailer)\//;

describe('the page column', () => {
  it('caps nothing — the column is the viewport minus its gutters', () => {
    /*
      This test used to assert a cap was declared exactly once, and the cap
      itself was the bug. 1280px on a 1600px screen paints 310px of pure
      background and pushes the 13-column dark pool tape into a horizontal
      scroll while a third of the monitor sits empty next to it.

      So the rule inverted: the shared column must carry NO max-width in any
      spelling — neither the Tailwind scale (max-w-7xl) nor an arbitrary value
      (max-w-[1280px]) — because either one reintroduces the dead space.
    */
    expect(PAGE_CONTAINER).not.toMatch(/\bmax-w-/);
    expect(PAGE_CONTAINER).toContain('w-full');
  });

  it('is used by the bar, the body and the footer', () => {
    for (const shell of ['components/layout/TopBar.tsx', 'components/layout/AppShell.tsx', 'components/layout/SiteFooter.tsx']) {
      const f = FILES.find(x => rel(x.path) === shell);
      expect(f, `${shell} is missing`).toBeDefined();
      expect(f!.text, `${shell} must ride the shared column`).toContain('container');
    }
  });

  it('nothing inside the shell caps and centres itself', () => {
    /*
      The exact shape that caused it: an element that both caps its width and
      centres itself, which parks content in the middle of the screen.

      Named for a page's root element, but it reads every className in the file
      and the nested case is the one that survived longest: after the page cap
      was removed, the legal pages still centred a `max-w-3xl` prose column
      inside a full-width page and measured 200px of untouched width at 1440 and
      760px at 2560.

      This had TWO independent holes, and each one on its own made the check
      decorative:

      1. It read `className="…"` and nothing else. Under src/pages the split is
         2,613 double-quoted against 271 written {`…`}, because conditional
         classes need interpolation — so the guard was blind in the spelling the
         regression is most likely to arrive in. Reintroducing the original bug
         (the Guide capping itself at max-w-5xl) as a template literal left the
         suite green; the same edit in double quotes failed it.
      2. The arbitrary-value branch `\[[^\]]+\])\b` could never match ANYTHING,
         in either spelling. `]` is a non-word character, so the trailing `\b`
         demanded a word character immediately after the bracket, which never
         happens in a class list. `max-w-[1100px] mx-auto` sailed through from
         the day it was written.

      Both classes have to be read off the SAME attribute value: max-w on one
      element and mx-auto on another is not this bug.
    */
    const CLASS_ATTR = /className=(?:"([^"]*)"|'([^']*)'|\{\s*(?:`([^`]*)`|'([^']*)'|"([^"]*)")\s*\})/g;
    // `max-w-prose` and `max-w-screen-*` cap just as hard as `max-w-3xl` and
    // were both outside the original alternation.
    const CAPS_WIDTH = /\bmax-w-(?:\d?xl\b|prose\b|screen-\w+\b|\[[^\]]+\])/;
    const CENTRES = /\bmx-auto\b/;
    /*
      A declared exemption, not an allowlist in this file.

      One cap in the app is genuinely correct: the calibration plot on Prove It
      must be SQUARE, because a 45-degree reference line stops being 45 degrees
      the moment the plot is stretched. Encoding that as a path here would put
      the reason in the guard instead of at the site, and the next square figure
      would have to come back and edit the test.

      So a site opts out by saying so on the spot — `layout-cap-ok: <reason>`
      within the preceding 600 characters. That keeps the rule strict
      everywhere, keeps each exception's reasoning next to the code it excuses,
      and makes every exemption greppable.
    */
    const EXEMPT = /layout-cap-ok/;
    const setsOwnWidth = (text: string) =>
      [...text.matchAll(CLASS_ATTR)].some(m => {
        const classes = m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5] ?? '';
        if (!CAPS_WIDTH.test(classes) || !CENTRES.test(classes)) return false;
        return !EXEMPT.test(text.slice(Math.max(0, (m.index ?? 0) - 600), m.index));
      });
    /*
      `pages/` was not enough. The Weigher's root carried
      `mx-auto w-full max-w-[1180px]` and lives in `components/compass/`, so it
      parked the whole mode in the middle of a 2560 screen with ~660px of
      background either side while this suite stayed green. A cap does the same
      damage wherever it is declared.

      `components/ui/` is exempt: an overlay, a modal, a toast and a dropdown
      are SUPPOSED to be a bounded box floating over the page, and that is the
      whole job of the primitives there.
    */
    const IN_SCOPE = /^(pages|components)\//;
    const PRIMITIVES = /^components\/(ui|layout)\//;
    const offenders = FILES.filter(f => {
      const r = rel(f.path);
      if (!IN_SCOPE.test(r) || OUTSIDE_SHELL.test(r) || PRIMITIVES.test(r)) return false;
      return setsOwnWidth(f.text);
    }).map(f => rel(f.path));
    expect(
      offenders,
      `These cap and centre themselves inside a column that already fills the screen, which parks ` +
        `content in the middle of the monitor. Fill the column, or lay the content out in ` +
        `columns that consume the width. If a cap is genuinely required (a square plot), say ` +
        `so with a \`layout-cap-ok: <reason>\` comment at the site.`
    ).toEqual([]);
  });

  it('keeps the gutters identical everywhere they are spelled out', () => {
    // A second spelling of the gutter is how the footer drifted 115px in from
    // the content above it once before.
    expect(PAGE_CONTAINER).toContain(PAGE_GUTTER);
    const spellings = FILES.filter(f => f.text.includes('px-4 lg:px-6 2xl:px-8')).map(f => rel(f.path));
    expect(spellings, 'the gutter is spelled out somewhere other than container.ts').toEqual([
      'components/layout/container.ts',
    ]);
  });

});
