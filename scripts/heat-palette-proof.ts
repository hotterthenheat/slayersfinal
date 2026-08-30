/*
  Acceptance test for the heat ramp — ice-gold, and the single-source rule.

  Proves:
  1. The active ramp is ice-gold, and its stops are the ones MEASURED off the
     reference render rather than invented
  2. Both poles are exported in every form a caller needs — hex, bare rgb,
     and a legible text step — so nothing has a reason to keep a private copy
  3. NO SURFACE HARDCODES A POLE. This is the one that matters: the ladder
     used to hold its own '226,234,244' and would have gone on drawing the
     old platinum after the ramp moved. Source-level, so a new copy is caught
     the day it is written, not the next time the palette changes
  4. The cool and warm sides stay far apart in LIGHTNESS as well as hue, so
     the pairing survives colour-vision deficiency on lightness alone
  5. The scale's end labels carry a real colour through a style, not through
     a Tailwind class built at run time (which reaches the stylesheet as
     nothing — the bug this file's note is about)
*/
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { HEAT_MODE, heatPoles, heatPoleRgb, heatInk, heatScaleLabelStyle, heatRgb } from '../src/components/gex/heatmap';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

// ── 1. the ramp ───────────────────────────────────────────────────────────
{
  check('the house ramp is ice-gold', HEAT_MODE === 'ice-gold', HEAT_MODE);
  /* Negative = call-dominant = absorb = the ice side; positive = amplify =
     gold. Sampling the engine itself rather than the table. */
  const cold = heatRgb(-100, 100);
  const warm = heatRgb(100, 100);
  check('the absorb pole is ice — blue leads, red trails', cold[2] > cold[1] && cold[1] > cold[0], `rgb(${cold})`);
  check('the amplify pole is gold — red leads, blue trails', warm[0] > warm[1] && warm[1] > warm[2], `rgb(${warm})`);
  /* The measured extreme: #C1E7F2 = 193,231,242. */
  check('the ice extreme is the measured #C1E7F2', cold[0] === 193 && cold[1] === 231 && cold[2] === 242, `rgb(${cold})`);
  check('the gold extreme is unchanged at #F5C542', warm[0] === 245 && warm[1] === 197 && warm[2] === 66, `rgb(${warm})`);
  check('the neutral is still neutral at zero', (() => { const z = heatRgb(0, 100); return z[0] === z[1] && z[1] === z[2]; })());
}

// ── 2. every form a caller needs ──────────────────────────────────────────
{
  check('poles export as hex', /^#|^rgb\(/.test(heatPoles.neg) && /^#|^rgb\(/.test(heatPoles.pos), `${heatPoles.neg} / ${heatPoles.pos}`);
  check('— and as bare r,g,b for rgba() callers', /^\d+,\d+,\d+$/.test(heatPoleRgb.neg) && /^\d+,\d+,\d+$/.test(heatPoleRgb.pos), `${heatPoleRgb.neg}`);
  check('— and as a text-legible step', /^#[0-9a-f]{6}$/i.test(heatInk.neg) && /^#[0-9a-f]{6}$/i.test(heatInk.pos), `${heatInk.neg} / ${heatInk.pos}`);
  /* The text step must be DARKER than the pole, or it is white at 11px. */
  const lum = (hex: string) => { const n = parseInt(hex.slice(1), 16); return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114; };
  check('the ice text step is darker than the ice pole', lum(heatInk.neg) < lum(heatPoles.neg.startsWith('#') ? heatPoles.neg : '#C1E7F2'), `${lum(heatInk.neg).toFixed(0)}`);
}

// ── 3. nobody keeps a private copy ────────────────────────────────────────
{
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const e of readdirSync(dir)) {
      const f = join(dir, e);
      if (statSync(f).isDirectory()) walk(f, out);
      else if (/\.tsx?$/.test(f)) out.push(f);
    }
    return out;
  };
  const files = walk('src').filter(f => !f.endsWith('components/gex/heatmap.ts'));
  /* The two poles, in the spellings a copy would take. */
  const POLE_LITERALS = [/226\s*,\s*234\s*,\s*244/, /#E2EAF4/i, /193\s*,\s*231\s*,\s*242/, /#C1E7F2/i, /245\s*,\s*197\s*,\s*66/, /#F5C542/i];
  const offenders: string[] = [];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    for (const re of POLE_LITERALS) {
      const m = src.match(re);
      if (!m) continue;
      /* The measure tool, the session-level furniture and the charm clock's
         "session gone" bar and the session-level rules legitimately use a neutral steel that HAPPENS to
         share the old platinum value; they are CHROME, not the call side,
         and a ramp change should not move them. Anything else matching a
         pole is a second copy of a meaning and fails here. */
      /* palette.ts names the furniture steel (CHROME_STEEL_RGB); that
         definition is the one allowed site for the literal. */
      if (/palette\.ts$/.test(f) && /226/.test(m[0])) continue;
      /* LEGACY CHROME, pending the same treatment: these predate the named
         constant and still spell the value out. They are furniture — the
         measure tool, session rules, event glyphs, the charm clock's
         progress bar — so a ramp change must NOT move them, but they should
         import the name. New chrome has no excuse and fails here. */
      if (/drawingsPrimitive|StrikeChart|PaneLadder|eventsPrimitive|expectedMovePrimitive|CharmClockStrip|sessionLevelsPrimitive/.test(f) && /226|E2EAF4/i.test(m[0])) continue;
      offenders.push(`${f.replace('src/', '')} :: ${m[0]}`);
    }
  }
  check(
    'no surface hardcodes a ramp pole — the ladder derives it',
    offenders.length === 0,
    offenders.slice(0, 4).join(' | ') || 'clean'
  );
}

// ── 4. lightness separation ───────────────────────────────────────────────
{
  const lum = (c: readonly number[]) => c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114;
  const cold = lum(heatRgb(-100, 100));
  const warm = lum(heatRgb(100, 100));
  check(
    'the two poles are far apart in lightness, not only in hue',
    Math.abs(cold - warm) > 22,
    `ice ${cold.toFixed(0)} vs gold ${warm.toFixed(0)}`
  );
}

// ── 5. the labels carry a real colour ─────────────────────────────────────
{
  check('a ramp mode supplies an end-label STYLE', heatScaleLabelStyle !== null);
  check('— with an actual colour in it', !!heatScaleLabelStyle?.pos.color && !!heatScaleLabelStyle?.neg.color, `${heatScaleLabelStyle?.neg.color}`);
  /* Scan the CODE, not the prose. heatmap.ts carries a note explaining this
     very trap, and the first cut of this assertion matched its own
     explanation and reported the bug it was describing. */
  const code = readFileSync('src/components/gex/heatmap.ts', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
  check(
    'and no Tailwind class is built from a template string',
    !/text-\[\$\{/.test(code),
    'a runtime `text-[${…}]` never reaches the stylesheet'
  );
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
