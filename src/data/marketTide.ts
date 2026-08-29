import { h01, hGauss, hRange } from '../core/rng';
import { RTH_MINUTES } from '../core/calendar';

/*
==================================================
  SLAYER TERMINAL - MARKET TIDE (data/marketTide.ts)

  Call premium against put premium, for the WHOLE
  market, through the session.
==================================================

  §10. Every flow surface on this desk is per-ticker: the tape, the drift,
  the scanner. None of them answers the question a reader asks first in the
  morning — is the market as a whole buying calls or buying puts today.

  IT IS CUMULATIVE, NOT INSTANTANEOUS, and that is the whole design. A
  minute's net premium is noise; the day's RUNNING TOTAL is a tide, and a
  tide that turns is the event worth seeing. So the series only ever adds,
  and the reader's eye is drawn to where the slope changes rather than to
  any single bar.

  THE TURN IS NAMED, because that is the read. `turnedAt` is the last
  minute the net crossed zero, and the words above the chart say which side
  it is on now and when it got there — otherwise a reader has to eyeball a
  crossing point on a chart with no gridline at zero.

  SECTORS AND ETFs SHARE THE SHAPE. The same builder makes SPY/QQQ/IWM lines
  and the eleven sector tides, so a reader comparing them is comparing like
  with like rather than three separately-invented series.
*/

export interface TidePoint {
  /** Minutes since the open, 0…390. */
  min: number;
  /** Cumulative call premium since the open, dollars. */
  callPrem: number;
  /** Cumulative put premium, dollars. */
  putPrem: number;
  /** callPrem − putPrem — the tide itself. */
  net: number;
}

export interface Tide {
  key: string;
  label: string;
  points: TidePoint[];
  /** The latest net. */
  net: number;
  callPrem: number;
  putPrem: number;
  /** Call share of total premium, 0–100. */
  callSharePct: number;
  /** Minute of the last zero crossing, or null if it never turned. */
  turnedAt: number | null;
  /** Which side it is on now. */
  side: 'CALLS' | 'PUTS' | 'FLAT';
}

const STEP = 5;

/**
 * One tide.
 *
 * `bias` shifts the generator's lean so a sector can differ from the market
 * without a second code path — everything else about the shape is shared.
 */
export function buildTide(key: string, label: string, dateIso: string, elapsedMin: number, bias = 0): Tide {
  const points: TidePoint[] = [];
  let call = 0, put = 0;
  let turnedAt: number | null = null;
  let lastSign = 0;

  const upto = Math.min(RTH_MINUTES, Math.max(STEP, elapsedMin));
  for (let min = 0; min <= upto; min += STEP) {
    const seed = `${key}|${dateIso}|${min}`;
    /* Premium arrives in bursts, heaviest at the open and into the close —
       the same session shape the rest of the desk uses. */
    const shape = 1 + 1.8 * Math.exp(-min / 45) + 1.2 * Math.exp(-(RTH_MINUTES - min) / 40);
    const gross = hRange(`${seed}|g`, 4e6, 2.4e7) * shape;
    const lean = Math.tanh(hGauss(`${seed}|l`) * 0.8 + bias);
    call += gross * (0.5 + lean * 0.28);
    put += gross * (0.5 - lean * 0.28);
    const net = call - put;
    const sign = net > 0 ? 1 : net < 0 ? -1 : 0;
    if (lastSign !== 0 && sign !== 0 && sign !== lastSign) turnedAt = min;
    if (sign !== 0) lastSign = sign;
    points.push({ min, callPrem: call, putPrem: put, net });
  }

  const total = call + put;
  const net = call - put;
  return {
    key, label, points, net, callPrem: call, putPrem: put,
    callSharePct: total > 0 ? (call / total) * 100 : 50,
    turnedAt,
    /* Under a percent of the day's premium either way is not a side. */
    side: total > 0 && Math.abs(net) / total < 0.01 ? 'FLAT' : net > 0 ? 'CALLS' : 'PUTS',
  };
}

export const SECTORS = [
  { key: 'XLK', label: 'Technology' }, { key: 'XLF', label: 'Financials' },
  { key: 'XLE', label: 'Energy' }, { key: 'XLV', label: 'Health care' },
  { key: 'XLY', label: 'Consumer disc.' }, { key: 'XLP', label: 'Staples' },
  { key: 'XLI', label: 'Industrials' }, { key: 'XLU', label: 'Utilities' },
  { key: 'XLRE', label: 'Real estate' }, { key: 'XLB', label: 'Materials' },
  { key: 'XLC', label: 'Communications' },
];

export const ETFS = [
  { key: 'SPY', label: 'S&P 500' },
  { key: 'QQQ', label: 'Nasdaq 100' },
  { key: 'IWM', label: 'Russell 2000' },
];

/** Every sector's tide, strongest call-lean first. */
export function sectorTides(dateIso: string, elapsedMin: number): Tide[] {
  return SECTORS
    .map(s => buildTide(s.key, s.label, dateIso, elapsedMin, (h01(`${s.key}|${dateIso}|bias`) - 0.5) * 1.1))
    .sort((a, b) => b.callSharePct - a.callSharePct);
}

export function etfTides(dateIso: string, elapsedMin: number): Tide[] {
  return ETFS.map(e => buildTide(e.key, e.label, dateIso, elapsedMin, (h01(`${e.key}|${dateIso}|bias`) - 0.5) * 0.8));
}

/** The words over the chart — which side, and when it got there. */
export function tideRead(t: Tide): string {
  const dollars = (n: number) => `$${(Math.abs(n) / 1e6).toFixed(0)}M`;
  if (t.side === 'FLAT') return 'Call and put premium are level — the market has not picked a side today.';
  const side = t.side === 'CALLS' ? 'calls' : 'puts';
  if (t.turnedAt === null) {
    return `${dollars(t.net)} more premium into ${side}, and it has been that way since the open.`;
  }
  const h = Math.floor((570 + t.turnedAt) / 60), m = (570 + t.turnedAt) % 60;
  return `${dollars(t.net)} more premium into ${side} — the tide turned at ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}.`;
}
