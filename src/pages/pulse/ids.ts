import type { PulseLayout } from './presets';

/*
==================================================
  SLAYER TERMINAL - PULSE ID MINTING (pulse/ids.ts)
  New panels and new desks need names nothing else is using.

  Both used to come from one `useRef(1)` counter, which resets on every page
  load while the workspace it names does not. That is a collision generator, not
  an id generator: add an Order Flow panel, reload, add another, and both are
  `order-flow-2`. Two React children share a key, two grid cells share an `i`,
  and closing one removes whichever `find` reaches first. "Duplicate" was
  sharper still — it minted `ws-2-dup` from the same counter, so duplicating any
  desk in a fresh session produced that exact id every time.

  Read what is already taken instead of counting.
==================================================
*/

/**
 * The next free id for a widget on this desk.
 *
 * Preset ids (`c-chart`, `cmd-dp`) do not have the `key-N` shape, so they
 * neither raise the counter nor collide with it.
 */
export function nextPanelId(layout: PulseLayout, key: string): string {
  const prefix = `${key}-`;
  let max = 1;
  for (const p of layout.panels) {
    if (!p.id.startsWith(prefix)) continue;
    const n = Number(p.id.slice(prefix.length));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return `${prefix}${max + 1}`;
}

/** Layout ids are derived from the name, so they read in storage and in a bug report. */
export const slugify = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'layout';

/** A layout id nothing in the workspace is using. */
export function nextLayoutId(layouts: readonly PulseLayout[], base: string): string {
  const taken = new Set(layouts.map(l => l.id));
  if (!taken.has(base)) return base;
  // Bounded by construction: `taken` is finite, so some suffix is always free.
  for (let n = 2; ; n++) {
    const id = `${base}-${n}`;
    if (!taken.has(id)) return id;
  }
}
