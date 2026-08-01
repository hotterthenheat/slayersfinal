import type { Layout } from 'react-grid-layout';

/**
 * Pulse workspace schema. Versioned so future changes never corrupt a saved
 * layout, and stored under its OWN key so it can't clobber the /workspace page.
 * A panel carries an optional per-panel `ticker`; when unset it follows the
 * workspace's global ticker.
 */
export const WORKSPACE_VERSION = 1;
export const PULSE_STORAGE_KEY = 'slayer_pulse_workspace_v1';

export interface PulsePanel {
  id: string;
  key: string;
  /** Per-panel symbol override; falls back to the global ticker when absent */
  ticker?: string;
  minimized?: boolean;
  /** Height to restore to when un-minimized */
  restoreH?: number;
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

/** Helper to keep preset authoring terse. */
const L = (i: string, x: number, y: number, w: number, h: number, minW = 3, minH = 3): Layout => ({
  i,
  x,
  y,
  w,
  h,
  minW,
  minH,
});

/**
 * Starter layouts. "Slayer Classic" reproduces the old fixed Pulse (chart +
 * exposure heatmap + dealer positioning + order flow + dark pool) so nothing
 * regresses. Users can edit these; the originals stay restorable.
 *
 * Panels meant to share a band must sum to 12 across it. Less leaves a gutter
 * the grid cannot fill; more gets wrapped by react-grid-layout, which is how a
 * preset ends up stacking two panels it meant to pair. (Column compositions like
 * Flow Command are the exception — a tall panel spans several bands, so those
 * bands read short on their own.) The minW/minH arguments here are advisory:
 * PulseWorkspace re-reads them from the widget registry on load, so no preset
 * can ship a panel under the floor its own content needs.
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
      L('c-chart', 0, 0, 8, 6, 4, 4),
      L('c-heat', 8, 0, 4, 6, 3, 4),
      L('c-pos', 0, 6, 8, 5, 3, 4),
      L('c-flow', 8, 6, 4, 5, 3, 4),
      L('c-grad', 0, 11, 8, 6, 4, 4),
      L('c-prem', 8, 11, 4, 6, 3, 3),
      L('c-tape', 0, 17, 8, 6, 4, 4),
      L('c-alerts', 8, 17, 4, 6, 3, 3),
      L('c-dp', 0, 23, 12, 4, 4, 3),
      L('c-liq', 0, 27, 12, 8, 4, 5),
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
      L('cmd-dp', 0, 0, 3, 6, 3, 4),
      L('cmd-flow', 0, 6, 3, 5, 3, 4),
      // center column — liquidity chart (flagship, tall) over the live chart
      L('cmd-liq', 3, 0, 5, 9, 4, 5),
      L('cmd-chart', 3, 9, 5, 4, 4, 4),
      // right column — GEX heatmap grid, full height (matches the center stack)
      L('cmd-gex', 8, 0, 4, 13, 3, 4),
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
      L('sw-spy', 0, 0, 6, 7, 4, 4),
      L('sw-qqq', 6, 0, 6, 7, 4, 4),
      L('sw-setups', 0, 7, 12, 4, 3, 3),
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
      L('g-chart', 0, 0, 6, 6, 4, 4),
      L('g-exp', 6, 0, 6, 6, 6, 4),
      L('g-flow', 0, 6, 12, 4, 4, 4),
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
      L('gw-spy', 0, 0, 6, 7, 4, 4),
      L('gw-qqq', 6, 0, 6, 7, 4, 4),
      L('gw-aapl', 0, 7, 6, 7, 4, 4),
      L('gw-nvda', 6, 7, 6, 7, 4, 4),
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
      L('q-spy', 0, 0, 6, 5, 4, 4),
      L('q-qqq', 6, 0, 6, 5, 4, 4),
      L('q-nvda', 0, 5, 6, 5, 4, 4),
      L('q-aapl', 6, 5, 6, 5, 4, 4),
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
      L('d-chart', 0, 0, 7, 6, 4, 4),
      L('d-dp', 7, 0, 5, 6, 3, 4),
      L('d-flow', 0, 6, 12, 4, 4, 3),
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
      L('a-chart', 0, 0, 7, 8, 4, 4),
      L('a-moc', 7, 0, 5, 8, 4, 4),
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
      L('f-chart', 0, 0, 7, 6, 4, 4),
      L('f-frac', 7, 0, 5, 6, 4, 4),
      L('f-pos', 0, 6, 12, 4, 4, 4),
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
      L('sc-chart', 0, 0, 8, 7, 4, 4),
      L('sc-flow', 8, 0, 4, 7, 3, 4),
      L('sc-liq', 0, 7, 12, 7, 4, 5),
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
      L('sw-chart', 0, 0, 8, 6, 4, 4),
      L('sw-setups', 8, 0, 4, 6, 3, 4),
      L('sw-pos', 0, 6, 12, 5, 4, 4),
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
      L('mc-stocks', 0, 0, 6, 6, 4, 4),
      L('mc-news', 6, 0, 6, 6, 4, 4),
      L('mc-chart', 0, 6, 8, 5, 4, 4),
      L('mc-heat', 8, 6, 4, 5, 3, 4),
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
      L('ea-cal', 0, 0, 7, 7, 4, 4),
      L('ea-vol', 7, 0, 5, 3, 3, 3),
      L('ea-setups', 7, 3, 5, 4, 4, 4),
      L('ea-chart', 0, 7, 12, 5, 4, 4),
    ],
  },
  {
    id: 'minimal-chart',
    name: 'Minimal Chart',
    preset: true,
    panels: [{ id: 'm-chart', key: 'live-chart' }],
    layout: [L('m-chart', 0, 0, 12, 9, 6, 5)],
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
