import { aggregateCandles, tfMinutes, type Timeframe } from './timeframe';
import { emaSeries, emaWarmup, vwapSeries } from './indicators';
import type { Candle } from '../types/market';

/*
==================================================
  SLAYER TERMINAL - MULTI-TIMEFRAME CONFLUENCE (data/confluence.ts)

  Whether the timeframes agree, in one line — T-12.
==================================================

  WHAT IT ANSWERS. A four-pane desk exists to hold four views at once, and the
  most common thing a reader spends it on is one symbol at four intervals, to
  find out whether the timeframes agree. That is a whole desk spent on a
  question that fits in a strip.

  THE RULE IS FIXED, AND IT IS THE WHOLE RULE.

      above its EMA21 AND above its VWAP   → up
      below its EMA21 AND below its VWAP   → down
      one of each                          → flat

  FLAT IS A DISAGREEMENT, not a small move. The two references are a trend one
  and a value one, and price between them is exactly the state where the
  timeframe has nothing to say — which is the honest reading and the useful
  one. No threshold, no band, nothing tunable: a strip whose meaning depends on
  a constant somebody picked is a strip nobody can rely on, and there is
  nothing here for a later reader to "improve" into a different indicator.

  NOT ENOUGH HISTORY IS ITS OWN STATE, and that matters more here than
  anywhere else on the desk. A weekly row on a name the simulator has held for
  two days would otherwise report `flat` — a measurement — when the truth is
  that nothing was measured. `null` renders as a dash, not as a bar.

  THE CURVES COME FROM data/indicators.ts, the same two functions the tape
  draws its EMA21 and VWAP lines from. Re-deriving them here would let this
  strip say "above VWAP" while the chart beside it draws price below the line.
*/

export type TrendState = 'up' | 'flat' | 'down';

/*
  FIVE, and these five: a decade, a session, and a day.

  1m and 5m are what a 0DTE reader is actually trading, 15m and 1h are where
  the day's structure shows, and 1D is the context all of it sits in. 30m adds
  a row that almost never disagrees with the two either side of it, and 1W on
  an intraday desk is a row that changes about as often as the strip is looked
  at. Both are still reachable as a PANE — this is a summary, not the
  timeframe list.
*/
export const CONFLUENCE_TFS: readonly Timeframe[] = ['1m', '5m', '15m', '1h', '1D'];

export interface ConfluenceRow {
  tf: Timeframe;
  /** null when this timeframe has too little history to have an opinion. */
  state: TrendState | null;
  /** How many bars this timeframe actually had — what `null` is explained by. */
  bars: number;
  /*
    THE CLOSE THE STATE WAS READ AT, carried rather than looked up.

    Every distance on the panel is `boundary − close`, and the two have to be
    the same instant or the arithmetic describes a moment that never existed.
    A caller reaching for the live tick instead would be subtracting a price
    that has moved since from curves that have not, and the percentages would
    jitter against boundaries that were standing still.
  */
  close: number | null;
  /*
    ══ THE TWO PRICES THAT CHANGE THIS ROW ══════════════════════════════════

    The strip says what each timeframe thinks. The question a reader asks
    next, every time, is "what would change it" — and until now the answer
    was to stare at two lines on a chart and estimate.

    IT IS NOT AN ESTIMATE. The rule is `above BOTH curves → up, below BOTH →
    down`, so the boundaries are exactly the higher and the lower of the two.
    Above `turnsUpAt` this row reads up; below `turnsDownAt` it reads down;
    between them it is flat. That is the same sentence the state is computed
    from, read backwards — no threshold anybody chose, and nothing here can
    drift away from the glyph beside it.

    Null exactly when `state` is: no view, no boundary.
  */
  turnsUpAt: number | null;
  turnsDownAt: number | null;
  /*
    WHICH LINE EACH BOUNDARY IS.

    Redundant with the two above, and worth the field. Four of the five rows
    share today's session VWAP — the same volume-weighted average whatever
    length you cut the bars into — so the panel prints one price four times
    and a reader is left wondering what they are looking at. Naming the curve
    turns that repetition from a puzzle into the point: the value line is one
    line for the whole desk, and what actually differs row to row is the EMA.

    `turnsUpAt` is the higher of these two and `turnsDownAt` the lower, which
    is asserted rather than assumed — see the proof.
  */
  ema: number | null;
  vwap: number | null;
  /*
    ══ AND HOW LONG IT HAS SAID SO ══════════════════════════════════════════

    `heldBars` counts the bars this state has run. `flippedInView` says
    whether the change was actually SEEN — a row that has read up since the
    first bar this timeframe can measure has not "flipped 60 bars ago", it
    has simply never been anything else in the window available, and those
    are different claims. The second is the one a reader would act on.
  */
  heldBars: number;
  flippedInView: boolean;
  /** The bar time the current state began, and the close then. Null when the
      flip was not in view — there is no moment to name. */
  sinceTime: number | null;
  sincePrice: number | null;
}

