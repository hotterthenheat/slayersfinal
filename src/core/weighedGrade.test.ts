import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
==================================================
  SLAYER TERMINAL - THE GRADE DOES NOT SHIP (core/weighedGrade.test.ts)
  `rankKey` orders contracts. It never reaches a pane.

  It was `composite`: a 0-100 number rendered at 36px on the Weigher, in every
  chain cell, in the prose comparing one contract to another, and as a signed
  delta on the Tracker. Behind it: a weighted mean of five hand-chosen factor
  scores at hand-chosen weights, with no forward log, no measured hit rate and
  no interval on any of them. A figure on a 0-100 scale claims a resolution that
  a weighted guess cannot supply.

  The quantity still has one honest job — three call sites need a total order
  over candidate contracts, and "this one before that one" is a far weaker claim
  than "this one is 94 out of 100". So it survives as a sort key, and this file
  is what keeps it one. Renaming a field is a convention; a test is a build
  failure.

  What still ships in its place is `verdict` — three coarse bands the same
  arithmetic can carry — and the factor vector, five separately-named 0-100
  quantities with the weight each carries. Both are strictly more informative
  than the number that compressed them.
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

const rel = (p: string) => p.slice(SRC.length + 1).replace(/\\/g, '/');

/**
 * Source with comments removed.
 *
 * The obvious pattern for a JSX comment — `\{\s*\/\*[\s\S]*?\*\/\s*\}` — is a
 * backtracking trap. `[\s\S]*?` is lazy, so at every `{` followed by a block
 * comment it looks for the nearest `*&#47;`, and when that is not followed by a
 * closing brace it extends and tries again — walking thousands of characters and
 * deleting every line in between. Measured: it swallowed the whole middle of
 * ContractWeigher.tsx, so a guard reading the result could not see a field that
 * was plainly there.
 *
 * A tempered token fixes it: `[^*]|\*(?!\/)` cannot cross a comment terminator,
 * so the match ends where the comment ends and nowhere else. The JSX case needs
 * no rule of its own — stripping the block comment leaves `{ }`, which matches
 * nothing anyone cares about.
 */
const code = (t: string): string =>
  t.replace(/\/\*(?:[^*]|\*(?!\/))*\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

const FILES = walk(SRC).map(p => ({ file: rel(p), text: code(readFileSync(p, 'utf8')) }));

/** Where a figure becomes pixels. */
const RENDERS = /^(pages|components)\//;

describe('the contract grade', () => {
  it('is never rendered', () => {
    /*
      The precise rule, arrived at by getting it wrong first.

      The first cut of this forbade `.rankKey` anywhere under pages/ or
      components/ and failed immediately — on the Lotto board's own sort, which
      the next test REQUIRES to exist. A comparator reads the field; so does the
      line that persists it. Neither is a render, and a guard that cannot tell
      them apart forbids the thing it is supposed to protect.

      So: it may be sorted on, and it may be stored. It may not become pixels.
      Checked two ways, because either alone is soft — an exact ledger of the
      non-render reads, which fails when a new one appears AND when a listed one
      disappears, plus a direct look for the interpolation shape a render takes.
    */
    const NON_RENDER_READS: Record<string, string> = {
      'components/compass/LottoBoard.tsx': 'ranks each side of the board',
      'components/compass/ContractWeigher.tsx': 'feeds the persisted TrackedSetup.score field',
    };

    const readers = FILES.filter(f => RENDERS.test(f.file) && /\.rankKey\b/.test(f.text))
      .map(f => f.file)
      .sort();
    expect(
      readers,
      'A component started reading rankKey. It orders contracts; it is not a grade, and ' +
        'nothing behind its weights has been measured. Render `verdict` for the read, or the ' +
        '`factors` vector for the anatomy. If the read is genuinely a sort or a stored field, ' +
        'add it here with its reason.'
    ).toEqual(Object.keys(NON_RENDER_READS).sort());

    // …and none of those reads may be an interpolation, which is what a render is.
    for (const f of FILES.filter(x => RENDERS.test(x.file))) {
      expect(f.text, `${f.file} interpolates rankKey into markup`).not.toMatch(/\{[^{}]*\.rankKey[^{}]*\}/);
    }
  });

  it('still orders the three places that need an order', () => {
    /*
      The other half. Deleting `rankKey` outright would satisfy the test above
      and silently unsort the chain, the Lotto board and the better-alternative
      search — a board in engine order looks plausible and is wrong, which is the
      failure this pairing exists to prevent.
    */
    const engine = FILES.find(f => f.file === 'core/contractScore.ts');
    expect(engine, 'core/contractScore.ts is gone — re-point this test').toBeDefined();
    const sorts = [...engine!.text.matchAll(/\.sort\(\(a, b\) => b\.rankKey - a\.rankKey\)/g)];
    expect(sorts.length, 'contractScore must sort the chain and the alternative search by rankKey').toBe(2);
    expect(engine!.text, 'the better-alternative gate must still compare rank').toMatch(
      /candidate\.rankKey >= target\.rankKey \+ 5/
    );

    const lotto = FILES.find(f => f.file === 'components/compass/LottoBoard.tsx');
    expect(lotto, 'LottoBoard is gone — re-point this test').toBeDefined();
    expect(lotto!.text, 'the Lotto board must still rank each side').toMatch(/b\.rankKey - a\.rankKey/);
  });

  it('keeps the verdict derived from it', () => {
    // The tag is what replaced the grade on screen. If the derivation goes, the
    // panes lose their read and the removal became a deletion.
    const engine = FILES.find(f => f.file === 'core/contractScore.ts')!;
    expect(engine.text).toMatch(/rankKey >= 70 \? 'BUY' : rankKey >= 52 \? 'WATCH' : 'FADE'/);
  });

  it('leaves the Tracker showing a read, not a delta of one', () => {
    /*
      `scoreDelta` was `live.score - tracked.scoreAtTrack` — the difference
      between two composites, printed in bull green or bear red. It inherited the
      grade's unfalsifiability at twice the confidence AND put a magnitude in a
      direction hue, which the house rule forbids. `verdictAtTrack` was already
      being persisted and read by nothing.
    */
    const tracker = FILES.find(f => f.file === 'pages/Tracker.tsx');
    expect(tracker, 'Tracker.tsx is gone — re-point this test').toBeDefined();
    expect(tracker!.text, 'the Tracker is showing a score delta again').not.toMatch(/scoreDelta/);
    expect(tracker!.text, 'the Tracker must read the verdict it already stores').toMatch(/verdictAtTrack/);
  });
});
