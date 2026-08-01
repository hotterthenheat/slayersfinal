import { describe, it } from 'vitest';
import { buildNewsFeed } from './news';
import { buildNewsIntel } from './newsintel';
import type { MarketSnapshot } from '../types/market';

describe('ni', () => {
  it('prints', () => {
    const feed = buildNewsFeed();
    const ticker = feed.find(n => n.ticker)!.ticker!;
    const chain = [140, 145, 150].map(strike => ({ strike, callOI: 4000, putOI: 3000, netDex: 1200 }));
    const snap = { ticker, spot: 145, chain, plan: { flipZone: 143.2, resistanceWall: 150.5 } } as unknown as MarketSnapshot;
    const t0 = Date.now();
    const v = buildNewsIntel(snap);
    console.log('ticker', ticker, 'ms', Date.now() - t0, 'headlines', v.headlines.length);
    for (const h of v.headlines.slice(0, 3)) {
      console.log('>', h.category, '|', h.headline.slice(0, 62));
      for (const a of h.analogs) console.log('   ', String(a.similarityPct).padStart(3), a.when.padEnd(10), a.descriptor.padEnd(48), a.outcome1dPct.toFixed(1) + '%', a.followThrough ? 'held' : 'faded');
    }
  });
});
