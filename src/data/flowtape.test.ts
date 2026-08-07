import { describe, it, expect } from 'vitest';
import { TAPE_ID_CEILING, buildSessionTape, enrichPrint, sentimentOf, summarizeTape } from './flowtape';
import type { TapeOrder } from '../types/market';
import { aggressorSide, isSweep, isMultiLeg, isDeltaHedged, isDirectional } from '../types/conditions';

/**
 * P3.1 — the enrichment stamps OPRA condition codes on every print and derives
 * side/sweep from them, so the tape carries the exchange fact rather than an
 * inference. These assertions hold for any deterministic draw.
 */
function sampleTape() {
  const prints = [];
  let id = 0;
  for (let i = 0; i < 500; i++) {
    const order: TapeOrder = {
      time: '10:00:00',
      ticker: 'SPY',
      strike: (400 + (i % 45)).toFixed(2),
      type: i % 2 === 0 ? 'C' : 'P',
      size: 10 + (i % 240),
      orderType: i % 3 === 0 ? 'SWEEP' : 'BLOCK',
      side: i % 2 === 0 ? 'ASK' : 'BID',
    };
    prints.push(enrichPrint(order, id++));
  }
  return prints;
}

describe('P3.1 — condition codes + aggressor on every print', () => {
  const prints = sampleTape();

  it('every print carries a conditions array', () => {
    for (const p of prints) expect(Array.isArray(p.conditions)).toBe(true);
  });

  it('side reads from the aggressor code and sweep from condition 95', () => {
    for (const p of prints) {
      expect(p.side).toBe(aggressorSide(p.conditions) ?? 'MID');
      expect(p.sweep).toBe(isSweep(p.conditions));
    }
  });

  it('a multi-leg code implies the print also reports legs > 1', () => {
    for (const p of prints) {
      if (isMultiLeg(p.conditions)) expect(p.legs).toBeGreaterThan(1);
    }
  });

  it('the distribution is sensible and non-uniform', () => {
    const withAgg = prints.filter(p => aggressorSide(p.conditions) !== null).length;
    const sweeps = prints.filter(p => isSweep(p.conditions)).length;
    const multi = prints.filter(p => isMultiLeg(p.conditions)).length;
    const hedged = prints.filter(p => isDeltaHedged(p.conditions)).length;

    // Most prints carry an exchange aggressor; a mid minority carries none.
    expect(withAgg).toBeGreaterThan(prints.length * 0.6);
    expect(withAgg).toBeLessThan(prints.length);
    // Sweeps and multi-leg are meaningful minorities; delta-hedged is rarer than
    // multi-leg; every bucket has at least one member across the session.
    expect(sweeps).toBeGreaterThan(0);
    expect(multi).toBeGreaterThan(0);
    expect(hedged).toBeGreaterThan(0);
    expect(hedged).toBeLessThan(multi);
  });
});

describe('one print, one identity — regardless of how much tape a desk asks for', () => {
  /*
    enrichPrint seeds its hash with the print's id, so the id IS the print's
    identity. Each Trace tab used to derive it as `seed.length - i` off a
    different window (400 on Live Tape, 600 on Gamma Tape and Informed Flow), so
    the SAME order enriched into a different contract, side, premium and
    sentiment on each tab. These pin the fix: a shorter window must be a PREFIX
    of a longer one, never a different reality.
  */
  const deep = buildSessionTape(600);
  const shallow = buildSessionTape(400);

  it('gives the newest print the same identity at every window depth', () => {
    expect(deep.length).toBeGreaterThan(0);
    expect(shallow.length).toBeGreaterThan(0);
    expect(shallow[0].id).toBe(TAPE_ID_CEILING);
    expect(deep[0].id).toBe(TAPE_ID_CEILING);
  });

  it('is a strict prefix — every overlapping print is the SAME contract', () => {
    const n = Math.min(deep.length, shallow.length);
    expect(n).toBeGreaterThan(50);
    for (let i = 0; i < n; i++) {
      // Identity, and everything the desks render off it.
      expect(shallow[i].id).toBe(deep[i].id);
      expect(shallow[i].ticker).toBe(deep[i].ticker);
      expect(shallow[i].strike).toBe(deep[i].strike);
      expect(shallow[i].right).toBe(deep[i].right);
      expect(shallow[i].side).toBe(deep[i].side);
      expect(shallow[i].premium).toBe(deep[i].premium);
      expect(shallow[i].expiry).toBe(deep[i].expiry);
      expect(sentimentOf(shallow[i])).toBe(sentimentOf(deep[i]));
      expect(shallow[i].greeks?.gamma).toBe(deep[i].greeks?.gamma);
    }
  });

  it('keeps ids strictly descending, so higher id still means newer', () => {
    // The unread pill and the pause-pending count both read ids as recency, and
    // live prints continue upward from the ceiling.
    for (let i = 1; i < deep.length; i++) expect(deep[i].id).toBeLessThan(deep[i - 1].id);
    expect(deep[0].id).toBe(TAPE_ID_CEILING);
  });
});

describe('P4.2 — directional vs structure premium', () => {
  const prints = sampleTape();
  const summary = summarizeTape(prints);

  it('a multi-leg or delta-hedged print never carries a directional sentiment', () => {
    for (const p of prints) {
      if (!isDirectional(p.conditions)) expect(sentimentOf(p)).toBe('NEUTRAL');
    }
    // and the clean-flow contract holds both ways
    for (const p of prints) {
      if (isMultiLeg(p.conditions) || isDeltaHedged(p.conditions)) expect(isDirectional(p.conditions)).toBe(false);
    }
  });

  it('splits every dollar into exactly one of directional or structure', () => {
    const byHand = prints.reduce(
      (a, p) => {
        if (isDirectional(p.conditions)) a.dir += p.premium;
        else a.str += p.premium;
        return a;
      },
      { dir: 0, str: 0 }
    );
    expect(summary.directionalPremium).toBe(byHand.dir);
    expect(summary.structurePremium).toBe(byHand.str);
    // The two partitions cover the whole tape, no double counting.
    expect(summary.directionalPremium + summary.structurePremium).toBe(summary.totalPremium);
    // Structure is a real, non-empty slice on any session-sized draw.
    expect(summary.structurePremium).toBeGreaterThan(0);
  });

  it('keeps structure premium out of the bull/bear net', () => {
    // bull + bear counts only directional, non-MID prints, so it can never
    // exceed the directional pool — the net is a read of that pool alone.
    expect(summary.bullPremium + summary.bearPremium).toBeLessThanOrEqual(summary.directionalPremium + 1e-6);
  });
});
