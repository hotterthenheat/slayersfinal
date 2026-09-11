/*
==================================================
  SLAYER TERMINAL - THE EXPIRY LADDER
  (data/expiry.ts)

  Which contracts a reading is about.
==================================================

  ══ THE TERMINAL HAD ONE EXPIRY AND DID NOT SAY SO ═════════════════════════

  Every exposure number on this desk was computed at `CHAIN_T = 0.003` — a
  0DTE horizon — and nothing on any screen said so. A reader looking at a
  gamma wall was looking at TODAY'S gamma wall, which is a different level
  from the weekly's and a very different level from the monthly's, and the
  page presented it as "the" wall.

  There was a strike × expiry grid, and it was worse than nothing: it took
  the 0DTE value and multiplied it by a per-column decay and a hash, so the
  columns moved together, differed by a constant, and could not disagree with
  each other. A picture that cannot be wrong is not a measurement.

  ══ WHAT AN EXPIRY ACTUALLY CHANGES ════════════════════════════════════════

  Two things, and both of them matter more than a decay multiplier:

    · T, through Black-Scholes. Gamma at a 0DTE strike is enormous and
      razor-thin — it collapses a dollar away from the money. Gamma at a
      monthly is a tenth the size and spread over a wide band. The SHAPE of
      the ladder changes, not just its height.

    · WHERE THE OPEN INTEREST SITS. Dailies pile up at the money and on the
      round numbers nearest it. Monthlies are built out of months of
      position-taking and sit much wider, heaviest on the big round strikes.
      Two books, not one book scaled.

  Both are inputs to the same Black-Scholes chain the terminal already
  builds. Nothing downstream learns a second way to compute a gamma.

  So an expiry here carries a horizon and a personality, and the chain is
  rebuilt from both. Nothing is multiplied by anything.

  ══ 0DTE IS UNCHANGED, DELIBERATELY ════════════════════════════════════════

  `t` for 0DTE is the same 0.003 the chain has always used, and it keeps the
  same open-interest book. Every reading this terminal has ever taken, and
  every assertion that pins one, is about that expiry — so it stays bit for
  bit what it was and the others are added beside it.
*/

/** The expiries a reader can stand on. `custom` is resolved to a horizon by
    the caller from a chosen date — see `customExpiry`. */
export type ExpiryKey = '0dte' | '1dte' | 'weekly' | 'monthly' | 'custom';

export interface Expiry {
  key: ExpiryKey;
  /** What the control says. */
  label: string;
  /** What the readout says, in full. */
  name: string;
  /** Calendar days to expiry. 0DTE is today. */
  dte: number;
  /**
   * Years to expiry, as Black-Scholes wants it.
   *
   * 0DTE is 0.003 rather than 0 — a literal zero makes gamma a division by
   * zero, and the sim has always used this. It is roughly a trading day's
   * tail: about twenty-six hours, which is what a 0DTE contract is worth
   * being modelled as while it still trades.
   */
  t: number;
  /**
   * How tight this expiry's open interest sits around the money, as the
   * INVERSE width of the book's Gaussian — bigger is tighter.
   *
   * Expressed as an inverse on purpose. The chain's existing profile is
   * `exp(-(distance * 15)^2)`, and 0DTE carries exactly 15 here so its
   * arithmetic is the identical expression rather than an algebraically
   * equal one. On a desk whose proofs assert chain values to the last bit,
   * "equivalent" and "the same" are different claims.
   */
  oiWidth: number;
  /**
   * How much harder this expiry's book piles onto round strikes, as a
   * multiple of the chain's existing round-number bonus. Monthlies are built
   * out of months of people choosing NUMBERS; dailies out of people choosing
   * prices. 0DTE carries 1 and is therefore untouched.
   */
  roundBoost: number;
}

/** 0DTE's horizon, which is the one the chain has always used. Exported so
    the simulator and this module cannot drift apart on it. */
export const ZERO_DTE_T = 0.003;

/**
 * The horizon of an expiry `dte` days out.
 *
 * ══ 0DTE IS HOURS, NOT ZERO DAYS ══════════════════════════════════════════
 *
 * The first cut gave 1DTE `1/365` and the ladder came out non-monotonic: the
 * proof caught that "tomorrow" was a SHORTER horizon than "today", because
 * 0DTE's legacy 0.003 is about 1.1 days and 1/365 is one. That is not a test
 * being fussy — a gamma computed at a shorter horizon is a bigger gamma, so
 * the 1DTE ladder would have drawn taller bars than the 0DTE one and every
 * reading taken off it would have been backwards.
 *
 * The fix is the honest model rather than a nudged constant: a 0DTE contract
 * has the rest of TODAY left on it, and an n-day contract has that plus n
 * more days. So the ladder is anchored at 0DTE's own horizon and counts up
 * from there, which makes it monotonic by construction rather than by three
 * numbers agreeing.
 */
