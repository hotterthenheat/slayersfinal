import { useCallback, useSyncExternalStore } from 'react';

/*
==================================================
  SLAYER TERMINAL - CHART PREFERENCES
  (gex/chartPrefs.ts)

  The handful of chart-look settings every charting
  package keeps behind a gear.
==================================================

  WHY THESE ARE GLOBAL AND THE CANDLE THEME IS NOT.

  `themeKey` is per pane, deliberately — Noah, 2026-08-25: "if i change the
  theme for 1 chart it should NOT change for all the others" — because a
  colour is how a reader tells two panes apart at a glance. These are the
  opposite kind of thing. Nobody wants a grid on one pane and not the next,
  or a tight scale here and an airy one beside it; they are a person's taste
  in charts, set once. Making them per pane would mean setting each of four
  the same way every time, which is a chore dressed as a choice.

  A MODULE-LEVEL STORE, not a prop. The gear lives in the toolbar, which
  Terrain renders as the chart's SIBLING rather than its parent, so a prop
  would have to be threaded through Terrain, the toolbar's whole prop list,
  and the three other pages that mount one — for something none of them has
  an opinion about. Same shape as the alert store and for the same reason.

  EVERY SETTING HERE CHANGES SOMETHING. A gear full of switches that quietly
  do nothing is worse than no gear; each of these maps to a real option on
  the chart, and the one that looks decorative — the grid — is off by default
  for a stated reason (the nodes and the levels ARE this chart's structure,
  and a grid behind them competes with the ribbons), which is exactly why it
  is offered rather than imposed.
*/

/** Horizontal lines are the useful half — a price grid. Vertical ones sit
    under the session structure this chart already draws. */
export type GridMode = 'none' | 'horizontal' | 'both';
/** How much air the price axis leaves above and below the tape. */
export type ScaleAir = 'tight' | 'normal' | 'airy';

export interface ChartPrefs {
  grid: GridMode;
  /** A dashed crosshair reads as a measurement; a solid one as a cursor. */
  crosshairDashed: boolean;
  air: ScaleAir;
  /** Blank bars kept to the right of the last one, so it is not on the edge. */
  rightBars: number;
}

export const DEFAULT_PREFS: ChartPrefs = {
  grid: 'none',
  crosshairDashed: true,
  air: 'normal',
  rightBars: 6,
};

/** The margins each `air` setting means, as fractions of the pane. */
export const AIR_MARGINS: Record<ScaleAir, { top: number; bottom: number }> = {
  tight: { top: 0.06, bottom: 0.10 },
  normal: { top: 0.12, bottom: 0.16 },
  airy: { top: 0.22, bottom: 0.26 },
};

const KEY = 'slayer.chart.prefs.v1';

const clean = (raw: unknown): ChartPrefs => {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_PREFS;
  const c = raw as Record<string, unknown>;
  /* Healed field by field rather than trusted whole: a key written by an
     older version is a partial answer, not a reason to throw the rest away. */
  return {
    grid: c.grid === 'horizontal' || c.grid === 'both' ? c.grid : DEFAULT_PREFS.grid,
    crosshairDashed: typeof c.crosshairDashed === 'boolean' ? c.crosshairDashed : DEFAULT_PREFS.crosshairDashed,
    air: c.air === 'tight' || c.air === 'airy' ? c.air : DEFAULT_PREFS.air,
    rightBars:
      typeof c.rightBars === 'number' && Number.isFinite(c.rightBars) && c.rightBars >= 0 && c.rightBars <= 60
        ? Math.round(c.rightBars)
        : DEFAULT_PREFS.rightBars,
  };
};

let prefs: ChartPrefs = (() => {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? clean(JSON.parse(raw) as unknown) : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
})();

const subs = new Set<() => void>();

export function getChartPrefs(): ChartPrefs {
  return prefs;
}

export function setChartPrefs(next: Partial<ChartPrefs>): void {
  const merged = clean({ ...prefs, ...next });
  /* Identity is the subscription's currency — returning a new object for a
     no-op write would re-render every mounted pane on every menu open. */
  if (
    merged.grid === prefs.grid &&
    merged.crosshairDashed === prefs.crosshairDashed &&
    merged.air === prefs.air &&
    merged.rightBars === prefs.rightBars
  ) {
    return;
  }
  prefs = merged;
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* A private window is allowed to refuse storage; the setting still
       applies for this session rather than the click doing nothing. */
  }
  subs.forEach(fn => fn());
}

export function useChartPrefs(): ChartPrefs {
  const subscribe = useCallback((fn: () => void) => {
    subs.add(fn);
    return () => { subs.delete(fn); };
  }, []);
  return useSyncExternalStore(subscribe, getChartPrefs, () => DEFAULT_PREFS);
}
