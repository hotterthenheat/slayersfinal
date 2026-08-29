import type { Setup } from '../../types/compass';
import type { TrackLevel } from './trackModel';

/*
==================================================
  SLAYER TERMINAL - CAMPAIGN NODE REASONS (nodeReasons.ts)

  The sentence under each rung of the node rail.
==================================================

  WHY THIS IS A MODULE AND NOT A CLOSURE IN THE COMPONENT.

  It was a closure, and it shipped a sentence that was wrong on half the
  board: the stop's line said "Below 129.75 the contract is worth about
  $1.04" about a PUT, whose own card two panels away read "Breaks ABOVE
  129.93". A call dies when the underlying falls through its level and a put
  when it rises through one; a hardcoded word cannot be right about both.

  Nothing about that was visible to the type checker, and nothing about it
  would have been visible to a screenshot of a call. It is exactly the shape
  of thing a proof catches and a render does not, so it lives where a proof
  can reach it — `scripts/compass-nodes-proof.ts`.

  THE RULE THESE FOLLOW: a reason states what has to HAPPEN, in the reader's
  own units, and never restates the number printed beside it. "TP2 $2.39" is
  already on the row; what the row cannot say is that NVDA has to reach
  127.10 to pay it.

  AND IT NEVER GUESSES. `spotForPremium` brackets ±60% of spot and returns
  null rather than extrapolating, so an unreachable rung says so in words
  instead of printing a number nothing produced.
*/

/** How far the bracket in `spotForPremium` reaches, quoted in the copy so a
    reader knows what "no price" is a statement about. Keep in step with it. */
const BRACKET_PCT = 60;

export interface ReasonContext {
  setup: Setup;
  /** The underlying's price now — what every distance is measured from. */
  spotNow: number;
  /** Campaign retired: the rungs are history and stop being instructions. */
  retired: boolean;
}

/** The line printed under one rung of the node rail. */
export function levelReason(level: TrackLevel, ctx: ReasonContext): string {
  const { setup, spotNow, retired } = ctx;

  if (level.status === 'REF') {
    return 'Opened here. Every rung on this rail is measured from this premium.';
  }

  if (level.status === 'STOP') {
    /* Read the side off the PRICE, not off the right. Same answer, and it
       cannot disagree with the number printed beside it. */
    const side = setup.invalidationPrice < spotNow ? 'Below' : 'Above';
    const why = setup.invalidationReason.trim();
    /* The reason is a fragment written for a table cell ("Dark-pool
       distribution level"), so it needs its own full stop before a second
       sentence is put after it. */
    const dot = /[.!?]$/.test(why) ? '' : '.';
    return `${why}${dot} ${side} ${setup.invalidationPrice.toFixed(2)} the contract is worth about $${level.premium.toFixed(2)}.`;
  }

  if (level.status === 'HIT') {
    return `Banked — the premium traded through $${level.premium.toFixed(2)} (high water $${setup.highWater.toFixed(2)}).`;
  }

  if (retired) {
    return 'The campaign is retired; this rung is history, not a target.';
  }

  if (level.spotNeeded == null) {
    return `No ${setup.ticker} price inside ±${BRACKET_PCT}% prices this contract there with the life it has left.`;
  }

  const away = spotNow > 0 ? (level.spotNeeded / spotNow - 1) * 100 : 0;
  const lead = level.status === 'IN PROGRESS' ? 'Working now — ' : '';
  return `${lead}${setup.ticker} has to reach ${level.spotNeeded.toFixed(2)}, ${Math.abs(away).toFixed(1)}% ${
    away >= 0 ? 'above' : 'below'
  } ${spotNow.toFixed(2)}.`;
}

/**
 * The rail's nodes, highest premium first.
 *
 * THE ORDER IS THE CHART'S ORDER. The rail sits beside a price axis, so a
 * reader's eye moves between the two in the same direction: the top node is
 * the top line. Sorting by rung number instead would put TP3 above TP1 on
 * the chart and below it in the rail, which is how two views of one plan
 * end up contradicting each other.
 */
export function buildNodes(levels: TrackLevel[], ctx: ReasonContext): { level: TrackLevel; reason: string }[] {
  return [...levels]
    .sort((a, b) => b.premium - a.premium)
    .map(level => ({ level, reason: levelReason(level, ctx) }));
}