export const horizonOf = (dte: number): number => ZERO_DTE_T + Math.max(0, dte) / 365;

export const EXPIRIES: readonly Expiry[] = [
  { key: '0dte', label: '0DTE', name: 'Today', dte: 0, t: ZERO_DTE_T, oiWidth: 15, roundBoost: 1 },
  { key: '1dte', label: '1DTE', name: 'Tomorrow', dte: 1, t: horizonOf(1), oiWidth: 12, roundBoost: 1.15 },
  { key: 'weekly', label: 'WEEKLY', name: 'This week', dte: 7, t: horizonOf(7), oiWidth: 7.5, roundBoost: 1.4 },
  { key: 'monthly', label: 'MONTHLY', name: 'This month', dte: 30, t: horizonOf(30), oiWidth: 4.5, roundBoost: 1.75 },
] as const;

const BY_KEY = new Map(EXPIRIES.map(e => [e.key, e]));

/**
 * A custom expiry from a chosen number of days out.
 *
 * The personality is INTERPOLATED from the ladder rather than picked from it,
 * so a 12-day expiry sits genuinely between the weekly and the monthly
 * instead of snapping to whichever is closer and pretending. Past the
 * monthly it keeps widening, because a LEAP's book is wider still.
 */
export function customExpiry(dte: number): Expiry {
  const d = Math.max(0, Math.min(730, Math.round(dte)));
  const known = [...EXPIRIES].sort((a, b) => a.dte - b.dte);
  let lo = known[0];
  let hi = known[known.length - 1];
  for (let i = 1; i < known.length; i++) {
    if (d <= known[i].dte) {
      lo = known[i - 1];
      hi = known[i];
      break;
    }
  }
  const label = `${d}D`;
  if (d <= known[0].dte) return { ...known[0], key: 'custom', label, name: `${d} days out`, dte: d };
  if (d >= hi.dte) {
    /* Past the monthly the book keeps widening — a quarterly is not a
       monthly, and pinning it to one would be the decay-multiplier mistake
       in a different costume. Growth is with the square root of time, the
       same way a diffusion spreads. */
    const scale = Math.sqrt(d / hi.dte);
    return {
      key: 'custom',
      label,
      name: `${d} days out`,
      dte: d,
      t: horizonOf(d),
      oiWidth: Math.max(1.6, hi.oiWidth / scale),
      roundBoost: Math.min(2.6, hi.roundBoost * Math.min(1.5, scale)),
    };
  }
  const span = hi.dte - lo.dte;
  const w = span > 0 ? (d - lo.dte) / span : 0;
  const mix = (a: number, b: number) => a + (b - a) * w;
  return {
    key: 'custom',
    label,
    name: `${d} days out`,
    dte: d,
    t: horizonOf(d),
    oiWidth: mix(lo.oiWidth, hi.oiWidth),
    roundBoost: mix(lo.roundBoost, hi.roundBoost),
  };
}

/** The expiry for a key, with a custom horizon where the key is `custom`.
    Anything unrecognised falls back to 0DTE, which is the reading every other
    part of this terminal is already taking. */
export function expiryOf(key: ExpiryKey, customDte = 14): Expiry {
  if (key === 'custom') return customExpiry(customDte);
  return BY_KEY.get(key) ?? EXPIRIES[0];
}

/** Is this the expiry the rest of the terminal reads? Callers use it to keep
    the untouched path untouched. */
export const isZeroDte = (e: Expiry): boolean => e.key === '0dte';

/** A trading-day count between two dates, for the date picker's readout.
    Weekends only — holidays are a calendar this sim does not carry, and
    guessing them would make the number worse, not better. */
export function tradingDaysUntil(from: Date, to: Date): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  if (b <= a) return 0;
  let n = 0;
  const cur = new Date(a);
  while (cur < b) {
    cur.setDate(cur.getDate() + 1);
    const d = cur.getDay();
    if (d !== 0 && d !== 6) n++;
  }
  return n;
}
