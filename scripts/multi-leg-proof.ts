/*
  Acceptance test for the multi-leg feed.

  Proves:
  1. Single-leg prints are EXCLUDED from the structures and counted apart —
     the whole point is separating a spread's leg from a directional bet
  2. Grouping is by structure shape, and each group's numbers are its own
     prints' numbers
  3. The headline share is multi-leg premium over ALL premium, not over
     multi-leg premium (which would always be 100%)
  4. The ask share says who wanted it, per shape
  5. The window and the ticker filter both bite; a null ticker is
     market-wide on purpose
*/
import { buildMultiLegFlow, structureRead } from '../src/data/multiLeg';
import type { FlowPrint, StratTag } from '../src/types/trace';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

const NOW = 1_760_000_000_000;
const MIN = 60_000;
const P = (
  o: { legs?: number; strat?: StratTag; size?: number; fill?: number; side?: 'BID' | 'ASK' | 'MID'; ago?: number; ticker?: string }
): FlowPrint & { at: number } =>
  ({
    ticker: o.ticker ?? 'SPY',
    legs: o.legs ?? 1,
    strat: o.strat ?? '—',
    size: o.size ?? 100,
    fill: o.fill ?? 1,
    side: o.side ?? 'ASK',
    at: NOW - (o.ago ?? MIN),
  } as unknown as FlowPrint & { at: number });

// ── 1. singles are separated, not swept in ────────────────────────────────
{
  const f = buildMultiLegFlow(
    [
      P({ legs: 1, size: 500 }),
      P({ legs: 2, strat: 'Vertical', size: 100 }),
      P({ legs: 3, strat: 'Butterfly', size: 50 }),
    ],
    'SPY',
    10 * MIN,
    NOW
  );
  check('single-leg prints are not structures', f.multiPrints === 2 && f.singlePrints === 1, `${f.multiPrints}/${f.singlePrints}`);
  check('and they are still counted, in their own premium', f.singlePremium === 500 * 1 * 100, String(f.singlePremium));
  check('the structures list holds only multi-leg prints', f.prints.every(p => p.legs > 1));
  check('groups are the shapes present', f.groups.map(g => g.strat).sort().join(',') === 'Butterfly,Vertical', f.groups.map(g => g.strat).join(','));
}

// ── 2. a group is its own prints ──────────────────────────────────────────
{
  const f = buildMultiLegFlow(
    [
      P({ legs: 2, strat: 'Vertical', size: 100, fill: 2 }),
      P({ legs: 4, strat: 'Vertical', size: 300, fill: 1 }),
      P({ legs: 3, strat: 'Ratio', size: 10, fill: 1 }),
    ],
    'SPY',
    10 * MIN,
    NOW
  );
  const v = f.groups.find(g => g.strat === 'Vertical')!;
  check('a group counts its own prints', v.prints === 2);
  check('— its own contracts', v.contracts === 400, String(v.contracts));
  check('— its own premium', v.premium === 100 * 2 * 100 + 300 * 1 * 100, String(v.premium));
  check('— and averages its own leg count', v.avgLegs === 3, String(v.avgLegs));
  check('groups are ordered by premium, heaviest first', f.groups[0].strat === 'Vertical');
  const shares = f.groups.reduce((a, g) => a + g.sharePct, 0);
  check('shares are of MULTI-LEG premium and sum to 100', Math.abs(shares - 100) < 0.5, shares.toFixed(1));
}

// ── 3. the headline share is over ALL premium ─────────────────────────────
{
  /* 1 structure at $10k, 3 singles at $10k each — structures are a quarter
     of the tape's premium, not 100% of it. */
  const f = buildMultiLegFlow(
    [
      P({ legs: 2, strat: 'Vertical', size: 100, fill: 1 }),
      P({ legs: 1, size: 100, fill: 1 }),
      P({ legs: 1, size: 100, fill: 1 }),
      P({ legs: 1, size: 100, fill: 1 }),
    ],
    'SPY',
    10 * MIN,
    NOW
  );
  check('the structure share is over the whole tape', f.structureSharePct === 25, String(f.structureSharePct));
  check('— which is what makes it a reading', f.structureSharePct !== 100);
  /* All three bands, so the words are pinned to the number rather than to
     whichever case the author happened to build. 25% is the MIDDLE band —
     the first cut of this proof asserted "directional" for it and failed,
     and the engine was right. */
  check('a middling share reads as the usual mix', /usual mix/.test(structureRead(f)), structureRead(f));
  const light = buildMultiLegFlow([P({ legs: 2, strat: 'Vertical', size: 50, fill: 1 }), P({ legs: 1, size: 950, fill: 1 })], 'SPY', 10 * MIN, NOW);
  check('a thin share reads as directional', /directional/.test(structureRead(light)), structureRead(light));
  const heavy = buildMultiLegFlow([P({ legs: 2, strat: 'Ratio', size: 900, fill: 1 }), P({ legs: 1, size: 100, fill: 1 })], 'SPY', 10 * MIN, NOW);
  check('a heavy share says desks are financing and hedging', /financing and hedging/.test(structureRead(heavy)), structureRead(heavy));
}

// ── 4. who wanted it ──────────────────────────────────────────────────────
{
  const f = buildMultiLegFlow(
    [
      P({ legs: 2, strat: 'Vertical', size: 300, fill: 1, side: 'ASK' }),
      P({ legs: 2, strat: 'Vertical', size: 100, fill: 1, side: 'BID' }),
    ],
    'SPY',
    10 * MIN,
    NOW
  );
  check('the ask share is premium-weighted, not print-weighted', f.groups[0].askPct === 75, String(f.groups[0].askPct));
}

// ── 5. the filters ────────────────────────────────────────────────────────
{
  const tape = [P({ legs: 2, strat: 'Vertical', ago: 1 * MIN }), P({ legs: 2, strat: 'Ratio', ago: 40 * MIN })];
  check('a print older than the window is out', buildMultiLegFlow(tape, 'SPY', 5 * MIN, NOW).multiPrints === 1);
  const mixed = [P({ legs: 2, strat: 'Vertical', ticker: 'SPY' }), P({ legs: 2, strat: 'Ratio', ticker: 'QQQ' })];
  check('a ticker filter bites', buildMultiLegFlow(mixed, 'SPY', 10 * MIN, NOW).multiPrints === 1);
  check('and null is market-wide, on purpose', buildMultiLegFlow(mixed, null, 10 * MIN, NOW).multiPrints === 2);
  check('an empty tape is the empty feed', buildMultiLegFlow([], null, 10 * MIN, NOW).multiPrints === 0);
  check('and says so rather than reading a share of nothing', /No prints/.test(structureRead(buildMultiLegFlow([], null, 10 * MIN, NOW))));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
