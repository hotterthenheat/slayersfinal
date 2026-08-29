import { h01, hRange } from '../core/rng';
import { macroWindow, type MacroDate } from './events';

/*
==================================================
  SLAYER TERMINAL - MACRO DETAIL (data/macroDetail.ts)

  What a macro event card needs beyond the date:
  the number expected, the number printed, and what
  the tape did about it.
==================================================

  §16. The calendar already knows WHEN — real FOMC dates, the first-Friday
  NFP rule, the second-Wednesday CPI approximation. What a card needs is
  WHAT: the consensus, the actual, the gap between them, and the reaction.

  THE SURPRISE IS THE POINT, not the print. A CPI of 3.1% means nothing on
  its own; a CPI of 3.1% against a 2.9% consensus is the whole trade. So the
  card is built around the DIFFERENCE and its sign, with the raw numbers
  underneath.

  A FUTURE EVENT HAS NO ACTUAL, and this says so rather than inventing one.
  `actual` and `surprise` are null until the release, `reaction` is null
  until the session that follows it, and the UI draws absence instead of a
  plausible zero. That is the same rule the whole desk runs on and it is the
  one most easily broken by a generator that always returns a number.

  THE REACTION IS SIGNED IN THE READER'S TERMS: what SPX did in the sixty
  minutes after the print, because that is the question a 0DTE desk asks of
  a macro release. Not the bond move, not the dollar — the thing they trade.

  UNITS ARE PER INDICATOR and carried with the value, because "0.2" means
  four different things across this list and a card that drops the unit is
  worse than one that drops the number.
*/

export type MacroKind = 'FOMC' | 'CPI' | 'NFP';

export interface MacroDetail {
  iso: string;
  kind: MacroKind;
  label: string;
  /** What it measures, in a reader's words. */
  blurb: string;
  /** e.g. '%' or 'k jobs' — carried with every figure. */
  unit: string;
  consensus: number;
  /** Null until the release has happened. */
  actual: number | null;
  /** actual − consensus, null while actual is. */
  surprise: number | null;
  /** SPX % move in the hour after the print. Null until it has happened. */
  reaction: number | null;
  /** Days from today; negative is past. */
  daysOut: number;
  past: boolean;
}

const KIND_OF = (label: string): MacroKind =>
  label.startsWith('FOMC') ? 'FOMC' : label.startsWith('CPI') ? 'CPI' : 'NFP';

const SPEC: Record<MacroKind, { blurb: string; unit: string; range: [number, number]; step: number }> = {
  FOMC: { blurb: 'The rate decision and the presser after it', unit: '%', range: [3.75, 4.75], step: 0.25 },
  CPI:  { blurb: 'Consumer prices, year over year', unit: '%', range: [2.2, 3.6], step: 0.1 },
  NFP:  { blurb: 'Non-farm payrolls added last month', unit: 'k jobs', range: [90, 310], step: 5 },
};

const isoOf = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Whole days from `today` to an ISO date; negative = already happened. */
function daysBetween(todayIso: string, iso: string): number {
  const a = new Date(`${todayIso}T12:00:00`).getTime();
  const b = new Date(`${iso}T12:00:00`).getTime();
  return Math.round((b - a) / 86400000);
}

/** Fill one calendar entry out into a card. */
export function detailFor(entry: MacroDate, todayIso: string): MacroDetail {
  const kind = KIND_OF(entry.label);
  const spec = SPEC[kind];
  const days = daysBetween(todayIso, entry.iso);
  const past = days < 0;
  const seed = `${entry.iso}|${kind}`;

  const raw = hRange(`${seed}|cons`, spec.range[0], spec.range[1]);
  const consensus = Number((Math.round(raw / spec.step) * spec.step).toFixed(kind === 'NFP' ? 0 : 2));

  if (!past) {
    /* No actual, no surprise, no reaction — and the card must SAY that
       rather than draw a zero that reads as "came in exactly on target". */
    return { iso: entry.iso, kind, label: entry.label, blurb: spec.blurb, unit: spec.unit, consensus, actual: null, surprise: null, reaction: null, daysOut: days, past };
  }

  const drift = (h01(`${seed}|act`) - 0.5) * spec.step * (kind === 'NFP' ? 14 : 4);
  const actual = Number((consensus + drift).toFixed(kind === 'NFP' ? 0 : 2));
  const surprise = Number((actual - consensus).toFixed(kind === 'NFP' ? 0 : 2));
  /* A hot inflation print or a hawkish hold sells equities; a hot payroll
     is read either way depending on the regime, so its reaction carries
     more noise than sign. */
  const lean = kind === 'CPI' ? -1 : kind === 'FOMC' ? -1 : 0.35;
  const reaction = Number(
    ((surprise / (spec.step * 4)) * lean * hRange(`${seed}|rx`, 0.25, 1.1)).toFixed(2)
  );
  return { iso: entry.iso, kind, label: entry.label, blurb: spec.blurb, unit: spec.unit, consensus, actual, surprise, reaction, daysOut: days, past };
}

/** The window, as cards — past first-in-time, future after. */
export function macroCards(today = new Date(), back = 45, ahead = 45): MacroDetail[] {
  const todayIso = isoOf(today);
  return macroWindow(today, back, ahead)
    .map(e => detailFor(e, todayIso))
    .sort((a, b) => (a.iso < b.iso ? -1 : 1));
}

/** The next event still ahead, or null when the window holds none. */
export function nextEvent(cards: readonly MacroDetail[]): MacroDetail | null {
  return cards.find(c => !c.past) ?? null;
}

/** How this indicator's past prints have landed — the comparison a card wants. */
export function pastRecord(cards: readonly MacroDetail[], kind: MacroKind): { hot: number; cold: number; inline: number; avgReaction: number | null } {
  const past = cards.filter(c => c.kind === kind && c.past && c.surprise !== null);
  if (past.length === 0) return { hot: 0, cold: 0, inline: 0, avgReaction: null };
  let hot = 0, cold = 0, inline = 0, rx = 0, rxN = 0;
  for (const c of past) {
    const s = c.surprise as number;
    if (s > 0) hot++; else if (s < 0) cold++; else inline++;
    if (c.reaction !== null) { rx += c.reaction; rxN++; }
  }
  return { hot, cold, inline, avgReaction: rxN > 0 ? Number((rx / rxN).toFixed(2)) : null };
}
