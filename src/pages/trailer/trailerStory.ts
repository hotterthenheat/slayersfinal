/*
==================================================
  SLAYER TERMINAL - TRAILER STORY (trailerStory.ts)

  One symbol, one market event, one structural level, derived once.

  Every number the trailer shows is built here and handed down. Scenes render
  what they are given and never roll their own values: a trailer whose desks each
  invent their own numbers is a slideshow of unrelated dashboards, which is
  exactly the thing this is not.

  The chain, spot and structural levels come from the app's own simulator and
  `buildLevels` — the same derivation every real desk reads, run against a pinned
  session. Story specifics (which prints arrive, which contracts compete, how the
  trade ends) are seeded from a fixed key so a replay is the same film.

  Pinned, because the live simulator is mutable: `buildSnapshot` reads a price
  that advances every 1500ms and draws from the symbol's random stream on the way
  past. Built off that, the story's geometry depended on how long the app had been
  open before /trailer mounted — cold, the strongest level below spot landed three
  cents under price and the whole "price travels down into a level" premise
  collapsed. `buildSnapshotAt` runs the same builders at a fixed spot and a fixed
  positioning regime, so the film is the same film on every mount and mounting it
  leaves the live feed untouched.
==================================================
*/

import Simulator from '../../core/simulator';
import { buildLevels } from '../../data/gex';
import { h01, hGauss, hRange } from '../../core/rng';
import { storyUAtSceneEnd, storyUAtSceneStart } from './useTrailerTimeline';
import { expiryFor, fmtMonthDay, isTradingDay } from '../../core/calendar';
import { bsPriceAtT } from '../../components/compass/contractTrackModel';
import type { StrikeNode } from '../../types/market';
import type {
  ContractRow,
  DarkPoolRead,
  DarkPrint,
  DistributionBin,
  EarningsRead,
  GammaCell,
  GammaField,
  GreekRow,
  LottoRow,
  MetaorderRead,
  NewsRead,
  OptionPrint,
  PricePoint,
  ProveItRead,
  RankedLevel,
  ScannerRow,
  SetupCandidate,
  StockRow,
  StressCase,
  TrackerOutcome,
  TrackerPacket,
  TrailerStory,
} from './trailerTypes';

const TICKER = 'NVDA';
const SEED = 'slayer-trailer-v1';

/**
 * The session the film narrates.
 *
 * `STORY_SPOT` is the symbol's reference price, pinned rather than read live.
 * `STORY_REGIME_DAY` pins the day's positioning regime — the OI pivot, and so
 * the gamma flip. Left to today's date the flip wanders a strike and a half
 * either side of spot across the week, and on roughly one day in five it lands
 * *below* the level the story is about, which inverts the narrative: the film
 * would open in long gamma and the "pressure into the shelf" reading would
 * contradict the book underneath it. Naming the session is what a product film
 * does anyway; this makes it explicit instead of accidental.
 *
 * Chosen for the geometry the story needs: a short-gamma shelf a full percent
 * below spot, the flip between the two, and a book that nets short. Change
 * either constant and re-run `storyClock.test.ts` — it asserts that ordering.
 */
const STORY_SPOT = 138.6;
const STORY_REGIME_DAY = 20667;
/** The symbol's configured IV — the chain builder's, so a re-mark matches it. */
const STORY_IV = 0.35;

/**
 * The story's structural level sits at least this far below the open.
 *
 * The film is about price travelling down into a level and testing it. A level
 * inside the noise is not travelled into — it is where price already is.
 */
const MIN_APPROACH = 0.01;

/** Story seconds. The narrative window, not the trailer's runtime. */
const STORY_SECONDS = 2400; // a 40-minute stretch of session
const PATH_POINTS = 200;

const round = (v: number, dp = 2) => Number(v.toFixed(dp));
const clampUnit = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * The session clock, on New York's calendar.
 *
 * Pinned to 10:42 on the story's own day rather than `Date.now()`, so the
 * timestamp that travels the State Thread is a market time the viewer can read
 * against the narrative — and so two viewers watching at different hours see the
 * same film. The date advances with the calendar; only the time of day is fixed.
 *
 * The day is resolved in `America/New_York`, not the browser's zone. Built
 * locally it was a local date wearing an ET label: at Monday breakfast in Asia it
 * is still Sunday in New York, so the film picked Monday as its session instead
 * of rolling back to Friday — and every expiry, DTE and earnings date hung off
 * the wrong one. Same trap the HUD had, one layer down.
 */
function nyToday(): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (t: string) => Number(parts.find(p => p.type === t)!.value);
  return { y: get('year'), m: get('month'), d: get('day') };
}

function sessionDate(): Date {
  const { y, m, d } = nyToday();
  const out = new Date(y, m - 1, d, 10, 42, 0, 0);
  // A session, not a calendar day. Watched on a Saturday the film was stamped
  // 10:42 on a day the market never opened, and every DTE hung off it.
  for (let i = 0; i < 7 && !isTradingDay(out); i++) out.setDate(out.getDate() - 1);
  return out;
}

/**
 * The story's maturities, on one calendar.
 *
 * Every expiry label used to be a hard-coded string — 'AUG 15' at a hard-coded
 * 11 DTE, earnings on 'AUG 27' a hard-coded 12 days out — while the session date
 * came from the viewer's own clock. So the film showed a weekly 11 days away and
 * an event 12 days away that were in fact 13 and 25 days from the session it
 * claimed to be, and both got worse every day the calendar advanced.
 *
 * `expiryFor` is the app's own calendar: it walks to a real session, and reports
 * the DTE it actually lands on. Everything that names a maturity reads this, so
 * the labels and the day counts can no longer disagree — with each other or with
 * the session they hang off.
 */
interface StoryDates {
  session: Date;
  /**
   * The weekly the story trades.
   *
   * `dte` is CALENDAR days (what `expiryFor` reports and what the pricer wants);
   * `sessions` is trading days. Prove It's band is close-to-close, so it names
   * sessions — it used to print the calendar number under the word "sessions",
   * claiming 11 where the expiry has 7.
   */
  near: { label: string; dte: number; sessions: number };
  /** The short-dated rival the Weigher rejects. */
  short: { label: string; dte: number; sessions: number };
  /** The swing horizon Compass prices the event against. */
  far: { label: string; dte: number; sessions: number };
  /** Earnings — a date, not an expiry, but it still has to land on a session. */
  earnings: { label: string; dte: number; sessions: number };
}

function buildDates(): StoryDates {
  const session = sessionDate();
  const at = (dte: number) => {
    const e = expiryFor(dte, session);
    return { label: fmtMonthDay(e.date).toUpperCase(), dte: e.dte, sessions: e.sessions };
  };
  return { session, near: at(11), short: at(4), far: at(18), earnings: at(25) };
}

// ---- price path -------------------------------------------------------------
/**
 * Down into the level, chop on it, lift away.
 *
 * Shaped rather than sampled: the whole trailer is about one structural level
 * being approached, tested and held, and a free random walk tells that story
 * only by accident. The noise is seeded on top of a deliberate spine.
 *
 * The reclaim resolves against the flip rather than a fixed fraction of the
 * drop, because the regime read the film ends on is a fact about where the close
 * sits relative to the flip. Ending an arbitrary 62% of the way back left the
 * session closing under the flip while the last scene called the level held —
 * two statements about one moment, again disagreeing.
 */
