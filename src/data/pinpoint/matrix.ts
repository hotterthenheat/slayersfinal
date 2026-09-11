import Simulator from '../../core/simulator';
import { buildLevelsFor, LADDER_METRICS, spotChangePct, type LadderMetric } from '../gex';
import { expiryOf, type Expiry, type ExpiryKey } from '../expiry';
import {
  WINDOWS,
  assignRoles,
  loadedStrikes,
  proximityOf,
  scoreOf,
  unit,
  windowOf,
  windowReads,
  type Components,
  type Role,
  type WindowKey,
  type WindowRead,
} from './board';
import type { StrikeNode } from '../../types/market';
import type { KeyLevels } from '../../types/gex';

/*
==================================================
  SLAYER TERMINAL - THE STRIKE TABLE ENGINE
  (data/pinpoint/matrix.ts)

  ── IT LIVES IN PINPOINT NOW ──────────────────────────────────────────────

  Matrix was a destination and is not one any more: everything it computed
  is a question asked of the positioning board, and a reader should not
  navigate to understand the same book. The PAGE is gone; this engine is
  not, because it answers something the board does not — the five families
  side by side, with a per-strike change clock behind each.

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
  /**
   * Whether this move is big enough to be worth a badge at all.
   *
   * ══ A BADGE THAT CANNOT MOVE THE BAR IS NOISE ═══════════════════════════
   *
   * The top of a gamma book is strikes holding a few dollars, and every one
   * of them was carrying a badge — `+$10.0`, `+$44.9K`, `+$110.0` — because
   * the rule was only "the move is not exactly zero". A dozen rows of
   * confident-looking grey chips, each one true and none of them news, at
   * the very top of the table where the eye lands first.
   *
   * The floor is the one place a threshold like this is not arbitrary: the
   * micro-bar is about a hundred pixels, so a move under one percent of the
   * group's ruler cannot shift it by a single pixel. If the picture cannot
   * show it, the badge is claiming something the table has no way to
   * corroborate — so it stays quiet, and the reader can still get the exact
   * figure from the clock in the foot.
   */
  material: boolean;
}

/**
 * What a whole book is, in the numbers a reader would say out loud.
 *
 * ══ THE TABLE COULD NOT SAY WHICH SIDE IT WAS ON ══════════════════════════
 *
 * Sixty-one rows, every one of them exact, and nowhere on the panel the one
 * number every competing board leads with: is this book net put-dominant or
 * net call-dominant, and by how much. `totals` is Σ|net| — a MAGNITUDE sum,
 * which deliberately throws the sign away so a share can be taken against
 * it — so the signed total genuinely did not exist anywhere on the page.
 *
 * It does now, with the two readings that qualify it: how concentrated the
 * book is, and where it changes sides.
 */
export interface BookState {
  /** Σnet, signed. Positive is put-dominant across the whole book. */
  net: number;
  /** Σ|net| — the same number as `totals`, carried here so a caller holding
      a BookState has the denominator its shares were taken against. */
  gross: number;
  /** The heaviest strike's share of `gross`, and the top five together.
      ══ A CROWN AT 4.2% IS NOT A CROWN ═════════════════════════════════════
      On gamma the top strike holds about a seventh of the book and the word
      earns itself. On delta the book is spread thin and the header still
      announced a monarch. These two let the view say "spread" where that is
      the truth. */
  top1: number;
  top5: number;
  /** Where the net changes side, and how far spot is from it in strikes.
      Null when the window holds no crossing at all — which is itself a
      reading, and a table that printed a flip anyway would be inventing one. */
  flip: number | null;
  flipDistance: number | null;
}

/**
 * The named strikes of ONE family's book.
 *
 * ══ GAMMA'S LANDMARKS ARE NOT VEGA'S ══════════════════════════════════════
 *
 * Every tag on this table came from `buildLevelsFor`, which reads net GAMMA
 * and nothing else — so a VEGA panel wore gamma's call wall against vega's
 * numbers. `CW` on strike 502 of a vega book is a statement about where the
 * gamma wall is, printed in a column where nothing else on the row is about
 * gamma, with no way for a reader to know.
 *
 * On a GAMMA panel deferring to the levels engine is not a bug, it is the
 * point: the table must not crown one strike while the tape crowns another,
 * and that agreement is what `buildLevelsFor` exists to guarantee. So gamma
 * keeps deferring and every other family finds its landmarks in its own
 * column. `fromEngine` records which happened, because the two are not the
 * same kind of claim.
 */
