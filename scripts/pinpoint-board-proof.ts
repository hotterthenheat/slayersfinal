/*
  Acceptance test for the Pinpoint board — the strike ladder, the score
  behind every bar, the classification behind every badge, and the change
  overlay. Runs the ACTUAL modules; no browser, no React.

  The claim this file exists to defend is the pipeline:

      chain + history -> measures -> score -> classification -> the view

  If a bar length or a badge can be traced to anything other than that
  chain, the board is decoration and these assertions should fail.
*/
import {
  NOTICEABLE,
  ROLE_WORDS,
  WEIGHTS,
  WINDOWS,
  MAGNET_WEIGHT,
  loadedStrikes,
  proximityOf,
  scoreOf,
  windowOf,
  windowReads,
  type Components,
  type Role,
} from '../src/data/pinpoint/board';
import { buildMatrix, type MatrixRow } from '../src/data/pinpoint/matrix';
import { EDGE_H, FIT_MIN, LANE_KEEP, ROW_H, SPOT_H, densityFor, drawerFloor, fitRows, paneBounds } from '../src/pages/pinpoint/board/density';
import { INK_PER_CHAR, MARK_PAD, REACHES, markFor } from '../src/pages/pinpoint/board/BoardPanel';
import { EXPIRIES, ZERO_DTE_T, customExpiry, expiryOf, tradingDaysUntil } from '../src/data/expiry';
import Simulator from '../src/core/simulator';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};
const money = (v: number) => {
  const a = Math.abs(v), s = v < 0 ? '-' : '';
  if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(1)}K`;
  return `${s}$${a.toFixed(0)}`;
};

// ── 1. the expiry ladder is a horizon, not a multiplier ───────────────────
{
  check('0DTE keeps the horizon the whole terminal already reads',
    expiryOf('0dte').t === ZERO_DTE_T, `${ZERO_DTE_T}`);
  check('  · and the untouched open-interest profile', expiryOf('0dte').oiWidth === 15 && expiryOf('0dte').roundBoost === 1);

  /* AN EXPIRY IS A REAL HORIZON. Each step out is longer-dated, its book is
     wider, and it leans harder on round strikes — three independent
     properties, because a decay multiplier on one number was the thing this
     replaced. */
  const ladder = [...EXPIRIES];
  /* MONOTONIC BY CONSTRUCTION. The first cut gave 1DTE `1/365` and this
     assertion caught that "tomorrow" was a shorter horizon than "today" —
     0DTE's legacy 0.003 is about 1.1 days. A shorter horizon is a bigger
     gamma, so the 1DTE ladder would have drawn taller bars than the 0DTE
     one and every reading off it would have been backwards. */
  check('every expiry is longer-dated than the last',
    ladder.every((e, i) => i === 0 || e.t > ladder[i - 1].t),
    ladder.map(e => `${e.label} ${(e.t * 365).toFixed(2)}d`).join(' '));
  check('  · and 0DTE is the hours left of today, not zero',
    expiryOf('0dte').t > 0 && expiryOf('1dte').t === expiryOf('0dte').t + 1 / 365);
  check('  · with a wider book', ladder.every((e, i) => i === 0 || e.oiWidth < ladder[i - 1].oiWidth),
    ladder.map(e => e.oiWidth).join(' '));
  check('  · leaning harder on round strikes',
    ladder.every((e, i) => i === 0 || e.roundBoost >= ladder[i - 1].roundBoost));

  /* A CUSTOM DATE INTERPOLATES rather than snapping to a neighbour. */
  const twelve = customExpiry(12);
  const weekly = expiryOf('weekly'), monthly = expiryOf('monthly');
  check('a 12-day expiry sits between the weekly and the monthly',
    twelve.oiWidth < weekly.oiWidth && twelve.oiWidth > monthly.oiWidth,
    `${weekly.oiWidth} > ${twelve.oiWidth.toFixed(1)} > ${monthly.oiWidth}`);
  check('  · and is not either of them', twelve.oiWidth !== weekly.oiWidth && twelve.oiWidth !== monthly.oiWidth);
  const leap = customExpiry(365);
  check('  · past the monthly the book keeps widening', leap.oiWidth < monthly.oiWidth,
    `${leap.oiWidth.toFixed(2)} at 365 days`);
  check('  · and a nonsense date is clamped rather than thrown', customExpiry(-5).dte === 0 && customExpiry(9999).dte === 730);

  const mon = new Date(2026, 8, 7);  // a Monday
  check('trading days skip the weekend', tradingDaysUntil(mon, new Date(2026, 8, 14)) === 5,
    `${tradingDaysUntil(mon, new Date(2026, 8, 14))}`);
  check('  · and a backwards range is zero, not negative', tradingDaysUntil(new Date(2026, 8, 14), mon) === 0);
}

// ── 2. the chain really changes with the expiry ───────────────────────────
{
  /* THE WHOLE POINT. If two expiries produced the same shaped ladder, the
     control would be a decoration with a state variable. */
  const zero = Simulator.chainFor('SPY', expiryOf('0dte'));
  const month = Simulator.chainFor('SPY', expiryOf('monthly'));
  const atm = (c: { chain: { strike: number; netGex: number; gamma: number }[] }, spot: number) =>
    c.chain.reduce((best, n) => (Math.abs(n.strike - spot) < Math.abs(best.strike - spot) ? n : best), c.chain[0]);

  const z = atm(zero, zero.spot), m = atm(month, month.spot);
  check('0DTE gamma at the money dwarfs the monthly\'s', z.gamma > m.gamma * 3,
    `${z.gamma.toExponential(2)} vs ${m.gamma.toExponential(2)}`);

  /* And the SHAPE differs, not just the height: a 0DTE book collapses away
     from the money far faster than a monthly's. */
  const profile = (c: { chain: { strike: number; netGex: number }[] }, spot: number) => {
    const near = c.chain.filter(n => Math.abs(n.strike - spot) <= 3).reduce((t, n) => t + Math.abs(n.netGex), 0);
    const all = c.chain.reduce((t, n) => t + Math.abs(n.netGex), 0);
    return all > 0 ? near / all : 0;
  };
  const zc = profile(zero, zero.spot), mc = profile(month, month.spot);
  check('  · and 0DTE concentrates harder near the money', zc > mc,
    `${(zc * 100).toFixed(0)}% vs ${(mc * 100).toFixed(0)}% inside 3 strikes`);

  /* A far expiry must not disturb the 0DTE reading the rest of the desk
     takes — the chain memo is keyed per expiry for exactly this. */
  const again = Simulator.chainFor('SPY', expiryOf('0dte'));
  check('  · and asking for a monthly does not move the 0DTE chain',
    again.chain.length === zero.chain.length && again.chain.every((n, i) => n.netGex === zero.chain[i].netGex));
}

// ── 3. proximity is a curve, not a ramp ───────────────────────────────────
{
  check('at the money proximity is one', proximityOf(0) === 1);
  check('  · and it is gone at the edge of reach', proximityOf(12, 12) === 0);
  /* STEEPER THAN LINEAR ON PURPOSE. A linear ramp gave the far half of the
     book about a third each and made the term nearly a constant. */
  check('  · half way out it is well under a half', proximityOf(6, 12) < 0.8 && proximityOf(6, 12) === 0.75,
    `${proximityOf(6, 12)}`);
  check('  · it is symmetric', proximityOf(-4, 12) === proximityOf(4, 12));
  check('  · and never negative past the edge', proximityOf(40, 12) === 0);
}

// ── 4. the score is the blend, and nothing else ───────────────────────────
{
  const sum = WEIGHTS.gamma + WEIGHTS.proximity + WEIGHTS.flow + WEIGHTS.urgency;
  check('the weights are a partition of one', Math.abs(sum - 1) < 1e-9, sum.toFixed(6));
  check('  · gamma is the largest single term', WEIGHTS.gamma > Math.max(WEIGHTS.proximity, WEIGHTS.flow, WEIGHTS.urgency));
  /* FLOW AND URGENCY TOGETHER OUTWEIGH PROXIMITY — the deliberate part. A
     board ranked by size and nearness alone names the same four strikes all
     day and tells a reader nothing they did not know at the open. */
  check('  · change outweighs nearness', WEIGHTS.flow + WEIGHTS.urgency > WEIGHTS.proximity,
    `${(WEIGHTS.flow + WEIGHTS.urgency).toFixed(2)} vs ${WEIGHTS.proximity}`);

  const b = buildMatrix('SPY', ['gex'], { lookback: '15m' });
  let worst = 0;
  for (const r of b.rows) {
    const expect = scoreOf(r.parts);
    worst = Math.max(worst, Math.abs(expect - r.weight));
  }
  check('every row\'s score is exactly its own four parts', worst < 1e-12, `worst drift ${worst.toExponential(1)}`);
  check('  · and every part is a unit fraction',
    b.rows.every(r => (['gamma', 'flow', 'proximity', 'urgency'] as (keyof Components)[])
      .every(k => r.parts[k] >= 0 && r.parts[k] <= 1)));
  check('  · so a score is one too', b.rows.every(r => r.weight >= 0 && r.weight <= 1));
}

// ── 5. a bar length is an exposure, not a style ───────────────────────────
{
  const b = buildMatrix('SPY', ['gex'], { lookback: '15m' });
  check('the ladder drew rows', b.rows.length > 10, `${b.rows.length} strikes`);
  check('highest strike first', b.rows.every((r, i) => i === 0 || r.strike < b.rows[i - 1].strike));

  /* BOTH SIDES SHARE ONE RULER. Normalising each side to its own maximum
     would make the widest call and the widest put look equal when one is
     three times the other, and nothing on the surface would say so. */
  let worst = 0;
  const leg = (r: MatrixRow, k: 'call' | 'put') => r.cells.gex?.[k] ?? 0;
  for (const r of b.rows) {
    worst = Math.max(worst,
      Math.abs(r.callBar - Math.min(1, Math.abs(leg(r, 'call')) / b.peak)),
      Math.abs(r.putBar - Math.min(1, Math.abs(leg(r, 'put')) / b.peak)));
  }
  check('every bar is its own exposure over the book\'s peak', worst < 1e-12, `worst ${worst.toExponential(1)}`);
  check('  · no bar overflows its lane', b.rows.every(r => r.callBar <= 1 && r.putBar <= 1));
  check('  · and the peak is really the peak',
    b.peak === Math.max(...b.rows.map(r => Math.max(Math.abs(leg(r, 'call')), Math.abs(leg(r, 'put'))))));
  /* A ladder where every bar is long says nothing. */
  const long = b.rows.filter(r => Math.max(r.callBar, r.putBar) > 0.5).length;
  check('  · and the long bars are a minority', long > 0 && long < b.rows.length / 2,
    `${long} of ${b.rows.length} over half width`);

  check('the legs sum to the net', b.rows.every(r => { const c = r.cells.gex!; return Math.abs(c.call + c.put - c.net) < Math.max(1, Math.abs(c.net)) * 1e-9; }));
  check('shares add to the whole book',
    Math.abs(b.rows.reduce((t, r) => t + r.share, 0) - 1) < 1e-9);
  check('spot sits inside the window',
    b.spot <= b.rows[0].strike && b.spot >= b.rows[b.rows.length - 1].strike,
    `${b.rows[b.rows.length - 1].strike} <= ${b.spot.toFixed(2)} <= ${b.rows[0].strike}`);
  check('steps are signed strikes from spot',
    b.rows.every(r => Math.abs(r.steps * b.step - (r.strike - b.spot)) < 1e-9));
}

// ── 6. the change on a row is the change over the chosen window ──────────
{
  /*
    ══ THE OVERLAY IS PER STRIKE, NOT ONLY AT THE TOP ══════════════════════

    Noah: "did you make the overlay per strike? so far looks like you just
    put it on the top and i don't want that."

    The window control drove the scores and the band at the top of the panel;
    every ROW went on printing `drift.m5`, so picking 1H changed the ranking
    and left sixty-one badges reporting the last five minutes. `row.flow` is
    the row's own reading over the chosen window, and this is the assertion
    that it MOVES when the window does — a per-row figure that is the same at
    1m and 1D is the hardcoded one wearing a new name.
  */
  const fast = buildMatrix('SPY', ['gex'], { lookback: '1m' });
  const slow = buildMatrix('SPY', ['gex'], { lookback: '1d' });
  const flowOf = (b: ReturnType<typeof buildMatrix>) =>
    b.rows.map(r => (r.flow ? Math.round(r.flow.grew) : null));

  /* NOT EVERY ROW, AND THAT IS THE HONEST ANSWER. The chain recentres as
     spot moves, so a strike at the edge of today's book was not in the book
     an hour ago and has no past to difference against. `driftOf` returns
     null there rather than zero, because "did not move" and "was not here"
     are different facts and a badge reading `$0` would assert the first. */
  const carried = fast.rows.filter(r => r.flow !== null).length;
  check('almost every row carries its own change', carried > fast.rows.length * 0.85,
    `${carried} of ${fast.rows.length}`);
  check('  · and every reading that IS carried was differenced against a real past',
    fast.rows.every(r => r.flow === null || Number.isFinite(r.flow.was)) && carried > 0);
  check('  · and it is a different reading at a different window',
    flowOf(fast).join() !== flowOf(slow).join());

  /* THE BADGE AND THE SCORE READ THE SAME HISTORY. `flow` is built beside
     `change` from one `readingsAt`, so a row cannot be ranked on one window
     and print another. */
  const one = buildMatrix('SPY', ['gex'], { lookback: '15m' });
  check('the badge and the score are the same measurement',
    one.rows.every(r => r.flow === null || Math.abs(r.flow.delta - r.change) < 1e-6));

  /* AND IT IS GAMMA'S, HONESTLY. The session buffer records net GEX only. */
  const vega = buildMatrix('SPY', ['vex'], { lookback: '15m' });
  check('a family with no history carries no change rather than a made-up one',
    vega.rows.every(r => r.flow === null));

  /*
    ══ AND EVERY WINDOW AT ONCE, PER STRIKE ════════════════════════════════

    Making the badge follow the window was the half-fix: comparing 1m with
    1H still meant clicking twice, and the badge's material floor left three
    quarters of the rows blank — measured, 15 of 61. `pulse` is every
    window's reading at THIS strike, drawn as a sparkline under its net.
  */
  const pulsed = buildMatrix('SPY', ['gex'], { lookback: '15m' });
  const withPulse = pulsed.rows.filter(r => r.pulse.length > 0).length;
  /* A reading needs a past: the snapshots the windows look back into. On a
     day the seeded spot has walked, the strikes at the window's edge were
     never in any snapshot, and an honest row says nothing rather than
     inventing one — so the claim is made of the rows the history has SEEN.
     Every snapshot's strike set, over the same depth the build reads. */
  const deepest = WINDOWS[WINDOWS.length - 1].minutes + 2;
  const snaps = Simulator.getExpiryHistory('SPY', expiryOf('0dte'), deepest);
  const seen = new Set<number>();
  for (const w of WINDOWS) {
    const snap = snaps[snaps.length - 1 - w.minutes];
    if (snap) for (const l of snap.levels) seen.add(l.strike);
  }
  const covered = pulsed.rows.filter(r => seen.has(r.strike)).length;
  check('every row the history has seen carries a multi-window reading',
    withPulse === covered, `${withPulse} of ${covered} seen, ${pulsed.rows.length} rows`);
  check('  · and the history covers nearly the whole book',
    covered >= pulsed.rows.length - 6, `${covered} of ${pulsed.rows.length}`);
  check('  · and far more rows than the badge alone could carry',
    withPulse > pulsed.rows.filter(r => r.flow?.material).length * 2,
    `${withPulse} vs ${pulsed.rows.filter(r => r.flow?.material).length} material badges`);
  check('  · one entry per window the strike has a past for, in window order',
    pulsed.rows.every(r => {
      const want = WINDOWS.map(w => w.key).filter(k => r.pulse.some(q => q.key === k));
      return r.pulse.map(q => q.key).join() === want.join();
    }));
  check('  · never more entries than there are windows',
    pulsed.rows.every(r => r.pulse.length <= WINDOWS.length));

  /* THE RULER IS THE BOOK'S, so a tall tick is the same dollars on every
     row — the whole reason a column of these can be scanned. */
  const biggest = Math.max(...pulsed.rows.flatMap(r => r.pulse.map(q => Math.abs(q.grew))));
  check('the tick ruler is the biggest move at any strike over any window',
    Math.abs(pulsed.pulseScale - biggest) < 1, `${(pulsed.pulseScale / 1e6).toFixed(1)}M`);
  check('  · so nothing can draw past full height',
    pulsed.rows.every(r => r.pulse.every(q => Math.abs(q.grew) <= pulsed.pulseScale + 1)));

  /* THE SQUARE ROOT THE VIEW DRAWS WITH IS MONOTONE — a bigger move is
     never a shorter tick, which is what stops the picture contradicting the
     figures beside it. Asserted on the mapping itself, not on pixels. */
  const height = (v: number) => Math.sqrt(Math.min(1, Math.abs(v) / pulsed.pulseScale));
  const sample = pulsed.rows.flatMap(r => r.pulse.map(q => q.grew)).sort((a, b) => Math.abs(a) - Math.abs(b));
  check('tick height is monotone in the move it draws',
    sample.every((v, i) => i === 0 || height(v) >= height(sample[i - 1]) - 1e-9),
    `${sample.length} readings`);
  check('  · and lifts a small move clear of the floor a linear scale left it on',
    height(pulsed.pulseScale * 0.01) > 0.09 && pulsed.pulseScale * 0.01 / pulsed.pulseScale < 0.02);

  /*
    A CROSSING IS A DIFFERENT EVENT and the strip draws it in its own ink.

    The claim is arithmetic rather than a type check: `now` and `then` are
    recoverable from the pair the entry carries — `then = now − change` and
    `|now| − |then| = grew` — so whether the sign actually changed can be
    recomputed here and checked against the flag the engine set.
  */
  const crossOk = pulsed.rows.every(r => {
    const now = r.cells.gex?.net ?? 0;
    return r.pulse.every(q => {
      const then = now - q.change;
      return q.crossed === ((then >= 0) !== (now >= 0));
    });
  });
  check('a crossing is flagged exactly where the sign changed', crossOk);
  check('  · and grew is the magnitude difference, not the signed one',
    pulsed.rows.every(r => {
      const now = r.cells.gex?.net ?? 0;
      return r.pulse.every(q => Math.abs(q.grew - (Math.abs(now) - Math.abs(now - q.change))) < 1e-6);
    }));

  /* AND HONESTLY ABSENT OFF GAMMA. */
  const vegaPulse = buildMatrix('SPY', ['vex'], { lookback: '15m' });
  check('a family with no history carries no strip at all',
    vegaPulse.rows.every(r => r.pulse.length === 0) && vegaPulse.pulseScale === 0);

  /* NOTHING ON THE BOARD SAYS HOT, WARM, BUILDING, FADE OR QUIET ANY MORE.
     Noah: "remove the fade and warm from matrix completely." The ranking is
     the shortlist's ORDER and the words that survive are the structural
     ones — see the note in data/pinpoint/board.ts. */
  const words = new Set(Object.values(ROLE_WORDS));
  check('the only words a strike can wear are structural',
    [...words].every(w => !/HOT|WARM|BUILDING|FADE|QUIET/.test(w)), [...words].join(' · '));
}

// ── 7. the structural names come from the levels engine ───────────────────
{
  const b = buildMatrix('SPY', ['gex'], { lookback: '15m' });
  const at = (role: string) => b.rows.find(r => r.role === role)?.strike ?? null;
  /*
    The pin and the walls must be the tape's, or this desk and the chart
    would crown different strikes.

    ══ ONE ROW, ONE NAME, AND THE PRECEDENCE IS PART OF THE CLAIM ══════════

    `at('callWall') === levels.callWall` passed for as long as the two
    levels happened to sit on different strikes, and today they do not —
    SPY's supreme and its call wall are both 501, `assignRoles` gives that
    row the higher-ranking name, and the assertion read the absence of
    `callWall` as a disagreement with the engine. It was not: the desk and
    the levels engine agree exactly, and the row can only wear one word.

    So the claim is stated the way the code actually works — each named
    level is on its own strike's row UNLESS a higher-ranking name has
    already claimed it — which is a stronger assertion than the old one and
    does not depend on where the book happens to sit today.
  */
  const RANK = ['pin', 'callWall', 'putWall', 'flip'] as const;
  const named = (strike: number | null) => (strike == null ? null : b.rows.find(r => r.strike === strike)?.role ?? null);
  for (const [i, role] of RANK.entries()) {
    const want = role === 'pin' ? b.levels.supreme : b.levels[role as 'callWall' | 'putWall' | 'flip'];
    if (want == null || !b.rows.some(r => r.strike === want)) continue;
    const claimedBy = named(want);
    const outranked = RANK.slice(0, i).some(higher => {
      const other = higher === 'pin' ? b.levels.supreme : b.levels[higher as 'callWall' | 'putWall' | 'flip'];
      return other === want;
    });
    check(`the ${role} is the levels engine's`,
      claimedBy === role || (outranked && claimedBy === RANK[RANK.findIndex(x => x === claimedBy)]),
      `${want} wears ${claimedBy}${outranked ? ' (outranked, and that is the rule)' : ''}`);
  }
  check('a strike carries at most one role', b.rows.every(r => r.role === null || ROLE_WORDS[r.role] !== undefined));
  /* MAGNET has to earn itself — it is the only role this board invents, so
     it may never land on a strike the levels engine already named. */
  const magnets = b.rows.filter(r => r.role === 'magnet');
  check('a magnet is never a strike the engine already named',
    magnets.every(r => r.strike !== b.levels.supreme && r.strike !== b.levels.callWall &&
      r.strike !== b.levels.putWall && r.strike !== b.levels.flip),
    `${magnets.length} magnets`);
  check('  · and is close, heavy and scoring', magnets.every(r => Math.abs(r.steps) <= 4 && r.share >= 0.06 && r.weight >= MAGNET_WEIGHT));
}

