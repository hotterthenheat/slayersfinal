/**
 * Geometry and schema for panels that leave the grid.
 *
 * A panel can be in one of three places: docked in the 12-column grid, detached
 * as a floating box inside the workspace, or popped out into its own OS window
 * on any monitor. All three are one layout, saved together, so restoring a
 * layout puts the windows back where they were — including which screen.
 *
 * Everything here is pure. The DOM half lives in usePopout.ts and DetachedLayer
 * .tsx; this file is the part that can be tested, and the part that gets the
 * arithmetic wrong if nobody does.
 */
import type { Layout } from 'react-grid-layout';
import type { PulseWorkspaceState, PulseLayout, PixelBounds, ScreenBox } from './presets';
import { WORKSPACE_VERSION } from './presets';

/**
 * Grid metrics, mirrored from the <Grid> props in PulseWorkspace.
 *
 * `rowHeight` was 64 with row units counted whole, which made the vertical step
 * 76px — a panel could be 444px or 520px tall and nothing in between, so two
 * neighbours of different content lengths always left a band of dead space
 * between them. It is 26 now, with every stored `y` and `h` doubled by the v3
 * migration, which halves the step to 38px and leaves every existing layout
 * pixel-identical: 6 rows at 64 is 6*64+5*12 = 444, and 12 rows at 26 is
 * 12*26+11*12 = 444. The one number that makes that work is 26, not 32.
 */
export const GRID = { cols: 12, rowHeight: 26, marginX: 12, marginY: 12 } as const;

/**
 * The only size limit left, and it is not a readability opinion.
 *
 * The registry still declares a width and height per widget, but those are the
 * size a panel is BORN at and what the auto-arrange modes aim for — not a floor
 * the user's drag is held to. Enforcing them meant a row could not be made to
 * sum to 12, so there was always a strip of canvas nothing could reach.
 *
 * Two units is where the panel stops being able to un-resize itself. Measured
 * in Chromium at 1600px, not guessed:
 *
 *   1 x 1  (116 x 26)  header clipped entirely, 0 of 4 controls reachable
 *   1 x 2  (116 x 64)  header fits, 1 of 4 controls reachable
 *   2 x 2  (244 x 64)  4 of 4 reachable
 *
 * At one unit the panel is a trap: the header is 40px so h=1 crops it, and at
 * 116px wide the button cluster overflows the box. You could shrink a panel and
 * then have nothing left to click to grow it back. Two units costs nothing for
 * packing — a row of seven 116px panels is not a desk anyone wants — and it is
 * an order of magnitude below the old floors, which demanded six columns for
 * the Exposure Matrix alone.
 */
export const MIN_UNITS = { w: 2, h: 2 } as const;

/** Smallest a floating panel may be dragged. Below this the header controls
    start overlapping and the body has nothing left to render into. */
export const MIN_DETACHED = { w: 280, h: 180 } as const;

/**
 * Where a docked panel currently sits, in pixels.
 *
 * Mirrors react-grid-layout's own placement maths (calcPosition in
 * GridItem.js): a column is the leftover width after the inter-column margins
 * are removed, and every span re-adds the margins it swallowed. Getting this
 * wrong is not subtle — the panel visibly jumps at the moment you detach it,
 * which is the one frame where the user is looking straight at it.
 */
export function boundsFromGrid(item: Layout, containerWidth: number): PixelBounds {
  const colWidth = (containerWidth - GRID.marginX * (GRID.cols - 1)) / GRID.cols;
  return {
    x: Math.round((colWidth + GRID.marginX) * item.x),
    y: Math.round((GRID.rowHeight + GRID.marginY) * item.y),
    w: Math.round(colWidth * item.w + Math.max(0, item.w - 1) * GRID.marginX),
    h: Math.round(GRID.rowHeight * item.h + Math.max(0, item.h - 1) * GRID.marginY),
  };
}

/**
 * Keep a floating panel reachable.
 *
 * The rule is deliberately NOT "keep it fully inside". A trader dragging a
 * panel half off the right edge to park it is doing that on purpose. What must
 * never happen is losing the header, because the header is the only way to drag
 * it back — so the constraint is that a grab-sized strip of the title bar stays
 * on screen, and the top never goes negative.
 */
export function clampBounds(b: PixelBounds, viewport: { w: number; h: number }): PixelBounds {
  const w = Math.max(MIN_DETACHED.w, Math.min(b.w, Math.max(MIN_DETACHED.w, viewport.w)));
  const h = Math.max(MIN_DETACHED.h, Math.min(b.h, Math.max(MIN_DETACHED.h, viewport.h)));
  const GRAB = 96;
  return {
    w,
    h,
    x: Math.round(Math.min(Math.max(b.x, GRAB - w), Math.max(0, viewport.w - GRAB))),
    y: Math.round(Math.min(Math.max(b.y, 0), Math.max(0, viewport.h - 40))),
  };
}

