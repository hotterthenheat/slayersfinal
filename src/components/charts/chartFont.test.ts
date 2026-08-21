import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHART_FONT } from './chartTheme';

/*
==================================================
  SLAYER TERMINAL - ONE FAMILY REACHES THE CANVAS TOO
  (charts/chartFont.test.ts)

  Tailwind cannot dress a canvas or an SVG `font-family` attribute, so a chart
  that wants a typeface has to write the name out. Thirty-six call sites in
  twenty-three files had written it out, every one of them naming a monospace
  face: `'JetBrains Mono, monospace'` on the recharts ticks, `"JetBrains Mono"`
  inside a `ctx.font` shorthand, `"ui-monospace, monospace"` on the trailer's
  SVG text, and a bare `"monospace"` on Fracture's axis labels.

  That was invisible while JetBrains Mono was loaded. The terminal now runs ONE
  self-hosted family and no monospace at all, so every one of those strings
  would have resolved to the platform's generic mono — a different typeface from
  the label directly above the chart, and a different one on each machine. The
  failure is silent: nothing throws, nothing fails to render, the chart is just
  quietly set in the wrong face.

  One exported token fixes the instance. This is what stops the next chart from
  re-introducing it, because "someone will remember" is not a mechanism.
==================================================
*/

const SRC = join(process.cwd(), 'src');
const walk = (d: string): string[] =>
  readdirSync(d).flatMap(n => {
    const p = join(d, n);
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(p) ? [p] : [];
  });

/** Where the family is allowed to be spelled out — the token's own definition. */
const HOME = join(SRC, 'components/charts/chartTheme.ts');

describe('chart typography', () => {
  it('names a real family, quoted, with a fallback', () => {
    /*
      Three properties, because the token is consumed in a `ctx.font` shorthand
      as well as an SVG attribute, and the shorthand is unforgiving: a multi-word
      family that is not quoted makes the WHOLE declaration invalid, and canvas
      drops an invalid `font` silently, back to its 10px sans default. There is
      no error and no visual clue beyond slightly wrong labels.
    */
    expect(CHART_FONT).toContain('"SF Pro"');
    expect(CHART_FONT).toMatch(/sans-serif$/);
    // Balanced quotes — an odd count means a family name is half-quoted, which
    // is the same silent-drop bug with a harder-to-see cause.
    expect((CHART_FONT.match(/"/g) ?? []).length % 2).toBe(0);
  });

  it('is the only place a font family is written out', () => {
    /*
      Both spellings of the bug, because the code carried both:

        fontFamily: 'JetBrains Mono, monospace'   object literal (recharts)
        fontFamily="ui-monospace, monospace"      JSX attribute (raw SVG)
        ctx.font = '9px "JetBrains Mono", …'      canvas shorthand

      Matching on the FAMILY NAMES rather than on the property catches all
      three, and catches a call site that invents a fourth spelling.
    */
    const FAMILY = /\b(?:monospace|sans-serif|serif|JetBrains|Inter|Helvetica|Arial|Segoe UI|Roboto|SF Pro|system-ui|-apple-system)\b/;
    const offenders: string[] = [];

    for (const p of walk(SRC)) {
      if (p === HOME) continue;
      const rel = p.slice(SRC.length + 1).replace(/\\/g, '/');
      // Comments stripped — this file and CodeRain.tsx both DISCUSS the old
      // spellings in prose, and prose must not fail a check on code. Tempered
      // token, not a lazy wildcard: `[\s\S]*?` backtracks past a comment's end
      // hunting the next `*/` and deletes every line it crosses.
      const code = readFileSync(p, 'utf8')
        .replace(/\/\*(?:[^*]|\*(?!\/))*\*\//g, ' ')
        .replace(/^\s*\/\/.*$/gm, ' ');

      for (const m of code.matchAll(/(?:fontFamily\s*[:=]|\.font\s*=)\s*(['"`])((?:(?!\1)[\s\S])*)\1/g)) {
        if (FAMILY.test(m[2])) offenders.push(`${rel} — ${m[0].slice(0, 80)}`);
      }
    }

    expect(
      offenders,
      'A font family is spelled out at a call site. Import CHART_FONT from ' +
        'components/charts/chartTheme — the terminal runs one family, and a chart that names ' +
        'its own resolves to a different typeface from the label sitting above it.'
    ).toEqual([]);
  });
});
