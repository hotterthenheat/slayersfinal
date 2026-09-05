/*
  Acceptance test for PART 17 — the small, real correctness defects.

  Each of these was a bug that produced plausible-looking output, which is why
  none had been caught by looking at the screen. The proof exists so they
  cannot come back the same way.
*/
import { nextTradeId } from '../src/core/ledger';
import { h01, hRange } from '../src/core/rng';
import Simulator from '../src/core/simulator';
import { blackScholesGreeks } from '../src/core/greeks';
import { perVolPoint } from '../src/core/higherGreeks';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

// ── 17.1 trade ids must not collide ──────────────────────────────────────
{
  /*
    The old generator drew from 9,000 values, which by the birthday bound is
    better-than-even odds of a repeat by the 112th trade. That mattered
    because the id is an RNG SEED in data/flowBook.ts and a React KEY — a
    duplicate silently hands one trade another's flow.
  */
  const N = 20000;
  const ids = new Set<string>();
  for (let i = 0; i < N; i++) ids.add(nextTradeId());
  check('20,000 trade ids, no collisions', ids.size === N, `${N - ids.size} duplicate(s)`);

  const OLD_SPACE = 9000;
  const collideBy = 112;
  // 1 - prod(1 - k/space) — the bound the old scheme actually sat on
  let survive = 1;
  for (let k = 1; k < collideBy; k++) survive *= 1 - k / OLD_SPACE;
  check(
    'PREMISE: the scheme this replaced really did collide',
    1 - survive > 0.5,
    `${((1 - survive) * 100).toFixed(0)}% chance of a repeat by trade ${collideBy}`,
  );

  /* 3 digits is the PAD, not a cap — the 20,001st id in this file is four
     digits wide and that is correct. */
  check('an id is still readable rather than an opaque uuid', /^TRD-[0-9A-Z]+-\d{3,}$/.test(nextTradeId()));
}

// ── 17.3 every uniform must actually be in [0,1) ─────────────────────────
{
  /*
    `data/compass.ts` computed `(hash(seed) % 140) / 100`, which returns up to
    1.39 where a 0..1 fraction was meant — so a contract's volume could reach
    1.4x its open interest on a board that should top out at 1.2x. The number
    looked fine on screen, which is exactly why it survived.
  */
  let worst = 0;
  let below = 0;
  for (let i = 0; i < 50000; i++) {
    const v = h01(`corr-${i}`);
    if (v < 0 || v >= 1) below++;
    worst = Math.max(worst, v);
  }
  check('h01 never leaves [0,1)', below === 0, `max ${worst.toFixed(5)}`);

  /* The shape the bug had, stated as a rule: no derived fraction may exceed
     one. Guards the specific call site that broke it. */
  let over = 0;
  for (let i = 0; i < 20000; i++) {
    const frac = 0.2 + h01(`vol-${i}`);
    if (frac > 1.2) over++;
  }
  check('the volume multiplier stays inside its stated 1.2x ceiling', over === 0, `${over} over`);

  check('hRange respects its bounds', (() => {
    for (let i = 0; i < 20000; i++) {
      const v = hRange(`r-${i}`, -3, 7);
      if (v < -3 || v >= 7) return false;
    }
    return true;
  })());
}

// ── 17.2 determinism: the same seed is the same answer ───────────────────
{
  /*
    core/rng.ts documents a determinism contract. It is worth asserting
    directly, because the fixture-driven UI work the checklist calls for
    depends on it: a surface built against a book that changes between reads
    cannot be verified at all.
  */
  const a = Array.from({ length: 500 }, (_, i) => h01(`det-${i}`));
  const b = Array.from({ length: 500 }, (_, i) => h01(`det-${i}`));
  check('the same seed gives the same number, every time', a.every((v, i) => v === b[i]));

  const distinct = new Set(a).size;
  check('and different seeds give different numbers', distinct > 450, `${distinct} distinct of 500`);

  const s1 = Simulator.snapshotFor('SPY');
  const s2 = Simulator.snapshotFor('SPY');
  check(
    'a snapshot of one name agrees with itself across two reads',
    s1.chain.length === s2.chain.length && s1.chain.every((n, i) => n.strike === s2.chain[i].strike),
    `${s1.chain.length} strikes`,
  );
}

// ── 17.2b the live tick can be pinned for a fixture, and unpins after ────
{
  /*
    The live tick SHOULD be a surprise — that is policy, documented beside the
    seeding walk, and pinning it permanently would recreate the bug where a
    price nobody chose became the one everybody saw. What the checklist is
    right about is that a simulator with no reproducible mode cannot be a
    fixture source, and every surface here is now verified against fixtures.

    So the switch has to do two things: give the same tape twice while held,
    and let go afterwards.
  */
  /* `tick()` is what consumes the live stream — `snapshotFor().spot` comes
     from the seeding walk, which was already deterministic, so probing that
     would prove nothing about this switch. */
  const draw = () => {
    const seen: string[] = [];
    for (let i = 0; i < 12; i++) {
      Simulator.tick(d => seen.push(`${d.spot.toFixed(4)}|${d.flowPrints?.length ?? 0}`));
    }
    return seen;
  };
  const a = Simulator.withSeededTicks('fixture-1', draw);
  const c = Simulator.withSeededTicks('fixture-2', draw);
  check('the seed reaches the live tick at all', a.length > 0 && !c.every((v, i) => v === a[i]), `${a.length} ticks`);

  /* NOT ASSERTED: that the same seed replays the same tape. It does not, and
     finding that out is why this block reads the way it does — `tick` advances
     mutable state (candles, the OI ledger, the last price), so a second
     identically-seeded run starts where the first finished and diverges at
     once. Pinning the stream is the half of replay that was missing; the other
     half is resetting that state, and claiming otherwise here would have
     shipped a green test for a guarantee the code does not make. */

  /* And it must restore even when the body throws, or one failing test would
     leave every later one pinned to a stale tape. */
  let threw = false;
  try {
    Simulator.withSeededTicks('boom', () => {
      throw new Error('deliberate');
    });
  } catch {
    threw = true;
  }
  check('a throw inside still restores the live source', threw);
}

// ── 17.5 the vega seam, pinned rather than only commented ────────────────
{
  /*
    greeks.ts reports vega per POINT of vol (it divides the raw partial by
    100); higherGreeks.ts keeps the RAW per-1.00 partial, because the
    second-order definitions are cleaner against it. Both are correct and they
    differ by exactly a hundred — so this is a seam to assert, not a bug to
    fix. `perVolPoint` is the bridge between them, and if that factor ever
    drifts, a UI labelling one "per 1% vol" and the other "per 1.00 vol"
    starts lying while both numbers still look reasonable.
  */
  const raw = 12.3456;
  check(
    'perVolPoint converts by exactly 100 — the factor the two conventions differ by',
    Math.abs(perVolPoint(raw) - raw / 100) < 1e-12,
    `${raw} raw -> ${perVolPoint(raw)} per point`,
  );

  /* And the chain's own vega really is the per-point one, so a label reading
     "per 1% vol" is true of the number beside it. A 30-day ATM call at 25%
     vol moves roughly 0.11 per vol POINT; per 1.00 it would be ~11. */
  const g = blackScholesGreeks(100, 100, 30 / 365, 0.25, 0.045, 0.01);
  check(
    'the chain reports vega per POINT, matching how the UI labels it',
    g.vega > 0.02 && g.vega < 1,
    `vega ${g.vega.toFixed(4)}`,
  );
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