function buildPath(spot0: number, level: number, flip: number): PricePoint[] {
  const out: PricePoint[] = [];
  const drop = spot0 - level;
  // Close just clear of the flip: the regime turns back on the way out, which is
  // the same sentence Pulse opens with, paid off.
  const reclaimTo = Math.min(spot0 - drop * 0.08, flip + drop * 0.1);
  const reclaimSpan = reclaimTo - level;
  // Noise is a fraction of the move it decorates, never a fraction of spot. Tied
  // to spot it was 0.055% while a cold-start put wall sat 0.022% away, so the
  // jitter was two and a half times the entire scripted approach and the path
  // read as a flat wobble instead of a level being tested.
  const jitter = Math.abs(drop) * 0.055;
  for (let i = 0; i < PATH_POINTS; i++) {
    const u = i / (PATH_POINTS - 1);
    let spine: number;
    if (u < 0.42) {
      // approach — decelerating into the level
      spine = spot0 - drop * Math.pow(u / 0.42, 0.78);
    } else if (u < 0.66) {
      // test — three probes below, each shallower than the last
      const v = (u - 0.42) / 0.24;
      spine = level - drop * 0.16 * Math.sin(v * Math.PI * 3) * (1 - v * 0.55);
    } else {
      // reclaim
      const v = (u - 0.66) / 0.34;
      spine = level + reclaimSpan * Math.pow(v, 1.35);
    }
    const noise = hGauss(`${SEED}-px-${i}`) * jitter;
    out.push({ t: u * STORY_SECONDS, px: round(spine + noise) });
  }
  return out;
}

const pxAt = (path: PricePoint[], t: number): number => {
  if (t <= path[0].t) return path[0].px;
  const last = path[path.length - 1];
  if (t >= last.t) return last.px;
  const span = last.t / (path.length - 1);
  const i = Math.min(path.length - 2, Math.floor(t / span));
  const f = (t - path[i].t) / (path[i + 1].t - path[i].t);
  return path[i].px + (path[i + 1].px - path[i].px) * f;
};

// ---- the level the whole film is about --------------------------------------
/**
 * The heaviest SHORT-gamma strike at least `MIN_APPROACH` below spot.
 *
 * `buildLevels().putWall` is argmax |net GEX| below spot, and on this book that
 * is a large POSITIVE node three cents under price. It is a real level and the
 * right answer to the question the product asks — but it is the wrong level for
 * this film twice over: nothing travels down into a level three cents away, and
 * a long-gamma node does not behave like the put wall the story then reasons
 * about. So the story picks the strike that actually carries the short gamma it
 * is describing. Everything downstream — the dark-pool shelf, Compass's setup,
 * the stop on the Tracker packet — refers back to this one price.
 *
 * Falls back to the deepest strike in the book if the whole sub-spot chain is
 * long gamma, which the pinned session is not, but a re-pin could be.
 */
function storyLevel(chain: StrikeNode[], spot: number): number {
  const ceiling = spot * (1 - MIN_APPROACH);
  let level = 0;
  let worst = 0;
  for (const n of chain) {
    if (n.strike <= ceiling && n.netGex < worst) {
      worst = n.netGex;
      level = n.strike;
    }
  }
  if (level > 0) return round(level);
  const below = chain.filter(n => n.strike <= ceiling).map(n => n.strike);
  return round(below.length ? Math.min(...below) : spot * (1 - MIN_APPROACH));
}

// ---- option prints ----------------------------------------------------------
function buildPrints(level: number, step: number, dates: StoryDates): OptionPrint[] {
  const parentStrike = round(Math.round((level + step * 2) / step) * step, 2);
  const expiry = dates.near.label;
  const out: OptionPrint[] = [];

  // Nine children of one sequence plus nine unrelated prints, interleaved. The
  // ratio matters as much as the count: a tape where every row belongs to the
  // same parent is not a tape, it is the answer printed out.
  const childTimes = [0, 6.4, 11.9, 18.2, 27.5, 33.1, 40.8, 47.6, 55.2];
  childTimes.forEach((at, i) => {
    const bid = round(2.18 + i * 0.06 + h01(`${SEED}-cb-${i}`) * 0.05);
    const ask = round(bid + 0.07 + h01(`${SEED}-ca-${i}`) * 0.04);
    out.push({
      id: `c${i}`,
      at,
      strike: parentStrike,
      right: 'C',
      expiry,
      dte: dates.near.dte,
      size: Math.round(hRange(`${SEED}-cs-${i}`, 240, 1450)),
      premium: 0,
      fill: round(hRange(`${SEED}-cf-${i}`, 0.86, 1), 3),
      bid,
      ask,
      oi: 4820,
      kind: i === 3 ? 'BLOCK' : i % 2 === 0 ? 'SWEEP' : 'SPLIT',
      lean: 'CALL-SIDE',
      leanConf: round(hRange(`${SEED}-cl-${i}`, 0.61, 0.79), 2),
      quoteAgeMs: Math.round(hRange(`${SEED}-cq-${i}`, 40, 260)),
      urgency: i === 3 ? 'FIRM' : 'AGGRESSIVE',
      child: true,
    });
  });

  const noiseTimes = [3.1, 9.2, 15.7, 21.8, 23.4, 30.6, 34.2, 44.1, 51.9];
  noiseTimes.forEach((at, i) => {
    const right = i % 2 === 0 ? 'P' : 'C';
    const strike = round(Math.round((level - step * (i + 1)) / step) * step, 2);
    const bid = round(1.02 + h01(`${SEED}-nb-${i}`) * 0.9);
    const ask = round(bid + 0.05 + h01(`${SEED}-na-${i}`) * 0.09);
    out.push({
      id: `n${i}`,
      at,
      strike,
      right,
      expiry: i === 1 ? dates.far.label : expiry,
      dte: i === 1 ? dates.far.dte : dates.near.dte,
      size: Math.round(hRange(`${SEED}-ns-${i}`, 25, 190)),
      premium: 0,
      fill: round(hRange(`${SEED}-nf-${i}`, 0.18, 0.72), 3),
      bid,
      ask,
      oi: Math.round(hRange(`${SEED}-no-${i}`, 400, 2600)),
      kind: 'BLOCK',
      lean: right === 'C' ? 'CALL-SIDE' : 'PUT-SIDE',
      leanConf: round(hRange(`${SEED}-nl-${i}`, 0.34, 0.52), 2),
      quoteAgeMs: Math.round(hRange(`${SEED}-nq-${i}`, 300, 1900)),
      urgency: 'PATIENT',
      child: false,
    });
  });

  out.sort((a, b) => a.at - b.at);
  for (const p of out) {
    p.premium = Math.round(p.size * (p.bid + (p.ask - p.bid) * p.fill) * 100);
  }
  return out;
}