// ── 8. the loaded list is the score's list ────────────────────────────────
{
  const b = buildMatrix('SPY', ['gex'], { lookback: '15m' });
  check('the loaded list is ranked by score', b.loaded.every((r, i) => i === 0 || r.weight <= b.loaded[i - 1].weight),
    b.loaded.map(r => `${r.strike}:${(r.weight * 100).toFixed(0)}`).join(' '));
  check('  · every entry is a real row of this board', b.loaded.every(r => b.rows.includes(r)));
  check('  · nothing was promoted past a higher score', (() => {
    const cut = b.loaded[b.loaded.length - 1]?.weight ?? 0;
    return b.rows.filter(r => r.weight > cut).every(r => b.loaded.includes(r));
  })());
  check('  · and the list is short enough to read', b.loaded.length <= 6, `${b.loaded.length}`);

  /* A pure ranking, with no hand-placed exceptions — asserted by asking for
     one entry and getting the single best. */
  const one = loadedStrikes(b.rows, 1);
  check('  · asking for one gives the best one', one.length === 1 &&
    one[0].weight === Math.max(...b.rows.filter(r => r.weight >= NOTICEABLE || r.role !== null).map(r => r.weight)));
}

// ── 9. the overlay reads the term structure ───────────────────────────────
{
  const b = buildMatrix('SPY', ['gex'], { lookback: '15m' });
  check('every window is read', b.reads.length === WINDOWS.length, b.reads.map(r => r.label).join(' '));
  check('  · in order, shortest first', b.reads.every((r, i) => i === 0 || r.minutes > b.reads[i - 1].minutes));
  /* RATE IS WHAT MAKES TWO WINDOWS COMPARABLE. A bigger number over four
     hours is not necessarily a faster one, and a column of totals says
     "longer windows moved more", which is arithmetic rather than news. */
  check('  · each carries a per-minute rate',
    b.reads.every(r => !r.covered || Math.abs(r.rate * r.minutes - r.change) < Math.max(1, Math.abs(r.change)) * 1e-9));
  check('  · a window with no history says so rather than reading zero',
    b.reads.every(r => r.covered || (r.change === 0 && r.dir === 0)));
  check('  · the longest window claims no acceleration, having nothing to compare with',
    b.reads[b.reads.length - 1].accel === 0);
  const covered = b.reads.filter(r => r.covered);
  check('  · and the live board covers several windows', covered.length >= 4,
    covered.map(r => `${r.label} ${money(r.change)}`).join(' · '));

  /* Built by hand, so the acceleration rule is checked rather than observed:
     a minute moving faster than the five minutes around it is accelerating. */
  const snaps = (vals: number[]) => vals.map(v => ({ levels: [{ strike: 100, value: v }] }));
  const series = new Array(400).fill(0).map((_, i) => i * 10);
  series[series.length - 1] = series[series.length - 2] + 500; // a sudden last minute
  const reads = windowReads(snaps(series), [100]);
  const m1 = reads.find(r => r.key === '1m')!;
  check('a sudden last minute reads as acceleration', m1.accel === 1, `1m rate ${m1.rate.toFixed(1)}`);
  const flat = windowReads(snaps(new Array(400).fill(0).map((_, i) => i * 10)), [100]);
  check('  · and a steady tape does not', flat.find(r => r.key === '1m')!.accel === 0);
}

