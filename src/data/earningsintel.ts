/*
==================================================
  SLAYER TERMINAL - EARNINGS EVENT INTELLIGENCE (earningsintel.ts)
  The single-name deep read behind the earnings board.
  Where earnings.ts renders a verdict per print, this
  engine dissects ONE event: it strips the jump vol out
  of the front-month IV, traces the IV-crush path around
  the report, splits the expected reaction into a gap vs a
  continuation, prices the outcome distribution as a set of
  states, searches modeled prior prints, and — the point of
  the whole thing — names WHICH component of that
  distribution is mispriced, then the expression that
  harvests exactly that. "Straddle is rich but the down-gap
  is underpriced" is a put spread, not a short straddle.

  Implied move, richness and the event fields are the
  chain/consensus values from earnings.ts; base vol, skew and
  the depth of the crush are modeled per name and clearly
  swappable for a real options-surface feed behind the same
  contract. The prior prints are not modeled here at all —
  they are the record earnings.ts already prices the implied
  move against, so this dossier cannot quote the name a
  different history than the board does. Today's pricing is
  deterministic per ticker + day; the record is not.
==================================================
*/

import { dayKey, h01, hRange, hGauss } from '../core/rng';
// `printHistory` is a value import, which is the direction the module graph
// already runs: earnings.ts reaches back for `EarningsIntelView` as a type only,
// so this edge stays one-way.
import { printHistory, type EarningsEvent } from './earnings';

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** One point on the IV-crush path — annualized ATM IV on a session around the print. */
export interface CrushPoint {
  /** Sessions relative to the print (0 = report). */
  day: number;
  label: string;
  /** Annualized ATM IV, % */
  iv: number;
  phase: 'ramp' | 'print' | 'crush';
}

/** One node of the modeled risk-neutral reaction distribution. */
export interface StateNode {
  key: string;
  label: string;
  /** Representative post-print move for the state, % */
  movePct: number;
  /** Model probability of landing in this state, 0–1 */
  prob: number;
  /** Probability the straddle + skew is pricing this state at, 0–1 */
  priced: number;
}

/** One report out of the name's generated record, read back as a prior print. */
export interface EventAnalog {
  /** How far back in that record the print sits, e.g. "3Q ago" */
  tag: string;
  /** What the straddle charged into it — modeled, the one figure the record lacks, % */
  impliedPct: number;
  /** The reaction the record carries for that print, % */
  realizedPct: number;
  gapped: boolean;
  direction: 'UP' | 'DOWN';
  /** Did the modeled straddle cover that reaction? */
  covered: boolean;
}

export type VolSide = 'LONG' | 'SHORT';

/** A concrete options structure with its modeled net edge. */
export interface Expression {
  side: VolSide;
  name: string;
  legs: string;
  /** Debit / credit framing */
  cost: string;
  breakeven: string;
  maxLabel: string;
  /** Modeled edge headline (vol pts / prob pts, human-readable) */
  edgeLabel: string;
  /** Net expected value after spreads + IV crush, % of spot */
  ev: number;
  /** Why this structure fits the mispricing */
  fit: string;
}

export type MispricedComponent =
  | 'STRADDLE_CHEAP'
  | 'STRADDLE_RICH'
  | 'DOWNSIDE_SKEW'
  | 'UPSIDE_SKEW'
  | 'FAIR';

export interface MispricingRead {
  component: MispricedComponent;
  headline: string;
  verdict: string;
}

export type Recommendation = 'LONG' | 'SHORT' | 'SKIP';

export interface EarningsIntelView {
  ticker: string;
  name: string;
  price: number;
  dateLabel: string;
  slot: EarningsEvent['slot'];
  daysOut: number;

  impliedMovePct: number;
  histAvgMovePct: number;
  richness: number;

  // ---- event volatility extraction ----
  /** Pre-print front-month ATM IV, annualized % */
  frontIv: number;
  /** Post-crush baseline ATM IV, annualized % */
  baseIv: number;
  /** IV points lost the morning after the print */
  ivCrushPts: number;
  /** Crush as a share of the front IV, % */
  ivCrushPct: number;
  /** Isolated one-day event (jump) vol — the move the base vol can't explain, % */
  eventVolPct: number;
  crushPath: CrushPoint[];

