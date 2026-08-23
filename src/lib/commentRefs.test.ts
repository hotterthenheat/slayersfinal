import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
==================================================
  SLAYER TERMINAL - A COMMENT MAY NOT POINT AT NOTHING
  (lib/commentRefs.test.ts)

  This codebase is 21% comment lines, and that is on
  purpose: the comments carry the WHY, and most of them
  point somewhere — "see core/openInterest.ts", "same reason
  as compass.ts:664", "mirrors components/gex/palette.ts".
  A cross-reference is the most useful kind of comment and
  the only kind that can rot without anyone noticing, because
  following one costs a reader thirty seconds and finding
  nothing costs them their trust in the rest.

  Four had already rotted when this guard was written:

    volComplex.ts             data/ivRank.ts  → core/ivRank.ts
    executionQuality.ts       `sessionRates`  → never existed
    feedSource.ts             `SIMULATED`     → SIMULATED_FEED
    positioningMapModel.ts    `priorScaled`   → `prior`

  Nothing in a build, a lint or a type check reads prose, so
  a rename fixes every call site and leaves every mention.
  This reads the prose.

  IT GUARDS PATHS, NOT EVERY WORD. A backticked identifier
  can legitimately name a ThetaData endpoint, a browser API,
  a Radix primitive the app deliberately does NOT use, or a
  function that was deleted on purpose and is being recorded
  — so policing those would mean an allowlist longer than
  the findings. A repo-relative source path is unambiguous:
  either the file is there or the comment is lying.
==================================================
*/

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

/** Block comments and whole-line `//` comments — the same shape as the house stripper. */
function commentsOf(text: string): { at: number; body: string }[] {
  const out: { at: number; body: string }[] = [];
  for (const m of text.matchAll(/\/\*[\s\S]*?\*\//g)) out.push({ at: m.index!, body: m[0] });
  for (const m of text.matchAll(/^[ \t]*\/\/.*$/gm)) out.push({ at: m.index!, body: m[0] });
  return out;
}

const lineOf = (text: string, at: number) => text.slice(0, at).split('\n').length;

/**
 * A path into this app's own source. Anchored on the top-level directories that
 * exist, so `docs/…`, a URL path, and an npm specifier are all out of scope —
 * this is about references a reader can open in the editor they are already in.
 */
const SRC_PATH = /(?:src\/)?((?:core|data|components|pages|lib|hooks|types|context)\/[A-Za-z0-9_./-]+\.(?:tsx?|css))/g;

/**
 * Paths that are MEANT to be absent: a comment recording what was deleted and
 * why is the most valuable comment in the file, and the file being gone is the
 * point. Each entry names the record it belongs to, so an entry added to hide a
 * genuine rot has to be a sentence somebody wrote on purpose.
 */
const DELETED_ON_PURPOSE = new Map<string, string>([
  [
    'data/news.ts',
    'The news desk, removed for want of a news feed — see docs/DATA-FEASIBILITY.md. ' +
      'quant.ts, statereplay.ts, honesty.test.ts and StockDetailModal.tsx each record the removal.',
  ],
  [
    'hooks/useFocusTrap.ts',
    'The hand-rolled focus trap Radix Dialog replaced. ui/Overlay.tsx records what was wrong with it.',
  ],
]);

/**
 * This file is excluded from its own scan, and it caught itself on the first
 * run — the header above quotes `data/ivRank.ts` as an example of a path that
 * had rotted, and the guard read the example as a reference. Documenting a bad
 * path is the one place a bad path belongs.
 */
const SELF = 'lib/commentRefs.test.ts';

const FILES = walk(SRC)
  .map(p => ({
    file: p.slice(SRC.length + 1).replace(/\\/g, '/'),
    text: readFileSync(p, 'utf8'),
  }))
  .filter(f => f.file !== SELF);

describe('cross-references in comments', () => {
  it('reads a corpus with references in it', () => {
    // The guard's own footing: an empty scan would pass the assertion below
    // while proving nothing about a single comment.
    const refs = FILES.flatMap(f => commentsOf(f.text)).flatMap(c => [...c.body.matchAll(SRC_PATH)]);
    expect(refs.length).toBeGreaterThan(40);
  });

  it('never points at a source file that does not exist', () => {
    const dangling: string[] = [];
    for (const f of FILES) {
      for (const c of commentsOf(f.text)) {
        for (const m of c.body.matchAll(SRC_PATH)) {
          const rel = m[1];
          if (DELETED_ON_PURPOSE.has(rel)) continue;
          if (!existsSync(join(SRC, rel))) {
            dangling.push(`${f.file}:${lineOf(f.text, c.at)} → ${rel}`);
          }
        }
      }
    }
    expect(
      dangling.sort(),
      'A comment names a source file that is not there. Nothing in the build, the ' +
        'linter or the type checker reads prose, so a rename fixes every call site and ' +
        'leaves every mention — and a reader who follows one of these spends thirty ' +
        'seconds finding nothing. Correct the path, or add it to DELETED_ON_PURPOSE ' +
        'with the record it belongs to.'
    ).toEqual([]);
  });

  it('does not carry a deletion record for a file that came back', () => {
    // The exemptions only shrink. An entry that stops being true is a lie that
    // still passes.
    const resurrected = [...DELETED_ON_PURPOSE.keys()].filter(rel => existsSync(join(SRC, rel)));
    expect(resurrected, 'these are listed as deleted but exist').toEqual([]);
  });

  it('finds a dangling path when there is one', () => {
    // Both directions, because a matcher that never fires passes the real test
    // on an empty set.
    const probe = '/* see core/thisFileDoesNotExist.ts for the rest */';
    const found = [...probe.matchAll(SRC_PATH)].map(m => m[1]);
    expect(found).toEqual(['core/thisFileDoesNotExist.ts']);
    expect(existsSync(join(SRC, found[0]))).toBe(false);
    // …and a real one resolves.
    const real = [...'/* see core/openInterest.ts */'.matchAll(SRC_PATH)].map(m => m[1]);
    expect(existsSync(join(SRC, real[0]))).toBe(true);
  });
});
