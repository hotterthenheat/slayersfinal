import { describe, it, expect } from 'vitest';
import {
  GRID,
  MIN_DETACHED,
  boundsFromGrid,
  boundsOnScreen,
  boxMoved,
  clampBounds,
  mergeLayout,
  migrateWorkspace,
  popoutFeatures,
  screenIndexOf,
} from './detach';
import { PULSE_PRESETS, WORKSPACE_VERSION, type PulseWorkspaceState } from './presets';

/** A 1536-wide desk, which is what the presets' comments were measured on. */
const W = 1536;

describe('boundsFromGrid', () => {
  it('spans the full container for a 12-wide panel', () => {
    const b = boundsFromGrid({ i: 'a', x: 0, y: 0, w: 12, h: 6 }, W);
    expect(b.x).toBe(0);
    expect(b.y).toBe(0);
    expect(b.w).toBe(W);
  });

  it('lays adjacent panels edge to edge with exactly one margin between', () => {
    // The pairing every preset relies on: 8 + 4 across one band.
    const left = boundsFromGrid({ i: 'l', x: 0, y: 0, w: 8, h: 6 }, W);
    const right = boundsFromGrid({ i: 'r', x: 8, y: 0, w: 4, h: 6 }, W);
    expect(right.x - (left.x + left.w)).toBe(GRID.marginX);
    expect(right.x + right.w).toBe(W);
  });

  it('re-adds the margins a multi-column span swallows', () => {
    // A w=2 panel is two columns PLUS the margin between them, not two columns.
    const one = boundsFromGrid({ i: 'a', x: 0, y: 0, w: 1, h: 1 }, W);
    const two = boundsFromGrid({ i: 'b', x: 0, y: 0, w: 2, h: 1 }, W);
    expect(two.w).toBe(one.w * 2 + GRID.marginX);
  });

  it('advances a row by the row height plus its margin', () => {
    const r0 = boundsFromGrid({ i: 'a', x: 0, y: 0, w: 4, h: 1 }, W);
    const r1 = boundsFromGrid({ i: 'b', x: 0, y: 1, w: 4, h: 1 }, W);
    expect(r1.y - r0.y).toBe(GRID.rowHeight + GRID.marginY);
    expect(r0.h).toBe(GRID.rowHeight);
  });

  it('detaching does not move the panel, at every cell of the grid', () => {
    // The property that matters: the pixel box a panel occupies while docked is
    // the box it gets when it floats, so there is no jump on the frame where
    // the user is looking straight at it.
    for (let x = 0; x < GRID.cols; x++) {
      for (let w = 1; w <= GRID.cols - x; w++) {
        const b = boundsFromGrid({ i: 'p', x, y: 3, w, h: 5 }, W);
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.x + b.w).toBeLessThanOrEqual(W + 1); // +1 for rounding
      }
    }
  });
});

describe('clampBounds', () => {
  const vp = { w: 1200, h: 800 };

  it('leaves a panel that is already on screen alone', () => {
    const b = { x: 100, y: 100, w: 400, h: 300 };
    expect(clampBounds(b, vp)).toEqual(b);
  });

  it('allows a panel to hang off the right edge, but keeps a grab strip', () => {
    const b = clampBounds({ x: 5000, y: 100, w: 400, h: 300 }, vp);
    expect(b.x).toBeLessThan(vp.w);
    expect(vp.w - b.x).toBeGreaterThanOrEqual(96);
  });

  it('allows a panel to hang off the LEFT edge, keeping the same strip', () => {
    const b = clampBounds({ x: -5000, y: 100, w: 400, h: 300 }, vp);
    expect(b.x + b.w).toBeGreaterThanOrEqual(96);
  });

  it('never lets the title bar go above the top, which is unrecoverable', () => {
    expect(clampBounds({ x: 10, y: -900, w: 400, h: 300 }, vp).y).toBe(0);
  });

  it('keeps the header reachable from any absurd position', () => {
    const cases = [
      { x: -1e6, y: -1e6 },
      { x: 1e6, y: 1e6 },
      { x: 0, y: 1e6 },
      { x: 1e6, y: 0 },
    ];
    for (const c of cases) {
      const b = clampBounds({ ...c, w: 400, h: 300 }, vp);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeLessThanOrEqual(vp.h);
      expect(b.x + b.w).toBeGreaterThan(0);
      expect(b.x).toBeLessThan(vp.w);
    }
  });

  it('enforces the minimum size', () => {
    const b = clampBounds({ x: 10, y: 10, w: 10, h: 10 }, vp);
    expect(b.w).toBe(MIN_DETACHED.w);
    expect(b.h).toBe(MIN_DETACHED.h);
  });

  it('does not invert on a viewport smaller than the minimum panel', () => {
    // A phone-sized window should still produce a sane box rather than a
    // negative width from clamping max below min.
    const b = clampBounds({ x: 0, y: 0, w: 400, h: 300 }, { w: 200, h: 150 });
    expect(b.w).toBeGreaterThanOrEqual(MIN_DETACHED.w);
    expect(b.h).toBeGreaterThanOrEqual(MIN_DETACHED.h);
  });
});