// ---- scanner ----------------------------------------------------------------
function buildScanner(prints: OptionPrint[], ticker: string, spot: number, dates: StoryDates): ScannerRow[] {
  const ours = prints.find(p => p.child)!;
  const near = dates.near.label;
  const far = dates.far.label;
  const short = dates.short.label;
  const rows: ScannerRow[] = [
    {
      id: 'ours',
      label: `${ticker} ${ours.strike}C ${ours.expiry}`,
      premium: prints.filter(p => p.child).reduce((a, p) => a + p.premium, 0),
      volOi: 1.94,
      // Off the strike the sequence actually printed at, not a stand-in. The
      // scanner's own row is the one row a viewer can check against the tape
      // two scenes earlier.
      moneyness: round((ours.strike - spot) / spot, 4),
      dte: dates.near.dte,
      iv: 0.482,
      scoreFrom: 61,
      scoreTo: 88,
      state: 'LIVE READ',
      ours: true,
    },
    { id: 'r1', label: `AMD 168C ${near}`, premium: 1_940_000, volOi: 2.71, moneyness: 0.038, dte: dates.near.dte, iv: 0.516, scoreFrom: 84, scoreTo: 79, state: 'DECAYING', ours: false },
    { id: 'r2', label: `SMCI 44P ${short}`, premium: 1_120_000, volOi: 1.42, moneyness: -0.019, dte: dates.short.dte, iv: 0.694, scoreFrom: 77, scoreTo: 74, state: 'UNCONFIRMED', ours: false },
    { id: 'r3', label: `MU 118C ${far}`, premium: 880_000, volOi: 0.98, moneyness: 0.052, dte: dates.far.dte, iv: 0.441, scoreFrom: 72, scoreTo: 70, state: 'LIVE READ', ours: false },
    { id: 'r4', label: `AVGO 172C ${near}`, premium: 640_000, volOi: 0.77, moneyness: 0.011, dte: dates.near.dte, iv: 0.398, scoreFrom: 66, scoreTo: 63, state: 'UNCONFIRMED', ours: false },
    { id: 'r5', label: `INTC 22P ${near}`, premium: 410_000, volOi: 0.61, moneyness: -0.044, dte: dates.near.dte, iv: 0.552, scoreFrom: 58, scoreTo: 55, state: 'DECAYING', ours: false },
  ];
  return rows;
}

// ---- metaorder --------------------------------------------------------------
function buildMetaorder(prints: OptionPrint[]): MetaorderRead {
  const children = prints.filter(p => p.child);
  const total = children.reduce((a, p) => a + p.size, 0);
  return {
    childIds: children.map(p => p.id),
    windowSec: Math.round(children[children.length - 1].at - children[0].at),
    sharedStrike: children[0].strike,
    sharedExpiry: children[0].expiry,
    aggressorConsistency: 0.92,
    estimatedTotal: Math.round(total / 0.68),
    completedPct: 0.68,
    minutesRemaining: 14,
    // Deliberately a distribution, never a label. "Institutional" is not an
    // observation the tape can make.
    hypotheses: [
      { label: 'Single parent order', probability: 0.58 },
      { label: 'Correlated but separate takers', probability: 0.24 },
      { label: 'Delta hedge against stock', probability: 0.12 },
      { label: 'Opening spread leg', probability: 0.06 },
    ],
    invalidation: 'No further child within 6 min, or a same-strike bid-side print above 400 lots',
  };
}

// ---- dark pool --------------------------------------------------------------
function buildDarkPool(level: number, path: PricePoint[]): DarkPoolRead {
  const prints: DarkPrint[] = [];
  const venues = ['CONDITIONAL ATS', 'BANK ATS', 'AGENCY ATS', 'MIDPOINT ATS'];
  for (let i = 0; i < 9; i++) {
    const at = hRange(`${SEED}-dpa-${i}`, 0, STORY_SECONDS * 0.7);
    prints.push({
      at,
      px: round(level + hGauss(`${SEED}-dpp-${i}`) * level * 0.0008),
      notional: Math.round(hRange(`${SEED}-dpn-${i}`, 4.2e6, 61e6)),
      venue: venues[Math.floor(h01(`${SEED}-dpv-${i}`) * venues.length)],
    });
  }
  prints.sort((a, b) => a.at - b.at);
  const spotNow = path[path.length - 1].px;
  return {
    shelf: round(level),
    prints,
    shelfNotional: prints.reduce((a, p) => a + p.notional, 0),
    touches: 3,
    survivedTouches: 3,
    distancePct: round(((spotNow - level) / level) * 100, 2),
    state: 'ABSORPTION',
    // Every reading that fits, weighted — not one arrow.
    readings: [
      { label: 'Absorption', weight: 0.54 },
      { label: 'Unresolved', weight: 0.24 },
      { label: 'Pass-through', weight: 0.14 },
      { label: 'Rejection', weight: 0.08 },
    ],
  };
}

// ---- re-marking the book ----------------------------------------------------
/**
 * The session's open interest, marked at a later spot.
 *
 * Net GEX is `OI x 100 x gamma(spot) x spot^2 x 0.01 x dealer-direction`, so it
 * moves with spot even though the book behind it does not. The field was built
 * once at the session's reference price and then shown under a spot marker from
 * an hour later — an exposure surface for one market state with another state's
 * price drawn across it.
 *
 * Re-deriving the whole chain at the later spot is NOT the fix, and this is the
 * trap worth writing down: `generateOptionsChain` re-centres open interest on
 * whatever spot it is given, so a chain rebuilt at the tested shelf slides the
 * entire book down with price. Net GEX flips from −27M to +43M and the flip
 * follows spot, which would make it impossible for price to ever cross the
 * flip — the one thing this film is about.
 *
 * So: keep the session's OI, recompute gamma at the new spot, and reapply the
 * simulator's own dealer-direction weights. Fixed book, live mark.
 */
function remarkGex(chain: StrikeNode[], spot: number, ivAnnual: number): { strike: number; netGex: number }[] {
  const t = 0.003; // 0DTE, matching the chain builder
  return chain.map(n => {
    const g = Simulator.getGreeks(spot, n.strike, t, ivAnnual).gamma;
    const scale = 100 * g * spot * spot * 0.01;
    return { strike: n.strike, netGex: n.callOI.value * scale * 0.5 + n.putOI.value * scale * -0.6 };
  });
}

