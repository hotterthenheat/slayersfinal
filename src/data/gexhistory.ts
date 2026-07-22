/*
==================================================
  SLAYER TERMINAL - GEX HISTORY (gexhistory.ts)
  Reconstructs how the session's structural levels —
  call wall, put wall, gamma flip, king strike and net
  GEX — migrated across the day, from the simulator's
  price history. Deterministic per ticker + day; the
  real intraday snapshot store fills the same shape.
==================================================
*/

import { h01, hGauss } from '../core/rng';
import type { MarketSnapshot } from '../types/market';

export interface LevelPoint {
  t: number;
  time: string;
  spot: number;
  callWall: number;
  putWall: number;
  flip: number;
  king: number;
  netGex: number;
}

export interface LevelShift {
  label: string;
  from: number;
  to: number;
  deltaPct: number;
}

export interface GexHistoryView {
  points: LevelPoint[];
  now: LevelPoint;
  open: LevelPoint;
  shifts: LevelShift[];
  netGexFlips: number;
  flipCrosses: number;
  widthNow: number;
  widthOpen: number;
}

const MAX_POINTS = 46;

function sessionTime(frac: number): string {
  // 09:30 → 16:00, 6.5h session
  const mins = Math.round(frac * 390);
  const h = 9 + Math.floor((30 + mins) / 60);
  const m = (30 + mins) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function buildGexHistory(snapshot: MarketSnapshot): GexHistoryView {
  const { ticker, priceHistory, plan, chain, spot } = snapshot;
  const day = `${new Date().getFullYear()}-${new Date().getMonth() + 1}-${new Date().getDate()}`;
  const seed = (t: string) => `${ticker}-${day}-hist-${t}`;

  const n = Math.min(MAX_POINTS, Math.max(12, priceHistory.length));
  const step = priceHistory.length / n;

  // Current king = max |netGex| strike
  let kingNow = spot;
  let kingAbs = 0;
  let netGexNow = 0;
  for (const nd of chain) {
    netGexNow += nd.netGex;
    if (Math.abs(nd.netGex) > kingAbs) {
      kingAbs = Math.abs(nd.netGex);
      kingNow = nd.strike;
    }
  }

  // Mean-reverting walks that END near today's real levels — levels start wider
  // and tighten toward the close, the way real dealer structure consolidates.
  const points: LevelPoint[] = [];
  for (let i = 0; i < n; i++) {
    const frac = i / (n - 1);
    const idx = Math.min(priceHistory.length - 1, Math.floor(i * step));
    const sp = priceHistory[idx];
    // early-session slack shrinks toward 0 at the close
    const slack = (1 - frac) * 0.6;
    const wob = (tag: string, amp: number) => hGauss(seed(`${tag}-${i}`)) * amp * (0.4 + slack);
    const callWall = plan.resistanceWall * (1 + slack * 0.012) + wob('cw', spot * 0.004);
    const putWall = plan.supportWall * (1 - slack * 0.012) + wob('pw', spot * 0.004);
    const flip = plan.flipZone + wob('fl', spot * 0.0035);
    const king = kingNow + wob('kg', spot * 0.006) * (i < n - 1 ? 1 : 0);
    const netGex = netGexNow * (0.35 + frac * 0.65) + hGauss(seed(`ng-${i}`)) * kingAbs * 0.5 * slack;
    points.push({
      t: i,
      time: sessionTime(frac),
      spot: Number(sp.toFixed(2)),
      callWall: Number(callWall.toFixed(2)),
      putWall: Number(putWall.toFixed(2)),
      flip: Number(flip.toFixed(2)),
      king: Number(king.toFixed(2)),
      netGex,
    });
  }

  // Snap the final point exactly to current structure
  const now: LevelPoint = {
    t: n - 1,
    time: sessionTime(1),
    spot: Number(spot.toFixed(2)),
    callWall: Number(plan.resistanceWall.toFixed(2)),
    putWall: Number(plan.supportWall.toFixed(2)),
    flip: Number(plan.flipZone.toFixed(2)),
    king: Number(kingNow.toFixed(2)),
    netGex: netGexNow,
  };
  points[n - 1] = now;
  const open = points[0];

  const pct = (from: number, to: number) => ((to - from) / from) * 100;
  const shifts: LevelShift[] = [
    { label: 'Call Wall', from: open.callWall, to: now.callWall, deltaPct: pct(open.callWall, now.callWall) },
    { label: 'Put Wall', from: open.putWall, to: now.putWall, deltaPct: pct(open.putWall, now.putWall) },
    { label: 'Gamma Flip', from: open.flip, to: now.flip, deltaPct: pct(open.flip, now.flip) },
    { label: 'King Strike', from: open.king, to: now.king, deltaPct: pct(open.king, now.king) },
  ];

  let netGexFlips = 0;
  let flipCrosses = 0;
  for (let i = 1; i < points.length; i++) {
    if (Math.sign(points[i].netGex) !== Math.sign(points[i - 1].netGex)) netGexFlips++;
    const wasAbove = points[i - 1].spot >= points[i - 1].flip;
    const isAbove = points[i].spot >= points[i].flip;
    if (wasAbove !== isAbove) flipCrosses++;
  }

  void h01; // (reserved seed helper)
  return {
    points,
    now,
    open,
    shifts,
    netGexFlips,
    flipCrosses,
    widthNow: now.callWall - now.putWall,
    widthOpen: open.callWall - open.putWall,
  };
}
