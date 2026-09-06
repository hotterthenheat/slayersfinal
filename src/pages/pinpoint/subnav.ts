import { Activity, Columns2, Crosshair, Flame, Gauge, Grid3x3, History, Layers, type LucideIcon } from 'lucide-react';

/*
==================================================
  SLAYER TERMINAL - PINPOINT DESKS (pages/pinpoint/subnav.ts)
  Ten desks in five groups, and one of them is the engine.
==================================================

  ── THE RAIL BEFORE THIS ──────────────────────────────────────────────────

  Thirteen tabs named for engines — "Exposure Profile", "Vanna & Charm",
  "Greek Surfaces", "ΔOI Heat" — which nobody could pick from. That became
  nine tabs named for questions, which was the right correction and stopped
  one short: nine PEERS, in a flat row, with no answer to "where do I
  start?" and no reason the eye should land anywhere in particular.

  ── WHAT THE GROUPS SAY ───────────────────────────────────────────────────

  They are the reading order of the product, not tidying:

    CORE         the surface, and the three readings taken straight off it
    DYNAMICS     where it is going, and what it does if you push it
    POSITIONING  who is holding it, and how it compares
    HISTORY      how it got here
    MODEL        whether to believe any of it

  A reader works left to right and that is the intended session: see the
  structure, find the prices, rank them, watch what is changing them, then
  stress it, then check the model. Everything after CORE is a question
  asked of the surface — which is why Exposure is first and why it is not
  called "Overview".

  ── WHAT MOVED ────────────────────────────────────────────────────────────

  · EXPOSURE is new and is the section's first page. The strike × expiry
    grid that was the whole of HEAT is its main picture; the Greek is a
    control on it rather than a page of its own.
  · HEAT is gone into Exposure. It was the same matrix with a fixed metric.
  · VOL is gone into the global context strip. Volatility is a condition
    every desk here reads under, not a destination — a reader does not
    "go to vol", they need IV and the regime in front of them wherever
    they are.
  · PAIN is HOLDERS. The old name described a folk theory ("max pain")
    rather than the question the desk answers, which is where the people
    holding these contracts actually stand.
  FLOW and SCENARIOS belong in CORE and DYNAMICS respectively and are not
  built yet, so they are not in the rail. A tab that leads nowhere teaches
  a reader the navigation lies; an eight-desk rail that is honest about its
  size does not.

  Every old path still resolves — see App.tsx.
*/
export interface GexSubpage {
  path: string;
  label: string;
  subtitle: string;
  icon: LucideIcon;
  /** The rail draws a group label before the first item of each group. */
  group: DeskGroup;
}

export type DeskGroup = 'Core' | 'Dynamics' | 'Positioning' | 'History' | 'Model';

export const DESK_GROUPS: { key: DeskGroup; note: string }[] = [
  { key: 'Core', note: 'the surface, and what it says right now' },
  { key: 'Dynamics', note: 'where it is going, and what moves it' },
  { key: 'Positioning', note: 'who holds it, and how it compares' },
  { key: 'History', note: 'how it got here' },
  { key: 'Model', note: 'whether to believe it' },
];

export const GEX_SUBPAGES: GexSubpage[] = [
  {
    path: '/pinpoint/exposure',
    label: 'Exposure',
    subtitle: 'The whole surface — every exposure, by strike and by expiry. Every other desk here reads this book.',
    icon: Grid3x3,
    group: 'Core',
  },
  {
    path: '/pinpoint/levels',
    label: 'Levels',
    subtitle: 'Where the walls and the flip are — and which side of them you are on',
    icon: Crosshair,
    group: 'Core',
  },
  {
    path: '/pinpoint/targets',
    label: 'Targets',
    subtitle: 'Every strike ranked by how much it matters today, and why',
    icon: Activity,
    group: 'Core',
  },
  {
    path: '/pinpoint/drift',
    label: 'Drift',
    subtitle: 'Where the levels go as vol moves and time passes',
    icon: Gauge,
    group: 'Dynamics',
  },
  {
    path: '/pinpoint/holders',
    label: 'Holders',
    subtitle: 'Where the people holding these contracts stand, strike by strike',
    icon: Flame,
    group: 'Positioning',
  },
  {
    path: '/pinpoint/compare',
    label: 'Compare',
    subtitle: 'Two books on one axis — where their positioning diverges',
    icon: Columns2,
    group: 'Positioning',
  },
  {
    path: '/pinpoint/replay',
    label: 'Replay',
    subtitle: 'Any past session, scrubbed — how the levels migrated',
    icon: History,
    group: 'History',
  },
  {
    path: '/pinpoint/audit',
    label: 'Audit',
    subtitle: 'How wrong textbook GEX is right now — the check on everything else here',
    icon: Layers,
    group: 'Model',
  },
];
