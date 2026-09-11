/*
  Acceptance test for the Matrix engine — inventory and sensitivity by strike,
  one column group per family, three columns inside each. Runs the ACTUAL
  module; no browser, no React.

  Proves:
  1. ONE RULER PER FAMILY, shared by its put, call and net columns — so a put
     bar and a net bar of the same length mean the same dollars. Normalising
     each column to its own maximum is the defect this exists to avoid.
  2. The scale HOLDS through a small drift and moves for a large one — a
     group that re-normalises every tick reads as a market that moved when
     only the divisor did.
  3. THE NET TAKES ITS COLOUR FROM ITS SIGN, which is the one correction to
     the design this was drawn from: the column where the sign is the whole
     answer was the only column whose ink did not carry it.
  4. A BADGE READS WEIGHT, NOT THE SIGNED NUMBER. A call-dominant level that
     doubles reads +100%, not −100%; a level that crosses zero is reported as
     a swap rather than a percentage; a base too small to divide by, and an
     answer past the cap, both fall back to the move in dollars.
  5. Focus keeps what is named, what is heavy in ANY family on screen, and
     what has moved — and it never removes a row.
  6. Against the LIVE simulator: every strike the chain carries gets a row,
     highest first; put and call legs sum to the net; the walls, the flip and
     the pin land on the strikes the levels engine names; every family draws,
     states its shock, and claims a history only if it has one.
*/
import {
  BADGE_FLOOR,
  CALL_INK,
  CROWN_FLOOR,
  DRIFT_METRICS,
  FOCUS_FLOOR,
  FOCUS_MOVE,
  NET_NEG_INK,
  NET_POS_INK,
  PCT_CAP,
  PCT_FLOOR,
  PUT_INK,
  SCALE_DRIFT,
  SHOCK,
  badgeWords,
  buildMatrix,
  cellMoney,
  crossWords,
  crossedTo,
  crownWord,
  holdScale,
  markMeaningful,
  metricLabel,
  metricName,
  metricUnit,
  netInk,
  type Drift,
  type MatrixRow,
} from '../src/data/matrix';
import { LADDER_METRICS, type LadderMetric } from '../src/data/gex';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

const ALL = LADDER_METRICS.map(m => m.key);

// ── 1. one ruler per family ───────────────────────────────────────────────
{
  const m = buildMatrix('SPY', ['gex', 'dex', 'vex']);
  for (const f of ['gex', 'dex', 'vex'] as LadderMetric[]) {
    const s = m.scales[f] ?? 0;
    const widest = m.rows.reduce((w, r) => {
      const c = r.cells[f];
      return c ? Math.max(w, Math.abs(c.put), Math.abs(c.call), Math.abs(c.net)) : w;
    }, 0);
    /* The ruler is the widest thing in ANY of the three columns, so no bar
       can overflow its cell and none of the three is scaled to itself. */
    check(`${metricLabel(f)} · one ruler covers all three columns`, s >= widest - 1e-6,
      `${cellMoney(s)} ≥ widest ${cellMoney(widest)}`);
    check(`  · and it is not slack`, s <= widest * 1.0001 + 1, `${cellMoney(s)}`);
  }
  /* Between groups the rulers differ, necessarily — a vega dollar is not a
     gamma dollar — which is why the header prints its own. */
  const distinct = new Set(['gex', 'dex', 'vex'].map(f => m.scales[f as LadderMetric]));
  check('and the groups do not share one', distinct.size > 1, [...distinct].map(v => cellMoney(v ?? 0)).join(' · '));
}

// ── 2. the scale holds, then moves ────────────────────────────────────────
{
  check('with nothing held, the scale is what it is', holdScale(null, 250) === 250);
  const inside = 100 * (1 + SCALE_DRIFT * 0.5);
  check(`a ${(SCALE_DRIFT * 50).toFixed(1)}% drift does not move it`, holdScale(100, inside) === 100, `${inside} held at 100`);
  const outside = 100 * (1 + SCALE_DRIFT * 2);
  check(`a ${(SCALE_DRIFT * 200).toFixed(0)}% drift does`, holdScale(100, outside) === outside);
  check('and it moves downward too', holdScale(100, 40) === 40);
  check('a dead book still gives a divisor rather than a division by zero', holdScale(null, 0) === 1);

  /* Held THROUGH a rebuild, which is the case that matters: the panel hands
     its last scales back in and a small move must not repaint the column. */
  const a = buildMatrix('SPY', ['gex']);
  const b = buildMatrix('SPY', ['gex'], { prevScales: a.scales });
  check('a rebuild with the same book keeps the same ruler', a.scales.gex === b.scales.gex, cellMoney(b.scales.gex ?? 0));
}