export interface Landmarks {
  /** Heaviest strike either way. */
  pin: number | null;
  /** Heaviest call-dominant strike, and heaviest put-dominant. */
  callWall: number | null;
  putWall: number | null;
  /** Where the column changes side. */
  flip: number | null;
  /** True only for gamma, which takes these from the desk's levels engine. */
  fromEngine: boolean;
}

/** One strike's row across every family in view. */
/** One window's reading at one strike — see `MatrixRow.pulse`. */
export interface RowPulse {
  key: WindowKey;
  label: string;
  /** now − then, signed. */
  change: number;
  /** |now| − |then|: heavier or lighter, which is what the tick draws. */
  grew: number;
  /** Whether the level changed side inside this window. */
  crossed: boolean;
}

export interface MatrixRow {
  strike: number;
  /** Keyed by family; only the families the caller asked for are present. */
  cells: Partial<Record<LadderMetric, Leg>>;
  /** What this strike IS, beyond its number. */
  tags: MatrixTag[];
  /** Movement of the GAMMA net over each window — see `DRIFT_METRICS`. */
  drift: { m1: Drift | null; m5: Drift | null; m15: Drift | null; m30: Drift | null } | null;
  /**
   * ══ THE ROW'S OWN CHANGE, OVER THE WINDOW THE READER PICKED ═════════════
   *
   * Noah: "did you make the overlay per strike? so far looks like you just
   * put it on the top and i don't want that."
   *
   * He was right and this is the fix. The window control changed the SCORES
   * — which strikes made the shortlist and in what order — and the band at
   * the top of the panel read the whole book's change over each window. But
   * the badge on every ROW was `drift.m5`, hardcoded: the reader could pick
   * 1H and every one of sixty-one strikes went on quietly reporting the last
   * five minutes. A control whose effect is invisible on the thing it is
   * pointed at is the same as no control.
   *
   * So the window builds a reading PER STRIKE, on the same history and the
   * same `driftOf` as the four fixed ones, and the row's badge is that. The
   * band at the top keeps its own job — it is the term structure, and the
   * picker — and stops being the only place the window is visible.
   *
   * Gamma only, like every other change on this page: the session buffer
   * records net GEX and nothing else, and the foot says so on the families
   * where this is null.
   */
  flow: Drift | null;
  /**
   * ══ THE MULTI-TIMEFRAME OVERLAY, PER STRIKE ═════════════════════════════
   *
   * Noah: "did you make the overlay per strike? so far looks like you just
   * put it on the top and i don't want that."
   *
   * The first answer was to make the row's ONE badge follow the window
   * control. Better, and still not the thing: comparing 1m against 1H meant
   * clicking twice and holding the first answer in your head, and the
   * material floor left three quarters of the rows blank either way —
   * measured, 15 of 61.
   *
   * This is every window at once, for THIS strike: what the level's net has
   * done over one minute, five, fifteen, thirty, an hour, four hours and
   * the session. Read left to right it is the SHAPE of the move — weight
   * arriving in the last minutes leans one way, a level that filled at the
   * open and has sat still since leans the other — which is "what is
   * changing" asked of a strike rather than of a book.
   *
   * Every window, including the ones that barely moved. The badge keeps its
   * material floor because a FIGURE that small is noise dressed as news; a
   * TICK that small is simply short, which is the true answer and the
   * reason the picture can carry rows the number cannot.
   *
   * Empty where there is no history — gamma only, and only as far back as
   * the session buffer goes.
   */
  pulse: RowPulse[];
  /** Whether this row survives the focus filter — see `markMeaningful`. */
  meaningful: boolean;

