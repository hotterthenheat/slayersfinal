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
*/

const KEY = 'slayer.pine.scripts.v1';
export const MAX_SCRIPTS = 12;
/* A script is user input arriving from localStorage, so it is bounded on
   read as well as on write. */
export const MAX_SOURCE_CHARS = 20_000;

export interface UserScript {
  id: string;
  name: string;
  source: string;
  /** Drawn on the tape, or saved and dormant. */
  enabled: boolean;
}

const valid = (v: unknown): v is UserScript => {
  if (!v || typeof v !== 'object') return false;
  const s = v as Partial<UserScript>;
  return typeof s.id === 'string' && s.id.length > 0
    && typeof s.name === 'string'
    && typeof s.source === 'string' && s.source.length <= MAX_SOURCE_CHARS
    && typeof s.enabled === 'boolean';
};

export function loadScripts(): UserScript[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(valid).slice(0, MAX_SCRIPTS);
  } catch {
    return [];
  }
}

export function saveScripts(list: readonly UserScript[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_SCRIPTS)));
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
