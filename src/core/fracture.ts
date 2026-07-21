/*
==================================================
  SLAYER TERMINAL - FRACTURE ENGINE (fracture.ts)
  The instability model. GEX answers "which way must
  dealers hedge?" Fracture answers "where does forced
  flow exceed the liquidity available to absorb it,
  and does that break the market?"

  Pipeline: forced-flow balance sheet by price level →
  latent liquidity + absorption ratio → criticality
  (branching ratio) → Monte-Carlo cascade simulation →
  a single actionable read. Plus the closing-auction
  (MOC) forced-flow event and a mechanical-vs-
  informational move decomposition.

  Grounded in the real option chain + price history;
  the stochastic layer is deterministic per ticker +
  session day. Swaps for real dealer/flow feeds behind
  the same contract.
==================================================
*/

import { dayKey, hGauss, h01, hRange } from './rng';
import type { MarketSnapshot } from '../types/market';
import type {
  AbsorptionRegime,
  CascadeResult,
  CriticalityRead,
  ForcedFlowLevel,
  ForcedParticipant,
  FractureView,
  MoveDecomposition,
  MocClassification,
  MocRead,
} from '../types/fracture';

const LEVELS_PER_SIDE = 10;
const STEP_PCT = 0.003; // 0.3% between levels
const CASCADE_PATHS = 500;
const SAMPLE_PATHS = 36;
const MAX_STEPS = 42;

function regimeFor(absorption: number): AbsorptionRegime {
  if (absorption >= 1) return 'NONLINEAR';
  if (absorption >= 0.6) return 'UNSTABLE';
  if (absorption >= 0.25) return 'PRESSURE';
  return 'ABSORBED';
}

/** Lag-1 autocorrelation of |returns| — a Hawkes-style self-excitation proxy. */
function autocorrProxy(priceHistory: number[]): number {
  if (priceHistory.length < 6) return 0;
  const r: number[] = [];
  for (let i = 1; i < priceHistory.length; i++) r.push(Math.abs(priceHistory[i] - priceHistory[i - 1]));
  const mean = r.reduce((a, x) => a + x, 0) / r.length;
  let num = 0;
  let den = 0;
  for (let i = 1; i < r.length; i++) {
    num += (r[i] - mean) * (r[i - 1] - mean);
    den += (r[i - 1] - mean) ** 2;
  }
  return den > 0 ? num / den : 0; // ~[-1, 1]
}

/** Realized per-step volatility fraction from the price path. */
function realizedVol(priceHistory: number[], spot: number): number {
  if (priceHistory.length < 4) return 0.004;
  const rets: number[] = [];
  for (let i = 1; i < priceHistory.length; i++) rets.push((priceHistory[i] - priceHistory[i - 1]) / priceHistory[i - 1]);
  const m = rets.reduce((a, x) => a + x, 0) / rets.length;
  const v = rets.reduce((a, x) => a + (x - m) ** 2, 0) / rets.length;
  void spot;
  return Math.max(0.0015, Math.sqrt(v));
}

interface EngineParams {
  G: number; // dealer gamma dollars (|netGex| sum)
  amp: boolean; // dealers short gamma → amplify
  rv: number;
  crowding: number;
  branching: number;
  ctaThresh: number;
  marginThresh: number;
  letfAum: number;
  baseDepth: number;
  /** Regime fragility — low when dealers are long gamma & activity is exogenous,
      high when short gamma & self-exciting. Scales all forced flow so calm days
      read absorbed and only genuinely fragile days fracture. */
  fragility: number;
}

