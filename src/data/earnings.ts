/*
==================================================
  SLAYER TERMINAL - EARNINGS ENGINE (earnings.ts)
  The earnings hub's brain: for every upcoming
  report, price the implied move against the record
  the model generates for the name, weigh revisions,
  flow and technicals, and land on PLAY / FADE / SKIP
  with the structure that matches the mispricing.
==================================================
*/

import { dayKey, hGauss, h01, hRange } from '../core/rng';
import { expiryFor, fmtExpiryShort } from '../core/calendar';
import { UNIVERSE } from './universe';
import type { Sector } from './universe';
import type { Tone } from '../components/ui/tones';
// Type-only, so there is no runtime edge back from earningsintel.ts (which
// imports EarningsEvent from here). The plays builder takes the intel view as
// an argument rather than calling for it, which keeps the module graph acyclic.
import type { EarningsIntelView } from './earningsintel';

export type EarningsVerdict = 'PLAY' | 'FADE' | 'SKIP';
export type ReportSlot = 'BMO' | 'AMC';

/**
 * Observational labels, same rule as `compass/verdict.ts` and the Stocks board:
 * the engine keeps PLAY/FADE/SKIP, every screen states the condition.
 *
 * PLAY deliberately does NOT map to a price word — it fires on three different
 * conditions (rich premium with strong direction, cheap premium, fair premium
 * with direction), so anything about the premium would be wrong for two of the
 * three. What all three share is that a defined structure qualifies. FADE is the
 * one branch that IS a premium statement (richness >= 1.3 with no direction),
 * and SKIP is the absence of an edge.
 *
 * It lives beside the union rather than on the earnings board because the board
 * is not the only surface that renders a verdict, and the surfaces that had
 * nothing to render through printed the union itself — the engine word "PLAY"
 * put on screen as an order, which is the one thing the map exists to prevent.
 * Type-only import of `Tone`, so nothing from the component layer survives into
 * the bundle here.
 */
export const VERDICT_LABEL: Record<EarningsVerdict, string> = {
  PLAY: 'QUALIFIED',
  FADE: 'RICH',
  SKIP: 'NO EDGE',
};

// A verdict is a process state, so it takes the chrome tones — see the rule in
// compass/setupState.ts. QUALIFIED = silver (a structure qualifies), RICH =
// amber caution (premium favours the seller), NO EDGE = grey. Magenta stays
// reserved for the king/standout signal, not a verdict.
export const VERDICT_TONE: Record<EarningsVerdict, Tone> = {
  PLAY: 'select',
  FADE: 'warn',
  SKIP: 'neutral',
};

export interface EarningsEvent {
  ticker: string;
  name: string;
  sector: Sector;
  price: number;
  /** Sessions until the report, 0 = today */
  daysOut: number;
  dateLabel: string;
  slot: ReportSlot;
  /** Straddle-implied move for the print, % */
  impliedMovePct: number;
  /** Mean absolute reaction across the name's eight `printHistory` reports, % */
  histAvgMovePct: number;
  /** implied ÷ the generated record — the mispricing everything hangs on */
  richness: number;
  /** Share of those eight reports that cleared consensus, % — counted, not drawn */
  beatRate8q: number;
  /** −1…+1 — analyst estimate drift into the print */
  revisionTrend: number;
  ivRank: number;
  /** 0–100 setup quality into the report */
  technicalScore: number;
  /** −1…+1 — options flow lean into the event */
  flowLean: number;
  verdict: EarningsVerdict;
  /** The structure the mispricing describes, stated — never a ticket to place */
  strategy: string;
  rationale: string;
}

// ---- the record the implied move is priced against -----------------------------
/*
  `histAvgMovePct` and `beatRate8q` used to be flat draws — a 2.2–9.5% uniform
  scaled by beta, and a beat rate rounded to eighths — and were then printed as
  the name's own record: "realized", "avg of last 8", "the % it actually
  averages". A reader sizes a print off that number, and nothing had measured
  anything. The beat rate was the subtler half: rounding to 12.5% steps made the
  figure LOOK counted out of eight quarters, so it read as evidence while the
  engine had never counted a quarter.

  Both are now measured over the eight reports `printHistory` generates from one
  reaction model — a surprise against guidance, an amplitude that grows with it,
  and the name's own reaction sensitivity. Change an assumption here and every
  figure quoted off it moves with it, which is the contract news.ts's base rates
  keep for the wire.

  Seeded per ticker only, not per session: last quarter's report does not print
  again because a day passed, and a record that re-rolled nightly would not be a
  record. Today's PRICING of it — richness, and therefore the implied move —
  still re-rolls daily, which is the half that genuinely changes overnight.
*/

