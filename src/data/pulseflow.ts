/*
==================================================
  SLAYER TERMINAL - PULSE FLOW STREAM (pulseflow.ts)
  A session-long stream of options prints for the Pulse
  flow tape — premium, aggressor side, sweep/block, OTM
  distance and a composite SigScore per print — plus
  typed FLOW ALERTS derived from the SAME stream
  (repeaters, grenades, sizable sweeps), so the tape and
  the alert rail can never disagree.

  Deterministic per ticker + session day; prints sit at
  fixed session minutes with contracts seeded per index,
  so the feed is stable across rescans and reads like a
  day of accumulated flow the moment the panel mounts.
  (Distinct from data/flowtape.ts, which enriches the
  live tick tape for the Trace desk.)
==================================================
*/

import Simulator from '../core/simulator';
import { expiryFor, fmtExpiryIso } from '../core/calendar';
import { dayKey, h01, hRange } from '../core/rng';

export interface SessionPrint {
  id: number;
  /** bar index within the trailing session window */
  minute: number;
  time: string; // HH:MM:SS
  value: number; // premium $ (price x 100 x size)
  ticker: string;
  spot: number;
  strike: number;
  pc: 'C' | 'P';
  exp: string; // yy-mm-dd
  dte: number;
  x: 'Bid' | 'Ask' | 'Mid';
  type: 'SWEEP' | 'BLOCK';
  price: number;
  size: number;
  otmPct: number;
  sigScore: number; // 0..1
}

export interface PulseFlowView {
  prints: SessionPrint[]; // newest first
  calls: number;
  puts: number;
  bullPrem: number;
  bearPrem: number;
}

export type FlowAlertKind = 'URGENT REPEATER' | 'REPEATER' | 'GRENADE TRADE' | 'SIZABLE SWEEP';

export interface FlowAlert {
  id: string;
  kind: FlowAlertKind;
  time: string;
  ticker: string;
  strike: number;
  pc: 'C' | 'P';
  exp: string;
  /** total premium behind the alert */
  premium: number;
  /** peak return % since first print, when trackable */
  peakReturnPct: number | null;
  prints: number;
}

const SESSION_BARS = 390;
const PRINT_COUNT = 34;
const DTE_CHOICES = [0, 2, 5, 21, 45];

/** Rough option price: intrinsic + normal-shaped time value. Priced off
    TRADING sessions, not calendar days — /252 is a session count. */
function optionPrice(spot: number, strike: number, pc: 'C' | 'P', sessions: number, iv: number): number {
  const t = Math.max(0.003, sessions / 252);
  const width = iv * Math.sqrt(t);
  const m = Math.log(strike / spot) / (width || 1e-6);
  const tv = spot * width * 0.4 * Math.exp((-m * m) / 2);
  const intrinsic = pc === 'C' ? Math.max(0, spot - strike) : Math.max(0, strike - spot);
  return Math.max(0.05, Number((intrinsic + tv).toFixed(2)));
}

