/*
==================================================
  SLAYER TERMINAL - EDGE LEDGER & PERSONAL DECAY (edgeledger.ts)
  A learning ledger over your own closed trades. Most
  research tools grade the market; this one grades the
  operator. It reconstructs each trade the way you
  should review it — original thesis, the entry
  conditions it required, the fill you actually got,
  the market state at entry, the max favorable / adverse
  excursion, exit quality, an honest reason for the W/L,
  and the better-contract you could have held for the
  same idea.

  From that history it derives what actually pays: your
  expectancy by setup type, your best and worst plays,
  and — the part no P/L screen shows — personalized
  edge-decay warnings. The same setup can be a machine
  in one vol regime and a slow bleed in another; this
  finds where your edge has quietly stopped working.

  Real closed-trade history is sparse, so the ledger is
  a modeled sample: deterministic per ticker + day, and
  swappable for your real fills behind the same contract.
==================================================
*/

import { dayKey, h01, hRange, hPick } from '../core/rng';
import type { MarketSnapshot, TradeDirection } from '../types/market';

export type SetupType =
  | 'Discounted Puts'
  | 'Gamma Squeeze'
  | 'Flip Reclaim'
  | 'Wall Rejection'
  | 'Momentum Sweep'
  | 'Vol-Crush Fade';

/** The vol environment a trade was opened into — the axis edge decays along. */
export type VolRegime = 'COMPRESSED' | 'NORMAL' | 'ELEVATED' | 'HIGH-VOL';

export const VOL_REGIMES: VolRegime[] = ['COMPRESSED', 'NORMAL', 'ELEVATED', 'HIGH-VOL'];

export type TradeOutcome = 'WIN' | 'LOSS';

export interface LedgerTrade {
  id: string;
  ticker: string;
  contract: string;
  setup: SetupType;
  direction: TradeDirection;
  right: 'C' | 'P';
  /** Original one-line thesis the trade was taken on */
  thesis: string;
  /** The conditions the setup required to trigger */
  entryConditions: string;
  /** Premium the plan called for */
  plannedEntry: number;
  /** Premium actually paid */
  actualFill: number;
  /** (fill − planned) / planned, % — slippage vs the plan */
  slippagePct: number;
  volRegime: VolRegime;
  /** One-line reconstruction of the tape at the moment of entry */
  entryState: string;
  /** Max favorable excursion, % of premium */
  mfePct: number;
  /** Max adverse excursion, % of premium (≤ 0) */
  maePct: number;
  /** Realized P/L, % of premium */
  exitPct: number;
  /** How much of the available move the exit actually captured, 0..~1 */
  captureRatio: number;
  exitQuality: string;
  outcome: TradeOutcome;
  /** P/L in units of the trade's risk (a full stop ≈ −1R) */
  rMultiple: number;
  /** Honest reason the trade won or lost */
  reason: string;
  /** The better contract that expressed the same thesis */
  counterfactual: string;
  daysAgo: number;
}

export interface StrategyStat {
  setup: SetupType;
  direction: TradeDirection;
  count: number;
  wins: number;
  winRate: number;
  avgWinPct: number;
  avgLossPct: number;
  /** Average P/L per trade, % of premium */
  expectancyPct: number;
  /** Average P/L per trade, in R — the honest expectancy */
  avgR: number;
  profitFactor: number;
  regimeExpectancy: Record<VolRegime, number>;
  bestRegime: VolRegime;
  worstRegime: VolRegime;
}

export type DecaySeverity = 'SOFTENING' | 'DECAYING';

export interface DecayWarning {
  setup: SetupType;
  severity: DecaySeverity;
  strongRegime: VolRegime;
  strongExpectancy: number;
  weakRegime: VolRegime;
  weakExpectancy: number;
  /** R the setup has given up between its best and worst regime */
  gap: number;
  message: string;
}

export interface EdgeLedgerView {
  ticker: string;
  trades: LedgerTrade[];
  strategies: StrategyStat[];
  bestStrategy: StrategyStat;
  worstStrategy: StrategyStat;
  /** Average P/L per trade in R across the whole book */
  overallExpectancy: number;
  overallExpectancyPct: number;
  winRate: number;
  profitFactor: number;
  tradeCount: number;
  decayWarnings: DecayWarning[];
  decayFlagCount: number;
  headline: string;
  note: string;
  sampleNote: string;
}