/** Forced flow (signed $) + latent liquidity at a signed distance d (negative = below spot). */
function forcedAt(d: number, p: EngineParams) {
  const down = d < 0;
  const a = Math.abs(d);
  const dir = down ? -1 : 1; // selling below, buying/covering above
  // Upside squeezes are real but generally smaller than downside cascades
  const sideScale = down ? 1 : 0.82;

  const s = dir * sideScale * p.fragility;
  const dealerHedge = s * p.G * (p.amp ? 0.9 : 0.32) * Math.min(1, a * 30);
  const volControl = s * p.G * 0.5 * (1 + p.rv * 55) * Math.min(1, Math.pow(a * 26, 1.3));
  const cta =
    a > p.ctaThresh
      ? s * p.G * 0.45 * p.crowding
      : s * p.G * 0.45 * p.crowding * (a / p.ctaThresh) * 0.3;
  const letf = s * p.letfAum * Math.min(0.5, a * a * 780);
  const margin =
    a > p.marginThresh
      ? s * p.G * 0.55 * Math.min(2.4, Math.pow((a - p.marginThresh) * 55, 1.4))
      : s * p.G * 0.04 * (a / p.marginThresh);

  const totalForced = dealerHedge + volControl + cta + letf + margin;
  // Liquidity is U-shaped: deep at spot, thin through the 2–5% "air pocket" where
  // resting interest is sparse, then rising again far out as deep-value buyers
  // step in — the floor that lets a cascade exhaust instead of running forever.
  // Criticality throttles replenishment across the whole curve.
  const shape = Math.exp(-a * 20) * 0.85 + 0.12 + Math.max(0, a - 0.045) * 6;
  const latentLiquidity = p.baseDepth * shape * (1 - 0.5 * p.branching);
  const absorption = Math.abs(totalForced) / Math.max(latentLiquidity, 1);

  return { dealerHedge, volControl, cta, letf, margin, totalForced, latentLiquidity, absorption };
}

function dominantAmplifier(l: { dealerHedge: number; volControl: number; cta: number; letf: number; margin: number }): ForcedParticipant {
  const entries: [ForcedParticipant, number][] = [
    ['Dealer hedging', Math.abs(l.dealerHedge)],
    ['Vol-control', Math.abs(l.volControl)],
    ['CTA trend', Math.abs(l.cta)],
    ['Leveraged ETF', Math.abs(l.letf)],
    ['Margin / liquidation', Math.abs(l.margin)],
  ];
  return entries.sort((a, b) => b[1] - a[1])[0][0];
}

