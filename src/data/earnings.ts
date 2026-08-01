/*
==================================================
  SLAYER TERMINAL - EARNINGS ENGINE (earnings.ts)
  The earnings hub's brain: for every upcoming
  report, price the implied move against realized
  history, weigh revisions, flow and technicals,
  and land on PLAY / FADE / SKIP with the strategy
  that matches the mispricing.
==================================================
*/

import { dayKey, hGauss, h01, hRange } from '../core/rng';
import { expiryFor, fmtExpiryShort } from '../core/calendar';
import { tickerSentiment } from './news';
import { UNIVERSE } from './universe';
import type { Sector } from './universe';
// Type-only, so there is no runtime edge back from earningsintel.ts (which
// imports EarningsEvent from here). The plays builder takes the intel view as
// an argument rather than calling for it, which keeps the module graph acyclic.
import type { EarningsIntelView } from './earningsintel';

export type EarningsVerdict = 'PLAY' | 'FADE' | 'SKIP';
export type ReportSlot = 'BMO' | 'AMC';

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
  /** Average absolute move over the last 8 prints, % */
  histAvgMovePct: number;
  /** implied ÷ realized — the mispricing everything hangs on */
  richness: number;
  /** % of the last 8 quarters beaten */
  beatRate8q: number;
  /** −1…+1 — analyst estimate drift into the print */
  revisionTrend: number;
  ivRank: number;
  /** 0–100 setup quality into the report */
  technicalScore: number;
  /** −1…+1 — options flow lean into the event */
  flowLean: number;
  verdict: EarningsVerdict;
  strategy: string;
  rationale: string;
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

function decide(e: Omit<EarningsEvent, 'verdict' | 'strategy' | 'rationale'>): Pick<EarningsEvent, 'verdict' | 'strategy' | 'rationale'> {
  const im = e.impliedMovePct.toFixed(1);
  const hm = e.histAvgMovePct.toFixed(1);
  const rich = e.richness;

  // Directional edge: do revisions, flow and the chart agree?
  const dirScore = directionVote(e).net;

  if (rich >= 1.3) {
    // Premium rich — the fade is the trade unless everything screams direction.
    if (Math.abs(dirScore) >= 3) {
      const long = dirScore > 0;
      return {
        verdict: 'PLAY',
        strategy: long
          ? `Directional, defined risk. ${im}% is rich, so spread it: call vertical through the print instead of naked longs.`
          : `Directional, defined risk: put vertical through the print, since a rich straddle makes outright puts overpay.`,
        rationale: `Implied ${im}% vs ${hm}% realized (${rich.toFixed(2)}×) is expensive, but revisions, flow and the chart all point the same way, so take direction and sell the fat premium against it.`,
      };
    }
    return {
      verdict: 'FADE',
      strategy: `Fade the move: implied ${im}% is ${rich.toFixed(2)}× the ${hm}% it actually averages. Iron condor / short strangle outside the expected move.`,
      rationale: `The straddle prices ${rich.toFixed(2)}× realized history with a ${e.beatRate8q}% beat rate already known to the street, so the surprise is paid for. Premium sellers have the edge.`,
    };
  }

  if (rich <= 0.85) {
    return {
      verdict: 'PLAY',
      strategy: `Own the vol: straddle or strangle into the print. Implied ${im}% under-prices an ${hm}% average mover.`,
      rationale: `Rare setup: the market is charging less than this name historically moves (${rich.toFixed(2)}×). ${
        e.beatRate8q >= 60 ? `A ${e.beatRate8q}% beat rate adds directional tailwind, so lean the strangle long.` : 'Direction unclear, so own both sides and let the print pick.'
      }`,
    };
  }

  if (Math.abs(dirScore) >= 2) {
    const long = dirScore > 0;
    return {
      verdict: 'PLAY',
      strategy: long
        ? 'Directional long into the report: call spread or stock-with-stop, since fair premium keeps it simple.'
        : 'Directional short into the report: put spread, since fair premium means no need to get clever.',
      rationale: `Premium is fair (${rich.toFixed(2)}×), so the trade is the direction: ${
        long
          ? `estimates drifting up (${(e.revisionTrend * 100).toFixed(0)}), flow accumulating, setup score ${e.technicalScore}.`
          : `estimates drifting down (${(e.revisionTrend * 100).toFixed(0)}), flow distributive, setup score ${e.technicalScore}.`
      }`,
    };
  }

  return {
    verdict: 'SKIP',
    strategy: 'No trade into the print. Take the reaction instead: trade day-two continuation once the gap direction is known.',
    rationale: `Premium is fair (${rich.toFixed(2)}×) and the directional sleeves disagree, so there's no mispricing to harvest and no edge to lean on. Capital is better spent where there is one.`,
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
      const histAvgMovePct = hRange(s('hist'), 2.2, 9.5) * (0.7 + u.beta * 0.35);
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
        beatRate8q: Math.round(hRange(s('beat'), 25, 95) / 12.5) * 12.5,
        revisionTrend: Math.max(-1, Math.min(1, hGauss(s('rev')) * 0.45 + tickerSentiment(u.ticker) * 0.4)),
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
  /** Which wing the mispricing points at. null = nothing to buy */
  side: 'C' | 'P' | 'BOTH' | null;
  /** Observational statement of what the distribution shows */
  condition: string;
  plays: EarningsPlay[];
  /** The dossier structure these legs belong to */
  structure: string;
  /** Why the desk is (or is not) buying a wing into this print */
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
        role: kind === 'BODY' ? 'the leg you buy' : side === 'BOTH' ? 'the lotto strike' : 'the lotto strike, and the leg the spread sells',
      });
    }
  }

  const crush = view.ivCrushPct.toFixed(0);
  const read =
    plays.length === 0
      ? component === 'STRADDLE_RICH'
        ? `Nothing to buy into this print. The straddle prices ${e.richness.toFixed(2)}× realized and neither tail carries an edge, so the desk structure here is the ${view.shortVol.name.toLowerCase()}, which is a premium sale and not a lotto.`
        : `No wing is mispriced: the model and the skew agree on both tails. A long ticket into this print pays the ${crush}% crush for a coin flip.`
      : `${side === 'BOTH' ? `The straddle underprices the whole event, and of the two wings the model underprices the ${wing?.right === 'C' ? 'upside' : 'downside'}. ` : ''}A long ticket has to clear the crush first: ATM IV goes ${view.frontIv.toFixed(0)}% to ${view.baseIv.toFixed(0)}% the morning after, so ${crush}% of the volatility you pay for is spent on the print itself. The nearer strike buys the odds, the further one the payout.`;

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
