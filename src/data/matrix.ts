import Simulator from '../core/simulator';
import { buildLevelsFor, LADDER_METRICS, type LadderMetric } from './gex';
import type { StrikeNode } from '../types/market';
import type { KeyLevels } from '../types/gex';

/*
==================================================
  SLAYER TERMINAL - THE MATRIX ENGINE
  (data/matrix.ts)

  Inventory and sensitivity by strike: every level
  the book carries, each family's put leg, call leg
  and net, and which way the weight is moving.
==================================================

  WHY THIS IS ITS OWN MODULE AND NOT PART OF THE PAGE.

  Everything here is a pure function of the simulator's live chain. No React,
  no canvas, no DOM — which is what makes it provable by `npm test`, and the
  page that draws it a thin thing that only has to place rectangles. The
  lesson is Terrain's: the parts of that desk which could be proven were the
  parts that stopped breaking.

  THE SHAPE IS A TABLE, NOT A HEAT LADDER, and that is the point. A ladder
  says how much, and roughly where. A matrix says how much, on WHICH SIDE,
  and what the two sides leave behind — the difference between "there is
  weight at 500" and "there are $879M of puts against $358M of calls at 500,
  so dealers are net long half a billion of gamma there". The second is a
  trade; the first is a picture of one.
*/

/** One family's three readings at one strike. */
export interface Leg {
  /** The put side — positive under this desk's sign convention. */
  put: number;
  /** The call side — negative under the same convention. */
  call: number;
  /** What the two leave behind. Positive is put-dominant and amplifying. */
  net: number;
}

/** The names a strike can carry, in the order they beat each other. */
export type MatrixTag = 'pin' | 'callWall' | 'putWall' | 'flip';

/** How a strike's net reading has moved since some minutes ago. */
export interface Drift {
  /** The reading then. */
  was: number;
  /** now − then: the signed SWING, which is the story when a level flips side. */
  delta: number;
  /**
   * |now| − |was|: how much heavier or lighter the level got, which is the
   * story every other time.
   *
   * ══ A MATRIX ASKS "IS IT BUILDING", NOT "DID THE NUMBER GO UP" ═══════════
   *
   * The first cut divided the signed change by the old magnitude, and on a
   * call-dominant level that got heavier it printed −165%: the level went
   * from −$20M to −$53M, which is two and a half times the weight, and the
   * badge said it had fallen. Every negative half of the board read
   * backwards.
   *
   * The reader is asking whether the weight at a level is growing or
   * draining. That is a question about MAGNITUDE — the sign is already
   * carried, twice, by the value's own minus and by the ink its bar is drawn
   * in. So the badge reads the magnitude and the two channels stop fighting.
   */
  grew: number;
  /** Whether the reading changed SIDE. A level that crosses zero has not
      moved by a percentage; it has become a different thing. */
  crossed: boolean;
  /**
   * `grew` as a percentage of |was| — or null where that cannot mean
   * anything, which takes three conditions:
   *
   *   · the reading did not cross zero — see `crossed`;
   *   · the base was at least `PCT_FLOOR` of the group's own scale; and
   *   · the answer is under `PCT_CAP`.
   *
   * The cap is the one that looks arbitrary and is not. Past a few hundred
   * percent the number has stopped saying anything a smaller one does not —
   * "up 1,022 percent" and "up 4,000 percent" are both just "it was nearly
   * empty and now it is not" — while the DOLLARS still separate them. The
   * competition's boards are full of +3325% and +1338% for exactly this
   * reason, and they are the least informative cells on the screen.
   *
   * Where no percentage is offered the reader is given the move itself.
   */
  pct: number | null;
  /** 1 building, −1 draining, 0 holding — see `DRIFT_EPS`. */
  dir: 1 | 0 | -1;
}

/** One strike's row across every family in view. */
export interface MatrixRow {
  strike: number;
  /** Keyed by family; only the families the caller asked for are present. */
  cells: Partial<Record<LadderMetric, Leg>>;
  /** What this strike IS, beyond its number. */
  tags: MatrixTag[];
  /** Movement of the GAMMA net over each window — see `DRIFT_METRICS`. */
  drift: { m1: Drift | null; m5: Drift | null; m15: Drift | null; m30: Drift | null } | null;
  /** Whether this row survives the focus filter — see `markMeaningful`. */
  meaningful: boolean;
}

