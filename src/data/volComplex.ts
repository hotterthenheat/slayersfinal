/*
==================================================
  SLAYER TERMINAL - VOLATILITY COMPLEX (volComplex.ts)  [What-Else]
  The VIX-complex read, per name. Not the surface itself — the Vol Lab already
  draws that — but the handful of numbers a vol trader reads FIRST: is the term
  structure calm (contango) or stressed (backwardation), is implied rich or
  cheap against what the tape actually realized, and is the volatility itself
  volatile. One synthesized verdict off four measures that usually live on four
  different screens.

  Reuses the Vol Lab's term structure and risk-neutral density (data/vollab.ts)
  and the one shared IV rank (data/ivRank.ts via the term stats, P2.1), and adds
  realized volatility measured straight off the candle series so the vol risk
  premium is implied-minus-REALIZED, not implied-minus-a-guess.
==================================================
*/

import { buildVolLab } from './vollab';
import { math } from '../core/mathProvider';
import type { Candle } from '../types/market';

export type TermRegime = 'CONTANGO' | 'FLAT' | 'BACKWARDATION';
export type RichCheap = 'RICH' | 'FAIR' | 'CHEAP';

export interface VolComplexView {
  ticker: string;
  /** 30-day ATM implied vol, %. */
  frontIv: number;
  /** 90-day ATM implied vol, %. */
  backIv: number;
  /** backIv − frontIv, the term slope in vol points. */
  slope: number;
  termRegime: TermRegime;
  /** Annualized realized vol from the candle series, %. */
  realizedVol: number;
  /** frontIv − realizedVol — the vol risk premium, points. Positive = options
      price more vol than the tape delivered (the normal state). */
  vrp: number;
  /** How much the 30-day ATM IV itself moved over the last month, vol points. */
  volOfVol: number;
  /** The one shared IV rank / percentile (P2.1). */
  ivRank: number;
  ivPercentile: number;
  /** 25-delta risk reversal (negative = puts bid over calls), from the RND. */
  skew: number;
  /** Whether implied looks rich, fair or cheap vs realized and its own history. */
  richCheap: RichCheap;
  /** The term curve for a small chart: {dte, iv%}. */
  termCurve: { dte: number; iv: number }[];
  /** One observational sentence — describes the complex, never instructs. */
  read: string;
}

/**
 * Bars in a year for the simulator's 1-minute series: 390 per session x 252
 * sessions. Passed explicitly to the seam so the annualization can never be
 * silently wrong if the bar width changes.
 */
const MINUTE_BARS_PER_YEAR = 252 * 390;

/**
 * Annualized realized vol (%) from the candle series. The estimator itself lives
 * on the MATH SEAM (core/mathProvider.ts) — a house model that prefers
 * Parkinson, Garman-Klass or a windowed estimator overrides it there and every
 * vol read on the desk follows.
 */
export function realizedVolFromCandles(candles: Candle[]): number {
  const closes = candles.map(c => c.close);
  return Number(math.realizedVol(closes, MINUTE_BARS_PER_YEAR).toFixed(2));
}

/** The 30-day point of a term curve, %. */
function at30(curve: { dte: number; iv: number }[]): number {
  const exact = curve.find(p => p.dte === 30);
  if (exact) return exact.iv;
  const after = curve.find(p => p.dte >= 30);
  return after?.iv ?? curve[curve.length - 1]?.iv ?? 0;
}

export function buildVolComplex(ticker: string, spot: number, iv: number, candles: Candle[]): VolComplexView {
  const lab = buildVolLab(ticker, spot, iv);
  const { term, rnd } = lab;

  const frontIv = Number(term.stats.iv1m.toFixed(2));
  const backIv = Number(term.stats.iv3m.toFixed(2));
  const slope = Number((backIv - frontIv).toFixed(2));
  const termRegime: TermRegime = slope > 0.5 ? 'CONTANGO' : slope < -0.5 ? 'BACKWARDATION' : 'FLAT';

  const realizedVol = realizedVolFromCandles(candles);
  const vrp = Number((frontIv - realizedVol).toFixed(2));

  // Vol-of-vol: the spread of the 30d ATM IV across current / day / week / month
  // ago — how much the volatility itself has been moving.
  const hist = [term.current, term.dayAgo, term.weekAgo, term.monthAgo].map(at30);
  const volOfVol = Number((Math.max(...hist) - Math.min(...hist)).toFixed(2));

  const ivRank = term.stats.ivRank;
  const ivPercentile = term.stats.ivPercentile;
  const skew = rnd.stats.riskReversal;

  // Rich/cheap blends the vol risk premium (implied vs realized) with where IV
  // sits in its own year. Rich = options pricing more than the tape delivered
  // AND elevated in the range; cheap = under-pricing realized OR historically low.
  let richCheap: RichCheap = 'FAIR';
  if (vrp >= 3 && ivRank >= 40) richCheap = 'RICH';
  else if (vrp <= 0 || ivRank <= 25) richCheap = 'CHEAP';

  const regimeWord =
    termRegime === 'CONTANGO'
      ? 'in contango — the term structure is calm, with longer-dated vol bid over the front'
      : termRegime === 'BACKWARDATION'
        ? 'in backwardation — the front is bid over the back, the shape of a market pricing near-term stress'
        : 'flat — neither calm nor stressed across the curve';
  const rcWord =
    richCheap === 'RICH'
      ? `implied is rich: it prices ${vrp.toFixed(1)} points more vol than the tape realized, and IV sits in the ${ivRank}th percentile of its year`
      : richCheap === 'CHEAP'
        ? `implied looks cheap: ${vrp <= 0 ? 'the tape realized more than options are pricing' : `IV is only in the ${ivRank}th percentile of its year`}`
        : `implied is roughly fair against the ${realizedVol.toFixed(0)}% the tape realized`;
  const read = `${ticker} vol is ${regimeWord}. ${rcWord.charAt(0).toUpperCase()}${rcWord.slice(1)}. The volatility itself moved ${volOfVol.toFixed(1)} points over the month, and the 25-delta risk reversal at ${skew.toFixed(1)} shows ${skew < 0 ? 'puts bid over calls' : 'calls bid over puts'}.`;

  return {
    ticker,
    frontIv,
    backIv,
    slope,
    termRegime,
    realizedVol,
    vrp,
    volOfVol,
    ivRank,
    ivPercentile,
    skew,
    richCheap,
    termCurve: term.current.map(p => ({ dte: p.dte, iv: p.iv })),
    read,
  };
}