function buildCascade(spot: number, trigger: number, p: EngineParams, seedBase: string): CascadeResult {
  const baseStep = 0.0018;
  const paths: number[][] = [];
  const cascadedTermini: number[] = [];
  const allTermini: number[] = [];
  const ampTotals: Record<string, number> = {};
  let cascadeCount = 0;

  // Each path is a "downside is tested" scenario that starts at SPOT and has to
  // traverse the book. Whether it cascades or gets absorbed is emergent — so the
  // probability is honest (low on a stable tape, high on a fragile one) instead
  // of tautologically 100% from starting at the fracture line.
  for (let k = 0; k < CASCADE_PATHS; k++) {
    let price = spot;
    const path: number[] = [price];
    // The developing down-move carries momentum on a self-exciting tape and fades
    // on a calm one — this is what lets fragile days reach the fracture zone and
    // stable days stall short of it.
    const scenarioDrift = -spot * baseStep * hRange(`${seedBase}-scn-${k}`, 0.6, 1.5) * (0.5 + p.branching);
    let stable = 0;
    let didCascade = false;
    for (let step = 0; step < MAX_STEPS; step++) {
      const d = (price - spot) / spot;
      const f = forcedAt(d, p);
      // Flow exhaustion — forced sellers have finite inventory; past ~2.5% the
      // program is getting done and deep-value liquidity steps in, so absorption
      // fades and the cascade finds a terminus instead of running forever.
      const depth = Math.max(0, (spot - price) / spot);
      const exhaust = Math.exp(-Math.max(0, depth - 0.015) * 42);
      const abs = f.absorption * exhaust;
      const shock = hGauss(`${seedBase}-${k}-${step}`) * spot * baseStep * (0.6 + p.rv * 18);
      if (abs >= 1) {
        // The book can't absorb — the move self-reinforces away from spot, harder
        // the more self-exciting the tape is (branching). Capped per step so a
        // cascade exhausts to a terminus instead of gapping straight to the floor.
        const accelMag = Math.min(spot * 0.007, spot * baseStep * Math.min(abs, 3) * (0.5 + p.branching));
        price += Math.sign(d || -1) * accelMag + scenarioDrift * 0.5 + shock;
        didCascade = true;
        ampTotals[dominantAmplifier(f)] = (ampTotals[dominantAmplifier(f)] ?? 0) + Math.abs(f.totalForced);
        stable = 0;
      } else {
        // Absorbed — the developing move is opposed by mean-reversion, stronger
        // when the tape is calm (low branching), weak when it is self-exciting.
        const revert = (spot - price) * 0.03 * Math.max(0, 0.5 - abs) * (1.25 - p.branching);
        price += scenarioDrift + revert + shock;
        if (abs < 0.35) {
          stable++;
          if (stable >= 5 && step > 4) break;
        } else stable = 0;
      }
      path.push(price);
      if (price < spot * 0.9 || price > spot * 1.1) break;
    }
    allTermini.push(price);
    if (didCascade && (spot - price) / spot > 0.005) {
      cascadeCount++;
      cascadedTermini.push(price);
    }
    if (k < SAMPLE_PATHS) paths.push(path);
  }

  const sorted = (cascadedTermini.length ? cascadedTermini : allTermini).slice().sort((a, b) => a - b);
  const q = (arr: number[], t: number) => arr[Math.min(arr.length - 1, Math.max(0, Math.floor(t * arr.length)))];
  const ampRanked = Object.entries(ampTotals).sort((a, b) => b[1] - a[1]);

  return {
    triggerPrice: Number(trigger.toFixed(2)),
    cascadeProbPct: Math.round((cascadeCount / CASCADE_PATHS) * 100),
    medianTerminus: Number(q(sorted, 0.5).toFixed(2)),
    exhaustionLo: Number(q(sorted, 0.35).toFixed(2)),
    exhaustionHi: Number(q(sorted, 0.65).toFixed(2)),
    primaryAmplifier: (ampRanked[0]?.[0] as ForcedParticipant) ?? 'Dealer hedging',
    secondaryAmplifier: (ampRanked[1]?.[0] as ForcedParticipant) ?? 'Vol-control',
    paths,
  };
}

function buildDecomposition(snapshot: MarketSnapshot, p: EngineParams, seed: (t: string) => number): MoveDecomposition {
  const up = snapshot.changePercent >= 0;
  const rsi = snapshot.indicators.rsi;
  const raw: Record<keyof MoveDecomposition, number> = {
    dealerHedging: (p.amp ? 42 : 20) + seed('dh') * 10,
    systematic: 14 + p.crowding * 12,
    passive: 9 + seed('pa') * 6,
    shortCovering: up && rsi < 42 ? 16 + seed('sc') * 12 : 3 + seed('sc') * 4,
    liquidation: !up && p.branching > 0.7 ? 14 + seed('lq') * 12 : 2 + seed('lq') * 4,
    informational: 12 + seed('in') * 14,
    unexplained: 3 + seed('un') * 4,
  };
  const total = Object.values(raw).reduce((a, x) => a + x, 0);
  const out = {} as MoveDecomposition;
  (Object.keys(raw) as (keyof MoveDecomposition)[]).forEach(k => (out[k] = Math.round((raw[k] / total) * 100)));
  return out;
}

