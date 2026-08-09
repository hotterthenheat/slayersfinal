import { describe, it, expect } from 'vitest';
import Simulator from '../core/simulator';
import { buildCompass, makeSetup, resetCompassCache, sleeveExpiry, strikeLadder } from './compass';
import { dteOfBucket } from '../components/compass/setupHorizon';
import { CONTRACT_SLEEVES, SCANNERS, SLEEVES, SLEEVE_BY_KEY } from '../types/compass';

/*
  "0DTE, the weekly, the swings and LEAPS — I don't know where they are."

  They were nowhere, and it was structural rather than a labelling slip: the
  horizon lived on the SCANNER, so all six presets in the strip were same-day or
  next-day and no combination of clicks could ask the desk for a contract with a
  month on it. The sleeve owns the clock now and the style owns the edge. This
  file is what keeps the two axes from quietly re-merging.
*/

const EPOCH = 1_800_000_000;

const snap = () => {
  Simulator.ensureTicker('SPY');
  return Simulator.buildSnapshot('SPY');
};

describe('the sleeve owns the clock, and no style has a say in it', () => {
  it('every style stamps the sleeve expiry, never one of its own', () => {
    const cfg = (Simulator.ensureTicker('SPY'), Simulator.TICKERS.SPY);
    for (const sleeve of CONTRACT_SLEEVES) {
      for (const s of SCANNERS) {
        for (const right of ['C', 'P'] as const) {
          for (const k of [-2, 0, 3]) {
            const strike = Math.round(cfg.currentPrice / cfg.step) * cfg.step + k * cfg.step;
            const setup = makeSetup('SPY', cfg.currentPrice, strike, right, s.key, cfg.iv, true, sleeve);
            expect(setup.expiry, `${sleeve}/${s.key}`).toBe(sleeveExpiry(sleeve));
            expect(setup.sleeve).toBe(sleeve);
          }
        }
      }
    }
  });

  it("every contract a sweep emits carries the sleeve's expiry", () => {
    const s = snap();
    for (const sleeve of CONTRACT_SLEEVES) {
      resetCompassCache();
      const rows = buildCompass(s, 'top-setups', { epoch: EPOCH, sleeve }).groups.flatMap(g => g.setups);
      expect(rows.length, `${sleeve} put nothing on the board`).toBeGreaterThan(0);
      expect([...new Set(rows.map(r => r.expiry))], sleeve).toEqual([sleeveExpiry(sleeve)]);
    }
  });

  it('every stamp is a horizon a screen can read back', () => {
    for (const s of SLEEVES) {
      const bucket = sleeveExpiry(s.key);
      expect(bucket, s.key).toMatch(/^\d+DTE$/);
      expect(`${dteOfBucket(bucket)}DTE`).toBe(bucket);
    }
  });

  it('the sleeves span real horizons rather than four names for one', () => {
    const dtes = CONTRACT_SLEEVES.map(k => SLEEVE_BY_KEY[k].dte);
    expect(new Set(dtes).size).toBe(dtes.length);
    expect([...dtes].sort((a, b) => a - b)).toEqual(dtes);
    expect(dtes[dtes.length - 1]).toBeGreaterThanOrEqual(365);
  });

  it('a longer sleeve reaches further out on the strike ladder', () => {
    // A 0.5% rung is a real spread of choices on a same-day contract and pure
    // noise on one with a year to run, so the ladder widens with the clock.
    const reach = (rungPct: number) => {
      const ladder = strikeLadder(400, 1, rungPct);
      return (ladder[ladder.length - 1] - ladder[0]) / 400;
    };
    const spans = CONTRACT_SLEEVES.map(k => reach(SLEEVE_BY_KEY[k].rungPct));
    for (let i = 1; i < spans.length; i++) expect(spans[i]).toBeGreaterThan(spans[i - 1]);
  });

  it('a longer sleeve costs more premium for the same strike', () => {
    // The clock is the only thing that changed, so price is the only thing that
    // may. It also catches a sessions/calendar mix-up: dividing a calendar DTE
    // by 252 would print a swing about 20% too rich.
    const cfg = (Simulator.ensureTicker('SPY'), Simulator.TICKERS.SPY);
    const atm = Math.round(cfg.currentPrice / cfg.step) * cfg.step;
    const mids = CONTRACT_SLEEVES.map(
      sleeve => makeSetup('SPY', cfg.currentPrice, atm, 'C', 'top-setups', cfg.iv, true, sleeve).mid
    );
    for (let i = 1; i < mids.length; i++) expect(mids[i]).toBeGreaterThan(mids[i - 1]);
  });
});

