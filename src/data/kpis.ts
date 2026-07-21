/*
==================================================
  SLAYER TERMINAL - HEADER KPIS (kpis.ts)
  One derivation of the market stat strip every
  ticker-scoped page shows in its header band, so
  Pulse / Compass / Trace / Pinpoint / Prove It read
  the same numbers the same way.
==================================================
*/

import { fmtUsd } from './gex';
import type { MarketSnapshot } from '../types/market';
import type { RibbonStat } from '../components/ui/StatRibbon';

export function deriveMarketKpis(snapshot: MarketSnapshot): RibbonStat[] {
  const { spot, changePercent, chain, plan, indicators } = snapshot;

  const netGex = chain.reduce((a, n) => a + n.netGex, 0);
  // Bias threshold scales with the largest single-strike exposure (the "king")
  let kingAbs = 0;
  for (const n of chain) kingAbs = Math.max(kingAbs, Math.abs(n.netGex));
  const threshold = kingAbs * 0.8;
  const bias = netGex > threshold ? 'BULLISH' : netGex < -threshold ? 'BEARISH' : 'NEUTRAL';
  const spotVsFlip = ((spot - plan.flipZone) / spot) * 100;

  // Eight highest-signal cells — kept tight so the strip sits on one line next
  // to a ticker search without clipping at 1280–1440.
  return [
    { label: 'Spot', value: `$${spot.toFixed(2)}`, tone: 'neutral' },
    {
      label: 'Chg',
      value: `${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%`,
      tone: changePercent >= 0 ? 'bull' : 'bear',
    },
    { label: 'Net GEX', value: fmtUsd(netGex), tone: netGex >= 0 ? 'bull' : 'bear' },
    { label: 'Flip', value: `$${plan.flipZone.toFixed(2)}`, tone: 'select' },
    { label: 'Call Wall', value: `$${plan.resistanceWall.toFixed(2)}`, tone: 'bull' },
    { label: 'Put Wall', value: `$${plan.supportWall.toFixed(2)}`, tone: 'bear' },
    { label: 'vs Flip', value: `${spotVsFlip >= 0 ? '+' : ''}${spotVsFlip.toFixed(2)}%`, tone: spotVsFlip >= 0 ? 'bull' : 'bear' },
    { label: 'Bias', value: bias, tone: bias === 'BULLISH' ? 'bull' : bias === 'BEARISH' ? 'bear' : 'neutral', pill: true },
  ];
}