// ---- dealer field -----------------------------------------------------------
function buildGammaField(
  chain: { strike: number; netGex: number }[],
  levels: { callWall: number; putWall: number; flip: number; king: number },
  spot: number,
  dates: StoryDates,
): GammaField {
  // `spot` is the price the scene is standing at; `chain` is the session's book
  // already re-marked to it. The LEVELS stay the session's — walls and the flip
  // are where the open interest is, and open interest does not move because
  // price did. That is what makes "price crossed the flip" a thing that happens.
  const sorted = [...chain].sort((a, b) => a.strike - b.strike);
  const centre = sorted.reduce((best, n) => (Math.abs(n.strike - spot) < Math.abs(best.strike - spot) ? n : best), sorted[0]);
  const ci = sorted.indexOf(centre);
  const window = sorted.slice(Math.max(0, ci - 9), Math.max(0, ci - 9) + 19);
  const strikes = window.map(n => n.strike);
  // The same maturities the rest of the film trades, so the axis a viewer reads
  // here is the axis the Weigher prices against.
  const expiries = ['0DTE', '1D', `${dates.short.dte}D`, `${dates.near.dte}D`, `${dates.far.dte}D`];
  const cells: GammaCell[] = [];
  let maxAbs = 0;
  window.forEach(n => {
    expiries.forEach((_, e) => {
      // Near expiries carry most of the gamma; the far ones flatten out.
      const decay = Math.exp(-e * 0.42);
      const jitter = 0.72 + h01(`${SEED}-gx-${n.strike}-${e}`) * 0.56;
      const v = n.netGex * decay * jitter;
      maxAbs = Math.max(maxAbs, Math.abs(v));
      cells.push({ strike: n.strike, expiryIdx: e, netGex: v });
    });
  });
  return {
    strikes,
    expiries,
    cells,
    flip: levels.flip,
    callWall: levels.callWall,
    putWall: levels.putWall,
    king: levels.king,
    maxAbs: maxAbs || 1,
    // The honest caveat: dealer sign is inferred, and this read leans on it.
    signDependence: 0.71,
  };
}

// ---- levels / greeks / stress ----------------------------------------------
/**
 * The level board.
 *
 * Only the facts that do not move: the price, how hard it has reacted before,
 * how confident the read is, and how sensitive it is to the dealer-sign
 * assumption. Role and distance belong to the moment and are derived where they
 * are drawn.
 *
 * Coincident prices are merged. The king strike is regularly a wall as well, and
 * emitting it twice put one price on the board under two different roles — a
 * board disagreeing with itself about where support is.
 */
function buildRankedLevels(levels: { callWall: number; putWall: number; flip: number; king: number }): RankedLevel[] {
  const raw = [
    { price: levels.putWall, isFlip: false, reaction: 0.72, confidence: 0.81, sensitivity: 0.22 },
    { price: levels.flip, isFlip: true, reaction: 0.64, confidence: 0.66, sensitivity: 0.58 },
    { price: levels.king, isFlip: false, reaction: 0.58, confidence: 0.74, sensitivity: 0.31 },
    { price: levels.callWall, isFlip: false, reaction: 0.51, confidence: 0.69, sensitivity: 0.28 },
  ];
  const byPrice = new Map<string, RankedLevel>();
  for (const r of raw) {
    const price = round(r.price);
    const key = price.toFixed(2);
    const existing = byPrice.get(key);
    // A price that is both a wall and the king is one level carrying both facts:
    // keep the stronger confidence rather than emitting it twice.
    if (existing) {
      if (r.confidence > existing.confidence) {
        byPrice.set(key, { ...existing, reaction: r.reaction, confidence: r.confidence, sensitivity: r.sensitivity });
      }
      continue;
    }
    byPrice.set(key, { price, isFlip: r.isFlip, reaction: r.reaction, confidence: r.confidence, sensitivity: r.sensitivity });
  }
  return [...byPrice.values()].sort((a, b) => a.price - b.price);
}

/**
 * Exposure greeks.
 *
 * GEX is measured off the same chain the gamma field is built from. It used to be
 * a fixed -$412M, which on every cold-start draw contradicted the field beside it
 * — the cells summed positive and the thread read long gamma while the number
 * underneath said short. The rest are illustrative magnitudes and are labelled
 * modelled; GEX is the one the scene reasons about, so it is the one that has to
 * be real.
 */
function buildGreeks(netGex: number): GreekRow[] {
  return [
  { key: 'gex', label: 'GEX', now: netGex, drift: 0.34, unit: '$/1%' },
  { key: 'dex', label: 'DEX', now: 1.94e9, drift: -0.12, unit: '$' },
  { key: 'vex', label: 'VEX', now: -88e6, drift: 0.21, unit: '$/vol' },
  { key: 'cex', label: 'CEX', now: 24e6, drift: 0.44, unit: '$/day' },
  { key: 'vanna', label: 'VANNA', now: -61e6, drift: 0.28, unit: '$/vol·%' },
  { key: 'charm', label: 'CHARM', now: 39e6, drift: 0.52, unit: '$/day' },
  ];
}

const STRESS: StressCase[] = [
  { label: 'SPOT −0.5%', spotShock: -0.005, ivShock: 0, hoursForward: 0, hedgeFlow: -184e6, levelSurvives: true, note: 'Hedging sells into the level; the shelf absorbs it' },
  { label: 'SPOT −1.2%', spotShock: -0.012, ivShock: 0, hoursForward: 0, hedgeFlow: -496e6, levelSurvives: false, note: 'Below the flip the same hedge flow amplifies instead of absorbing' },
  { label: 'IV +2.0', spotShock: 0, ivShock: 0.02, hoursForward: 0, hedgeFlow: 92e6, levelSurvives: true, note: 'Vanna adds dealer length — the level firms' },
  { label: 'T +3h', spotShock: 0, ivShock: 0, hoursForward: 3, hedgeFlow: 141e6, levelSurvives: true, note: 'Charm migrates exposure toward the strike into the close' },
];

// ---- compass ----------------------------------------------------------------
function buildSetups(ticker: string, level: number, step: number, dates: StoryDates): SetupCandidate[] {
  const f = (key: string, label: string, value: number, weight: number) => ({ key, label, value, weight });
  return [
    {
      id: 'SU-1',
      label: `${ticker} reclaim of ${round(level)} shelf`,
      right: 'C',
      horizon: `WEEKLIES · ${dates.near.dte}D`,
      factors: [
        f('level', 'Level quality', 0.81, 0.24),
        f('flow', 'Flow corroboration', 0.74, 0.22),
        f('dealer', 'Dealer state', 0.58, 0.18),
        f('vol', 'Volatility state', 0.52, 0.14),
        f('data', 'Data quality', 0.88, 0.12),
        f('model', 'Model confidence', 0.63, 0.10),
      ],
      pTargetBeforeStop: 0.57,
      evAfterCosts: 0.128,
      expectedShortfall: -0.41,
      dataQuality: 0.88,
      modelConfidence: 0.63,
      invalidation: `Two closes below ${round(level - step * 2)} or the parent sequence stalling`,
      verdict: 'SELECTED',
    },
    {
      id: 'SU-2',
      label: `${ticker} momentum continuation`,
      right: 'C',
      horizon: `WEEKLIES · ${dates.short.dte}D`,
      factors: [
        f('level', 'Level quality', 0.44, 0.24),
        f('flow', 'Flow corroboration', 0.91, 0.22),
        f('dealer', 'Dealer state', 0.49, 0.18),
        f('vol', 'Volatility state', 0.38, 0.14),
        f('data', 'Data quality', 0.41, 0.12),
        f('model', 'Model confidence', 0.35, 0.10),
      ],
      pTargetBeforeStop: 0.54,
      evAfterCosts: -0.019,
      expectedShortfall: -0.72,
      dataQuality: 0.41,
      modelConfidence: 0.35,
      invalidation: 'Quote age exceeded the gate before entry could be priced',
      // The headline number is the best on the board and it still fails.
      verdict: 'REJECTED',
      rejectReason: 'DATA-QUALITY GATE · quotes stale beyond 1.5s at the size required',
    },
    {
      id: 'SU-3',
      label: `${ticker} fade into the call wall`,
      right: 'P',
      horizon: `WEEKLIES · ${dates.near.dte}D`,
      factors: [
        f('level', 'Level quality', 0.69, 0.24),
        f('flow', 'Flow corroboration', 0.28, 0.22),
        f('dealer', 'Dealer state', 0.62, 0.18),
        f('vol', 'Volatility state', 0.47, 0.14),
        f('data', 'Data quality', 0.83, 0.12),
        f('model', 'Model confidence', 0.44, 0.10),
      ],
      pTargetBeforeStop: 0.48,
      evAfterCosts: 0.021,
      expectedShortfall: -0.55,
      dataQuality: 0.83,
      modelConfidence: 0.44,
      invalidation: 'A close above the call wall',
      verdict: 'ALTERNATIVE',
    },
    {
      id: 'SU-4',
      label: `${ticker} straddle into the event`,
      right: 'C',
      horizon: `SWINGS · ${dates.far.dte}D`,
      factors: [
        f('level', 'Level quality', 0.36, 0.24),
        f('flow', 'Flow corroboration', 0.41, 0.22),
        f('dealer', 'Dealer state', 0.33, 0.18),
        f('vol', 'Volatility state', 0.71, 0.14),
        f('data', 'Data quality', 0.79, 0.12),
        f('model', 'Model confidence', 0.29, 0.10),
      ],
      pTargetBeforeStop: 0.41,
      evAfterCosts: -0.064,
      expectedShortfall: -0.88,
      dataQuality: 0.79,
      modelConfidence: 0.29,
      invalidation: 'Event premium already priced above the forecast move',
      verdict: 'REJECTED',
      rejectReason: 'NO EDGE · implied move exceeds the forecast move',
    },
  ];
}