// ── 3. the net's ink is its sign ──────────────────────────────────────────
{
  check('put-dominant is violet', netInk(1) === NET_POS_INK, netInk(1));
  check('call-dominant is amber', netInk(-1) === NET_NEG_INK, netInk(-1));
  /* Compared as strings: the two are `const` literals, so TypeScript knows
     they differ and refuses the comparison as unintentional — which is the
     compiler agreeing with the assertion rather than the assertion being
     wrong. Kept, because the claim is about the SHIPPED values, and a future
     edit that made them equal would be a real defect a type cannot catch. */
  check('the two are different inks', String(NET_POS_INK) !== String(NET_NEG_INK));
  check('and zero takes the put-dominant side rather than a third colour', netInk(0) === NET_POS_INK);
}

// ── 4. a badge reads weight ───────────────────────────────────────────────
{
  const SCALE = 100;
  const drift = (was: number, now: number): Drift => {
    const delta = now - was;
    const grew = Math.abs(now) - Math.abs(was);
    const crossed = (was >= 0) !== (now >= 0);
    const raw = !crossed && Math.abs(was) >= SCALE * PCT_FLOOR ? (grew / Math.abs(was)) * 100 : null;
    const pct = raw !== null && Math.abs(raw) <= PCT_CAP ? raw : null;
    return { was, delta, grew, crossed, pct, dir: grew > 0 ? 1 : grew < 0 ? -1 : 0, material: true };
  };

  /* THE DEFECT THIS SECTION EXISTS FOR. A call-dominant level at −$20 that
     goes to −$50 has two and a half times the weight it had. Dividing the
     SIGNED change by the old magnitude called that −150%, and every
     call-dominant row on the board read backwards. */
  const heavier = drift(-20, -50);
  check('a call-dominant level that gets heavier reads UP', heavier.pct !== null && heavier.pct > 0, `${badgeWords(heavier)}`);
  check('  · and by the right amount', Math.round(heavier.pct!) === 150, `${heavier.pct?.toFixed(0)}%`);
  check('one that drains reads DOWN', (drift(-50, -20).pct ?? 0) < 0, badgeWords(drift(-50, -20)) ?? '');
  check('put-dominant behaves identically', Math.round(drift(20, 50).pct!) === 150, badgeWords(drift(20, 50)) ?? '');

  const crossed = drift(40, -40);
  check('a level that changes SIDE is not given a percentage', crossed.pct === null && crossed.crossed);
  check('  · it is reported as a swap', badgeWords(crossed) === '⇄', badgeWords(crossed) ?? 'null');

  const tiny = drift(SCALE * PCT_FLOOR * 0.5, SCALE * PCT_FLOOR * 0.5 + 30);
  check('a base too small to divide by falls back to the dollars', tiny.pct === null && /\$/.test(badgeWords(tiny) ?? ''),
    badgeWords(tiny) ?? 'null');
  const runaway = drift(SCALE * PCT_FLOOR * 1.1, SCALE * 0.9);
  check(`an answer past ${PCT_CAP}% does too`, runaway.pct === null && /\$/.test(badgeWords(runaway) ?? ''),
    badgeWords(runaway) ?? 'null');

  check('a move under a point is not news', badgeWords(drift(50, 50.2)) === null, String(badgeWords(drift(50, 50.2))));
  check('nothing to compare against says nothing', badgeWords(null) === null);
  check('money is compact and signed', cellMoney(-1_234_567) === '-$1.2M' && cellMoney(950) === '$950.0',
    `${cellMoney(-1_234_567)} · ${cellMoney(950)}`);
}

