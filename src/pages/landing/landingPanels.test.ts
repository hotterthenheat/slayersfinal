import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
==================================================
  SLAYER TERMINAL - THE LANDING'S PANELS ARE THE DESKS' PANELS
  (pages/landing/landingPanels.test.ts)

  The landing page makes a claim in 36px type:

      "Not screenshots. The actual panels."
      the same components the desks render

  and further down, above the workspace loop:

      "These are the real panels, rearranging themselves so you don't have to
       imagine it."

  Three of the four cards were not. `Compass` rendered `DemoSetup` and `Trace`
  rendered `DemoTape` — both landing-local rebuilds, named `Demo*` in their own
  source — and `Pulse` rendered `KeyLevelsRail`, which is a PINPOINT component
  and does not appear in `workspace/registry.tsx` at all, so the panel shown
  under Pulse's name was one the Pulse workspace cannot mount. The workspace loop
  below carried the same three.

  A marketing claim that is false about the product is the one defect class this
  codebase treats as non-negotiable, and it was sitting on the first page a
  visitor sees. So the section renders real desk components now, and this keeps
  it that way: anything rendered under that claim must be imported from a desk,
  never declared in the landing file.
==================================================
*/

const SRC = join(process.cwd(), 'src');
const LANDING = readFileSync(join(SRC, 'pages/landing/LiveSections.tsx'), 'utf8');
const REGISTRY = readFileSync(join(SRC, 'pages/workspace/registry.tsx'), 'utf8');

/*
  Comments stripped — a claim quoted in prose must not satisfy a check on code.

  Tempered token rather than a lazy wildcard: `[\s\S]*?` between `{` and a block
  comment backtracks past the comment's end looking for a closing brace and
  deletes every line it crosses. `[^*]|\*(?!\/)` cannot cross a terminator.
*/
const code = LANDING.replace(/\/\*(?:[^*]|\*(?!\/))*\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

/** Components declared inside the landing file itself. */
const localComponents = new Set(
  [...code.matchAll(/^const ([A-Z]\w*)\s*=\s*(?:\([^)]*\)|\w+)\s*(?::[^=]+)?=>/gm)].map(m => m[1])
);

/** Components imported from a desk — the only ones allowed under the claim. */
const deskImports = new Set(
  [...code.matchAll(/^import\s+(\w+)\s+from\s+'\.\.\/\.\.\/components\/(gex|compass|flowdesk|swing|tracker)\/[^']+';/gm)].map(
    m => m[1]
  )
);

/** The block between the claim and the section that follows it. */
function claimBlock(): string {
  const start = code.indexOf('Not screenshots');
  expect(start, 'the "Not screenshots" claim is gone — re-point this test').toBeGreaterThan(-1);
  const end = code.indexOf('EnterExitStory', start);
  return code.slice(start, end > start ? end : start + 6000);
}

/** Every `<Foo` rendered in a block, ignoring the landing's own layout shells. */
const SHELLS = new Set(['EngineBox', 'TiltBox', 'SectionKicker', 'WorkspaceLoop', 'Link', 'AnimatePresence']);
const rendered = (block: string): string[] =>
  [...new Set([...block.matchAll(/<([A-Z]\w*)/g)].map(m => m[1]))].filter(n => !SHELLS.has(n));

describe('the "actual panels" claim', () => {
  it('renders no landing-local rebuild of a desk panel', () => {
    const locals = rendered(claimBlock()).filter(n => localComponents.has(n));
    /*
      `DemoSetupCard` is the one permitted local: it is an ADAPTER, not a panel.
      It picks the top Setup off the scan and hands it to the desk's own
      `SetupScanCard` unchanged. If it ever starts drawing markup of its own it
      stops being an adapter and this exemption should go with it.
    */
    expect(
      locals.filter(n => n !== 'DemoSetupCard'),
      'A component declared in the landing file is rendered under "Not screenshots. The actual ' +
        'panels." That heading is a claim about the product. Render the desk\'s own component, or ' +
        'change the heading.'
    ).toEqual([]);
  });

  it('renders components imported from the desks', () => {
    const fromDesks = rendered(claimBlock()).filter(n => deskImports.has(n));
    expect(
      fromDesks.length,
      'nothing under the claim is imported from components/{gex,compass,flowdesk} — the section ' +
        'is showing landing-local markup again'
    ).toBeGreaterThanOrEqual(3);
  });

  it('shows Pulse a panel the Pulse workspace can actually mount', () => {
    /*
      The sharpest version of the old lie. `KeyLevelsRail` is not in
      `workspace/registry.tsx`, so no workspace — Pulse included — can hold it,
      yet it was what the landing displayed under Pulse's name.

      Every component rendered under the claim must be one the registry mounts,
      so what a visitor sees is a panel they can add to their own grid.
    */
    for (const name of rendered(claimBlock()).filter(n => deskImports.has(n))) {
      expect(
        REGISTRY,
        `${name} is shown under "the actual panels" but workspace/registry.tsx never renders it, ` +
          `so no desk can mount it`
      ).toContain(`<${name}`);
    }
  });

  it('holds the workspace loop to the same claim', () => {
    // "These are the real panels, rearranging themselves" — same sentence, same rule.
    const start = code.indexOf('tiles={');
    expect(start, 'the workspace loop is gone — re-point this test').toBeGreaterThan(-1);
    const block = code.slice(start, start + 3000);
    const locals = rendered(block).filter(n => localComponents.has(n) && n !== 'DemoSetupCard');
    expect(locals, 'the workspace loop is rendering landing-local panels under a "real panels" claim').toEqual(
      []
    );
    for (const name of rendered(block).filter(n => deskImports.has(n))) {
      expect(REGISTRY, `${name} is in the workspace loop but the registry never renders it`).toContain(
        `<${name}`
      );
    }
  });
});