interface SetupProfile {
  setup: SetupType;
  direction: TradeDirection;
  right: 'C' | 'P';
  thesis: string;
  entryConditions: string;
  /** Base win probability by vol regime — the edge surface being modeled */
  edge: Record<VolRegime, number>;
  /** Typical winner / loser magnitude, % of premium */
  winMag: number;
  lossMag: number;
}

// The modeled edge surface. Each setup pays in the regime it was built for and
// bleeds in the one it wasn't — the pattern the ledger is meant to surface.
const PROFILES: SetupProfile[] = [
  {
    setup: 'Discounted Puts',
    direction: 'BEARISH',
    right: 'P',
    thesis: 'Skew-cheap downside — puts underbid into a fragile tape.',
    entryConditions: 'Put IV rank low, dealers short gamma below the flip, price under the EMA stack.',
    edge: { COMPRESSED: 0.34, NORMAL: 0.5, ELEVATED: 0.62, 'HIGH-VOL': 0.7 },
    winMag: 64,
    lossMag: 45,
  },
  {
    setup: 'Gamma Squeeze',
    direction: 'BULLISH',
    right: 'C',
    thesis: 'Coiled call wall — dealers forced to chase on a break.',
    entryConditions: 'Squeeze on, price pressing a heavy call wall with thin gamma above.',
    edge: { COMPRESSED: 0.63, NORMAL: 0.55, ELEVATED: 0.47, 'HIGH-VOL': 0.4 },
    winMag: 88,
    lossMag: 52,
  },
  {
    setup: 'Flip Reclaim',
    direction: 'BULLISH',
    right: 'C',
    thesis: 'Reclaim of the gamma flip — regime shift from short to long gamma.',
    entryConditions: 'Price reclaiming the flip zone with rising net GEX and momentum.',
    edge: { COMPRESSED: 0.5, NORMAL: 0.57, ELEVATED: 0.56, 'HIGH-VOL': 0.52 },
    winMag: 50,
    lossMag: 40,
  },
  {
    setup: 'Wall Rejection',
    direction: 'BEARISH',
    right: 'P',
    thesis: 'Fade the wall — dealers pin price into a heavy strike.',
    entryConditions: 'Long-gamma pin, price tagging a wall with momentum fading.',
    edge: { COMPRESSED: 0.6, NORMAL: 0.62, ELEVATED: 0.48, 'HIGH-VOL': 0.4 },
    winMag: 42,
    lossMag: 34,
  },
  {
    setup: 'Momentum Sweep',
    direction: 'BULLISH',
    right: 'C',
    thesis: 'Follow the sweep — aggressive ask-side flow into an expanding trend.',
    entryConditions: 'Repeated ask sweeps, price above the EMA stack, range expanding.',
    edge: { COMPRESSED: 0.4, NORMAL: 0.52, ELEVATED: 0.62, 'HIGH-VOL': 0.64 },
    winMag: 74,
    lossMag: 48,
  },
  {
    setup: 'Vol-Crush Fade',
    direction: 'BEARISH',
    right: 'P',
    thesis: 'Sell the vol pop — IV overshoots a catalyst that already printed.',
    entryConditions: 'IV elevated post-event, realized lagging implied, mean-revert in play.',
    edge: { COMPRESSED: 0.4, NORMAL: 0.5, ELEVATED: 0.66, 'HIGH-VOL': 0.55 },
    winMag: 46,
    lossMag: 40,
  },
];

// Ticker pool the sample ledger draws names from. Anchor prices are stable per
// day so contract strikes don't jitter tick-to-tick.
const NAMES: { sym: string; px: number }[] = [
  { sym: 'SPY', px: 560 },
  { sym: 'QQQ', px: 495 },
  { sym: 'NVDA', px: 128 },
  { sym: 'TSLA', px: 250 },
  { sym: 'AAPL', px: 228 },
  { sym: 'AMD', px: 158 },
  { sym: 'META', px: 585 },
  { sym: 'MSFT', px: 425 },
];

