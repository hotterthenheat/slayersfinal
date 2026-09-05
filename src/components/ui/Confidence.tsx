import type { ReactNode } from 'react';

/*
==================================================
  SLAYER TERMINAL - SAYING HOW SURE
  (components/ui/Confidence.tsx)
==================================================

  THE DEALER SIGN IS A FITTED VALUE, NOT A FACT, and this desk had no
  vocabulary for that. Every exposure number rendered with the same
  confidence as a quoted price, which is the one dishonesty a positioning
  product cannot afford: the whole read rests on an inference about who is
  long and who is short, and nobody publishes that.

  The convention in force here is the standard one — dealers are assumed
  short calls and long puts against customer flow — and it is INFERRED. On a
  day when flow does not fit it, the sign can be wrong, and a reader who was
  never told it was a fit has no way to discount the number.

  THREE PIECES, and each answers a different question:

    ConfidenceBar   how well does the current fit hold? A number the reader
                    can watch degrade.
    ErrorBand       what is the range around this value? Rendered as ± rather
                    than a second precise number, because a fitted value with
                    two decimal places is a lie told in typography.
    lowConfidence   a panel treatment, so a whole surface can go quiet when
                    the fit it depends on stops holding.

  WHY DESATURATION AND NOT A WARNING COLOUR. Low confidence is not an error;
  the number is still the best available and a reader may well act on it. It
  should read as "hold this loosely", not "something broke" — and the amber
  the desk uses for stale and partial already means the second thing.
*/

export type ConfidenceLevel = 'high' | 'fair' | 'low';

/** Where a 0..1 fit quality sits, in the desk's three words. */
export const confidenceOf = (fit: number): ConfidenceLevel =>
  fit >= 0.75 ? 'high' : fit >= 0.45 ? 'fair' : 'low';

const WORDS: Record<ConfidenceLevel, string> = { high: 'strong fit', fair: 'fair fit', low: 'weak fit' };

const NOTES: Record<ConfidenceLevel, string> = {
  high: 'Flow fits the assumed dealer convention closely today — the sign is as reliable as this method gets.',
  fair: 'Flow fits the assumed convention loosely. The sign is probably right; the magnitude is softer than it looks.',
  low: 'Flow does not fit the assumed convention well today. Treat the sign as a hypothesis, not a read.',
};

const INK: Record<ConfidenceLevel, string> = {
  high: 'bg-textSecondary',
  fair: 'bg-textMuted',
  low: 'bg-textMuted/50',
};

/**
 * HOW WELL THE FIT HOLDS, as a short bar and a word. Deliberately not a
 * percentage: a fit quality of "0.62" invites arithmetic on a number that is
 * itself an estimate, and three honest words carry the decision.
 */
export const ConfidenceBar = ({
  fit,
  label = 'sign fit',
  className = '',
}: {
  fit: number;
  label?: string;
  className?: string;
}) => {
  const level = confidenceOf(fit);
  const pct = Math.round(Math.max(0, Math.min(1, fit)) * 100);
  return (
    <span
      title={NOTES[level]}
      aria-label={`${label}: ${WORDS[level]}`}
      className={`inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-textMuted ${className}`}
    >
      <span className="relative block w-8 h-1 rounded-full bg-white/[0.07] overflow-hidden">
        <span className={`absolute inset-y-0 left-0 rounded-full ${INK[level]}`} style={{ width: `${pct}%` }} />
      </span>
      {WORDS[level]}
    </span>
  );
};

/**
 * A VALUE WITH ITS UNCERTAINTY. The ± is rendered smaller and quieter than
 * the value, because it qualifies the number rather than competing with it —
 * but it is never omitted where the input is fitted, which is the whole
 * point.
 */
export const ErrorBand = ({
  children,
  plusMinus,
  note,
}: {
  children: ReactNode;
  /** Already formatted — this component does not know the unit. */
  plusMinus: string;
  note?: string;
}) => (
  <span
    className="inline-flex items-baseline gap-1"
    title={note ?? `This is a fitted value. The true number is expected within ±${plusMinus} of it.`}
  >
    {children}
    <span className="font-mono text-[0.75em] text-textMuted tnum whitespace-nowrap">±{plusMinus}</span>
  </span>
);

/**
 * THE PANEL TREATMENT. Returns the classes a surface should wear when the fit
 * behind it has degraded — quieter, not alarmed.
 */
export const lowConfidenceInk = (level: ConfidenceLevel): string =>
  level === 'low' ? 'opacity-70 saturate-50' : '';

/**
 * THE DISCLOSURE. Which convention is in force, that it is inferred, and how
 * well it is fitting right now — the checklist calls this the honesty that
 * differentiates the product, and it is one sentence plus a bar.
 */
export const SignConvention = ({ fit, className = '' }: { fit?: number | null; className?: string }) => {
  /*
    THE BAR IS OPTIONAL AND THE DISCLOSURE IS NOT.

    Saying the convention is inferred is true on every book, always, and it is
    the sentence the checklist calls the differentiator. A fit READING is only
    true when there is something to read: `signFit` returns null on a map whose
    levels did not move, which on the current simulated chain is every one of
    them. Drawing a full bar there would assert a measurement nobody took.
  */
  const level = fit === undefined || fit === null ? null : confidenceOf(fit);
  const base =
    'The desk assumes dealers are short calls and long puts against customer flow. That convention is INFERRED, not published — no feed states dealer inventory.';
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span
        title={level ? `${base} ${NOTES[level]}` : `${base} The map's levels did not move under a vol bump, so there is no fit reading to show.`}
        className="font-mono text-[9px] uppercase tracking-wider text-textMuted whitespace-nowrap"
      >
        sign: inferred
      </span>
      {fit !== undefined && fit !== null && <ConfidenceBar fit={fit} />}
    </span>
  );
};
