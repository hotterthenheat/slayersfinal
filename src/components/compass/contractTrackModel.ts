/*
==================================================
  SLAYER TERMINAL - CONTRACT TRACK (contractTrack.ts)
  The contract's OWN premium series, derived rather
  than stored: there is no premium history anywhere
  in this app, so every point on the track is the
  contract repriced on a real 1-minute bar close.

  The one rule that makes it honest: reprice with the
  SAME pricer that minted the entry. Since P2.2 that is
  one function — Black-Scholes (core/contractScore.ts) —
  which the setups board reaches through compass's
  estimatePremium and the Weigher/Lotto call directly.
  The adapters below differ only in where they read the
  contract's IV from, not in how they price it, so the
  series lands on the printed number to the cent
  (measured: worst error $0.0047, which is
  Number(x.toFixed(2)) and nothing else).

  Value-only module — no component export, so importing
  it from a component doesn't trip react-refresh. Same
  convention as ./verdict.ts and ./setupState.ts.
==================================================
*/

import { BULL, FOCUS, MUTED_INK } from '../gex/palette';
import type { Tone } from '../ui/tones';
import type { Candle } from '../../types/market';
import { dteOfBucket } from './setupHorizon';
import type { OptionRight, Setup, TakeProfitStatus } from '../../types/compass';
import type { WeighedContract } from '../../core/contractScore';

/** Only achievement is green; activity is silver; waiting is quiet. Canonical
    home for the map so the chart's rungs and the cards below it share one. */
export const tpStatusTone: Record<TakeProfitStatus, Tone> = {
  HIT: 'bull',
  'IN PROGRESS': 'select',
  PENDING: 'neutral',
};

/** The same three states as SVG ink — strokes can't reach a Tailwind class. */
export const RUNG_INK: Record<TakeProfitStatus, string> = {
  HIT: BULL,
  'IN PROGRESS': FOCUS,
  PENDING: MUTED_INK,
};

/** Mirrors the `warn` token (tailwind.config.ts). Invalidation is amber here
    because that is what this screen already uses for it, and because a process
    state must never borrow the market's own bull/bear language. */
export const WARN_INK = '#FF9500';

/** Bars in one session — SESSION_BARS in core/simulator.ts. */
export const SESSION_BARS = 390;

/*
  ---- the pricer -----------------------------------------------------------
  One engine now prices every contract on this screen: Black-Scholes
  (core/contractScore.ts), which the setups board reaches through compass's
  estimatePremium and the Weigher/Lotto call directly. It floors its time input
  at half a session (core/optionTime.ts), so it cannot express intraday decay as
  shipped: a forward curve drawn through it is a horizontal line on every 0DTE
  profile. `bsPriceAtT` is the uncapped core of that function, byte-for-byte,
  with the clamped time taken as an argument instead of computed.

  It is a copy rather than an import because the engine exports the CLAMPED
  `blackScholes`, not its uncapped core. contractTrackModel.test.ts pins this copy
  against the engine's own output on a grid — through both the Weigher and the
  setups board, which now share it — so a change to the engine that this file
  does not follow fails the build rather than drawing a quietly wrong line. The
  permanent fix is the two-line extraction described in the test's header.
*/

/** blackScholes's clamp (core/contractScore.ts) — the floor every adapter bottoms out at. */
export const BS_FLOOR = 0.02;

function normCdf(x: number): number {
  // Abramowitz–Stegun 7.1.26 via erf
  const t = 1 / (1 + (0.3275911 * Math.abs(x)) / Math.SQRT2);
  const erf =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-(x * x) / 2);
  return 0.5 * (1 + Math.sign(x) * erf);
}

/** Uncapped core of `blackScholes`, price leg only. At T <= 0 it returns the
    analytic limit (intrinsic) instead of dividing by a zero sigma-root-T — the
    engine never reaches that input, so no shipped number moves. */
export function bsPriceAtT(
  spot: number,
  strike: number,
  ivAnnual: number,
  tYears: number,
  right: OptionRight
): number {
  const intrinsic = right === 'C' ? Math.max(spot - strike, 0) : Math.max(strike - spot, 0);
  if (!(tYears > 0) || !(ivAnnual > 0)) return Math.max(intrinsic, BS_FLOOR);
  const r = 0.045;
  const sq = ivAnnual * Math.sqrt(tYears);
  const d1 = (Math.log(spot / strike) + (r + (ivAnnual * ivAnnual) / 2) * tYears) / sq;
  const d2 = d1 - sq;
  const disc = Math.exp(-r * tYears);
  const price =
    right === 'C'
      ? spot * normCdf(d1) - strike * disc * normCdf(d2)
      : strike * disc * normCdf(-d2) - spot * normCdf(-d1);
  return Math.max(price, BS_FLOOR);
}

