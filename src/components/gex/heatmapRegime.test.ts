import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HEAT_MODE, heatPoles, heatScaleLabels } from './heatmap';
import { LONG_GAMMA, SHORT_GAMMA } from './palette';

/*
==================================================
  SLAYER TERMINAL - ONE QUANTITY, ONE COLOUR LANGUAGE
  (components/gex/heatmapRegime.test.ts)

  Net dealer gamma appeared on two Pinpoint desks in two different palettes.

    Pinpoint > Gamma    the strike x expiry heatmap, in BULL GREEN / BEAR RED
    Pinpoint > Levels   the positioning map, in LONG_GAMMA blue / SHORT_GAMMA gold

  Same number. Same sign convention. Two colour languages, one of them the
  market's word for up and down — applied to a quantity that has no direction.
  Positive net gamma does not mean bullish; it means dealers absorb and the tape
  pins. Negative does not mean bearish; it means hedging amplifies whichever way
  price goes. The desk's own reading note said as much in prose while the cells
  underneath argued otherwise, which is the same defect `scoreBandInk.test.ts`
  guards one level down: a quantity wearing a sign it does not carry.

  This pins the fix at its two ends — the ramp poles ARE the palette's regime
  tokens, and the scale labels speak the same language — so the heatmap cannot
  drift back to direction hues, and cannot drift away from the map beside it.
==================================================
*/

/** #RRGGBB -> [r,g,b], so a pole can be compared to a token without eyeballing. */
const rgbOf = (hex: string): [number, number, number] => {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) throw new Error(`not a hex colour: ${hex}`);
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
};

/** `rgb(r,g,b)` or `#rrggbb` -> [r,g,b]. heatPoles emits the former. */
/** GammaChart with comments stripped — prose about the old palette must not
    satisfy, or fail, a check on what the desk renders. Tempered token, not a
    lazy wildcard: `[\s\S]*?` backtracks past a comment's end and deletes the
    lines it crosses. */
const deskCode = (): string =>
  readFileSync(join(process.cwd(), 'src/pages/gex/GammaChart.tsx'), 'utf8')
    .replace(/\/\*(?:[^*]|\*(?!\/))*\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ');

const parse = (c: string): [number, number, number] => {
  const m = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(c);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : rgbOf(c);
};

describe('the gamma heatmap speaks the regime language', () => {
  it('runs the regime ramp, not a direction ramp', () => {
    expect(HEAT_MODE).toBe('gamma-regime');
  });

  it('poles ARE the palette regime tokens', () => {
    // Not "close to" — the same colour. If the map and the heatmap are to mean
    // one thing, they have to BE one value, and this is where that is pinned.
    expect(parse(heatPoles.pos)).toEqual(rgbOf(LONG_GAMMA));
    expect(parse(heatPoles.neg)).toEqual(rgbOf(SHORT_GAMMA));
  });

  it('does not paint the poles in the direction tokens', () => {
    /*
      The regression stated as the bug rather than as its absence: bull green and
      bear red are what the ramp used to be, and they are what a future "make the
      heatmap pop" edit will reach for first.
    */
    for (const pole of [parse(heatPoles.pos), parse(heatPoles.neg)]) {
      expect(pole, 'a heatmap pole is bull green').not.toEqual(rgbOf('#30D158'));
      expect(pole, 'a heatmap pole is bear red').not.toEqual(rgbOf('#FF3B30'));
    }
  });

  it('labels the scale ends in the same language as the cells', () => {
    // A gold cell under a `text-bear` label is the original bug wearing a
    // smaller hat.
    expect(heatScaleLabels.pos).toBe('text-longGamma');
    expect(heatScaleLabels.neg).toBe('text-shortGamma');
  });

  it('the desk inks NET GAMMA in the regime tokens', () => {
    /*
      The banner is the same claim as the cells, one size up, and it was the same
      bug: `+$1.9B` in bull green over a grid that has no direction in it.

      Scoped to the net-gamma read on purpose — a blanket "no direction hue in
      this file" was tried first and it flagged the four NAMED LEVELS, which are
      not a signed quantity. Call wall, put wall, flip and king are four specific
      prices, and the positioning map's right-hand rail labels them in exactly
      these colours; recolouring them here would have broken the agreement this
      test exists to enforce, in the name of enforcing it.
    */
    const code = deskCode();
    expect(code, 'the net-gamma figure is not inked in the regime tokens').toContain('text-longGamma');
    expect(code, 'the net-gamma figure is not inked in the regime tokens').toContain('text-shortGamma');
    expect(code, 'the net-gamma badge still carries a direction tint').not.toMatch(
      /longGamma \? 'bg-bull|text-bull' : 'text-bear'/
    );
  });

  it('the reading note describes the regime in the colours actually on screen', () => {
    /*
      Copy and colour have to move together. The note used to say "green is
      dealer support ... red is where hedging amplifies", so recolouring the
      cells without it would have left the page explaining a palette it no
      longer uses — a caption describing a different chart, which is worse than
      either the old or the new one alone.
    */
    const prose = deskCode();
    expect(prose, 'the read still calls the heatmap green').not.toMatch(/>green</);
    expect(prose, 'the read still calls the heatmap red').not.toMatch(/>red</);
    expect(prose).toMatch(/>Blue</);
    expect(prose).toMatch(/>Gold</);
  });
});
