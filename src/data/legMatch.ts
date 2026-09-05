import type { SpreadLeg, SpreadTrade } from './flowBook';

/*
==================================================
  SLAYER TERMINAL - HOW SURE THE MATCH IS
  (data/legMatch.ts)
==================================================

  Section 6.8: "Confidence badge — reconstruction is probabilistic. Never
  present a matched structure as confirmed."

  WHAT A MULTI-LEG ROW ACTUALLY IS. No exchange publishes "someone bought a
  butterfly". It publishes prints. A structure is INFERRED by grouping
  prints that arrived together on one underlying and look like they belong
  to one order — and that inference is a guess with a probability, not a
  read of a field. Two prints a second apart on adjacent strikes might be a
  vertical, or might be two people. Four prints in a butterfly pattern
  almost certainly are not four people.

  The desk's page presents these as named structures with a payoff diagram
  and a max loss, which is the strongest possible way to say "this is a
  fact". It has to carry the caveat, and the caveat has to be a NUMBER
  rather than a disclaimer nobody reads, because the difference between a
  four-leg condor and a two-leg vertical is real and large.

  WHAT THE SCORE IS BUILT FROM, and why each signal earns its weight — these
  are the properties a real reconstructor keys on, so the model keeps
  working when the tape is real rather than needing to be replaced:

    · LEG COUNT. Two prints landing together is the coincidence that
      actually happens — a busy name prints adjacent strikes constantly.
      Four prints forming a closed structure by chance is vanishingly rare.
      This is the strongest single signal and it is monotone in legs.

    · ONE EXPIRY, OR MORE THAN ONE. Legs sharing an expiry are the
      ordinary case and group cleanly. A calendar spans expiries by
      definition, which is exactly what makes it hard: its two legs look
      like two unrelated trades in different books.

    · RATIO. 1:1 legs are unambiguous. A 1:2 ratio has to be distinguished
      from one trade plus a coincidental second, and the size ratio is the
      only thing separating them.

    · SIZE AGREEMENT. Legs of one order print the same size (times their
      ratio). Legs that disagree on size are either a partial fill or two
      different orders wearing a family resemblance.

  WHAT IT IS NOT. It is not a probability in any calibrated sense — nothing
  here has a labelled set of true and false matches to fit against. It is an
  ordering with thresholds, and the words say so: "likely", not "87%".
  Printing a percentage would be the same lie in a more convincing font.
*/

export type MatchConfidence = 'likely' | 'probable' | 'uncertain';

export const MATCH_WORDS: Record<MatchConfidence, string> = {
  likely: 'likely match',
  probable: 'probable match',
  uncertain: 'uncertain match',
};

export const MATCH_NOTES: Record<MatchConfidence, string> = {
  likely:
    'Several legs arrived together in one expiry at matching sizes. A grouping this specific is very unlikely to be a coincidence — but it is still a grouping, not a field the exchange published.',
  probable:
    'The legs group cleanly enough to name the structure, with one property working against it — a split expiry, an uneven ratio, or sizes that do not line up.',
  uncertain:
    'This is the weakest kind of match: few legs, and something about them that a coincidence could also produce. Read the legs, not the name.',
};

/** The single sentence the whole page needs to carry. */
export const RECONSTRUCTION_NOTE =
  'Structures are RECONSTRUCTED from the print tape, not reported. No exchange publishes "a butterfly traded" — prints that arrived together are grouped, and the name is the desk\'s reading of that group. Every row on this page is a match, never a confirmation.';

/**
 * Score a reconstruction from the legs alone, 0..1.
 *
 * Deliberately built only from things a real tape carries, so this survives
 * the feed landing. Nothing random goes in — the same structure always
 * scores the same, which matters because the badge sits next to a max-loss
 * figure a reader may act on.
 */
export function matchScore(legs: readonly SpreadLeg[]): number {
  if (legs.length < 2) return 0;

  /* LEG COUNT — the dominant term. Two legs is the coincidence that really
     happens; four forming a closed structure is not. Capped at four because
     a fifth leg adds nothing to the argument. */
  const legTerm = Math.min(1, (legs.length - 2) / 2) * 0.45;

  // ONE EXPIRY or several.
  const expiries = new Set(legs.map(l => l.expiry));
  const expiryTerm = expiries.size === 1 ? 0.25 : 0;

  // RATIO — every leg pulling one unit is the unambiguous case.
  const evenRatio = legs.every(l => l.ratio === legs[0].ratio);
  const ratioTerm = evenRatio ? 0.18 : 0;

  /* SIZE AGREEMENT. The legs of one order print in proportion to their
     ratios; disagreement means a partial fill or two orders. Measured as
     the spread of ratio-normalised sizes, which is 0 for a clean order. */
  const norm = legs.map(l => Math.abs(l.fill) / Math.max(1, l.ratio));
  const mean = norm.reduce((a, b) => a + b, 0) / norm.length;
  const spread = mean > 0 ? (Math.max(...norm) - Math.min(...norm)) / mean : 1;
  const sizeTerm = Math.max(0, 1 - Math.min(1, spread)) * 0.12;

  return Math.max(0, Math.min(1, legTerm + expiryTerm + ratioTerm + sizeTerm));
}

/**
 * The ordering, in three words.
 *
 * THE TOP BAND IS "LIKELY", NOT "CONFIRMED", and no threshold anywhere
 * produces a fourth word above it. That is the checklist's rule expressed
 * as a type rather than as a discipline: there is no value of the score
 * that lets this page claim certainty.
 */
export function matchConfidence(score: number): MatchConfidence {
  if (score >= 0.72) return 'likely';
  if (score >= 0.45) return 'probable';
  return 'uncertain';
}

/** What is working against this match, in the reader's words — so a
    weak badge is actionable rather than merely discouraging. */
export function matchCaveats(legs: readonly SpreadLeg[]): string[] {
  const out: string[] = [];
  if (legs.length <= 2) out.push('only two legs — two prints together are the coincidence that actually happens');
  if (new Set(legs.map(l => l.expiry)).size > 1) out.push('legs span more than one expiry, so they group across books');
  if (!legs.every(l => l.ratio === legs[0]?.ratio)) out.push('uneven leg ratio, which a single print plus a coincidence can imitate');
  const norm = legs.map(l => Math.abs(l.fill) / Math.max(1, l.ratio));
  const mean = norm.reduce((a, b) => a + b, 0) / Math.max(1, norm.length);
  if (mean > 0 && (Math.max(...norm) - Math.min(...norm)) / mean > 0.35) {
    out.push('leg sizes do not line up, which reads as a partial fill or two orders');
  }
  return out;
}

/** Convenience for the page: score and word for a whole trade. */
export function tradeMatch(t: Pick<SpreadTrade, 'legs'>): { score: number; level: MatchConfidence } {
  const score = matchScore(t.legs);
  return { score, level: matchConfidence(score) };
}