// ---- weigher ----------------------------------------------------------------
/**
 * Five contracts on one thesis, priced and then ranked.
 *
 * Two things were wrong here and they were the same thing. The verdicts were
 * written into the table definition, above the code that computes utility — so
 * the row marked SELECTED was selected by an author, not by the ranking printed
 * beside it. And the numbers those verdicts were meant to follow from were
 * straight-line fits: premium fell linearly in moneyness, spread widened by row
 * index, theta was a constant per missing day. Ranking assertions against
 * assertions cannot disagree with itself, which is exactly why it could not be
 * trusted.
 *
 * So every row is now an actual option. `bsPriceAtT` is the app's own pricer —
 * the one Compass's contract track is pinned against — and every field comes out
 * of it: mid at the entry spot, exit at the target, expected shortfall at the
 * stop, theta as the value of one day. Utility is the probability-weighted
 * return net of execution, minus the liquidity penalty the scene's waterfall
 * names. Then it sorts, and the verdicts fall out of the sort.
 *
 * The scene's argument — the cheapest contract carries the highest headline
 * return and the worst utility — is therefore something the arithmetic produces,
 * not something the copy claims. If a re-pin ever stops producing it, the
 * ranking changes and the scene changes with it.
 */
function buildContracts(
  spot: number,
  level: number,
  step: number,
  target: number,
  stop: number,
  pModel: number,
  dates: StoryDates,
): ContractRow[] {
  const base = Math.round((level + step * 2) / step) * step;
  const near = dates.near;
  const short = dates.short;
  const defs: { k: number; dte: number; expiry: string; why: string }[] = [
    { k: base - step * 4, dte: near.dte, expiry: near.label, why: 'Most delta per dollar, and the most capital at risk per contract' },
    { k: base, dte: near.dte, expiry: near.label, why: 'Carries the thesis with the least given away to execution' },
    { k: base + step * 4, dte: near.dte, expiry: near.label, why: 'Struck at the target, so everything it is worth there is time value' },
    { k: base, dte: short.dte, expiry: short.label, why: 'Same strike, and almost nothing left if the reclaim is not immediate' },
    { k: base + step * 8, dte: near.dte, expiry: near.label, why: 'Struck beyond the target — the thesis alone does not pay for it' },
  ];

  // Winners resolve fast and losers grind: the target leg is marked one session
  // out, the stop leg four. That asymmetry is the whole reason a short-dated
  // contract is worse than its theta alone suggests — it is the leg that takes
  // time that kills it.
  const HORIZON_WIN = 1;
  const HORIZON_LOSS = 2;
  /*
    Calendar days over a calendar year.

    `expiryFor().dte` is measured in CALENDAR days, and this divided it by 252 —
    a trading-day year. That handed the pricer 11/252 of a year for an 11-day
    contract, about 45% more time than it has, which inflated every mid, greek,
    theta, target and stop mark, and therefore the utility ranking the scene is
    built on. `contractTrackModel` documents the same trap: 252 and 365 are two
    different clocks and `dte * 252/365` is the only bridge between them.
  */
  const YEAR = 365;
  // The setup's own probability of reaching the target before the stop — the
  // desk's claimed edge, the same number Compass shows. It is a property of the
  // underlying, so it is the same for all five; what differs is what each
  // contract is worth in each case.
  const p = clampUnit(pModel);

  const priced: ContractRow[] = defs.map((d, i) => {
    const otm = Math.max(0, (d.k - spot) / spot);
    const iv = round(0.44 + otm * 4.2, 3); // skew: downside-funded calls bid up out of the money
    const tNow = d.dte / YEAR;
    const tWin = Math.max(0.5, d.dte - HORIZON_WIN) / YEAR;
    const tLoss = Math.max(0.5, d.dte - HORIZON_LOSS) / YEAR;

    const mid = round(bsPriceAtT(spot, d.k, iv, tNow, 'C'));
    // Absolute spread, floored at a penny and widening away from the money —
    // which is what makes a cheap contract expensive to trade, in percent.
    const spreadAbs = round(Math.max(0.02, 0.03 + otm * 3.6 + Math.max(0, near.dte - 3 - d.dte) * 0.012));
    const bid = round(Math.max(0.01, mid - spreadAbs / 2));
    const ask = round(mid + spreadAbs / 2);
    const spreadPct = round(spreadAbs / mid, 3);
    const executionCost = round((spreadAbs / 2 + 0.01) / mid, 3);

    const g = Simulator.getGreeks(spot, d.k, tNow, iv);
    const oneDayLess = bsPriceAtT(spot, d.k, iv, Math.max(0.5, d.dte - 1) / YEAR, 'C');

    // Marked at the target and at the stop, each on its own clock.
    const physicalExit = round(bsPriceAtT(target, d.k, iv, tWin, 'C'));
    const atStop = bsPriceAtT(stop, d.k, iv, tLoss, 'C');
    const returnAtTarget = round((physicalExit - mid) / mid - executionCost, 3);
    const expectedShortfall = round((atStop - mid) / mid - executionCost, 3);

    const liquidityRisk = round(clampUnit(0.1 + otm * 22 + spreadPct * 1.4 + Math.max(0, near.dte - 3 - d.dte) * 0.05), 2);
    const utility = round(p * returnAtTarget + (1 - p) * expectedShortfall - liquidityRisk * 0.22, 3);

    return {
      id: `K${d.k}-${d.expiry}`,
      strike: round(d.k),
      right: 'C',
      expiry: d.expiry,
      dte: d.dte,
      bid,
      ask,
      mid,
      spreadPct,
      quoteAgeMs: Math.round(hRange(`${SEED}-cq2-${i}`, 60, 620)),
      // Open interest and volume concentrate at the money and thin out from
      // there, which is what the liquidity column is reading.
      oi: Math.round(400 + 7600 * Math.exp(-Math.pow(((d.k - spot) / spot) * 26, 2))),
      volume: Math.round(180 + 5200 * Math.exp(-Math.pow(((d.k - spot) / spot) * 22, 2)) * (d.dte >= near.dte - 3 ? 1 : 0.55)),
      delta: round(g.deltaCall, 3),
      gamma: round(g.gamma, 4),
      vega: round(g.vega, 3),
      theta: round(oneDayLess - mid, 3),
      iv,
      breakeven: round(d.k + mid),
      physicalExit,
      executionCost,
      returnAtTarget,
      expectedShortfall,
      utility,
      liquidityRisk,
      verdict: 'ALTERNATIVE' as ContractRow['verdict'],
      why: d.why,
    };
  });

  // Rank on utility — the column the scene shows — then label. Top row wins;
  // anything with negative utility is rejected outright rather than presented as
  // a live alternative; the rest are the runners-up the Tracker scores against.
  const ranked = [...priced].sort((a, b) => b.utility - a.utility);
  ranked.forEach((row, rank) => {
    row.verdict = rank === 0 ? 'SELECTED' : row.utility <= 0 ? 'REJECTED' : 'ALTERNATIVE';
  });
  return priced;
}