/** One ticker's book, at one instant, across the families in view. */
export interface Matrix {
  ticker: string;
  families: LadderMetric[];
  spot: number;
  step: number;
  /** Highest strike first, which is how a book is read against a price axis. */
  rows: MatrixRow[];
  /**
   * ══ ONE RULER PER FAMILY, SHARED BY ITS THREE COLUMNS ════════════════════
   *
   * Every bar inside a group is drawn against the same number, so a put bar
   * and a call bar and a net bar of the same length mean the same dollars.
   * Normalising each COLUMN to its own maximum is the defect this exists to
   * avoid: it makes the widest put and the widest net look equal when one is
   * three times the other, and nothing on the surface says so.
   *
   * Between groups the rulers differ, necessarily — a vega dollar is not a
   * gamma dollar — which is why the group header prints its own.
   */
  scales: Partial<Record<LadderMetric, number>>;
  /** Σ|net| per family, the denominator behind a strike's share. */
  totals: Partial<Record<LadderMetric, number>>;
  levels: KeyLevels;
  /**
   * The heaviest strike IN THE LEADING FAMILY, its share of that family's
   * book, and which way it is going.
   *
   * ══ THE KING BELONGS TO THE FAMILY ON SCREEN ══════════════════════════
   *
   * It was gamma's, always — the pin strike and its share of Σ|netGex| — and
   * on a panel showing vega that printed a gamma strike beside a share of
   * 0.0%, because a vega-only matrix keeps no gamma total to divide by. Two
   * wrong numbers from one assumption.
   *
   * A panel asks one question: where is the weight in THIS quantity. So the
   * king is the extreme of `families[0]` and its share is of that family's
   * own Σ|net|. For a gamma matrix that is the levels engine's `supreme` by
   * construction, which is how the crown and the PIN tag stay the same
   * strike without either consulting the other.
   *
   * `dir` is gamma's, and is zero elsewhere — see `DRIFT_METRICS`. A family
   * with no stored history cannot say which way it is going, and an arrow
   * that always pointed flat would be worse than no arrow.
   */
  king: { strike: number; share: number; dir: 1 | 0 | -1 } | null;
  /** How many rows the focus filter would keep. */
  meaningfulCount: number;
}

/*
  ══ WHICH FAMILIES CAN ANSWER "WHICH WAY" ═════════════════════════════════

  The simulator keeps a per-strike GAMMA snapshot every minute, twenty-two
  sessions deep — the buffer the exposure trails are drawn from. It keeps
  nothing equivalent for delta, vega, vanna or charm: those are computed from
  the live chain on demand and have no yesterday.

  So drift is offered for gamma and refused, honestly, for the other four. A
  badge invented for a family with no history would be the worst kind of
  number on this desk: one that looks measured and is not.
*/
export const DRIFT_METRICS: ReadonlySet<LadderMetric> = new Set<LadderMetric>(['gex']);

/** The windows a row reports, in minutes. The snapshot grid is one minute,
    so these are bar counts as well as clock minutes. */
export const DRIFT_WINDOWS = [1, 5, 15, 30] as const;

/** The window a row's own badge shows; the rest live in the hover. */
export const BADGE_WINDOW = 5;

/** A move has to be worth this much of the group's scale before the desk
    will call it a direction. Exposure jitters every tick, and a sensitive
    reading sets every row flickering — a channel that is ignored is worse
    than an absent one, because it still costs ink. */
export const DRIFT_EPS = 0.02;

/** How big the base has to be before a percentage is offered. */
export const PCT_FLOOR = 0.06;

/** Past this, a percentage says less than the dollars do. */
export const PCT_CAP = 400;

/** Below this share of the group's scale a row is not weight, it is texture. */
export const FOCUS_FLOOR = 0.1;

/** …unless it MOVED by at least this much of the scale, which is its own
    reason to look at a small row. */
export const FOCUS_MOVE = 0.05;

