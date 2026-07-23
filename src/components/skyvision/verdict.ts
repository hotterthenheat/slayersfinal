import type { Tone } from '../ui/tones';
import type { Verdict } from '../../types/skyvision';

/**
 * One source of truth for how a setup verdict is spoken and toned.
 *
 * The internal `Verdict` union stays ENTER/EXIT/WATCH (engine identifiers), but
 * every user-facing surface renders the observational lexicon — QUALIFIED /
 * WATCH / FADED — so the same state never shows two different words. Kept in a
 * value-only module (no component export) so importing it doesn't trip
 * react-refresh.
 */
export const VERDICT_TONE: Record<Verdict, Tone> = {
  ENTER: 'bull',
  EXIT: 'bear',
  WATCH: 'warn',
};

export const VERDICT_LABEL: Record<Verdict, string> = {
  ENTER: 'QUALIFIED',
  EXIT: 'FADED',
  WATCH: 'WATCH',
};