describe('the styles are lenses, and they do not all look at the same strike', () => {
  const spot = 400;

  /** The strike a style ranks highest on one name's ladder. */
  const pick = (scanner: Parameters<typeof makeSetup>[4]) =>
    strikeLadder(spot, 1, SLEEVE_BY_KEY.odte.rungPct)
      .map(k => makeSetup('SPY', spot, k, 'C', scanner, 0.3, true, 'odte'))
      .sort((a, b) => b.rank - a.rank)[0].strike;

  it('quick scalp takes the money and discounted does not', () => {
    // Opposite ends of one trade-off: convexity per dollar against dollars per
    // unit of convexity. If they picked the same strike one tab is furniture.
    expect(Math.abs(pick('quick-scalp') - spot)).toBeLessThan(Math.abs(pick('discounted') - spot));
  });

  it('rebounds leans in the money where discounted leans out', () => {
    expect(pick('rebounds')).toBeLessThanOrEqual(spot);
    expect(pick('discounted')).toBeGreaterThan(spot);
  });

  it('rebounds is the only style that reads the tape backwards', () => {
    /*
      The clearest answer to "are discounted and rebounds the same screen": on
      any given name they trade opposite directions.

      Measured across the whole board they look alike, and that is not the flip
      failing — the field is roughly half up-tape and half down, so BOTH boards
      come out near 50% calls. The flip is a per-NAME fact and has to be checked
      per name.
    */
    const s = snap();
    const sideByName = (scanner: Parameters<typeof buildCompass>[1]) => {
      resetCompassCache();
      const out = new Map<string, 'C' | 'P'>();
      for (const g of buildCompass(s, scanner, { epoch: EPOCH, sleeve: 'odte' }).groups) {
        const calls = g.setups.filter(x => x.right === 'C').length;
        out.set(g.ticker, calls * 2 >= g.setups.length ? 'C' : 'P');
      }
      return out;
    };
    const withTape = sideByName('discounted');
    const against = sideByName('rebounds');
    const shared = [...withTape.keys()].filter(t => against.has(t));
    expect(shared.length).toBeGreaterThan(20);
    const flipped = shared.filter(t => withTape.get(t) !== against.get(t)).length;
    expect(flipped / shared.length).toBeGreaterThan(0.85);
  });

  it('whale sweeps prefers the strikes size actually prints on', () => {
    const best = strikeLadder(spot, 1, SLEEVE_BY_KEY.odte.rungPct)
      .map(k => makeSetup('SPY', spot, k, 'C', 'whale-sweeps', 0.3, true, 'odte'))
      .sort((a, b) => b.rank - a.rank)[0];
    expect(best.strike % 10, `${best.strike} is not a block strike`).toBe(0);
  });
});

describe('the board ranks names apart instead of printing one number', () => {
  it('a full sweep spreads its scores rather than stacking them', () => {
    /*
      The defect this is here for: ranking on moneyness alone puts one
      at-the-money contract per name at the head of a 9,000-contract field, and
      every one of those scores 96 or better. Measured on the shipped board
      before the name term, 240 rows printed TWO distinct scores.
    */
    const s = snap();
    resetCompassCache();
    const rows = buildCompass(s, 'top-setups', { epoch: EPOCH, sleeve: 'odte' }).groups.flatMap(g => g.setups);
    const scores = new Set(rows.map(r => r.score));
    expect(rows.length).toBeGreaterThan(150);
    expect(scores.size).toBeGreaterThan(8);
    expect(Math.max(...rows.map(r => r.score)) - Math.min(...rows.map(r => r.score))).toBeGreaterThan(6);
  });

  it('the evidence chips describe the contract, not the tab it came from', () => {
    // 240 cards used to wear one identical set of three. Two contracts on one
    // board now have to disagree about something.
    const cfg = (Simulator.ensureTicker('SPY'), Simulator.TICKERS.SPY);
    const atm = Math.round(cfg.currentPrice / cfg.step) * cfg.step;
    const itm = makeSetup('SPY', cfg.currentPrice, atm - 6 * cfg.step, 'C', 'top-setups', cfg.iv, true, 'weekly');
    const otm = makeSetup('SPY', cfg.currentPrice, atm + 6 * cfg.step, 'C', 'top-setups', cfg.iv, true, 'weekly');
    expect(itm.whyChips).not.toEqual(otm.whyChips);
    expect(itm.whyChips.some(c => c.startsWith('ITM'))).toBe(true);
    expect(otm.whyChips.some(c => c.startsWith('OTM'))).toBe(true);
  });
});

