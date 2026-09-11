import type { KeyLevels } from '../../types/gex';

/*
==================================================
  SLAYER TERMINAL - SCORING
  (data/pinpoint/board.ts)

  What makes one strike matter more than another,
  and what to call it once it does.
==================================================

  ══ THE PIPELINE IS THE POINT ══════════════════════════════════════════════

      chain + history  →  measures  →  score  →  classification  →  the view

  This module is the middle three arrows. The chain comes from `matrix.ts`,
  which owns the book; what is here is the judgement applied to it, kept
  separate so there is exactly ONE definition of a weight and one of a grade
  however many surfaces end up drawing them.

  Each arrow is one-way and each stage is a pure function of the one before
  it. Nothing downstream of `score` may reach back for a raw number to break
  a tie, and the view may not compute anything at all — it places what this
  module decided.

  That is not tidiness. The rule this exists to make impossible is a bar
  whose length was chosen to look right, or a "HOT" that is hot because a
  designer liked the row. Every length on the ladder is `weight`, every badge
  is `grade`, and both come out of functions `npm test` holds to account.

  ══ WHY A BAR IS NOT AN EXPOSURE ═══════════════════════════════════════════

  The obvious ladder draws each strike's gamma. It is nearly useless, because
  gamma alone says a strike is BIG and a reader is asking which strikes are
  going to matter to the next hour of tape. A level thirty points away with
  enormous open interest is furniture; a smaller level two points away that
  has doubled in twenty minutes is the trade.

  So the bar is a WEIGHT, and it is built from four things that are actually
  different questions:

    GAMMA       how much is there, against the biggest strike in the book
    FLOW        how much of it arrived inside the chosen window
    PROXIMITY   how close it is to spot, in strikes
    URGENCY     how fast it is arriving — flow against its own recent rate

  Every one is normalised to 0..1 against the book it is in, so the four are
  addable and a weight is comparable across symbols and expiries. The blend
  is deliberate and documented at `WEIGHTS`, and the four components survive
  into the row so a reader can be shown WHY a bar is long rather than asked
  to trust it.
*/

/* ── the window a reading is taken over ─────────────────────────────────── */

export type WindowKey = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d';

export interface AnalysisWindow {
  key: WindowKey;
  label: string;
  /** Minutes of history the window reaches back over. */
  minutes: number;
}

/**
 * The windows the board measures change across.
 *
 * A session is 390 minutes, so `1d` is the whole of it rather than a
 * calendar day — the honest reading of "today" on an intraday buffer, and
 * the longest one this data can support without inventing a yesterday.
 */
export const WINDOWS: readonly AnalysisWindow[] = [
  { key: '1m', label: '1m', minutes: 1 },
  { key: '5m', label: '5m', minutes: 5 },
  { key: '15m', label: '15m', minutes: 15 },
  { key: '30m', label: '30m', minutes: 30 },
  { key: '1h', label: '1H', minutes: 60 },
  { key: '4h', label: '4H', minutes: 240 },
  { key: '1d', label: '1D', minutes: 390 },
] as const;

export const windowOf = (k: WindowKey): AnalysisWindow =>
  WINDOWS.find(w => w.key === k) ?? WINDOWS[2];

/* ── what the score is made of ──────────────────────────────────────────── */

/**
 * The blend, and why it is these numbers.
 *
 * GAMMA is the largest single term because a level with nothing at it cannot
 * matter however fast it is moving — size is the precondition, not the
 * answer. PROXIMITY is second because the same exposure twenty strikes away
 * is a fact about next month. FLOW and URGENCY together outweigh proximity,
 * which is the deliberate part: a board that ranked purely by size and
 * nearness would name the same four strikes all day and tell a reader
 * nothing they did not know at the open.
 *
 * They sum to one, so a score is a fraction and `weight` needs no second
 * normalisation to become a bar.
 */
export const WEIGHTS = { gamma: 0.38, proximity: 0.24, flow: 0.22, urgency: 0.16 } as const;

/** One strike's four measures, each 0..1 within its own book. */
export interface Components {
  gamma: number;
  flow: number;
  proximity: number;
  urgency: number;
}

/** What a strike IS, once the numbers have been read. */
export type Grade = 'hot' | 'warm' | 'building' | 'fading' | 'quiet';

/** What a strike is FOR — the structural name, where it has one. */
export type Role = 'pin' | 'callWall' | 'putWall' | 'flip' | 'magnet' | null;

