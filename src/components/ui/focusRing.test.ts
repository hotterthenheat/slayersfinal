import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FOCUS_RING, FOCUS_RING_ON_HOLO } from './focusRing';

/*
==================================================
  SLAYER TERMINAL - ONE FOCUS RING (ui/focusRing.test.ts)
  A keyboard user can always see where they are.

  Three controls proved they could not. Each is painted on holographic silver,
  each set `outline-none` — throwing away the browser's own indicator, which is
  the only thing that would have saved them — and each then drew a SILVER ring
  on that silver. Two were `ring-inset`, so the ring landed inside the foil and
  disappeared completely; the third sat flush outside it and just made the pill
  look slightly fatter.

  Nothing in the earlier sweeps caught this. A browser check that asks "did the
  computed style change on focus?" says yes to a ring that is invisible, which
  is exactly what these three were. It takes reading the surface to see it, so
  it takes a source guard to keep it fixed.
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

/** One `className={...}` / `className="..."` value, however it is spelled. */
function classAttributes(text: string): string[] {
  const out: string[] = [];
  // Plain string form.
  for (const m of text.matchAll(/className="([^"]*)"/g)) out.push(m[1]);
  // Expression form: take the whole braced value, which covers template
  // literals, ternaries and concatenations without trying to evaluate them.
  for (const m of text.matchAll(/className=\{/g)) {
    let depth = 0;
    let i = m.index! + 'className={'.length - 1;
    const start = i + 1;
    for (; i < text.length; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') {
        depth--;
        if (depth === 0) break;
      }
    }
    out.push(text.slice(start, i));
  }
  return out;
}

describe('focus rings', () => {
  it('never paints a silver ring on a silver surface', () => {
    // `holo-bg` IS the foil. A ring in the silver family on top of it is the
    // failure; ink (or the browser's own outline) is the fix.
    const offenders: string[] = [];
    for (const f of FILES) {
      for (const attr of classAttributes(f.text)) {
        if (!attr.includes('holo-bg')) continue;
        if (!/focus-visible:ring-(select|white|textPrimary)/.test(attr)) continue;
        offenders.push(`${rel(f.path)}: ${attr.replace(/\s+/g, ' ').slice(0, 110)}`);
      }
    }
    expect(
      offenders,
      `These controls sit on holographic silver and ring themselves in silver. ` +
        `Use FOCUS_RING_ON_HOLO from components/ui/focusRing.`
    ).toEqual([]);
  });

  it('never drops the browser outline without replacing it', () => {
    // `outline-none` on its own is the worst of both: the platform indicator is
    // gone and nothing takes its place.
    //
    // One legitimate shape does not put the indicator on the focused element:
    // a `group` wrapper whose child answers with `group-focus-visible:`. The
    // trailer's scene scrubber is built that way — the button is a hit box and
    // the 3px rail inside it lights up. That only counts when the file really
    // contains the matching utility, so the escape hatch cannot be claimed by
    // writing the word `group` and nothing else.
    const offenders: string[] = [];
    for (const f of FILES) {
      const delegates = /(?:group|peer)-focus-visible:/.test(f.text);
      for (const attr of classAttributes(f.text)) {
        if (!attr.includes('focus-visible:outline-none')) continue;
        if (/focus-visible:(ring|border|bg|text|shadow|outline-\[)/.test(attr)) continue;
        if (delegates && /\b(group|peer)\b/.test(attr)) continue;
        offenders.push(`${rel(f.path)}: ${attr.replace(/\s+/g, ' ').slice(0, 110)}`);
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('keeps the two rings distinguishable from each other', () => {
    // If the holo ring ever collapses back onto the house ring, the bug is
    // silently back — so they must not be the same string, and the holo one
    // must not be in the silver family.
    expect(FOCUS_RING_ON_HOLO).not.toBe(FOCUS_RING);
    expect(FOCUS_RING).toContain('ring-select');
    expect(FOCUS_RING_ON_HOLO).not.toContain('ring-select');
    expect(FOCUS_RING_ON_HOLO).toContain('ring-ink');
  });
});