// ---- lotto ------------------------------------------------------------------
/**
 * Far strikes, gated on the probability the desk requires.
 *
 * ONE horizon: the rest of the session. The caveat used to name two in a single
 * sentence — "over the remaining session" and "horizon is expiration" — while the
 * verdict came from a field called `pTargetBeforeExpiry` that `buildLotto` had no
 * expiry to compute. For a multi-day contract those are materially different
 * events, and the scene's own chart ("what the session can still deliver, N min
 * to cutoff") only ever meant one of them.
 *
 * The gate is a number, not a mood, and it is stated on screen beside the
 * probability it gates.
 */
export const LOTTO_P_GATE = 0.06;

function buildLotto(spot: number, step: number): LottoRow[] {
  const defs = [
    { k: Math.round((spot + step * 2) / step) * step, why: 'Reachable inside the session on the modelled path' },
    { k: Math.round((spot + step * 6) / step) * step, why: 'Needs a move in the top decile of the modelled intraday range' },
    { k: Math.round((spot + step * 12) / step) * step, why: 'Cheapest on the board; the required path is a tail, not a drift' },
  ];
  return defs.map((d, i) => {
    const required = (d.k - spot) / spot;
    const ask = round(Math.max(0.04, 1.9 * Math.exp(-required * 74)), 2);
    const pTargetBeforeClose = round(Math.max(0.003, 0.38 * Math.exp(-required * 104)), 3);
    return {
      id: `L${i}`,
      strike: round(d.k),
      ask,
      breakevenMove: round((required + ask / spot) * 100, 2),
      requiredMove: round(required * 100, 2),
      pFirstPassage: round(Math.max(0.005, 0.46 * Math.exp(-required * 96)), 3),
      pTargetBeforeClose,
      thetaBurnPerHour: round(ask * (0.11 + i * 0.05), 3),
      spreadCost: round(0.03 + i * 0.05, 3),
      terminalLiquidity: round(Math.max(0.05, 0.82 - i * 0.31), 2),
      pinRisk: round(0.18 + i * 0.09, 2),
      maxLoss: 1,
      verdict: pTargetBeforeClose >= LOTTO_P_GATE ? ('CONSIDERED' as const) : ('NO TRADE' as const),
      why: d.why,
    };
  });
}

// ---- prove it ---------------------------------------------------------------
function buildProveIt(spot: number, dates: StoryDates): ProveItRead {
  const bins: DistributionBin[] = [];
  const lo = spot * 0.955;
  const hi = spot * 1.055;
  for (let i = 0; i < 34; i++) {
    const px = lo + ((hi - lo) * i) / 33;
    const zP = (px - spot * 1.004) / (spot * 0.017);
    const zQ = (px - spot * 1.0) / (spot * 0.0205);
    bins.push({
      px: round(px),
      physical: Math.exp(-0.5 * zP * zP),
      // Risk-neutral is wider and centred lower — the two are not the same claim.
      riskNeutral: Math.exp(-0.5 * zQ * zQ) * 0.94,
    });
  }
  const calibration: ProveItRead['calibration'] = [];
  for (let i = 1; i <= 9; i++) {
    const p = i / 10;
    calibration.push({ predicted: p, observed: round(p + hGauss(`${SEED}-cal-${i}`) * 0.035, 3) });
  }
  return {
    bins,
    calibration,
    expectedLow: round(spot * 0.982),
    expectedHigh: round(spot * 1.026),
    tailProb: 0.041,
    horizonLabel: `Close-to-close, ${dates.near.sessions} sessions, ±1σ band`,
    models: [
      { name: 'gex-drift v4', role: 'CHAMPION', crps: 0.0184, calibrationErr: 0.021, economicValue: 0.061, walkForward: 0.58, promoted: true, gate: 'IN PRODUCTION' },
      { name: 'flow-attn v1', role: 'CHALLENGER', crps: 0.0179, calibrationErr: 0.048, economicValue: 0.012, walkForward: 0.51, promoted: false, gate: 'FAILED · calibration error above 0.03 gate' },
      { name: 'vol-carry v2', role: 'CHALLENGER', crps: 0.0201, calibrationErr: 0.026, economicValue: 0.034, walkForward: 0.54, promoted: false, gate: 'FAILED · economic value below champion after costs' },
    ],
  };
}

// ---- stocks / news / earnings ----------------------------------------------
function buildStocks(ticker: string): StockRow[] {
  const rows: StockRow[] = [
    { ticker, momentum: 0.74, quality: 0.68, flow: 0.88, news: 0.52, composite: 0.76, sector: 'SEMIS', relStrength: 0.81, offExchange: 0.63, routing: 'OPTIONS', ours: true },
    { ticker: 'AMD', momentum: 0.66, quality: 0.51, flow: 0.71, news: 0.44, composite: 0.62, sector: 'SEMIS', relStrength: 0.69, offExchange: 0.48, routing: 'STOCK', ours: false },
    { ticker: 'AVGO', momentum: 0.58, quality: 0.79, flow: 0.42, news: 0.38, composite: 0.57, sector: 'SEMIS', relStrength: 0.61, offExchange: 0.39, routing: 'SPREAD', ours: false },
    { ticker: 'MU', momentum: 0.49, quality: 0.44, flow: 0.55, news: 0.61, composite: 0.51, sector: 'SEMIS', relStrength: 0.47, offExchange: 0.51, routing: 'STOCK', ours: false },
    { ticker: 'INTC', momentum: 0.22, quality: 0.31, flow: 0.28, news: 0.34, composite: 0.27, sector: 'SEMIS', relStrength: 0.19, offExchange: 0.24, routing: 'NO TRADE', ours: false },
  ];
  return rows;
}