/** Reports the record is measured over — two years of quarters. */
const HISTORY_PRINTS = 8;
/** Reaction a beta-1 name makes on a report that lands on consensus, % */
const INLINE_REACTION_PCT = 2.4;
/** Additional reaction per unit of standardized surprise, % */
const SURPRISE_GAIN_PCT = 4.4;
/** Guidance is set to be cleared: the share of reports the model expects to clear it. */
const BEAT_PRIOR = 0.66;

/** One generated report in a name's record. */
export interface PastPrint {
  /** 1 = the most recent report, 8 = two years back */
  quartersBack: number;
  /** Standardized surprise against consensus. + = cleared it */
  surprise: number;
  /** Absolute price reaction the session after, % */
  movePct: number;
}

export interface PrintHistory {
  prints: PastPrint[];
  /** Mean absolute reaction across them, % */
  avgMovePct: number;
  /** Share that cleared consensus, % */
  beatRatePct: number;
}

const historyCache = new Map<string, PrintHistory>();

/**
 * The name's generated reporting record. Every reader of `histAvgMovePct` and
 * `beatRate8q` is reading a statistic of THIS, so the two can never drift apart
 * the way two independent draws would.
 *
 * Beta is read from UNIVERSE here rather than taken as an argument: the record
 * is cached per ticker, so a second caller passing its own beta would have
 * silently received the first caller's record and believed it was its own. One
 * name has one record. An unlisted ticker gets the market's beta of 1.
 */
export function printHistory(ticker: string): PrintHistory {
  const cached = historyCache.get(ticker);
  if (cached) return cached;
  const s = (tag: string) => `${ticker}-er-record-${tag}`;
  const beta = UNIVERSE.find(u => u.ticker === ticker)?.beta ?? 1;

  // Two per-name parameters drawn once and held across the quarters: how hard
  // the name reacts to its own prints, and how conservatively it guides. Without
  // them an average of eight draws collapses every name onto the same number,
  // and the board stops distinguishing a 3% mover from a 9% one.
  const sensitivity = hRange(s('sens'), 0.72, 1.5) * (0.7 + beta * 0.35);
  const beatLean = hRange(s('lean'), -0.18, 0.18);
  const clearRate = Math.max(0.2, Math.min(0.9, BEAT_PRIOR + beatLean));

  const prints: PastPrint[] = [];
  for (let q = 1; q <= HISTORY_PRINTS; q++) {
    // Uniform, shifted so the expected share landing above consensus is
    // `clearRate`. The beat rate below then COUNTS what the shift produced
    // rather than restating the assumption, so eight quarters can and do come
    // in under it.
    const surprise = (h01(s(`sur${q}`)) + clearRate - 1) * 2;
    prints.push({
      quartersBack: q,
      surprise,
      movePct: (INLINE_REACTION_PCT + SURPRISE_GAIN_PCT * Math.abs(surprise)) * sensitivity,
    });
  }

  const built: PrintHistory = {
    prints,
    avgMovePct: prints.reduce((a, p) => a + p.movePct, 0) / prints.length,
    beatRatePct: (prints.filter(p => p.surprise > 0).length / prints.length) * 100,
  };
  historyCache.set(ticker, built);
  return built;
}

/** Companies report on trading days, so a raw "N days out" draw has to be
    resolved to a real session — and `daysOut` re-derived from it, or the
    countdown and the printed weekday disagree. */
function reportDate(rawDaysOut: number): { daysOut: number; dateLabel: string } {
  const e = expiryFor(rawDaysOut);
  return { daysOut: e.dte, dateLabel: `${e.weekday} ${fmtExpiryShort(e.date)}` };
}

