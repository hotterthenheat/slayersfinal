/*
==================================================
  SLAYER TERMINAL - CONTRACT QUERY (contractQuery.ts)

  Reads a typed contract the way a trader writes one:
  "07/27 spy 747C", "SPY 747C 7/27", "spy 747 call
  jul 27". Order-free, because the desk does not agree
  on an order.

  The parser it replaces was an anchored regex demanding
  ticker-leads and a trailing integer day count, so the
  most natural phrasing of all matched nothing and the
  field silently did nothing.

  The contract here is a BINDING SET, never a boolean.
  Every slot resolves independently and says how it got
  its value: typed, assumed, missing, unknown or not yet
  confirmed. A search that silently returns the wrong
  contract is worse than one that says it did not
  understand, so nothing is invented (a strike is never
  guessed), nothing is rolled forward in silence (a date
  in the past stays in the past and is reported), and
  nothing the user typed disappears without either
  binding to a slot, landing in `leftovers` or earning
  a note. Those three are the whole ledger: if a token
  is in none of them, that is a bug.
==================================================
*/

import { expiryFor, fmtExpiry, isoDate, today, CALENDAR_THROUGH, MARKET_HOLIDAYS, type Expiry } from './calendar';

export type SlotState = 'typed' | 'assumed' | 'missing' | 'unknown' | 'pending';

export type QuerySlot<T> =
  | { state: 'typed'; value: T }
  | { state: 'assumed'; value: T; why: string }
  | { state: 'missing' }
  | { state: 'unknown'; raw: string; suggestions: string[] }
  /** Shaped like a symbol, but the listing that would confirm it has not
      loaded. Carries no value on purpose: pricing an unconfirmed name mints a
      synthetic series for it, and "not yet" is not the same as "no listing". */
  | { state: 'pending'; raw: string };

export interface QueryNote {
  slot: 'ticker' | 'strike' | 'right' | 'expiry';
  text: string;
}

export interface ContractQuery {
  ticker: QuerySlot<string>;
  strike: QuerySlot<number>;
  right: QuerySlot<'C' | 'P'>;
  expiry: QuerySlot<Expiry>;
  /** Non-fatal resolutions to print on the chip that owns them. */
  notes: QueryNote[];
  /** A date that resolved into the past. Never rolled forward silently. */
  expired: { label: string; weekday: string; daysAgo: number } | null;
  /** Tokens the classifier could not place. */
  leftovers: string[];
  /** ticker, strike, right and expiry are all filled (typed or assumed). */
  complete: boolean;
}

export interface QueryCtx {
  defaultTicker: string;
  /** Listed strike increment, from the chain grid. */
  strikeStep: number;
  /** Exact-symbol membership test. Wire to `searchTickers` from data/tickers. */
  knownTicker: (symbol: string) => boolean;
  /** Up to 3 near matches for an unknown symbol. */
  suggest: (symbol: string) => string[];
  /** Injectable for tests. Defaults to `today()` from calendar.ts. */
  now?: Date;
}

/** The value a slot carries, or null when it carries none. */
export function slotValue<T>(slot: QuerySlot<T>): T | null {
  return slot.state === 'typed' || slot.state === 'assumed' ? slot.value : null;
}

// ---- shapes ------------------------------------------------------------------

