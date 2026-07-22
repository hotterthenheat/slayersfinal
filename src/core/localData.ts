/*
==================================================
  SLAYER TERMINAL - LOCAL DATA REGISTRY
  Every browser-stored preference the app writes, in
  one place, so the settings panel can list and clear
  them without hunting through the codebase. All keys
  share the `slayer` prefix.
==================================================
*/

export interface LocalDataGroup {
  id: string;
  label: string;
  description: string;
  /** localStorage keys this group owns */
  keys: string[];
}

export const LOCAL_DATA_GROUPS: LocalDataGroup[] = [
  {
    id: 'watchlists',
    label: 'Watchlists',
    description: 'Stocks and Earnings symbols you follow',
    keys: ['slayer.stocks.watchlist', 'slayer.earnings.watchlist'],
  },
  {
    id: 'tables',
    label: 'Table layouts',
    description: 'Scanner & Live-Tape columns and saved views',
    keys: [
      'slayer.flowscanner.cols.v1',
      'slayer.flowscanner.templates.v1',
      'slayer.livetape.cols.v1',
      'slayer.livetape.views.v1',
    ],
  },
  {
    id: 'workspace',
    label: 'Pulse workspace',
    description: 'Your custom Pulse panel layout',
    keys: ['slayer_pulse_workspace_v1'],
  },
  {
    id: 'tracker',
    label: 'Tracker & journal',
    description: 'Tracked setups, closed trades and journal notes',
    keys: ['slayer_tracked_setups', 'slayer_tracker_journal'],
  },
  {
    id: 'community',
    label: 'Community drafts',
    description: 'Ideas, requests and feedback you posted locally',
    keys: ['slayer_community_v1'],
  },
];

/** Count how many of a group's keys currently hold data. */
export function groupStoredCount(group: LocalDataGroup): number {
  let n = 0;
  for (const k of group.keys) {
    try {
      if (localStorage.getItem(k) != null) n++;
    } catch {
      /* storage unavailable */
    }
  }
  return n;
}

/** Remove every key a group owns. Returns how many were actually cleared. */
export function clearGroup(group: LocalDataGroup): number {
  let n = 0;
  for (const k of group.keys) {
    try {
      if (localStorage.getItem(k) != null) {
        localStorage.removeItem(k);
        n++;
      }
    } catch {
      /* storage unavailable */
    }
  }
  return n;
}

/** Remove every `slayer`-prefixed key — a hard reset that also catches any
    future keys the registry hasn't been updated for. Returns the count. */
export function clearAllLocalData(): number {
  let removed = 0;
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.toLowerCase().startsWith('slayer')) keys.push(k);
    }
    for (const k of keys) {
      localStorage.removeItem(k);
      removed++;
    }
  } catch {
    /* storage unavailable */
  }
  return removed;
}
