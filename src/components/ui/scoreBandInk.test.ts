import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scoreBandFill, scoreBandText } from './tones';

/*
==================================================
  SLAYER TERMINAL - A MAGNITUDE NEVER WEARS A DIRECTION (scoreBandInk.test.ts)

  74 on momentum is not a bullish reading of anything and 31 is not a bearish
  one. A score says how much, never which way. Green and red are the market's own
  language for a sign, and a quantity with no sign must not borrow them.

  This rule has now been half-applied twice, which is why it is a test.

  `Stocks.tsx` carries a comment saying that dressing a sleeve score in bull
  green "had the densest column on the board arguing a direction the number never
  claimed" — and the fix went to the green end only. `weak` stayed `bg-bear/70`
  and `text-bear`: the identical mistake inverted, sitting directly under the
  paragraph explaining why it was wrong. Meanwhile the composite column itself
  was still `composite >= 68 ? 'text-bull' : composite <= 46 ? 'text-bear'` in
  two places on the same page.

  It survived because the map existed TWICE — once in Stocks.tsx and once in
  StockDetailModal.tsx — so a fix could land on one copy and look complete. There
  is one map now, in `ui/tones.ts`, and this checks both that the map is clean
  and that no page has quietly gone back to inking a score by hand.
==================================================
*/

/**
 * The market's own language for a sign. A magnitude may not borrow it.
 *
 * Both spellings: the class (`text-bull`) and the bare tone name (`'bull'`)
 * that a component maps to one. The bare form is how the live bug reached the
 * screen — `tone={score >= 68 ? 'bull' : …}` has no `text-` prefix anywhere.
 */
const DIRECTION = /\b(?:text|bg|border|from|to|via)-(?:bull|bear)\b|'(?:bull|bear)'/;

describe('score-band ink', () => {
  it('carries no direction hue', () => {
    for (const [band, cls] of Object.entries(scoreBandFill)) {
      expect(cls, `scoreBandFill.${band} is a direction colour`).not.toMatch(DIRECTION);
    }
    for (const [band, cls] of Object.entries(scoreBandText)) {
      expect(cls, `scoreBandText.${band} is a direction colour`).not.toMatch(DIRECTION);
    }
  });

  it('still ramps, so the bands stay distinguishable', () => {
    // Neutralising the hue must not flatten the scale — if every band resolved to
    // the same class the ramp would be gone, which is a different bug with the
    // same green light.
    expect(new Set(Object.values(scoreBandFill)).size).toBe(3);
    expect(new Set(Object.values(scoreBandText)).size).toBe(3);
  });

  it('is not re-implemented by hand anywhere', () => {
    /*
      The regression shape, caught by its ingredients rather than its spelling:
      a score-ish identifier and a direction class inside one template literal.
      That is exactly what `composite >= 68 ? 'text-bull' : …` looked like, and
      it is what a future hand-rolled ramp will look like too.
    */
    const SRC = join(process.cwd(), 'src');
    const walk = (d: string): string[] =>
      readdirSync(d).flatMap(n => {
        const p = join(d, n);
        return statSync(p).isDirectory()
          ? walk(p)
          : /\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p)
            ? [p]
            : [];
      });

    const SCORE_ISH = /\b\w*(?:score|composite|sleeve|band|grade|rank)\w*\b/i;
    /*
      SIGNED quantities are exempt, and getting this wrong first is what taught
      the rule. A blanket "no score wears bull or bear" flagged three honest
      sites: `bullScore` runs −100…+100 and is a directional LEAN by
      construction, Flow Scanner's score is compared against 0, and Fracture's
      `band.below` is a boolean about which side of a level a price sits on.
      All three have a sign, so green and red are the right language for them.

      The bug has a different shape: an UNSIGNED 0-100 magnitude split across two
      POSITIVE thresholds, which is exactly what
      `composite >= 68 ? bull : composite <= 46 ? bear` was. So an expression
      that compares against zero or a negative literal is signed and passes; one
      that only ever compares against positive numbers is a magnitude wearing a
      direction.
    */
    const SIGNED = /[<>]=?\s*-\s*\d|[<>]=?\s*0\b|\bMath\.sign\b/;
    const COMPARES = /[<>]=?\s*\d/;
    const offenders: string[] = [];
    for (const p of walk(SRC)) {
      const rel = p.slice(SRC.length + 1).replace(/\\/g, '/');
      const text = readFileSync(p, 'utf8')
        .replace(/\/\*(?:[^*]|\*(?!\/))*\*\//g, ' ')
        .replace(/^\s*\/\/.*$/gm, ' ');
      /*
        TWO shapes, because reading only one left a live bug on screen.

        The first version scanned `${ … }` interpolations, which is where a
        conditional CLASS lives. It missed the Stocks drawer entirely, because
        that site inked its score through a prop instead:

            tone={pick.composite >= 68 ? 'bull' : pick.composite <= 46 ? 'bear' …}

        No template literal, no `text-` prefix — a bare tone name handed to a
        component that resolves it to a class somewhere else. The guard passed
        and the number sat there in green. So a `prop={ … }` expression counts
        too, and the direction pattern accepts the bare tone words as well as the
        class spellings.
      */
      const exprs = [
        ...[...text.matchAll(/\$\{([^{}]*)\}/g)].map(m => m[1]),
        ...[...text.matchAll(/\b(?:tone|className|color|fill|ink)=\{([^{}]*)\}/g)].map(m => m[1]),
      ];
      for (const expr of exprs) {
        if (!DIRECTION.test(expr) || !SCORE_ISH.test(expr)) continue;
        if (SIGNED.test(expr) || !COMPARES.test(expr)) continue;
        offenders.push(`${rel} — ${expr.trim().slice(0, 90)}`);
      }
    }
    expect(
      offenders,
      'A score is being inked green or red by hand. Use scoreBandText/scoreBandFill — a ' +
        'magnitude has no sign, and green and red are reserved for quantities that do.'
    ).toEqual([]);
  });
});
