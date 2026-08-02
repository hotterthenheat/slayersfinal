import type { Layout } from 'react-grid-layout';

/**
 * Pulse workspace schema. Versioned so future changes never corrupt a saved
 * layout, and stored under its OWN key so it can't clobber the /workspace page.
 * A panel carries an optional per-panel `ticker`; when unset it follows the
 * workspace's global ticker.
 */
export const WORKSPACE_VERSION = 3;
/**
 * The storage key is frozen at `_v1` on purpose, and the schema version rides
 * INSIDE the payload. Renaming this key does not migrate a saved desk, it
 * orphans it — the old value stays in localStorage forever and the user simply
 * finds their layouts gone, with nothing logged and no test red. Version the
 * contents, migrate them in detach.ts, and leave the key alone.
 */
export const PULSE_STORAGE_KEY = 'slayer_pulse_workspace_v1';

/** A free-floating panel's box, in CSS pixels relative to the desk surface. */
export interface PixelBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * A window box in VIRTUAL DESKTOP coordinates, which is the space the Window
 * Management API reports and the space window.open expects. `left` is negative
 * for a monitor sitting to the left of the primary — that is not an error to
 * normalise away, it is how a second monitor is addressed.
 */
export interface ScreenBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PulsePanel {
  id: string;
  key: string;
  /** Per-panel symbol override; falls back to the global ticker when absent */
  ticker?: string;
  minimized?: boolean;
  /** Height to restore to when un-minimized */
  restoreH?: number;
  /**
   * Floating inside the workspace, above the grid, at these pixels. Absent
   * means docked. The panel keeps its entry in `layout` while detached so
   * re-docking returns it to the cell it left rather than the bottom row.
   */
  detached?: PixelBounds;
  /**
   * Open in its own OS window at this box. Saved with the layout, so restoring
   * a layout reopens the window on the monitor it was on. Absent means it is
   * not popped out.
   */
  popout?: ScreenBox;
}

export interface PulseLayout {
  id: string;
  name: string;
  /** True for the built-in starter layouts — restorable, never truly deleted */
  preset?: boolean;
  panels: PulsePanel[];
  layout: Layout[];
}

export interface PulseWorkspaceState {
  version: number;
  layouts: PulseLayout[];
  activeId: string;
}

/**
 * Helper to keep preset authoring terse.
 *
 * Presets are still written in the ORIGINAL coarse row unit — `h: 6` reads as
 * six chart-height rows, the way every comment below assumes — and this doubles
 * `y` and `h` on the way out, because the grid's row is half as tall as it was.
 * Authoring in the fine unit would have meant rewriting fifteen hand-tuned
 * tables and re-deriving every "these must sum to 12" note in the process.
 *
 * The trailing minW/minH arguments are gone. They were a resize FLOOR, and a
 * floor is exactly why a row could not be shrunk to fit its neighbours: the
 * user dragged and the panel refused, leaving a strip of canvas nothing could
 * reach. Size is the user's now. What a widget wants to be born at still comes
 * from the registry.
 */
const L = (i: string, x: number, y: number, w: number, h: number): Layout => ({
  i,
  x,
  y: y * 2,
  w,
  h: h * 2,
  minW: 1,
  minH: 1,
});

/**
 * Starter layouts. "Slayer Classic" reproduces the old fixed Pulse (chart +
 * exposure heatmap + dealer positioning + order flow + dark pool) so nothing
 * regresses. Users can edit these; the originals stay restorable.
 *
 * Panels meant to share a band must sum to 12 across it. Less leaves a gutter,
 * more gets wrapped by react-grid-layout, which is how a preset ends up
 * stacking two panels it meant to pair. (Column compositions like Flow Command
 * are the exception — a tall panel spans several bands, so those bands read
 * short on their own.)
 *
 * A gutter is only a preset's problem now. The desk no longer enforces a size
 * floor, so a user can drag any of these to any width and close the gap
 * themselves, or press Fill and have every panel stretch into whatever space is
 * left. Presets should still sum to 12 — landing on a tidy desk is the point of
 * shipping them — but a preset that does not is no longer unfixable.
 */