/** The period the rule names. Exported so the proof and the tooltip agree. */
export const CONFLUENCE_EMA = 21;

/**
 * One row per timeframe, from a symbol's 1-minute base bars.
 *
 * `base` is the raw 1m series — this aggregates it per timeframe itself,
 * because the caller would otherwise have to do it five times and could pass
 * the wrong `barMinutes` to the VWAP (see data/indicators.ts on why that
 * silently turns every bar into a new session).
 */
/** No view, and therefore no boundary and no run — one shape for both ways
    a row can have nothing to say. */
const blankRow = (tf: Timeframe, bars: number): ConfluenceRow => ({
  tf, state: null, bars, close: null,
  turnsUpAt: null, turnsDownAt: null, ema: null, vwap: null,
  heldBars: 0, flippedInView: false, sinceTime: null, sincePrice: null,
});

export function buildConfluence(base: readonly Candle[]): ConfluenceRow[] {
  return CONFLUENCE_TFS.map(tf => {
    const mins = tfMinutes(tf);
    const bars = aggregateCandles(base as Candle[], mins);
    /* An EMA21 seeded at the first close is still shedding that seed for its
       first `period` bars, so a row with fewer than that has an EMA in name
       only. Reporting `null` there is the difference between "the 1h has no
       view" and "the 1h is flat". */
    if (bars.length < emaWarmup(CONFLUENCE_EMA)) return blankRow(tf, bars.length);
    const ema = emaSeries(bars, CONFLUENCE_EMA);
    const vwap = vwapSeries(bars, mins);
    const i = bars.length - 1;
    const close = bars[i].close;
    const e = ema[i];
    const v = vwap[i];
    if (!Number.isFinite(e) || !Number.isFinite(v)) return blankRow(tf, bars.length);
    const state: TrendState = close > e && close > v ? 'up' : close < e && close < v ? 'down' : 'flat';

    /*
      THE STATE OF EVERY BAR, so the run can be counted backwards from the
      last one. Walked rather than remembered: this is recomputed from the
      same two series the glyph comes from, so the count can never describe a
      different rule from the letter beside it.

      Bars before the EMA's warm-up are skipped rather than scored — an EMA
      still shedding its seed would invent flips out of the seed decaying.
    */
    const from = emaWarmup(CONFLUENCE_EMA) - 1;
    const stateAt = (k: number): TrendState | null => {
      const c = bars[k].close;
      const ek = ema[k];
      const vk = vwap[k];
      if (!Number.isFinite(ek) || !Number.isFinite(vk)) return null;
      return c > ek && c > vk ? 'up' : c < ek && c < vk ? 'down' : 'flat';
    };
    let heldBars = 1;
    let flippedInView = false;
    let sinceTime: number | null = null;
    let sincePrice: number | null = null;
    for (let k = i - 1; k >= from; k--) {
      if (stateAt(k) === state) {
        heldBars++;
        continue;
      }
      /* The flip is the FIRST bar of the run, not the last of the one before
         — that is the bar a reader would point at and say "here". */
      flippedInView = true;
      sinceTime = bars[k + 1].time;
      sincePrice = bars[k + 1].close;
      break;
    }

    return {
      tf,
      state,
      bars: bars.length,
      close,
      /* Above the higher curve is up; below the lower is down. The rule,
         read backwards. */
      turnsUpAt: Math.max(e, v),
      turnsDownAt: Math.min(e, v),
      ema: e,
      vwap: v,
      heldBars,
      flippedInView,
      sinceTime,
      sincePrice,
    };
  });
}