/** Which way each directional sleeve points, and how many agree. */
export interface DirectionVote {
  /** −1 / 0 / +1 per sleeve */
  rev: number;
  flow: number;
  setup: number;
  /** Sum of the three */
  net: number;
  /** How many of the three point the same way */
  aligned: number;
}

/**
 * The directional tally, derived once. The verdict engine and the board's
 * conviction chips both cut revisions/flow/setup at the same three thresholds,
 * and each kept its own copy — nudging one would have left the screen showing
 * chips that disagreed with the verdict beside them.
 */
export function directionVote(e: Pick<EarningsEvent, 'revisionTrend' | 'flowLean' | 'technicalScore'>): DirectionVote {
  const rev = e.revisionTrend > 0.15 ? 1 : e.revisionTrend < -0.15 ? -1 : 0;
  const flow = e.flowLean > 0.2 ? 1 : e.flowLean < -0.2 ? -1 : 0;
  const setup = e.technicalScore >= 62 ? 1 : e.technicalScore <= 40 ? -1 : 0;
  const votes = [rev, flow, setup];
  return {
    rev,
    flow,
    setup,
    net: rev + flow + setup,
    aligned: Math.max(votes.filter(v => v > 0).length, votes.filter(v => v < 0).length),
  };
}

/**
 * The verdict, the structure that isolates the mispricing, and the argument for
 * both.
 *
 * `strategy` is written as a DESCRIPTION of a structure and never as an order to
 * place one — no buy/sell/fade/own/take, and no position the app does not hold.
 * The desk states what the distribution says and leaves the ticket to the
 * reader, the same rule PLAY/FADE/SKIP follow when the screens render them
 * QUALIFIED / RICH / NO EDGE, and the same rule earningsintel.ts's `verdict`
 * prose keeps. It is authored that way HERE because two render surfaces already
 * read this field — the earnings board and the stock drawer — and a surface that
 * had to launder the copy on the way out would only be fixing the one place
 * somebody happened to look.
 */
function decide(e: Omit<EarningsEvent, 'verdict' | 'strategy' | 'rationale'>): Pick<EarningsEvent, 'verdict' | 'strategy' | 'rationale'> {
  const im = e.impliedMovePct.toFixed(1);
  const hm = e.histAvgMovePct.toFixed(1);
  const rich = e.richness;
  const rx = rich.toFixed(2);

  // Directional edge: do revisions, flow and the chart agree?
  const dirScore = directionVote(e).net;

  if (rich >= 1.3) {
    // Premium rich — the edge sits with the seller unless all three sleeves line up.
    if (Math.abs(dirScore) >= 3) {
      const long = dirScore > 0;
      return {
        verdict: 'PLAY',
        strategy: long
          ? `The direction is the mispricing, not the vol: a call vertical carries it with a short leg that gives back part of the rich ${im}% premium, where an outright call pays the whole ${rx}×.`
          : `The direction is the mispricing, not the vol: a put vertical carries it with a short leg that gives back part of the rich ${im}% premium, where an outright put pays the whole ${rx}×.`,
        rationale: `Implied ${im}% against the ${hm}% its eight modeled reports average (${rx}×) is expensive, but revisions, flow and the chart all point the same way, so the live edge is the direction and the fat premium is what the spread's short leg sells.`,
      };
    }
    return {
      verdict: 'FADE',
      strategy: `The mispricing is the premium itself: ${im}% implied against the ${hm}% its eight modeled reports average (${rx}×). An iron condor or short strangle outside the expected move is the structure that isolates it, with the tails defined against a surprise.`,
      rationale: `The straddle prices ${rx}× the record with a ${e.beatRate8q}% beat rate already known to the street, so the surprise is paid for. The edge sits on the premium seller's side.`,
    };
  }

  if (rich <= 0.85) {
    return {
      verdict: 'PLAY',
      strategy: `The event itself is underpriced: ${im}% implied on a name whose eight modeled reports average ${hm}%. A straddle or strangle held across the print is the structure that isolates that gap${
        e.beatRate8q >= 60 ? `, and a ${e.beatRate8q}% beat rate tilts it long.` : ', with no directional lean to weight it either way.'
      }`,
      rationale: `Rare shape: the market charges less than the record says the name moves (${rx}×). ${
        e.beatRate8q >= 60
          ? `A ${e.beatRate8q}% beat rate adds a directional tilt on top of the magnitude.`
          : 'Direction is unresolved, so the edge is in the magnitude and not the sign.'
      }`,
    };
  }

  if (Math.abs(dirScore) >= 2) {
    const long = dirScore > 0;
    return {
      verdict: 'PLAY',
      strategy: long
        ? `Premium is fair (${rx}×), so the mispricing is directional rather than in the vol: a call spread carries the lean without paying up for a straddle that is priced right.`
        : `Premium is fair (${rx}×), so the mispricing is directional rather than in the vol: a put spread carries the lean without paying up for a straddle that is priced right.`,
      rationale: `Premium is fair (${rx}×), so what is left is the direction: ${
        long
          ? `estimates drifting up (${(e.revisionTrend * 100).toFixed(0)}), flow accumulating, setup score ${e.technicalScore}.`
          : `estimates drifting down (${(e.revisionTrend * 100).toFixed(0)}), flow distributive, setup score ${e.technicalScore}.`
      }`,
    };
  }

  return {
    verdict: 'SKIP',
    strategy: 'Nothing is mispriced into the print: premium is fair and the directional sleeves disagree. What is left is the day-two continuation, once the gap is on the tape.',
    rationale: `Premium is fair (${rx}×) and the directional sleeves disagree, so there is no mispricing to harvest and no directional edge to lean on. The print prices what the record says it should.`,
  };
}