/**
 * The news cluster, stamped inside the story time it is shown in.
 *
 * The four items used to be stamped at 0/42/96/158 seconds while the News scene
 * advances the session by 48 — so the feed printed a headline at +158s in a
 * window the clock never reached, and the contradiction that drives the
 * repricing arrived a third of the way through the scene having supposedly
 * happened two and a half minutes in. The cadence (a filing, a fast syndication,
 * a slower note, a late contradiction) is what matters; the absolute seconds
 * were never load-bearing, so they are laid out across the window the scene
 * actually has.
 */
function buildNews(windowSec: number): NewsRead {
  // The last item lands with room to spare: the contradiction is the cause, and
  // the scene still has to show its effect on the distribution.
  const beats = [0, 0.2, 0.45, 0.7];
  const at = (i: number) => Math.round(beats[i] * windowSec);
  return {
    // Sources are described by type, never by a fabricated masthead.
    items: [
      { at: at(0), source: 'Exchange filing', headline: 'Supply agreement expanded with a top-3 cloud customer', catalyst: 'GUIDANCE-ADJACENT', novelty: 0.81, duplicates: 0, contradiction: false },
      { at: at(1), source: 'Newswire summary', headline: 'Same agreement, syndicated', catalyst: 'GUIDANCE-ADJACENT', novelty: 0.12, duplicates: 6, contradiction: false },
      { at: at(2), source: 'Sell-side note', headline: 'Estimate raised on the same agreement', catalyst: 'ESTIMATE REVISION', novelty: 0.34, duplicates: 2, contradiction: false },
      { at: at(3), source: 'Trade press', headline: 'Channel check reads capacity as unchanged', catalyst: 'SUPPLY', novelty: 0.58, duplicates: 0, contradiction: true },
    ],
    driftBefore: 0.004,
    driftAfter: 0.0061,
    widthBefore: 0.017,
    widthAfter: 0.0206,
    confidence: 0.44,
  };
}

function buildEarnings(spot: number, dates: StoryDates): EarningsRead {
  const straddle = round(spot * 0.078);
  return {
    date: dates.earnings.label,
    daysAway: dates.earnings.dte,
    timeConfirmed: false,
    session: 'AFTER CLOSE (estimated)',
    straddleCost: straddle,
    impliedMovePct: round((straddle / spot) * 100, 2),
    realizedMedianPct: 6.4,
    forecastMovePct: 6.9,
    ivCrush: 0.38,
    pDirection: 0.52,
    pMagnitude: 0.61,
    structures: [
      { label: 'LONG VOL', verdict: 'AGAINST', note: 'Implied move sits above both the realized median and the forecast' },
      { label: 'SHORT VOL', verdict: 'NEUTRAL', note: 'Edge is real but thin once crush timing risk is priced' },
      { label: 'DIRECTIONAL', verdict: 'AGAINST', note: 'Direction probability is a coin flip; magnitude is the only signal' },
      { label: 'WAIT FOR DAY TWO', verdict: 'FAVOURED', note: 'Post-event continuation has the only measured edge here' },
      { label: 'NO EDGE', verdict: 'NEUTRAL', note: 'Valid outcome; the desk is not required to have a position' },
    ],
    selected: 'WAIT FOR DAY TWO',
  };
}

// ---- tracker ----------------------------------------------------------------
/**
 * Freeze the decision, advance the market, score what was not taken.
 *
 * The counterfactuals used to be four hand-written numbers. They are now the four
 * contracts the Weigher did not pick, marked at the price the market actually
 * reached — the same pricer, the same skew, the same horizon. That is the only
 * version of this scene worth showing: the alternatives have to be able to win,
 * or "we scored the road not taken" is set dressing. `better` is computed, so if
 * a re-pin ever makes a rejected contract the right one, the scene says so.
 */
function buildTracker(
  ticker: string,
  setup: SetupCandidate,
  contracts: ContractRow[],
  level: number,
  /** Spot at the instant the packet freezes — NOT the session close. */
  freezeSpot: number,
  target: number,
  stop: number,
  start: number,
): { packet: TrackerPacket; outcome: TrackerOutcome } {
  const contract = contracts.find(c => c.verdict === 'SELECTED')!;
  const others = contracts.filter(c => c !== contract);
  const packet: TrackerPacket = {
    id: 'TR-4417',
    // The instant the Tracker scene opens, not the end of the session. Pinning it
    // to the end of the story meant the HUD read 11:17 while the packet claimed a
    // freeze at 11:22 — and the scene was already showing the outcome of a
    // decision that had not been taken yet.
    frozenAt: start + storyUAtSceneStart('tracker') * STORY_SECONDS * 1000,
    ticker,
    setupId: setup.id,
    contractId: contract.id,
    entry: contract.mid,
    stop,
    target,
    level: round(level),
    ev: setup.evAfterCosts,
    expectedShortfall: setup.expectedShortfall,
    dataQuality: setup.dataQuality,
    modelVersion: 'gex-drift v4',
    invalidation: setup.invalidation,
    alternatives: [...others.map(c => c.id), 'SU-3'],
  };

  // The market after the freeze, starting at the freeze. It used to start at the
  // session close — a price from later than the decision — so the "after the
  // freeze" chart opened ahead of the packet it was scoring, and every
  // counterfactual was marked from a path that began after the moment it claimed
  // to begin at.
  //
  // The window is the Tracker scene's own, and the marks decay by exactly that.
  //
  // Two corrections live here. The marks used to remove a full calendar day while
  // the HUD advanced 96 seconds and never left the session, which overstated theta
  // everywhere and worst on the short-dated row. Then the window was the rest of
  // the session (168s) while the scene only covers 96 — so the chart could reach a
  // price the clock had not, and the counterfactual scores landed before the
  // moment they were measured at. The modelled interval and the scene are the same
  // interval now, and the scene reveals against it.
  const outcomeDays =
    ((storyUAtSceneEnd('tracker') - storyUAtSceneStart('tracker')) * STORY_SECONDS) / 86400;
  const targetProgress = 0.82;
  const finalPx = freezeSpot + (target - freezeSpot) * targetProgress;
  const path: PricePoint[] = [];
  for (let i = 0; i < 60; i++) {
    const u = i / 59;
    const spine = freezeSpot + (finalPx - freezeSpot) * Math.pow(u, 1.2);
    // Noise fades in from the freeze, so the first point IS the freeze price
    // rather than a tick either side of it.
    path.push({ t: u, px: round(spine + hGauss(`${SEED}-out-${i}`) * freezeSpot * 0.0016 * Math.min(1, u * 6)) });
  }

  // Every contract marked at the price the market reached, one session of decay
  // paid on the way.
  const markAt = (c: ContractRow) => {
    // Calendar days over a calendar year — see `buildContracts`.
    const t = Math.max(0.05, c.dte - outcomeDays) / 365;
    return round((bsPriceAtT(finalPx, c.strike, c.iv, t, 'C') - c.mid) / c.mid - c.executionCost, 3);
  };
  const taken = markAt(contract);

  return {
    packet,
    outcome: {
      path,
      targetProgress,
      invalidationRisk: 0.14,
      survived: true,
      outcome: 'CLOSED ON RULE',
      counterfactuals: [
        ...others.map(c => ({
          label: `${c.strike}C ${c.expiry}${c.dte < 8 ? ' (shorter dated)' : ''}`,
          result: markAt(c),
          better: markAt(c) > taken,
        })),
        // The setup that was not taken, not a contract — scored on its own terms.
        { label: 'SU-3 fade the call wall', result: -0.31, better: false },
      ],
      attribution: [
        { label: 'Level quality', contribution: 0.41 },
        { label: 'Flow corroboration', contribution: 0.28 },
        { label: 'Contract selection', contribution: 0.19 },
        { label: 'Dealer state', contribution: 0.07 },
        { label: 'Volatility state', contribution: -0.05 },
      ],
      // One outcome is one sample. It updates a weight; it does not crown a model.
      learning: 'LEARN',
      learningNote:
        'One outcome updates the level-quality weight inside its prior. Promotion still requires the walk-forward gate, not this trade.',
    },
  };
}