// ── 5. focus keeps three kinds of row, and removes none ───────────────────
{
  const scales = { gex: 100, vex: 100 } as Partial<Record<LadderMetric, number>>;
  const fams: LadderMetric[] = ['gex', 'vex'];
  const leg = (net: number) => ({ put: Math.max(0, net), call: Math.min(0, net), net });
  const mk = (over: Partial<MatrixRow>): MatrixRow => ({
    strike: 100, cells: { gex: leg(1), vex: leg(1) }, tags: [], drift: null, meaningful: false, ...over,
  });
  const d = (grew: number): Drift => ({ was: 1, delta: grew, grew, crossed: false, pct: null, dir: grew > 0 ? 1 : -1, material: true });

  const rows: MatrixRow[] = [
    mk({ strike: 1, tags: ['pin'] }),
    mk({ strike: 2, tags: ['putWall'] }),
    mk({ strike: 3, cells: { gex: leg(100 * (FOCUS_FLOOR + 0.01)), vex: leg(1) } }),
    /* HEAVY IN ANY FAMILY ON SCREEN is enough — a strike that is nothing in
       gamma and enormous in vega is exactly the row a vega reader is here
       for, and a filter keyed on one family would hide it. */
    mk({ strike: 4, cells: { gex: leg(1), vex: leg(100 * (FOCUS_FLOOR + 0.01)) } }),
    mk({ strike: 5, drift: { m1: null, m5: d(100 * (FOCUS_MOVE + 0.01)), m15: null, m30: null } }),
    mk({ strike: 6 }),
  ];
  const before = rows.length;
  markMeaningful(rows, fams, scales);
  check('the pin survives focus', rows[0].meaningful);
  check('so does a wall', rows[1].meaningful);
  check('so does anything heavy in gamma', rows[2].meaningful);
  check('so does anything heavy in ANOTHER family on screen', rows[3].meaningful);
  check('so does a small row that MOVED', rows[4].meaningful);
  check('an empty row does not', !rows[5].meaningful);
  check('and nothing was removed', rows.length === before, `${rows.length} rows`);
}

// ── 6. against the live book ──────────────────────────────────────────────
{
  const m = buildMatrix('SPY', ALL);
  check('the table drew the chain', m.rows.length > 20, `${m.rows.length} strikes`);
  check(
    'highest strike first, in order',
    m.rows.every((r, i) => i === 0 || r.strike < m.rows[i - 1].strike),
    `${m.rows[0]?.strike} … ${m.rows[m.rows.length - 1]?.strike}`
  );

  /* THE LEGS ADD UP. A matrix whose put and call columns do not make its own
     net column is three unrelated numbers wearing a shared header. */
  let worst = 0;
  for (const r of m.rows) {
    for (const f of ALL) {
      const c = r.cells[f];
      if (!c) continue;
      const gap = Math.abs(c.put + c.call - c.net);
      const room = Math.max(1, Math.abs(c.net)) * 1e-6;
      if (gap / room > worst) worst = gap / room;
    }
  }
  check('put + call = net, every family, every strike', worst <= 1, `worst ${worst.toFixed(3)}× the rounding room`);

  check('every reading is finite', m.rows.every(r => ALL.every(f => Number.isFinite(r.cells[f]?.net ?? 0))));

  /* THE TAGS COME FROM THE LEVELS ENGINE, not a second opinion — a table
     that crowned one strike while the rail crowned another is the exact
     defect `buildLadderFor` records being fixed for. */
  const tagged = (t: string) => m.rows.find(r => r.tags.includes(t as never))?.strike ?? null;
  check('the pin is the levels engine\'s supreme', tagged('pin') === m.levels.supreme, `${tagged('pin')} vs ${m.levels.supreme}`);
  check('the call wall agrees', tagged('callWall') === m.levels.callWall, `${tagged('callWall')} vs ${m.levels.callWall}`);
  check('the put wall agrees', tagged('putWall') === m.levels.putWall, `${tagged('putWall')} vs ${m.levels.putWall}`);
  check('the pin line reports that strike\'s own share', m.king !== null && m.king.strike === m.levels.supreme);

  check('gamma carries a drift', m.rows.some(r => r.drift?.m5 != null));
  for (const spec of LADDER_METRICS) {
    const k = spec.key as LadderMetric;
    const mm = buildMatrix('SPY', [k]);
    const drawn = mm.rows.length > 20 && mm.rows.every(r => Number.isFinite(r.cells[k]?.net ?? NaN));
    const driftRight = DRIFT_METRICS.has(k) ? mm.rows.some(r => r.drift != null) : mm.rows.every(r => r.drift == null);
    check(`${spec.label} draws, and claims a history only if it has one`, drawn && driftRight,
      `${mm.rows.length} rows · ${metricName(k)} per ${SHOCK[k]}`);
  }

  /* Every family names the shock its numbers are quoted against. A figure
     with no normalisation cannot be checked, and this desk's one advantage
     over the boards it was measured against is that its numbers can be. */
  check('every family states a shock', ALL.every(k => SHOCK[k].length > 2), ALL.map(k => SHOCK[k]).join(' · '));
  check('and a unit', ALL.every(k => metricUnit(k).length > 4));

  /* A caller that asks for nothing gets gamma rather than an empty table —
     a matrix with no columns is a list of strike numbers. */
  check('asking for no families falls back to gamma', buildMatrix('SPY', []).families.join() === 'gex');

  check('focus keeps a sensible slice', m.meaningfulCount > 0 && m.meaningfulCount <= m.rows.length,
    `${m.meaningfulCount} of ${m.rows.length}`);
}

