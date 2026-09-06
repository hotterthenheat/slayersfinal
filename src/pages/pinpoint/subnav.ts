import { Activity, Columns2, Crosshair, Flame, Grid3x3, History, Layers, Waves, Wind, type LucideIcon } from 'lucide-react';

/*
==================================================
  SLAYER TERMINAL - PINPOINT DESKS (pages/pinpoint/subnav.ts)
  Nine desks, each named for the question it answers.
==================================================

  The old rail had thirteen tabs named for engines — "Exposure Profile",
  "Vanna & Charm", "Greek Surfaces", "ΔOI Heat" — and Noah could not tell
  from the rail which one to open (2026-09-05: "some of the things i have
  i cant understand"). These are named for what a reader is trying to
  find out, and the pairs that answered one question on two tabs are one
  desk now:

    Levels    where the walls and the flip are, and which side you are on
    Targets   which strikes matter most today, ranked, and why
    Heat      how the book is laid out by expiry, and what changed today
    Drift     where the levels go as vol moves and time passes
    Pain      where today's buyers got in, and the spot that flips them
    Compare   two books on one axis — where their positioning diverges
    Replay    any past session, scrubbed — how the levels migrated
    Audit     how wrong textbook GEX is right now
    Vol       the surface, the term structure, the regime

  Every old path redirects to its new home (App.tsx), so a link saved
  last week still lands.
*/
export interface GexSubpage {
  path: string;
  label: string;
  subtitle: string;
  icon: LucideIcon;
}

export const GEX_SUBPAGES: GexSubpage[] = [
  { path: '/pinpoint/levels', label: 'Levels', subtitle: 'Where the walls and the flip are — and which side of them you are on', icon: Crosshair },
  { path: '/pinpoint/targets', label: 'Targets', subtitle: 'Every strike ranked by how much it matters today, and why', icon: Activity },
  { path: '/pinpoint/heat', label: 'Heat', subtitle: 'The book by expiry, and what was built or unwound through the session', icon: Grid3x3 },
  { path: '/pinpoint/drift', label: 'Drift', subtitle: 'Where the levels go as vol moves and time passes', icon: Waves },
  { path: '/pinpoint/pain', label: 'Pain', subtitle: 'Where today’s buyers got in, strike by strike — and the spot that flips them', icon: Flame },
  { path: '/pinpoint/compare', label: 'Compare', subtitle: 'Two books on one axis — where their positioning diverges', icon: Columns2 },
  { path: '/pinpoint/replay', label: 'Replay', subtitle: 'Any past session, scrubbed — how the levels migrated', icon: History },
  { path: '/pinpoint/audit', label: 'Audit', subtitle: 'How wrong textbook GEX is right now — the check on everything else here', icon: Layers },
  { path: '/pinpoint/vol', label: 'Vol', subtitle: 'The surface, the term structure, and the state of vol against realized', icon: Wind },
];
