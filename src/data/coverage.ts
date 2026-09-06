import { UNIVERSE } from './universe';

/*
==================================================
  SLAYER TERMINAL - WHAT WE DO AND DO NOT CARRY
  (data/coverage.ts)
==================================================

  "NO DATA" IS FOUR DIFFERENT SENTENCES and a reader acts differently on each:

    NOT LISTED     the symbol is not in this desk's universe. Nothing is
                   broken and nothing will arrive by waiting — the desk simply
                   does not carry it.
    NO CHAIN       the name is covered, but has no listed options. Real for
                   plenty of small caps; the equity surfaces still work.
    VALUE ONLY     an index. There is a level and there are options, and there
                   is no share volume, because nobody trades the index itself.
                   A volume column here is not empty, it is meaningless.
    NOT ON PLAN    the data class exists and this key does not buy it.

  THE FAILURE THIS PREVENTS is the one the DataState header already names in
  a different form: a reader who sees "no data" for a filter that is too tight
  widens it; one who sees the same words because the desk will never have the
  number widens it forever.

  ONLY THE FIRST IS REACHABLE TODAY, and this file says so rather than
  pretending otherwise. The universe is thirty equity names, every one of
  which has a chain — so `NO CHAIN`, `VALUE ONLY` and `NOT ON PLAN` cannot
  fire until a real feed and a real key are attached. They are defined here
  because the words are the hard part and the wiring is not, and because
  building them as unreachable UI later costs more than writing them down now.
*/

export type CoverageState = 'covered' | 'not-listed' | 'no-chain' | 'value-only' | 'not-on-plan';

export const COVERAGE_WORDS: Record<CoverageState, string> = {
  covered: '',
  'not-listed': 'not carried',
  'no-chain': 'no options',
  'value-only': 'index — no share volume',
  'not-on-plan': 'not on this plan',
};

export const COVERAGE_NOTES: Record<CoverageState, string> = {
  covered: '',
  'not-listed': `This desk carries ${UNIVERSE.length} names. That symbol is not one of them — nothing is missing, it is simply out of scope.`,
  'no-chain': 'This name is covered, but has no listed options. The equity surfaces still work; the options ones have nothing to draw.',
  'value-only': 'An index has a level and listed options, but no share volume — nobody trades the index itself. A volume column here would be meaningless rather than empty.',
  'not-on-plan': 'This data class exists and the current key does not include it.',
};

/**
 * WHAT THE DESK CAN SAY ABOUT A SYMBOL. Deliberately conservative: anything
 * in the universe is `covered`, because on this build every name in it has a
 * chain, and claiming otherwise would be inventing a limitation.
 */
export function coverageOf(ticker: string): CoverageState {
  const t = ticker.trim().toUpperCase();
  if (!t) return 'covered';
  return UNIVERSE.some(u => u.ticker === t) ? 'covered' : 'not-listed';
}

/** The sentence a picker should show when a search finds nothing. */
export const NO_MATCH_NOTE = `Nothing in the ${UNIVERSE.length} names this desk carries matches that.`;