const REPORT_COUNT = 14;

export function buildEarningsCalendar(): EarningsEvent[] {
  const day = dayKey();
  // Deterministically choose which names report in the window
  const reporters = [...UNIVERSE]
    .map(u => ({ u, k: h01(`${u.ticker}-${day}-er-pick`) }))
    .sort((a, b) => a.k - b.k)
    .slice(0, REPORT_COUNT)
    .map(x => x.u);

  return reporters
    .map(u => {
      const s = (tag: string) => `${u.ticker}-${day}-er-${tag}`;
      const { daysOut, dateLabel } = reportDate(Math.floor(h01(s('d')) * 10));
      // The record is the name's, so it carries no day key; what the straddle
      // charges for it today is this session's draw.
      const record = printHistory(u.ticker);
      const histAvgMovePct = record.avgMovePct;
      const richness = hRange(s('rich'), 0.7, 1.75);
      const impliedMovePct = histAvgMovePct * richness;
      const base = {
        ticker: u.ticker,
        name: u.name,
        sector: u.sector,
        price: u.px,
        daysOut,
        dateLabel,
        slot: (h01(s('slot')) > 0.45 ? 'AMC' : 'BMO') as ReportSlot,
        impliedMovePct,
        histAvgMovePct,
        richness,
        beatRate8q: record.beatRatePct,
        revisionTrend: Math.max(-1, Math.min(1, hGauss(s('rev')) * 0.85)),
        ivRank: Math.round(hRange(s('ivr'), 35, 96)),
        technicalScore: Math.round(hRange(s('tech'), 22, 92)),
        flowLean: Math.max(-1, Math.min(1, hGauss(s('flow')) * 0.5)),
      };
      return { ...base, ...decide(base) };
    })
    .sort((a, b) => a.daysOut - b.daysOut || b.impliedMovePct - a.impliedMovePct);
}

// ---- earnings plays: the concrete contract behind the dossier's structure ------
/*
  The dossier names a structure ("put debit spread, buy the ~0.7σ, sell the
  ~1.55σ") but never a contract you could type into a ticket. This turns those
  legs into strikes and an expiry, and prices the OUTCOME rather than the
  premium: for each strike, the model's own reaction distribution says how often
  the print lands there, and the same distribution's `priced` leg says what the
  straddle plus skew is charging for it. The gap between them is the whole case
  for the trade.

  It deliberately does NOT quote a debit. The terminal's contract weigher
  (core/contractScore.ts) prices off a name-and-day baseline vol that carries no
  earnings jump, so any premium it produced for a print would be too cheap. A
  number that looks right and is wrong is worse than no number.
*/

/** How far out a strike sits, in units of the print's own implied move. */
const PLAY_SIGMAS = { body: 0.7, tail: 1.55 } as const;

