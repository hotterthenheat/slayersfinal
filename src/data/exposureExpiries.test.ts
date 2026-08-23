import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildExposureProfile, EXPOSURE_EXPIRIES } from './exposure';
import Simulator from '../core/simulator';

/*
==================================================
  SLAYER TERMINAL - ONE LIST OF HORIZONS
  (data/exposureExpiries.test.ts)

  Three surfaces let you pick the exposure horizon — the
  Gamma desk's hero profile, the Exposure Profile panel, and
  Terrain — and until this file they each spelled their own
  copy of the list. A fourth was about to.

  The failure is silent, which is why it needs a test rather
  than a convention. A copy that drifts does not throw: it
  offers a horizon the engine has no decay factor for, and
  `buildExposureProfile` returns a profile scaled by
  `undefined` — every bar NaN, every band zero-width, an
  empty picture that looks like a quiet session.
==================================================
*/

const SRC = join(process.cwd(), 'src');
const exposureSrc = readFileSync(join(SRC, 'data/exposure.ts'), 'utf8');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

describe('the exposure horizon list', () => {
  it('offers exactly the horizons the decay map can build', () => {
    /*
      Read from the source rather than exported: EXPIRY_DECAY is deliberately
      private (nothing outside this module should scale by it directly), and
      exporting it just to test it would widen the API to serve the guard.
    */
    const block = /const EXPIRY_DECAY: Record<ExposureExpiry, number> = \{([\s\S]*?)\n\};/.exec(
      exposureSrc
    );
    expect(block, 'EXPIRY_DECAY is no longer in the shape this guard reads').not.toBeNull();
    const keys = [...block![1].matchAll(/^\s*'?([A-Za-z0-9]+)'?:/gm)].map(m => m[1]).sort();
    const offered = EXPOSURE_EXPIRIES.map(o => o.value).sort();
    expect(offered).toEqual(keys);
  });

  it('is the only spelling of it', () => {
    /*
      Scans the tree rather than a list of files.

      The first cut named the three surfaces that offer the picker and asserted
      each imported the shared list — which broke the moment one of them stopped
      offering it, and would have said nothing at all about a FOURTH surface
      declaring its own copy. That is backwards: the rule is "nobody re-declares
      this", and a rule about nobody has to look at everybody.

      The option-literal shape is distinctive enough to find without catching the
      type union or the decay map.
    */
    const offenders = walk(SRC)
      .filter(f => !f.endsWith('exposure.ts'))
      .filter(f => /\{\s*value:\s*'0DTE'\s*,\s*label:/.test(readFileSync(f, 'utf8')))
      .map(f => f.slice(SRC.length + 1));
    expect(
      offenders,
      'these declare their own copy of the horizon list instead of importing EXPOSURE_EXPIRIES'
    ).toEqual([]);
  });

  it('builds a non-empty profile for every horizon it offers', () => {
    // The end the guard actually protects: an offered horizon must produce a
    // profile, not a window of NaN bars.
    const snap = Simulator.buildSnapshot('SPY');
    for (const { value } of EXPOSURE_EXPIRIES) {
      const profile = buildExposureProfile(snap, value, 10);
      expect(profile.strikes.length, `${value} produced no strikes`).toBeGreaterThan(0);
      for (const s of profile.strikes) {
        expect(Number.isFinite(s.gex.net), `${value} produced a non-finite net at ${s.strike}`).toBe(
          true
        );
      }
    }
  });
});