/**
 * What a row must carry to be RANKED and NAMED.
 *
 * ══ A MINIMUM ASKS FOR WHAT IT READS, AND NOTHING ELSE ════════════════════
 *
 * The first cut listed everything a scored row ends up holding — net, parts,
 * change, steps — and the table would not satisfy it, because a table keeps
 * its net inside a family cell rather than on the row. The compiler was
 * right to refuse: none of those four is read here. `assignRoles` needs a
 * strike, a share and a weight; `loadedStrikes` needs a weight and a role.
 *
 * Asking for more than that is not stricter, it is just narrower — it would
 * have forced a surface to reshape itself for a module that never looks.
 */
export interface Scored {
  strike: number;
  /** The blended score, 0..1 — see `WEIGHTS`. */
  weight: number;
  /** Share of the book's Σ|net|, which is what lets MAGNET earn itself. */
  share: number;
  /** Set by `assignRoles`. */
  role: Role;
}

/** One window's reading, for the change overlay. */
export interface WindowRead {
  key: WindowKey;
  label: string;
  minutes: number;
  /** Signed change in the book's net exposure over this window. */
  change: number;
  /** Per minute, which is what makes two windows comparable — a bigger
      number over four hours is not necessarily a faster one. */
  rate: number;
  /** 1 building, −1 draining, 0 holding. */
  dir: 1 | 0 | -1;
  /**
   * Whether the rate is faster or slower than the next window out.
   *
   * This is the reading the overlay exists for. Any single window says how
   * much moved; the TERM STRUCTURE says whether it is speeding up, and a
   * reader glancing over from a chart is asking exactly that.
   */
  accel: 1 | 0 | -1;
  /** No history reaching this far back — said, not faked. */
  covered: boolean;
}


/* ── measures ───────────────────────────────────────────────────────────── */

/**
 * How close a strike is, as a 0..1.
 *
 * Falls off with the SQUARE of distance in strikes, which is steeper than
 * linear on purpose: the difference between one strike away and three is
 * enormous to a tape, and the difference between twenty and twenty-two is
 * nothing. A linear ramp gave the far half of the book a proximity of about
 * a third each and made the term almost a constant.
 */
export function proximityOf(steps: number, reach = 12): number {
  const d = Math.abs(steps) / Math.max(1, reach);
  return Math.max(0, 1 - d * d);
}

/**
 * A 0..1, saturating. A measure that could exceed one would let a single
 * outlier crush every other bar to nothing.
 */
export const unit = (v: number, span: number): number =>
  span > 0 ? Math.min(1, Math.max(0, v / span)) : 0;

/** The blend, applied. One definition, so no surface can weight it its own
    way and quietly rank differently. */
export function scoreOf(parts: Components): number {
  return (
    parts.gamma * WEIGHTS.gamma +
    parts.proximity * WEIGHTS.proximity +
    parts.flow * WEIGHTS.flow +
    parts.urgency * WEIGHTS.urgency
  );
}

/* ── classification ─────────────────────────────────────────────────────── */

/** Where a score stops being furniture. */
export const HOT = 0.62;
export const WARM = 0.44;
export const NOTICEABLE = 0.26;
/** A change worth calling a change, against the book's biggest strike. */
export const MOVE_FLOOR = 0.03;

/**
 * What a strike is, in one word.
 *
 * ══ THE BADGE IS A READING, NOT A DECORATION ══════════════════════════════
 *
 * HOT and WARM are about the blended score — how much this level is likely
 * to matter. BUILDING and FADING are about DIRECTION and beat the score,
 * because a middling strike that is filling fast is news and a large one
 * that is draining is the opposite of a wall forming. QUIET is everything
 * else, and most of a book is quiet; a board where every row had a badge
 * would have told a reader nothing.
 */
export function gradeOf(weight: number, parts: Components, change: number, peak: number): Grade {
  const moved = peak > 0 ? Math.abs(change) / peak : 0;
  const worthCalling = moved >= MOVE_FLOOR && weight >= NOTICEABLE;
  /* DIRECTION BEATS SIZE. A middling strike filling fast is the news; a big
     one draining is the opposite of a wall forming, and calling it HOT
     because it is still large would describe the past. */
  if (worthCalling && parts.urgency > 0.45) return change >= 0 ? 'building' : 'fading';
  if (weight >= HOT) return 'hot';
  if (weight >= WARM) return 'warm';
  if (worthCalling) return change >= 0 ? 'building' : 'fading';
  return 'quiet';
}

