/*
==================================================
  SLAYER TERMINAL - DESK PREFERENCES (data/prefs.ts)
  Part 15 · motion and number format.
==================================================

  THE SAME SHAPE AS distanceUnits.ts — a module-level store, persisted, with
  a `useSyncExternalStore` hook — because a second pattern for the same job
  is how two settings end up disagreeing about whether they survive a
  reload. Everything the desk lets a reader choose lives in a store like
  this one.

  ── MOTION, AND THE ONE DIRECTION IT MUST NOT OVERRIDE ───────────────────

  Six surfaces already ask the browser for `prefers-reduced-motion`, which
  is the OS-level answer. A preference here can move that answer in exactly
  ONE direction:

    A reader may ask for LESS motion than the OS reports. That is a
    preference, and honouring it costs nothing.

    A reader may NOT ask for MORE motion than the OS reports. Someone who
    has set reduced motion at the system level may have done so because
    animation makes them ill, and a site that lets a stray click override
    that is doing harm — the setting exists precisely because the person
    cannot always be relied on to be the one clicking. So 'full' means
    "follow the OS", never "ignore it".

  `motionAllowed()` is therefore an AND, not a pick, and the settings copy
  says which way it can move so nobody reads the toggle as symmetric.

  ── NUMBER FORMAT ────────────────────────────────────────────────────────

  Scope was chosen by looking at what the desk actually formats. `fmtUsd` is
  the single money formatter behind 52 files, and what varies usefully in it
  is MAGNITUDE, not locale: $1.2M reads faster in a dense column, and
  $1,240,000 is what a reader copying a figure into a note wants. Both are
  real needs and they are opposites.

  A locale switch — decimal commas, grouped digits — is deliberately NOT
  here. It would have to reach every `toFixed` on the desk to be true, and a
  setting that changes some numbers and not others is worse than none: the
  reader cannot tell which columns obeyed it.
*/

import { useSyncExternalStore } from 'react';

export type MotionPref = 'full' | 'reduced';
export type NumberFormat = 'compact' | 'full';

interface Prefs {
  motion: MotionPref;
  numbers: NumberFormat;
}

const STORAGE_KEY = 'slayer_prefs_v1';

const DEFAULTS: Prefs = { motion: 'full', numbers: 'compact' };

function load(): Prefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const p = JSON.parse(raw) as Partial<Prefs>;
    return {
      motion: p.motion === 'reduced' ? 'reduced' : 'full',
      numbers: p.numbers === 'full' ? 'full' : 'compact',
    };
  } catch {
    return DEFAULTS;
  }
}

let current: Prefs = load();
const listeners = new Set<() => void>();

export function getPrefs(): Prefs {
  return current;
}

export function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]): void {
  if (current[key] === value) return;
  current = { ...current, [key]: value };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    /* storage blocked — the session keeps its own copy */
  }
  listeners.forEach(fn => fn());
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(subscribe, getPrefs, getPrefs);
}

/** TEST-ONLY. Back to the defaults, without touching storage semantics. */
export function resetPrefs(): void {
  current = { ...DEFAULTS };
  listeners.forEach(fn => fn());
}

/**
 * Whether the OS has asked for reduced motion.
 *
 * False outside a browser so a proof or a server render does not throw, and
 * false rather than true because the desk's animations are the default and
 * a Node process has no reader to protect.
 */
export function osPrefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * The final answer every animated surface should ask.
 *
 * AND, not a pick — see the header. `osReduced` is a parameter so this is
 * testable without a browser and so a caller that has already measured the
 * media query does not measure it twice.
 */
export function motionAllowed(pref: MotionPref = current.motion, osReduced = osPrefersReducedMotion()): boolean {
  if (osReduced) return false;
  return pref === 'full';
}

/*
  THE MAGNITUDE FORMATTER, in both shapes, sharing one sign.

  U+2212 MINUS rather than a hyphen, matching `fmtUsd` — in the desk's
  tabular font a hyphen is narrower than a digit, so a column of negatives
  set with hyphens fails to line up with the positives above it. Two money
  formatters that disagree about the minus sign would be visible as a
  ragged column the moment the preference is flipped.
*/
export function formatMoney(v: number, format: NumberFormat = current.numbers): string {
  if (!Number.isFinite(v)) return '—';
  const sign = v < 0 ? '−' : '';
  const a = Math.abs(v);
  if (format === 'full') {
    /* Grouped to the dollar. A reader who chose `full` chose it to copy the
       figure somewhere, and a copied figure with a decimal on a nine-figure
       number is noise. */
    return `${sign}$${Math.round(a).toLocaleString('en-US')}`;
  }
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${sign}$${(a / 1e3).toFixed(1)}K`;
  return `${sign}$${a.toFixed(0)}`;
}

export const NUMBER_FORMAT_WORDS: Record<NumberFormat, { label: string; note: string; sample: string }> = {
  compact: {
    label: 'Compact',
    note: 'Magnitudes, so a dense column stays scannable. This is the desk default and what every exposure table was designed around.',
    sample: formatMoney(1_240_000_000, 'compact'),
  },
  full: {
    label: 'Full',
    note: 'Every digit, grouped. Slower to scan and the right choice when you are copying figures out of the desk into somewhere else.',
    sample: formatMoney(1_240_000_000, 'full'),
  },
};

export const MOTION_WORDS: Record<MotionPref, { label: string; note: string }> = {
  full: {
    label: 'Follow the system',
    note: 'Animations run unless your operating system has asked for reduced motion — in which case they stay off. This setting cannot turn them back on.',
  },
  reduced: {
    label: 'Reduce motion',
    note: 'Transitions, number rolls and the code rain stop, whatever the system says. Nothing on the desk needs motion to be read.',
  },
};