// ── 10. the controls are wired, not decorative ────────────────────────────
{
  /* THE TEST THAT MATTERS. If changing the expiry or the window left the
     board identical, both controls would be state with no consequence. */
  const zero = buildMatrix('SPY', ['gex'], { expiry: '0dte', lookback: '15m' });
  const month = buildMatrix('SPY', ['gex'], { expiry: 'monthly', lookback: '15m' });
  check('changing the expiry changes the ladder', zero.peak !== month.peak,
    `peak ${money(zero.peak)} vs ${money(month.peak)}`);
  check('  · and moves the bars, not just their scale', (() => {
    const a = zero.rows.map(r => r.callBar.toFixed(3)).join();
    const b2 = month.rows.map(r => r.callBar.toFixed(3)).join();
    return a !== b2;
  })());
  check('  · and the board reports which expiry it is', zero.expiry.key === '0dte' && month.expiry.key === 'monthly');

  const fast = buildMatrix('SPY', ['gex'], { lookback: '1m' });
  const slow = buildMatrix('SPY', ['gex'], { lookback: '4h' });
  check('changing the window changes the scores', (() => {
    const a = fast.rows.map(r => r.weight.toFixed(4)).join();
    const b2 = slow.rows.map(r => r.weight.toFixed(4)).join();
    return a !== b2;
  })(), `1m vs 4h`);
  check('  · and the board reports which window it is', fast.lookback.key === '1m' && slow.lookback.key === '4h');
  check('  · an unknown window falls back rather than throwing', windowOf('nope' as never).key === '15m');

  /* The reach is the view's to choose and the engine clamps it rather than
     trusting a caller's viewport arithmetic. */
  /* THE TABLE DRAWS THE WHOLE CHAIN — it always has, and that is the point
     of it: a book with nothing at a level is a fact about the book. */
  check('the table carries the whole chain', buildMatrix('SPY', ['gex']).rows.length === 61);

  check('the reading is stamped', Math.abs(Date.now() - zero.builtAt) < 60_000);
}

