/*
==================================================
  SLAYER TERMINAL - DESKS AS FILES (workspace/deskFile.ts)
  Part 1.1 · "Desk import/export."
==================================================

  WHAT A DESK FILE IS FOR. A desk is the one piece of this terminal a reader
  builds with their own hands — which panels, where, how big, pinned to
  what — and until now it lived in exactly one place: this browser's
  localStorage. A new laptop, a cleared profile, a colleague who wants the
  same arrangement: all three meant rebuilding it from memory. A file is
  the answer to all three, and it is also the honest answer to "what
  happens to my desks when accounts land" — they travel.

  ── THE FORMAT IS THE STORE'S OWN SHAPE, WRAPPED ─────────────────────────

  The file carries `SavedWorkspace` objects exactly as they sit in
  localStorage, inside an envelope that names the format and its version.
  No translation layer: a translation is a second schema that has to be
  kept in step with the first, and the moment they drift a file written
  today fails to open next month. The envelope exists so a file can be
  refused for the RIGHT reason — "this is not a desk file" rather than a
  stack trace from `.instances.map`.

  ── IMPORT RUNS THROUGH `sanitize`, ALWAYS ────────────────────────────────

  A file is untrusted input, whatever it says on the envelope: hand-edited,
  from an older build, from a build with widgets this one no longer has.
  `sanitize` is the same function every desk off disk already goes through
  — it drops unknown widgets, grounds bad coordinates, re-applies size
  bounds — so a file cannot put anything on the grid that localStorage
  could not. One gate, and imports do not get a weaker one.

  ── NAMES COLLIDE, AND THE FILE LOSES ────────────────────────────────────

  An imported desk named "Scalping" landing on a reader who already has a
  "Scalping" must not overwrite it: the reader's own work is the thing this
  feature exists to protect. The incoming desk is renamed with a suffix and
  the reader can sort it out with both in front of them. Preset names are
  refused outright — they are the templates you reset TO, and a file that
  claims one is either confused or hostile.
*/

import { PRESET_NAMES, isPreset, sanitize, type DeskStore, type SavedWorkspace } from './desks';

export const DESK_FILE_KIND = 'slayer-desk';
export const DESK_FILE_VERSION = 1;

export interface DeskFile {
  kind: typeof DESK_FILE_KIND;
  version: number;
  /** ISO timestamp — when the file was written, for the reader's own records. */
  exportedAt: string;
  desks: Record<string, SavedWorkspace>;
}

/** Longest name a desk may carry — the rail's input already caps here. */
export const NAME_MAX = 24;

/** The rules a desk name has to meet, in one place. Null when it passes. */
export function nameProblem(name: string): string | null {
  const n = name.trim();
  if (!n) return 'A desk needs a name.';
  if (n.length > NAME_MAX) return `Keep it under ${NAME_MAX} characters.`;
  if (isPreset(n)) return 'Preset names are reserved — they are the templates you reset to.';
  return null;
}

/**
 * A name that does not collide with anything in `taken`.
 *
 * "Scalping" → "Scalping 2" → "Scalping 3". A numeric suffix rather than
 * "(copy)" because the second duplicate of "(copy)" is "(copy) (copy)",
 * which nobody has ever wanted, and because a number survives the NAME_MAX
 * cap where a word does not.
 */
export function freeName(base: string, taken: Iterable<string>): string {
  const set = new Set(taken);
  const stem = base.trim().slice(0, NAME_MAX - 3).trim() || 'Desk';
  if (!set.has(stem) && !isPreset(stem) && stem === base.trim()) return stem;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${stem} ${i}`;
    if (!set.has(candidate) && !isPreset(candidate)) return candidate;
  }
  return `${stem} ${Date.now() % 10000}`;
}

/** Serialise one desk, or several, to the file format. */
export function packDesks(desks: Record<string, SavedWorkspace>, now: Date = new Date()): DeskFile {
  return {
    kind: DESK_FILE_KIND,
    version: DESK_FILE_VERSION,
    exportedAt: now.toISOString(),
    desks,
  };
}

/** The file's text — indented, because a reader may open it in an editor. */
export function deskFileText(desks: Record<string, SavedWorkspace>, now?: Date): string {
  return JSON.stringify(packDesks(desks, now), null, 2);
}

/** `slayer-desk-scalping-20260905.json` — the name says what and when. */
export function deskFilename(name: string | null, now: Date = new Date()): string {
  const slug = (name ?? 'all')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32);
  const d = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  return `slayer-desk-${slug || 'desk'}-${d}.json`;
}

export type ImportOutcome =
  | { ok: true; desks: Record<string, SavedWorkspace>; renamed: { from: string; to: string }[]; dropped: string[] }
  | { ok: false; reason: string };

/**
 * Read a file's text into desks this store can hold.
 *
 * REFUSES BEFORE IT REPAIRS. The envelope has to be right — right kind,
 * a version this build reads — before a single desk is looked at. Then
 * every desk goes through `sanitize`, collisions are renamed, preset names
 * are refused, and a desk that comes out of sanitize with no panels is
 * dropped by name so the reader knows it was in the file.
 */
export function unpackDesks(text: string, existing: Iterable<string>): ImportOutcome {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'That file is not JSON.' };
  }
  if (!parsed || typeof parsed !== 'object') return { ok: false, reason: 'That file is not a desk file.' };
  const file = parsed as Partial<DeskFile>;
  if (file.kind !== DESK_FILE_KIND) return { ok: false, reason: 'That file is not a desk file.' };
  if (typeof file.version !== 'number' || file.version > DESK_FILE_VERSION) {
    return { ok: false, reason: `That desk file is version ${String(file.version)}; this build reads up to ${DESK_FILE_VERSION}.` };
  }
  if (!file.desks || typeof file.desks !== 'object') return { ok: false, reason: 'That desk file has no desks in it.' };

  const taken = new Set<string>([...existing, ...PRESET_NAMES]);
  const desks: Record<string, SavedWorkspace> = {};
  const renamed: { from: string; to: string }[] = [];
  const dropped: string[] = [];

  for (const [rawName, raw] of Object.entries(file.desks)) {
    if (!raw || typeof raw !== 'object') {
      dropped.push(rawName);
      continue;
    }
    const clean = sanitize(raw as SavedWorkspace);
    if (clean.instances.length === 0) {
      dropped.push(rawName);
      continue;
    }
    const wanted = rawName.trim().slice(0, NAME_MAX) || 'Imported desk';
    const name = taken.has(wanted) || isPreset(wanted) ? freeName(wanted, taken) : wanted;
    if (name !== rawName) renamed.push({ from: rawName, to: name });
    taken.add(name);
    desks[name] = clean;
  }

  if (Object.keys(desks).length === 0) {
    return { ok: false, reason: dropped.length ? 'Every desk in that file was empty or unreadable.' : 'That desk file has no desks in it.' };
  }
  return { ok: true, desks, renamed, dropped };
}

/** Merge an import into a store — never touching what was already there. */
export function mergeImport(store: DeskStore, imported: Record<string, SavedWorkspace>): DeskStore {
  return { ...store, desks: { ...store.desks, ...imported } };
}
