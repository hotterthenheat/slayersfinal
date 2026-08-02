/*
==================================================
  SLAYER TERMINAL - RANKED TARGETS MODEL (rankedtargets.ts)
  Scores every strike 0–100 by structural priority:
  gamma weight, open interest, neighbor dominance and
  spot proximity. The layer between the raw exposure
  map and Compass's trade calls. Placeholder —
  swaps for the real scoring engine later.
==================================================
*/

import { buildLevels, pinStrike } from './gex';
import type { MarketSnapshot } from '../types/market';
import type { HedgingClass, RankedTarget, RankedTargetsView, TargetTag } from '../types/gex';

/**
 * Window the cockpit's key-levels rail and the positioning map both use.
 *
 * The pin is the one structural level that legitimately depends on how many
 * strikes are in view (gex.ts `pinStrike`), so this table names the strike the
 * rail names rather than the book-wide heaviest-OI strike it used to scan for
 * itself. Those were $10 apart on AAPL — a PIN badge here contradicting a PIN
 * price two screens over is worse than no badge.
 */
const PIN_HALF = 10;

// ---- deterministic RNG ------------------------------------------------------
function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function h01(seed: string): number {
  return (hash(seed) % 1000) / 1000;
}

export function buildRankedTargets(snapshot: MarketSnapshot): RankedTargetsView {
  const { ticker, spot, chain } = snapshot;
  const nodes = [...chain].sort((a, b) => a.strike - b.strike);

  // Synthesized session volume per strike (deterministic, OI-anchored)
  const volumes = nodes.map(n => {
    const j = h01(`${ticker}-${n.strike}-tvol`);
    return Math.round((n.callOI + n.putOI) * (0.2 + j * 0.7));
  });

  // Structural landmarks for tagging. Read from the single derivation, not
  // re-scanned here: this table's WALL / KING / PIN badges name the same strikes
  // the levels rail, the strike chart and the positioning map name, so a reader
  // moving between them is never told the king is in two places at once.
  const { callWall, putWall, king } = buildLevels(snapshot);
  const pin = pinStrike(snapshot, PIN_HALF);

  // Scales, not levels — these normalize the score's terms and set the "strong
  // gamma" cut. Book-wide because the table ranks the whole chain.
  let maxAll = 0;
  let maxOI = 0;
  for (const n of nodes) {
    maxAll = Math.max(maxAll, Math.abs(n.netGex));
    maxOI = Math.max(maxOI, n.callOI + n.putOI);
  }

  const maxVolume = Math.max(...volumes, 1);
  const maxTotalOI = maxOI || 1;
  const maxAbsGex = Math.max(1, maxAll);

  const targets: RankedTarget[] = nodes.map((n, i) => {
    const volume = volumes[i];

    // Neighbor dominance: this strike's volume vs the average of ±2 neighbors
    let neighborSum = 0;
    let neighborCount = 0;
    for (const off of [-2, -1, 1, 2]) {
      const v = volumes[i + off];
      if (v !== undefined) {
        neighborSum += v;
        neighborCount++;
      }
    }
    const nbr = neighborCount > 0 ? volume / (neighborSum / neighborCount || 1) : 1;

    // Composite priority: gamma weight leads, then OI, isolation, proximity
    const gexN = Math.abs(n.netGex) / (maxAll || 1);
    const oiN = (n.callOI + n.putOI) / maxTotalOI;
    const nbrN = Math.min(nbr / 3, 1);
    const proxN = Math.max(0, 1 - Math.abs(n.strike - spot) / (spot * 0.02));
    const score = Math.round(100 * (0.4 * gexN + 0.22 * oiN + 0.22 * nbrN + 0.16 * proxN));

    const bps = ((n.strike - spot) / spot) * 10000;

    const tags: TargetTag[] = [];
    if (n.strike === callWall || n.strike === putWall) tags.push('WALL');
    if (n.strike === pin) tags.push('PIN');
    if (n.strike === king) tags.push('KING');
    if (Math.abs(bps) <= 20) tags.push('SPOT TARGET');

    const strongGex = Math.abs(n.netGex) > maxAll * 0.35;
    const hedgingClass: HedgingClass =
      n.strike === pin
        ? 'MAGNET'
        : strongGex
          ? n.strike < spot
            ? 'DOWNSIDE CUSHION'
            : 'UPSIDE RESISTANCE'
          : 'NEUTRAL';

    return {
      rank: 0, // assigned after sort
      strike: n.strike,
      score,
      bps: Math.round(bps),
      volume,
      nbr: Number(nbr.toFixed(2)),
      netGex: n.netGex,
      openInterest: n.callOI + n.putOI,
      callVol: Math.round(volume * (n.callOI / (n.callOI + n.putOI || 1))),
      putVol: Math.round(volume * (n.putOI / (n.callOI + n.putOI || 1))),
      pressure: n.strike >= spot ? 'RESISTANCE' : 'SUPPORT',
      hedgingClass,
      tags,
    };
  });

  targets.sort((a, b) => b.score - a.score);
  targets.forEach((t, i) => (t.rank = i + 1));

  return { ticker, spot, targets, maxVolume, maxAbsGex };
}
