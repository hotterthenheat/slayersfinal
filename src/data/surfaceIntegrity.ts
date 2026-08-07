/*
==================================================
  SLAYER TERMINAL - SURFACE INTEGRITY (surfaceIntegrity.ts)  [What-Else]
  A vol surface is not just a picture — it is a set of prices that have to hold
  together, or it implies free money and a negative probability. This runs the
  two arbitrage checks every desk should run before trusting a surface, plus a
  smoothness sanity, and reports where (if anywhere) the surface breaks.

    - CALENDAR: total variance (σ²·t) must not fall as expiry lengthens at a
      fixed moneyness. A longer option worth less variance than a shorter one is
      a calendar arbitrage.
    - BUTTERFLY: undiscounted call prices must be convex in strike at a fixed
      expiry. A negative butterfly spread is a negative risk-neutral density —
      the surface is pricing a probability below zero.
    - SMOOTHNESS: no absurd jump in implied vol between adjacent strikes, the
      fingerprint of a bad fit rather than a real skew.

  Prices come from the ONE Black-Scholes pricer (core/contractScore, exported in
  P2.2), read off the Vol Lab's own surface (data/vollab.ts), so the check grades
  exactly the surface the desk draws.
==================================================
*/

import { buildVolLab } from './vollab';
import { blackScholes } from '../core/contractScore';
import type { IvSurfaceData } from '../types/gex';

export type IntegrityKey = 'calendar' | 'butterfly' | 'smoothness';

export interface IntegrityCheck {
  key: IntegrityKey;
  label: string;
  pass: boolean;
  /** Violated adjacencies. */
  violations: number;
  /** Adjacencies examined. */
  total: number;
  /** The worst single violation, for the read-out. */
  worst: { dte: number; moneyness: number; detail: string } | null;
  note: string;
}

export interface SurfaceIntegrityView {
  ticker: string;
  checks: IntegrityCheck[];
  /** 0-100: share of examined adjacencies that hold, across all checks. */
  score: number;
  clean: boolean;
  read: string;
}

/** Run the checks on a given surface — extracted so violation detection is
    directly testable with a crafted good or arbitraged surface. */
export function inspectSurface(ticker: string, surface: IvSurfaceData): SurfaceIntegrityView {
  const { dte, moneyness, cells, forward } = surface;

  // ---- calendar: σ²·t non-decreasing in t at fixed moneyness ----------------
  let calViol = 0;
  let calTotal = 0;
  let calWorst: IntegrityCheck['worst'] = null;
  let calWorstMag = 0;
  for (let mi = 0; mi < moneyness.length; mi++) {
    for (let ti = 1; ti < dte.length; ti++) {
      const wPrev = Math.pow(cells[ti - 1][mi] / 100, 2) * (dte[ti - 1] / 365);
      const wCur = Math.pow(cells[ti][mi] / 100, 2) * (dte[ti] / 365);
      calTotal++;
      const drop = wPrev - wCur;
      if (drop > 1e-6) {
        calViol++;
        if (drop > calWorstMag) {
          calWorstMag = drop;
          calWorst = { dte: dte[ti], moneyness: moneyness[mi], detail: `variance fell ${(drop * 100).toFixed(3)} from ${dte[ti - 1]}d to ${dte[ti]}d` };
        }
      }
    }
  }

  // ---- butterfly: call prices convex in strike at fixed expiry --------------
  // tolerance scales with the underlying so a $500 name and a $40 name are held
  // to the same relative bar.
  const btol = forward * 2e-4;
  let bViol = 0;
  let bTotal = 0;
  let bWorst: IntegrityCheck['worst'] = null;
  let bWorstMag = 0;
  for (let ti = 0; ti < dte.length; ti++) {
    const prices = moneyness.map((m, mi) => blackScholes(forward, forward * m, cells[ti][mi] / 100, dte[ti], 'C').price);
    for (let mi = 1; mi < moneyness.length - 1; mi++) {
      const fly = prices[mi - 1] - 2 * prices[mi] + prices[mi + 1];
      bTotal++;
      if (fly < -btol) {
        bViol++;
        const mag = -fly;
        if (mag > bWorstMag) {
          bWorstMag = mag;
          bWorst = { dte: dte[ti], moneyness: moneyness[mi], detail: `butterfly ${fly.toFixed(4)} at ${(moneyness[mi] * 100).toFixed(0)}% K/F` };
        }
      }
    }
  }

  // ---- smoothness: no absurd IV jump between adjacent strikes ----------------
  const JUMP = 12; // vol points across a 5%-moneyness step reads as a bad fit
  let sViol = 0;
  let sTotal = 0;
  let sWorst: IntegrityCheck['worst'] = null;
  let sWorstMag = 0;
  for (let ti = 0; ti < dte.length; ti++) {
    for (let mi = 1; mi < moneyness.length; mi++) {
      const jump = Math.abs(cells[ti][mi] - cells[ti][mi - 1]);
      sTotal++;
      if (jump > JUMP) {
        sViol++;
        if (jump > sWorstMag) {
          sWorstMag = jump;
          sWorst = { dte: dte[ti], moneyness: moneyness[mi], detail: `${jump.toFixed(1)} vol-point jump at ${(moneyness[mi] * 100).toFixed(0)}% K/F` };
        }
      }
    }
  }

  const checks: IntegrityCheck[] = [
    {
      key: 'calendar',
      label: 'Calendar',
      pass: calViol === 0,
      violations: calViol,
      total: calTotal,
      worst: calWorst,
      note: 'Total variance must not fall as expiry lengthens.',
    },
    {
      key: 'butterfly',
      label: 'Butterfly',
      pass: bViol === 0,
      violations: bViol,
      total: bTotal,
      worst: bWorst,
      note: 'Call prices must stay convex in strike — a negative butterfly is a negative density.',
    },
    {
      key: 'smoothness',
      label: 'Smoothness',
      pass: sViol === 0,
      violations: sViol,
      total: sTotal,
      worst: sWorst,
      note: 'No absurd vol jump between adjacent strikes.',
    },
  ];

  const totalAdj = checks.reduce((a, c) => a + c.total, 0) || 1;
  const totalViol = checks.reduce((a, c) => a + c.violations, 0);
  const score = Math.round(((totalAdj - totalViol) / totalAdj) * 100);
  const clean = totalViol === 0;

  const failed = checks.filter(c => !c.pass);
  const read = clean
    ? `${ticker}'s surface is arbitrage-free across all ${totalAdj} checks — total variance rises with expiry, call prices stay convex, and the smile is smooth.`
    : `${ticker}'s surface holds on ${score}% of ${totalAdj} checks. ${failed.map(c => `${c.label}: ${c.violations} ${c.violations === 1 ? 'break' : 'breaks'}${c.worst ? ` (worst — ${c.worst.detail})` : ''}`).join('; ')}.`;

  return { ticker, checks, score, clean, read };
}

export function buildSurfaceIntegrity(ticker: string, spot: number, iv: number): SurfaceIntegrityView {
  const { surface } = buildVolLab(ticker, spot, iv);
  return inspectSurface(ticker, surface);
}