const RE_STRIKE_RIGHT = /^\$?(\d+(?:\.\d+)?)([CP])$/;
const RE_OCC = /^([A-Z]{1,6})(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/;
const RE_RIGHT = /^(C|P|CALL|CALLS|PUT|PUTS)$/;
/** The spelled-out sides. Unlike a lone C or P, none of these is a symbol. */
const RE_SIDE_WORD = /^(CALL|CALLS|PUT|PUTS)$/;
const RE_DTE = /^(\d{1,3})(D|DTE)$/;
const RE_DATE_SLASH = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/;
const RE_DATE_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const RE_STRIKE = /^\d{1,5}(?:\.\d{1,2})?$/;
const RE_TICKER = /^[A-Z]{1,5}$/;
const RE_YEAR = /^(?:19|20)\d{2}$/;

const MONTHS: Record<string, number> = {
  JAN: 0, JANUARY: 0, FEB: 1, FEBRUARY: 1, MAR: 2, MARCH: 2, APR: 3, APRIL: 3,
  MAY: 4, JUN: 5, JUNE: 5, JUL: 6, JULY: 6, AUG: 7, AUGUST: 7,
  SEP: 8, SEPT: 8, SEPTEMBER: 8, OCT: 9, OCTOBER: 9, NOV: 10, NOVEMBER: 10,
  DEC: 11, DECEMBER: 11,
};

const WEEKDAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_MS = 86400000;

/** Rungs the expiry picker offers. Several collapse onto one session. */
const LADDER_RUNGS = [0, 1, 2, 3, 4, 5, 7, 10, 14, 21, 30, 45, 60, 90, 180, 365];

const p2 = (n: number) => String(n).padStart(2, '0');

function atMidnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function calendarDaysBetween(from: Date, to: Date): number {
  return Math.round((atMidnight(to).getTime() - atMidnight(from).getTime()) / DAY_MS);
}

function fmtStrike(v: number): string {
  return v % 1 === 0 ? String(v) : String(Number(v.toFixed(2)));
}

// ---- what the calendar can and cannot answer ---------------------------------

/**
 * The last year `calendar.ts` carries holidays for. Past it `sessions` would
 * quietly count Thanksgiving as a trading day, and a session count that looks
 * right and is not is exactly the failure this module exists to prevent. The
 * calendar publishes the horizon now, so the two cannot drift apart.
 */
const CALENDAR_LAST_YEAR = CALENDAR_THROUGH;

const NOT_A_DATE = 'is not a date on the calendar';
const PAST_CALENDAR = `is past the market calendar, which runs through ${CALENDAR_LAST_YEAR}`;

/**
 * A date the calendar actually holds, or null.
 *
 * `new Date(2026, 1, 30)` is March 2 and throws nothing: the constructor rolls.
 * Left alone that turns "02/30" into a real, gradeable, differently-dated
 * contract with no note and no leftover, which is the one outcome worse than
 * refusing to parse. The only proof against a silent roll is that the date came
 * back holding the numbers it went in with.
 */
function realDate(year: number, month: number, day: number): Date | null {
  if (!Number.isInteger(year) || month < 0 || month > 11 || day < 1 || day > 31) return null;
  const d = new Date(year, month, day);
  return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day ? d : null;
}

/**
 * Deduped expiry rail for the expiry picker. Built from `expiryFor`, so a
 * Saturday is unselectable rather than merely discouraged: the picker cannot
 * offer a date the pricing math would then have to explain away. Rungs past the
 * holiday table are dropped for the same reason a typed date past it is
 * refused: their session count would be quietly high.
 */
export function expiryLadder(from?: Date): Expiry[] {
  const base = from ?? today();
  const seen = new Set<string>();
  const out: Expiry[] = [];
  for (const rung of LADDER_RUNGS) {
    const e = expiryFor(rung, base);
    if (seen.has(e.label) || e.date.getFullYear() > CALENDAR_LAST_YEAR) continue;
    seen.add(e.label);
    out.push(e);
  }
  return out;
}

// ---- date resolution ---------------------------------------------------------

type DateRead =
  /** `expired` is only set when the date resolved behind today. */
  | { ok: true; target: Date; expired: ContractQuery['expired'] }
  | { ok: false; why: string };

function readDate(target: Date | null, now: Date): DateRead {
  if (!target) return { ok: false, why: NOT_A_DATE };
  if (target.getFullYear() > CALENDAR_LAST_YEAR) return { ok: false, why: PAST_CALENDAR };
  const daysAgo = calendarDaysBetween(target, atMidnight(now));
  return {
    ok: true,
    target,
    expired:
      daysAgo > 0
        ? { label: fmtExpiry(target), weekday: WEEKDAY_FULL[target.getDay()].slice(0, 3), daysAgo }
        : null,
  };
}

/**
 * A bare MM/DD is the ambiguous case and the one the user actually typed.
 *
 * Rolling it forward is the tempting default and the wrong one: on 08/01/26 a
 * silent roll turns "07/27" into a 360-day LEAPS, which changes the sleeve, the
 * weight vector and the grade with nothing on screen saying so. So the date
 * stays where it landed and the screen reports it. The 183-day window is the
 * only forward roll: a date more than half a year behind is far likelier to be
 * next year's than a six-month-old typo. Feb 29 is why the roll is re-checked
 * rather than assumed: it exists this year and not the next.
 */
function resolveBareDate(month: number, day: number, now: Date): DateRead {
  const base = atMidnight(now);
  const here = realDate(base.getFullYear(), month, day);
  const rolled =
    here && calendarDaysBetween(here, base) > 183 ? realDate(base.getFullYear() + 1, month, day) : null;
  return readDate(rolled ?? here, now);
}

function resolveExactDate(year: number, month: number, day: number, now: Date): DateRead {
  return readDate(realDate(year, month, day), now);
}

// ---- the listing, which may not have loaded yet ------------------------------

type Membership = 'yes' | 'no' | 'pending';

/** A string no listing could hold, used to catch a test that accepts anything. */
const IMPOSSIBLE_SYMBOL = '\u0000';

/**
 * A membership test that says yes to a string no exchange could list is not a
 * membership test.
 *
 * The pane wires `knownTicker` to a lazily imported 6,300-row listing and
 * answers `true` for everything until it lands, so on the first renders any
 * 1-5 letter token bound as a real symbol and the simulator minted a price
 * series for it that then persisted for the session. Answering `false` instead
 * would be the opposite lie ("no listing for SPY" because a JSON was in
 * flight), so the honest third answer is "not yet": one probe per parse, and
 * the slot holds the text without pricing it.
 */
function membership(ctx: QueryCtx): (s: string) => Membership {
  const acceptsAnything = ctx.knownTicker(IMPOSSIBLE_SYMBOL);
  return s => (acceptsAnything ? 'pending' : ctx.knownTicker(s) ? 'yes' : 'no');
}

// ---- tokenizer ---------------------------------------------------------------

interface Lexed {
  tokens: string[];
  /** Indices of a C or P that arrived glued to its strike, as in "747C". Those
      are certainly the side. A lone C or P might be Citigroup. */
  glued: Set<number>;
}

/**
 * "747C" is one keystroke-efficient token carrying two slots, so it is split
 * before classification rather than given the classifier a special case. The
 * split is remembered, because it is the only evidence that separates a side
 * from a one-letter symbol.
 */
function tokenize(raw: string): Lexed {
  const rough = raw.trim().toUpperCase().split(/[\s,]+/).filter(Boolean);
  const tokens: string[] = [];
  const glued = new Set<number>();
  for (const tok of rough) {
    const m = tok.match(RE_STRIKE_RIGHT);
    if (m) {
      tokens.push(m[1]);
      glued.add(tokens.length);
      tokens.push(m[2]);
      continue;
    }
    // A leading $ is punctuation on a number, not part of it.
    tokens.push(tok.startsWith('$') && RE_STRIKE.test(tok.slice(1)) ? tok.slice(1) : tok);
  }
  return { tokens, glued };
}

// ---- parser ------------------------------------------------------------------

interface Draft {
  ticker: QuerySlot<string> | null;
  strike: QuerySlot<number> | null;
  right: QuerySlot<'C' | 'P'> | null;
  expiry: QuerySlot<Expiry> | null;
  expired: ContractQuery['expired'];
  /** A date the calendar refused. Blocks the default expiry: falling back to
      the nearest session would grade a contract the text never named. */
  dateRejected: boolean;
  notes: QueryNote[];
  leftovers: string[];
}

function snapStrike(rawToken: string, value: number, step: number, notes: QueryNote[]): number {
  if (!(step > 0)) return value;
  const snapped = Number((Math.round(value / step) * step).toFixed(4));
  if (snapped !== value) {
    notes.push({
      slot: 'strike',
      text: `${rawToken} is not on the $${step.toFixed(2)} grid. Using ${fmtStrike(snapped)}.`,
    });
  }
  return snapped;
}

/** Turn a requested calendar date into a listed session, saying so when it moves. */
function expiryFromDate(target: Date, now: Date, notes: QueryNote[]): Expiry {
  const e = expiryFor(calendarDaysBetween(now, target), now);
  if (e.date.getTime() !== atMidnight(target).getTime()) {
    const why = MARKET_HOLIDAYS.has(isoDate(target))
      ? 'is a market holiday'
      : `is a ${WEEKDAY_FULL[target.getDay()]}`;
    notes.push({ slot: 'expiry', text: `${fmtExpiry(target)} ${why}. Using ${e.weekday} ${e.label}.` });
  }
  return e;
}

function expiryFromDte(n: number, now: Date, notes: QueryNote[]): Expiry {
  const e = expiryFor(n, now);
  if (e.dte !== n) {
    notes.push({ slot: 'expiry', text: `${n}d out is ${e.weekday} ${e.label}, ${e.sessions} sessions.` });
  }
  return e;
}

/** One place to answer the ticker slot, so all three answers read the same
    wherever the symbol came from. "Not yet" is never rendered as "no listing". */
function bindTicker(d: Draft, sym: string, m: Membership, ctx: QueryCtx): QuerySlot<string> {
  if (m === 'yes') return { state: 'typed', value: sym };
  if (m === 'no') return { state: 'unknown', raw: sym, suggestions: ctx.suggest(sym).slice(0, 3) };
  d.notes.push({ slot: 'ticker', text: `Still loading the listed symbols, so ${sym} is not confirmed yet.` });
  return { state: 'pending', raw: sym };
}

/** One place to refuse a date, so every refusal leaves the same three marks. */
function rejectDate(d: Draft, raw: string, why: string): void {
  d.notes.push({ slot: 'expiry', text: `${raw} ${why}.` });
  d.leftovers.push(raw);
  d.dateRejected = true;
}

function applyDate(d: Draft, raw: string, read: DateRead, now: Date): void {
  if (!read.ok) {
    rejectDate(d, raw, read.why);
    return;
  }
  if (read.expired) {
    // Deliberately leaves the expiry slot empty. Nothing is graded on a date
    // that has passed, and the screen offers the two honest readings instead.
    d.expired = read.expired;
    return;
  }
  d.expiry = { state: 'typed', value: expiryFromDate(read.target, now, d.notes) };
}

function applyDte(d: Draft, raw: string, n: number, now: Date): void {
  const target = new Date(now);
  target.setDate(target.getDate() + n);
  if (target.getFullYear() > CALENDAR_LAST_YEAR) {
    rejectDate(d, raw, PAST_CALENDAR);
    return;
  }
  d.expiry = { state: 'typed', value: expiryFromDte(n, now, d.notes) };
}

/**
 * Month words carry their day in a neighbouring token, so they are paired
 * before the main pass. Left to right alone, "27 jul" loses: the 27 is claimed
 * as a strike three rules earlier and the month is left holding nothing.
 *
 * MAR, AUG and NOV are also listed symbols, and pairing them ate both the
 * symbol and its strike whenever the strike happened to be 1-31, so "aug 20c"
 * returned an August 20 call on the active ticker and the 20 was simply gone.
 * The tie-break is which reading yields a contract: the word is only kept back
 * as a symbol when the text names no other symbol AND taking the day would
 * leave no number behind for the strike. That way "aug 20c" is the AUG 20
 * call and "spy aug 20c" is still SPY expiring August 20. Both readings stay
 * reachable, and the surprising one says so.
 */
function pairMonthWords(
  lex: Lexed,
  now: Date,
  d: Draft,
  member: (s: string) => Membership
): boolean[] {
  const { tokens } = lex;
  const used = tokens.map(() => false);
  for (let i = 0; i < tokens.length; i++) {
    if (used[i]) continue;
    const month = MONTHS[tokens[i]];
    if (month === undefined) continue;

    const isDay = (j: number) =>
      j >= 0 && j < tokens.length && !used[j] && /^\d{1,2}$/.test(tokens[j]) &&
      Number(tokens[j]) >= 1 && Number(tokens[j]) <= 31;

    const dayIdx = isDay(i + 1) ? i + 1 : isDay(i - 1) ? i - 1 : -1;
    if (dayIdx < 0) continue;

    const day = Number(tokens[dayIdx]);
    const spareStrike = tokens.some((t, j) => j !== i && j !== dayIdx && !used[j] && RE_STRIKE.test(t));
    const otherSymbol = tokens.some(
      (t, j) => j !== i && RE_TICKER.test(t) && !RE_RIGHT.test(t) && member(t) === 'yes'
    );
    if (!spareStrike && !otherSymbol && member(tokens[i]) === 'yes') {
      d.notes.push({
        slot: 'ticker',
        text: `${tokens[i]} read as the symbol. For the month, type ${p2(month + 1)}/${p2(day)}.`,
      });
      continue;
    }

    used[i] = true;
    used[dayIdx] = true;

    // An explicit year immediately after the day is honoured. Without this it
    // would fall through to the strike rule or to Ignored, and "jul 27 2027"
    // would silently resolve to a different year than the one typed.
    const yearIdx = dayIdx + 1;
    const hasYear = yearIdx < tokens.length && !used[yearIdx] && RE_YEAR.test(tokens[yearIdx]);
    if (hasYear) used[yearIdx] = true;

    const raw = `${tokens[i]} ${tokens[dayIdx]}${hasYear ? ` ${tokens[yearIdx]}` : ''}`;
    if (d.expiry || d.expired) {
      d.leftovers.push(raw);
      continue;
    }
    applyDate(
      d,
      raw,
      hasYear ? resolveExactDate(Number(tokens[yearIdx]), month, day, now) : resolveBareDate(month, day, now),
      now
    );
  }
  return used;
}

export function parseContractQuery(raw: string, ctx: QueryCtx): ContractQuery {
  const now = atMidnight(ctx.now ?? today());
  const member = membership(ctx);
  const lex = tokenize(raw);
  const { tokens, glued } = lex;
  const d: Draft = {
    ticker: null, strike: null, right: null, expiry: null,
    expired: null, dateRejected: false, notes: [], leftovers: [],
  };

  // Read once, before anything is claimed: a lone C or P is only the side if
  // nothing else in the text already said which side this is.
  const sideIsSpoken = tokens.some((t, i) => glued.has(i) || RE_SIDE_WORD.test(t));
  const symbolElsewhere = tokens.some(t => RE_TICKER.test(t) && !RE_RIGHT.test(t) && member(t) === 'yes');

  const consumed = pairMonthWords(lex, now, d, member);

  for (let i = 0; i < tokens.length; i++) {
    if (consumed[i]) continue;
    const tok = tokens[i];

    // 1. OCC — unambiguous, fills every slot and stops reading. It names the
    //    whole contract, so it overrides whatever was read before it and every
    //    other token becomes text the OCC already answered for. Those are still
    //    the user's words: they are reported, not dropped.
    const occ = tok.match(RE_OCC);
    if (occ) {
      const [, sym, yy, mm, dd, cp, strike8] = occ;
      d.leftovers = tokens.filter((_, j) => j !== i);
      d.notes = [];
      d.expiry = null;
      d.expired = null;
      d.dateRejected = false;
      d.ticker = bindTicker(d, sym, member(sym), ctx);
      d.right = { state: 'typed', value: cp as 'C' | 'P' };
      const value = Number(strike8) / 1000;
      d.strike = { state: 'typed', value: snapStrike(fmtStrike(value), value, ctx.strikeStep, d.notes) };
      applyDate(d, `${mm}/${dd}/${yy}`, resolveExactDate(2000 + Number(yy), Number(mm) - 1, Number(dd), now), now);
      break;
    }

    // 2. SIDE — beats TICKER, so a bare "C" is a call and not the ticker C.
    //    It yields when the side is already spoken for by a word or by the
    //    strike it was glued to, which is the only way "C 505 call" could ever
    //    reach Citigroup: before, C was swallowed and the symbol was
    //    unreachable by any phrasing.
    if (RE_RIGHT.test(tok)) {
      const lone = tok.length === 1 && !glued.has(i);
      if (!(lone && sideIsSpoken)) {
        if (d.right) {
          d.leftovers.push(tok);
        } else {
          d.right = { state: 'typed', value: tok[0] === 'C' ? 'C' : 'P' };
          if (lone && !symbolElsewhere && member(tok) === 'yes') {
            d.notes.push({
              slot: 'right',
              text: `Read ${tok} as the side. Spell the side out to search the symbol ${tok}.`,
            });
          }
        }
        continue;
      }
    }

    // 3. DTE — the suffix is mandatory. A bare number is never a day count;
    //    that ambiguity is what made "747" read as an expiry in the old parser.
    const dteM = tok.match(RE_DTE);
    if (dteM || tok === 'TODAY' || tok === 'TOMORROW') {
      const n = dteM ? Number(dteM[1]) : tok === 'TODAY' ? 0 : 1;
      if (!d.expiry && !d.expired) applyDte(d, tok, n, now);
      else d.leftovers.push(tok);
      continue;
    }

    // 4. DATE
    const slash = tok.match(RE_DATE_SLASH);
    const iso = tok.match(RE_DATE_ISO);
    if (slash || iso) {
      if (!d.expiry && !d.expired) {
        if (iso) {
          applyDate(d, tok, resolveExactDate(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), now), now);
        } else if (slash![3]) {
          const y = slash![3].length === 2 ? 2000 + Number(slash![3]) : Number(slash![3]);
          applyDate(d, tok, resolveExactDate(y, Number(slash![1]) - 1, Number(slash![2]), now), now);
        } else {
          applyDate(d, tok, resolveBareDate(Number(slash![1]) - 1, Number(slash![2]), now), now);
        }
      } else {
        d.leftovers.push(tok);
      }
      continue;
    }

    // 5. STRIKE — the first bare number, and only the first.
    if (RE_STRIKE.test(tok)) {
      if (!d.strike) {
        const value = parseFloat(tok);
        d.strike = { state: 'typed', value: snapStrike(tok, value, ctx.strikeStep, d.notes) };
      } else {
        d.leftovers.push(tok);
      }
      continue;
    }

    // 6. A month word the pairing pass could not give a day to. It is ticker
    //    shaped, so without this "jul" reported "no listing for JUL" instead of
    //    naming the one thing that is actually missing. It also blocks the
    //    default expiry: someone who typed a month did not ask for this week.
    if (MONTHS[tok] !== undefined && member(tok) !== 'yes') {
      rejectDate(d, tok, `needs a day beside it, like ${tok} 27`);
      continue;
    }

    // 7. TICKER — shape plus membership. Shape alone would bind "ABCDE" to a
    //    snapshot the simulator would happily synthesize out of nothing.
    if (RE_TICKER.test(tok)) {
      const m = member(tok);
      if (m === 'yes') {
        // A resolved symbol outranks an unresolved one already in the slot.
        const held = d.ticker;
        if (!held || held.state === 'unknown' || held.state === 'pending') {
          if (held) d.leftovers.push(held.raw);
          d.ticker = { state: 'typed', value: tok };
          continue;
        }
      } else if (!d.ticker) {
        d.ticker = bindTicker(d, tok, m, ctx);
        continue;
      }
    }

    d.leftovers.push(tok);
  }

  // ---- defaults. A strike is never among them. --------------------------------
  const ticker: QuerySlot<string> =
    d.ticker ?? { state: 'assumed', value: ctx.defaultTicker, why: 'using the active ticker' };
  const right: QuerySlot<'C' | 'P'> =
    d.right ?? { state: 'assumed', value: 'C', why: 'no C or P in your text' };
  const strike: QuerySlot<number> = d.strike ?? { state: 'missing' };
  const expiry: QuerySlot<Expiry> = d.expiry
    ?? (d.expired || d.dateRejected
      ? { state: 'missing' }
      : { state: 'assumed', value: expiryFor(0, now), why: 'nearest listed session' });

  const filled = (s: QuerySlot<unknown>) => s.state === 'typed' || s.state === 'assumed';

  return {
    ticker,
    strike,
    right,
    expiry,
    notes: d.notes,
    expired: d.expired,
    leftovers: d.leftovers,
    complete: filled(ticker) && filled(strike) && filled(right) && filled(expiry),
  };
}