/**
 * A window box centred on one screen.
 *
 * Screen coordinates from the Window Management API are in the VIRTUAL desktop
 * space, where a monitor left of the primary has a negative `left`. Passing
 * those straight to window.open is correct and is the whole mechanism behind
 * "open this on my second monitor" — no offsetting, no absolute values.
 *
 * `avail*` rather than the raw screen size, so the box does not land under a
 * taskbar or a menu bar.
 */
export function boundsOnScreen(screen: ScreenBox, fraction = 0.6): ScreenBox {
  const width = Math.max(360, Math.round(screen.width * fraction));
  const height = Math.max(280, Math.round(screen.height * fraction));
  return {
    width,
    height,
    left: Math.round(screen.left + (screen.width - width) / 2),
    top: Math.round(screen.top + (screen.height - height) / 2),
  };
}

/** window.open's feature string. `popup=yes` is what asks for a chromeless
    window rather than a tab, which is the difference between a panel and a
    second copy of the app. */
export function popoutFeatures(box: ScreenBox): string {
  return [
    'popup=yes',
    `width=${Math.round(box.width)}`,
    `height=${Math.round(box.height)}`,
    `left=${Math.round(box.left)}`,
    `top=${Math.round(box.top)}`,
    'menubar=no',
    'toolbar=no',
    'location=no',
    'status=no',
    'resizable=yes',
    'scrollbars=yes',
  ].join(',');
}

/** Which screen a box is on, by centre point. Used to label a saved pop-out
    ("Display 2") without storing a screen id that means nothing after the
    monitors are rearranged. */
export function screenIndexOf(box: ScreenBox, screens: readonly ScreenBox[]): number {
  const cx = box.left + box.width / 2;
  const cy = box.top + box.height / 2;
  const hit = screens.findIndex(s => cx >= s.left && cx < s.left + s.width && cy >= s.top && cy < s.top + s.height);
  return hit;
}

/** True when two boxes differ enough to be worth a write. Window position is
    polled (there is no move event), so without this the workspace would save on
    every tick of a drag and thrash localStorage for the whole gesture. */
export function boxMoved(a: ScreenBox | undefined, b: ScreenBox): boolean {
  if (!a) return true;
  return (
    Math.abs(a.left - b.left) > 2 ||
    Math.abs(a.top - b.top) > 2 ||
    Math.abs(a.width - b.width) > 2 ||
    Math.abs(a.height - b.height) > 2
  );
}

/**
 * Fold react-grid-layout's report back into the saved layout.
 *
 * RGL only ever reports the panels it is RENDERING, and the grid does not
 * render a panel that is detached or popped out. Writing its report straight
 * back therefore deletes the cell of every panel currently away from the grid;
 * docking one then hands RGL an item it has never seen, and it lands at the
 * default 1x1 in the top-left corner. Observed: a chart panel came back as a
 * 90px stub, which is what "a panel keeps its cell while it is away" was
 * supposed to guarantee.
 */
export function mergeLayout(reported: Layout[], saved: Layout[], awayIds: readonly string[]): Layout[] {
  const away = new Set(awayIds);
  const kept = saved.filter(g => away.has(g.i));
  // Reported wins for anything docked — it is the live geometry the user just
  // dragged. Absent cells ride along untouched.
  const seen = new Set(reported.map(g => g.i));
  return [...reported, ...kept.filter(g => !seen.has(g.i))];
}

// ---- dead space ----------------------------------------------------------

const spansRow = (a: Layout, b: Layout) => a.y < b.y + b.h && b.y < a.y + a.h;
const spansCol = (a: Layout, b: Layout) => a.x < b.x + b.w && b.x < a.x + a.w;

/** Grow every panel right, then down, into space nothing else claims. `may`
    decides which panels take part in this pass. */
function grow(out: Layout[], may: (g: Layout) => boolean, cols: number): void {
  for (const g of out) {
    if (!may(g)) continue;
    let right = cols;
    for (const o of out) {
      if (o === g || !spansRow(g, o)) continue;
      if (o.x >= g.x + g.w) right = Math.min(right, o.x);
    }
    g.w = Math.max(g.w, right - g.x);
  }
  const floor = Math.max(...out.map(g => g.y + g.h));
  for (const g of out) {
    if (!may(g)) continue;
    let below = floor;
    for (const o of out) {
      if (o === g || !spansCol(g, o)) continue;
      if (o.y >= g.y + g.h) below = Math.min(below, o.y);
    }
    g.h = Math.max(g.h, below - g.y);
  }
}

