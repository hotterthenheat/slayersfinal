/*
==================================================
  SLAYER TERMINAL - LABEL MATURITY (data/labelMaturity.ts)
  Part 3 · "Journal/label-maturity UI: a setup's label
  matures over time; show pending vs matured."
==================================================

  A verdict on the day a setup is tracked is a CLAIM. "ACTIVE" says the
  thesis will pay before the contract dies; "FADING" says it will not. The
  claim cannot be graded until the holding window closes — and until then
  the Tracker was showing the live verdict as if it were the record, which
  let a setup that said ACTIVE on Monday and WATCH on Wednesday read as
  though it had always said WATCH.

  So a tracked label has two states:

    pending   the window is still open; the claim can still come true or
              fail, and the live read beside it is today's weather, not
              the verdict on the claim
    matured   the window has closed — the label is graded against what
              happened, and the grade does not change again

  What closes the window is the tenor's clock. Date tenors (same-day,
  weekly, LEAPS) mature at expiry. A swing has no date — its clock is the
  floor — so it matures when the thesis resolves: a target banked, or the
  floor given way.

  A WATCH makes no claim, so a matured WATCH is graded as neither right
  nor wrong — the honest reading of a label that said "not yet".
*/

import { VERDICT_LABEL, type Setup, type SleeveKey, type Verdict } from '../types/compass';
import type { TrackedSetup } from '../types/tracker';

/*
  ── THE CLOCK LIVES WITH THE RULE (2026-09-06) ────────────────────────────

  `DTE_BY_SLEEVE`, `sleeveOf` and `expiresAt` were private to the Tracker
  page, which was fine while the Tracker was the only surface that graded a
  label. The Prove It scoreboard grades the same rows now, and a second copy
  of "when does this claim close" is the one way two boards could disagree
  about whether a call has matured — which is precisely the failure the
  scoreboard was rebuilt to stop making. One definition, imported twice.
*/

/** Days-to-expiry per SLEEVE — the tenor owns the clock (2026-08-04).
    Swings carry no calendar at all: they retire on a level break, never a date. */
export const DTE_BY_SLEEVE: Record<SleeveKey, number> = {
  odte: 0,
  weekly: 5,
  swing: Number.POSITIVE_INFINITY,
  leaps: 365,
};

/** Rows tracked before the sleeve axis carry no sleeve — treat as same-day. */
export const sleeveOf = (tracked: TrackedSetup): SleeveKey => tracked.sleeve ?? 'odte';

/** When a tracked claim's window closes, ms. Null for a swing, which has no date. */
export function expiresAt(tracked: TrackedSetup): number | null {
  const dte = DTE_BY_SLEEVE[sleeveOf(tracked)] ?? 0;
  if (!Number.isFinite(dte)) return null;
  const day = new Date(tracked.trackedAt);
  day.setHours(0, 0, 0, 0);
  return day.getTime() + (dte + 1) * 86_400_000;
}

/** Whether that window has already closed. */
export const isExpired = (tracked: TrackedSetup): boolean => {
  const at = expiresAt(tracked);
  return at !== null && Date.now() >= at;
};

export type Maturity = 'pending' | 'matured';
export type Resolution = 'paid' | 'broke' | 'flat';

export interface LabelRead {
  maturity: Maturity;
  said: Verdict;
  saidLabel: string;
  /** Only once matured. */
  resolution: Resolution | null;
  /** Once matured: did the claim hold up. Null for a WATCH, which made none. */
  heldUp: boolean | null;
  /** Short chip text. */
  chip: string;
  /** One line under the chip. */
  note: string;
}

const RESOLUTION_WORDS: Record<Resolution, string> = {
  paid: 'a target was banked',
  broke: 'the floor gave way',
  flat: 'it expired with neither a target nor the floor hit',
};

function resolutionOf(live: Setup): Resolution {
  if (live.takeProfits.some(tp => tp.status === 'HIT')) return 'paid';
  if (live.verdict === 'EXIT') return 'broke';
  return 'flat';
}

/**
 * Grade a tracked label.
 *
 * `said` is the verdict at tracking time, `live` the setup rebuilt at the
 * current price, `expired` whether the date clock has run out, and
 * `dateExpires` whether this tenor has a date clock at all (a swing does
 * not — it matures on resolution instead).
 */
export function labelRead(said: Verdict, live: Setup, expired: boolean, dateExpires: boolean): LabelRead {
  const saidLabel = VERDICT_LABEL[said];
  const res = resolutionOf(live);
  const matured = dateExpires ? expired : res !== 'flat';

  if (!matured) {
    return {
      maturity: 'pending',
      said,
      saidLabel,
      resolution: null,
      heldUp: null,
      chip: 'PENDING',
      note: dateExpires
        ? `Said ${saidLabel} when tracked — the window is still open, so this label can still be right or wrong. The state beside it is today's read, not the grade.`
        : `Said ${saidLabel} when tracked — a swing has no date clock, so this label matures when a target is banked or the floor gives way.`,
    };
  }

  const heldUp = said === 'WATCH' ? null : said === 'ENTER' ? res === 'paid' : res !== 'paid';
  const grade = heldUp === null ? 'made no claim to grade' : heldUp ? 'held up' : 'did not hold';
  return {
    maturity: 'matured',
    said,
    saidLabel,
    resolution: res,
    heldUp,
    chip: 'MATURED',
    note: `Said ${saidLabel} when tracked; ${RESOLUTION_WORDS[res]}. The label ${grade}.`,
  };
}
