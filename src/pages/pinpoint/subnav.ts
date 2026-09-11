import { Activity, Columns2, Crosshair, Flame, Gauge, Grid3x3, History, Layers, Waves, type LucideIcon } from 'lucide-react';

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

  · BOARD is the section's first page, and it is the section's ANSWER: a
    strike ladder with the price drawn through it, a change readout across
    every window at once, and a card that says why a strike matters. It
    replaces Exposure, whose strike x expiry grid was a decay multiplier on
    one 0DTE number wearing four column headings.
  · MATRIX is gone as a destination and lives here. It was the same book in
    a different shape, one navigation away from the page asking about it.
  · HEAT went into Exposure before this, and into Board with it.
  · VOL is gone into the global context strip. Volatility is a condition
    every desk here reads under, not a destination — a reader does not
    "go to vol", they need IV and the regime in front of them wherever
    they are.
  · PAIN is HOLDERS. The old name described a folk theory ("max pain")
    rather than the question the desk answers, which is where the people
    holding these contracts actually stand.
  · FLOW is new. Trace already answers "what traded"; this answers the
    narrower question that only makes sense beside a surface — which of
    today's prints moved the book, and by how much — so it is ordered by
    exposure impact rather than by the clock.

  SCENARIOS belongs in DYNAMICS and is not built yet, so it is not in the
  rail. A tab that leads nowhere teaches a reader the navigation lies.

  Every old path still resolves — see App.tsx.
*/
export interface GexSubpage {
  path: string;
  label: string;
  subtitle: string;
  icon: LucideIcon;
  /** The rail draws a group label before the first item of each group. */
  group: DeskGroup;
  /**
   * ══ A DESK THAT CARRIES ITS OWN SYMBOLS ═══════════════════════════════
   *
   * Nine of these read ONE book, so the section states which book once, on
   * a strip above them: ticker, spot, regime, ATM IV. That is the right
   * economy for nine desks and it is a falsehood on the tenth.
   *
   * The Board is one to five independent panels, each with its own symbol
   * and its own expiry. A single-symbol conditions row above it can only be
   * right about one panel, and the reader has no way to tell which — so the
   * desk states its conditions PER PANEL, in the head of each, and the
   * section's row stands down rather than printing an answer to a question
   * the page is not asking.
   */
  ownSymbols?: true;
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
    path: '/pinpoint/board',
    label: 'Board',
    subtitle: 'Where the positioning is, what is changing across every window, and why a strike matters — one surface.',
    icon: Grid3x3,
    group: 'Core',
    ownSymbols: true,
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
    path: '/pinpoint/flow',
    label: 'Flow',
    subtitle: 'What is changing the surface right now — every print joined to the strike it moved',
    icon: Waves,
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