/** ▲ / ▬ / ▼ — and a dash where there is no view. */
export const TREND_GLYPH: Record<TrendState, string> = { up: '▲', flat: '▬', down: '▼' };

/*
==================================================
  WHAT WOULD CHANGE IT, AND WHEN IT LAST DID
==================================================

  The strip answers "do the timeframes agree". Every reader's next question is
  the same one, and until now the desk had no answer to it: WHERE IS THE LINE.

  It is not a forecast and there is no model in it. The state is a sentence
  about where price sits relative to two curves, so the prices that change the
  sentence are the two curves — read off, not estimated. Everything below is
  that arithmetic and the words for it; nothing here can disagree with the
  glyph, because there is no second rule to disagree with.
*/

/** A price at which a row's reading changes, and what it becomes there. */
export interface FlipEdge {
  price: number;
  /** The state on the far side of it. */
  to: TrendState;
  /** Signed move from `row.close`, as a fraction — −0.0019 is 0.19% lower. */
  move: number;
  /** Which of the two curves this price IS. `both` when they sit together. */
  curve: 'ema' | 'vwap' | 'both';
}

/**
 * The prices that change a row's reading, NEAREST FIRST.
 *
 * Two of them, normally: an `up` row goes flat under the higher curve and
 * down under the lower one, and the mirror for a `down` row. A `flat` row is
 * the one already between them, so both of its edges are a real flip and the
 * nearer is whichever price is closer.
 *
 * Empty when the row has no view — there is no boundary on a measurement
 * nobody made.
 */
export function flipEdges(row: ConfluenceRow): FlipEdge[] {
  const { state, close, turnsUpAt: up, turnsDownAt: down, ema, vwap } = row;
  if (state === null || close === null || up === null || down === null) return [];
  const at = (price: number, to: TrendState): FlipEdge => ({
    price,
    to,
    move: close === 0 ? 0 : (price - close) / close,
    /* Exact equality is right here and nowhere near it is a rounding risk:
       the boundary is `Math.max` OF these two numbers, so it IS one of them. */
    curve: price === ema && price === vwap ? 'both' : price === vwap ? 'vwap' : 'ema',
  });
  /*
    THE TWO CURVES CAN SIT ON ONE PRICE, and then there is no flat zone to
    pass through: crossing moves the read two steps at once. Printing two
    edges at the same price would be the same line twice, one of them naming
    a state that lasts for no range of prices at all.
  */
  if (up === down) return [at(up, state === 'up' ? 'down' : state === 'down' ? 'up' : 'flat')];
  if (state === 'up') return [at(up, 'flat'), at(down, 'down')];
  if (state === 'down') return [at(down, 'flat'), at(up, 'up')];
  return Math.abs(up - close) <= Math.abs(close - down)
    ? [at(up, 'up'), at(down, 'down')]
    : [at(down, 'down'), at(up, 'up')];
}

/** The timeframe closest to changing its reading, across the whole strip. */
export interface NearestFlip {
  tf: Timeframe;
  edge: FlipEdge;
}