  /*
    ══ THE SCORED HALF ═══════════════════════════════════════════════════════

    A table of exact numbers cannot say which of its rows is about to matter.
    These come from `./board`, which owns the judgement — how much is here,
    how much arrived inside the window, how close it is, how fast it is
    arriving — so the table and anything else that ranks strikes cannot come
    to different answers.

    They are about the LEADING family, the same one `king` and the tags are
    about. Scoring five families at once would be five rankings with no way
    to show which one a badge belonged to.
  */
  weight: number;
  parts: Components;
  /** Change in the leading family's net over the chosen window. */
  change: number;
  changePct: number | null;
  role: Role;
  /** Strikes from spot, signed; positive is above. */
  steps: number;
  /** Share of the book's Σ|net|. */
  share: number;
  /** 0..1 against the biggest single-side reading in the book — the two
      sides share one ruler, so a put bar and a call bar of the same length
      are the same dollars. */
  callBar: number;
  putBar: number;
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
  /**
   * The NET's own ruler — the heaviest |net| in the family, held the same
   * way.
   *
   * ══ THE PICTURE IS THE NET'S, SO ITS RULER IS THE NET'S ═════════════════
   *
   * `scales` is the widest of put, call and net, which is the right ruler
   * for three columns that must be comparable — and the table has one
   * column now. Against a leg's ruler the heaviest strike in the book drew
   * at two-fifths of the lane's half: the wall, the one bar a reader looks
   * for, reached nowhere near the edge, and every other bar was scaled to
   * that. The book's biggest net IS the edge; the rest are drawn against
   * it. Gross weight keeps `scales`, doubled, because a strike's gross can
   * reach twice a leg. The thresholds that decide what is MATERIAL keep
   * `scales` too — the ruler a picture is drawn against and the floor a
   * change has to clear are different questions.
   */
  netScales: Partial<Record<LadderMetric, number>>;
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
  /** Per family, what the whole book is — see `BookState`. */
  books: Partial<Record<LadderMetric, BookState>>;
  /** The leading family's named strikes, which are what the row tags are —
      see `Landmarks`. */
  landmarks: Landmarks;
  /**
   * THE TABLE IS A WINDOW, AND SAYS SO.
   *
   * The chain carries a fixed span of strikes either side of spot, so the
   * top and bottom rows are a CUT, not the end of the book. The table
   * presented as the complete chain — "every strike, including the empty
   * ones" — which is true of everything inside the window and silent about
   * the edges being edges.
   */
  window: { low: number; high: number; strikes: number; chain: number };
  /** When this reading was taken. A board left open on a second monitor
      shows a stale panel and a live one identically without it. */
  builtAt: number;
  /** Which contracts this reading is about, and over what window its change
      was measured. Both were fixed and unstated for the terminal's whole
      life before this. */
  expiry: Expiry;
  lookback: { key: WindowKey; label: string; minutes: number };
  /** The biggest single-side reading, which both bar scales are taken
      against so the two sides stay comparable. */
  peak: number;
  /**
   * The biggest |grew| at any strike over any window — the one ruler every
   * per-strike tick is drawn against, so a tall tick means the same dollars
   * on row four as on row forty.
   */
  pulseScale: number;
  /** The rows worth a reader's eye, best first. */
  loaded: MatrixRow[];
  /** Change across every window — the term structure, not a total. */
  reads: WindowRead[];
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

/** What a move must be worth, against the group's own ruler, to earn a
    badge — one pixel of the micro-bar. See `Drift.material`. */
export const BADGE_FLOOR = 0.01;

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

  ══ ONE CONCEPT, ONE HUE ══════════════════════════════════════════════════

  The legs were red and pale blue while the net beside them was violet and
  amber, which put the PUT SIDE in two unrelated colours in adjacent columns
  and made the table something a reader had to learn rather than see. Four
  inks for two ideas, with a legend that listed all four as if that were
  normal.

