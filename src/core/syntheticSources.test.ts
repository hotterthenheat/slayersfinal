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

/**
 * A private copy of the primitive: declared under one of the family's names, OR
 * carrying FNV-1a's mix step under any name at all.
 *
 * THE SECOND CLAUSE IS NOT BELT-AND-BRACES, it closes a hole this guard shipped
 * with. Reading for the family's NAMES catches eight of the nine private copies
 * and misses `core/simulator.ts`, whose copy is spelled `symbolHash` — the same
 * byte-identical FNV-1a as `core/rng.ts:hash`, seeding the mulberry32 stream
 * behind every price, the per-strike OI and the regime draw. The guard's own
 * commentary used to assert the simulator "does not use the hash family at all"
 * and a third test pinned that claim; both were false, and both were false for
 * exactly the reason this file exists — a detector that reads a spelling rather
 * than a behaviour reports success on the file that matters most.
 *
 * `Math.imul(h, 16777619)` is the mix step every copy in this repo carries, so
 * it is the behaviour, not a name and not a bare constant that could sit in a
 * comment.
 */
const FNV_MIX = /Math\.imul\(\s*\w+\s*,\s*16777619\s*\)/;

const definedLocally = (text: string): string[] => {
  const byName = [
    ...text.matchAll(/^\s*(?:export\s+)?(?:function|const)\s+(hash|h01|hRange|hPick|hGauss)\b/gm),
  ].map(m => m[1]);
  return byName.length > 0 ? byName : FNV_MIX.test(text) ? ['<aliased FNV-1a>'] : [];
};

const OFFENDERS = walk(SRC)
  .filter(p => rel(p) !== 'core/rng.ts')
  .map(p => ({ file: rel(p), text: readFileSync(p, 'utf8') }))
  .filter(f => importedFromRng(f.text).length > 0 || definedLocally(f.text).length > 0)
  .map(f => f.file)
  .sort();

/**
 * Modules whose whole job is to paint deterministic fiction, and which say so.
 *
 * This comment used to claim `core/simulator.ts` was clean — "it imports dayKey
 * and nothing else … the hashes are not the simulator's engine". That was wrong
 * on both halves. The simulator carries its own byte-identical FNV-1a as
 * `symbolHash` (simulator.ts:125) and hashes with it constantly: the mulberry32
 * stream every seeded price walks on, the per-strike open interest, the daily
 * regime draw. It only looked clean because the detector read for the NAME
 * `hash` and the copy is called something else. It is on the ledger now, and the
 * detector reads for FNV-1a's mix step so no other alias can repeat the trick.
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
 * `data/flowscan.ts` has left, and it is the shape the rest should follow. It
 * did not gain a data source — the source was already in the building. The
 * Scanner's volume, bid/ask split, sweep count and ΔOI were hashes drawn beside
 * Trace › Tape, which holds the SAME contracts' actual prints. It now rolls that
 * tape up. Two desks, one set of contracts, one answer.
 *
 * Deleting an entry without fixing the file fails this test, and so does fixing
 * a file without deleting its entry — the list cannot drift out of step with the
 * code in either direction.
 */
const LEGACY = [
  'core/fracture.ts',
  'core/ivRank.ts',
  // The session walk every un-held name is priced by, and the simulator that
  // ties its own seeded history down onto that walk. Both hash; both are the
  // price generator this product replaces wholesale when a feed lands, which is
  // the seam the ledger's exit condition names.
  'core/priceWalk.ts',
  'core/quant.ts',
  'core/scanUniverse.ts',
  'core/simulator.ts',
  'data/command.ts',
  'data/compass.ts',
  'data/contractflow.ts',
  'data/darkpool.ts',
  'data/darkpoolfeed.ts',
  'data/edgeledger.ts',
  'data/exposure.ts',
  'data/flowSweeps.ts',
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
      The guard's own load-bearing claim, asserted rather than trusted: nine of
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
    /*
      `dayKey` returns today's date as a string. If this guard flagged a module
      for importing it, the guard would be reading the import PATH instead of the
      behaviour, and all thirty-odd call sites would be false positives.

      This used to name `core/simulator.ts` as the clean example and it was the
      worst possible choice — that file hashes on nearly every line, under the
      alias the detector could not see. `pulseRegistry.tsx` is the real thing:
      one import, `dayKey`, used to build a cache key, and no FNV-1a anywhere.
    */
    const registry = readFileSync(join(SRC, 'pages/pulse/pulseRegistry.tsx'), 'utf8');
    expect(registry).toMatch(/import \{ dayKey \} from/);
    expect(FNV_MIX.test(registry)).toBe(false);
    expect(OFFENDERS).not.toContain('pages/pulse/pulseRegistry.tsx');
  });

  it('sees through an aliased copy of the primitive', () => {
    /*
      The widening, mutation-checked in place rather than trusted. `symbolHash`
      is FNV-1a spelled differently; the name-only reader returns nothing for it
      and the behaviour reader returns a hit. If someone narrows the detector
      back to names, the first expectation below still passes and the second
      fails — which is the whole point of asserting both halves separately.
    */
    const sim = readFileSync(join(SRC, 'core/simulator.ts'), 'utf8');
    expect(sim).toMatch(/function symbolHash/);
    expect(
      [...sim.matchAll(/^\s*(?:export\s+)?(?:function|const)\s+(hash|h01|hRange|hPick|hGauss)\b/gm)]
    ).toHaveLength(0);
    expect(FNV_MIX.test(sim)).toBe(true);
    expect(OFFENDERS).toContain('core/simulator.ts');
  });
});
