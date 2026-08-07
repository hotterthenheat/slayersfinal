import { describe, it, expect } from 'vitest';
import Simulator from '../core/simulator';
import { MIN_YEARS, yearsToExpiry } from '../core/optionTime';
import { blackScholes, weighContract } from '../core/contractScore';
import { buildCompass, makeSetup, resetCompassCache, sleeveExpiry } from './compass';
import { CONTRACT_SLEEVES, SCANNERS, SLEEVE_BY_KEY, type ImpactMetric, type ImpactRow } from '../types/compass';
import { MARKET_HOLIDAYS, expiryFor } from '../core/calendar';

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
  it('the setups board quotes the ONE Black-Scholes pricer, to the cent', () => {
    /*
      P2.2 — one pricer. compass's estimatePremium was a normal-shaped estimator
      (intrinsic + a Gaussian bump of time value) that disagreed with the
      Weigher's Black-Scholes by up to ~2× on the same contract: two prices, one
      screen. It now delegates to that exported pricer, so the board mid IS
      blackScholes(spot, strike, nameIv, resolvedDte, right) exactly — one
      contract, queried through both surfaces, returns one mid. The Weigher's own
      base-IV bump and wing skew are a property of THAT surface (see the ratio
      band below), not of the pricer they now share.
    */
    const s = snap();
    const iv = Simulator.TICKERS.SPY.iv;
    const step = Simulator.TICKERS.SPY.step;
    let checked = 0;
    for (const sleeve of CONTRACT_SLEEVES) {
      const dte = expiryFor(SLEEVE_BY_KEY[sleeve].dte).dte;
      for (const k of [-4, -1, 0, 2, 6]) {
        const strike = Math.round((s.spot + k * step) / step) * step;
        for (const right of ['C', 'P'] as const) {
          const setup = makeSetup('SPY', s.spot, strike, right, 'top-setups', iv, true, sleeve);
          const bs = Number(blackScholes(s.spot, strike, iv, dte, right).price.toFixed(2));
          expect(setup.mid, `${sleeve} ${strike}${right}`).toBe(bs);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThanOrEqual(40);
  });

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
    // Since P2.2 both call the SAME Black-Scholes pricer, so what remains is not
    // model shape but the volatility each surface feeds it: the board prices at
    // the name IV, the Weigher adds a base-IV bump and a wing skew. On an ATM
    // 0DTE that gap is small, and this band holds it well inside 0.5–2.
    const ratio = scanned.mid / weighed.mid;
    expect(ratio).toBeGreaterThan(0.5);
    expect(ratio).toBeLessThan(2);
  });

  it('both price a name at the name\'s own volatility', () => {
    /*
      The band above is necessary and it is not sufficient, which this test
      exists to say.

      `buildScoreCtx` used to set its base IV to
      `0.18 + (squeeze ? -0.03 : 0.02) + hRange(ticker-day-iv, 0, 0.25)` — a
      daily hash in 0.20–0.45 that never read the ticker it was pricing. The
      board reads `Simulator.TICKERS[t].iv`. So SPY (0.15) was quoted off two
      volatilities at once, by two panels on one screen, and how far apart they
      landed was a function of the DATE.

      That is why a ratio band could not hold it: for most of the hash's range
      the two engines stayed inside 0.5–2 and the test passed while the defect
      was live. On 2026-08-05 the hash reached ~0.38 and the same ATM 0DTE
      printed $1.40 on the board and $3.39 in the Weigher — 2.4×, and only then
      did anything go red.

      So assert the anchor itself, not the symptom. The tolerance is the squeeze
      term (±0.03 absolute) plus the strike skew (`baseIv * |moneyness| * 1.6`,
      negligible at the money) — everything the Weigher is still allowed to add.
      A hashed level of 0.20–0.45 fails this on SPY at every point in its range.
    */
    for (const t of ['SPY', 'QQQ', 'AAPL', 'NVDA'] as const) {
      Simulator.ensureTicker(t);
      const snapT = Simulator.buildSnapshot(t);
      const nameIv = Simulator.TICKERS[t].iv;
      const atmT = Math.round(snapT.spot / Simulator.TICKERS[t].step) * Simulator.TICKERS[t].step;
      const w = weighContract(snapT, 'C', atmT, 7);
      expect(Math.abs(w.ivPct / 100 - nameIv), `${t}: weigher ${w.ivPct}% vs name ${nameIv * 100}%`).toBeLessThan(0.04);
    }
    // And the spread across the four names has to survive the trip: NVDA is
    // more than twice as volatile as SPY, and an engine that flattens that is
    // not pricing the name at all.
    const ivOf = (t: 'SPY' | 'NVDA') => {
      Simulator.ensureTicker(t);
      const sn = Simulator.buildSnapshot(t);
      const k = Math.round(sn.spot / Simulator.TICKERS[t].step) * Simulator.TICKERS[t].step;
      return weighContract(sn, 'C', k, 7).ivPct;
    };
    expect(ivOf('NVDA') / ivOf('SPY')).toBeGreaterThan(1.6);
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

describe('a setup and the chain beside it resolve the same expiry', () => {
  /*
    The nominal horizon and the resolved date are two numbers, and the desk
    renders both. buildChain was corrected to price on the resolved distance —
    a 1DTE asked for on a Friday is a Monday contract, three calendar days out —
    and makeSetup was left on the nominal bucket, which did not fix the split so
    much as move it: the board and the ladder next to it then disagreed about
    the same contract, which is the one thing this file exists to prevent.

    Fixing one side of a two-sided defect is worse than fixing neither, because
    it looks fixed.
  */
  it('prices a setup on the same day count the chain prices its strikes on', () => {
    const s = snap();
    const iv = Simulator.TICKERS.SPY.iv;
    const step = Simulator.TICKERS.SPY.step;
    const atm = Math.round(s.spot / step) * step;

    for (const sleeve of CONTRACT_SLEEVES) {
      const data = buildCompass(s, 'top-setups', { epoch: EPOCH, sleeve });
      const bucket = sleeveExpiry(sleeve);
      const setup = makeSetup('SPY', s.spot, atm, 'C', 'top-setups', iv, true, sleeve);

      // Same bucket label on both, and the chain stamps the one it priced.
      expect(setup.expiry).toBe(bucket);
      expect(data.chain.expiry).toBe(bucket);

      const row = data.chain.rows.find(r => r.strike === atm);
      expect(row, `${sleeve} chain has no ${atm} strike`).toBeTruthy();

      /*
        Two different pricers — estimatePremium for the board, chainSide for the
        ladder — so they will not match to the cent. What has to match is the
        amount of TIME in them. Priced on 7 days against 4, a weekly's premium
        differs by roughly the square root of that ratio; the band below is
        tight enough to catch it and loose enough to survive the model split.
      */
      const ratio = setup.mid / row!.call.premium;
      expect(ratio, `${sleeve}: board ${setup.mid} vs chain ${row!.call.premium}`).toBeGreaterThan(0.8);
      expect(ratio).toBeLessThan(1.25);
    }
  });

  it('walks a whole year of session starts without the two ever splitting', () => {
    /*
      One snapshot cannot see this: the gap only opens when the nominal target
      lands on a weekend or a holiday, which is a property of the day the sweep
      runs, not of the contract. So the assertion is on the resolution itself,
      swept across every calendar day of a year — including the ten holidays
      and the two half-days core/calendar knows about.
    */
    const p2 = (n: number) => String(n).padStart(2, '0');
    const atMidnightUTC = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    let checked = 0;
    let differed = 0;
    for (let d = 0; d < 365; d++) {
      const from = new Date(Date.UTC(2026, 0, 1 + d, 12));
      for (const sleeve of CONTRACT_SLEEVES) {
        const nominal = SLEEVE_BY_KEY[sleeve].dte;
        const exp = expiryFor(nominal, from);

        // The resolved day count is the real gap to the real date, so anything
        // that prices on it is pricing the contract that date names.
        const gapDays = Math.round((exp.date.getTime() - atMidnightUTC(from)) / 86_400_000);
        expect(exp.dte, `${sleeve} on ${from.toISOString().slice(0, 10)}`).toBe(gapDays);

        // And it always lands on a session — never a weekend, never a holiday.
        const iso = `${exp.date.getFullYear()}-${p2(exp.date.getMonth() + 1)}-${p2(exp.date.getDate())}`;
        expect(['Sat', 'Sun']).not.toContain(exp.weekday);
        expect(MARKET_HOLIDAYS.has(iso), `${iso} is a holiday`).toBe(false);

        if (exp.dte !== nominal) differed++;
        checked++;
      }
    }
    expect(checked).toBe(365 * CONTRACT_SLEEVES.length);
    // If nothing ever differed the test would be proving nothing.
    expect(differed).toBeGreaterThan(200);
  });
});
