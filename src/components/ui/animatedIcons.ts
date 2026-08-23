import type { ComponentType, RefAttributes } from 'react';

/*
==================================================
  SLAYER TERMINAL - THE ANIMATED ICON PACK, LOADED LATE
  (ui/animatedIcons.ts)

  `@animateicons/react/lucide` is 834 KB of source and it
  CANNOT BE TREE-SHAKEN. Measured, not assumed: importing two
  named icons from it grew the main chunk from 1,046 KB to
  1,930 KB — +884 KB raw, +93 KB gzipped, for two glyphs.

  Why it cannot: the package declares `sideEffects: false`,
  which lets a bundler drop the module WHOLE, and we import
  from it. Within the module every icon is a top-level
  `var x = forwardRef(...)` — a function CALL at module scope
  — and the file carries ZERO pure-call annotations (the
  `#__PURE__` comment Rollup looks for), so
  Rollup cannot prove any of those calls is droppable. All
  1,025 survive however few are named.

  So the pack is a LAZY CHUNK, fetched once at idle and
  shared by every call site. First paint never waits on it;
  `AnimatedIcon` renders the plain lucide glyph until it
  lands and swaps in place. A reader on a slow connection
  gets a terminal that works and icons that are simply
  static, which is the correct failure.

  AND BECAUSE OF THAT, ICONS ARE ADDRESSED BY NAME. Naming
  them would normally be the wrong call — a string lookup
  makes every icon reachable and defeats tree-shaking — but
  there is no tree-shaking here to defeat, and the whole
  module is arriving either way. Given that, a name costs
  nothing and keeps the call sites to one word.
==================================================
*/

/**
 * The handle every icon in the pack forwards.
 *
 * THE ICONS ARE DRIVEN THROUGH THIS, not through the `isAnimated` prop. That
 * prop reads like "animate now" and is not: it defaults to `true` and gates
 * whether the icon is allowed to respond to its OWN hover at all. Passing
 * `isAnimated={false}` therefore switches the icon off rather than pausing it,
 * and passing `true` hands the trigger back to the glyph's 14px hit area. The
 * imperative handle is the package's documented answer for a parent-driven
 * trigger, and it is the only one that lets the whole button be the target.
 */
export interface AnimatedIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

/** The shape every icon in the pack presents. */
export type AnimatedIconComponent = ComponentType<
  {
    size?: number;
    className?: string;
  } & RefAttributes<AnimatedIconHandle>
>;

type Pack = Record<string, AnimatedIconComponent | undefined>;

/**
 * One in-flight promise for the whole app. Twenty call sites mounting at once
 * must not start twenty fetches, and a rejected load must not be retried on
 * every render — a pack that failed to arrive leaves static icons, which is a
 * fine terminal, and hammering the network for decoration is not.
 */
let pending: Promise<Pack> | null = null;

export function loadAnimatedIcons(): Promise<Pack> {
  pending ??= import('@animateicons/react/lucide')
    .then(m => m as unknown as Pack)
    .catch(() => ({}) as Pack);
  return pending;
}

/**
 * Warm the chunk when the browser is otherwise idle.
 *
 * `requestIdleCallback` is not in Safari before 17, so the fallback is a
 * timeout rather than nothing: on those browsers the pack arrives a beat later
 * instead of never.
 */
export function warmAnimatedIcons(): () => void {
  const ric = (globalThis as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
  if (ric) {
    const id = ric(() => void loadAnimatedIcons());
    const cic = (globalThis as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback;
    return () => cic?.(id);
  }
  const t = setTimeout(() => void loadAnimatedIcons(), 1200);
  return () => clearTimeout(t);
}
