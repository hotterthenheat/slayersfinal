import { describe, it, expect } from 'vitest';
import Simulator from '../core/simulator';
import { MIN_YEARS, yearsToExpiry } from '../core/optionTime';
import { weighContract } from '../core/contractScore';
import { buildCompass, makeSetup, resetCompassCache, sleeveExpiry } from './compass';
import { CONTRACT_SLEEVES, SCANNERS, type ImpactMetric, type ImpactRow } from '../types/compass';

/*
  Two panels, one moment, one set of numbers.

  Every defect this file pins was the same shape: a number computed correctly
  against its own spec and wrong against the thing rendered beside it. None of
  them was reachable by reading either side on its own, which is why they lived
  so long — and why the assertions here are all cross-panel rather than
  per-function.
*/

const EPOCH = 1_800_000_000;

const snap = () => {
  Simulator.ensureTicker('SPY');
  return Simulator.buildSnapshot('SPY');
};

describe('the contract chain and the board it sits beside quote the same session', () => {
  it('every preset prices its chain on the expiry it stamps on its setups', () => {
    /*
      The chain used to hardcode 1DTE regardless of the preset. On the four
      same-session presets that put next-day premiums next to a same-day board:
      measured on BAC 41.50P, the monitor header read $0.16 while the chain cell
      for the identical contract read $0.47.
    */
    const s = snap();
    const iv = Simulator.TICKERS.SPY.iv;
    for (const sleeve of CONTRACT_SLEEVES) {
      for (const scanner of SCANNERS) {
        resetCompassCache();
        const data = buildCompass(s, scanner.key, { epoch: EPOCH, sleeve });
        expect(data.chain.expiry, `${sleeve}/${scanner.key}`).toBe(sleeveExpiry(sleeve));

        for (const row of data.chain.rows) {
          for (const right of ['C', 'P'] as const) {
            const cell = right === 'C' ? row.call : row.put;
            const asSetup = makeSetup('SPY', s.spot, row.strike, right, scanner.key, iv, true, sleeve);
            expect(cell.premium, `${sleeve} ${row.strike}${right}`).toBeCloseTo(asSetup.mid, 2);
          }
        }
      }
    }
  });

  it('a same-session chain is cheaper than a weekly one, on every strike', () => {
    // The direction of the bug, held as an invariant: less time cannot be worth
    // more. If the chain ever stops taking the sleeve's clock this flips.
    const s = snap();
    resetCompassCache();
    const sameDay = buildCompass(s, 'top-setups', { epoch: EPOCH, sleeve: 'odte' }).chain;
    resetCompassCache();
    const nextDay = buildCompass(s, 'top-setups', { epoch: EPOCH, sleeve: 'weekly' }).chain;

    expect(sameDay.expiry).toBe('0DTE');
    expect(nextDay.expiry).toBe('7DTE');
    let strictlyCheaper = 0;
    for (let i = 0; i < sameDay.rows.length; i++) {
      expect(sameDay.rows[i].strike).toBe(nextDay.rows[i].strike);
      expect(sameDay.rows[i].call.premium).toBeLessThanOrEqual(nextDay.rows[i].call.premium);
      if (sameDay.rows[i].call.premium < nextDay.rows[i].call.premium) strictlyCheaper++;
    }
    expect(strictlyCheaper).toBeGreaterThan(0);
  });
});

describe('the impact leaderboard ranks the field, not a pre-selection', () => {
  /** The panel's own comparator, verbatim from ImpactLeaderboard.tsx. */
  const metricValue = (row: ImpactRow, metric: ImpactMetric): number =>
    metric === 'gamma'
      ? row.gamma
      : metric === 'volume'
        ? row.volume
        : metric === 'notional'
          ? row.deltaNotional
          : row.openInterest;

  it('hands over every contract in the chain rather than a top eight', () => {
    /*
      The engine used to sort by gamma and slice to eight, and the panel then
      offered four "rank by" metrics over those eight — so Volume, Notional and
      Open Int each showed the largest-by-GAMMA contracts in a different order,
      which is not the question any of those three controls asks.
    */
    const s = snap();
    resetCompassCache();
    const { impact } = buildCompass(s, 'top-setups', { epoch: EPOCH });
    expect(impact.length).toBe(s.chain.length * 2);
    expect(impact.length).toBeGreaterThan(8);
  });

  it("each metric's top row is that metric's true maximum", () => {
    const s = snap();
    resetCompassCache();
    const { impact } = buildCompass(s, 'top-setups', { epoch: EPOCH });
    for (const metric of ['gamma', 'volume', 'notional', 'oi'] as ImpactMetric[]) {
      const top = [...impact].sort((a, b) => metricValue(b, metric) - metricValue(a, metric))[0];
      const max = Math.max(...impact.map(r => metricValue(r, metric)));
      expect(metricValue(top, metric), metric).toBe(max);
    }
  });

  it('delta notional is exposure, not open interest in different units', () => {
    /*
      It was `oi * 100 * spot * 0.5` — a flat half-delta on every strike and both
      sides. Spot is constant across rows, so the column was a strictly monotone
      transform of open interest and the two could never rank differently. A
      column headed DEX has to disagree with OI somewhere, or it is one number
      printed twice.
    */
    const s = snap();
    resetCompassCache();
    const { impact } = buildCompass(s, 'top-setups', { epoch: EPOCH });
    const byOi = [...impact].sort((a, b) => b.openInterest - a.openInterest).map(r => r.contract);
    const byDex = [...impact].sort((a, b) => b.deltaNotional - a.deltaNotional).map(r => r.contract);
    expect(byDex).not.toEqual(byOi);

    // And it is a real delta: a deep-ITM call carries more exposure per unit of
    // open interest than a far-OTM one.
    const calls = impact.filter(r => r.contract.endsWith('C') && r.openInterest > 0);
    const perOi = calls.map(r => r.deltaNotional / r.openInterest);
    expect(Math.max(...perOi)).toBeGreaterThan(Math.min(...perOi) * 1.5);
  });
});

