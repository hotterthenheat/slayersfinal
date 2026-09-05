/*
==================================================
  SLAYER TERMINAL - FIRST RUN (data/firstRun.ts)
  Part 15 · "Onboarding / first-run tour."
==================================================

  WHAT THIS IS NOT, AND WHY.

  IT IS NOT A MODAL. A blocking overlay on the first visit to a trading
  terminal is the thing a reader closes before reading it, because their
  eye is already on the chart behind it and the overlay is in the way of
  the thing they came for.

  IT IS NOT A SPOTLIGHT TOUR. Dimming the desk and walking a reader through
  seven numbered stops teaches almost nothing: they spend the tour looking
  at the dimming and the highlight, then arrive at step seven having
  retained none of steps one to six, and the desk they finally get is one
  they have watched rather than used.

  IT IS A PANEL IN THE FLOW, at the top of the desk, that a reader can
  ignore at the cost of one scroll. That is the whole design, and it is the
  form that respects somebody who already knows what a gamma flip is.

  WHAT IT ANSWERS. Not "here are our features" — the nav says that. The one
  question a first visit actually has is WHICH OF THESE TABS DO I OPEN
  FIRST, and the answer is not obvious from twenty labels arranged by
  workflow. So the content is three concrete first moves and what the four
  workflow groups are for. Nothing else.

  DISMISSAL IS PERMANENT AND REVERSIBLE. A welcome panel that comes back is
  a bug; one that can never be seen again is a small loss for anyone who
  dismissed it in the first five seconds. So the flag persists and Settings
  can clear it.

  IT DOES NOT COUNT SESSIONS OR TRACK ANYTHING. One boolean. A "have they
  been here three times" heuristic is a behavioural model with no
  behavioural data behind it, and this desk has no account to hang one on.
*/

import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'slayer_first_run_seen';

function load(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    /* Storage blocked — show it. A reader who cannot be remembered is
       better served by seeing the panel again than by never seeing it. */
    return false;
  }
}

let seen = load();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(fn => fn());

export function firstRunSeen(): boolean {
  return seen;
}

export function dismissFirstRun(): void {
  if (seen) return;
  seen = true;
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    /* The session keeps its own copy; it returns on the next visit. */
  }
  emit();
}

/** Bring it back — the Settings escape hatch. */
export function resetFirstRun(): void {
  if (!seen) return;
  seen = false;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* non-fatal */
  }
  emit();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useFirstRunSeen(): boolean {
  return useSyncExternalStore(subscribe, firstRunSeen, firstRunSeen);
}

/*
  THE FOUR GROUPS, IN THE ORDER THE NAV PUTS THEM, because that order is an
  argument — discover, analyze, manage, review is the pipeline a trader
  actually runs — and a welcome panel that renamed or reordered them would
  be teaching a second, wrong map of the same product.
*/
export const WORKFLOW_GROUPS: { group: string; what: string }[] = [
  { group: 'Discover', what: 'Find what is worth looking at — graded setups, screened names, the flow tape.' },
  { group: 'Analyze', what: 'Work out what it means — the chart, the dealer map, the catalysts.' },
  { group: 'Manage', what: 'Keep hold of it — tracked setups, your own desk layouts, the community.' },
  { group: 'Review', what: 'Check the desk against reality — the model scoreboard and what it got wrong.' },
];

export interface FirstMove {
  label: string;
  path: string;
  why: string;
}

/*
  THREE MOVES, NOT SEVEN, AND EACH ONE ENDS SOMEWHERE USEFUL. The test each
  had to pass: a reader who does only this one thing and then closes the
  tab has still seen what the product is for.
*/
export const FIRST_MOVES: FirstMove[] = [
  {
    label: 'Open the dealer map',
    path: '/pinpoint/exposure-profile',
    why: 'Every strike, both sides, with the walls and the flip marked. This is the picture the rest of the desk argues about.',
  },
  {
    label: 'Watch the tape',
    path: '/trace/live-tape',
    why: 'Options prints as they land, with what each one is doing to the map beside it.',
  },
  {
    label: 'See what the desk got wrong',
    path: '/prove-it',
    why: 'Every engine against what actually happened, with the lock times. Read this before you trust anything else here.',
  },
];