/* ── 7. the board's premise: a panel is a whole reading ───────────────────

   Every panel builds its own matrix from its own (symbol, family) pair, and
   the desk holds no shared family at all. What has to be true for that to
   mean anything is that the two axes are genuinely independent — the same
   symbol in two families is two different books, and the same family on two
   symbols likewise. If either collapsed, five panels would be one panel
   drawn five times and the page would be decoration. */
{
  const spyGex = buildMatrix('SPY', ['gex']);
  const spyVex = buildMatrix('SPY', ['vex']);
  const qqqGex = buildMatrix('QQQ', ['gex']);

  check('one symbol, two families, two books',
    spyGex.scales.gex !== spyVex.scales.vex,
    `${cellMoney(spyGex.scales.gex ?? 0)} vs ${cellMoney(spyVex.scales.vex ?? 0)}`);
  check('one family, two symbols, two books',
    qqqGex.ticker !== spyGex.ticker && qqqGex.spot !== spyGex.spot,
    `${spyGex.ticker} ${spyGex.spot.toFixed(2)} vs ${qqqGex.ticker} ${qqqGex.spot.toFixed(2)}`);
  check('and a panel only carries the family it asked for',
    spyVex.rows.every(r => r.cells.vex != null && r.cells.gex == null));

  /* THE DENOMINATOR BEHIND A STRIKE'S SHARE. The hover prints |net| ÷ total,
     so a total that was anything other than the sum of the column's own
     magnitudes would print a percentage of nothing in particular — and the
     row that reads "18.4% of the book" is the single most quotable number
     on the panel. It is checked here rather than trusted in the view. */
  for (const f of ALL) {
    const m = buildMatrix('SPY', [f]);
    const sum = m.rows.reduce((t, r) => t + Math.abs(r.cells[f]?.net ?? 0), 0);
    const total = m.totals[f] ?? 0;
    const gap = Math.abs(total - sum) / Math.max(1, sum);
    check(`${metricLabel(f)} · the share denominator is the book's own sum`, gap < 1e-9, cellMoney(total));
    const shares = m.rows.map(r => (total > 0 ? Math.abs(r.cells[f]?.net ?? 0) / total : 0));
    const whole = shares.reduce((a, b) => a + b, 0);
    check(`  · so the shares add to the whole book`, Math.abs(whole - 1) < 1e-9, `${(whole * 100).toFixed(4)}%`);
    check(`  · and no single strike is the whole book`, shares.every(s => s >= 0 && s <= 1));
  }

  /*
    ══ THE CROWN BELONGS TO THE FAMILY ON SCREEN ═══════════════════════════

    It was gamma's, always, and a vega panel printed a gamma strike beside a
    share of 0.0% — because a vega-only matrix keeps no gamma total to divide
    by. Two wrong numbers from one assumption, and both of them in the line a
    reader scanning five panels reads first.

    So for every family: the crown is that family's own extreme, its share is
    of that family's own Σ|net|, and it is the same strike the panel puts the
    star on. On gamma it must ALSO be the levels engine's supreme, which is
    how the crown and the PIN tag agree without either consulting the other.
  */
  for (const f of ALL) {
    const mm = buildMatrix('SPY', [f]);
    const total = mm.totals[f] ?? 0;
    let peak = -1;
    let at = 0;
    for (const r of mm.rows) {
      const v = Math.abs(r.cells[f]?.net ?? 0);
      if (v > peak) { peak = v; at = r.strike; }
    }
    check(`${metricLabel(f)} · the crown is this family's extreme`, mm.king?.strike === at, `${mm.king?.strike} vs ${at}`);
    check(`  · and its share is of this family's own book`,
      mm.king != null && total > 0 && Math.abs(mm.king.share - peak / total) < 1e-12,
      `${((mm.king?.share ?? 0) * 100).toFixed(2)}%`);
    /* A share of zero on a book that has weight in it is the exact symptom
       of dividing by another family's total. */
    check(`  · which is never an empty percentage on a live book`, (mm.king?.share ?? 0) > 0);
    /* `dir` is gamma's alone. A family with no stored history cannot say
       which way it is going, and an arrow that always read flat would be
       worse than no arrow. */
    check(`  · and it claims a direction only if it has one`,
      DRIFT_METRICS.has(f) ? true : mm.king?.dir === 0);
  }
  {
    const mm = buildMatrix('SPY', ['gex']);
    check('on gamma the crown and the PIN tag are the same strike',
      mm.king?.strike === mm.levels.supreme &&
      mm.rows.find(r => r.tags.includes('pin'))?.strike === mm.king?.strike,
      `${mm.king?.strike}`);
  }
}

