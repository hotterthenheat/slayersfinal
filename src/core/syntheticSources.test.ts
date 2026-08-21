import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
==================================================
  SLAYER TERMINAL - SYNTHETIC SOURCES (core/syntheticSources.test.ts)
  Which modules are allowed to reach for the seeded-hash family, and no others.

  `core/rng.ts` is a deterministic hash family — hash, h01, hRange, hPick,
  hGauss. Painting a demo tape with it is correct. Dividing by it and printing
  the quotient under a heading that reads as a market fact is the thing the MOC
  engine was deleted for: `docs/DATA-FEASIBILITY.md` calls that "a hash of the
  ticker printed with a sigma after it."

  `data/hedgeimpact.ts` is doing it right now. Its liquidity denominator is
  `hRange('<ticker>-<day>-adv', 9, 22)` and its own header says so at lines
  19-21. An accurate comment did not stop it shipping, which is the whole reason
  this file exists: a comment is documentation for a maintainer, a test is a
  build failure.

  ---------------------------------------------------------------------------
  WHY THIS DOES NOT USE `no-restricted-imports`.

  The obvious guard is a lint rule banning the import. It would have been
  decorative. EIGHT modules do not import the hash family at all — they carry a
  private copy, pasted under the same names:

      data/gex.ts:29        function hash(seed: string): number {
      data/rankedtargets.ts:28  function hash(seed: string): number {
      data/command.ts:27    …and exposure, flowtape, vannacharm, vollab, compass

  `data/gex.ts`'s copy is byte-identical FNV-1a to `core/rng.ts`'s; its `h01`
  differs only in the modulus (1000 vs 10000). An import ban catches 21 of 29
  offenders and reports success while `gex.ts` — which feeds every Pinpoint desk
  AND the landing page's live panels — keeps hashing. So this reads for the
  BEHAVIOUR (a seeded hash reaching a figure) rather than for one spelling of it,
  and counts a local definition exactly as heavily as an import.

  `dayKey` is exempt: it returns today's date as a string and is merely
  mis-housed in rng.ts. It hashes nothing.
==================================================
*/

const SRC = join(process.cwd(), 'src');

/** The seeded-hash family. `dayKey` is deliberately absent — it is a calendar helper. */
const HASH_FAMILY = ['hash', 'h01', 'hRange', 'hPick', 'hGauss'] as const;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

const rel = (p: string) => p.slice(SRC.length + 1).replace(/\\/g, '/');

/** Named imports pulled from rng, by any relative spelling. */
const importedFromRng = (text: string): string[] =>
  [...text.matchAll(/import\s*\{([^}]*)\}\s*from\s*'[^']*\brng'/g)]
    .flatMap(m => m[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0]))
    .filter(n => (HASH_FAMILY as readonly string[]).includes(n));

/** A private copy of the primitive, declared under one of the family's names. */
const definedLocally = (text: string): string[] =>
  [...text.matchAll(/^\s*(?:export\s+)?(?:function|const)\s+(hash|h01|hRange|hPick|hGauss)\b/gm)].map(
    m => m[1]
  );

const OFFENDERS = walk(SRC)
  .filter(p => rel(p) !== 'core/rng.ts')
  .map(p => ({ file: rel(p), text: readFileSync(p, 'utf8') }))
  .filter(f => importedFromRng(f.text).length > 0 || definedLocally(f.text).length > 0)
  .map(f => f.file)
  .sort();

/**
 * Modules whose whole job is to paint deterministic fiction, and which say so.
 *
 * Note what is NOT here: `core/simulator.ts`. The simulator imports `dayKey` and
 * nothing else — it does not use the hash family at all. The hashes are not the
 * simulator's engine; they are a layer of invented texture applied on top of its
 * output, in `data/`, which is exactly why they read as market facts.
 */
const SYNTHETIC_OK = [
  'data/tapeSeed.ts', // paints the demo tape the live feed replaces wholesale
  'pages/trailer/trailerStory.ts', // the trailer is a film, not a desk
];

/**
 * Everything still hashing, at the commit this guard landed. This list only ever
 * shrinks: each entry leaves by moving its randomness behind the simulator seam
 * or by rendering `workspace/DataUnavailablePanel` until a feed exists.
 *
 * Deleting an entry without fixing the file fails this test, and so does fixing
 * a file without deleting its entry — the list cannot drift out of step with the
 * code in either direction.
 */
const LEGACY = [
  'core/fracture.ts',
  'core/ivRank.ts',
  'core/quant.ts',
  'core/scanUniverse.ts',
  'data/command.ts',
  'data/compass.ts',
  'data/contractflow.ts',
  'data/darkpool.ts',
  'data/darkpoolfeed.ts',
  'data/edgeledger.ts',
  'data/exposure.ts',
  'data/flowSweeps.ts',
  'data/flowscan.ts',
  'data/flowtape.ts',
  'data/gex.ts',
  'data/hedgeimpact.ts',
  'data/greeksmatrix.ts',

  'data/metaorder.ts',
  'data/netpremium.ts',
  'data/pulseflow.ts',
  'data/rankedtargets.ts',
  'data/statedensity.ts',
  'data/statereplay.ts',
  'data/stocks.ts',
  'data/swingModel.ts',
  'data/vannacharm.ts',
  'data/vollab.ts',
];

describe('the seeded-hash family', () => {
  it('reaches only the modules on the ledger', () => {
    expect(
      OFFENDERS,
      'A module started using the seeded-hash family (imported from core/rng, or ' +
        'declared privately under one of its names). A hash may paint a demo tape; it may ' +
        'never reach a figure the UI presents as a market fact. Move the randomness behind ' +
        'the simulator seam, or render workspace/DataUnavailablePanel until a feed exists.'
    ).toEqual([...SYNTHETIC_OK, ...LEGACY].sort());
  });

  it('counts a private copy exactly as heavily as an import', () => {
    /*
      The guard's own load-bearing claim, asserted rather than trusted: eight of
      the offenders are invisible to an import ban. If a future edit narrows this
      to imports only, this fails instead of quietly halving the coverage.
    */
    const privateCopies = walk(SRC)
      .filter(p => rel(p) !== 'core/rng.ts')
      .map(p => ({ file: rel(p), text: readFileSync(p, 'utf8') }))
      .filter(f => definedLocally(f.text).length > 0 && importedFromRng(f.text).length === 0)
      .map(f => f.file)
      .sort();

    expect(privateCopies.length, 'private hash copies should be counted, and there are some').
      toBeGreaterThan(0);
    for (const f of privateCopies) {
      expect(OFFENDERS, `${f} carries a private hash and must be on the ledger`).toContain(f);
    }
  });

  it('does not count dayKey, which hashes nothing', () => {
    // core/simulator.ts imports dayKey and nothing else. If this guard ever
    // flagged it, the guard would be reading the import path instead of the
    // behaviour, and every `dayKey` call site would be a false positive.
    expect(OFFENDERS).not.toContain('core/simulator.ts');
    expect(OFFENDERS).not.toContain('pages/pulse/pulseRegistry.tsx');
  });
});