export type PlayKind = 'BODY' | 'TAIL';

export interface EarningsPlay {
  id: string;
  right: 'C' | 'P';
  /** Nearest listed strike to the modeled reaction node */
  strike: number;
  /** Distance from spot to that strike, signed % */
  awayPct: number;
  /** Sigmas out, in units of the implied move */
  sigmas: number;
  /** The reaction state the contract needs, named by the model */
  stateLabel: string;
  /** Model odds the print lands at that state or past it, % */
  modelProbPct: number;
  /** Odds the straddle plus skew is charging for the same outcome, % */
  pricedProbPct: number;
  /** model − priced, in points. + = the tape is underpaying for it */
  edgePts: number;
  kind: PlayKind;
  /** What the leg does inside the dossier's structure */
  role: string;
}

export interface EarningsPlaysView {
  ticker: string;
  /** The expiry that spans the print, e.g. "Fri 02/21" */
  expiryLabel: string;
  /** Calendar days to that expiry */
  dte: number;
  impliedMovePct: number;
  /** Pre-print and post-crush ATM IV, annualized % */
  frontIv: number;
  baseIv: number;
  /** Share of the front IV that goes on the print, % */
  ivCrushPct: number;
  /** Which wing the mispricing points at. null = neither */
  side: 'C' | 'P' | 'BOTH' | null;
  /** Observational statement of what the distribution shows */
  condition: string;
  plays: EarningsPlay[];
  /** The dossier structure these legs belong to */
  structure: string;
  /** Why a long wing does (or does not) carry an edge into this print */
  read: string;
}

/**
 * US options list on a grid that widens with price. Rounding to it is what
 * turns a modeled level into a strike someone could actually put in a ticket.
 *
 * The grid stays deliberately fine through the mid caps: a $2.50 ladder on a
 * $120 name moved the 0.7σ strike a full point off the node it was drawn from,
 * so the strike and the "sigmas out" beside it stopped describing each other.
 * The odds still belong to the node, not to the rounded strike, which is why
 * each card names the reaction STATE it is quoting rather than the strike.
 */
function listedStrike(px: number): number {
  const step = px < 25 ? 0.5 : px < 250 ? 1 : px < 600 ? 5 : 10;
  return Math.round(px / step) * step;
}

/**
 * The expiry that spans the print: two sessions past the report so the contract
 * is still alive the morning after. `earningsintel.ts` derives the same window
 * for its crush path, and the two must agree or the strikes below would belong
 * to a different contract than the vol they are priced against.
 */
export function printExpiryDte(e: Pick<EarningsEvent, 'daysOut'>): number {
  return Math.max(2, e.daysOut + 2);
}