/**
 * The SHOCK each family's numbers are quoted against — "GEX · 1% move".
 *
 * This is the line that makes a figure on this desk a claim rather than a
 * decoration. A board that prints $520.8M of gamma and does not say per what
 * is unfalsifiable, and every competitor board measured against prints
 * exactly that.
 */
export const SHOCK: Record<LadderMetric, string> = {
  gex: '1% move',
  dex: '1σ move',
  vex: '1% vol',
  vanna: '1% vol',
  charm: '1 day',
};

const LEGS: Record<LadderMetric, { put: keyof StrikeNode; call: keyof StrikeNode; net: keyof StrikeNode }> = {
  gex: { put: 'putGex', call: 'callGex', net: 'netGex' },
  dex: { put: 'putDex', call: 'callDex', net: 'netDex' },
  vex: { put: 'putVex', call: 'callVex', net: 'netVex' },
  vanna: { put: 'putVanna', call: 'callVanna', net: 'netVanna' },
  charm: { put: 'putCharm', call: 'callCharm', net: 'netCharm' },
};

export const metricLabel = (m: LadderMetric): string =>
  LADDER_METRICS.find(x => x.key === m)?.label ?? m.toUpperCase();
export const metricName = (m: LadderMetric): string =>
  LADDER_METRICS.find(x => x.key === m)?.name ?? m.toUpperCase();
export const metricUnit = (m: LadderMetric): string =>
  LADDER_METRICS.find(x => x.key === m)?.unit ?? '';

/*
  ══ A SCALE THAT DOES NOT SHIMMER ═════════════════════════════════════════

  Normalising a group to its current maximum re-draws every bar the moment
  that maximum moves, and on a live book it moves every tick. The reader sees
  the whole column breathe and reads it as the market changing when nothing
  changed but the divisor. The house rule, from the strike rail: a picture
  whose scale moves while you look at it is a lie about size.

  So the scale is HELD until the raw maximum has drifted more than five
  percent away from it — less than that cannot move a bar by a pixel at these
  widths, so chasing it would be all cost.
*/
export const SCALE_DRIFT = 0.05;

export function holdScale(prev: number | null, raw: number): number {
  const next = Math.max(1, raw);
  if (prev == null || prev <= 0) return next;
  return Math.abs(next - prev) > prev * SCALE_DRIFT ? next : prev;
}

/*
  ══ THE INKS ══════════════════════════════════════════════════════════════

  A put leg is always a put leg and a call leg always a call leg, so those
  two columns take a fixed ink apiece. The NET is the one that changes what
  it IS, and it is the column the reader is actually there for — so it takes
  its colour from its sign.

  That is the one correction to the design this was drawn from, where the net
  bar was a single violet whatever it said: the column where the sign is the
  whole answer was the only column whose colour did not carry it. Net gamma
  crossing zero is dealers going from damping the tape to amplifying it, and
  a reader should see that happen without hunting for a minus sign.

  Violet for put-dominant, amber for call-dominant — the exposure field's own
  inks, so a strike reads the same here as its trail does on the tape. Red
  and green stay reserved for price direction.
*/
export const PUT_INK = '#FF6B5E';
export const CALL_INK = '#9DB2CE';
export const NET_POS_INK = '#A855F7';
export const NET_NEG_INK = '#E8A33D';

export const netInk = (v: number): string => (v >= 0 ? NET_POS_INK : NET_NEG_INK);

/* ── drift ──────────────────────────────────────────────────────────────── */

function readingsAt(
  snaps: { levels: { strike: number; value: number }[] }[],
  back: number
): Map<number, number> | null {
  const idx = snaps.length - 1 - back;
  if (idx < 0) return null;
  const snap = snaps[idx];
  if (!snap) return null;
  const out = new Map<number, number>();
  for (const l of snap.levels) out.set(l.strike, l.value);
  return out;
}

function driftOf(now: number, was: number | undefined, scale: number): Drift | null {
  if (was === undefined || !Number.isFinite(was)) return null;
  const delta = now - was;
  const grew = Math.abs(now) - Math.abs(was);
  const crossed = (was >= 0) !== (now >= 0);
  const raw = !crossed && Math.abs(was) >= scale * PCT_FLOOR ? (grew / Math.abs(was)) * 100 : null;
  const pct = raw !== null && Math.abs(raw) <= PCT_CAP ? raw : null;
  /* Direction is about WEIGHT, for the reason in the note on `grew`. */
  const dir: 1 | 0 | -1 = grew > scale * DRIFT_EPS ? 1 : grew < -scale * DRIFT_EPS ? -1 : 0;
  return { was, delta, grew, crossed, pct, dir };
}