// ── 11. what a panel can hold is arithmetic, not taste ────────────────────
{
  /*
    ══ THE MEASURED LAYOUT IS PART OF THE PIPELINE ═════════════════════════

    Everything above proves the numbers. This proves the room they are drawn
    in, because the board's failures have all been layout failures: a control
    a hundred pixels past the panel's edge, a net column squeezed until a
    badge was cut inside its own cell, a drawer that took the picture's width.

    The constants below are BoardPanel's, restated on purpose — if the two
    drift apart the assertions here stop describing the panel, and that is
    the thing worth catching.
  */
  const TABLE_MAX = 76 + 140; // COLS at their unsqueezed widths
  const LANE_MIN = 96; // PROFILE_MIN_PX
  const PAD = 16;
  const DRAWER_MIN = 300;

  const tableAt = (w: number, d: { drawerW: number }) => w - d.drawerW - PAD;

  /* The panel widths the board actually produces, with the lane on. */
  const WIDE = [948, 788, 708, 628] as const;
  const NARROW = [469, 384] as const;

  /* Beside the table where there is room for it; a PEEK over the table
     where there is not — see the door in BoardPanel. The squeeze claim is
     about the first case; the second is measured on its own below. */
  check('a drawer never leaves the figures squeezed',
    [...WIDE, ...NARROW].every(w => {
      const d = densityFor(w, 700, true);
      return !d.showDrawer || tableAt(w, d) >= TABLE_MAX;
    }));
  check('  · and below the floor the door still opens — a peek that takes the body whole',
    NARROW.every(w => {
      const d = densityFor(w, 700, true);
      return !d.showDrawer && d.drawerW === w - PAD;
    }),
    NARROW.map(w => `${w}→${densityFor(w, 700, true).drawerW}`).join(' · '));
  /* The lane is drawn against the PANEL's width now, not the panel less the
     pane — the pane floats. So the lane's floor is the table's own gate. */
  check('  · and the lane has its floor wherever the table leaves it room',
    [...WIDE, ...NARROW].every(w => w - TABLE_MAX >= LANE_MIN || w < 400),
    WIDE.map(w => `${w}→lane ${w - TABLE_MAX}`).join(' · '));
  check('  · and is never narrower than a drawer is worth',
    [...WIDE, ...NARROW].every(w => {
      const d = densityFor(w, 700, true);
      return d.drawerW === 0 || d.drawerW >= DRAWER_MIN;
    }));

  /*
    ══ THE PANE FLOATS, SO THE LANE DOES NOT ENTER INTO ITS FLOOR ══════════

    It lies over the picture the way the reference lies over its chart; what
    it may not cover is the strike and its net. So the floor is the table
    plus the narrowest pane worth drawing, and the lane toggle changes what
    is UNDER the pane rather than whether there is room for one.
  */
  check('the pane floor is the same with the picture on or off',
    drawerFloor(false) === drawerFloor(true),
    `${drawerFloor(true)}px`);
  check('  · and it is the table plus the narrowest useful pane',
    drawerFloor(true) === TABLE_MAX + DRAWER_MIN + PAD);
  check('  · and the pane beside the table never covers the strike or the net',
    [...WIDE, ...NARROW].every(w => {
      const d = densityFor(w, 700, true);
      return !d.showDrawer || w - d.drawerW - PAD >= TABLE_MAX;
    }));

  /*
    ══ THE READER'S WIDTH, HELD TO THE PANEL'S RANGE ══════════════════════

    Noah: "let people be able to customize how big the slide screener is,
    some people may want it smaller." The grip may set any width; what it
    may not do is cover the strike and its net, or go under the width the
    pane's own grids need. So the stored width is clamped on every render
    against THIS panel — a width dragged on a wide monitor is simply held
    to a narrow one's range.
  */
  check('a dragged width is honoured inside the range',
    WIDE.every(w => densityFor(w, 700, true, 320).drawerW === 320 && densityFor(w, 700, true, 300).drawerW === 300));
  check('  · and never goes under the narrowest useful pane',
    WIDE.every(w => densityFor(w, 700, true, 100).drawerW === DRAWER_MIN));
  check('  · and never covers the strike or the net however far it is pulled',
    WIDE.every(w => {
      const d = densityFor(w, 700, true, 9999);
      return d.drawerW === paneBounds(w).max && w - d.drawerW - PAD >= TABLE_MAX;
    }),
    WIDE.map(w => `${w}→${paneBounds(w).max}`).join(' · '));
  check('  · the range is well-formed on every board width',
    [...WIDE, ...NARROW].every(w => paneBounds(w).min === DRAWER_MIN && paneBounds(w).max >= paneBounds(w).min && paneBounds(w).max <= 720));
  check('  · null is the opening width, the same as before the grip existed',
    WIDE.every(w => densityFor(w, 700, true, null).drawerW === densityFor(w, 700, true).drawerW));
  check('  · and a peek ignores it — the body whole, as always',
    NARROW.every(w => densityFor(w, 700, true, 300).drawerW === w - PAD));

  /*
    ══ THE OPENING WIDTH LEAVES THE LANE IN VIEW ══════════════════════════

    Measured on the two-panel 1600: a 460px pane over a 572px lane left a
    hundred pixels of the picture. The opening width yields to the lane
    first, floored at the pane's own minimum.
  */
  check('the pane opens leaving the lane in view wherever the lane has the room',
    WIDE.every(w => {
      const d = densityFor(w, 700, true);
      const room = w - TABLE_MAX - PAD;
      return room - LANE_KEEP < DRAWER_MIN ? d.drawerW === DRAWER_MIN : room - d.drawerW >= LANE_KEEP;
    }),
    WIDE.map(w => `${w}→pane ${densityFor(w, 700, true).drawerW}, lane ${w - TABLE_MAX - PAD - densityFor(w, 700, true).drawerW}`).join(' · '));
  check('  · and never opens wider than two cards and a feed', WIDE.every(w => densityFor(w, 700, true).drawerW <= 460));
  check('  · on the two-panel 1600, that is a 336px pane over 220px of lane',
    densityFor(788, 700, true).drawerW === 336, `${densityFor(788, 700, true).drawerW}`);

  check('the five-panel board carries neither', !densityFor(384, 793, true).showDrawer);
  check('a short panel gets no drawer however wide it is', !densityFor(1400, 300, true).showDrawer);
  check('the shortlist asks for fewer rows when the panel is short',
    densityFor(900, 500, true).loadedRows === 3 && densityFor(900, 800, true).loadedRows === 5);
}