/**
 * Keep the desk gapless as a RULE, not as a button.
 *
 * Make one panel smaller and its neighbours take the space, the way a tiling
 * window manager behaves. Growing alone cannot do this: it would hand the freed
 * columns straight back to the panel that just gave them up, and the drag would
 * appear to do nothing. The neighbours have to slide in FIRST.
 *
 * Four moves, in this order:
 *   1. Left-pack. This is what actually transfers the freed columns — the panel
 *      to the right of the one you shrank slides over to meet it.
 *   2. Up-pack, the vertical half of the same move.
 *   3. Grow everything EXCEPT the panel you just let go of. Its size is the one
 *      the user chose; every other panel absorbs what is left.
 *   4. Grow anything still bordering a hole, held panel included. Step 3 cannot
 *      always finish: a panel alone in its row has no neighbour to donate to,
 *      and there "keep my width" and "no dead space" are contradictory. The
 *      invariant wins, because a gap is visible and a few columns are not.
 *
 * `protect` is normally the single panel under the cursor.
 */
export function tile(layout: Layout[], protect: readonly string[] = [], cols: number = GRID.cols): Layout[] {
  const out = layout.map(g => ({ ...g })).sort((a, b) => a.y - b.y || a.x - b.x);
  if (out.length === 0) return out;

  // Positions update as we go, in reading order, so a panel slides into the
  // space the one before it just vacated — the same shape as react-grid-layout's
  // own vertical compaction, turned on its side.
  for (const g of out) {
    let x = 0;
    for (const o of out) {
      if (o === g || !spansRow(g, o)) continue;
      if (o.x + o.w <= g.x) x = Math.max(x, o.x + o.w);
    }
    g.x = x;
  }

  // RGL's `compactType="vertical"` usually does this before we ever see the
  // layout, but relying on that would make this correct only by accident — and
  // it is also called on paths RGL never touches, like a restored desk.
  const byRow = [...out].sort((a, b) => a.y - b.y || a.x - b.x);
  for (const g of byRow) {
    let y = 0;
    for (const o of byRow) {
      if (o === g || !spansCol(g, o)) continue;
      if (o.y + o.h <= g.y) y = Math.max(y, o.y + o.h);
    }
    g.y = y;
  }

  const held = new Set(protect);
  grow(out, g => !held.has(g.i), cols);
  grow(out, () => true, cols);
  return out;
}

/**
 * How much of the desk is empty, 0 to 1. Drives the toolbar's "Fill" affordance
 * so it can say what it will actually do instead of being a mystery button.
 */
export function deadSpace(layout: Layout[], cols: number = GRID.cols): number {
  if (layout.length === 0) return 0;
  const rows = Math.max(...layout.map(g => g.y + g.h));
  if (rows <= 0) return 0;
  const used = layout.reduce((a, g) => a + g.w * g.h, 0);
  return Math.max(0, 1 - used / (cols * rows));
}

// ---- schema migration ----------------------------------------------------

/**
 * Upgrade a saved workspace in place rather than discarding it.
 *
 * `loadState` returns a fresh workspace whenever the stored version does not
 * match, which means bumping WORKSPACE_VERSION without a migration silently
 * deletes every layout the user has built — the documented hazard for this
 * codebase, and one that no test catches because the wipe is a valid outcome of
 * the code as written.
 *
 * v1 → v2 adds `detached`, `popout` and `docked` to PulsePanel. All three are
 * optional and absent means docked, so the migration is a version stamp. It is
 * written out as a real function anyway: the next migration will not be free,
 * and the place to discover that is here rather than in a bug report about
 * vanished desks.
 */
export function migrateWorkspace(parsed: PulseWorkspaceState): PulseWorkspaceState | null {
  if (!parsed || !Array.isArray(parsed.layouts) || parsed.layouts.length === 0) return null;
  let state = parsed;

  if (state.version === 1) {
    state = {
      ...state,
      version: 2,
      // No field to backfill: a v1 panel had no out-of-grid state, so every one
      // of them is docked, which is what `detached`/`popout` being absent means.
      layouts: state.layouts.map((l: PulseLayout) => ({ ...l, panels: l.panels.map(p => ({ ...p })) })),
    };
  }

  if (state.version === 2) {
    // Row units are half as tall now, so every vertical number doubles and the
    // desk stays pixel-identical while gaining a step half the size. The
    // per-widget size floors go with it: they were the reason a row could not
    // be made to sum to 12, and they are a starting size now, not a limit.
    state = {
      ...state,
      version: 3,
      layouts: state.layouts.map(l => ({
        ...l,
        panels: l.panels.map(p => ({ ...p, restoreH: p.restoreH == null ? undefined : p.restoreH * 2 })),
        layout: l.layout.map(g => ({ ...g, y: g.y * 2, h: g.h * 2, minW: MIN_UNITS.w, minH: MIN_UNITS.h })),
      })),
    };
  }

  return state.version === WORKSPACE_VERSION ? state : null;
}
