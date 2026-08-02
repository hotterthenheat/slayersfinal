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
  mergeLayout,
  migrateWorkspace,
  place,
  popoutFeatures,
  resizeHeight,
  restore,
  stepMove,
  swapCells,
  screenIndexOf,
  tile,
} from './detach';
import { PULSE_PRESETS, WORKSPACE_VERSION, type PulseWorkspaceState } from './presets';

/** Boxes sharing a cell. Used by several suites, so it lives here once. */
const overlapCount = (l: { x: number; y: number; w: number; h: number }[]) => {
  let n = 0;
  for (let i = 0; i < l.length; i++)
    for (let j = i + 1; j < l.length; j++) {
      const a = l[i];
      const b = l[j];
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) n++;
    }
  return n;
};

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

  it('is wide enough for the controls the header keeps at its narrowest', () => {
    // NOT the full cluster. In Customize mode a panel carries eight controls
    // and eight do not fit at two columns on any desk — the header sheds the
    // secondary ones by measuring itself. What must always fit is the grip plus
    // maximize and close, so a panel can never be stranded at a size it cannot
    // be resized out of.
    const ESSENTIAL_PX = 22 + 2 * 26 + 28; // grip + 2 buttons + row padding
    expect(colPx(MIN_UNITS.w)).toBeGreaterThan(ESSENTIAL_PX);
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

describe('tile — shrink one panel, the others take the space', () => {
  it('transfers space when the WEST edge is dragged, not just the east', () => {
    // Reported by review and reproduced before fixing: with a=(0,6) and b=(6,6),
    // dragging b's west edge right makes RGL report b=(8,4). Packing b back
    // against a and then growing it returned it to (6,6) — the drag did
    // nothing. The held panel is no longer packed, so its dragged edge stays
    // anchored and the space goes to the neighbour.
    const out = tile(
      [
        { i: 'a', x: 0, y: 0, w: 6, h: 4 },
        { i: 'b', x: 8, y: 0, w: 4, h: 4 },
      ],
      { hold: ['b'] },
    );
    expect(out.find(g => g.i === 'b')).toMatchObject({ x: 8, w: 4 });
    expect(out.find(g => g.i === 'a')).toMatchObject({ x: 0, w: 8 });
    expect(deadSpace(out)).toBe(0);
  });

  it('never leaves an enclosed pocket, even when rectangles cannot close it', () => {
    // Four panels around an L-shaped void. Growth alone stopped at 5.6% dead
    // because no single panel can absorb the pocket and stay a rectangle.
    const out = tile(
      [
        { i: 'p1', x: 0, y: 0, w: 2, h: 4 },
        { i: 'p2', x: 0, y: 4, w: 4, h: 2 },
        { i: 'p3', x: 2, y: 0, w: 4, h: 2 },
        { i: 'p4', x: 4, y: 2, w: 2, h: 4 },
      ],
      { hold: ['p1'] },
    );
    expect(deadSpace(out)).toBe(0);
    expect(out).toHaveLength(4);
  });

  it('packs a minimized panel but never grows it', () => {
    // A minimized panel is a parked title bar. Growing it to a neighbour's
    // height gives a tall empty card whose body is still hidden, and whose
    // `minimized` flag then makes one click restore rather than minimize.
    const out = tile(
      [
        { i: 'big', x: 0, y: 0, w: 6, h: 12 },
        { i: 'min', x: 6, y: 0, w: 6, h: 2 },
      ],
      { hold: ['big'], noGrow: ['min'] },
    );
    expect(out.find(g => g.i === 'min')!.h).toBe(2);
  });

  it('hands the freed columns to the neighbour instead of springing back', () => {
    // The behaviour asked for, and the exact thing plain fillGaps gets wrong:
    // fillGaps would grow `a` straight back to 8 and the drag would look like
    // it did nothing.
    const shrunk = [
      { i: 'a', x: 0, y: 0, w: 4, h: 6 }, // was 8, user just dragged it to 4
      { i: 'b', x: 8, y: 0, w: 4, h: 6 },
    ];
    const out = tile(shrunk, { hold: ['a'] });
    expect(out.find(g => g.i === 'a')!.w).toBe(4); // held
    expect(out.find(g => g.i === 'b')!.x).toBe(4); // slid left to meet it
    expect(out.find(g => g.i === 'b')!.w).toBe(8); // absorbed the 4 columns
    expect(deadSpace(out)).toBe(0);
  });

  it('gives the space back when the panel that shrank has no neighbour', () => {
    // A panel alone in its row cannot both keep its width and leave no gap.
    // The invariant wins; the alternative is a visible hole nothing can reach.
    const out = tile([{ i: 'solo', x: 0, y: 0, w: 5, h: 4 }], ['solo']);
    expect(out[0].w).toBe(12);
    expect(deadSpace(out)).toBe(0);
  });

  it('splits the freed space across several neighbours', () => {
    const out = tile(
      [
        { i: 'a', x: 0, y: 0, w: 2, h: 4 },
        { i: 'b', x: 4, y: 0, w: 4, h: 4 },
        { i: 'c', x: 8, y: 0, w: 4, h: 4 },
      ],
      ['a'],
    );
    expect(out.find(g => g.i === 'a')!.w).toBe(2);
    expect(out.reduce((s, g) => s + g.w, 0)).toBe(12);
    expect(deadSpace(out)).toBe(0);
  });

  it('absorbs vertically too — a shorter panel lets the one below grow', () => {
    const out = tile(
      [
        { i: 'top', x: 0, y: 0, w: 12, h: 4 },
        { i: 'bottom', x: 0, y: 8, w: 12, h: 4 },
      ],
      ['top'],
    );
    expect(out.find(g => g.i === 'top')!.h).toBe(4);
    expect(deadSpace(out)).toBe(0);
  });

  it('never overlaps and never runs off the grid, for every preset', () => {
    for (const preset of PULSE_PRESETS) {
      for (const held of [[], [preset.layout[0].i]]) {
        const out = tile(preset.layout, held);
        for (let i = 0; i < out.length; i++) {
          for (let j = i + 1; j < out.length; j++) {
            const a = out[i];
            const b = out[j];
            const hit = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
            expect({ p: preset.id, a: a.i, b: b.i, hit }).toEqual({ p: preset.id, a: a.i, b: b.i, hit: false });
          }
        }
        for (const g of out) {
          expect(g.x).toBeGreaterThanOrEqual(0);
          expect(g.x + g.w).toBeLessThanOrEqual(GRID.cols);
        }
      }
    }
  });

  it('leaves zero dead space on every preset it ships', () => {
    for (const preset of PULSE_PRESETS) {
      expect({ id: preset.id, dead: deadSpace(tile(preset.layout)) }).toEqual({ id: preset.id, dead: 0 });
    }
  });

  it('is idempotent — tiling an already tiled desk changes nothing', () => {
    for (const preset of PULSE_PRESETS) {
      const once = tile(preset.layout);
      expect(tile(once)).toEqual(once);
    }
  });

  it('keeps every panel at or above the size floor', () => {
    for (const preset of PULSE_PRESETS) {
      for (const g of tile(preset.layout)) {
        expect(g.w).toBeGreaterThanOrEqual(MIN_UNITS.w);
        expect(g.h).toBeGreaterThanOrEqual(MIN_UNITS.h);
      }
    }
  });

  it('cleans up an overlapping input rather than trusting the dead-space metric', () => {
    // Docking a panel puts it back on a cell a neighbour has since absorbed, so
    // the input genuinely overlaps. `deadSpace` divides used cells by the
    // bounding box, so overlap DOUBLE-COUNTS and the metric read ~0 on a broken
    // desk — the fallback stayed asleep and the desk came back 8% empty.
    const out = tile([
      { i: 'a', x: 0, y: 0, w: 12, h: 6 },
      { i: 'returning', x: 0, y: 0, w: 8, h: 6 },
      { i: 'c', x: 0, y: 6, w: 6, h: 4 },
    ]);
    expect(overlapCount(out)).toBe(0);
    expect(deadSpace(out)).toBe(0);
    expect(out).toHaveLength(3);
  });

  it('repairs a layout that overflows the grid', () => {
    const out = tile([
      { i: 'a', x: 0, y: 0, w: 8, h: 4 },
      { i: 'b', x: 8, y: 0, w: 9, h: 4 }, // x+w = 17
    ]);
    for (const g of out) expect(g.x + g.w).toBeLessThanOrEqual(GRID.cols);
    expect(deadSpace(out)).toBe(0);
  });

  it('reports a settled size that differs from the requested one, so callers must read it back', () => {
    // The contract the keyboard announcement depends on. Shrinking a sole panel
    // to five columns cannot stick — there is no neighbour to take the space —
    // so `tile` grows it back to twelve. Anything that announces the REQUESTED
    // size tells a screen-reader user a number that never reaches the screen.
    const settled = tile([{ i: 'solo', x: 0, y: 0, w: 5, h: 4 }], { hold: ['solo'] });
    expect(settled.find(g => g.i === 'solo')!.w).toBe(12);
    expect(settled.find(g => g.i === 'solo')!.w).not.toBe(5);
  });

  it('repairs a row of one-unit panels saved by the previous shipped build', () => {
    // That build allowed a one-unit floor, so a saved row of (x=0,w=1) and
    // (x=1,w=11) is real user data. Clamping the first to two widens it
    // straight into the second — a clamp is not a repair on its own.
    const clamped = [
      { i: 'a', x: 0, y: 0, w: 2, h: 2 }, // was w:1, widened by the floor
      { i: 'b', x: 1, y: 0, w: 11, h: 2 },
    ];
    const out = tile(clamped);
    expect(overlapCount(out)).toBe(0);
    expect(deadSpace(out)).toBe(0);
    for (const g of out) {
      expect(g.w).toBeGreaterThanOrEqual(MIN_UNITS.w);
      expect(g.x + g.w).toBeLessThanOrEqual(GRID.cols);
    }
  });

  it('handles an empty desk', () => {
    expect(tile([])).toEqual([]);
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

/**
 * Every way a panel arrives on the desk, and every way one changes height.
 *
 * These went in after a browser sweep of the paths that mutate the layout
 * WITHOUT going through `tile`. All five were leaving the desk gapped: adding a
 * panel 14.7% empty, duplicating 8%, minimizing 9.8%, closing 10.3%, and one
 * press of Fit with a panel on a second monitor 16.7%. The numbers are measured,
 * not estimated — the probe read them out of localStorage after each click.
 */
describe('place', () => {
  const cell = (i: string, x: number, y: number, w: number, h: number) =>
    ({ i, x, y, w, h, minW: MIN_UNITS.w, minH: MIN_UNITS.h });

  it('honours a free cell exactly, so a detach/dock round trip is a no-op', () => {
    // The desk the review named: 6 + 6, detach the right one, dock it straight
    // back. It used to come home as two stacked full-width rows.
    const staying = [cell('a', 0, 0, 6, 12)];
    const back = cell('b', 6, 0, 6, 12);
    expect(place(staying, back)).toEqual(expect.arrayContaining([
      expect.objectContaining({ i: 'a', x: 0, y: 0, w: 6, h: 12 }),
      expect.objectContaining({ i: 'b', x: 6, y: 0, w: 6, h: 12 }),
    ]));
  });

  it('relocates when a neighbour has taken the saved cell', () => {
    // Same desk, but the panel that stayed grew into the space while it was
    // away. Dropping the returning panel on top would overlap.
    const staying = [cell('a', 0, 0, 12, 12)];
    const out = place(staying, cell('b', 6, 0, 6, 12));
    expect(overlapCount(out)).toBe(0);
    expect(deadSpace(out)).toBeCloseTo(0, 9);
    expect(out.find(g => g.i === 'b')!.y).toBeGreaterThan(0);
  });

  it('leaves no dead space when a panel arrives beside a short one', () => {
    const out = place([cell('a', 0, 0, 6, 4)], cell('new', 6, 0, 4, 4));
    expect(overlapCount(out)).toBe(0);
    expect(deadSpace(out)).toBeCloseTo(0, 9);
  });

  it('refuses a cell that runs off the right edge', () => {
    const out = place([cell('a', 0, 0, 6, 6)], cell('b', 8, 0, 8, 6));
    expect(out.every(g => g.x + g.w <= GRID.cols)).toBe(true);
    expect(overlapCount(out)).toBe(0);
  });

  it('is gapless for every arrival position on a three-panel desk', () => {
    const desk = [cell('a', 0, 0, 6, 6), cell('b', 6, 0, 6, 6), cell('c', 0, 6, 12, 6)];
    for (let x = 0; x <= 8; x++) {
      for (let y = 0; y <= 12; y += 2) {
        const out = place(desk, cell('new', x, y, 4, 4));
        expect(overlapCount(out)).toBe(0);
        expect(out.every(g => g.x + g.w <= GRID.cols)).toBe(true);
        expect(deadSpace(out)).toBeCloseTo(0, 9);
        expect(out).toHaveLength(4);
      }
    }
  });

  it('re-places rather than duplicates a panel already on the desk', () => {
    const desk = [cell('a', 0, 0, 6, 6), cell('b', 6, 0, 6, 6)];
    const out = place(desk, cell('b', 0, 6, 12, 6));
    expect(out.filter(g => g.i === 'b')).toHaveLength(1);
    expect(overlapCount(out)).toBe(0);
  });
});

describe('resizeHeight', () => {
  const cell = (i: string, x: number, y: number, w: number, h: number) =>
    ({ i, x, y, w, h, minW: MIN_UNITS.w, minH: MIN_UNITS.h });

  it('closes the band a collapsing panel gives up', () => {
    const desk = [cell('a', 0, 0, 12, 12), cell('b', 0, 12, 12, 12)];
    const out = resizeHeight(desk, 'a', 2, { noGrow: ['a'] });
    expect(out.find(g => g.i === 'a')!.h).toBe(2);
    expect(overlapCount(out)).toBe(0);
    expect(deadSpace(out)).toBeCloseTo(0, 9);
  });

  it('re-opens through nothing — the desk below moves down, it is not overrun', () => {
    // The bug: writing h back grew the panel straight through its neighbour,
    // and an overlapping layout sends `tile` to the band reflow, which rebuilds
    // the arrangement the user made.
    const collapsed = [cell('a', 0, 0, 12, 2), cell('b', 0, 2, 6, 12), cell('c', 6, 2, 6, 12)];
    const out = resizeHeight(collapsed, 'a', 12);
    expect(overlapCount(out)).toBe(0);
    expect(deadSpace(out)).toBeCloseTo(0, 9);
    expect(out.find(g => g.i === 'a')!.h).toBe(12);
    // b and c are still side by side underneath, not reflowed into bands.
    const b = out.find(g => g.i === 'b')!;
    const c = out.find(g => g.i === 'c')!;
    expect(b.y).toBe(c.y);
    expect(b.y).toBe(12);
  });

  it('survives a collapse/re-open round trip at every height', () => {
    for (let h = MIN_UNITS.h; h <= 16; h++) {
      const desk = [cell('a', 0, 0, 6, h), cell('b', 6, 0, 6, h), cell('c', 0, h, 12, 6)];
      const min = resizeHeight(desk, 'a', 2, { noGrow: ['a'] });
      expect(overlapCount(min)).toBe(0);
      expect(deadSpace(min)).toBeCloseTo(0, 9);
      const back = resizeHeight(min, 'a', h);
      expect(overlapCount(back)).toBe(0);
      expect(deadSpace(back)).toBeCloseTo(0, 9);
    }
  });

  it('leaves a layout alone when the id is not on it', () => {
    const desk = [cell('a', 0, 0, 12, 6)];
    expect(resizeHeight(desk, 'ghost', 12)).toEqual(desk);
  });
});

/**
 * Keyboard movement, and the difference between a panel arriving and a panel
 * coming home. Both went in after a browser reproduction: on a plain 6+6 desk
 * ArrowLeft on the right panel was a no-op three presses running and ArrowRight
 * on the left panel swapped both panels, while a detach/dock round trip on a
 * desk with a deliberate gap moved the returning panel from x=6,w=6 to x=4,w=8.
 */
describe('restore', () => {
  const cell = (i: string, x: number, y: number, w: number, h: number) =>
    ({ i, x, y, w, h, minW: MIN_UNITS.w, minH: MIN_UNITS.h });

  it('gives a gapped desk back exactly as it was', () => {
    const staying = [cell('a', 0, 0, 4, 12)];
    const back = cell('b', 6, 0, 6, 12);
    const out = restore(staying, back);
    expect(out.find(g => g.i === 'a')).toMatchObject({ x: 0, w: 4 });
    expect(out.find(g => g.i === 'b')).toMatchObject({ x: 6, w: 6 });
    // The hole the user left is still theirs. `place` would have packed it out.
    expect(deadSpace(out)).toBeGreaterThan(0);
  });

  it('still relocates when the cell was taken while the panel was away', () => {
    const out = restore([cell('a', 0, 0, 12, 12)], cell('b', 6, 0, 6, 12));
    expect(overlapCount(out)).toBe(0);
    expect(out.find(g => g.i === 'b')!.y).toBeGreaterThan(0);
  });

  it('refuses a cell that runs off the grid', () => {
    const out = restore([cell('a', 0, 0, 4, 6)], cell('b', 8, 0, 8, 6));
    expect(out.every(g => g.x + g.w <= GRID.cols)).toBe(true);
    expect(overlapCount(out)).toBe(0);
  });

  it('never duplicates a panel already on the desk', () => {
    const out = restore([cell('a', 0, 0, 6, 6), cell('b', 6, 0, 6, 6)], cell('b', 6, 0, 6, 6));
    expect(out.filter(g => g.i === 'b')).toHaveLength(1);
  });
});

describe('swapCells', () => {
  const cell = (i: string, x: number, y: number, w: number, h: number) =>
    ({ i, x, y, w, h, minW: MIN_UNITS.w, minH: MIN_UNITS.h });

  it('exchanges two boxes without overlapping, whatever their sizes', () => {
    const desk = [cell('a', 0, 0, 4, 12), cell('b', 4, 0, 8, 6), cell('c', 4, 6, 8, 6)];
    const out = swapCells(desk, 'a', 'c');
    expect(overlapCount(out)).toBe(0);
    expect(deadSpace(out)).toBeCloseTo(deadSpace(desk), 9);
    expect(out.find(g => g.i === 'a')).toMatchObject({ x: 4, y: 6, w: 8, h: 6 });
    expect(out.find(g => g.i === 'c')).toMatchObject({ x: 0, y: 0, w: 4, h: 12 });
  });

  it('leaves the layout alone when an id is missing', () => {
    const desk = [cell('a', 0, 0, 12, 6)];
    expect(swapCells(desk, 'a', 'ghost')).toEqual(desk);
  });
});

describe('stepMove', () => {
  const cell = (i: string, x: number, y: number, w: number, h: number) =>
    ({ i, x, y, w, h, minW: MIN_UNITS.w, minH: MIN_UNITS.h });
  const row = () => [cell('a', 0, 0, 6, 12), cell('b', 6, 0, 6, 12)];

  it('moves left into an occupied cell by exchanging places', () => {
    const { layout, swappedWith } = stepMove(row(), 'b', -1, 0);
    expect(swappedWith).toBe('a');
    expect(layout.find(g => g.i === 'b')).toMatchObject({ x: 0, w: 6 });
    expect(layout.find(g => g.i === 'a')).toMatchObject({ x: 6, w: 6 });
    expect(overlapCount(layout)).toBe(0);
    expect(deadSpace(layout)).toBeCloseTo(0, 9);
  });

  it('is its own inverse on a two-panel row', () => {
    const start = row();
    const once = stepMove(start, 'b', -1, 0).layout;
    const back = stepMove(once, 'b', 1, 0).layout;
    const key = (l: { i: string; x: number; y: number; w: number; h: number }[]) =>
      l.map(g => `${g.i}:${g.x},${g.y},${g.w},${g.h}`).sort().join('|');
    expect(key(back)).toBe(key(start));
  });

  it('does nothing at the west edge rather than pretending', () => {
    const start = row();
    const { layout, swappedWith } = stepMove(start, 'a', -1, 0);
    expect(swappedWith).toBeUndefined();
    expect(layout).toEqual(start);
  });

  it('swaps vertically too', () => {
    const stack = [cell('a', 0, 0, 12, 6), cell('b', 0, 6, 12, 6)];
    const { layout, swappedWith } = stepMove(stack, 'b', 0, -1);
    expect(swappedWith).toBe('a');
    expect(layout.find(g => g.i === 'b')!.y).toBe(0);
    expect(overlapCount(layout)).toBe(0);
  });

  it('slides into genuinely free space instead of swapping', () => {
    // A lone panel with the rest of the grid empty beside it.
    const { layout, swappedWith } = stepMove([cell('a', 0, 0, 4, 6)], 'a', 1, 0);
    expect(swappedWith).toBeUndefined();
    expect(overlapCount(layout)).toBe(0);
  });

  it('never overlaps or overflows, from every panel in every direction', () => {
    const desks = [
      row(),
      [cell('a', 0, 0, 4, 12), cell('b', 4, 0, 4, 12), cell('c', 8, 0, 4, 12)],
      [cell('a', 0, 0, 6, 6), cell('b', 6, 0, 6, 6), cell('c', 0, 6, 12, 6)],
      [cell('a', 0, 0, 3, 8), cell('b', 3, 0, 9, 4), cell('c', 3, 4, 9, 4), cell('d', 0, 8, 12, 4)],
    ];
    for (const desk of desks) {
      const before = deadSpace(desk);
      for (const g of desk) {
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const { layout } = stepMove(desk.map(c => ({ ...c })), g.i, dx, dy);
          expect(overlapCount(layout)).toBe(0);
          expect(layout.every(c => c.x >= 0 && c.x + c.w <= GRID.cols)).toBe(true);
          expect(layout).toHaveLength(desk.length);
          // A move must never introduce dead space that was not already there.
          expect(deadSpace(layout)).toBeLessThanOrEqual(before + 1e-9);
        }
      }
    }
  });

  it('leaves the desk alone for an unknown id or a zero step', () => {
    const start = row();
    expect(stepMove(start, 'ghost', -1, 0).layout).toEqual(start);
    expect(stepMove(start, 'a', 0, 0).layout).toEqual(start);
  });
});

describe('stepMove probes the whole edge, not a corner', () => {
  const cell = (i: string, x: number, y: number, w: number, h: number) =>
    ({ i, x, y, w, h, minW: MIN_UNITS.w, minH: MIN_UNITS.h });

  it('sees a neighbour touching the far end of a wide edge', () => {
    // The reported shape: the cell directly under a's left corner is empty, so
    // a 1x1 probe found nothing and slid straight into b.
    const desk = [cell('a', 0, 0, 6, 2), cell('b', 2, 2, 4, 2)];
    const { layout, swappedWith } = stepMove(desk, 'a', 0, 1);
    expect(swappedWith).toBe('b');
    expect(overlapCount(layout)).toBe(0);
    expect(layout.find(g => g.i === 'a')).toMatchObject({ x: 2, y: 2, w: 4, h: 2 });
  });

  it('picks the neighbour sharing the most of the pushed edge', () => {
    // Two panels line a's south edge; the wider one wins.
    const desk = [cell('a', 0, 0, 12, 2), cell('b', 0, 2, 3, 2), cell('c', 3, 2, 9, 2)];
    expect(stepMove(desk, 'a', 0, 1).swappedWith).toBe('c');
  });

  it('never overlaps or overflows on ragged desks, in any direction', () => {
    const desks = [
      [cell('a', 0, 0, 6, 2), cell('b', 2, 2, 4, 2), cell('c', 6, 0, 6, 4), cell('d', 0, 4, 12, 2)],
      [cell('a', 0, 0, 12, 2), cell('b', 0, 2, 3, 6), cell('c', 3, 2, 9, 3), cell('d', 3, 5, 9, 3)],
      [cell('a', 0, 0, 4, 4), cell('b', 4, 0, 4, 2), cell('c', 8, 0, 4, 4), cell('d', 4, 2, 4, 2)],
    ];
    for (const desk of desks) {
      const before = deadSpace(desk);
      for (const g of desk) {
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const { layout } = stepMove(desk.map(c => ({ ...c })), g.i, dx, dy);
          expect(overlapCount(layout)).toBe(0);
          expect(layout.every(c => c.x >= 0 && c.x + c.w <= GRID.cols)).toBe(true);
          expect(layout).toHaveLength(desk.length);
          expect(deadSpace(layout)).toBeLessThanOrEqual(before + 1e-9);
        }
      }
    }
  });

  it('refuses a move whose destination edge would leave the grid', () => {
    const desk = [cell('a', 8, 0, 4, 4)];
    expect(stepMove(desk, 'a', 1, 0).layout).toEqual(desk);
  });
});
