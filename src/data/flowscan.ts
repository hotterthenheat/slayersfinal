/*
==================================================
  SLAYER TERMINAL - FLOW SCANNER (flowscan.ts)
  Aggregates the option chain into a per-contract
  flow table: session volume, ΔOI, premium, IV and a
  bid/ask-derived bull/bear conviction score. The
  scanning tool behind Trace › Scanner. Deterministic
  per ticker + day; swaps for the real tape rollup.
==================================================
*/

import { dayKey, h01, hRange } from '../core/rng';
import type { MarketSnapshot } from '../types/market';

export type FlowSentiment = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

export interface ScannerRow {
  id: string;
  ticker: string;
  strike: number;
  right: 'C' | 'P';
  otmPct: number;
  dte: number;
  expiry: string;
  last: string;
  volume: number;
  oi: number;
  deltaOi: number;
  deltaOiPct: number;
  premium: number;
  avgFill: number;
  iv: number;
  /** Bid-side share of the day, 0–100 */
  bidPct: number;
  /** −100…+100 conviction (ask-lifted calls / bid-hit puts = bullish) */
  bullScore: number;
  sentiment: FlowSentiment;
  sweeps: number;
  volOverOi: number;
}

export interface ScannerSummary {
  contracts: number;
  totalPremium: number;
  callPremium: number;
  putPremium: number;
  netPremium: number;
  bullish: boolean;
  sweeps: number;
  topBull: ScannerRow | null;
  topBear: ScannerRow | null;
  deltaOiLeader: ScannerRow | null;
}

const DTE_POOL = [0, 1, 2, 5, 9, 16, 30, 44];

function expiryLabel(dte: number): string {
  const d = new Date(Date.now() + dte * 86400000);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

export function buildScannerRows(snapshot: MarketSnapshot): ScannerRow[] {
  const { ticker, spot, chain } = snapshot;
  const day = dayKey();
  const cfgIv = 0.2;

  const nodes = [...chain].sort((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot)).slice(0, 22);
  const rows: ScannerRow[] = [];

  for (const node of nodes) {
    for (const right of ['C', 'P'] as const) {
      const seed = (t: string) => `${ticker}-${day}-scan-${node.strike}-${right}-${t}`;
      const oi = right === 'C' ? node.callOI : node.putOI;
      if (oi < 50) continue;
      const volOverOi = hRange(seed('voi'), 0.15, 1.9);
      const volume = Math.round(oi * volOverOi);
      if (volume < 40) continue;
      const otmPct = ((node.strike - spot) / spot) * 100;
      const dte = DTE_POOL[Math.floor(Math.pow(h01(seed('dte')), 1.4) * DTE_POOL.length)];
      const iv = (cfgIv + Math.abs(otmPct) * 0.004 + hRange(seed('iv'), 0, 0.18)) * 100;
      const intrinsic = right === 'C' ? Math.max(spot - node.strike, 0) : Math.max(node.strike - spot, 0);
      const avgFill = Number(Math.max(0.05, intrinsic * 0.98 + spot * (iv / 100) * 0.05 * Math.sqrt((dte + 1) / 20)).toFixed(2));
      const premium = volume * avgFill * 100;
      const bidPct = Math.round(hRange(seed('bid'), 12, 88));
      const askShare = 100 - bidPct;
      // Ask-lifted calls & bid-hit puts read bullish; the reverse bearish.
      const raw = right === 'C' ? askShare - bidPct : bidPct - askShare;
      const bullScore = Math.max(-100, Math.min(100, Math.round(raw * 1.05)));
      const sentiment: FlowSentiment = bullScore > 22 ? 'BULLISH' : bullScore < -22 ? 'BEARISH' : 'NEUTRAL';
      const deltaOi = Math.round((h01(seed('doi')) - 0.4) * volume * 0.5);
      const now = Date.now();
      const minsAgo = Math.floor(Math.pow(h01(seed('t')), 1.3) * 260);
      const ts = new Date(now - minsAgo * 60000);
      rows.push({
        id: `${ticker}-${node.strike}-${right}-${dte}`,
        ticker,
        strike: node.strike,
        right,
        otmPct,
        dte,
        expiry: expiryLabel(dte),
        last: `${String(ts.getHours()).padStart(2, '0')}:${String(ts.getMinutes()).padStart(2, '0')}`,
        volume,
        oi,
        deltaOi,
        deltaOiPct: (deltaOi / oi) * 100,
        premium,
        avgFill,
        iv,
        bidPct,
        bullScore,
        sentiment,
        sweeps: h01(seed('sw')) > 0.7 ? Math.round(hRange(seed('swn'), 1, 7)) : 0,
        volOverOi,
      });
    }
  }

  return rows.sort((a, b) => b.premium - a.premium);
}

export interface IntradayPoint {
  t: number;
  time: string;
  price: number;
  /** Cumulative net premium into the contract, signed by aggressor side */
  cumPremium: number;
}

function sessionTimeLabel(frac: number): string {
  const mins = Math.round(frac * 390);
  const h = 9 + Math.floor((30 + mins) / 60);
  const m = (30 + mins) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Intraday flow drilldown for one contract — price path + cumulative net premium. */
export function buildContractIntraday(row: ScannerRow, snapshot: MarketSnapshot): IntradayPoint[] {
  const { priceHistory } = snapshot;
  const n = Math.min(40, Math.max(12, priceHistory.length));
  const stepIdx = priceHistory.length / n;
  const dir = Math.sign(row.bullScore) || 1;
  const day = dayKey();
  let cum = 0;
  const out: IntradayPoint[] = [];
  for (let i = 0; i < n; i++) {
    const idx = Math.min(priceHistory.length - 1, Math.floor(i * stepIdx));
    // premium flows in over the session, weighted by conviction, with noise
    const inc = (row.premium / n) * (0.4 + h01(`${row.id}-${day}-flow-${i}`) * 1.2) * dir;
    cum += inc;
    out.push({
      t: i,
      time: sessionTimeLabel(i / (n - 1)),
      price: Number(priceHistory[idx].toFixed(2)),
      cumPremium: cum,
    });
  }
  return out;
}

export function summarizeScanner(rows: ScannerRow[]): ScannerSummary {
  const callPremium = rows.filter(r => r.right === 'C').reduce((a, r) => a + r.premium, 0);
  const putPremium = rows.filter(r => r.right === 'P').reduce((a, r) => a + r.premium, 0);
  // Bull premium = bullish-scored contracts; net leans that way
  const bullPrem = rows.filter(r => r.sentiment === 'BULLISH').reduce((a, r) => a + r.premium, 0);
  const bearPrem = rows.filter(r => r.sentiment === 'BEARISH').reduce((a, r) => a + r.premium, 0);
  const byScore = [...rows].sort((a, b) => b.bullScore - a.bullScore);
  const byDeltaOi = [...rows].sort((a, b) => Math.abs(b.deltaOi) - Math.abs(a.deltaOi));
  return {
    contracts: rows.length,
    totalPremium: callPremium + putPremium,
    callPremium,
    putPremium,
    netPremium: bullPrem - bearPrem,
    bullish: bullPrem >= bearPrem,
    sweeps: rows.reduce((a, r) => a + (r.sweeps > 0 ? 1 : 0), 0),
    topBull: byScore[0] ?? null,
    topBear: byScore[byScore.length - 1] ?? null,
    deltaOiLeader: byDeltaOi[0] ?? null,
  };
}