describe('the scan engine and the weigher price the same contract the same way', () => {
  it('both floor a same-session contract at half a session, not half a day', () => {
    /*
      The two used to disagree by 45% about how much time a 0DTE has —
      `max(dte, 0.5)/365` in core/contractScore.ts against `max(0.5, dte)/252`
      in data/compass.ts — and both rendered on the Weigher at once: the headline
      mid from one, the take-profit targets beneath it from the other. Same
      contract, two prices, three inches apart, no signal that two models were
      involved.
    */
    expect(yearsToExpiry(0)).toBe(MIN_YEARS);
    expect(yearsToExpiry(0)).toBeCloseTo(0.5 / 252, 12);
    // Half a calendar day is the value that was wrong, and it is meaningfully
    // different — this is the size of the disagreement, held as a fact.
    expect(yearsToExpiry(0) / (0.5 / 365)).toBeGreaterThan(1.4);
  });

  it('is monotone in the day count and never returns zero time', () => {
    let prev = 0;
    for (const dte of [0, 1, 7, 30, 45, 90, 365, 730]) {
      const y = yearsToExpiry(dte);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeGreaterThanOrEqual(prev);
      prev = y;
    }
    // A calendar year is a year. Dividing a calendar count by 252 would make it 1.45.
    expect(yearsToExpiry(365)).toBeCloseTo(1, 12);
  });

  it('the two engines agree on a 0DTE mid to within the rounding', () => {
    const s = snap();
    const iv = Simulator.TICKERS.SPY.iv;
    const atm = Math.round(s.spot / Simulator.TICKERS.SPY.step) * Simulator.TICKERS.SPY.step;
    const scanned = makeSetup('SPY', s.spot, atm, 'C', 'top-setups', iv, true);
    const weighed = weighContract(s, 'C', atm, 0);
    // Two different models — a normal-shaped approximation and Black-Scholes —
    // so they will not match to the cent. What has to match is the amount of
    // TIME in them, which shows up as the same order of magnitude of extrinsic.
    const ratio = scanned.mid / weighed.mid;
    expect(ratio).toBeGreaterThan(0.5);
    expect(ratio).toBeLessThan(2);
  });
});

describe('the level that kills a setup and the price it is measured from', () => {
  /*
    The compare pane prints "breaks above $445.81, 1.9% below the $454.50 spot"
    — one sentence carrying both numbers, so the moment they come from different
    spots the sentence contradicts itself in eleven words. That is what happened:
    the pane fetched its own spot from Simulator.getCandles while the engine had
    invalidated against SetupGroup.spot.

    Worse, the obvious correction was worse. getCandles calls ensureTicker, so
    asking the simulator about a name MATERIALISES it, and scanNameFor then
    starts returning the simulator's price instead of the synthetic walk it
    returned a moment earlier. Measured on REGN inside a single sweep: 1073.50
    on the first read, 1041.52 on the second. The pane was changing the
    scanner's inputs by rendering.

    So the spot travels with the setup, and this is the invariant that holds it:
    read against its own group's spot, a call dies below and a put dies above.
    Any future panel that re-derives a spot instead of taking the group's will
    break this on the first name the simulator has not materialised yet.
  */
  it('a call invalidates below its own sweep spot and a put above it', () => {
    const data = buildCompass(snap(), 'top-setups', { epoch: EPOCH, sleeve: 'odte' });
    let checked = 0;
    for (const group of data.groups) {
      for (const s of group.setups) {
        const gap = s.invalidationPrice - group.spot;
        if (s.right === 'C') expect(gap).toBeLessThan(0);
        else expect(gap).toBeGreaterThan(0);
        // 0.8-2% away, per makeSetup's own offset band. A level further out
        // than that is a level measured from a different price.
        const pct = Math.abs(gap / group.spot) * 100;
        expect(pct).toBeGreaterThan(0.7);
        expect(pct).toBeLessThan(2.1);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(50);
  });

  it('holds across every sleeve, since each prices its own ladder', () => {
    for (const sleeve of CONTRACT_SLEEVES) {
      const data = buildCompass(snap(), 'rebounds', { epoch: EPOCH, sleeve });
      const groups = data.groups.slice(0, 12);
      expect(groups.length).toBeGreaterThan(0);
      for (const group of groups) {
        for (const s of group.setups) {
          const gap = s.invalidationPrice - group.spot;
          expect(Math.sign(gap)).toBe(s.right === 'C' ? -1 : 1);
        }
      }
    }
  });
});
