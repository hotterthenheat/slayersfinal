import { h01, hGauss, hRange } from '../core/rng';

/*
==================================================
  SLAYER TERMINAL - CROSS-ASSET (data/crossAsset.ts)

  The four instruments that decide the open while
  the equity tape is shut.
==================================================

  §14, and the reason it belongs on a 0DTE desk at all: the gap is not
  formed by equities. It is formed overnight by the dollar, by rates, by
  whatever risk did in Asia — and a reader looking at a 09:30 chart sees the
  RESULT of that with none of the cause.

  FOUR, NOT FORTY. USDJPY is the carry trade and the cleanest overnight risk
  proxy on the board; EURUSD is the dollar itself; BTC trades every hour of
  the weekend and is the only instrument that prices risk while everything
  else is closed; gold is the fear bid. A longer list would be a data
  browser rather than a read.

  CORRELATION IS SIGNED AND WINDOWED, and stated with its sample count. A
  60-bar correlation off a 63-bar overnight is one number away from
  meaningless, so `samples` rides with it and the UI says "measured over N"
  rather than presenting a bare coefficient as fact.

  THE SIGN CONVENTION IS THE READER'S, NOT THE MATHS'. A rising USDJPY is
  risk-ON for equities (carry working), a rising gold is risk-OFF, and a
  rising dollar index is risk-off for US large caps. So each instrument
  carries `riskOnWhenUp`, and the strip words the move as RISK-ON or
  RISK-OFF rather than leaving the reader to remember which way round the
  yen trades.

  DETERMINISTIC PER (SYMBOL, DATE), like every other simulated surface here.
*/

export type CrossAssetKey = 'USDJPY' | 'EURUSD' | 'BTC' | 'XAU';

export interface CrossAssetSpec {
  key: CrossAssetKey;
  label: string;
  /** What it is, in the words a reader would use. */
  role: string;
  decimals: number;
  /** A rise in this reads as risk-ON for equities. */
  riskOnWhenUp: boolean;
  base: number;
  /** Typical daily move, as a fraction — sets the series' amplitude. */
  vol: number;
}

export const CROSS_ASSETS: CrossAssetSpec[] = [
  { key: 'USDJPY', label: 'USD/JPY', role: 'the carry trade — the cleanest overnight risk proxy', decimals: 2, riskOnWhenUp: true, base: 154.2, vol: 0.006 },
  { key: 'EURUSD', label: 'EUR/USD', role: 'the dollar itself — a falling euro is a bid for dollars', decimals: 4, riskOnWhenUp: true, base: 1.086, vol: 0.005 },
  { key: 'BTC', label: 'BTC/USD', role: 'prices risk when every other market is shut', decimals: 0, riskOnWhenUp: true, base: 96_400, vol: 0.028 },
  { key: 'XAU', label: 'Gold', role: 'the fear bid — it rises when equities are not wanted', decimals: 1, riskOnWhenUp: false, base: 2_642, vol: 0.009 },
];

export interface CrossAssetBar {
  /** Minutes since 18:00 ET — the same axis the overnight session uses. */
  min: number;
  value: number;
}

export interface CrossAssetRead {
  spec: CrossAssetSpec;
  bars: CrossAssetBar[];
  last: number;
  /** Change since 18:00 ET, the overnight window. */
  change: number;
  changePct: number;
  /** What the move says for equities, given this instrument's convention. */
  risk: 'RISK-ON' | 'RISK-OFF' | 'FLAT';
  /** Correlation against the SPX proxy over the same window, −1…1. */
  corr: number;
  samples: number;
}

const STEP = 15;
const SPAN = 930; // 18:00 ET → 09:30

/** One instrument's overnight path. */
function series(spec: CrossAssetSpec, dateIso: string): CrossAssetBar[] {
  const bars: CrossAssetBar[] = [];
  let v = spec.base * (1 + (h01(`${spec.key}|${dateIso}|anchor`) - 0.5) * 0.02);
  for (let min = 0; min <= SPAN; min += STEP) {
    const seed = `${spec.key}|${dateIso}|${min}`;
    v = Math.max(1e-6, v * (1 + hGauss(seed) * spec.vol * 0.09));
    bars.push({ min, value: v });
  }
  return bars;
}

/** Pearson correlation on two equal-length series of returns. */
export function correlate(a: readonly number[], b: readonly number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 3) return 0;
  let ma = 0, mb = 0;
  for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
  ma /= n; mb /= n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma, y = b[i] - mb;
    num += x * y; da += x * x; db += y * y;
  }
  const den = Math.sqrt(da * db);
  return den === 0 ? 0 : Math.max(-1, Math.min(1, num / den));
}

const returns = (bars: readonly CrossAssetBar[]): number[] =>
  bars.slice(1).map((b, i) => (b.value - bars[i].value) / bars[i].value);

/**
 * The strip's four reads.
 *
 * `equityBars` is the overnight equity path (the futures session), so the
 * correlation is against what the reader actually trades rather than against
 * a second synthetic index.
 */
export function readCrossAssets(dateIso: string, equityBars: readonly { min: number; close: number }[]): CrossAssetRead[] {
  const eqRet = returns(equityBars.map(b => ({ min: b.min, value: b.close })));
  return CROSS_ASSETS.map(spec => {
    const bars = series(spec, dateIso);
    const last = bars[bars.length - 1].value;
    const first = bars[0].value;
    const changePct = ((last - first) / first) * 100;
    /* A move under a tenth of a percent is noise, not a signal — saying
       FLAT is more honest than rounding it into a direction. */
    const flat = Math.abs(changePct) < 0.1;
    const up = changePct > 0;
    const risk: CrossAssetRead['risk'] = flat
      ? 'FLAT'
      : (up === spec.riskOnWhenUp ? 'RISK-ON' : 'RISK-OFF');
    const corr = correlate(returns(bars), eqRet);
    return {
      spec, bars, last,
      change: last - first,
      changePct,
      risk,
      corr,
      samples: Math.min(returns(bars).length, eqRet.length),
    };
  });
}

/** The one-line read across all four — what the overnight is actually saying. */
export function overnightRiskRead(reads: readonly CrossAssetRead[]): { verdict: string; tone: 'bull' | 'bear' | 'neutral'; detail: string } {
  const on = reads.filter(r => r.risk === 'RISK-ON').length;
  const off = reads.filter(r => r.risk === 'RISK-OFF').length;
  if (on === 0 && off === 0) return { verdict: 'QUIET', tone: 'neutral', detail: 'Nothing moved enough overnight to call a side.' };
  if (on >= 3) return { verdict: 'RISK-ON', tone: 'bull', detail: `${on} of four leaning risk-on into the open.` };
  if (off >= 3) return { verdict: 'RISK-OFF', tone: 'bear', detail: `${off} of four leaning risk-off into the open.` };
  return { verdict: 'MIXED', tone: 'neutral', detail: `${on} risk-on against ${off} risk-off — the overnight disagrees with itself.` };
}