// ---- assembly ---------------------------------------------------------------
let cached: TrailerStory | null = null;
/**
 * The session day the cached story belongs to.
 *
 * The memo holds `sessionStart`, every expiry label, every DTE and the earnings
 * date — all resolved from New York's calendar at first build. A tab left open
 * across an ET midnight or a weekend and returned to would replay the previous
 * day's session and maturities as if they were today's. Keyed by the day, the
 * memo still returns the same object for every replay within it.
 */
let cachedDay = '';

/**
 * Build (and memoize) the story.
 *
 * Memoized because replaying the trailer must show the same film — and because
 * `Simulator.buildSnapshot` advances the simulator's own RNG, so calling it per
 * mount would drift the chain out from under a viewer who hit Replay.
 */
export function buildTrailerStory(): TrailerStory {
  const { y, m, d } = nyToday();
  const day = `${y}-${m}-${d}`;
  if (cached && cachedDay === day) return cached;
  cachedDay = day;

  const snapshot = Simulator.buildSnapshotAt(TICKER, STORY_SPOT, STORY_REGIME_DAY);
  const raw = buildLevels(snapshot);
  const spot0 = snapshot.spot;
  // The story happens at the short-gamma shelf: the one structural level every
  // desk in the trailer refers back to. It replaces the put wall on the board
  // rather than sitting beside it — a level board carrying both would be
  // offering two different answers to "where is support".
  const level = storyLevel(snapshot.chain, spot0);
  const levels = { callWall: round(raw.callWall), putWall: level, flip: round(raw.flip), king: round(raw.king) };
  // Net GEX is a live mark too: the Levels scene reads it beside its own spot.
  const netGex = (spot: number) => remarkGex(snapshot.chain, spot, STORY_IV).reduce((a, n) => a + n.netGex, 0);
  const step = Math.max(0.5, round((levels.callWall - levels.putWall) / 12, 1));

  const path = buildPath(spot0, level, levels.flip);
  const spotNow = path[path.length - 1].px;
  // The setup plays from the shelf to the call wall and dies below the shelf.
  // Both prices are structural, not percentages of one — every contract is
  // marked against them, so the Weigher, the packet and the Tracker's
  // counterfactuals are all scored on the same two numbers.
  const target = levels.callWall;
  const stop = round(level - (spot0 - level) * 0.4);
  // Contracts are priced at the spot the Weigher scene actually shows, not at
  // the open. Priced at the open, the packet's entry was a price that had not
  // been available for half an hour of story time while the HUD beside it read
  // the current one.
  const entrySpot = round(pxAt(path, storyUAtSceneStart('weigher') * STORY_SECONDS));
  // Same discipline at the other end: the Tracker's forward path starts at the
  // price on the tape when the packet froze.
  const freezeSpot = round(pxAt(path, storyUAtSceneStart('tracker') * STORY_SECONDS));
  // Every desk is modelled at the price its own scene shows. Built from the
  // session close, Lotto struck its ladder off a future price and Prove It
  // centred its distributions on one, while the live spot marker drawn over them
  // came from the story clock — the same disagreement, two scenes further on.
  const spotAtScene = (id: string) => round(pxAt(path, storyUAtSceneStart(id) * STORY_SECONDS));
  const gammaSpot = spotAtScene('gamma');
  const dates = buildDates();
  const prints = buildPrints(level, step, dates);
  const setups = buildSetups(TICKER, level, step, dates);
  const selectedSetup = setups.find(s => s.verdict === 'SELECTED')!;
  const contracts = buildContracts(entrySpot, level, step, target, stop, selectedSetup.pTargetBeforeStop, dates);
  const start = dates.session.getTime();
  const { packet, outcome } = buildTracker(TICKER, selectedSetup, contracts, level, freezeSpot, target, stop, start);

  // The news cluster has to land inside the story time the News scene occupies —
  // stamped across 158 seconds and shown in a 48-second window, the feed was
  // printing headlines the session clock had not reached.
  const newsWindow = (storyUAtSceneEnd('news') - storyUAtSceneStart('news')) * STORY_SECONDS;

  cached = {
    ticker: TICKER,
    sessionStart: start,
    level,
    spot0,
    path,
    levels,
    prints,
    scanner: buildScanner(prints, TICKER, spotAtScene('scanner'), dates),
    metaorder: buildMetaorder(prints),
    darkPool: buildDarkPool(level, path),
    gamma: buildGammaField(remarkGex(snapshot.chain, gammaSpot, STORY_IV), levels, gammaSpot, dates),
    rankedLevels: buildRankedLevels(levels),
    greeks: buildGreeks(netGex(spotAtScene('levels'))),
    stress: STRESS,
    setups,
    contracts,
    lotto: buildLotto(spotAtScene('lotto'), step),
    scalp: { horizonMin: 25, pTargetBeforeStop: 0.61, spreadCost: 0.019, quoteStability: 0.84, gammaEfficiency: 0.72, minutesToCutoff: 38 },
    rebound: { touch: level, displacement: -1.9, absorption: 0.68, flowReversal: 0.57, dealerSupport: 0.63, excursion: 1.4, invalidation: round(level * 0.988) },
    proveIt: buildProveIt(spotAtScene('proveit'), dates),
    stocks: buildStocks(TICKER),
    news: buildNews(newsWindow),
    earnings: buildEarnings(spotNow, dates),
    packet,
    outcome,
  };
  return cached;
}

/** Test/HMR escape hatch — drops the memo so the next build re-derives. */
export function resetTrailerStory(): void {
  cached = null;
  cachedDay = '';
}

/** Spot at a point in the story window, from the one shaped path. */
export function spotAt(story: TrailerStory, storySec: number): number {
  return pxAt(story.path, storySec);
}

export { STORY_SECONDS };