describe('boundsOnScreen', () => {
  const primary = { left: 0, top: 0, width: 1920, height: 1080 };
  /** A monitor physically to the LEFT of the primary. Negative left is the
      whole mechanism for addressing it, so it is pinned here. */
  const leftOfPrimary = { left: -1920, top: 0, width: 1920, height: 1080 };

  it('centres the box on the given screen', () => {
    const b = boundsOnScreen(primary, 0.5);
    expect(b.width).toBe(960);
    expect(b.left + b.width / 2).toBe(primary.left + primary.width / 2);
    expect(b.top + b.height / 2).toBe(primary.top + primary.height / 2);
  });

  it('keeps negative coordinates for a monitor left of the primary', () => {
    const b = boundsOnScreen(leftOfPrimary, 0.5);
    expect(b.left).toBeLessThan(0);
    expect(b.left + b.width).toBeLessThanOrEqual(0);
  });

  it('never returns a window too small to hold a panel', () => {
    const b = boundsOnScreen({ left: 0, top: 0, width: 200, height: 100 }, 0.6);
    expect(b.width).toBeGreaterThanOrEqual(360);
    expect(b.height).toBeGreaterThanOrEqual(280);
  });
});

describe('screenIndexOf', () => {
  const screens = [
    { left: 0, top: 0, width: 1920, height: 1080 },
    { left: 1920, top: 0, width: 2560, height: 1440 },
    { left: -1920, top: 0, width: 1920, height: 1080 },
  ];

  it('finds the screen a window is centred on', () => {
    expect(screenIndexOf({ left: 100, top: 100, width: 400, height: 300 }, screens)).toBe(0);
    expect(screenIndexOf({ left: 2000, top: 100, width: 400, height: 300 }, screens)).toBe(1);
    expect(screenIndexOf({ left: -1800, top: 100, width: 400, height: 300 }, screens)).toBe(2);
  });

  it('reports -1 when the window is off every screen', () => {
    // Happens for real: a monitor is unplugged while a pop-out is on it.
    expect(screenIndexOf({ left: 99999, top: 0, width: 400, height: 300 }, screens)).toBe(-1);
  });

  it('assigns a window straddling two screens to the one holding its centre', () => {
    // Centre at 1920 + 100 → screen 1, even though most pixels are on screen 0.
    expect(screenIndexOf({ left: 1620, top: 100, width: 800, height: 300 }, screens)).toBe(1);
  });
});

describe('popoutFeatures', () => {
  it('asks for a real popup rather than a tab, at the given box', () => {
    const f = popoutFeatures({ left: -1800, top: 40, width: 900, height: 700 });
    expect(f).toContain('popup=yes');
    expect(f).toContain('left=-1800');
    expect(f).toContain('top=40');
    expect(f).toContain('width=900');
    expect(f).toContain('height=700');
  });

  it('rounds subpixel geometry, which window.open would otherwise drop', () => {
    const f = popoutFeatures({ left: 10.6, top: 20.4, width: 900.5, height: 700.5 });
    expect(f).toContain('left=11');
    expect(f).toContain('top=20');
    expect(f).not.toMatch(/\d\.\d/);
  });
});

describe('boxMoved', () => {
  const a = { left: 0, top: 0, width: 800, height: 600 };

  it('is true when there is nothing to compare against', () => {
    expect(boxMoved(undefined, a)).toBe(true);
  });

  it('ignores sub-pixel jitter, so a drag does not thrash storage', () => {
    expect(boxMoved(a, { ...a, left: 1, top: 1 })).toBe(false);
  });

  it('catches a real move and a real resize', () => {
    expect(boxMoved(a, { ...a, left: 1920 })).toBe(true);
    expect(boxMoved(a, { ...a, width: 1200 })).toBe(true);
  });
});

