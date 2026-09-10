/*
==================================================
  SLAYER TERMINAL - USER SCRIPTS (data/pine/store.ts)
  The reader's own indicators, kept where their layouts are.
==================================================

  Same contract as every other Terrain store: localStorage, one key, a
  validator on read. A stored script is TEXT — it is compiled fresh every
  time it is drawn, so a script saved when the engine implemented less can
  start working when the engine implements more, and one saved against an
  older engine fails loudly rather than drawing something stale.

  ─────────────────────────────────────────────────────────────────────────
  THE SHIPPED SCRIPTS ARE NOT STORED, ONLY THEIR SWITCH IS.

  `library.ts` holds fifty indicators written in the same Pine. Their SOURCE
  comes from the code on every load; the only thing that survives in
  storage is whether the reader has one switched on, and any rename.

  Doing it the other way — copying them into localStorage on first run —
  freezes each reader on whatever version of the script existed the day they
  first opened the desk. A fix would never reach them, and the file in the
  repo would stop being the truth about what they are looking at.

  A reader who wants to CHANGE one duplicates it. The duplicate is an
  ordinary script of their own from that moment, with its own id, and this
  file never touches it again.
*/

import { LIBRARY, isLibraryId } from './library';

const KEY = 'slayer.pine.scripts.v1';
export const MAX_SCRIPTS = 12;
/*
  A script is user input arriving from localStorage, so it is bounded on
  read as well as on write.

  THE CEILING HAS TO CLEAR A REAL INDICATOR. It was 20,000 characters, and
  the levels-plus-MTF script this engine was built to run is 46,000 — so a
  reader pasting it got it CUT IN HALF on save, which then failed to parse
  and drew nothing, with the editor still reporting the full script as fine.
  A cap that silently mangles the input is worse than no cap. This one is
  above any indicator anyone writes by hand, twelve of them still fit inside
  a localStorage origin several times over, and the editor refuses a script
  over it rather than trimming it.
*/
export const MAX_SOURCE_CHARS = 120_000;

export interface UserScript {
  id: string;
  name: string;
  source: string;
  /** Drawn on the tape, or saved and dormant. */
  enabled: boolean;
  /** One of the shipped four — its source is read-only and comes from code. */
  builtin?: boolean;
}

const valid = (v: unknown): v is UserScript => {
  if (!v || typeof v !== 'object') return false;
  const s = v as Partial<UserScript>;
  return typeof s.id === 'string' && s.id.length > 0
    && typeof s.name === 'string'
    && typeof s.source === 'string' && s.source.length <= MAX_SOURCE_CHARS
    && typeof s.enabled === 'boolean';
};

/**
 * The shipped fifty, then the reader's own.
 *
 * A built-in's source is taken from `library.ts` every time; storage
 * contributes its on/off state and nothing else. A stored entry whose id is
 * a built-in's is therefore a SWITCH, not a script — anything else it
 * carries (a stale copy of the source from an older release) is discarded
 * here rather than drawn.
 */
export function loadScripts(): UserScript[] {
  let stored: UserScript[] = [];
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) stored = parsed.filter(valid);
    }
  } catch {
    stored = [];
  }

  const byId = new Map(stored.map(s => [s.id, s]));
  const builtins: UserScript[] = LIBRARY.map(p => ({
    id: p.id,
    name: byId.get(p.id)?.name ?? p.name,
    source: p.source,
    /* OFF until asked for. Fifty indicators drawing over a reader's chart
       the first time they open the desk is not a welcome, it is a mess. */
    enabled: byId.get(p.id)?.enabled ?? false,
    builtin: true,
  }));
  const mine = stored.filter(s => !isLibraryId(s.id)).slice(0, MAX_SCRIPTS);
  return [...builtins, ...mine];
}

export function saveScripts(list: readonly UserScript[]): void {
  try {
    /* A built-in is written back WITHOUT its source — see the header. Its
       row in storage is the switch and the name, so the code stays the one
       place the script itself is defined. */
    const out = list
      .filter(s => s.builtin || !isLibraryId(s.id))
      .map(s => (s.builtin ? { id: s.id, name: s.name, source: '', enabled: s.enabled, builtin: true } : s))
      .slice(0, MAX_SCRIPTS + LIBRARY.length);
    localStorage.setItem(KEY, JSON.stringify(out));
  } catch {
    /* Storage full or blocked — the scripts stay live for this session. */
  }
}

export const newScriptId = (): string => `pine_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

/** What a new script starts as — small, complete, and inside the subset. */
export const STARTER_SOURCE = `//@version=6
indicator("My EMA cross", overlay = true)

fast = input.int(9, "Fast")
slow = input.int(21, "Slow")

f = ta.ema(close, fast)
s = ta.ema(close, slow)

plot(f, "Fast", color = color.aqua)
plot(s, "Slow", color = color.orange)
plotshape(ta.crossover(f, s), "Cross up", shape.triangleup, location.belowbar, color.green)
plotshape(ta.crossunder(f, s), "Cross down", shape.triangledown, location.abovebar, color.red)
`;
