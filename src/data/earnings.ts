/*
==================================================
  SLAYER TERMINAL - EARNINGS ENGINE (earnings.ts)
  The earnings hub's brain: for every upcoming
  report, price the implied move against realized
  history, weigh revisions, flow and technicals,
  and land on PLAY / FADE / SKIP with the strategy
  that matches the mispricing.
==================================================
*/

import { dayKey, hGauss, h01, hRange } from '../core/rng';
import { tickerSentiment } from './news';
import { UNIVERSE } from './universe';
import type { Sector } from './universe';

export type EarningsVerdict = 'PLAY' | 'FADE' | 'SKIP';
export type ReportSlot = 'BMO' | 'AMC';

export interface EarningsEvent {
  ticker: string;
  name: string;
  sector: Sector;
  price: number;
  /** Sessions until the report, 0 = today */
  daysOut: number;
  dateLabel: string;
  slot: ReportSlot;
  /** Straddle-implied move for the print, % */
  impliedMovePct: number;
  /** Average absolute move over the last 8 prints, % */
  histAvgMovePct: number;
  /** implied ÷ realized — the mispricing everything hangs on */
  richness: number;
  /** % of the last 8 quarters beaten */
  beatRate8q: number;
  /** −1…+1 — analyst estimate drift into the print */
  revisionTrend: number;
  ivRank: number;
  /** 0–100 setup quality into the report */
  technicalScore: number;
  /** −1…+1 — options flow lean into the event */
  flowLean: number;
  verdict: EarningsVerdict;
  strategy: string;
  rationale: string;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function dateLabelFor(daysOut: number): string {
  const d = new Date(Date.now() + daysOut * 86400000);
  return `${DAY_NAMES[d.getDay()]} ${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

function decide(e: Omit<EarningsEvent, 'verdict' | 'strategy' | 'rationale'>): Pick<EarningsEvent, 'verdict' | 'strategy' | 'rationale'> {
  const im = e.impliedMovePct.toFixed(1);
  const hm = e.histAvgMovePct.toFixed(1);
  const rich = e.richness;

  // Directional edge: do revisions, flow and the chart agree?
  const dirScore =
    (e.revisionTrend > 0.15 ? 1 : e.revisionTrend < -0.15 ? -1 : 0) +
    (e.flowLean > 0.2 ? 1 : e.flowLean < -0.2 ? -1 : 0) +
    (e.technicalScore >= 62 ? 1 : e.technicalScore <= 40 ? -1 : 0);

  if (rich >= 1.3) {
    // Premium rich — the fade is the trade unless everything screams direction.
    if (Math.abs(dirScore) >= 3) {
      const long = dirScore > 0;
      return {
        verdict: 'PLAY',
        strategy: long
          ? `Directional, defined risk — ${im}% is rich, so spread it: call vertical through the print instead of naked longs.`
          : `Directional, defined risk — put vertical through the print; rich straddle makes outright puts overpay.`,
        rationale: `Implied ${im}% vs ${hm}% realized (${rich.toFixed(2)}×) is expensive, but revisions, flow and the chart all point the same way — take direction, sell the fat premium against it.`,
      };
    }
    return {
      verdict: 'FADE',
      strategy: `Fade the move — implied ${im}% is ${rich.toFixed(2)}× the ${hm}% it actually averages. Iron condor / short strangle outside the expected move.`,
      rationale: `The straddle prices ${rich.toFixed(2)}× realized history with a ${e.beatRate8q}% beat rate already known to the street — the surprise is paid for. Premium sellers have the edge.`,
    };
  }

  if (rich <= 0.85) {
    return {
      verdict: 'PLAY',
      strategy: `Own the vol — straddle/strangle into the print. Implied ${im}% under-prices an ${hm}% average mover.`,
      rationale: `Rare setup: the market is charging less than this name historically moves (${rich.toFixed(2)}×). ${
        e.beatRate8q >= 60 ? `A ${e.beatRate8q}% beat rate adds directional tailwind — lean the strangle long.` : 'Direction unclear — own both sides and let the print pick.'
      }`,
    };
  }

  if (Math.abs(dirScore) >= 2) {
    const long = dirScore > 0;
    return {
      verdict: 'PLAY',
      strategy: long
        ? 'Directional long into the report — call spread or stock-with-stop; fair premium keeps it simple.'
        : 'Directional short into the report — put spread; fair premium, so no need to get clever.',
      rationale: `Premium is fair (${rich.toFixed(2)}×), so the trade is the direction: ${
        long
          ? `estimates drifting up (${(e.revisionTrend * 100).toFixed(0)}), flow accumulating, setup score ${e.technicalScore}.`
          : `estimates drifting down (${(e.revisionTrend * 100).toFixed(0)}), flow distributive, setup score ${e.technicalScore}.`
      }`,
    };
  }

  return {
    verdict: 'SKIP',
    strategy: 'No trade into the print — take the reaction instead: trade day-two continuation once the gap direction is known.',
    rationale: `Premium is fair (${rich.toFixed(2)}×) and the directional sleeves disagree — there's no mispricing to harvest and no edge to lean on. Capital is better spent where there is one.`,
  };
}

const REPORT_COUNT = 14;

export function buildEarningsCalendar(): EarningsEvent[] {
  const day = dayKey();
  // Deterministically choose which names report in the window
  const reporters = [...UNIVERSE]
    .map(u => ({ u, k: h01(`${u.ticker}-${day}-er-pick`) }))
    .sort((a, b) => a.k - b.k)
    .slice(0, REPORT_COUNT)
    .map(x => x.u);

  return reporters
    .map(u => {
      const s = (tag: string) => `${u.ticker}-${day}-er-${tag}`;
      const daysOut = Math.floor(h01(s('d')) * 10);
      const histAvgMovePct = hRange(s('hist'), 2.2, 9.5) * (0.7 + u.beta * 0.35);
      const richness = hRange(s('rich'), 0.7, 1.75);
      const impliedMovePct = histAvgMovePct * richness;
      const base = {
        ticker: u.ticker,
        name: u.name,
        sector: u.sector,
        price: u.px,
        daysOut,
        dateLabel: dateLabelFor(daysOut),
        slot: (h01(s('slot')) > 0.45 ? 'AMC' : 'BMO') as ReportSlot,
        impliedMovePct,
        histAvgMovePct,
        richness,
        beatRate8q: Math.round(hRange(s('beat'), 25, 95) / 12.5) * 12.5,
        revisionTrend: Math.max(-1, Math.min(1, hGauss(s('rev')) * 0.45 + tickerSentiment(u.ticker) * 0.4)),
        ivRank: Math.round(hRange(s('ivr'), 35, 96)),
        technicalScore: Math.round(hRange(s('tech'), 22, 92)),
        flowLean: Math.max(-1, Math.min(1, hGauss(s('flow')) * 0.5)),
      };
      return { ...base, ...decide(base) };
    })
    .sort((a, b) => a.daysOut - b.daysOut || b.impliedMovePct - a.impliedMovePct);
}
