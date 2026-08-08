import { SCANNERS } from '../types/compass';

/*
==================================================
  SLAYER TERMINAL - COMPASS VIEW VOCABULARY (pages/compassViews.ts)
  The `?view=` values Compass accepts, in one place.

  Split out of Compass.tsx so a test can read them without importing the whole
  page. The reason it needs to is a defect that had already reached main:
  storyClock.test.ts is titled "points every Open desk target at a pane the desk
  reads", and what it actually checked was membership in a regex literal typed
  into the test file —

      /^view=(weigher|lotto|quick-scalp|rebounds|top-setups)$/

  — which is not the desk. Renaming the Compass mode `lotto` to `lottery` makes
  the trailer's Lotto button fall through `readView` to null and silently open
  the default Setups pane, and the full suite stayed green at 1140 passing.
  Two of the five values in that regex (`rebounds`, `top-setups`) were already
  used by no scene at all, so it had begun drifting in both directions.

  `readView` and the test now consult the same set, so they cannot disagree.
==================================================
*/

export type CompassMode = 'setups' | 'weigher' | 'lotto';

export const MODE_OPTIONS = [
  { value: 'setups', label: 'Setups' },
  { value: 'weigher', label: 'Weigher' },
  { value: 'lotto', label: 'Lotto' },
] as const;

export const COMPASS_MODES: ReadonlySet<string> = new Set(MODE_OPTIONS.map(o => o.value));
export const SCANNER_KEYS: ReadonlySet<string> = new Set(SCANNERS.map(s => s.key));

/** Every value `readView` resolves to a pane. Anything else is ignored. */
export const COMPASS_VIEW_KEYS: ReadonlySet<string> = new Set([
  ...COMPASS_MODES,
  ...SCANNER_KEYS,
]);
