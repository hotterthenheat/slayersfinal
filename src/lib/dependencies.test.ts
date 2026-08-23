import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
==================================================
  SLAYER TERMINAL - EVERY DEPENDENCY IS ACTUALLY USED
  (lib/dependencies.test.ts)

  This exists because of a real count, not a hypothetical.
  At one point EIGHT packages sat in `dependencies` and were
  imported by ZERO files: three Radix primitives, clsx,
  tailwind-merge, class-variance-authority, TanStack Table
  and Radix Tabs. Five were then adopted — the hand-rolled
  focus trap they replaced was not merely repetitive, it was
  wrong — and three were removed after being evaluated and
  declined:

    @radix-ui/react-tabs    the desk bars are ROUTES
                            (/pinpoint/gamma), and Tabs owns
                            its own state and points aria-
                            controls at a panel in the same
                            document. Wrong primitive for
                            URL navigation.
    class-variance-authority
                            no variant table to own —
                            ui/tones.ts already centralises
                            the only axis, and 161 buttons
                            show no dominant repeated shape.
    @tanstack/react-table   ui/DataTable.tsx is already the
                            house primitive (column groups,
                            sorting, term help, alignment)
                            and nine surfaces run on it. A
                            second table abstraction would
                            be a third layer, not a fewer.

  An unused dependency is not free: it is install time, it is
  lockfile surface, it is one more thing a reader assumes the
  app depends on, and it is a supply-chain entry for code that
  never runs. None of that shows up in a build, which is
  exactly why it went unnoticed for eight packages at once.
==================================================
*/

const ROOT = process.cwd();

/**
 * Type-only packages. TypeScript resolves `@types/*` out of node_modules by
 * convention and nothing ever writes the name in an import, so requiring one
 * would make this guard permanently red for packages that are working
 * correctly. The prefix IS the rule — no hand-maintained list to rot.
 */
const isTypesOnly = (name: string) => name.startsWith('@types/');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === '.git') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(?:tsx?|mjs|cjs|js)$/.test(p)) out.push(p);
  }
  return out;
}

const CODE = walk(ROOT)
  .map(p => readFileSync(p, 'utf8'))
  .join('\n');

/**
 * A package counts as used when something imports it by name — bare
 * (`from 'clsx'`) or by subpath (`from 'three/examples/...'`). Covers ESM
 * `import … from`, side-effect `import '…'`, and CJS `require('…')`, because
 * server.ts and the scripts/ tooling are not all ESM.
 */
function isImported(name: string): boolean {
  const n = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const spec = `${n}(?:/[^'"]*)?`;
  return new RegExp(
    `from\\s*['"]${spec}['"]|require\\(\\s*['"]${spec}['"]|import\\s*['"]${spec}['"]`
  ).test(CODE);
}

const PKG = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
  dependencies: Record<string, string>;
};

describe('package.json dependencies', () => {
  it('is read from a real manifest with real entries', () => {
    // The guard's own footing. A parse that silently produced {} would make the
    // assertion below vacuous — every dependency in an empty set is used.
    expect(Object.keys(PKG.dependencies).length).toBeGreaterThan(10);
    expect(CODE.length).toBeGreaterThan(500_000);
  });

  it('detects an import that is there, and does not invent one that is not', () => {
    /*
      Both directions, because a matcher that returns true for everything passes
      the real test while proving nothing, and one that returns false for
      everything fails loudly enough to get "fixed" by deleting the test.
    */
    expect(isImported('react')).toBe(true);
    expect(isImported('@radix-ui/react-dialog')).toBe(true);
    expect(isImported('lightweight-charts')).toBe(true);
    expect(isImported('@tanstack/react-table')).toBe(false); // removed, and stays removed
    expect(isImported('class-variance-authority')).toBe(false);
    expect(isImported('@radix-ui/react-tabs')).toBe(false);
    expect(isImported('a-package-nobody-has-ever-published-xyzzy')).toBe(false);
  });

  it('ships nothing it does not import', () => {
    const dead = Object.keys(PKG.dependencies)
      .filter(name => !isTypesOnly(name))
      .filter(name => !isImported(name))
      .sort();

    expect(
      dead,
      'These are in `dependencies` and no file imports them. Either adopt the ' +
        'package where it earns its place, or `npm uninstall` it — an unused ' +
        'dependency is install time, lockfile surface and supply-chain reach for ' +
        'code that never runs, and none of that shows up in a build.'
    ).toEqual([]);
  });
});