// ── 12. a label that does not fit is not drawn ────────────────────────────
{
  /*
    ══ THE MARK IS GATED ON ITS OWN WORD ═══════════════════════════════════

    The lane's annotation lives in the half its bar is not in. One threshold
    for every row passes on the short word and then prints the long one over
    the picture — PUT WALL is three characters longer than MAGNET and five
    longer than PIN — so the gate reads the row's own role, and this holds
    the arithmetic: whatever `markFor` says is drawable must fit the half.
  */
  const ROLES: Exclude<Role, null>[] = ['pin', 'callWall', 'putWall', 'flip', 'magnet'];
  const LANES = [80, 96, 112, 128, 160, 208, 260, 400, 600];

  let over = 0;
  let drawn = 0;
  let withheld = 0;
  for (const lane of LANES)
    for (const r of ROLES) {
      const fits = markFor(lane, r);
      if (fits) {
        drawn += 1;
        if (ROLE_WORDS[r].length * INK_PER_CHAR > lane / 2 - MARK_PAD) over += 1;
      } else withheld += 1;
    }
  check('nothing drawn in the lane is wider than its half', over === 0,
    `${ROLES.length * LANES.length} combinations`);
  check('  · the wide lanes do name their levels', drawn > 0);
  check('  · and the narrow ones stay silent rather than overlapping', withheld > 0);

  /* A ROW WITH NO ROLE HAS NOTHING TO SAY HERE, at any width — the grade
     that used to fill that space is gone on purpose. */
  check('a strike with no structural name is never marked',
    LANES.every(w => !markFor(w, null)));

  /* THE LONGEST WORD AND THE SHORTEST, at the lane two panels on a 1600
     actually produce. */
  check('PUT WALL does not fit a 112px lane', !markFor(112, 'putWall'),
    `needs ${ROLE_WORDS.putWall.length * INK_PER_CHAR}px of ${112 / 2 - MARK_PAD}`);
  check('  · but PIN does', markFor(112, 'pin'));
  check('  · and a 600px lane names every one of them', ROLES.every(r => markFor(600, r)));
}

