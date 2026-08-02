import { describe, it, expect } from 'vitest';
import {
  GRID,
  MIN_DETACHED,
  MIN_UNITS,
  boundsFromGrid,
  boundsOnScreen,
  boxMoved,
  clampBounds,
  deadSpace,
  fillGaps,
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

describe('MIN_UNITS — small enough to pack, big enough to escape', () => {
  const PANEL_HEADER_PX = 40;
  const px = (units: number) => units * GRID.rowHeight + (units - 1) * GRID.marginY;
  /** Panel width at a given column span on the narrowest desktop the grid runs
      at (1024px breakpoint, minus the shell's own padding). */
  const colPx = (units: number, container = 976) => {
    const col = (container - GRID.marginX * (GRID.cols - 1)) / GRID.cols;
    return col * units + (units - 1) * GRID.marginX;
  };

  it('is tall enough that the panel header is never clipped', () => {
    // Measured in Chromium: at one row the 40px header is cropped and NONE of
    // the four controls can be clicked, so the panel cannot be resized back.
    // A floor that creates an unrecoverable state is worse than no floor.
    expect(px(MIN_UNITS.h)).toBeGreaterThanOrEqual(PANEL_HEADER_PX);
    expect(px(MIN_UNITS.h - 1)).toBeLessThan(PANEL_HEADER_PX);
  });

  it('is wide enough to hold the header’s control cluster', () => {
    // Four 24px icon buttons plus the row's own padding. At one column (116px
    // on a 1600 desk) the cluster overflows and 3 of 4 controls fall outside
    // the panel box.
    const CLUSTER_PX = 4 * 24 + 28;
    expect(colPx(MIN_UNITS.w)).toBeGreaterThan(CLUSTER_PX);
  });

  it('stays far below the per-widget floors it replaced', () => {
    // The point of the change: the old floors ran to 6 columns and 4 coarse
    // rows. If this ever creeps back up, the dead space comes back with it.
    expect(MIN_UNITS.w).toBeLessThanOrEqual(2);
    expect(MIN_UNITS.h).toBeLessThanOrEqual(2);
  });

  it('still lets a row be packed to exactly 12 columns', () => {
    // The whole complaint was rows that could not sum to 12. With a floor of 2
    // that holds for any row a preset would ever break (up to six panels).
    for (let n = 1; n <= Math.floor(GRID.cols / MIN_UNITS.w); n++) {
      expect(n * MIN_UNITS.w).toBeLessThanOrEqual(GRID.cols);
    }
  });
});

describe('fillGaps — the dead space goes away', () => {
  it('stretches a short row out to the full 12 columns', () => {
    // The exact complaint: a row of panels that cannot be made to sum to 12
    // leaves a strip of canvas on the right that nothing can reach.
    const filled = fillGaps([{ i: 'a', x: 0, y: 0, w: 5, h: 4 }]);
    expect(filled[0].w).toBe(12);
  });

  it('stops a panel at its neighbour rather than overlapping it', () => {
    const filled = fillGaps([
      { i: 'a', x: 0, y: 0, w: 3, h: 4 },
      { i: 'b', x: 8, y: 0, w: 4, h: 4 },
    ]);
    expect(filled.find(g => g.i === 'a')!.w).toBe(8); // grows 3 -> 8, meets b
    expect(filled.find(g => g.i === 'b')!.w).toBe(4); // already at the edge
  });

  it('grows a panel downward into empty rows below it', () => {
    const filled = fillGaps([
      { i: 'tall', x: 0, y: 0, w: 6, h: 10 },
      { i: 'short', x: 6, y: 0, w: 6, h: 4 },
    ]);
    // `short` had six columns of nothing under it for six rows.
    expect(filled.find(g => g.i === 'short')!.h).toBe(10);
  });

  it('leaves a desk that is already full completely alone', () => {
    const full = [
      { i: 'a', x: 0, y: 0, w: 6, h: 4 },
      { i: 'b', x: 6, y: 0, w: 6, h: 4 },
      { i: 'c', x: 0, y: 4, w: 12, h: 4 },
    ];
    expect(fillGaps(full)).toEqual(full);
  });

  it('never overlaps two panels, over every preset we ship', () => {
    // The property that matters more than any single case: growth may only
    // consume space that was empty, so no two boxes may ever intersect after.
    for (const preset of PULSE_PRESETS) {
      const filled = fillGaps(preset.layout);
      for (let i = 0; i < filled.length; i++) {
        for (let j = i + 1; j < filled.length; j++) {
          const a = filled[i];
          const b = filled[j];
          const hit = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
          expect({ preset: preset.id, a: a.i, b: b.i, hit }).toEqual({ preset: preset.id, a: a.i, b: b.i, hit: false });
        }
      }
      // And nothing may hang off the right edge of the grid.
      for (const g of filled) expect(g.x + g.w).toBeLessThanOrEqual(GRID.cols);
    }
  });

  it('never increases dead space on any preset, and removes it outright on most', () => {
    let improved = 0;
    for (const preset of PULSE_PRESETS) {
      const before = deadSpace(preset.layout);
      const after = deadSpace(fillGaps(preset.layout));
      expect(after).toBeLessThanOrEqual(before + 1e-9);
      if (after < before) improved++;
    }
    expect(improved).toBeGreaterThan(0);
  });

  it('handles an empty desk without dividing by zero', () => {
    expect(fillGaps([])).toEqual([]);
    expect(deadSpace([])).toBe(0);
  });
});

describe('deadSpace', () => {
  it('is zero for a perfectly packed desk', () => {
    expect(deadSpace([{ i: 'a', x: 0, y: 0, w: 12, h: 4 }])).toBe(0);
  });

  it('reports the fraction of the bounding box that is empty', () => {
    // One 6-wide panel in a 12-wide, 4-row box: half of it is nothing.
    expect(deadSpace([{ i: 'a', x: 0, y: 0, w: 6, h: 4 }])).toBeCloseTo(0.5, 6);
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

  it('upgrades a v2 desk to the finer row unit without moving a single pixel', () => {
    // The load-bearing claim of the v3 migration. The row unit went 64 -> 26
    // and every y/h doubled; if those two numbers do not cancel exactly, every
    // saved desk silently changes shape on next open. 6 rows at 64 is
    // 6*64+5*12 = 444, and 12 rows at 26 is 12*26+11*12 = 444.
    const OLD = { rowHeight: 64, margin: 12 };
    const px = (h: number, rowHeight: number) => h * rowHeight + (h - 1) * OLD.margin;
    const top = (y: number, rowHeight: number) => (rowHeight + OLD.margin) * y;

    const v2 = {
      ...v1(),
      version: 2,
      layouts: [
        {
          id: 'd',
          name: 'Desk',
          panels: [{ id: 'p1', key: 'live-chart' }],
          layout: [{ i: 'p1', x: 0, y: 6, w: 8, h: 6, minW: 4, minH: 4 }],
        },
      ],
    } as PulseWorkspaceState;

    const out = migrateWorkspace(v2)!;
    const g = out.layouts[0].layout[0];
    expect(out.version).toBe(3);
    expect(g.h).toBe(12);
    expect(g.y).toBe(12);
    expect(px(g.h, GRID.rowHeight)).toBe(px(6, OLD.rowHeight));
    expect(top(g.y, GRID.rowHeight)).toBe(top(6, OLD.rowHeight));
  });

  it('holds the pixel identity for every height a preset actually ships', () => {
    const OLD_ROW = 64;
    const M = 12;
    for (let h = 1; h <= 16; h++) {
      expect(2 * h * GRID.rowHeight + (2 * h - 1) * M).toBe(h * OLD_ROW + (h - 1) * M);
    }
  });

  it('frees the resize floor on every migrated panel', () => {
    // The actual complaint: panels could only be resized to their "true size".
    const v2 = {
      ...v1(),
      version: 2,
      layouts: [
        {
          id: 'd',
          name: 'Desk',
          panels: [{ id: 'p1', key: 'exposure-matrix' }],
          layout: [{ i: 'p1', x: 0, y: 0, w: 6, h: 6, minW: 6, minH: 4 }],
        },
      ],
    } as PulseWorkspaceState;
    const g = migrateWorkspace(v2)!.layouts[0].layout[0];
    // Two units, not the widget's own 6x4. The floor that survives is the one
    // that keeps a panel's controls reachable, measured — not a per-widget
    // opinion about how small its content may get.
    expect(g.minW).toBe(MIN_UNITS.w);
    expect(g.minH).toBe(MIN_UNITS.h);
    expect(g.minW).toBeLessThan(6);
  });

  it('carries a v1 desk all the way to the current version in one call', () => {
    // The migration chain must not stop at v2, or a user who has not opened the
    // app since the pop-out release loses everything on this release instead.
    const out = migrateWorkspace(v1())!;
    expect(out.version).toBe(WORKSPACE_VERSION);
    expect(out.layouts[0].panels[0].ticker).toBe('SPY');
    expect(out.layouts[0].layout[0].h).toBe(10); // 5 doubled
    expect(out.layouts[0].layout[0].minW).toBe(MIN_UNITS.w);
  });

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