  // ---- reaction shape ----
  /** Odds the reaction is a one-and-done overnight gap, % */
  gapProb: number;
  /** Odds the move continues over the following sessions, % */
  continuousProb: number;
  /** Expected overnight gap magnitude, % */
  gapExpectedPct: number;
  /** 25-delta risk reversal (put IV − call IV), vol pts. + = downside skew */
  skewRR: number;
  skewLean: 'PUT' | 'CALL' | 'BALANCED';

  states: StateNode[];
  /** Model minus priced down-tail probability. + = down-gap underpriced */
  downEdge: number;
  /** Model minus priced up-tail probability. + = up-gap underpriced */
  upEdge: number;

  analogs: EventAnalog[];
  /** Share of the record's prints the modeled straddle covered, % */
  analogHitRate: number;

  longVol: Expression;
  shortVol: Expression;
  recommended: Recommendation;
  /** Net EV of the recommended expression, % of spot */
  netEv: number;

  mispricing: MispricingRead;
  headline: string;
}

const CRUSH_DAYS = [-5, -4, -3, -2, -1, 0, 1, 2, 3];

export function buildEarningsIntel(e: EarningsEvent): EarningsIntelView {
  const day = dayKey();
  const seed = (t: string) => `${e.ticker}-${day}-eint-${t}`;

  const { impliedMovePct, histAvgMovePct, richness, price } = e;
  const jump = impliedMovePct / 100; // expected one-day move as a fraction

  // ---- event volatility extraction ----------------------------------------
  // The front weekly that spans the print carries base variance PLUS a single
  // jump. Strip the jump back out and you have the post-crush baseline.
  const dte = Math.max(2, e.daysOut + 2);
  const baseIv = clamp(20 + (e.ivRank - 35) * 0.28 + hRange(seed('base'), -3, 5), 15, 55);
  const baseVar = (baseIv / 100) ** 2; // annualized
  const frontVar = baseVar + (jump * jump) / (dte / 252);
  const frontIv = Math.sqrt(frontVar) * 100;
  const ivCrushPts = frontIv - baseIv;
  const ivCrushPct = (ivCrushPts / frontIv) * 100;
  const eventVolPct = impliedMovePct; // the isolated jump — what base vol cannot explain

  // ---- IV-crush path around the print -------------------------------------
  const crushPath: CrushPoint[] = CRUSH_DAYS.map(d => {
    if (d < 0) {
      const frac = (5 + d) / 5; // 0 at D-5 → ~1 approaching the print
      return { day: d, label: `D${d}`, iv: baseIv + ivCrushPts * Math.pow(frac, 0.65), phase: 'ramp' as const };
    }
    if (d === 0) return { day: 0, label: 'PRINT', iv: frontIv, phase: 'print' as const };
    // post-print: crushed to base with a small, decaying residual
    return { day: d, label: `D+${d}`, iv: baseIv * (1 + 0.05 * Math.exp(-(d - 1) * 1.1)), phase: 'crush' as const };
  });

  // ---- directional lean & skew --------------------------------------------
  const dirDrift = clamp(e.revisionTrend * 0.5 + e.flowLean * 0.45 + ((e.technicalScore - 50) / 100) * 0.7, -1, 1);
  const skewRR = clamp(2.2 + hGauss(seed('skew')) * 2.4 - e.flowLean * 2.2 - ((e.technicalScore - 50) / 100) * 1.5, -4, 8);
  const skewLean: EarningsIntelView['skewLean'] = skewRR > 1.3 ? 'PUT' : skewRR < -1.3 ? 'CALL' : 'BALANCED';
  const skewNorm = clamp(skewRR / 6, -0.9, 0.9);

  // ---- gap vs continuation ------------------------------------------------
  const align = Math.abs(dirDrift);
  const gapShare = clamp(
    0.55 + (richness - 1) * 0.28 + (e.slot === 'AMC' ? 0.05 : 0) - align * 0.22 + hGauss(seed('gap')) * 0.04,
    0.18,
    0.86
  );
  const gapProb = gapShare * 100;
  const continuousProb = (1 - gapShare) * 100;
  const gapExpectedPct = impliedMovePct * (0.65 + gapShare * 0.5);

  // ---- earnings state-price distribution ----------------------------------
  // Five reaction states, one implied sigma apart on the tails.
  const sigma = impliedMovePct;
  const nodeMoves = [-1.55, -0.7, 0, 0.7, 1.55].map(k => k * sigma);
  const baseW = [0.15, 0.22, 0.26, 0.22, 0.15];
  const driftAxis = [-0.8, -0.45, 0, 0.45, 0.8]; // how each node responds to directional lean
  const skewAxis = [0.9, 0.5, 0, -0.5, -0.9]; // how the market's put skew tilts pricing

  const modelRaw = baseW.map((w, k) => Math.max(0.01, w * (1 + dirDrift * driftAxis[k])));
  const modelSum = modelRaw.reduce((a, x) => a + x, 0);
  const pricedRaw = baseW.map((w, k) => Math.max(0.01, w * (1 + skewNorm * skewAxis[k])));
  const pricedSum = pricedRaw.reduce((a, x) => a + x, 0);

  const stateLabels = ['Gap down', 'Fade', 'Pin', 'Pop', 'Gap up'];
  const stateKeys = ['gapDown', 'fade', 'pin', 'pop', 'gapUp'];
  const states: StateNode[] = nodeMoves.map((mv, k) => ({
    key: stateKeys[k],
    label: stateLabels[k],
    movePct: mv,
    prob: modelRaw[k] / modelSum,
    priced: pricedRaw[k] / pricedSum,
  }));

  const modelDown = states[0].prob + states[1].prob;
  const modelUp = states[3].prob + states[4].prob;
  const pricedDown = states[0].priced + states[1].priced;
  const pricedUp = states[3].priced + states[4].priced;
  // + downEdge → the model sees more down-tail than the skew is charging = underpriced
  const downEdge = modelDown - pricedDown;
  const upEdge = modelUp - pricedUp;

  // ---- similar-event search (the name's own record) ------------------------
  /*
    These rows ARE `printHistory`, not a second pass at the same idea. They used
    to be six quarters drawn here and tagged with calendar labels (`Q1 '24`),
    which named a population of real reports, disagreed with the modeled average
    quoted three cards away, and — because the draw carried `dayKey()` — gave a
    finished quarter a new realized move every session. Reading the record fixes
    all three at once: the realized column now averages to `histAvgMovePct` by
    construction, and `analogHitRate` counts covers over the same eight reports
    `beatRate8q` counts beats over.

    What the record does not carry is what the straddle CHARGED into each print,
    so that stays a draw — seeded per ticker and quarter with no day key, since a
    past quarter's price is as finished as its reaction. `gapped` is the same
    kind of attribute; deriving it from the reaction size would only restate the
    bar sitting next to it.
  */
  const record = printHistory(e.ticker);
  const analogs = record.prints.map((p): EventAnalog => {
    const s = (t: string) => `${e.ticker}-eint-an${p.quartersBack}-${t}`;
    const impliedPct = record.avgMovePct * hRange(s('i'), 0.82, 1.35);
    return {
      tag: `${p.quartersBack}Q ago`,
      impliedPct,
      realizedPct: p.movePct,
      gapped: h01(s('g')) > 0.42,
      direction: p.surprise > 0 ? 'UP' : 'DOWN',
      covered: impliedPct >= p.movePct,
    };
  });
  const analogHitRate = (analogs.filter(a => a.covered).length / analogs.length) * 100;

  // ---- expressions ---------------------------------------------------------
  const spreadCostPct = hRange(seed('spread'), 0.12, 0.5); // round-trip friction, % of spot
  const straddleCheap = richness <= 0.9;

  // which wing the real distribution underprices (skew edge, nudged by drift)
  const downEdgeAdj = downEdge + Math.max(0, -dirDrift) * 0.12;
  const upEdgeAdj = upEdge + Math.max(0, dirDrift) * 0.12;
  const wingDir: 1 | -1 = downEdgeAdj > upEdgeAdj ? -1 : 1;
  const wingEdge = Math.max(downEdgeAdj, upEdgeAdj);

  const lo = (frac: number) => (price * (1 - frac)).toFixed(2);
  const hi = (frac: number) => (price * (1 + frac)).toFixed(2);

  const evStraddle = histAvgMovePct - impliedMovePct - spreadCostPct;
  const evWing = wingEdge * impliedMovePct * 0.9 + Math.max(0, wingDir * dirDrift) * impliedMovePct * 0.3 - spreadCostPct;
  const evShort = (impliedMovePct - histAvgMovePct) * 0.7 - spreadCostPct;

  const longVol: Expression = straddleCheap
    ? {
        side: 'LONG',
        name: skewLean === 'CALL' ? 'Long call-weighted strangle' : skewLean === 'PUT' ? 'Long put-weighted strangle' : 'Long straddle',
        legs: `The ${dte}-DTE ATM call + put, held across the print`,
        cost: `≈ ${impliedMovePct.toFixed(1)}% debit`,
        breakeven: `$${lo(jump)} / $${hi(jump)}`,
        maxLabel: 'Risk capped at the debit · convex on a big move',
        edgeLabel: `+${(histAvgMovePct - impliedMovePct).toFixed(1)} pts vol cheap`,
        ev: evStraddle,
        fit: `The straddle charges ${impliedMovePct.toFixed(1)}% for a name that averages ${histAvgMovePct.toFixed(1)}%, so the gross move is on offer below what its eight modeled reports average.`,
      }
    : wingDir < 0
      ? {
          side: 'LONG',
          name: 'Put debit spread',
          legs: `The ~${(sigma * 0.7).toFixed(1)}% put against the ~${(sigma * 1.55).toFixed(1)}% put`,
          cost: `≈ ${(impliedMovePct * 0.42).toFixed(1)}% debit`,
          breakeven: `below $${lo(jump * 0.55)}`,
          maxLabel: 'Defined debit · full width if the gap-down prints',
          edgeLabel: `down-gap +${(downEdge * 100).toFixed(0)} pts underpriced`,
          ev: evWing,
          fit: 'The down-tail is the cheap leg: a spread carries it without paying for the body the straddle already marks rich.',
        }
      : {
          side: 'LONG',
          name: 'Call debit spread',
          legs: `The ~${(sigma * 0.7).toFixed(1)}% call against the ~${(sigma * 1.55).toFixed(1)}% call`,
          cost: `≈ ${(impliedMovePct * 0.42).toFixed(1)}% debit`,
          breakeven: `above $${hi(jump * 0.55)}`,
          maxLabel: 'Defined debit · full width if the gap-up prints',
          edgeLabel: `up-gap +${(upEdge * 100).toFixed(0)} pts underpriced`,
          ev: evWing,
          fit: 'The up-tail is the cheap leg: a spread carries it without paying for the body the straddle already marks rich.',
        };

  const shortVol: Expression = {
    side: 'SHORT',
    name: skewLean === 'PUT' ? 'Put-shifted iron condor' : 'Iron condor',
    legs: `The short ±${impliedMovePct.toFixed(1)}% strangle against ±${(impliedMovePct * 1.6).toFixed(1)}% wings`,
    cost: `≈ ${(impliedMovePct * 0.5).toFixed(1)}% credit`,
    breakeven: `$${lo(jump)} / $${hi(jump)}`,
    maxLabel: 'Profit capped at the credit · risk defined at the wings',
    edgeLabel: `+${(impliedMovePct - histAvgMovePct).toFixed(1)} pts vol rich`,
    ev: evShort,
    fit: `The straddle prices ${richness.toFixed(2)}× the modeled average, so the crush accrues to the seller from outside the expected move, with the tails defined.`,
  };

  // ---- which component is mispriced → the recommendation ------------------
  let component: MispricedComponent;
  let recommended: Recommendation;
  if (straddleCheap) {
    component = 'STRADDLE_CHEAP';
    recommended = 'LONG';
  } else if (richness >= 1.18) {
    if (wingEdge >= 0.05) {
      component = wingDir < 0 ? 'DOWNSIDE_SKEW' : 'UPSIDE_SKEW';
      recommended = 'LONG';
    } else {
      component = 'STRADDLE_RICH';
      recommended = 'SHORT';
    }
  } else if (wingEdge >= 0.05 || align >= 0.42) {
    component = wingDir < 0 ? 'DOWNSIDE_SKEW' : 'UPSIDE_SKEW';
    recommended = 'LONG';
  } else {
    component = 'FAIR';
    recommended = 'SKIP';
  }

  const netEv = recommended === 'LONG' ? longVol.ev : recommended === 'SHORT' ? shortVol.ev : 0;

  const im = impliedMovePct.toFixed(1);
  const hm = histAvgMovePct.toFixed(1);
  const rx = richness.toFixed(2);
  // `verdict` names the structure that isolates the mispriced component. It is
  // written as a description of that structure, never as an order to place it:
  // the desk states what the distribution says and leaves the trade to the
  // reader, the same rule the PLAY/FADE/SKIP labels follow on the board.
  const mispricingByComponent: Record<MispricedComponent, MispricingRead> = {
    STRADDLE_CHEAP: {
      component,
      headline: `The straddle underprices the event: ${im}% implied against a ${hm}% average mover (${rx}×).`,
      verdict: 'The mispricing is in the body, and a long straddle or strangle is the structure that isolates it, with the post-print crush setting what any size has to survive.',
    },
    STRADDLE_RICH: {
      component,
      headline: `The straddle is uniformly rich: ${im}% implied against a ${hm}% modeled average (${rx}×), and neither tail is underpriced.`,
      verdict: 'The whole edge sits on the premium seller’s side. An iron condor outside the expected move is the version of that with the tails defined against a surprise.',
    },
    DOWNSIDE_SKEW: {
      component,
      headline: `Straddle is ${richness >= 1.18 ? 'rich' : 'fair'} (${rx}×) but the down-gap is underpriced: the model carries +${(downEdge * 100).toFixed(0)} pts more down-tail than the skew charges.`,
      verdict: 'A put debit spread, not a short straddle: the cheap leg is the downside, and a short body sells it away with everything else.',
    },
    UPSIDE_SKEW: {
      component,
      headline: `Straddle is ${richness >= 1.18 ? 'rich' : 'fair'} (${rx}×) but the up-gap is underpriced: the model carries +${(upEdge * 100).toFixed(0)} pts more up-tail than calls price.`,
      verdict: 'A call debit spread, not a short straddle: the cheap leg is the upside, and a short body sells it away with everything else.',
    },
    FAIR: {
      component,
      headline: `Premium is fair (${rx}×) and both tails price in line with the model: no single component stands out.`,
      verdict: 'Nothing is mispriced into the print. What is left is the day-two continuation, once the gap is on the tape.',
    },
  };
  const mispricing = mispricingByComponent[component];

  const headline =
    recommended === 'SKIP'
      ? `${e.ticker} prices its ${im}% print in line with history and the model: nothing to harvest into the report.`
      : `${e.ticker}: ${mispricing.verdict} Net EV ${netEv >= 0 ? '+' : ''}${netEv.toFixed(2)}% after spreads and the ${ivCrushPct.toFixed(0)}% IV crush.`;

  return {
    ticker: e.ticker,
    name: e.name,
    price,
    dateLabel: e.dateLabel,
    slot: e.slot,
    daysOut: e.daysOut,
    impliedMovePct,
    histAvgMovePct,
    richness,
    frontIv,
    baseIv,
    ivCrushPts,
    ivCrushPct,
    eventVolPct,
    crushPath,
    gapProb,
    continuousProb,
    gapExpectedPct,
    skewRR,
    skewLean,
    states,
    downEdge,
    upEdge,
    analogs,
    analogHitRate,
    longVol,
    shortVol,
    recommended,
    netEv,
    mispricing,
    headline,
  };
}