function buildMoc(snapshot: MarketSnapshot, p: EngineParams, seed: (t: string) => number): MocRead {
  const expectedLiq = p.G * hRange(`${snapshot.ticker}-moc-liq`, 0.4, 0.9);
  const biasDir = snapshot.changePercent + (seed('bias') - 0.5) * 1.6 >= 0 ? 1 : -1;
  const imbalanceUsd = biasDir * expectedLiq * hRange(`${snapshot.ticker}-moc-imb`, 0.3, 1.7);
  const normalizedZ = imbalanceUsd / Math.max(expectedLiq, 1);
  const growthZ = hGauss(`${snapshot.ticker}-moc-grow`) * 0.9;
  const displacementZ = normalizedZ * hRange(`${snapshot.ticker}-moc-disp`, 0.5, 1.2);
  const absorptionPct = Math.round(Math.max(5, Math.min(95, 42 + seed('abs') * 44 - Math.abs(normalizedZ) * 12)));
  const confirmation = Math.tanh(snapshot.changePercent * 0.6 + (seed('conf') - 0.5) * 0.9);
  const isRebalance = seed('reb') > 0.82;
  const reversalRisk = Math.round(Math.max(8, Math.min(92, 28 + absorptionPct * 0.4 + (isRebalance ? 22 : 0) - Math.abs(growthZ) * 12)));

  const score = Math.max(
    -100,
    Math.min(
      100,
      Math.round(
        normalizedZ * 34 +
          growthZ * 16 +
          displacementZ * 22 -
          ((absorptionPct - 50) / 50) * 18 +
          confirmation * 14 -
          (reversalRisk / 100) * 26
      )
    )
  );

  const side = normalizedZ > 0.12 ? 'BUY' : normalizedZ < -0.12 ? 'SELL' : 'BALANCED';
  let classification: MocClassification;
  let note: string;
  const sideWord = side === 'BUY' ? 'buy' : 'sell';
  if (Math.abs(score) >= 45 && absorptionPct < 55 && growthZ * normalizedZ > 0) {
    classification = 'CONTINUATION';
    note = `Persistent ${sideWord} imbalance the paired book isn't absorbing, indicative price displaced ${displacementZ.toFixed(1)}σ and still moving — trade the imbalance into the close, defined-risk.`;
  } else if (Math.abs(normalizedZ) > 0.5 && absorptionPct >= 62) {
    classification = 'ABSORPTION FADE';
    note = `Large ${sideWord} imbalance but ${absorptionPct}% is being paired off and displacement is fading — liquidity providers are absorbing it. Fade the initial reaction once the imbalance demonstrably weakens.`;
  } else if (isRebalance && reversalRisk > 60) {
    classification = 'DISLOCATION REVERSAL';
    note = `Abnormal ${sideWord}-side auction pressure that looks mechanical (rebalance/flow, not information). Don't fade before the cross — take the mean-reversion after, toward the pre-auction fair-price region.`;
  } else {
    classification = 'NO TRADE';
    note = 'Imbalance and indicative displacement disagree, or the imbalance is being absorbed — no clean closing-auction edge. Wait for the 3:53–3:57 window to confirm.';
  }

  return {
    imbalanceUsd,
    side,
    normalizedZ,
    growthZ,
    displacementZ,
    absorptionPct,
    confirmation,
    reversalRisk,
    score,
    classification,
    note,
  };
}

