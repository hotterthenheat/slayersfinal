import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
==================================================
  SLAYER TERMINAL - THE ICON PACK STAYS OUT OF THE
  MAIN CHUNK (ui/animatedIcons.test.ts)

  MEASURED, so the number is not a guess. Importing two
  named icons from `@animateicons/react/lucide` grew the
  main bundle from 1,046 KB to 1,930 KB — +884 KB raw,
  +93 KB gzipped, for two glyphs.

  It cannot be tree-shaken. The package declares
  `sideEffects: false`, which only lets a bundler drop the
  module WHOLE, and we import from it; inside, every one of
  1,025 icons is a top-level `var x = forwardRef(...)` — a
  function CALL at module scope — with no pure-call
  annotation anywhere in the file. Rollup cannot prove a
  single one is droppable, so all of them ship.

  So the pack is reached through exactly one dynamic import,
  in one file, and lands as its own chunk fetched at idle.

  ONE STATIC IMPORT ANYWHERE PUTS 884 KB BACK ON FIRST
  PAINT, and it would do it silently: the build still
  succeeds, the app still works, the number just moves. That
  is the entire reason this file exists.
==================================================
*/

const SRC = join(process.cwd(), 'src');
const HOME = 'components/ui/animatedIcons.ts';
const PACK = '@animateicons/react';

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

/*
  Comments are stripped before anything is concluded. The house stripper from
  lib/honesty.test.ts: block comments whole, and a line comment only when `//`
  opens the line. `AnimatedIcon.tsx` names the package in a JSDoc line telling a
  caller where the icon names come from, and a guard that cannot tell prose from
  an import is a guard that gets loosened the first time it fires on a comment.
*/
const stripComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

const FILES = walk(SRC).map(p => ({
  file: p.slice(SRC.length + 1).replace(/\\/g, '/'),
  text: stripComments(readFileSync(p, 'utf8')),
}));

/** A STATIC import — `import … from '@animateicons/react/…'` or a bare side-effect one. */
const staticImport = new RegExp(
  `import\\s(?:[^;]*?\\sfrom\\s)?['"]${PACK}(?:/[^'"]*)?['"]`
);

/** The one permitted form: `import('@animateicons/react/lucide')`. */
const dynamicImport = new RegExp(`import\\(\\s*['"]${PACK}(?:/[^'"]*)?['"]\\s*\\)`);

describe('the animated icon pack', () => {
  it('is read by exactly one module', () => {
    const touching = FILES.filter(f => f.text.includes(PACK) && !f.file.endsWith('.test.ts')).map(f => f.file);
    expect(touching.sort()).toEqual([HOME]);
  });

  it('is reached only through a dynamic import, never a static one', () => {
    const home = FILES.find(f => f.file === HOME)!;
    expect(dynamicImport.test(home.text), `${HOME} must import the pack dynamically`).toBe(true);
    expect(staticImport.test(home.text), `${HOME} must not import the pack statically`).toBe(false);

    const offenders = FILES.filter(f => !f.file.endsWith('.test.ts')).filter(f => staticImport.test(f.text));
    expect(
      offenders.map(f => f.file),
      'A static import of @animateicons/react puts 884 KB (93 KB gzipped) back into the ' +
        'main chunk and onto first paint. Import the pack through ui/animatedIcons.ts, ' +
        'and render it through ui/AnimatedIcon, which keeps a still fallback for the ' +
        'window before it arrives and for readers who asked for less motion.'
    ).toEqual([]);
  });

  it('detects a static import when there is one', () => {
    // The matcher asserted rather than trusted: a regex that never fires would
    // pass the test above on an empty set and prove nothing.
    expect(staticImport.test(`import { SearchIcon } from '${PACK}/lucide';`)).toBe(true);
    expect(staticImport.test(`import '${PACK}/lucide';`)).toBe(true);
    expect(staticImport.test(`const x = await import('${PACK}/lucide');`)).toBe(false);
  });

  it('always ships a still fallback beside the animated one', () => {
    /*
      `AnimatedIcon` renders `still` for the whole window before the chunk lands
      AND permanently under prefers-reduced-motion. A call site that forgot it
      would render nothing at all for the first seconds of every session, and
      forever for some readers.
    */
    const missing: string[] = [];
    for (const f of FILES) {
      if (f.file.endsWith('.test.ts')) continue;
      for (const m of f.text.matchAll(/<AnimatedIcon\b[\s\S]{0,240}?\/>/g)) {
        if (!/\bstill=\{/.test(m[0])) missing.push(`${f.file}: ${m[0].slice(0, 60)}…`);
      }
    }
    expect(missing).toEqual([]);
  });
});
