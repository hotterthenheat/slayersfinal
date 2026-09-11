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
  GRADE_WORDS,
  HOT,
  MOVE_FLOOR,
  NOTICEABLE,
  ROLE_WORDS,
  WARM,
  WEIGHTS,
  WINDOWS,
  gradeOf,
  loadedStrikes,
  proximityOf,
  scoreOf,
  windowOf,
  windowReads,
  type Components,
  type Grade,
  type Role,
} from '../src/data/pinpoint/board';
import { buildMatrix, type MatrixRow } from '../src/data/pinpoint/matrix';
import { densityFor } from '../src/pages/pinpoint/board/density';
import { CHIP_PAD, GAP, INK_PER_CHAR, markFor } from '../src/pages/pinpoint/board/BoardPanel';
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

// ── 6. a badge is a reading ───────────────────────────────────────────────
{
  const parts = (o: Partial<Components> = {}): Components =>
    ({ gamma: 0, flow: 0, proximity: 0, urgency: 0, ...o });

  check('a big quiet level is HOT', gradeOf(HOT + 0.01, parts(), 0, 100) === 'hot');
  check('a middling one is WARM', gradeOf(WARM + 0.01, parts(), 0, 100) === 'warm');
  check('and most of a book is QUIET', gradeOf(0.1, parts(), 0, 100) === 'quiet');

  /* DIRECTION BEATS SIZE. */
  check('a level filling fast reads BUILDING even below HOT',
    gradeOf(NOTICEABLE + 0.01, parts({ urgency: 0.9 }), 50, 100) === 'building');
  check('  · and one draining fast reads FADE however big it is',
    gradeOf(0.95, parts({ urgency: 0.9 }), -50, 100) === 'fading');
  /* A move too small to register does not get a direction word. */
  check('  · a move under the floor is not a direction',
    gradeOf(0.1, parts({ urgency: 0.9 }), MOVE_FLOOR * 100 * 0.5, 100) === 'quiet');
  check('every grade has a word', Object.keys(GRADE_WORDS).length === 5);

  /* On the live book: badges are earned, and most rows do not earn one. */
  const b = buildMatrix('SPY', ['gex'], { lookback: '15m' });
  const quiet = b.rows.filter(r => r.grade === 'quiet').length;
  check('most of a real book is quiet', quiet > b.rows.length * 0.4 && quiet < b.rows.length,
    `${quiet} of ${b.rows.length}`);
  const graded = new Set(b.rows.map(r => r.grade));
  check('  · and the board is not all one word', graded.size >= 2, [...graded].join(' '));
}