/** Trading sessions a compass profile expiry stands for. Mirrors `dteOf`. */
export function sessionsForExpiry(expiry: string): number {
  // The engine's own bridge, expressed in the sessions this file measures in:
  // `yearsToExpiry(dte) === sessionsForExpiry(expiry) / 252` by construction.
  // A 0DTE floors at half a session, which is where its 0.5 comes from.
  return Math.max(dteOfBucket(expiry) * (252 / 365), 0.5);
}

// ---- the plan ---------------------------------------------------------------

export interface TrackRung {
  /** 'TP1' */
  label: string;
  /** Dollars. */
  premium: number;
  /** % from entry. */
  pct: number;
  status: TakeProfitStatus;
  /** Spot the underlying must reach, at today's remaining life, to price here.
      null when unreachable inside the search bracket. */
  spotNeeded: number | null;
}

export interface ContractPlan {
  /** Memo identity. Setup.id or WeighedContract.id. */
  key: string;
  ticker: string;
  strike: number;
  right: OptionRight;
  /** What the engine calls this expiry — never derived, never invented. */
  expiryLabel: string;
  /** Remaining life the engine priced this contract with, in TRADING SESSIONS. */
  sessionsLeft: number;
  /** The premium the engine currently quotes. The series is pinned here at now. */
  entry: number;
  /** 'Reference' on a scanner or weigher row; 'Tracked' once TrackedSetup carries a mid. */
  entryLabel: string;
  /** Reprice THIS contract at `spot` with `sessions` trading sessions remaining.
      The adapter supplies the model that minted `entry`. Never cross models. */
  priceAt: (spot: number, sessions: number) => number;
  /** The clamp that model bottoms out at — what "the flat tail" actually is. */
  floor: number;
  /** [] on Weigher and Lotto. An empty ladder is a first-class state. */
  rungs: Omit<TrackRung, 'status' | 'spotNeeded'>[];
  invalidation: { spot: number; note: string } | null;
  /** Extra spot-lane annotation. Weigher/Lotto use it for breakeven. */
  spotMarks: { spot: number; label: string }[];
  /** One sentence, rendered under the chart. Must not claim liveness. */
  modelNote: string;
}

export interface TrackPoint {
  bar: number;
  premium: number;
  spot: number;
}

export interface TrackData {
  /** bar <= 0, ends at 0. */
  past: TrackPoint[];
  /** bar >= 0, starts at 0. */
  forward: { bar: number; premium: number }[];
  invalidationCurve: { bar: number; premium: number }[] | null;
  rungs: TrackRung[];
  /** Rungs the lane-A ceiling cannot hold — present, labelled, out of scale. */
  dockedRungs: TrackRung[];
  entry: number;
  spotNow: number;
  /** The highest the modeled path reached over the window. */
  pathMax: number;
  /** Lane A ceiling. */
  yMax: number;
  spotLo: number;
  spotHi: number;
  /** In bars, xMin <= 0 <= xMax. */
  xMin: number;
  xMax: number;
  /** Forward terminus sits on the model floor. */
  atFloor: boolean;
  /** Trading minutes of history shown. */
  pastMinutes: number;
  forwardMinutes: number;
}

const MODEL_NOTE = (ticker: string) =>
  `Modeled from ${ticker} 1-minute bars with the same pricing model that quoted this contract. Not a traded tape.`;

/** Strike as the rest of the app prints it. */
export function strikeLabel(strike: number): string {
  return strike % 1 === 0 ? strike.toFixed(0) : strike.toFixed(2);
}

export function contractLabel(plan: ContractPlan): string {
  return `${plan.ticker} ${strikeLabel(plan.strike)}${plan.right}`;
}

/**
 * Setup -> plan. `mid`, not `liveMid`: every take-profit rung is defined as
 * `mid * (1 + pct)`, so `mid` is the only origin the ladder is measured from.
 * (`liveMid` is a fixed +/-10% per-contract offset, not a quote.)
 */
