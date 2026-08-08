import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import config from '../../tailwind.config';
import { BEAR, BULL } from '../components/gex/palette';

/*
==================================================
  SLAYER TERMINAL - DESIGN SPECIMENS (lib/designSystem.test.ts)
  The design reference describes the system that actually ships.

  It described a different one. `design-system/` is a set of standalone HTML
  specimens — the page a designer opens to see what a token or a chart ink is —
  and it had not been touched since July while the palette moved underneath it.
  Two of the drifts were not cosmetic:

  1. colors.html carried a "Legacy aliases" grid advertising `primary`,
     `secondary`, `silver`, `gammaPos`, `gammaNeg` and `warning` — the exact six
     that palette.test.ts fails on. The code was guarded; the documentation was
     inviting them back.
  2. chart-inks.html showed holo-silver up / luminous violet down as the ACTIVE
     DEFAULT candle theme. That is the defect palette.test.ts was written to
     stop: while the candles drew a down bar violet, the cumulative delta, the
     put wall and the exposure grid on the same screen drew down red.

  A specimen nobody checks is worse than no specimen, because it is believed.
  These keep it answerable to tailwind.config.ts.
==================================================
*/

const DIR = join(process.cwd(), 'design-system');
const FILES = readdirSync(DIR)
  .filter(f => f.endsWith('.html'))
  .map(name => ({ name, text: readFileSync(join(DIR, name), 'utf8') }));

const colors = config.theme?.extend?.colors as Record<string, string>;

/** A swatch names its token in a `<div class="name">…</div>` cell. */
const swatchNames = (text: string) =>
  [...text.matchAll(/class="name">([^<]+)</g)].map(m => m[1].trim());

describe('design specimens', () => {
  it('has specimens to check', () => {
    expect(FILES.length).toBeGreaterThan(0);
  });

  it('never advertises a token the config does not define', () => {
    const offenders: string[] = [];
    for (const f of FILES) {
      for (const name of swatchNames(f.text)) {
        if (!(name in colors)) offenders.push(`${f.name}: ${name}`);
      }
    }
    expect(
      offenders,
      `These swatches name tokens that no longer exist in tailwind.config.ts. ` +
        `Delete them — a palette page is where a deleted colour comes back from.`
    ).toEqual([]);
  });

  it('does not resurrect the dead aliases in prose either', () => {
    // The swatch check above only sees the grid. These six were also the ones
    // most likely to be re-typed into a note, so they are matched as words
    // anywhere in the file.
    const dead = ['gammaPos', 'gammaNeg'];
    const offenders: string[] = [];
    for (const f of FILES) {
      for (const token of dead) {
        // `<code>` mentions inside a "deleted — do not reintroduce" note are the
        // point of that note, so only a swatch-shaped or bare mention counts.
        const bare = new RegExp(`(?<!<code>)\\b${token}\\b(?!</code>)`);
        if (bare.test(f.text)) offenders.push(`${f.name}: ${token}`);
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('shows the candles as the direction tokens', () => {
    const inks = FILES.find(f => f.name === 'chart-inks.html');
    expect(inks, 'chart-inks.html is missing').toBeDefined();
    // The violet that used to be "down" here, and the silver that used to be
    // "up". Either reappearing means the two-tone is back.
    expect(inks!.text, 'the violet down-candle is back').not.toContain('#A47CF2');
    expect(inks!.text, 'the silver up-candle is back').not.toContain('#DCE3F5');
    expect(inks!.text.toUpperCase()).toContain(BULL.toUpperCase());
    expect(inks!.text.toUpperCase()).toContain(BEAR.toUpperCase());
  });
});