describe('the contract chain is the whole ladder', () => {
  it('carries every listed strike and says where the money is', () => {
    const s = snap();
    const chain = buildCompass(s, 'top-setups', { epoch: EPOCH, sleeve: 'weekly' }).chain;
    // A twelve-row window is a default, not an instrument — the point of a chain
    // is that the user picks the strike.
    expect(chain.rows.length).toBe(s.chain.length);
    expect(chain.rows.length).toBeGreaterThan(20);
    for (let i = 1; i < chain.rows.length; i++) {
      expect(chain.rows[i].strike).toBeGreaterThan(chain.rows[i - 1].strike);
    }
    const atm = chain.rows[chain.atmIndex];
    expect(atm.strike).toBeGreaterThanOrEqual(chain.spot);
    if (chain.atmIndex > 0) expect(chain.rows[chain.atmIndex - 1].strike).toBeLessThan(chain.spot);
    for (const r of chain.rows) {
      expect(r.call.itm).toBe(r.strike < chain.spot);
      expect(r.put.itm).toBe(r.strike > chain.spot);
      expect(r.call.ask).toBeGreaterThanOrEqual(r.call.bid);
      expect(r.put.ask).toBeGreaterThanOrEqual(r.put.bid);
    }
  });
});

describe('a tracked setup keeps the horizon it was found on', () => {
  /*
    Tracker does not store a setup, it stores enough to rebuild one — and it
    rebuilt through makeSetup, whose sleeve parameter defaults to same-session.
    So a LEAP tracked from the board came back priced as a 0DTE: wrong premium,
    wrong greeks, and an expiry test that would close a year-out contract the
    next morning. The engine side of that is pinned here; the field that carries
    it is TrackedSetup.sleeve.
  */
  it('rebuilding a LEAP without its sleeve prices it as a same-session contract', () => {
    Simulator.ensureTicker('SPY');
    const cfg = Simulator.TICKERS.SPY;
    const strike = Math.round(cfg.currentPrice);
    const asLeap = makeSetup('SPY', cfg.currentPrice, strike, 'C', 'top-setups', cfg.iv, true, 'leaps');
    const forgotten = makeSetup('SPY', cfg.currentPrice, strike, 'C', 'top-setups', cfg.iv, true);

    expect(asLeap.expiry).toBe('365DTE');
    expect(forgotten.expiry).toBe('0DTE');
    // A year of extrinsic against a session's worth is not a rounding gap.
    expect(asLeap.mid).toBeGreaterThan(forgotten.mid * 3);
  });

  it('every sleeve rebuilds to its own expiry, so the round trip is lossless', () => {
    Simulator.ensureTicker('SPY');
    const cfg = Simulator.TICKERS.SPY;
    const strike = Math.round(cfg.currentPrice);
    for (const sleeve of CONTRACT_SLEEVES) {
      const built = makeSetup('SPY', cfg.currentPrice, strike, 'C', 'top-setups', cfg.iv, true, sleeve);
      expect(built.sleeve).toBe(sleeve);
      expect(built.expiry).toBe(sleeveExpiry(sleeve));
      // The premium has to be monotone in the horizon or the sleeve is cosmetic.
      expect(built.mid).toBeGreaterThan(0);
    }
    const mids = CONTRACT_SLEEVES.map(
      s => makeSetup('SPY', cfg.currentPrice, strike, 'C', 'top-setups', cfg.iv, true, s).mid
    );
    for (let i = 1; i < mids.length; i++) expect(mids[i]).toBeGreaterThan(mids[i - 1]);
  });
});