export function setupToPlan(setup: Setup): ContractPlan {
  const sessionsLeft = sessionsForExpiry(setup.expiry);
  const iv = setup.greeks.iv / 100; // stored to 1dp of a percent — lossless back to iv
  return {
    key: setup.id,
    ticker: setup.ticker,
    strike: setup.strike,
    right: setup.right,
    expiryLabel: setup.expiry,
    sessionsLeft,
    entry: setup.mid,
    // Nobody entered anything: TrackedSetup carries no mid, so this is the
    // reference every rung is measured from, never "your entry".
    entryLabel: 'Reference',
    // The setups board mints its mid with Black-Scholes now (compass's
    // estimatePremium delegates to it), so the track reprices with the same
    // core the Weigher uses — one pricer, one floor.
    priceAt: (spot, sessions) => bsPriceAtT(spot, setup.strike, iv, sessions / 252, setup.right),
    floor: BS_FLOOR,
    rungs: setup.takeProfits.map(tp => ({
      label: `TP${tp.level}`,
      premium: tp.target,
      pct: tp.expectedPct,
    })),
    invalidation: { spot: setup.invalidationPrice, note: setup.invalidationReason },
    spotMarks: [{ spot: setup.strike, label: 'STRIKE' }],
    modelNote: MODEL_NOTE(setup.ticker),
  };
}

/**
 * WeighedContract -> plan. contractScore measures time in CALENDAR days over
 * 365; the track measures it in sessions over 252. `dte * 252/365` converts
 * exactly: a 30d contract is 20.712 sessions, and 20.712/252 === 30/365.
 *
 * The floor goes on the SESSION count, not on the day count. Flooring `dte` at
 * half a calendar day and then converting gave a 0DTE 0.345 sessions where the
 * engine gives it 0.5 — the same half-a-day-versus-half-a-session split that had
 * the two pricers disagreeing (core/optionTime.ts).
 *
 * No rungs and no invalidation, because the weigher genuinely produces neither.
 * That is the pre-trade question (is this worth buying: decay vs breakeven), not
 * the post-signal one (where does this go). Do not synthesise a ladder.
 *
 * Takes no spot: `buildTrack` reads it from the bar buffer, which is the same
 * number the engine priced against (the last close IS `currentPrice`), and a
 * second spot input is a second source of truth waiting to disagree.
 */
export function weighedToPlan(w: WeighedContract): ContractPlan {
  const iv = w.ivPct / 100;
  const breakeven = w.right === 'C' ? w.strike + w.mid : w.strike - w.mid;
  return {
    key: w.id,
    ticker: w.ticker,
    strike: w.strike,
    right: w.right,
    expiryLabel: w.expiryLabel,
    sessionsLeft: Math.max(w.dte * (252 / 365), 0.5),
    entry: w.mid,
    entryLabel: 'Mid',
    priceAt: (s, sessions) => bsPriceAtT(s, w.strike, iv, sessions / 252, w.right),
    floor: BS_FLOOR,
    rungs: [],
    invalidation: null,
    spotMarks: [
      { spot: w.strike, label: 'STRIKE' },
      { spot: breakeven, label: 'BREAKEVEN' },
    ],
    modelNote: MODEL_NOTE(w.ticker),
  };
}

// ---- inverting the pricer ---------------------------------------------------

/** How far either side of spot the inversion will look before giving up. */
const SEARCH_SPAN = 0.6;
const BISECT_STEPS = 54;

/**
 * The spot that prices this contract at `target`, at `sessions` remaining.
 *
 * This is the bridge between the two lanes: it converts a premium target the
 * user cannot watch into an underlying level they can. Premium is monotone
 * increasing in spot for a call and decreasing for a put, so substituting
 * u = +/-spot makes the problem a plain bisection on a non-decreasing function.
 * Returns null when the target lies outside the search bracket.
 *
 * `price` already closes over the strike, so the strike is deliberately not a
 * parameter: a second copy of it is a second source of truth waiting to
 * disagree with the pricer it is meant to describe.
 */