export function buildPulseFlow(ticker: string): PulseFlowView | null {
  const candles = Simulator.getCandles(ticker) ?? [];
  const cfg = Simulator.TICKERS[ticker];
  if (!candles.length || !cfg) return null;
  const bars = candles.slice(-SESSION_BARS);
  const n = bars.length;
  const day = dayKey();
  const sessionUp = bars[n - 1].close >= bars[0].open;

  const prints: SessionPrint[] = [];
  let calls = 0;
  let puts = 0;
  let bullPrem = 0;
  let bearPrem = 0;

  for (let i = 0; i < PRINT_COUNT; i++) {
    const seed = (tag: string) => `${ticker}-${day}-ft-${i}-${tag}`;
    const minute = Math.min(n - 1, Math.floor(h01(seed('m')) * (n - 1)));
    const bar = bars[minute];
    const spot = bar.close;

    // ~30% of prints repeat one "campaign" contract — the repeater signature
    const campaign = h01(seed('camp')) < 0.3;
    const cSeed = (tag: string) => `${ticker}-${day}-ftc-${tag}`;
    const pcRoll = campaign ? h01(cSeed('pc')) : h01(seed('pc'));
    const pc: 'C' | 'P' = pcRoll < (sessionUp ? 0.62 : 0.45) ? 'C' : 'P';
    // DTE_CHOICES are calendar days — what "45d" means on a tape. The calendar
    // resolves that to a real session and hands back both numbers, so the
    // printed dte, the expiry date and the price all describe one contract.
    const exp = expiryFor(DTE_CHOICES[Math.floor((campaign ? h01(cSeed('dte')) : h01(seed('dte'))) * DTE_CHOICES.length)]);
    const dte = exp.dte;
    const offRoll = campaign ? h01(cSeed('off')) : h01(seed('off'));
    const offset = (pc === 'C' ? 1 : -1) * (0.002 + Math.pow(offRoll, 1.6) * 0.03);
    const anchor = campaign ? bars[Math.floor(n * 0.35)].close : spot;
    const strike = Math.round((anchor * (1 + offset)) / cfg.step) * cfg.step;

    const price = optionPrice(spot, strike, pc, exp.sessions, cfg.iv);
    const size = Math.round(40 + Math.pow(h01(seed('sz')), 2.2) * 2960);
    const type: SessionPrint['type'] = h01(seed('ty')) < 0.42 ? 'SWEEP' : 'BLOCK';
    const xRoll = h01(seed('x'));
    const x: SessionPrint['x'] =
      type === 'SWEEP'
        ? xRoll < 0.72
          ? 'Ask'
          : xRoll < 0.94
            ? 'Bid'
            : 'Mid'
        : xRoll < 0.45
          ? 'Ask'
          : xRoll < 0.9
            ? 'Bid'
            : 'Mid';
    const value = price * 100 * size;
    const otmPct = pc === 'C' ? ((strike - spot) / spot) * 100 : ((spot - strike) / spot) * 100;

    // SigScore: size percentile + aggression + conviction distance + urgency
    const sizeScore = Math.min(1, size / 2000);
    const aggr = x === 'Ask' ? 0.22 : x === 'Mid' ? 0.08 : 0;
    const sig = Math.max(
      0.05,
      Math.min(
        1,
        sizeScore * 0.45 + aggr + Math.min(0.18, Math.max(0, otmPct) * 0.04) + (type === 'SWEEP' ? 0.12 : 0) + (dte <= 2 ? 0.08 : 0)
      )
    );

    const ts = new Date(bar.time * 1000);
    prints.push({
      id: i,
      minute,
      time: `${String(ts.getHours()).padStart(2, '0')}:${String(ts.getMinutes()).padStart(2, '0')}:${String(Math.floor(h01(seed('s')) * 60)).padStart(2, '0')}`,
      value,
      ticker,
      spot: Number(spot.toFixed(2)),
      strike: Number(strike.toFixed(2)),
      pc,
      exp: fmtExpiryIso(exp.date),
      dte,
      x,
      type,
      price,
      size,
      otmPct: Number(otmPct.toFixed(2)),
      sigScore: Number(sig.toFixed(2)),
    });

    if (pc === 'C') calls++;
    else puts++;
    const bullish = (pc === 'C' && x === 'Ask') || (pc === 'P' && x === 'Bid');
    const bearish = (pc === 'P' && x === 'Ask') || (pc === 'C' && x === 'Bid');
    if (bullish) bullPrem += value;
    else if (bearish) bearPrem += value;
  }

  prints.sort((a, b) => b.minute - a.minute || b.id - a.id);
  return { prints, calls, puts, bullPrem, bearPrem };
}

export const contractKey = (p: Pick<SessionPrint, 'strike' | 'pc' | 'exp'>): string => `${p.strike}|${p.pc}|${p.exp}`;

/** Typed alerts derived from the SAME print stream the tape shows. */
export function buildFlowAlerts(view: PulseFlowView, ticker: string): FlowAlert[] {
  const day = dayKey();
  const groups = new Map<string, SessionPrint[]>();
  for (const p of view.prints) {
    const k = contractKey(p);
    const g = groups.get(k);
    if (g) g.push(p);
    else groups.set(k, [p]);
  }

  const alerts: FlowAlert[] = [];
  for (const [key, group] of groups) {
    const newest = group[0]; // prints are newest-first
    const premium = group.reduce((a, p) => a + p.value, 0);
    const mk = (kind: FlowAlertKind, withReturn: boolean): FlowAlert => ({
      id: `${key}-${kind}`,
      kind,
      time: newest.time,
      ticker,
      strike: newest.strike,
      pc: newest.pc,
      exp: newest.exp,
      premium,
      peakReturnPct: withReturn ? Math.round(hRange(`${ticker}-${day}-fa-${key}`, 12, 88)) : null,
      prints: group.length,
    });
    if (group.length >= 3) alerts.push(mk('URGENT REPEATER', true));
    else if (group.length === 2) alerts.push(mk('REPEATER', h01(`${ticker}-${day}-far-${key}`) > 0.45));
    else if (newest.value >= 8e5 && newest.type === 'SWEEP') alerts.push(mk('SIZABLE SWEEP', false));
    else if (newest.otmPct >= 2.2 && newest.value >= 2.5e5 && newest.dte <= 2)
      alerts.push(mk('GRENADE TRADE', h01(`${ticker}-${day}-fag-${key}`) > 0.5));
  }

  // newest first, like the rail
  return alerts.sort((a, b) => (a.time < b.time ? 1 : -1)).slice(0, 8);
}