export const GRADE_WORDS: Record<Grade, string> = {
  hot: 'HOT',
  warm: 'WARM',
  building: 'BUILDING',
  fading: 'FADE',
  quiet: 'QUIET',
};

export const ROLE_WORDS: Record<Exclude<Role, null>, string> = {
  pin: 'PIN',
  callWall: 'CALL WALL',
  putWall: 'PUT WALL',
  flip: 'FLIP',
  magnet: 'MAGNET',
};

/**
 * The structural names, assigned once over the whole book.
 *
 * The pin and the walls come from the levels engine so this desk and the
 * tape cannot crown different strikes. MAGNET is this board's own and is the
 * one that has to earn itself: a strike that is neither the pin nor a wall,
 * sits within a few strikes of spot, and still holds an outsized share of
 * the book — the level price keeps returning to that nobody has named.
 */
export function assignRoles<T extends Scored>(rows: T[], levels: KeyLevels, spot: number, step: number): void {
  for (const r of rows) {
    if (r.strike === levels.supreme) r.role = 'pin';
    else if (r.strike === levels.callWall) r.role = 'callWall';
    else if (r.strike === levels.putWall) r.role = 'putWall';
    else if (r.strike === levels.flip) r.role = 'flip';
    else {
      const near = step > 0 ? Math.abs(r.strike - spot) / step : 99;
      r.role = near <= 4 && r.share >= 0.06 && r.weight >= WARM ? 'magnet' : null;
    }
  }
}

/**
 * The strikes worth a reader's eye, best first.
 *
 * Ranked by `weight` alone — no hand-placed exceptions, and no "always show
 * the pin". A pin that has stopped mattering should fall off this list, and
 * it will, because the score already knows it is far from spot and no longer
 * moving. What keeps the list honest is that nothing here can promote a row
 * the score did not.
 */
export function loadedStrikes<T extends Scored>(rows: T[], limit = 6): T[] {
  return [...rows]
    .filter(r => r.weight >= NOTICEABLE || r.role !== null)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit);
}

/* ── the change overlay ─────────────────────────────────────────────────── */

/**
 * How the book's net exposure has moved across every window.
 *
 * The overlay's job is the TERM STRUCTURE — whether the last minute is
 * faster than the last five, which is the difference between something
 * starting and something finishing. So each row carries a per-minute rate as
 * well as a total, and `accel` compares it against the window one step out.
 * Totals alone would say "four hours moved more than one minute", which is
 * arithmetic rather than information.
 */
export function windowReads(
  snaps: { levels: { strike: number; value: number }[] }[],
  strikes: number[]
): WindowRead[] {
  const want = new Set(strikes);
  const sumAt = (back: number): number | null => {
    const idx = snaps.length - 1 - back;
    if (idx < 0 || !snaps[idx]) return null;
    let t = 0;
    for (const l of snaps[idx].levels) if (want.has(l.strike)) t += l.value;
    return t;
  };
  const now = sumAt(0);
  const out: WindowRead[] = WINDOWS.map(w => {
    const was = now === null ? null : sumAt(w.minutes);
    const covered = was !== null;
    const change = covered && now !== null ? now - was : 0;
    return {
      key: w.key,
      label: w.label,
      minutes: w.minutes,
      change,
      rate: covered && w.minutes > 0 ? change / w.minutes : 0,
      dir: 0,
      accel: 0,
      covered,
    };
  });
  /* Direction against the book's own scale, so a rounding wobble on a quiet
     tape does not read as a trend. */
  const biggest = Math.max(1, ...out.map(r => Math.abs(r.change)));
  for (const r of out) r.dir = r.change > biggest * 0.02 ? 1 : r.change < -biggest * 0.02 ? -1 : 0;
  /* Acceleration: this window's rate against the next one out. The longest
     window has nothing to compare against and says so with a zero. */
  for (let i = 0; i < out.length - 1; i++) {
    const a = out[i];
    const b = out[i + 1];
    if (!a.covered || !b.covered) continue;
    const mine = Math.abs(a.rate);
    const theirs = Math.abs(b.rate);
    if (theirs <= 0) continue;
    a.accel = mine > theirs * 1.25 ? 1 : mine < theirs * 0.75 ? -1 : 0;
  }
  return out;
}