/* ── 8. one concept, one hue ──────────────────────────────────────────────

   The legs were red and pale blue while the net beside them was violet and
   amber, which put the PUT SIDE in two unrelated colours in adjacent columns
   — four inks for two ideas, with a legend listing all four as if that were
   normal. The rule is that the HUE carries the side and nothing else, and a
   rule about colour can be checked like any other. */
{
  const hue = (hex: string): number => {
    const n = parseInt(hex.slice(1), 16);
    const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    if (d === 0) return 0;
    const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return (h * 60 + 360) % 360;
  };
  /* Distance on a colour WHEEL, so 359° and 1° are two degrees apart. */
  const apart = (a: number, b: number) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

  const putLeg = hue(PUT_INK), putNet = hue(NET_POS_INK);
  const callLeg = hue(CALL_INK), callNet = hue(NET_NEG_INK);
  check('the put leg and the put-dominant net are the same hue',
    apart(putLeg, putNet) <= 20, `${putLeg.toFixed(0)}° vs ${putNet.toFixed(0)}°`);
  check('the call leg and the call-dominant net are the same hue',
    apart(callLeg, callNet) <= 20, `${callLeg.toFixed(0)}° vs ${callNet.toFixed(0)}°`);
  /* And the two SIDES must be nowhere near each other, or the rule buys
     nothing — a table where puts and calls were both orange would satisfy
     the two checks above and be unreadable. */
  check('and the two sides are far apart on the wheel',
    apart(putNet, callNet) >= 90, `${apart(putNet, callNet).toFixed(0)}° between them`);
  check('legs and nets are still distinguishable marks',
    String(PUT_INK) !== String(NET_POS_INK) && String(CALL_INK) !== String(NET_NEG_INK));
}