/* ── the build ──────────────────────────────────────────────────────────── */

export interface MatrixOpts {
  /** The panel's previous scales, so they can be held — see `holdScale`. */
  prevScales?: Partial<Record<LadderMetric, number>> | null;
}

/**
 * One ticker's book as a matrix, at this instant.
 *
 * THE WHOLE CHAIN, INCLUDING THE EMPTY STRIKES. A book with nothing at a
 * level is a fact about the book, and a table that silently drops those rows
 * makes its own gaps unreadable — the reader cannot tell "no exposure here"
 * from "this strike does not trade". Every strike the chain carries gets a
 * row; `meaningful` is how the ones worth reading are found, and that is a
 * filter the reader turns on rather than one the data applies.
 */
export function buildMatrix(ticker: string, families: LadderMetric[], opts: MatrixOpts = {}): Matrix {
  const sym = Simulator.ensureTicker(ticker);
  const { chain, spot } = Simulator.chainFor(sym);
  const levels = buildLevelsFor(sym);
  const fams = families.length > 0 ? families : (['gex'] as LadderMetric[]);

  const sorted = [...chain].sort((a, b) => b.strike - a.strike); // high strike at the top
  const step = sorted.length > 1 ? Math.abs(sorted[0].strike - sorted[1].strike) : 1;

  /* The ruler for a group is the widest thing in ANY of its three columns,
     so the three are comparable — see the note on `scales`. */
  const scales: Partial<Record<LadderMetric, number>> = {};
  const totals: Partial<Record<LadderMetric, number>> = {};
  for (const f of fams) {
    const spec = LEGS[f];
    let raw = 0;
    let total = 0;
    for (const n of sorted) {
      for (const k of [spec.put, spec.call, spec.net] as const) {
        const v = Math.abs(Number(n[k]));
        if (Number.isFinite(v) && v > raw) raw = v;
      }
      const net = Math.abs(Number(n[spec.net]));
      if (Number.isFinite(net)) total += net;
    }
    scales[f] = holdScale(opts.prevScales?.[f] ?? null, raw);
    totals[f] = total;
  }

  const gexScale = scales.gex ?? 1;
  const snaps = fams.includes('gex') ? Simulator.getGexHistory(sym) : [];
  const past = snaps.length
    ? {
        m1: readingsAt(snaps, DRIFT_WINDOWS[0]),
        m5: readingsAt(snaps, DRIFT_WINDOWS[1]),
        m15: readingsAt(snaps, DRIFT_WINDOWS[2]),
        m30: readingsAt(snaps, DRIFT_WINDOWS[3]),
      }
    : null;

  const rows: MatrixRow[] = sorted.map(n => {
    const cells: Partial<Record<LadderMetric, Leg>> = {};
    for (const f of fams) {
      const spec = LEGS[f];
      cells[f] = {
        put: Number(n[spec.put]) || 0,
        call: Number(n[spec.call]) || 0,
        net: Number(n[spec.net]) || 0,
      };
    }
    const tags: MatrixTag[] = [];
    /* The order is the order they beat each other for the row's one label:
       a strike that is both the pin and a wall reads as the PIN, because
       "heaviest in the book" outranks "heaviest on one side". */
    if (n.strike === levels.supreme) tags.push('pin');
    if (n.strike === levels.callWall) tags.push('callWall');
    if (n.strike === levels.putWall) tags.push('putWall');
    if (n.strike === levels.flip) tags.push('flip');
    const netGex = Number(n.netGex) || 0;
    return {
      strike: n.strike,
      cells,
      tags,
      drift: past
        ? {
            m1: driftOf(netGex, past.m1?.get(n.strike), gexScale),
            m5: driftOf(netGex, past.m5?.get(n.strike), gexScale),
            m15: driftOf(netGex, past.m15?.get(n.strike), gexScale),
            m30: driftOf(netGex, past.m30?.get(n.strike), gexScale),
          }
        : null,
      meaningful: false, // set below, where the whole table is in hand
    };
  });

  markMeaningful(rows, fams, scales);

  /* The crown goes to the leading family's extreme — see the note on `king`. */
  const lead = fams[0];
  const leadTotal = totals[lead] ?? 0;
  let kingRow: MatrixRow | null = null;
  let kingPeak = -1;
  for (const r of rows) {
    const v = Math.abs(r.cells[lead]?.net ?? 0);
    if (v > kingPeak) {
      kingPeak = v;
      kingRow = r;
    }
  }

  return {
    ticker: sym,
    families: fams,
    spot,
    step,
    rows,
    scales,
    totals,
    levels,
    king: kingRow
      ? {
          strike: kingRow.strike,
          share: leadTotal > 0 ? kingPeak / leadTotal : 0,
          dir: lead === 'gex' ? kingRow.drift?.m5?.dir ?? 0 : 0,
        }
      : null,
    meaningfulCount: rows.reduce((n, r) => n + (r.meaningful ? 1 : 0), 0),
  };
}

