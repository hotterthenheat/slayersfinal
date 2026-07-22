export interface ShortcutRow {
  keys: string[];
  label: string;
}

export interface ShortcutGroup {
  title: string;
  rows: ShortcutRow[];
}

/** Single source of truth for keyboard shortcuts — used by the `?` overlay and the Guide. */
export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'Global',
    rows: [
      { keys: ['⌘', 'K'], label: 'Open the command palette' },
      { keys: ['['], label: 'Previous ticker in the watchlist' },
      { keys: [']'], label: 'Next ticker in the watchlist' },
      { keys: ['?'], label: 'Show the shortcuts sheet' },
      { keys: ['Esc'], label: 'Close palette, drawer or overlay' },
    ],
  },
  {
    title: 'Command palette',
    rows: [
      { keys: ['↑', '↓'], label: 'Move between results' },
      { keys: ['↵'], label: 'Run the highlighted command' },
      { keys: ['Type'], label: 'Filter pages, tickers and actions' },
    ],
  },
  {
    title: 'Tables & drawers',
    rows: [
      { keys: ['Click'], label: 'Open a row’s contract drilldown' },
      { keys: ['Esc'], label: 'Close the drilldown drawer' },
    ],
  },
];