/**
 * The nearest flip on the desk — the one line worth putting in a header.
 *
 * Ties go to the FASTER timeframe, which is the strip's own order: when two
 * rows are the same distance away the shorter one gets there first.
 */
export function nearestFlip(rows: readonly ConfluenceRow[]): NearestFlip | null {
  let best: NearestFlip | null = null;
  for (const row of rows) {
    const edge = flipEdges(row)[0];
    if (!edge) continue;
    if (best === null || Math.abs(edge.move) < Math.abs(best.edge.move)) best = { tf: row.tf, edge };
  }
  return best;
}

const FLIP_VERB: Record<TrendState, string> = {
  up: 'turns up',
  flat: 'goes flat',
  down: 'turns down',
};

/**
 * A flip as a sentence — for the header, the hover title and a reader.
 *
 * A DISTANCE THAT ROUNDS TO NOTHING IS NOT A DISTANCE. Price sits ON one of
 * these curves often — the VWAP especially, which is what four of the five
 * rows are hanging off — and "turns up 0.00% higher" is a sentence that says
 * a number rather than a fact. When the move is under the resolution it is
 * being printed at, the fact is that the tape is already there.
 */
export const flipWords = (tf: Timeframe, e: FlipEdge): string => {
  const pct = Math.abs(e.move * 100);
  const where = `at ${e.price.toFixed(2)}`;
  return pct < 0.005
    ? `${tf} ${FLIP_VERB[e.to]} ${where} — the tape is on it`
    : `${tf} ${FLIP_VERB[e.to]} ${pct.toFixed(2)}% ${e.move >= 0 ? 'higher' : 'lower'}, ${where}`;
};

/*
  A FLIP IS ONLY NEWS WHILE IT IS NEW.

  Three bars of the timeframe's own interval — three minutes on the 1m row and
  three days on the 1D — because the mark exists to catch the reader who was
  looking somewhere else when it happened, not to decorate a trend. Past that
  the run length in the panel is the better read, and the strip goes quiet
  again so that a mark on it still means something.
*/
export const FRESH_BARS = 3;

/** True for a row that changed its reading within the last few of its bars.
    A row that has simply never been anything else in view is NOT fresh — see
    `flippedInView`, which is the whole reason that field exists. */
export const isFreshFlip = (row: ConfluenceRow): boolean =>
  row.flippedInView && row.heldBars <= FRESH_BARS;

/** How many rows read each way. `none` is a count, not a gap. */
export interface ConfluenceTally {
  up: number;
  flat: number;
  down: number;
  none: number;
}

export function confluenceTally(rows: readonly ConfluenceRow[]): ConfluenceTally {
  const t: ConfluenceTally = { up: 0, flat: 0, down: 0, none: 0 };
  for (const r of rows) {
    if (r.state === null) t.none++;
    else t[r.state]++;
  }
  return t;
}

/** How long the row has said what it says, honest about what it cannot see. */
export const heldWords = (row: ConfluenceRow): string => {
  const n = row.heldBars;
  const bars = `${n} bar${n === 1 ? '' : 's'}`;
  /* "for 60 bars" and "for all 60 bars there are" are different claims, and
     only the first one is a flip a reader could have watched happen. */
  return row.flippedInView ? `for ${bars}` : `for all ${bars} in view`;
};

/** What a row means, in words, for the hover title and a screen reader. */
export const trendWords = (row: ConfluenceRow): string =>
  row.state === null
    ? `${row.tf}: not enough history — ${row.bars} bar${row.bars === 1 ? '' : 's'}`
    : row.state === 'up'
      ? `${row.tf}: above its EMA${CONFLUENCE_EMA} and its VWAP ${heldWords(row)}`
      : row.state === 'down'
        ? `${row.tf}: below its EMA${CONFLUENCE_EMA} and its VWAP ${heldWords(row)}`
        : `${row.tf}: between its EMA${CONFLUENCE_EMA} and its VWAP ${heldWords(row)}`;