/**
 * Which rows are worth a reader's eye, set in place.
 *
 * ══ THREE WAYS TO EARN THE LIGHT ══════════════════════════════════════════
 *
 * A strike matters if it is SOMETHING (a wall, the flip, the pin), if it is
 * BIG in any family on screen, or if it MOVED (a small level that just
 * filled is news precisely because it was small). Any one is enough.
 *
 * Nothing is deleted. The focus control dims what fails all three and leaves
 * it in place, because the shape of a book includes its empty stretches and
 * a table that closed its gaps would be a different, tidier, less true
 * picture.
 */
export function markMeaningful(
  rows: MatrixRow[],
  families: LadderMetric[],
  scales: Partial<Record<LadderMetric, number>>
): void {
  const gexScale = scales.gex ?? 0;
  for (const r of rows) {
    const heavy = families.some(f => {
      const s = scales[f] ?? 0;
      const c = r.cells[f];
      return s > 0 && c != null && Math.abs(c.net) / s >= FOCUS_FLOOR;
    });
    const moved = r.drift?.m5 ? Math.abs(r.drift.m5.delta) : 0;
    const movedShare = gexScale > 0 ? moved / gexScale : 0;
    r.meaningful = r.tags.length > 0 || heavy || movedShare >= FOCUS_MOVE;
  }
}

/* ── words ──────────────────────────────────────────────────────────────── */

/** Compact money for a table cell — nine of these to a row, so the unit
    letter does the work the digits would otherwise. */
export function cellMoney(v: number): string {
  const a = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${sign}$${(a / 1e3).toFixed(1)}K`;
  return `${sign}$${a.toFixed(1)}`;
}

/**
 * What a badge says.
 *
 * A percentage where one is honest; a swap mark where the level changed
 * side, because that is an event rather than a size; otherwise the move
 * itself in dollars. Null where the window has nothing to compare against,
 * or where the move is too small to be news.
 */
export function badgeWords(d: Drift | null): string | null {
  if (!d) return null;
  if (d.crossed) return '⇄';
  if (d.pct !== null) {
    if (Math.abs(d.pct) < 1) return null; // under a point is noise, not news
    return `${d.pct > 0 ? '+' : ''}${d.pct.toFixed(0)}%`;
  }
  if (d.grew === 0) return null;
  return `${d.grew > 0 ? '+' : '−'}${cellMoney(d.grew).replace('-', '')}`;
}

/** The label a row wears, in the order they beat each other. */
export const TAG_WORDS: Record<MatrixTag, string> = {
  pin: 'PIN',
  callWall: 'CW',
  putWall: 'PW',
  flip: 'FLIP',
};

export const TAG_TITLES: Record<MatrixTag, string> = {
  pin: 'The heaviest strike in the book — where the tape is most likely to be held',
  callWall: 'Call wall — the heaviest call-dominant strike above spot',
  putWall: 'Put wall — the heaviest put-dominant strike below spot',
  flip: 'Gamma flip — where dealers change from damping the tape to amplifying it',
};
