import { SCANNERS, type ScannerKey } from '../types/compass';

/*
==================================================
  SLAYER TERMINAL - THE SCOREBOARD (data/scoreboard.ts)
  Part 10.4 — every engine against what actually happened.
==================================================

  ── WHAT THIS REPLACED ────────────────────────────────────────────────────

  The Prove It page carried five engine rows with hit rates of 68%, 64%,
  71%, 61% and 66% and samples of 412, 286, 530, 348 and 124, under the
  heading "every engine tracked against what actually happened".

  None of it was tracked against anything. The rates were
  `Math.round(base + hRange(seed, -3, 3))` around a hand-picked base and the
  trends were a random walk — the same failure as a quality bar drawn from a
  seed, on the one tab in the product that advertises rigour, which makes it
  the worst place in the app for it to have been.

  The lock-window arithmetic around it was real and careful and is kept: a
  hit rate means nothing unless the calls were fixed before the outcomes
  were known, and that discipline is the reason this module exists rather
  than a reason to keep the numbers it was decorating.

  ── WHAT A REAL CLAIM LOOKS LIKE HERE ─────────────────────────────────────

  The desk already records one, and only one: a tracked setup. It carries
  `verdictAtTrack` — the claim — and `trackedAt` — when it was made — and
  `labelMaturity` grades it once its window has closed and not before. That
  is a locked prediction in the full sense: recorded before the outcome,
  graded after it, never re-labelled.

  So the scoreboard is those, grouped by the scanner that found them. It is
  the READER'S ledger rather than ours, which is the honest form: we cannot
  show a stranger a record of our own calls we have not kept.

  ── THREE OUTCOMES, AND ONLY TWO IN THE DENOMINATOR ───────────────────────

  A matured claim held up, did not hold, or made no claim to grade — a WATCH
  says "not yet" and is right about nothing either way. Counting a WATCH as
  a miss would punish the desk for its own caution and counting it as a hit
  would reward it for saying nothing, so it sits outside the ratio and is
  printed beside it. A lens with no graded claims has a NULL hit rate, not a
  zero: zero is a real score and this is the absence of one.
*/

/** One matured or pending claim, flattened out of whatever recorded it. */
export interface Claim {
  /** The lens that made the call. */
  lens: ScannerKey;
  /** When the claim was recorded, ms. */
  at: number;
  /** null while pending. Once matured: true held up, false did not, and
      null-with-`matured` means it made no claim to grade. */
  matured: boolean;
  heldUp: boolean | null;
}

export interface ScoreRow {
  lens: ScannerKey;
  label: string;
  /** Null when nothing under this lens has been graded — not zero. */
  hitRatePct: number | null;
  held: number;
  missed: number;
  /** Matured claims that graded neither way — a WATCH said "not yet". */
  noClaim: number;
  /** Claims still inside their window. */
  pending: number;
  /** held + missed — the denominator, and the only honest sample. */
  sample: number;
}

export interface Scoreboard {
  rows: ScoreRow[];
  /** The oldest and newest graded claim, ISO. Null when nothing is graded. */
  lockedFrom: string | null;
  lockedTo: string | null;
  /** Totals across every lens. */
  graded: number;
  pending: number;
  noClaim: number;
}

const iso = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/**
 * The ledger, grouped by lens.
 *
 * Pure: it reaches for no store and no clock. The caller flattens whatever
 * it has into `Claim[]`, which is what makes this testable against a ledger
 * whose answer is known in advance — and a scoreboard nobody can check is
 * the thing this file exists to stop shipping.
 */
export function buildScoreboard(claims: readonly Claim[]): Scoreboard {
  const byLens = new Map<ScannerKey, Claim[]>();
  for (const c of claims) byLens.set(c.lens, [...(byLens.get(c.lens) ?? []), c]);

  const rows: ScoreRow[] = [];
  let graded = 0;
  let pending = 0;
  let noClaim = 0;
  let lo = Infinity;
  let hi = -Infinity;

  for (const [lens, cs] of byLens) {
    const held = cs.filter(c => c.matured && c.heldUp === true).length;
    const missed = cs.filter(c => c.matured && c.heldUp === false).length;
    const none = cs.filter(c => c.matured && c.heldUp === null).length;
    const pend = cs.filter(c => !c.matured).length;
    const sample = held + missed;
    for (const c of cs) {
      if (!c.matured || c.heldUp === null) continue;
      if (c.at < lo) lo = c.at;
      if (c.at > hi) hi = c.at;
    }
    graded += sample;
    pending += pend;
    noClaim += none;
    rows.push({
      lens,
      label: SCANNERS.find(x => x.key === lens)?.label ?? lens,
      hitRatePct: sample === 0 ? null : Math.round((held / sample) * 100),
      held,
      missed,
      noClaim: none,
      pending: pend,
      sample,
    });
  }

  /* Graded lenses first and the best-supported of those first, because a
     70% over three claims and a 70% over ninety are not the same statement
     and the reader should meet the second one first. */
  rows.sort((a, b) => b.sample - a.sample || a.label.localeCompare(b.label));

  return {
    rows,
    lockedFrom: Number.isFinite(lo) ? iso(lo) : null,
    lockedTo: Number.isFinite(hi) ? iso(hi) : null,
    graded,
    pending,
    noClaim,
  };
}

/**
 * How much weight a sample can carry, in words.
 *
 * A hit rate over four claims is an anecdote and printing it beside one over
 * ninety without saying so invites the reader to read them as the same kind
 * of number. The cuts are arbitrary in the way every cut is; what is not
 * arbitrary is that the surface says which side of one it is on.
 */
export function sampleWords(n: number): string {
  if (n === 0) return 'nothing graded yet';
  if (n < 10) return `${n} graded — an anecdote, not a rate`;
  if (n < 30) return `${n} graded — thin`;
  return `${n} graded`;
}