/* ── 9. the book's one-line state ─────────────────────────────────────────

   Sixty-one exact rows and no answer to "which side is this book on".
   `totals` is Σ|net|, a magnitude sum that deliberately throws the sign away
   so a share can be taken against it — so the signed total did not exist
   anywhere on the page. */
{
  const oneSided: Partial<Record<LadderMetric, boolean>> = {};
  for (const f of ALL) {
    const m = buildMatrix('SPY', [f]);
    const b = m.books[f];
    if (!b) { check(`${metricLabel(f)} · a book state exists`, false); continue; }

    const net = m.rows.reduce((t, r) => t + (r.cells[f]?.net ?? 0), 0);
    check(`${metricLabel(f)} · the signed total is the sum of the column`,
      Math.abs(b.net - net) < Math.max(1, Math.abs(net)) * 1e-9, cellMoney(b.net));
    /* The signed total can never exceed the magnitude total, and equals it
       exactly when every strike in the book is on the same side — which SPY's
       vega book genuinely is, and is why this is `<=` rather than the `<`
       it was first written as. That first cut failed on VEX and the failure
       was correct: the assertion had assumed a two-sided book. */
    check(`  · and it never exceeds the magnitude total`, Math.abs(b.net) <= b.gross + 1e-6,
      `${cellMoney(b.net)} inside ${cellMoney(b.gross)}`);
    oneSided[f] = Math.abs(Math.abs(b.net) - b.gross) < Math.max(1, b.gross) * 1e-9;
    check(`  · which is the same denominator the shares used`, b.gross === (m.totals[f] ?? 0));

    check(`  · the crown's share is top1`, m.king != null && Math.abs(b.top1 - m.king.share) < 1e-12);
    check(`  · top5 covers top1 and not more than the book`, b.top5 >= b.top1 - 1e-12 && b.top5 <= 1 + 1e-12,
      `${(b.top5 * 100).toFixed(1)}%`);

    /* THE FLIP IS FOUND, NOT ASSUMED. If one is reported, the sign really
       does change at it; if none is, no adjacent pair in the window crosses.
       A table that printed a flip anyway would be inventing the single most
       actionable level on the page. */
    if (b.flip != null) {
      const i = m.rows.findIndex(r => r.strike === b.flip);
      const near = [m.rows[i - 1], m.rows[i], m.rows[i + 1]].filter(Boolean);
      const signs = new Set(near.map(r => ((r.cells[f]?.net ?? 0) >= 0 ? 1 : -1)));
      check(`  · the flip sits where the book changes side`, signs.size === 2, `strike ${b.flip}`);
      check(`  · and its distance from spot is in strikes`,
        b.flipDistance != null && Math.abs(b.flipDistance) <= m.rows.length,
        `${b.flipDistance?.toFixed(1)}`);
    } else {
      let crossings = 0;
      for (let i = 1; i < m.rows.length; i++) {
        const a = m.rows[i - 1].cells[f]?.net ?? 0, c = m.rows[i].cells[f]?.net ?? 0;
        if (a !== 0 && c !== 0 && a >= 0 !== c >= 0) crossings++;
      }
      check(`  · no flip reported, and none exists in the window`, crossings === 0);
      /* The two readings agree with each other: a book with no crossing is
         exactly a book that is all on one side. */
      check(`  · which is the same thing as the book being one-sided`, oneSided[f] === true);
    }
  }

  /* THE SIGNED TOTAL IS NOT THE MAGNITUDE TOTAL RENAMED, which is the whole
     reason for adding it — and on a two-sided book the two are visibly
     different numbers. Asserted across the families rather than inside the
     loop, because a one-sided book makes them equal and that is a fact about
     the book, not a defect. */
  const twoSided = ALL.filter(f => oneSided[f] === false);
  check('at least one family is two-sided, where the signed and magnitude totals part company',
    twoSided.length > 0, twoSided.map(metricLabel).join(' '));
}

/* ── 10. the table is a window, and says so ───────────────────────────────

   It presented as the complete book — "every strike, including the empty
   ones" — which is true of everything inside the window and silent about the
   window existing. A reader at the last row could not tell "the book ends
   here" from "our chain does". */
{
  const m = buildMatrix('SPY', ['gex']);
  check('the window reports as many strikes as it drew', m.window.strikes === m.rows.length, `${m.window.strikes}`);
  check('  · its high is the first row and its low the last',
    m.window.high === m.rows[0].strike && m.window.low === m.rows[m.rows.length - 1].strike,
    `${m.window.low}…${m.window.high}`);
  check('  · and spot is inside it', m.spot >= m.window.low && m.spot <= m.window.high);
  /* A reading with no time on it cannot be told from a stale one. */
  const skew = Math.abs(Date.now() - m.builtAt);
  check('the reading is stamped', m.builtAt > 0 && skew < 60_000, `${skew}ms old`);
}

/* ── 11. the loudest event gets the loudest mark ──────────────────────────

   A strike crossing zero is a level changing what it IS — on gamma, dealers
   there going from damping the tape to amplifying it. It was drawn as a bare
   `⇄`: no magnitude, and a colour taken from `grew`, which on a crossing is
   not the story. Every ordinary ±40% row shouted louder than the one row
   that had actually changed. */
{
  const d = (was: number, now: number): Drift => ({
    was, delta: now - was, grew: Math.abs(now) - Math.abs(was),
    crossed: (was >= 0) !== (now >= 0), pct: null, dir: 0, material: true,
  });
  const up = d(-40, 53.1e6);
  const down = d(40, -53.1e6);
  check('a crossing says how big it landed', crossWords(up).includes('53.1M'), crossWords(up));
  check('  · and still marks itself as a swap', crossWords(up).startsWith('⇄'));
  check('  · it never prints a minus, because the side is the ink',
    !crossWords(down).includes('-'), crossWords(down));
  check('  · and it names the side it landed ON, not the one it left',
    crossedTo(up) === 'put' && crossedTo(down) === 'call');
  /* The old mark is what a crossing reduced to before this: two pixels. */
  check('  · which is more than the bare glyph was', crossWords(up).length > 2);
}

