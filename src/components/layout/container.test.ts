import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PAGE_CONTAINER, PAGE_GUTTER, PROSE_MEASURE } from './container';

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
  it('is declared in exactly one place', () => {
    const declares = FILES.filter(f => f.text.includes('max-w-[1800px]')).map(f => rel(f.path));
    expect(declares).toEqual(['components/layout/container.ts']);
  });

  it('is used by the bar, the body and the footer', () => {
    for (const shell of ['components/layout/TopBar.tsx', 'components/layout/AppShell.tsx', 'components/layout/SiteFooter.tsx']) {
      const f = FILES.find(x => rel(x.path) === shell);
      expect(f, `${shell} is missing`).toBeDefined();
      expect(f!.text, `${shell} must ride the shared column`).toContain('container');
    }
  });

  it('no page inside the shell sets its own width', () => {
    /*
      The exact shape that caused it: a root element that both caps its width
      and centres itself, which makes a page a box inside the page.

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
    const CAPS_WIDTH = /\bmax-w-(?:\d?xl\b|\[[^\]]+\])/;
    const CENTRES = /\bmx-auto\b/;
    const setsOwnWidth = (text: string) =>
      [...text.matchAll(CLASS_ATTR)].some(m => {
        const classes = m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5] ?? '';
        return CAPS_WIDTH.test(classes) && CENTRES.test(classes);
      });
    const offenders = FILES.filter(f => {
      const r = rel(f.path);
      if (!r.startsWith('pages/') || OUTSIDE_SHELL.test(r)) return false;
      return setsOwnWidth(f.text);
    }).map(f => rel(f.path));
    expect(
      offenders,
      `These pages cap and centre themselves inside a column that is already centred. ` +
        `Use PAGE_CONTAINER for the page and PROSE_MEASURE for a reading measure inside it.`
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

  it('centres a reading measure rather than pinning it left', () => {
    expect(PROSE_MEASURE).toContain('mx-auto');
  });
});
