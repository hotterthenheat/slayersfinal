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

/** Grid metrics, mirrored from the <Grid> props in PulseWorkspace. */
export const GRID = { cols: 12, rowHeight: 64, marginX: 12, marginY: 12 } as const;

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

  return state.version === WORKSPACE_VERSION ? state : null;
}