describe('mergeLayout', () => {
  const saved = [
    { i: 'chart', x: 0, y: 0, w: 8, h: 6 },
    { i: 'heat', x: 8, y: 0, w: 4, h: 6 },
    { i: 'flow', x: 0, y: 6, w: 12, h: 4 },
  ];

  it('keeps the cell of a panel the grid is not rendering', () => {
    // The bug this exists for, caught by driving a browser rather than by
    // reading the code: react-grid-layout only reports what it renders, so a
    // detached panel's cell was being deleted on the very next layout event.
    // Docking it then produced a 90px stub in the corner where a chart had been.
    const reported = saved.filter(g => g.i !== 'chart');
    const merged = mergeLayout(reported, saved, ['chart']);
    expect(merged.find(g => g.i === 'chart')).toEqual({ i: 'chart', x: 0, y: 0, w: 8, h: 6 });
    expect(merged).toHaveLength(3);
  });

  it('takes the grid’s geometry for docked panels, since the user just dragged it', () => {
    const reported = [{ i: 'heat', x: 0, y: 0, w: 6, h: 9 }];
    const merged = mergeLayout(reported, saved, ['chart', 'flow']);
    expect(merged.find(g => g.i === 'heat')).toEqual({ i: 'heat', x: 0, y: 0, w: 6, h: 9 });
  });

  it('never duplicates a panel that is both reported and saved', () => {
    // Belt and braces: a panel mid-transition could appear in both lists, and a
    // duplicate key in the layout makes RGL render it twice.
    const merged = mergeLayout(saved, saved, ['chart']);
    expect(merged.map(g => g.i).sort()).toEqual(['chart', 'flow', 'heat']);
  });

  it('is a pass-through when nothing is away', () => {
    expect(mergeLayout(saved, saved, [])).toEqual(saved);
  });

  it('drops nothing when every panel is away at once', () => {
    expect(mergeLayout([], saved, ['chart', 'heat', 'flow'])).toHaveLength(3);
  });
});

describe('migrateWorkspace', () => {
  const v1 = (): PulseWorkspaceState =>
    ({
      version: 1,
      activeId: PULSE_PRESETS[0].id,
      layouts: [
        {
          id: 'mine',
          name: 'My desk',
          panels: [{ id: 'p1', key: 'live-chart', ticker: 'SPY' }],
          layout: [{ i: 'p1', x: 0, y: 0, w: 6, h: 5 }],
        },
      ],
    }) as PulseWorkspaceState;

  it('upgrades a v1 desk instead of throwing it away', () => {
    // The whole point. `loadState` discards anything whose version does not
    // match, so without this a version bump deletes every layout the user built
    // and nothing anywhere goes red.
    const out = migrateWorkspace(v1());
    expect(out).not.toBeNull();
    expect(out!.version).toBe(WORKSPACE_VERSION);
    expect(out!.layouts).toHaveLength(1);
    expect(out!.layouts[0].name).toBe('My desk');
    expect(out!.layouts[0].panels[0].ticker).toBe('SPY');
  });

  it('treats every migrated panel as docked', () => {
    const out = migrateWorkspace(v1())!;
    expect(out.layouts[0].panels[0].detached).toBeUndefined();
    expect(out.layouts[0].panels[0].popout).toBeUndefined();
  });

  it('does not mutate the input', () => {
    const input = v1();
    migrateWorkspace(input);
    expect(input.version).toBe(1);
  });

  it('passes a current-version desk through unchanged', () => {
    const cur = { ...v1(), version: WORKSPACE_VERSION };
    expect(migrateWorkspace(cur)).toEqual(cur);
  });

  it('refuses a version from the future rather than guessing at it', () => {
    expect(migrateWorkspace({ ...v1(), version: 99 } as PulseWorkspaceState)).toBeNull();
  });

  it('refuses junk', () => {
    expect(migrateWorkspace(null as unknown as PulseWorkspaceState)).toBeNull();
    expect(migrateWorkspace({ version: 1, layouts: [] } as unknown as PulseWorkspaceState)).toBeNull();
    expect(migrateWorkspace({ version: 1 } as unknown as PulseWorkspaceState)).toBeNull();
  });

  it('carries a detached and a popped-out panel through a round trip', () => {
    const state = {
      ...v1(),
      version: WORKSPACE_VERSION,
      layouts: [
        {
          id: 'multi',
          name: 'Two monitors',
          panels: [
            { id: 'a', key: 'live-chart', detached: { x: 40, y: 60, w: 700, h: 500 } },
            { id: 'b', key: 'gex-heatmap', popout: { left: -1920, top: 0, width: 1200, height: 900 } },
          ],
          layout: [
            { i: 'a', x: 0, y: 0, w: 6, h: 5 },
            { i: 'b', x: 6, y: 0, w: 6, h: 5 },
          ],
        },
      ],
    } as PulseWorkspaceState;
    const out = migrateWorkspace(JSON.parse(JSON.stringify(state)))!;
    expect(out.layouts[0].panels[0].detached).toEqual({ x: 40, y: 60, w: 700, h: 500 });
    // The negative left survives serialisation — that is the second monitor.
    expect(out.layouts[0].panels[1].popout!.left).toBe(-1920);
  });
});