  So the hue carries the side and nothing else: violet is puts wherever it
  appears, amber is calls. The legs are tints of the same two — lighter,
  because they are the working-out and the net is the answer — and a column
  of them reads as one family of marks. It also makes the claim in the
  paragraph above TRUE, which it was not: the trails draw puts in
  rgb(168,85,247) and calls in rgb(240,165,60), the very values below.
*/
export const PUT_INK = '#9F7AEA';
export const CALL_INK = '#C9954A';
export const NET_POS_INK = '#A855F7';
export const NET_NEG_INK = '#E8A33D';

export const netInk = (v: number): string => (v >= 0 ? NET_POS_INK : NET_NEG_INK);

/**
 * What a named level is drawn in.
 *
 * ══ A TAG MUST NOT CONTRADICT THE COLUMN BESIDE IT ════════════════════════
 *
 * The call wall was GREEN and the put wall RED — the old up/down palette —
 * while the very numbers two characters to their right had just been unified
 * so that violet is the put side and amber the call side, everywhere. On
 * strike 495 you got `PW` in red sitting against a violet net: the tag names
 * a side, the figure names the same side, and they used unrelated hues.
 *
 * So a tag that names a SIDE takes that side's ink, and the word carries
 * which of the two kinds of level it is.
 *
 * The pin and the flip are not sides, and they keep the terminal-wide tokens
 * they share with Terrain's levels — a strike that is magenta on the tape is
 * magenta here. The pin sits closer to the put violet than is ideal (about
 * twenty-four degrees), and that is a deliberate trade: agreement across
 * desks beats separation within one, and the pin is not relying on hue alone
 * — it also wears a rule down the row and the only bold magenta word in the
 * table.
 */
export const TAG_INK: Record<MatrixTag, string> = {
  pin: '#EA00FF',      // SUPREME, terminal-wide
  callWall: NET_NEG_INK,
  putWall: NET_POS_INK,
  flip: '#4F8CFF',     // FLIP, terminal-wide
};

/**
 * Attention, and nothing else.
 *
 * The stale-reading stamp borrowed the call-dominant amber, which meant one
 * swatch carrying two unrelated claims. This is the desk's own "look here"
 * colour and it appears nowhere else on this page.
 */
export const WARN_INK = '#D2FF00';
/** The leg inks, by side — so a caller never has to know which constant is
    which way round. */
export const legInk = (side: 'put' | 'call'): string => (side === 'put' ? PUT_INK : CALL_INK);

/**
 * A symbol's price and move, without building its book.
 *
 * ══ THE BOARD PRINTED THE SAME QUOTE FOUR TIMES ═══════════════════════════
 *
 * Four SPY panels meant four copies of `$500.01 −0.05%` in four panel
 * headers, plus five copies of the same clock — a third of the header chrome
 * spent on repetition, on a board whose reason for existing is that the
 * panels differ. The quote belongs to the SYMBOL, so the desk states it once
 * per distinct symbol and the panels carry only their own identity.
 *
 * `chainFor` would answer this too and would build sixty-one strikes to do
 * it. This reads the same field it reads.
 */
export function quoteOf(ticker: string): { ticker: string; spot: number; change: number } {
  const sym = Simulator.ensureTicker(ticker);
  return { ticker: sym, spot: Simulator.TICKERS[sym]?.currentPrice ?? 0, change: spotChangePct(sym) };
}

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
  /* A crossing is always material: a level that changed side is news at any
     size, and the whole point of marking it is that its magnitude is not
     what makes it interesting. */
  const material = crossed || Math.abs(grew) >= scale * BADGE_FLOOR;
  return { was, delta, grew, crossed, pct, dir, material };
}

/* ── the build ──────────────────────────────────────────────────────────── */

/**
 * Where this family's named strikes are.
 *
 * Gamma defers to the desk's levels engine — see `Landmarks`. Everyone else
 * reads their own column: heaviest either way is the pin, heaviest on each
 * side is that side's wall, and the crossing has already been found for the
 * book state.
 */
function landmarksOf(
  f: LadderMetric,
  rows: MatrixRow[],
  levels: KeyLevels,
  flip: number | null
): Landmarks {
  if (f === 'gex') {
    return {
      pin: levels.supreme,
      callWall: levels.callWall,
      putWall: levels.putWall,
      flip: levels.flip,
      fromEngine: true,
    };
  }
  let pin: number | null = null;
  let callWall: number | null = null;
  let putWall: number | null = null;
  let peak = -1;
  let mostCall = 0;
  let mostPut = 0;
  for (const r of rows) {
    const v = r.cells[f]?.net ?? 0;
    if (Math.abs(v) > peak) {
      peak = Math.abs(v);
      pin = r.strike;
    }
    /* The convention: negative is call-dominant, positive put-dominant. A
       book with nothing on one side has no wall there, and says so with a
       null rather than by crowning its least-negative strike. */
    if (v < mostCall) {
      mostCall = v;
      callWall = r.strike;
    }
    if (v > mostPut) {
      mostPut = v;
      putWall = r.strike;
    }
  }
  return { pin, callWall, putWall, flip, fromEngine: false };
}

