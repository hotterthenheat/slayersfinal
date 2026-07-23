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
 * exposure heatmap + dealer positioning + key levels + order flow + dark pool)
 * so nothing regresses. Users can edit these; the originals stay restorable.
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
      { id: 'c-levels', key: 'key-levels' },
      { id: 'c-flow', key: 'order-flow' },
      { id: 'c-dp', key: 'dark-pool' },
      { id: 'c-liq', key: 'liquidity-map' },
    ],
    layout: [
      L('c-chart', 0, 0, 8, 6, 4, 4),
      L('c-heat', 8, 0, 4, 6, 3, 4),
      L('c-pos', 0, 6, 5, 5, 3, 4),
      L('c-levels', 5, 6, 3, 5, 3, 3),
      L('c-flow', 8, 6, 4, 5, 3, 4),
      L('c-dp', 0, 11, 12, 4, 4, 3),
      L('c-liq', 0, 15, 12, 4, 4, 3),
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
      { id: 'g-levels', key: 'key-levels' },
    ],
    layout: [
      L('g-chart', 0, 0, 8, 6, 4, 4),
      L('g-exp', 8, 0, 4, 6, 3, 4),
      L('g-flow', 0, 6, 8, 4, 4, 4),
      L('g-levels', 8, 6, 4, 4, 3, 3),
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
      { id: 'a-levels', key: 'key-levels' },
    ],
    layout: [
      L('a-chart', 0, 0, 7, 6, 4, 4),
      L('a-moc', 7, 0, 5, 6, 4, 4),
      L('a-levels', 0, 6, 12, 4, 4, 3),
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
      { id: 'sc-levels', key: 'key-levels' },
      { id: 'sc-liq', key: 'liquidity-map' },
    ],
    layout: [
      L('sc-chart', 0, 0, 8, 7, 4, 4),
      L('sc-flow', 8, 0, 4, 4, 3, 4),
      L('sc-levels', 8, 4, 4, 3, 3, 3),
      L('sc-liq', 0, 7, 12, 4, 4, 3),
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
      { id: 'sw-levels', key: 'key-levels' },
    ],
    layout: [
      L('sw-chart', 0, 0, 8, 6, 4, 4),
      L('sw-setups', 8, 0, 4, 6, 3, 4),
      L('sw-pos', 0, 6, 7, 5, 4, 4),
      L('sw-levels', 7, 6, 5, 5, 3, 3),
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
      L('ea-cal', 0, 0, 7, 6, 4, 4),
      L('ea-vol', 7, 0, 5, 3, 3, 3),
      L('ea-setups', 7, 3, 5, 3, 3, 3),
      L('ea-chart', 0, 6, 12, 5, 4, 4),
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