export function spotForPremium(
  target: number,
  right: OptionRight,
  price: (spot: number, sessions: number) => number,
  sessions: number,
  spot0: number
): number | null {
  if (!Number.isFinite(target) || target <= 0 || !(spot0 > 0)) return null;
  const dir = right === 'C' ? 1 : -1;
  const sA = spot0 * (1 - SEARCH_SPAN);
  const sB = spot0 * (1 + SEARCH_SPAN);
  let uLo = Math.min(dir * sA, dir * sB);
  let uHi = Math.max(dir * sA, dir * sB);

  const f = (u: number): number => {
    const p = price(dir * u, sessions);
    return Number.isFinite(p) ? p - target : Number.NaN;
  };
  const fLo = f(uLo);
  const fHi = f(uHi);
  if (!Number.isFinite(fLo) || !Number.isFinite(fHi)) return null;
  if (fLo > 0 || fHi < 0) return null; // outside the bracket — honestly unreachable

  for (let i = 0; i < BISECT_STEPS; i++) {
    const mid = (uLo + uHi) / 2;
    if (f(mid) < 0) uLo = mid;
    else uHi = mid;
  }
  const out = dir * ((uLo + uHi) / 2);
  return Number.isFinite(out) ? out : null;
}

// ---- the sweep --------------------------------------------------------------

/** Sampling density. 90 + 60 pricer calls per rebuild, independent of DTE. */
const PAST_PTS = 90;
const FWD_PTS = 60;
/** History window ceiling — a 30d swing would otherwise want 8,078 bars. */
const MAX_HIST_SESSIONS = 5;
/** Fraction of the lane each docked rung's caret row reserves at the top. */
export const DOCK_HEADROOM = 0.1;

function finite(v: number, fallback: number): number {
  return Number.isFinite(v) ? v : fallback;
}

/**
 * Build the whole series. Every point is a pricer call on a real bar close or a
 * real spot; nothing here is drawn to look plausible.
 *
 * The past half holds TIME as the variable and lets spot move (what happened).
 * The forward half holds SPOT at today's close and lets time run (what standing
 * still costs). The seam at NOW is pinned to `plan.entry` on both sides, which
 * is exact by construction and enforced anyway.
 */