export function buildEarningsPlays(e: EarningsEvent, view: EarningsIntelView): EarningsPlaysView {
  const dte = printExpiryDte(e);
  const x = expiryFor(dte);
  const expiryLabel = `${x.weekday} ${fmtExpiryShort(x.date)}`;

  // Sorted by move so the cumulative sums below do not depend on node order.
  const ladder = [...view.states].sort((a, b) => a.movePct - b.movePct);
  /** Odds of finishing at `node` or further out in `dir`, model and priced. */
  const beyond = (movePct: number, dir: 1 | -1) => {
    const hit = ladder.filter(s => (dir > 0 ? s.movePct >= movePct - 1e-9 : s.movePct <= movePct + 1e-9));
    return {
      model: hit.reduce((a, s) => a + s.prob, 0) * 100,
      priced: hit.reduce((a, s) => a + s.priced, 0) * 100,
    };
  };

  const component = view.mispricing.component;
  const side: EarningsPlaysView['side'] =
    component === 'UPSIDE_SKEW' ? 'C' : component === 'DOWNSIDE_SKEW' ? 'P' : component === 'STRADDLE_CHEAP' ? 'BOTH' : null;

  const condition =
    component === 'STRADDLE_CHEAP'
      ? 'Whole event underpriced'
      : component === 'UPSIDE_SKEW'
        ? 'Up tail underpriced'
        : component === 'DOWNSIDE_SKEW'
          ? 'Down tail underpriced'
          : component === 'STRADDLE_RICH'
            ? 'Premium rich, both tails covered'
            : 'Both tails priced in line';

  /*
    A cheap straddle says the whole event is underpriced, not which wing is.
    Rendering both wings there printed mirror-image edges (+9pt calls, −9pt
    puts) because model and priced tilt in opposite directions, and a card
    saying the tape OVERpays for an outcome is not a play. So the wing is
    resolved by whichever body node the model actually underprices; the skew
    branches already arrive with their wing chosen.
  */
  const bodyEdge = (dir: 1 | -1) => {
    const target = dir * PLAY_SIGMAS.body * e.impliedMovePct;
    const node = ladder.reduce((best, s) => (Math.abs(s.movePct - target) < Math.abs(best.movePct - target) ? s : best), ladder[0]);
    const o = beyond(node.movePct, dir);
    return o.model - o.priced;
  };
  const wing: { right: 'C' | 'P'; dir: 1 | -1 } | null =
    side === 'BOTH'
      ? bodyEdge(1) >= bodyEdge(-1)
        ? { right: 'C', dir: 1 }
        : { right: 'P', dir: -1 }
      : side === 'C'
        ? { right: 'C', dir: 1 }
        : side === 'P'
          ? { right: 'P', dir: -1 }
          : null;

  const plays: EarningsPlay[] = [];
  if (wing) {
    const w = wing;
    for (const kind of ['BODY', 'TAIL'] as const) {
      const k = kind === 'BODY' ? PLAY_SIGMAS.body : PLAY_SIGMAS.tail;
      const movePct = w.dir * k * e.impliedMovePct;
      // Match the ladder node rather than trusting a fixed index: the node moves
      // ARE the ±0.7σ / ±1.55σ levels the distribution is built on.
      const node = ladder.reduce((best, s) => (Math.abs(s.movePct - movePct) < Math.abs(best.movePct - movePct) ? s : best), ladder[0]);
      const odds = beyond(node.movePct, w.dir);
      const strike = listedStrike(e.price * (1 + node.movePct / 100));
      plays.push({
        id: `${e.ticker}-${w.right}-${strike}-${dte}`,
        right: w.right,
        strike,
        awayPct: (strike / e.price - 1) * 100,
        sigmas: k,
        stateLabel: node.label,
        modelProbPct: odds.model,
        pricedProbPct: odds.priced,
        edgePts: odds.model - odds.priced,
        kind,
        // Each role names what the leg DOES inside the structure. "The leg you
        // buy" used to sit on the body, which put a ticket in the reader's
        // hands on a surface that only prices odds.
        role: kind === 'BODY' ? 'the long leg, where the odds sit' : side === 'BOTH' ? 'the lotto strike' : 'the lotto strike, and the leg the spread sells',
      });
    }
  }

  const crush = view.ivCrushPct.toFixed(0);
  const read =
    plays.length === 0
      ? component === 'STRADDLE_RICH'
        ? `No wing is underpriced into this print. The straddle prices ${e.richness.toFixed(2)}× the record and neither tail carries an edge, so the structure here is the ${view.shortVol.name.toLowerCase()}, which is a premium sale and not a lotto.`
        : `No wing is mispriced: the model and the skew agree on both tails. A long ticket into this print pays the ${crush}% crush for a coin flip.`
      : `${side === 'BOTH' ? `The straddle underprices the whole event, and of the two wings the model underprices the ${wing?.right === 'C' ? 'upside' : 'downside'}. ` : ''}A long ticket has to clear the crush first: ATM IV goes ${view.frontIv.toFixed(0)}% to ${view.baseIv.toFixed(0)}% the morning after, so ${crush}% of the premium in the front expiry is spent on the print itself. The nearer strike buys the odds, the further one the payout.`;

  return {
    ticker: e.ticker,
    expiryLabel,
    dte,
    impliedMovePct: e.impliedMovePct,
    frontIv: view.frontIv,
    baseIv: view.baseIv,
    ivCrushPct: view.ivCrushPct,
    side,
    condition,
    plays,
    structure: view.recommended === 'LONG' ? view.longVol.name : view.recommended === 'SHORT' ? view.shortVol.name : 'No structure into the print',
    read,
  };
}