const WIN_REASONS = [
  'Thesis played out — the level broke and dealer hedging did the rest.',
  'Clean follow-through; flow confirmed inside the first 20 minutes.',
  'Structure held — took the meat of the move and trailed the runner out.',
  'Right setup in the right regime — it went the moment it triggered.',
];

const LOSS_REASONS = [
  'Thesis invalidated — price reclaimed the level and ran the stops.',
  'Right idea, wrong regime — the tape absorbed the move and faded.',
  'Entered too early; chopped out before the setup actually matured.',
  'Vol did the opposite of the plan — hedging leaned against the trade.',
];

const GAMMA_PHRASES = ['dealers short gamma', 'dealers long gamma', 'net GEX flipping', 'pinned under a wall'];
const TREND_PHRASES = ['above the EMA stack', 'below the EMA stack', 'coiled in a squeeze', 'grinding the flip zone'];

const regimeLabel = (r: VolRegime): string => (r === 'HIGH-VOL' ? 'high-vol' : r.toLowerCase());

const stepFor = (px: number): number => (px >= 200 ? 5 : px >= 50 ? 2.5 : 1);

const fmtR = (v: number): string => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}R`;

const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : 0);

export function buildEdgeLedger(snapshot: MarketSnapshot): EdgeLedgerView {
  const { ticker } = snapshot;
  const day = dayKey();

  // Name pool always includes the active ticker with a stable, seeded anchor
  // price so it shows up in the operator's book.
  const pool = [...NAMES];
  if (!pool.some(n => n.sym === ticker)) {
    pool.unshift({ sym: ticker, px: Math.round(hRange(`${ticker}-${day}-anchor`, 60, 520)) });
  }

  const trades: LedgerTrade[] = [];

  // Two trades per (setup × regime) cell — enough history that expectancy by
  // setup and by regime is a signal, not a coin flip.
  for (const prof of PROFILES) {
    const slug = prof.setup.toLowerCase().replace(/[^a-z]+/g, '-');
    for (const regime of VOL_REGIMES) {
      for (let cell = 0; cell < 2; cell++) {
        const s = (t: string) => `${ticker}-${day}-edge-${slug}-${regime}-${cell}-${t}`;

        const name = hPick(s('name'), pool);
        const step = stepFor(name.px);
        const offSign = prof.right === 'C' ? 1 : -1;
        const off = offSign * hRange(s('off'), 0.004, 0.028);
        const strike = Math.round((name.px * (1 + off)) / step) * step;
        const contract = `${name.sym} ${step % 1 === 0 ? strike.toFixed(0) : strike.toFixed(1)}${prof.right}`;

        const plannedEntry = Number(hRange(s('prem'), 0.45, 4.2).toFixed(2));
        const slip = hRange(s('slip'), -0.015, 0.06);
        const actualFill = Number((plannedEntry * (1 + slip)).toFixed(2));
        const slippagePct = ((actualFill - plannedEntry) / plannedEntry) * 100;

        const win = h01(s('out')) < prof.edge[regime];

        let exitPct: number;
        let mfePct: number;
        let maePct: number;
        if (win) {
          const k = hRange(s('wk'), 0.55, 1.25);
          exitPct = prof.winMag * k;
          mfePct = exitPct * hRange(s('mfe'), 1.06, 1.55);
          maePct = -prof.lossMag * hRange(s('mae'), 0.12, 0.5);
        } else {
          const k = hRange(s('lk'), 0.5, 1.15);
          exitPct = -prof.lossMag * k;
          maePct = exitPct * hRange(s('mae2'), 1.02, 1.4);
          mfePct = prof.lossMag * hRange(s('mfe2'), 0.1, 0.55);
        }

        const rMultiple = exitPct / prof.lossMag;
        const captureRatio = win
          ? exitPct / (mfePct || 1)
          : exitPct / (maePct || -1); // ~1 = exited near the worst of it

        let exitQuality: string;
        if (win) {
          exitQuality = captureRatio >= 0.82 ? 'Clean exit' : captureRatio >= 0.55 ? 'Solid' : 'Left money';
        } else {
          exitQuality =
            captureRatio >= 0.9 ? 'Round-tripped' : exitPct >= -prof.lossMag * 0.55 ? 'Stopped tight' : 'Full stop';
        }

        const rsi = Math.round(hRange(s('rsi'), 26, 74));
        const entryState = `IV ${regimeLabel(regime)}, RSI ${rsi}, ${hPick(s('gam'), GAMMA_PHRASES)}, ${hPick(
          s('trend'),
          TREND_PHRASES
        )}.`;

        const reason = win ? hPick(s('rw'), WIN_REASONS) : hPick(s('rl'), LOSS_REASONS);

        // Better-contract counterfactual — same thesis, different strike/structure.
        const altStrike = prof.right === 'C' ? strike + step : strike - step;
        const altStr = `${name.sym} ${step % 1 === 0 ? altStrike.toFixed(0) : altStrike.toFixed(1)}${prof.right}`;
        let counterfactual: string;
        if (win) {
          const alt = exitPct * hRange(s('cfw'), 1.3, 2.2);
          counterfactual =
            h01(s('cfwp')) < 0.5
              ? `The tighter ${altStr} would have returned +${alt.toFixed(0)}% on the same move — more convexity for the same risk.`
              : `A 0DTE ${altStr} caught the same break for +${alt.toFixed(0)}%, though with far less room to be wrong.`;
        } else {
          const altLoss = exitPct * hRange(s('cfl'), 0.4, 0.72);
          counterfactual =
            h01(s('cflp')) < 0.5
              ? `A further-OTM ${altStr} risks less premium and would have cut this to ${altLoss.toFixed(0)}%.`
              : `A defined-risk ${prof.right === 'C' ? 'call' : 'put'} spread would have capped the loss near ${altLoss.toFixed(
                  0
                )}% instead of the naked ${prof.right}.`;
        }

        trades.push({
          id: `${slug}-${regime}-${cell}`,
          ticker: name.sym,
          contract,
          setup: prof.setup,
          direction: prof.direction,
          right: prof.right,
          thesis: prof.thesis,
          entryConditions: prof.entryConditions,
          plannedEntry,
          actualFill,
          slippagePct,
          volRegime: regime,
          entryState,
          mfePct,
          maePct,
          exitPct,
          captureRatio,
          exitQuality,
          outcome: win ? 'WIN' : 'LOSS',
          rMultiple,
          reason,
          counterfactual,
          daysAgo: Math.round(hRange(s('age'), 1, 64)),
        });
      }
    }
  }

  // Most recent first — the way a trade blotter reads.
  trades.sort((a, b) => a.daysAgo - b.daysAgo);

  // ---- expectancy by setup ----
  const strategies: StrategyStat[] = PROFILES.map(prof => {
    const rows = trades.filter(t => t.setup === prof.setup);
    const wins = rows.filter(t => t.outcome === 'WIN');
    const losses = rows.filter(t => t.outcome === 'LOSS');
    const grossWin = wins.reduce((a, t) => a + t.exitPct, 0);
    const grossLoss = Math.abs(losses.reduce((a, t) => a + t.exitPct, 0));

    const regimeExpectancy = VOL_REGIMES.reduce((acc, r) => {
      acc[r] = mean(rows.filter(t => t.volRegime === r).map(t => t.rMultiple));
      return acc;
    }, {} as Record<VolRegime, number>);

    const ranked = [...VOL_REGIMES].sort((a, b) => regimeExpectancy[b] - regimeExpectancy[a]);

    return {
      setup: prof.setup,
      direction: prof.direction,
      count: rows.length,
      wins: wins.length,
      winRate: rows.length ? (wins.length / rows.length) * 100 : 0,
      avgWinPct: mean(wins.map(t => t.exitPct)),
      avgLossPct: mean(losses.map(t => t.exitPct)),
      expectancyPct: mean(rows.map(t => t.exitPct)),
      avgR: mean(rows.map(t => t.rMultiple)),
      profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 99 : 0,
      regimeExpectancy,
      bestRegime: ranked[0],
      worstRegime: ranked[ranked.length - 1],
    };
  }).sort((a, b) => b.avgR - a.avgR);

  const bestStrategy = strategies[0];
  const worstStrategy = strategies[strategies.length - 1];

  // ---- personalized edge-decay warnings ----
  // A setup whose expectancy is strong in one regime but has bled out in
  // another is edge that's quietly stopped working where you keep using it.
  const decayWarnings: DecayWarning[] = strategies
    .map(st => {
      const entries = VOL_REGIMES.map(r => ({ r, avgR: st.regimeExpectancy[r] })).filter(e => Number.isFinite(e.avgR));
      if (entries.length < 2) return null;
      const strong = entries.reduce((a, b) => (b.avgR > a.avgR ? b : a));
      const weak = entries.reduce((a, b) => (b.avgR < a.avgR ? b : a));
      const gap = strong.avgR - weak.avgR;
      if (gap < 0.5 || weak.avgR > 0.2) return null;
      const severity: DecaySeverity = gap >= 0.95 && weak.avgR <= -0.05 ? 'DECAYING' : 'SOFTENING';
      const message = `Your ${st.setup.toLowerCase()} setups hold their edge in ${regimeLabel(
        strong.r
      )} regimes (${fmtR(strong.avgR)}) but have bled expectancy in ${regimeLabel(weak.r)} sessions (${fmtR(
        weak.avgR
      )}) — same setup, wrong tape.`;
      return {
        setup: st.setup,
        severity,
        strongRegime: strong.r,
        strongExpectancy: strong.avgR,
        weakRegime: weak.r,
        weakExpectancy: weak.avgR,
        gap,
        message,
      } as DecayWarning;
    })
    .filter((w): w is DecayWarning => w !== null)
    .sort((a, b) => b.gap - a.gap);

  // ---- book-wide stats ----
  const allWins = trades.filter(t => t.outcome === 'WIN');
  const grossWin = allWins.reduce((a, t) => a + t.exitPct, 0);
  const grossLoss = Math.abs(trades.filter(t => t.outcome === 'LOSS').reduce((a, t) => a + t.exitPct, 0));
  const overallExpectancy = mean(trades.map(t => t.rMultiple));
  const overallExpectancyPct = mean(trades.map(t => t.exitPct));
  const winRate = trades.length ? (allWins.length / trades.length) * 100 : 0;
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : 99;

  const edgeSign = overallExpectancy >= 0;
  const headline = edgeSign
    ? `Across ${trades.length} closed trades your book runs a ${fmtR(overallExpectancy)} expectancy — carried by ${
        bestStrategy.setup
      } (${fmtR(bestStrategy.avgR)}) and dragged by ${worstStrategy.setup} (${fmtR(worstStrategy.avgR)}). ${
        decayWarnings.length
      } ${decayWarnings.length === 1 ? 'setup shows' : 'setups show'} regime-dependent edge decay.`
    : `Across ${trades.length} closed trades your book runs a ${fmtR(
        overallExpectancy
      )} expectancy — the edge is there in ${bestStrategy.setup} (${fmtR(
        bestStrategy.avgR
      )}) but ${worstStrategy.setup} (${fmtR(worstStrategy.avgR)}) is bleeding it back. ${
        decayWarnings.length
      } ${decayWarnings.length === 1 ? 'setup shows' : 'setups show'} regime-dependent edge decay.`;

  const note =
    decayWarnings.length > 0
      ? 'Your edge is regime-conditional: several setups only pay in the vol environment they were built for. Trade them where they work, stand down where they have bled.'
      : 'No setup is leaking edge across regimes right now — your plays are holding expectancy wherever the tape has put them.';

  const sampleNote =
    'Modeled sample ledger — deterministic per ticker + day. It swaps for your real closed-trade history behind the same contract, at which point every stat here is measured, not estimated.';

  return {
    ticker,
    trades,
    strategies,
    bestStrategy,
    worstStrategy,
    overallExpectancy,
    overallExpectancyPct,
    winRate,
    profitFactor,
    tradeCount: trades.length,
    decayWarnings,
    decayFlagCount: decayWarnings.length,
    headline,
    note,
    sampleNote,
  };
}
