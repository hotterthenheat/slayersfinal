import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
==================================================
  SLAYER TERMINAL - LANDING CHART IS NOT AN INSTRUMENT (landingChart.test.ts)
  The hero chart does not pan or zoom. The desk's does.

  lightweight-charts enables `handleScroll` AND `handleScale` by default — drag,
  wheel, pinch, press-drag on either axis — and StrikeChart never turned them
  off. On a desk that is correct; reframing a chart is the job. On the landing
  page it means a visitor can shove the hero candles into blank space on the
  first surface they ever see, and the landing already believed it had prevented
  that: its call site carries the comment "a preview of the read, not a desk to
  operate" and passes `showTimeframePicker={false}`. The intent stopped at the
  picker. The chart underneath stayed fully draggable.

  ---------------------------------------------------------------------------
  WHY THIS IS A SOURCE TEST AND NOT A BROWSER TEST.

  It was a browser test first, and it lied twice.

  The first version dragged the chart and diffed a 22px strip at the bottom of
  the pane, described in its own variable name as the time axis. That strip is
  the VOLUME HISTOGRAM. It repaints on every 1.5s simulator tick, so it reported
  PANNED against a build with `handleScroll: false` hardcoded — a chart whose
  before/after screenshots were pixel-identical.

  Widening to the candle body did not fix it, and neither did narrowing to the
  left third on the theory that a tick only touches the newest bar. It does not:
  `showRecent()` runs on every `revision` change and calls
  `setVisibleLogicalRange`, so the whole window slides once a second. A chart
  that re-frames itself on a timer cannot be measured by comparing two
  screenshots taken a second apart, and every version of that test that appeared
  to work was reading a repaint.

  What the browser DID establish, on a build with the option hardcoded off: the
  option works in lightweight-charts 5.2.0 — the frames were identical. So the
  open question is not whether the mechanism works. It is whether the wiring is
  still connected, and that is a question about source text.
==================================================
*/

const SRC = join(process.cwd(), 'src');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');

/**
 * Source with its comments removed.
 *
 * The first cut of this test did not do this and was decorative because of it.
 * The landing's chart mount carries a JSX comment explaining the lock, and that
 * comment quotes the prop verbatim — `interactive={false}` — so deleting the
 * REAL prop left the string still present inside the mount block and all three
 * assertions passed against an unlocked chart. Verified by deleting it.
 *
 * Strips block comments, JSX comments and line comments before any matching, so
 * every assertion below reads code and nothing else.
 */
const code = (text: string): string =>
  // Tempered token, not a lazy wildcard. `[\s\S]*?` between `{` and `*&#47;`
  // backtracks past the comment's end hunting for a closing brace and deletes
  // every line it crosses — measured swallowing the middle of a 1,100-line
  // component. `[^*]|\*(?!\/)` cannot cross a terminator. Stripping the block
  // comment leaves a bare `{ }`, which matches nothing that matters here.
  text.replace(/\/\*(?:[^*]|\*(?!\/))*\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

const CHART = code(read('components/gex/StrikeChart.tsx'));
const LANDING = code(read('pages/landing/LiveSections.tsx'));
const DESK = code(read('pages/workspace/registry.tsx'));

describe('the landing hero chart', () => {
  it('is mounted with interaction off', () => {
    // Anchored to the <StrikeChart …> element, not to the file: a bare
    // `interactive={false}` anywhere in a 700-line page would pass while the
    // chart sat unlocked next to it.
    const mount = LANDING.match(/<StrikeChart\b[\s\S]*?\/>/);
    expect(mount, 'the landing no longer mounts StrikeChart — re-point this test').not.toBeNull();
    expect(
      mount![0],
      'the landing hero chart must pass interactive={false}; without it lightweight-charts ' +
        'lets a visitor drag the candles off screen on the first surface they see'
    ).toMatch(/interactive=\{false\}/);
  });

  it('leaves the desk chart interactive', () => {
    /*
      The half that makes the other half mean something. A lock applied to the
      shared component instead of to this one call site would satisfy the test
      above and silently take pan and zoom away from every desk — which is the
      opposite of what a trader wants and would not fail anything else in the
      suite.
    */
    const mount = DESK.match(/<StrikeChart\b[\s\S]*?\/>/);
    expect(mount, 'the workspace no longer mounts StrikeChart — re-point this test').not.toBeNull();
    expect(mount![0], 'the desk chart must stay pannable — do not pass interactive here').not.toMatch(
      /interactive=/
    );
    expect(CHART, 'interactive must DEFAULT to true so every other call site keeps pan/zoom').toMatch(
      /interactive = true/
    );
  });

  it('wires the prop to both gestures, at both sites', () => {
    /*
      Scroll and scale are separate options, and locking only one is not a
      partial fix: with scale left on, a wheel still stretches the axes until the
      candles are a smear. Same defect, different gesture.

      Both are set TWICE — once in the mount-time `createChart` options so the
      chart is locked on its first frame, and once in an `applyOptions` effect so
      the prop stays honest if a caller ever makes it dynamic. Asserting on the
      whole file could not tell those apart: replacing `handleScale: interactive`
      in the createChart block left the applyOptions copy behind, a plain
      `toMatch` over the file still found it, and the test passed against a chart
      that zoomed. Verified by making exactly that edit. So each site is matched
      where it stands.
    */
    const mountOpts = CHART.match(/createChart\([\s\S]*?\n\s*\}\);/);
    expect(mountOpts, 'createChart options block not found — re-point this test').not.toBeNull();
    expect(mountOpts![0], 'mount-time options must lock scroll').toMatch(/handleScroll:\s*interactive\b/);
    expect(mountOpts![0], 'mount-time options must lock scale').toMatch(/handleScale:\s*interactive\b/);

    const applied = CHART.match(/applyOptions\(\{[^}]*handle[^}]*\}\)/);
    expect(applied, 'no applyOptions call keeping the lock in step with the prop').not.toBeNull();
    expect(applied![0], 'the reactive apply must carry scroll').toMatch(/handleScroll:\s*interactive\b/);
    expect(applied![0], 'the reactive apply must carry scale').toMatch(/handleScale:\s*interactive\b/);
  });
});