export interface MatrixOpts {
  /** The panel's previous scales, so they can be held — see `holdScale`. */
  prevScales?: Partial<Record<LadderMetric, number>> | null;
  /** And its previous net rulers — see `netScales`. */
  prevNetScales?: Partial<Record<LadderMetric, number>> | null;
  /** WHICH CONTRACTS. Defaults to 0DTE, which is what this terminal read
      for its whole life before the ladder existed. */
  expiry?: ExpiryKey;
  customDte?: number;
  /** OVER WHAT STRETCH change is measured. A different question from the
      expiry, and the reason the two are separate controls. */
  lookback?: WindowKey;
  /**
   * ══ HOW MANY STRIKES THE TABLE DRAWS, EITHER SIDE OF SPOT ═══════════════
   *
   * Noah: "its a lot to look at ... have a ability to shorten the strikes or
   * make it full."
   *
   * The chain is thirty either side and that is the right DATA — a book with
   * nothing at a level is a fact about the book. It is not always the right
   * VIEW: a reader watching the money move wants the strikes the money can
   * reach today, and sixty-one rows of which forty are empty is a scroll
   * between them.
   *
   * This shortens the TABLE and nothing else. Every score, every role, the
   * king, the totals and both scales are still taken over the whole chain,
   * because they are facts about the book rather than about the window a
   * reader happens to have open — a share of 11% must not become 24%
   * because somebody collapsed the view.
   *
   * Omitted means the whole chain.
   */
  reach?: number;
  /**
   * Or an exact number of rows, centred on the money — what FIT asks for.
   *
   * A span is symmetric, so it can only grow the table two rows at a time,
   * and a box with room for one more strike drew a strip of nothing at the
   * foot instead. A count fills to the row: the extra one, when there is
   * one, goes below spot, where the reader's eye already is. Wins over
   * `reach` when both are given.
   */
  rows?: number;
}