export const PULSE_PRESETS: PulseLayout[] = [
  {
    id: 'slayer-classic',
    name: 'Slayer Classic',
    preset: true,
    panels: [
      { id: 'c-chart', key: 'live-chart' },
      { id: 'c-heat', key: 'gex-heatmap' },
      { id: 'c-pos', key: 'positioning-map' },
      { id: 'c-flow', key: 'order-flow' },
      { id: 'c-grad', key: 'gradient-chart' },
      { id: 'c-prem', key: 'net-premium' },
      { id: 'c-tape', key: 'flow-tape' },
      { id: 'c-alerts', key: 'flow-alerts' },
      { id: 'c-dp', key: 'dark-pool' },
      { id: 'c-liq', key: 'liquidity-map' },
    ],
    layout: [
      L('c-chart', 0, 0, 8, 6),
      L('c-heat', 8, 0, 4, 6),
      L('c-pos', 0, 6, 8, 5),
      L('c-flow', 8, 6, 4, 5),
      L('c-grad', 0, 11, 8, 6),
      L('c-prem', 8, 11, 4, 6),
      L('c-tape', 0, 17, 8, 6),
      L('c-alerts', 8, 17, 4, 6),
      L('c-dp', 0, 23, 12, 4),
      L('c-liq', 0, 27, 12, 8),
    ],
  },
  {
    // Three-column command deck: institutional flow feed on the left, the
    // liquidity chart + price in the center, the GEX grid + levels on the right —
    // the whole desk on one screen, dealer-flow-terminal style.
    id: 'flow-command',
    name: 'Flow Command',
    preset: true,
    panels: [
      { id: 'cmd-dp', key: 'dark-pool' },
      { id: 'cmd-flow', key: 'order-flow' },
      { id: 'cmd-liq', key: 'liquidity-map' },
      { id: 'cmd-chart', key: 'live-chart' },
      { id: 'cmd-gex', key: 'gex-heatmap' },
    ],
    layout: [
      // left column — flow / dark-pool feed
      L('cmd-dp', 0, 0, 3, 6),
      L('cmd-flow', 0, 6, 3, 5),
      // center column — liquidity chart (flagship, tall) over the live chart
      L('cmd-liq', 3, 0, 5, 9),
      L('cmd-chart', 3, 9, 5, 4),
      // right column — GEX heatmap grid, full height (matches the center stack)
      L('cmd-gex', 8, 0, 4, 13),
    ],
  },
  {
    // Dual daily swing desk — price-estimation targets side by side, the way you
    // scan the majors for the next swing. Setups + levels underneath.
    id: 'swing-desk',
    name: 'Swing Desk',
    preset: true,
    panels: [
      { id: 'sw-spy', key: 'swing-map', ticker: 'SPY' },
      { id: 'sw-qqq', key: 'swing-map', ticker: 'QQQ' },
      { id: 'sw-setups', key: 'top-setups' },
    ],
    layout: [
      L('sw-spy', 0, 0, 6, 7),
      L('sw-qqq', 6, 0, 6, 7),
      L('sw-setups', 0, 7, 12, 4),
    ],
  },
  {
    id: 'gex-orderflow',
    name: 'GEX + Order Flow',
    preset: true,
    panels: [
      { id: 'g-chart', key: 'live-chart' },
      { id: 'g-exp', key: 'exposure-matrix' },
      { id: 'g-flow', key: 'order-flow' },
    ],
    layout: [
      // 6 + 6, not 8 + 4: the Exposure Matrix is a ten-column table and was
      // shipped here at w=4, under its own registry minimum, so the pairing this
      // preset exists to show read as a scroll box next to a chart.
      L('g-chart', 0, 0, 6, 6),
      L('g-exp', 6, 0, 6, 6),
      L('g-flow', 0, 6, 12, 4),
    ],
  },
  {
    // Heat only. No candles, no tape, no levels rail: four books' worth of
    // strike × expiry gamma next to each other, which is the read you want when
    // the question is "where is the whole market pinned", not "what is SPY
    // doing". One panel per symbol the simulator actually carries.
    //
    // 2 x 2 at w=6 rather than 4 across at w=3: the matrix is a six-column table
    // with a colour rail behind a 460px floor, and a w=3 panel is 355px on a
    // 1536 desk, so a four-across wall would be four horizontally scrolling
    // boxes. w=6 is 723px and every column is readable without scrolling.
    id: 'gex-wall',
    name: 'GEX Wall',
    preset: true,
    panels: [
      { id: 'gw-spy', key: 'gex-heatmap', ticker: 'SPY' },
      { id: 'gw-qqq', key: 'gex-heatmap', ticker: 'QQQ' },
      { id: 'gw-aapl', key: 'gex-heatmap', ticker: 'AAPL' },
      { id: 'gw-nvda', key: 'gex-heatmap', ticker: 'NVDA' },
    ],
    layout: [
      L('gw-spy', 0, 0, 6, 7),
      L('gw-qqq', 6, 0, 6, 7),
      L('gw-aapl', 0, 7, 6, 7),
      L('gw-nvda', 6, 7, 6, 7),
    ],
  },
  {
    id: 'four-chart-grid',
    name: 'Four-Chart Index Grid',
    preset: true,
    panels: [
      { id: 'q-spy', key: 'live-chart', ticker: 'SPY' },
      { id: 'q-qqq', key: 'live-chart', ticker: 'QQQ' },
      { id: 'q-nvda', key: 'live-chart', ticker: 'NVDA' },
      { id: 'q-aapl', key: 'live-chart', ticker: 'AAPL' },
    ],
    layout: [
      L('q-spy', 0, 0, 6, 5),
      L('q-qqq', 6, 0, 6, 5),
      L('q-nvda', 0, 5, 6, 5),
      L('q-aapl', 6, 5, 6, 5),
    ],
  },
  {
    id: 'dark-pool-flow',
    name: 'Dark Pool + Flow',
    preset: true,
    panels: [
      { id: 'd-chart', key: 'live-chart' },
      { id: 'd-dp', key: 'dark-pool' },
      { id: 'd-flow', key: 'order-flow' },
    ],
    layout: [
      L('d-chart', 0, 0, 7, 6),
      L('d-dp', 7, 0, 5, 6),
      L('d-flow', 0, 6, 12, 4),
    ],
  },
  {
    id: 'closing-auction',
    name: 'Closing Auction',
    preset: true,
    panels: [
      { id: 'a-chart', key: 'live-chart' },
      { id: 'a-moc', key: 'moc-read' },
    ],
    layout: [
      L('a-chart', 0, 0, 7, 8),
      L('a-moc', 7, 0, 5, 8),
    ],
  },
  {
    id: 'fracture-watch',
    name: 'Fracture Watch',
    preset: true,
    panels: [
      { id: 'f-chart', key: 'live-chart' },
      { id: 'f-frac', key: 'fracture-snapshot' },
      { id: 'f-pos', key: 'positioning-map' },
    ],
    layout: [
      L('f-chart', 0, 0, 7, 6),
      L('f-frac', 7, 0, 5, 6),
      L('f-pos', 0, 6, 12, 4),
    ],
  },
  // ── Workflow desks — one tap reshapes the terminal around how you're trading
  //    right now. Composed from real panels; switching them animates.
  {
    id: 'desk-scalper',
    name: 'Scalper',
    preset: true,
    panels: [
      { id: 'sc-chart', key: 'live-chart' },
      { id: 'sc-flow', key: 'order-flow' },
      { id: 'sc-liq', key: 'liquidity-map' },
    ],
    layout: [
      L('sc-chart', 0, 0, 8, 7),
      L('sc-flow', 8, 0, 4, 7),
      L('sc-liq', 0, 7, 12, 7),
    ],
  },
  {
    id: 'desk-swing',
    name: 'Swing',
    preset: true,
    panels: [
      { id: 'sw-chart', key: 'live-chart' },
      { id: 'sw-setups', key: 'top-setups' },
      { id: 'sw-pos', key: 'positioning-map' },
    ],
    layout: [
      L('sw-chart', 0, 0, 8, 6),
      L('sw-setups', 8, 0, 4, 6),
      L('sw-pos', 0, 6, 12, 5),
    ],
  },
  {
    id: 'desk-macro',
    name: 'Macro',
    preset: true,
    panels: [
      { id: 'mc-stocks', key: 'stocks-board' },
      { id: 'mc-news', key: 'news-wire' },
      { id: 'mc-chart', key: 'live-chart' },
      { id: 'mc-heat', key: 'gex-heatmap' },
    ],
    layout: [
      L('mc-stocks', 0, 0, 6, 6),
      L('mc-news', 6, 0, 6, 6),
      L('mc-chart', 0, 6, 8, 5),
      L('mc-heat', 8, 6, 4, 5),
    ],
  },
  {
    id: 'desk-earnings',
    name: 'Earnings',
    preset: true,
    panels: [
      { id: 'ea-cal', key: 'earnings-calendar' },
      { id: 'ea-vol', key: 'vol-state' },
      { id: 'ea-setups', key: 'top-setups' },
      { id: 'ea-chart', key: 'live-chart' },
    ],
    layout: [
      // Right column is 3 + 4 tall (Top Setups is a six-column board and will
      // not read at h=3), so the calendar beside it matches at 7.
      L('ea-cal', 0, 0, 7, 7),
      L('ea-vol', 7, 0, 5, 3),
      L('ea-setups', 7, 3, 5, 4),
      L('ea-chart', 0, 7, 12, 5),
    ],
  },
  {
    id: 'minimal-chart',
    name: 'Minimal Chart',
    preset: true,
    panels: [{ id: 'm-chart', key: 'live-chart' }],
    layout: [L('m-chart', 0, 0, 12, 9)],
  },
];

/** Deep-clone a preset so edits don't mutate the shared template. */
export function clonePreset(p: PulseLayout): PulseLayout {
  return {
    ...p,
    panels: p.panels.map(x => ({ ...x })),
    layout: p.layout.map(x => ({ ...x })),
  };
}