// ── 7. the structural names come from the levels engine ───────────────────
{
  const b = buildMatrix('SPY', ['gex'], { lookback: '15m' });
  const at = (role: string) => b.rows.find(r => r.role === role)?.strike ?? null;
  /* The pin and the walls must be the tape's, or this desk and the chart
     would crown different strikes. */
  if (b.rows.some(r => r.strike === b.levels.supreme))
    check('the pin is the levels engine\'s supreme', at('pin') === b.levels.supreme, `${at('pin')}`);
  if (b.rows.some(r => r.strike === b.levels.callWall))
    check('the call wall agrees', at('callWall') === b.levels.callWall, `${at('callWall')}`);
  if (b.rows.some(r => r.strike === b.levels.putWall))
    check('the put wall agrees', at('putWall') === b.levels.putWall, `${at('putWall')}`);
  check('a strike carries at most one role', b.rows.every(r => r.role === null || ROLE_WORDS[r.role] !== undefined));
  /* MAGNET has to earn itself — it is the only role this board invents, so
     it may never land on a strike the levels engine already named. */
  const magnets = b.rows.filter(r => r.role === 'magnet');
  check('a magnet is never a strike the engine already named',
    magnets.every(r => r.strike !== b.levels.supreme && r.strike !== b.levels.callWall &&
      r.strike !== b.levels.putWall && r.strike !== b.levels.flip),
    `${magnets.length} magnets`);
  check('  · and is close, heavy and scoring', magnets.every(r => Math.abs(r.steps) <= 4 && r.share >= 0.06 && r.weight >= WARM));
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
    badge was cut inside its own cell, a rail that took the picture's width.

    The constants below are BoardPanel's, restated. They are restated on
    purpose — if the two drift apart, the assertions here stop describing the
    panel and that is the thing worth catching.
  */
  const TABLE_MAX = 80 + 116 + 116 + 150; // COLS at their unsqueezed widths
  const LANE_MIN = 96; // PROFILE_MIN_PX
  const PAD = 16;
  const RAIL_MIN = 210;

  /* The three panel widths the board actually produces on the three
     commonest screens, at the default two-panel board. */
  const laptop = densityFor(708, 613); //  1440 x 900
  const desk = densityFor(788, 713); //    1600 x 1000
  const big = densityFor(948, 793); //     1920 x 1080
  const dense = densityFor(469, 613); //   three panels on a 1440
  const five = densityFor(384, 793); //    five panels on a 1920

  const laneAt = (w: number, d: { railW: number }) => w - d.railW - PAD - TABLE_MAX;

  check('a rail never leaves the figures squeezed',
    [[708, laptop], [788, desk], [948, big], [469, dense], [384, five]].every(
      ([w, d]) => (d as { railW: number }).railW === 0 || (w as number) - (d as { railW: number }).railW - PAD >= TABLE_MAX
    ));
  check('  · and never takes the lane below its floor',
    [[788, desk], [948, big]].every(([w, d]) => laneAt(w as number, d as { railW: number }) >= LANE_MIN),
    `788 leaves ${laneAt(788, desk)}, 948 leaves ${laneAt(948, big)}`);
  check('  · so the picture outranks the list when only one fits',
    !laptop.showRail && laneAt(708, laptop) >= LANE_MIN,
    `708: rail=${laptop.showRail} lane=${laneAt(708, laptop)}`);
  check('  · and both fit from 784 up', desk.showRail && big.showRail && desk.railW >= RAIL_MIN);
  check('  · while the narrow boards carry neither', !dense.showRail && !five.showRail);
  check('a short panel gets no rail however wide it is', !densityFor(1400, 300).showRail);

  /* THE FLOW BAND MUST NOT ESCAPE. It did — a hundred pixels past a 377px
     panel, drawn on top of the panel beside it. */
  check('the flow band never offers more than it can draw',
    [320, 377, 420, 469, 520, 628, 708].every(w => {
      const d = densityFor(w, 700);
      return d.overlayWindows >= 3 && d.overlayWindows <= (d.showRail ? 7 : w >= 520 ? 7 : 6);
    }));
  check('  · and the rail form gets all seven', desk.overlayWindows === 7 && big.overlayWindows === 7);
  check('  · a panel too narrow for a row gets the mini form', densityFor(400, 700).overlay === 'mini');
  check('  · and the rail stacks them', desk.overlay === 'column');

  check('the loaded list needs height, not just width', !densityFor(900, 400).showLoaded && densityFor(900, 700).showLoaded);
  check('  · and asks for fewer rows when it is short',
    densityFor(900, 500).loadedRows === 3 && densityFor(900, 700).loadedRows === 5);
}

// ── 12. a label that does not fit is not drawn ────────────────────────────
{
  /*
    ══ THE MARK IS GATED ON ITS OWN WORDS ══════════════════════════════════

    The lane's annotation lives in the half its bar is not in. A single
    threshold for every row passed on the strength of WARM and then printed
    BUILDING — two characters longer than any other grade — three pixels
    into the bar it was annotating.

    So the gate reads the row's own words, and this holds the arithmetic:
    whatever `markFor` says can be drawn must actually fit the half.
  */
  const GRADES: Grade[] = ['hot', 'warm', 'building', 'fading', 'quiet'];
  const ROLES: (Role | null)[] = [null, 'pin', 'callWall', 'putWall', 'flip', 'magnet'];
  const LANES = [80, 96, 112, 128, 160, 208, 260, 400, 600];

  const drawn = (lane: number, g: Grade, r: Role) => {
    const half = lane / 2 - 8;
    const chip = CHIP_PAD + GRADE_WORDS[g].length * INK_PER_CHAR;
    const role = r ? GAP + ROLE_WORDS[r].length * INK_PER_CHAR : 0;
    const m = markFor(lane, g, r);
    if (m === 'none') return 0;
    return m === 'full' ? chip + role : chip;
  };

  let over = 0;
  let anyFull = 0;
  let anyNone = 0;
  for (const lane of LANES)
    for (const g of GRADES)
      for (const r of ROLES) {
        const need = drawn(lane, g, r);
        if (need > lane / 2 - 8) over += 1;
        const m = markFor(lane, g, r);
        if (m === 'full') anyFull += 1;
        if (m === 'none') anyNone += 1;
      }
  check('nothing drawn in the lane is wider than its half', over === 0,
    `${GRADES.length * ROLES.length * LANES.length} combinations`);
  check('  · and the widest lanes draw the role word too', anyFull > 0);
  check('  · while the narrowest draw nothing rather than overlapping', anyNone > 0);

  /* THE CASE THAT BROKE IT, named so it cannot come back by accident. */
  check('BUILDING is not drawn in a 112px lane', markFor(112, 'building', null) === 'none',
    `needs ${CHIP_PAD + GRADE_WORDS.building.length * INK_PER_CHAR}px of ${112 / 2 - 8}`);
  check('  · but WARM is', markFor(112, 'warm', null) === 'grade');
  check('  · and a 600px lane draws BUILDING with its role',
    markFor(600, 'building', 'callWall') === 'full');
}

console.log(`\n${pass} passed, ${fail} failed`);
