/*
==================================================
  SLAYER TERMINAL - A SCREEN WORTH KEEPING
  (components/trace/savedScreens.ts)
==================================================

  6.2 asks for saved screens. A screen on this desk is a QUESTION — the
  preset, the side, the search, the hidden columns and the sort — and the
  reader who has built a good one should not have to rebuild it tomorrow.

  THE STORE IS DELIBERATELY DUMB. It holds an opaque `state` blob the page
  hands it and hands back unexamined, so adding a filter to any Trace page
  does not need a migration here. What this file owns is the part that is
  actually easy to get wrong: names, collisions, ordering, the cap, and
  surviving a corrupt or foreign value in localStorage without taking the
  page down with it.

  EVERY READ IS DEFENSIVE. localStorage is shared with every other tab, and
  with whatever the last version of this app wrote. A JSON.parse of a value
  written by a different schema throws, or worse, returns something shaped
  almost right — so each screen is validated field by field and anything
  that fails is dropped rather than repaired into a plausible lie.
*/

export interface SavedScreen<S = unknown> {
  id: string;
  name: string;
  /** Whatever the page needs to restore itself. Opaque here, on purpose. */
  state: S;
  /** ms since epoch — ordering, and "saved 3 days ago". */
  savedAt: number;
}

/** More than this and the picker stops being a picker. */
export const MAX_SAVED = 24;
export const MAX_NAME = 40;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function valid(v: unknown): v is SavedScreen {
  return (
    isRecord(v) &&
    typeof v.id === 'string' && v.id.length > 0 &&
    typeof v.name === 'string' && v.name.length > 0 &&
    typeof v.savedAt === 'number' && Number.isFinite(v.savedAt) &&
    'state' in v
  );
}

export function loadScreens<S>(storeKey: string): SavedScreen<S>[] {
  try {
    const raw = localStorage.getItem(storeKey);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Newest first, and only what survives validation.
    return (parsed.filter(valid) as SavedScreen<S>[]).sort((a, b) => b.savedAt - a.savedAt).slice(0, MAX_SAVED);
  } catch {
    /* A quota error, a private-mode throw, or a value from another schema.
       An unreadable store is an EMPTY store, never a crashed page — the
       reader loses their saved screens, which is bad, and keeps the desk,
       which is the trade. */
    return [];
  }
}

export function saveScreens<S>(storeKey: string, screens: readonly SavedScreen<S>[]): void {
  try {
    localStorage.setItem(storeKey, JSON.stringify(screens.slice(0, MAX_SAVED)));
  } catch {
    /* Over quota or blocked. Silent by design: the alternative is a modal
       about browser storage in front of somebody reading a tape. */
  }
}

/** Trim, bound, and refuse a name that is only whitespace. */
export function cleanName(raw: string): string | null {
  const n = raw.trim().replace(/\s+/g, ' ').slice(0, MAX_NAME);
  return n.length > 0 ? n : null;
}

/**
 * Add or REPLACE by name.
 *
 * Same name means the same question, so saving over it updates in place
 * rather than leaving the reader with two entries they cannot tell apart.
 * Names are compared case-insensitively for that reason — "Big calls" and
 * "big calls" are one screen to a person, and a picker holding both is a
 * picker they have to read twice.
 */
export function upsertScreen<S>(
  screens: readonly SavedScreen<S>[],
  name: string,
  state: S,
  now = Date.now()
): SavedScreen<S>[] {
  const clean = cleanName(name);
  if (!clean) return [...screens];
  const lower = clean.toLowerCase();
  const kept = screens.filter(s => s.name.toLowerCase() !== lower);
  const entry: SavedScreen<S> = {
    // Not Date.now() alone: two saves inside one millisecond would collide,
    // and the id is a React key.
    id: `scr-${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    name: clean,
    state,
    savedAt: now,
  };
  return [entry, ...kept].slice(0, MAX_SAVED);
}

export function removeScreen<S>(screens: readonly SavedScreen<S>[], id: string): SavedScreen<S>[] {
  return screens.filter(s => s.id !== id);
}

/** "just now" · "3h ago" · "5 Sep" — enough to tell two screens apart. */
export function savedAgo(at: number, now = Date.now()): string {
  const s = Math.max(0, (now - at) / 1000);
  if (s < 90) return 'just now';
  const m = s / 60;
  if (m < 90) return `${Math.round(m)}m ago`;
  const h = m / 60;
  if (h < 36) return `${Math.round(h)}h ago`;
  const d = new Date(at);
  return `${d.getDate()} ${d.toLocaleString('en-US', { month: 'short' })}`;
}