/** A family's landmarks in the shape the roles engine reads. */
export function asLevels(l: Landmarks, spot: number): KeyLevels {
  return {
    spot,
    supreme: l.pin ?? NaN,
    callWall: l.callWall ?? NaN,
    putWall: l.putWall ?? NaN,
    flip: l.flip ?? NaN,
  };
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
  const expiry = expiryOf(opts.expiry ?? '0dte', opts.customDte ?? 14);
  const look = windowOf(opts.lookback ?? '15m');
  const { chain, spot } = Simulator.chainFor(sym, expiry);
  const levels = buildLevelsFor(sym);
  const fams = families.length > 0 ? families : (['gex'] as LadderMetric[]);

  const sorted = [...chain].sort((a, b) => b.strike - a.strike); // high strike at the top
  const step = sorted.length > 1 ? Math.abs(sorted[0].strike - sorted[1].strike) : 1;

  /* The ruler for a group is the widest thing in ANY of its three columns,
     so the three are comparable — see the note on `scales`. */
  const scales: Partial<Record<LadderMetric, number>> = {};
  const netScales: Partial<Record<LadderMetric, number>> = {};
  const totals: Partial<Record<LadderMetric, number>> = {};
  for (const f of fams) {
    const spec = LEGS[f];
    let raw = 0;
    let rawNet = 0;
    let total = 0;
    for (const n of sorted) {
      for (const k of [spec.put, spec.call, spec.net] as const) {
        const v = Math.abs(Number(n[k]));
        if (Number.isFinite(v) && v > raw) raw = v;
      }
      const net = Math.abs(Number(n[spec.net]));
      if (Number.isFinite(net)) {
        total += net;
        if (net > rawNet) rawNet = net;
      }
    }
    scales[f] = holdScale(opts.prevScales?.[f] ?? null, raw);
    netScales[f] = holdScale(opts.prevNetScales?.[f] ?? null, rawNet);
    totals[f] = total;
  }

  const gexScale = scales.gex ?? 1;
  /* HISTORY FOR THE EXPIRY ON SCREEN, deep enough for the longest window the
     overlay offers — a 0DTE reading and a monthly reading have different
     pasts, and using one for the other would be the decay-multiplier mistake
     again in a slower costume. */
  const deepest = WINDOWS[WINDOWS.length - 1].minutes;
  const snaps = fams.includes('gex') ? Simulator.getExpiryHistory(sym, expiry, deepest + 2) : [];
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
    const netGex = Number(n.netGex) || 0;
    return {
      strike: n.strike,
      cells,
      tags: [], // assigned below, once this family's landmarks are known
      /* Filled by the scored pass, which needs the whole book in hand. */
      weight: 0,
      parts: { gamma: 0, flow: 0, proximity: 0, urgency: 0 },
      change: 0,
      changePct: null,
      role: null as Role,
      steps: 0,
      share: 0,
      callBar: 0,
      putBar: 0,
      /* Filled by the scored pass, which is where the chosen window's
         history is already in hand. */
      flow: null as Drift | null,
      pulse: [] as RowPulse[],
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


  /*
    ══ WHAT EACH BOOK IS, ONCE THE ROWS ARE IN HAND ═════════════════════════

    Signed total, concentration and the crossing — all three need the whole
    table, so they are taken here rather than row by row.
  */
  const books: Partial<Record<LadderMetric, BookState>> = {};
  for (const f of fams) {
    let net = 0;
    const mags: number[] = [];
    for (const r of rows) {
      const v = r.cells[f]?.net ?? 0;
      net += v;
      mags.push(Math.abs(v));
    }
    const gross = totals[f] ?? 0;
    mags.sort((a, b) => b - a);
    /* THE FLIP IS FOUND, NOT ASSUMED. Walking the rows from the top down,
       the first place the sign changes between adjacent strikes is where the
       book changes side. A window with no crossing has no flip, and saying
       so is a reading — inventing one would not be. */
    let flip: number | null = null;
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1].cells[f]?.net ?? 0;
      const b = rows[i].cells[f]?.net ?? 0;
      if (a === 0 || b === 0) continue;
      if (a >= 0 !== b >= 0) {
        /* The nearer of the two to zero is the strike the book turns on. */
        flip = Math.abs(a) <= Math.abs(b) ? rows[i - 1].strike : rows[i].strike;
        break;
      }
    }
    books[f] = {
      net,
      gross,
      top1: gross > 0 ? mags[0] / gross : 0,
      top5: gross > 0 ? mags.slice(0, 5).reduce((a, b) => a + b, 0) / gross : 0,
      flip,
      flipDistance: flip != null && step > 0 ? (spot - flip) / step : null,
    };
  }

  /*
    ══ THE LANDMARKS BELONG TO THE FAMILY ON SCREEN ══════════════════════════

    Needs `books`, which holds each family's own crossing, so it sits after
    them and before anything that reads a tag.
  */
  const landmarks = landmarksOf(fams[0], rows, levels, books[fams[0]]?.flip ?? null);

  /* The order is the order they beat each other for the row's one label: a
     strike that is both the pin and a wall reads as the PIN, because
     "heaviest in the book" outranks "heaviest on one side". */
  for (const r of rows) {
    if (r.strike === landmarks.pin) r.tags.push('pin');
    if (r.strike === landmarks.callWall) r.tags.push('callWall');
    if (r.strike === landmarks.putWall) r.tags.push('putWall');
    if (r.strike === landmarks.flip) r.tags.push('flip');
  }

  /*
    ══ THE SCORED PASS ═══════════════════════════════════════════════════════

    Exactness is what a table is for and it is not enough: sixty-one correct
    rows cannot say which one is about to matter. The four measures come from
    `./board` — how much is here, how much arrived inside the window, how
    close it is, how fast it is arriving — and every one is relative, which
    is why this happens once over the whole book rather than row by row.
  */
  const lookAt = readingsAt(snaps, look.minutes);
  const fastAt = readingsAt(snaps, 5);
  /* EVERY window's past, read once for the whole book rather than once per
     row — seven map lookups a row instead of seven scans of the buffer. */
  const pastAt = WINDOWS.map(w => ({ w, at: readingsAt(snaps, w.minutes) }));
  const leadSpec = LEGS[fams[0]];
  let peak = 0;
  let gross = 0;
  let biggestChange = 0;
  let biggestRate = 0;
  let pulseScale = 0;
  const reach = Math.max(1, (rows.length - 1) / 2);
  const raws = rows.map(r => {
    const cell = r.cells[fams[0]];
    const value = cell?.net ?? 0;
    peak = Math.max(peak, Math.abs(cell?.put ?? 0), Math.abs(cell?.call ?? 0));
    gross += Math.abs(value);
    const was = lookAt?.get(r.strike);
    const change = was === undefined ? 0 : value - was;
    const wasFast = fastAt?.get(r.strike);
    const rate = look.minutes > 0 ? Math.abs(change) / look.minutes : 0;
    const fastRate = wasFast === undefined ? 0 : Math.abs(value - wasFast) / 5;
    biggestChange = Math.max(biggestChange, Math.abs(change));
    const pulse: RowPulse[] = [];
    for (const { w, at } of pastAt) {
      const then = at?.get(r.strike);
      if (then === undefined || !Number.isFinite(then)) continue;
      pulse.push({
        key: w.key,
        label: w.label,
        change: value - then,
        grew: Math.abs(value) - Math.abs(then),
        crossed: (then >= 0) !== (value >= 0),
      });
      pulseScale = Math.max(pulseScale, Math.abs(Math.abs(value) - Math.abs(then)));
    }
    r.pulse = pulse;
    biggestRate = Math.max(biggestRate, rate, fastRate);
    return { value, change, rate, fastRate, was, cell };
  });
  rows.forEach((r, i) => {
    const raw = raws[i];
    const steps = step > 0 ? (r.strike - spot) / step : 0;
    const parts: Components = {
      gamma: unit(Math.abs(raw.value), peak),
      flow: unit(Math.abs(raw.change), biggestChange),
      proximity: proximityOf(steps, reach),
      urgency: unit(Math.max(raw.rate, raw.fastRate), biggestRate),
    };
    r.parts = parts;
    r.weight = scoreOf(parts);
    r.change = raw.change;
    /* The SAME reading the badge draws — built here rather than in the view,
       so the number a row prints and the number it was scored on cannot
       come apart. */
    r.flow = lookAt ? driftOf(raw.value, raw.was, gexScale) : null;
    r.changePct =
      raw.was !== undefined && Math.abs(raw.was) > peak * 0.02
        ? ((Math.abs(raw.value) - Math.abs(raw.was)) / Math.abs(raw.was)) * 100
        : null;
    r.steps = steps;
    r.share = gross > 0 ? Math.abs(raw.value) / gross : 0;
    r.callBar = unit(Math.abs(raw.cell?.call ?? 0), peak);
    r.putBar = unit(Math.abs(raw.cell?.put ?? 0), peak);
  });
  /*
    ══ THE STRUCTURAL NAMES ARE THE LEADING FAMILY'S ═══════════════════════

    The comment above this line said so, and the line passed `levels`, which
    is the gamma engine's — so a delta panel's rows wore gamma's pin and
    gamma's walls, and its feed opened with "PIN at 500" beside a delta
    figure. `landmarks` is the per-family answer and was already computed
    above; it is what the tags use, and now what the roles use, so the two
    cannot disagree about which strike is which.

    A family with no such level — a column that never changes side has no
    flip — gets NaN there, which equals no strike, which is the right number
    of rows to name.
  */
  assignRoles(rows, asLevels(landmarks, spot), spot, step);

  /*
    ══ THE VIEW IS SHORTENED HERE, AFTER EVERY NUMBER IS SETTLED ═══════════

    Deliberately the last thing that happens. Slicing earlier would change
    what the figures MEAN — proximity is measured against the book's reach,
    a share is a share of the whole book, and the king is the extreme of the
    chain — so a reader collapsing the view to ten strikes either side would
    have watched every percentage on the page move, which is a table lying
    about the book to flatter its own window.

    Centred on the strike nearest spot rather than on the middle of the
    array, so the shortened view is symmetric about the money even when the
    chain is not symmetric about it.
  */
  const shown = (() => {
    const n =
      opts.rows != null && Number.isFinite(opts.rows) && opts.rows > 0
        ? Math.floor(opts.rows)
        : opts.reach != null && Number.isFinite(opts.reach) && opts.reach > 0
          ? opts.reach * 2 + 1
          : 0;
    if (n <= 0 || n >= rows.length) return rows;
    let mid = 0;
    let best = Infinity;
    for (let i = 0; i < rows.length; i++) {
      const d = Math.abs(rows[i].strike - spot);
      if (d < best) {
        best = d;
        mid = i;
      }
    }
    const lo = Math.max(0, Math.min(rows.length - n, mid - Math.floor((n - 1) / 2)));
    return rows.slice(lo, lo + n);
  })();
  for (const r of rows) if (r.tags.length > 0) r.role = r.tags[0] as Role;

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
    rows: shown,
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
    books,
    landmarks,
    expiry,
    lookback: { key: look.key, label: look.label, minutes: look.minutes },
    peak,
    pulseScale,
    netScales,
    /* THE SHORTLIST IS ABOUT WHAT IS ON SCREEN. Ranking strikes the reader
       has collapsed out of view would be a list they cannot look at. */
    loaded: loadedStrikes(shown),
    reads: windowReads(snaps, shown.map(r => r.strike)),
    window: {
      low: shown.length ? shown[shown.length - 1].strike : 0,
      high: shown.length ? shown[0].strike : 0,
      strikes: shown.length,
      /* What the chain HAS, against what the table is drawing — so the edge
         marker can say "shortened to 21 of 61" rather than implying the
         book stops there. */
      chain: sorted.length,
    },
    builtAt: Date.now(),
    /* OF WHAT IS ON SCREEN. It counted the whole chain against the number of
       rows drawn, so a table shortened to thirty-one strikes read "61/31
       carry something" — a fraction with a bigger numerator than denominator,
       which is not a hard thing for a reader to notice. */
    meaningfulCount: shown.reduce((n, r) => n + (r.meaningful ? 1 : 0), 0),
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
 *
 * ══ THE ARROW CARRIES DIRECTION SO COLOUR DOES NOT HAVE TO ════════════════
 *
 * It was `+79%` on a green chip and `−67%` on a red one, which put the
 * strongest two-tone signal in trading — the one every reader has been
 * taught means UP and DOWN, GOOD and BAD — onto a claim that is neither. A
 * put wall filling is not bullish. And a green `+79%` sat directly beside an
 * amber `−$194.4M`, two colour systems fighting inside one cell.
 *
 * So the glyph says which way and the chip's ink is free to say what the
 * whole row says: which side this level is on. Green and red go back to
 * meaning price, which is the only thing they have ever reliably meant.
 */
