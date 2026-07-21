/*
==================================================
  SLAYER TERMINAL - CODE-RAIN POOL
  The scrolling terminal lines behind the hero — the
  same grammar as the real slayerterminal.com rain:
  short machine output, tinted by desk.
    steel = SkyVision (setup scan / rank / score)
    amber = Pinpoint AI (dealer flow / GEX / walls)
    dim   = everything else
  GENERATED_POOL is appended by the line-generation
  pass; keeping it a separate array makes refreshes a
  one-constant swap.
==================================================
*/

export type RainTint = 'steel' | 'amber' | 'bright' | '';

/** Hand-authored base — ported from the live site, then broadened. */
const BASE_POOL: string[] = [
  // SkyVision — setup scanner
  'chain = spx.chain(dte=0)',
  'setups = skyvision.scan(chain)',
  'top = setups.rank().head(5)',
  'skyvision.scan() -> 4 setups',
  'setup.score   # 91',
  'setup.ev      # +0.44R',
  'score = kelly(edge, win_rate)',
  'ev = sum(p(x) * payoff(x))',
  'upper = ema + k * atr',
  'reprice(S, vol - 0.012 * dPct)',
  'P_touch = 0.67',
  'if px >= upper: return HOLDING',
  'if px <= lower: return FAILING',
  'return TESTING',
  "chain('SPX', 0DTE).rank()",
  'setups = rank(chain, strat)',
  'edge = win*payoff - loss',
  'setup.grade   # A-',
  // Pinpoint AI — dealer flow
  'flow = pinpoint.read(chain)',
  'flow.gex_net   # -1.84bn',
  'flow.flip      # 5,938',
  'flow.vanna     # bearish < 5940',
  'flow.charm     # sell accel',
  'pinpoint.dealers() -> -1.84bn',
  'dealers.hedge -> accel down',
  'NET GEX  -1.84bn   FLIP  5,938',
  'DEX +0.39   VEX 0.72',
  'CALL WALL 6050   -1.9bn',
  'PUT  WALL 5900   +2.4bn',
  'vanna: bearish below 5,940',
  'charm: sell accel into close',
  'regime: neg gamma',
  'gamma flip crossed @ 5,938',
  'dealers short gamma -> chase',
  // Contract scores
  'SPX  5938P  0DTE   91',
  'SPX  5985C  0DTE   88',
  'QQQ   495P  0DTE   82',
  'NDX 21180P  1DTE   76',
  'IWM   225C  0DTE   69',
  'NVDA  128C  0DTE   84',
  'TSLA  250P  1DTE   73',
  'AAPL  230C  wkly   66',
  // Live terminal output
  'SLAYER/LIVE  09:41:22 ET',
  '0DTE  filled  5938P  +31%',
  'P_cal 0.64   EV +0.41R',
  'ack  order 8842  working',
  'slayer:~ $',
];

/** Filled in by the generation pass — kept separate so a refresh is one swap. */
export const GENERATED_POOL: string[] = [];

/** Deduped union, base first. */
export const RAIN_POOL: string[] = (() => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of [...BASE_POOL, ...GENERATED_POOL]) {
    const k = line.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!line || seen.has(k)) continue;
    seen.add(k);
    out.push(line);
  }
  return out;
})();

/** Desk tint — steel for SkyVision, amber for Pinpoint/dealer-flow. */
export function tintFor(s: string): RainTint {
  const l = s.toLowerCase();
  if (
    l.includes('skyvision') || l.includes('setup') || l.includes('scan') ||
    l.includes('rank') || l.includes('score') || l.includes('kelly') ||
    l.includes('reprice') || l.includes('p_touch') || l.includes('holding') ||
    l.includes('testing') || l.includes('failing') || l.includes('grade') ||
    l.includes('edge') || l.includes('ev ') || l.includes('ev\t')
  )
    return 'steel';
  if (
    l.includes('pinpoint') || l.includes('gex') || l.includes('dex') ||
    l.includes('vex') || l.includes('flip') || l.includes('dealer') ||
    l.includes('wall') || l.includes('vanna') || l.includes('charm') ||
    l.includes('accel') || l.includes('regime') || l.includes('gamma')
  )
    return 'amber';
  return 'bright';
}