export function buildTrack(plan: ContractPlan, bars: Candle[]): TrackData {
  const n = bars.length;
  const spotNow = n > 0 ? bars[n - 1].close : Number.NaN;
  const lifeBars = Math.max(1, Math.round(plan.sessionsLeft * SESSION_BARS));
  const histBars = Math.max(0, Math.min(lifeBars, n - 1, MAX_HIST_SESSIONS * SESSION_BARS));

  // ---- past: real bars, repriced -------------------------------------------
  const past: TrackPoint[] = [];
  if (n > 0) {
    const pts = histBars >= 2 ? PAST_PTS : 0;
    let prev = plan.entry;
    for (let i = 0; i <= pts; i++) {
      const k = Math.round(histBars - (i * histBars) / (pts || 1));
      const bar = bars[n - 1 - k];
      if (!bar) continue;
      const raw = plan.priceAt(bar.close, plan.sessionsLeft + k / SESSION_BARS);
      // A non-finite reprice holds the previous point rather than poisoning `d`.
      const premium = finite(raw, prev);
      prev = premium;
      // `-k` at k=0 is -0, which reads back as "−0m" on the axis.
      past.push({ bar: k === 0 ? 0 : -k, premium, spot: bar.close });
    }
    if (past.length === 0 || past[past.length - 1].bar !== 0) {
      past.push({ bar: 0, premium: plan.entry, spot: spotNow });
    }
    // The pin. Exact by construction (the engine quoted this contract off this
    // very close) but enforced, so the chart's last point IS the printed mid.
    past[past.length - 1].premium = plan.entry;
    past[past.length - 1].spot = spotNow;
  }

  // ---- forward: spot held, only time elapses -------------------------------
  const forward: { bar: number; premium: number }[] = [];
  const invalidationCurve: { bar: number; premium: number }[] = [];
  const invalSpot = plan.invalidation?.spot;
  let prevF = plan.entry;
  let prevI = plan.entry;
  let onFloor = 0;
  for (let i = 0; i <= FWD_PTS; i++) {
    const rem = plan.sessionsLeft * (1 - i / FWD_PTS);
    const bar = (plan.sessionsLeft - rem) * SESSION_BARS;
    const premium = finite(plan.priceAt(spotNow, rem), prevF);
    prevF = premium;
    forward.push({ bar, premium });
    if (invalSpot != null) {
      const p = finite(plan.priceAt(invalSpot, rem), prevI);
      prevI = p;
      invalidationCurve.push({ bar, premium: p });
      if (p <= plan.floor + 1e-6) onFloor++;
    }
  }
  if (forward.length) forward[0].premium = plan.entry;

  // A dotted line lying flat on the axis is noise, not information. Measured, an
  // invalidation curve is pinned at the model floor for most of the span on
  // roughly half of real setups; when it is, lane B's rule carries it alone.
  const invalOk = invalSpot != null && onFloor <= (FWD_PTS + 1) * (2 / 3);

  // ---- rungs ---------------------------------------------------------------
  const pathMax = past.length ? Math.max(...past.map(p => p.premium)) : plan.entry;
  let progressTaken = false;
  const rungs: TrackRung[] = plan.rungs.map(r => {
    let status: TakeProfitStatus;
    if (pathMax >= r.premium) status = 'HIT';
    else if (!progressTaken) {
      status = 'IN PROGRESS';
      progressTaken = true;
    } else status = 'PENDING';
    return {
      ...r,
      status,
      spotNeeded: spotForPremium(r.premium, plan.right, plan.priceAt, plan.sessionsLeft, spotNow),
    };
  });

  // ---- domains -------------------------------------------------------------
  // The ceiling is the load-bearing decision on this chart. Letting TP4 into the
  // domain squeezes the series it exists to show into the bottom fifth of the
  // frame; rungs above the ceiling dock to the top edge as labelled carets and
  // stay fully legible on lane B as a spot level instead.
  //
  // Two ceilings, deliberately. `frameTop` decides what docks, and is the rule
  // above. `yMax` is the domain actually drawn, lifted to reserve a caret row
  // per docked rung. Folding the reservation into the docking test instead would
  // pull the next rung in frame and park it exactly under the carets it just
  // made room for, which is the collision it was meant to prevent.
  const firstRung = rungs.length ? rungs[0].premium : plan.entry;
  const frameTop = Math.max(pathMax, plan.entry, firstRung, plan.floor * 2) * 1.1;
  const dockedRungs = rungs.filter(r => r.premium > frameTop);
  const yMax = frameTop * (1 + DOCK_HEADROOM * dockedRungs.length);

  const spots: number[] = past.map(p => p.spot);
  if (Number.isFinite(spotNow)) spots.push(spotNow);
  if (invalSpot != null) spots.push(invalSpot);
  for (const m of plan.spotMarks) if (Number.isFinite(m.spot)) spots.push(m.spot);
  for (const r of rungs) if (r.spotNeeded != null) spots.push(r.spotNeeded);
  const lo = spots.length ? Math.min(...spots) : spotNow;
  const hi = spots.length ? Math.max(...spots) : spotNow;
  const pad = (hi - lo) * 0.12 || Math.abs(spotNow) * 0.005 || 1;

  return {
    past,
    forward,
    invalidationCurve: invalOk ? invalidationCurve : null,
    rungs,
    dockedRungs,
    entry: plan.entry,
    spotNow,
    pathMax,
    yMax,
    spotLo: lo - pad,
    spotHi: hi + pad,
    xMin: histBars === 0 ? 0 : -histBars,
    xMax: lifeBars,
    atFloor: forward.length > 0 && forward[forward.length - 1].premium <= plan.floor + 1e-3,
    pastMinutes: histBars,
    forwardMinutes: lifeBars,
  };
}

// ---- labels -----------------------------------------------------------------

/**
 * Relative time only, never a wall clock. The seeded bar times are anchored to
 * Date.now() with a synthetic overnight gap and have no 09:30-16:00
 * relationship, so "2:14pm ET" would be fabricated on a chart whose whole
 * argument is that it isn't.
 */