/* ── 12. a crown at 4.2% is not a crown ───────────────────────────────────

   On gamma the top strike holds about a seventh of the book and the word
   earns itself. On delta the same line read `King 490 4.2%` — a book spread
   across sixty-one strikes with the header announcing a monarch anyway. */
{
  check('a dominant strike is a King', crownWord(0.30) === 'King' && crownWord(CROWN_FLOOR) === 'King');
  check('  · a thin one is only the Top', crownWord(0.042) === 'Top' && crownWord(CROWN_FLOOR - 0.001) === 'Top');
  const gex = buildMatrix('SPY', ['gex']).books.gex;
  const dex = buildMatrix('SPY', ['dex']).books.dex;
  check('  · and the live books land on either side of the line',
    crownWord(gex?.top1 ?? 0) === 'King' && crownWord(dex?.top1 ?? 0) === 'Top',
    `gex ${((gex?.top1 ?? 0) * 100).toFixed(1)}% · dex ${((dex?.top1 ?? 0) * 100).toFixed(1)}%`);
}

/* ── 13. a badge that cannot move the bar is noise ────────────────────────

   The top of a gamma book is strikes holding a few dollars, and every one of
   them carried a badge — `+$10.0`, `+$110.0` — because the rule was only
   "the move is not exactly zero". A dozen confident grey chips, each true
   and none of them news, at the very top of the table where the eye lands.

   The floor is not arbitrary: the micro-bar is about a hundred pixels, so a
   move under one percent of the group's ruler cannot shift it by a pixel. */
{
  const SCALE = 1000;
  const mk = (was: number, now: number): Drift => {
    const delta = now - was, grew = Math.abs(now) - Math.abs(was);
    const crossed = (was >= 0) !== (now >= 0);
    return {
      was, delta, grew, crossed, pct: null,
      dir: grew > 0 ? 1 : grew < 0 ? -1 : 0,
      material: crossed || Math.abs(grew) >= SCALE * BADGE_FLOOR,
    };
  };
  /* One dollar of move on a $1,000 ruler — a tenth of a pixel of bar. The
     first cut of this fixture used a ten-dollar move, which is EXACTLY the
     floor, and the check failed because the code was right. */
  const speck = mk(8.6, 9.6);
  const real = mk(100, 100 + SCALE * BADGE_FLOOR);   // exactly one pixel of bar
  check('a move the bar cannot show gets no badge', badgeWords(speck) === null, String(badgeWords(speck)));
  check('  · and one it can, does', badgeWords(real) !== null, String(badgeWords(real)));
  /* A crossing is news at ANY size — the point of marking it is that its
     magnitude is not what makes it interesting. */
  const tinyCross = mk(0.4, -0.4);
  check('  · a crossing is never silenced by the floor', tinyCross.material && badgeWords(tinyCross) !== null,
    String(badgeWords(tinyCross)));

  /* On the live book: the floor actually removes chips, and does not remove
     the ones a reader is there for. */
  const m = buildMatrix('SPY', ['gex']);
  const scale = m.scales.gex ?? 1;
  const withDrift = m.rows.filter(r => r.drift?.m5 != null);
  const silenced = withDrift.filter(r => !(r.drift!.m5!.material));
  const shown = withDrift.filter(r => r.drift!.m5!.material);
  check('the floor is doing work on a real book', silenced.length > 0 && shown.length > 0,
    `${shown.length} shown, ${silenced.length} silenced of ${withDrift.length}`);
  const loudSilenced = silenced.filter(r => Math.abs(r.drift!.m5!.grew) >= scale * BADGE_FLOOR);
  check('  · and it never silences a move the bar could show', loudSilenced.length === 0);
  const quietShown = shown.filter(r => !r.drift!.m5!.crossed && Math.abs(r.drift!.m5!.grew) < scale * BADGE_FLOOR);
  check('  · nor shows one it could not', quietShown.length === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