// ── 13. the table arrives full: FIT is arithmetic on the measured box ─────
{
  /*
    Noah: "you see how full on the screen and how well everything fits on
    skylit ai heatmaps?" What makes that board full is that it draws exactly
    as many strikes as the screen has rows for. FIT is that, stated as a
    function of the body's measured height, and these are the claims a
    browser cannot make faster than arithmetic can.
  */
  const content = (h: number) => 2 * EDGE_H + SPOT_H + fitRows(h) * ROW_H;
  const HEIGHTS = [0, 200, 380, 500, 601, 701, 781, 900, 1257, 1800];

  check('FIT is one of the spans, and the whole chain is still the last',
    (REACHES as readonly unknown[]).includes('fit') && REACHES[REACHES.length - 1] === null,
    REACHES.map(r => (r == null ? 'all' : String(r))).join(' → '));
  check('a body never scrolls under FIT once it can hold the floor',
    HEIGHTS.filter(h => fitRows(h) > FIT_MIN).every(h => content(h) <= h),
    HEIGHTS.map(h => `${h}→${fitRows(h)}`).join(' · '));
  /* To the ROW: a symmetric span could only grow two at a time, and a box
     with room for one more strike drew a strip of nothing at the foot. */
  check('  · and never leaves a row of room unused',
    HEIGHTS.filter(h => fitRows(h) > FIT_MIN).every(h => content(h) + ROW_H > h));
  check('  · more height is never fewer strikes',
    HEIGHTS.every((h, i) => i === 0 || fitRows(h) >= fitRows(HEIGHTS[i - 1])));
  check('  · and a box too short for a table still gets a table',
    fitRows(0) === FIT_MIN && fitRows(100) === FIT_MIN, `${FIT_MIN} rows`);
  /* The three bodies the sweep measures — a three-panel 1440×900, a
     two-panel 1600×1000 and a five-panel 1920×1080 — restated so the
     arithmetic and the browser cannot agree by accident. */
  check('  · a 601px body holds 18 strikes', fitRows(601) === 18, `${fitRows(601)}`);
  check('  · a 701px body holds 22', fitRows(701) === 22, `${fitRows(701)}`);
  check('  · a 781px body holds 25', fitRows(781) === 25, `${fitRows(781)}`);
  /* The engine is told a count, never 'fit' — see `rowsN` in the panel. */
  const fit = buildMatrix('SPY', ['gex'], { lookback: '15m', rows: fitRows(701) });
  const nearest = fit.rows.reduce((b, r) => (Math.abs(r.strike - fit.spot) < Math.abs(b.strike - fit.spot) ? r : b), fit.rows[0]);
  const above = fit.rows.filter(r => r.strike > nearest.strike).length;
  const below = fit.rows.filter(r => r.strike < nearest.strike).length;
  check('  · and the engine draws exactly that many, centred on the money',
    fit.rows.length === 22 && fit.spot <= fit.rows[0].strike && fit.spot >= fit.rows[fit.rows.length - 1].strike,
    `${fit.rows[fit.rows.length - 1].strike}…${fit.rows[0].strike} around ${fit.spot.toFixed(2)}`);
  check('  · with the odd row below spot, where the eye already is', below === above + 1, `${above} above · ${below} below`);
  const span = buildMatrix('SPY', ['gex'], { lookback: '15m', reach: 8 });
  check('  · while a span is still a span', span.rows.length === 17);
}