export function barsToSpan(barCount: number): string {
  const abs = Math.abs(Math.round(barCount));
  if (abs === 0) return '0m';
  if (abs >= SESSION_BARS) {
    const s = abs / SESSION_BARS;
    return `${s >= 10 ? Math.round(s) : Number(s.toFixed(1))} session${s >= 2 ? 's' : ''}`;
  }
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** Signed span for an axis tick or a cursor readout. */
export function barsToOffset(barCount: number): string {
  const r = Math.round(barCount);
  if (r === 0) return 'NOW';
  return `${r < 0 ? '−' : '+'}${barsToSpan(r)}`;
}

export function pctFrom(entry: number, premium: number): number {
  return entry > 0 ? (premium / entry - 1) * 100 : 0;
}

export function signedPct(v: number, digits = 0): string {
  return `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(digits)}%`;
}

// ---- keyboard ---------------------------------------------------------------

/**
 * Arrow/Home/End -> next cursor index, or null when the key isn't ours.
 * svgHover.ts is pointer-only today; this is the minimum that makes a crosshair
 * reachable without a mouse. Belongs beside `svgHoverIndex` once that shared
 * primitive is open for edit.
 */
export function svgHoverStep(key: string, i: number, count: number, mult = 1): number | null {
  const steps: Record<string, number> = {
    ArrowRight: mult,
    ArrowLeft: -mult,
    Home: -count,
    End: count,
  };
  const step = steps[key];
  return step === undefined ? null : Math.max(0, Math.min(count - 1, i + step));
}

// ---- cursor -----------------------------------------------------------------

export interface CursorPoint {
  bar: number;
  premium: number;
  spot: number;
  /** Forward half: spot is HELD, so this point is a counterfactual. */
  held: boolean;
}

/** Uniform resample of the drawn geometry, so `svgHoverIndex` (which assumes an
    evenly-spaced series across the full width) lands the crosshair exactly on
    the line the user is pointing at. */
export function buildCursorPoints(track: TrackData, count = 121): CursorPoint[] {
  const span = track.xMax - track.xMin || 1;
  const out: CursorPoint[] = [];
  for (let i = 0; i < count; i++) {
    const bar = track.xMin + (i / (count - 1)) * span;
    if (bar <= 0 && track.past.length > 0) {
      const p = interp(track.past, bar);
      out.push({ bar, premium: p.premium, spot: p.spot, held: false });
    } else {
      const p = interpF(track.forward, Math.max(bar, 0));
      out.push({ bar, premium: p, spot: track.spotNow, held: true });
    }
  }
  return out;
}

function interp(pts: TrackPoint[], bar: number): { premium: number; spot: number } {
  if (pts.length === 1) return { premium: pts[0].premium, spot: pts[0].spot };
  if (bar <= pts[0].bar) return { premium: pts[0].premium, spot: pts[0].spot };
  const last = pts[pts.length - 1];
  if (bar >= last.bar) return { premium: last.premium, spot: last.spot };
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].bar >= bar) {
      const a = pts[i - 1];
      const b = pts[i];
      const f = (bar - a.bar) / (b.bar - a.bar || 1);
      return {
        premium: a.premium + (b.premium - a.premium) * f,
        spot: a.spot + (b.spot - a.spot) * f,
      };
    }
  }
  return { premium: last.premium, spot: last.spot };
}

function interpF(pts: { bar: number; premium: number }[], bar: number): number {
  if (pts.length === 0) return Number.NaN;
  if (bar <= pts[0].bar) return pts[0].premium;
  const last = pts[pts.length - 1];
  if (bar >= last.bar) return last.premium;
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].bar >= bar) {
      const a = pts[i - 1];
      const b = pts[i];
      const f = (bar - a.bar) / (b.bar - a.bar || 1);
      return a.premium + (b.premium - a.premium) * f;
    }
  }
  return last.premium;
}

/**
 * The sentence a screen reader gets instead of a line. A path has no readable
 * content; this is the content.
 */
export function trackSummary(plan: ContractPlan, track: TrackData): string {
  const name = contractLabel(plan);
  const parts = [
    `${name} modeled premium.`,
    `${plan.entryLabel} ${track.entry.toFixed(2)} dollars.`,
  ];
  if (track.pastMinutes >= 2) {
    parts.push(
      `Reached ${track.pathMax.toFixed(2)} over the last ${barsToSpan(track.pastMinutes)}.`
    );
  } else {
    parts.push('No prior bars for this contract yet.');
  }
  const end = track.forward[track.forward.length - 1];
  if (end) {
    parts.push(
      `Held flat it prices at ${end.premium.toFixed(2)} dollars by expiry, ${barsToSpan(track.forwardMinutes)} away.`
    );
  }
  for (const r of track.rungs) {
    parts.push(
      r.spotNeeded != null
        ? `${r.label} at ${r.premium.toFixed(2)} needs ${plan.ticker} at ${r.spotNeeded.toFixed(2)}. ${r.status}.`
        : `${r.label} at ${r.premium.toFixed(2)}. ${r.status}.`
    );
  }
  if (plan.invalidation) {
    parts.push(`Invalidation level ${plan.invalidation.spot.toFixed(2)}, ${plan.invalidation.note}.`);
  }
  return parts.join(' ');
}