export function badgeWords(d: Drift | null): string | null {
  if (!d) return null;
  /* Below the floor the move cannot move the bar by a pixel — see
     `Drift.material`. The clock in the foot still carries the exact figure. */
  if (!d.material) return null;
  if (d.crossed) return '⇄';
  const mark = d.grew > 0 ? '▲' : '▼';
  if (d.pct !== null) {
    if (Math.abs(d.pct) < 1) return null; // under a point is noise, not news
    return `${mark}${Math.abs(d.pct).toFixed(0)}%`;
  }
  if (d.grew === 0) return null;
  return `${mark}${cellMoney(d.grew).replace('-', '')}`;
}

/**
 * A zero crossing, in words that carry its size.
 *
 * ══ THE LOUDEST EVENT HAD THE QUIETEST MARK ═══════════════════════════════
 *
 * A strike crossing zero is a level changing what it IS — on gamma, dealers
 * at that strike going from damping the tape to amplifying it. It was drawn
 * as a bare `⇄`: two pixels, no magnitude, and a colour taken from `grew`,
 * which on a crossing is not the story. Every ordinary ±40% row on the board
 * shouted louder than the one row that had actually changed.
 *
 * So it says which side it landed on and how big it landed, and the view
 * draws it in the new side's ink.
 */
export function crossWords(d: Drift): string {
  const now = d.was + d.delta;
  return `⇄ ${cellMoney(Math.abs(now)).replace('-', '')}`;
}

/** Which side a crossing landed on — the ink the badge should take. */
export const crossedTo = (d: Drift): 'put' | 'call' => (d.was + d.delta >= 0 ? 'put' : 'call');

/**
 * Why a badge is speaking dollars instead of percent.
 *
 * Past `PCT_CAP` a badge drops from `+312%` to `+$25.4M` with nothing on the
 * surface explaining why its neighbours now speak a different language. The
 * rule is right — see `Drift.pct` — it was just invisible. This is the
 * sentence the foot prints so it stops being a mystery.
 */
export const UNITS_NOTE = `moves over ${PCT_CAP}% of their own base, or from too small a base to divide by, are shown in dollars`;

/**
 * Whether the heaviest strike deserves the word.
 *
 * On gamma the top strike holds about a seventh of the book and "King" earns
 * itself. On delta the same line read `King 490 4.2%` — a book spread thinly
 * across sixty-one strikes, with the header announcing a monarch anyway. The
 * word was doing the arithmetic's job and getting it wrong.
 */
export const CROWN_FLOOR = 0.12;
export const crownWord = (top1: number): string => (top1 >= CROWN_FLOOR ? 'King' : 'Top');

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