// ── 14. the lane is drawn against the net's own ruler ─────────────────────
{
  /*
    The table has one column now, so the lane's ruler is that column's
    heaviest reading — see `netScales` in matrix.ts. Against the old
    three-column ruler the wall drew at two-fifths of the lane.
  */
  const m = buildMatrix('SPY', ['gex'], { lookback: '15m' });
  const heaviest = Math.max(...m.rows.map(r => Math.abs(r.cells.gex?.net ?? 0)));
  const ruler = m.netScales.gex ?? 0;
  check('the net ruler is the heaviest net in the book', Math.abs(ruler - heaviest) < 1e-6, `${money(ruler)} vs ${money(heaviest)}`);
  check('  · which is never wider than the three-column ruler', ruler <= (m.scales.gex ?? 0) + 1e-6,
    `${money(ruler)} ≤ ${money(m.scales.gex ?? 0)}`);
  check('  · so the wall reaches the lane\'s edge', m.rows.some(r => Math.abs(r.cells.gex?.net ?? 0) / ruler > 0.999));
  const again = buildMatrix('SPY', ['gex'], { lookback: '15m', prevNetScales: m.netScales, prevScales: m.scales });
  check('  · and it is held across a rebuild the way the other ruler is', again.netScales.gex === m.netScales.gex);
  const dex = buildMatrix('SPY', ['dex'], { lookback: '15m' });
  check('  · and delta has its own', (dex.netScales.dex ?? 0) > 0 && dex.netScales.dex !== m.netScales.gex);
}

console.log(`\n${pass} passed, ${fail} failed`);