export function buildFractureView(snapshot: MarketSnapshot): FractureView {
  const { ticker, spot, chain, plan } = snapshot;
  const day = dayKey();
  const seed = (t: string) => h01(`${ticker}-${day}-frac-${t}`);

  const G = chain.reduce((a, n) => a + Math.abs(n.netGex), 0) || spot * 1e6;
  const netGexTotal = chain.reduce((a, n) => a + n.netGex, 0);
  const amp = netGexTotal < 0 || spot < plan.flipZone; // short-gamma / below flip = amplifying
  const rv = realizedVol(snapshot.priceHistory, spot);
  // Branching (self-excitation) blends the price-path autocorrelation with the
  // regime signals that actually make a tape endogenous — short-gamma dealers,
  // elevated realized vol, and the session's own mood. A calm long-gamma tape
  // reads ~0.30 (STABLE); a short-gamma, high-vol, self-feeding tape can reach
  // ~0.9 (UNSTABLE). Real branching would come from tick-level order flow.
  const ac = autocorrProxy(snapshot.priceHistory);
  const rvNorm = Math.min(1, rv / 0.006);
  const branching = Math.max(
    0.25,
    Math.min(0.97, 0.3 + ac * 0.22 + (amp ? 0.15 : 0) + rvNorm * 0.2 + hRange(`${ticker}-${day}-endo`, -0.06, 0.44))
  );
  const crowding = hRange(`${ticker}-${day}-crowd`, 0.6, 1.4);
  const params: EngineParams = {
    G,
    amp,
    rv,
    crowding,
    branching,
    ctaThresh: hRange(`${ticker}-${day}-cta`, 0.009, 0.016),
    marginThresh: hRange(`${ticker}-${day}-marg`, 0.02, 0.032),
    letfAum: G * hRange(`${ticker}-${day}-letf`, 0.25, 0.5),
    baseDepth: G * hRange(`${ticker}-${day}-depth`, 2.6, 4.2),
    // Long-gamma, low-branching, uncrowded ⇒ ~0.35 (absorbed); short-gamma,
    // self-exciting, crowded ⇒ ~1.6 (fragile). This is what makes most days read
    // stable and only genuinely dangerous days fracture.
    fragility: (amp ? 1 : 0.45) * (0.5 + branching) * (0.7 + crowding * 0.4),
  };

  // ---- forced-flow ladder (below then above spot) ----
  const belowLevels: ForcedFlowLevel[] = [];
  const aboveLevels: ForcedFlowLevel[] = [];
  for (let i = 1; i <= LEVELS_PER_SIDE; i++) {
    for (const sign of [-1, 1] as const) {
      const d = sign * i * STEP_PCT;
      const price = spot * (1 + d);
      const f = forcedAt(d, params);
      const level: ForcedFlowLevel = {
        price: Number(price.toFixed(2)),
        distPct: d * 100,
        dealerHedge: f.dealerHedge,
        volControl: f.volControl,
        cta: f.cta,
        letf: f.letf,
        margin: f.margin,
        totalForced: f.totalForced,
        latentLiquidity: f.latentLiquidity,
        absorption: f.absorption,
        regime: regimeFor(f.absorption),
      };
      (sign < 0 ? belowLevels : aboveLevels).push(level);
    }
  }
  // levels: highest price at top → aboveLevels (desc) then belowLevels (desc)
  const levels = [...aboveLevels.reverse(), ...belowLevels];

  // ---- fracture line: nearest level (either side) where absorption crosses 1 ----
  const downFrac = belowLevels.find(l => l.absorption >= 1) ?? null;
  const upFrac = aboveLevels.slice().reverse().find(l => l.absorption >= 1) ?? null;
  let fractureLine: number | null = null;
  let fractureSide: 'DOWN' | 'UP' | null = null;
  let fractureDistPct: number | null = null;
  // Prefer the nearer fracture; ties go to the downside (cascades dominate)
  if (downFrac && (!upFrac || Math.abs(downFrac.distPct) <= Math.abs(upFrac.distPct))) {
    fractureLine = downFrac.price;
    fractureSide = 'DOWN';
    fractureDistPct = downFrac.distPct;
  } else if (upFrac) {
    fractureLine = upFrac.price;
    fractureSide = 'UP';
    fractureDistPct = upFrac.distPct;
  }

  // ---- criticality ----
  const endogeneityPct = Math.round(branching * 100);
  const critLabel: CriticalityRead['label'] =
    branching >= 0.9 ? 'UNSTABLE' : branching >= 0.78 ? 'CRITICAL' : branching >= 0.6 ? 'REACTIVE' : 'STABLE';
  const criticality: CriticalityRead = {
    branchingRatio: branching,
    endogeneityPct,
    label: critLabel,
    note:
      critLabel === 'STABLE'
        ? 'Activity is mostly exogenous — trades are responding to news, not to each other. A shock would dissipate.'
        : critLabel === 'REACTIVE'
          ? 'Feedback is building — moves are starting to beget moves. Watch for it to tip toward self-sustaining.'
          : critLabel === 'CRITICAL'
            ? 'Near the critical threshold — the market is reacting largely to itself. One aggressive program could self-sustain.'
            : 'Above the practical threshold — trades are generating trades. A small catalyst can trigger a cascade.',
  };

  // ---- cascade sim from the downside fracture (or nearest downside unstable level) ----
  const trigger =
    downFrac?.price ??
    belowLevels.find(l => l.absorption >= 0.6)?.price ??
    belowLevels[belowLevels.length - 1].price;
  const cascade = buildCascade(spot, trigger, params, `${ticker}-${day}-casc`);

  const decomposition = buildDecomposition(snapshot, params, seed);
  const moc = buildMoc(snapshot, params, seed);

  // ---- instability composite ----
  // Driven by cascade odds, self-excitation, and how close the fracture line sits
  // — not by raw absorption, so a distant fracture on a calm tape stays low.
  const fractureProximity = fractureDistPct !== null ? Math.max(0, 3 - Math.abs(fractureDistPct)) / 3 : 0;
  // Energy (branching) is weighted most — a fragile structure only matters if the
  // tape has the endogenous energy to test it. Conditional cascade odds and
  // fracture proximity refine it.
  const instability = Math.round(
    Math.max(
      0,
      Math.min(100, branching * 46 + fractureProximity * 24 + (cascade.cascadeProbPct - 40) * 0.35 + (params.crowding - 0.6) * 12)
    )
  );

  const forcedNowUsd = forcedAt(belowLevels[0].distPct / 100, params).totalForced;

  // ---- headline ----
  const fmtUsd = (v: number) => {
    const a = Math.abs(v);
    if (a >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
    if (a >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
    return `$${(v / 1e3).toFixed(0)}K`;
  };
  const hot = cascade.cascadeProbPct >= 30;
  let headline: string;
  if (fractureLine && fractureSide === 'DOWN' && hot) {
    headline = `Stable above $${fractureLine.toFixed(2)}. Below it, forced selling (${fmtUsd(Math.abs(downFrac!.totalForced))}) exceeds latent liquidity — cascade probability ${cascade.cascadeProbPct}%, expected exhaustion $${cascade.exhaustionLo.toFixed(2)}–$${cascade.exhaustionHi.toFixed(2)}.`;
  } else if (fractureLine && fractureSide === 'DOWN') {
    headline = `A fracture line sits at $${fractureLine.toFixed(2)} (${fractureDistPct!.toFixed(1)}%), where forced selling (${fmtUsd(Math.abs(downFrac!.totalForced))}) would outrun liquidity — but the tape is ${criticality.label.toLowerCase()} and absorptive, so a break is only ${cascade.cascadeProbPct}% likely to cascade today.`;
  } else if (fractureLine && fractureSide === 'UP') {
    headline = `Contained below $${fractureLine.toFixed(2)}. Above it, forced buying (${fmtUsd(Math.abs(upFrac!.totalForced))}) outruns available supply — squeeze risk ${hot ? `(${cascade.cascadeProbPct}%), exhaustion near $${cascade.medianTerminus.toFixed(2)}` : `is modest today (${cascade.cascadeProbPct}%)`}.`;
  } else {
    headline = `Structurally stable — forced flow is absorbed across ±${(LEVELS_PER_SIDE * STEP_PCT * 100).toFixed(0)}%. No fracture line in range; the book can currently soak up mechanical flow.`;
  }

  return {
    ticker,
    spot,
    fractureLine,
    fractureSide,
    fractureDistPct,
    headline,
    forcedNowUsd,
    instability,
    levels,
    criticality,
    cascade,
    decomposition,
    moc,
  };
}
