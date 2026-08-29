/*
  Acceptance test for §13's futures engine — the contract, the roll, and the
  session the cash tape never sees.

  The contract code is the part a futures reader checks first, so getting it
  wrong is the fastest way to look like a toy. Everything here is computable
  by hand against the CME's own listing rule.

  Proves:
  1. Equity index futures roll QUARTERLY on the third Friday of Mar/Jun/Sep/
     Dec, and the code is root + month letter + year digits
  2. The front month is the first quarterly not yet expired — expiry day
     itself is still front, and the next contract is the one behind it
  3. The roll warning fires inside a week, not before
  4. The overnight session runs 18:00 ET to the 09:30 open, in phase order,
     with Asia thinner than Europe and the pre-open the liveliest
  5. The high/low bound every bar, and the open's position in that range is
     a percentage or an honest null
  6. Deterministic per (root, date)
*/
import {
  FUTURES_ROOTS, bigPrints, contractsFor, overnightClock, overnightFor, phaseAtOffset,
} from '../src/data/futures';

let pass = 0, fail = 0;
const check = (n: string, ok: boolean, x = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? ' — ' + x : ''}`);
  ok ? pass++ : fail++;
};

// ── 1+2. the contract and the roll ────────────────────────────────────────
{
  /* 2026: third Fridays are Mar 20, Jun 19, Sep 18, Dec 18. */
  const jan = contractsFor('ES', new Date('2026-01-15T12:00:00'));
  check('the front month in January is MARCH', jan.front.code === 'ESH26', jan.front.code);
  check('and the one behind it is JUNE', jan.next.code === 'ESM26', jan.next.code);
  check('expiry is the third Friday', jan.front.expiry.getDay() === 5 && jan.front.expiry.getDate() === 20,
    `${jan.front.expiryLabel} (day ${jan.front.expiry.getDay()})`);

  const codes = ['H', 'M', 'U', 'Z'];
  const seen = [
    contractsFor('ES', new Date('2026-01-15T12:00:00')).front.code,
    contractsFor('ES', new Date('2026-04-15T12:00:00')).front.code,
    contractsFor('ES', new Date('2026-07-15T12:00:00')).front.code,
    contractsFor('ES', new Date('2026-10-15T12:00:00')).front.code,
  ];
  check('all four quarterly codes appear across the year',
    seen.every((c, i) => c === `ES${codes[i]}26`), seen.join(' '));

  /* Expiry DAY is still the front month — the roll happens on it, not before. */
  const onExpiry = contractsFor('ES', new Date('2026-03-20T10:00:00'));
  check('expiry day itself is still the front month', onExpiry.front.code === 'ESH26', onExpiry.front.code);
  const dayAfter = contractsFor('ES', new Date('2026-03-21T10:00:00'));
  check('the day after, the board has rolled', dayAfter.front.code === 'ESM26', dayAfter.front.code);

  check('every root builds a code', FUTURES_ROOTS.every(r => /^(ES|NQ|RTY)[HMUZ]\d{2}$/.test(contractsFor(r.root).front.code)),
    FUTURES_ROOTS.map(r => contractsFor(r.root).front.code).join(' '));
  check('a December contract crosses into the next year correctly',
    contractsFor('ES', new Date('2026-12-19T12:00:00')).front.code === 'ESH27',
    contractsFor('ES', new Date('2026-12-19T12:00:00')).front.code);
}

// ── 3. the roll warning ───────────────────────────────────────────────────
{
  check('a week out, the roll is flagged', contractsFor('ES', new Date('2026-03-14T12:00:00')).front.rollingSoon);
  check('a month out, it is not', !contractsFor('ES', new Date('2026-02-14T12:00:00')).front.rollingSoon);
}

// ── 4+5. the overnight session ────────────────────────────────────────────
{
  const s = overnightFor('ES', '2026-08-28', 5000);
  check('PREMISE: the session has bars', s.bars.length > 50, `${s.bars.length} bars`);
  check('it runs 18:00 ET to the 09:30 open', s.bars[0].min === 0 && s.bars[s.bars.length - 1].min === 930);
  check('phases come in order: Asia, then Europe, then the open',
    phaseAtOffset(0) === 'GLOBEX_ASIA' && phaseAtOffset(600) === 'GLOBEX_EUROPE' && phaseAtOffset(930) === 'RTH');
  check('the clock reads real wall time', overnightClock(0) === '18:00' && overnightClock(540) === '03:00' && overnightClock(930) === '09:30',
    `${overnightClock(0)} ${overnightClock(540)} ${overnightClock(930)}`);

  /* The SHAPE is the point — a flat walk makes the overnight range
     meaningless. Asia must be thinner than Europe, and the pre-open the
     liveliest of the three. */
  const vol = (p: string) => s.bars.filter(b => b.phase === p).reduce((a, b) => a + b.volume, 0) / Math.max(1, s.bars.filter(b => b.phase === p).length);
  const asia = vol('GLOBEX_ASIA'), europe = vol('GLOBEX_EUROPE');
  check('Asia is thinner than Europe', asia < europe, `${asia.toFixed(0)} vs ${europe.toFixed(0)}`);
  const preOpen = s.bars.filter(b => b.min > 800).reduce((a, b) => a + b.volume, 0) / Math.max(1, s.bars.filter(b => b.min > 800).length);
  check('and the hours before the cash open are the liveliest', preOpen > europe, `${preOpen.toFixed(0)} vs ${europe.toFixed(0)}`);

  check('the session high and low bound every bar',
    s.bars.every(b => b.high <= s.high + 1e-9 && b.low >= s.low - 1e-9));
  check('every bar is internally consistent',
    s.bars.every(b => b.high >= Math.max(b.open, b.close) - 1e-9 && b.low <= Math.min(b.open, b.close) + 1e-9));
  check('the open\'s position in the overnight range is a percentage',
    s.openPositionPct !== null && s.openPositionPct >= 0 && s.openPositionPct <= 100, String(s.openPositionPct?.toFixed(1)));
  check('settlement is carried, so the chart can draw its line', s.settlement === 5000);

  const prints = bigPrints('ES', s, '2026-08-28');
  check('the tape returns its biggest prints, largest first',
    prints.length > 0 && prints.every((p, i) => i === 0 || prints[i - 1].size >= p.size), `${prints.length} prints`);
  check('and each one knows which session it landed in',
    prints.every(p => ['GLOBEX_ASIA', 'GLOBEX_EUROPE', 'RTH'].includes(p.phase)));
}

// ── 6. determinism ────────────────────────────────────────────────────────
{
  const a = overnightFor('ES', '2026-08-28', 5000);
  const b = overnightFor('ES', '2026-08-28', 5000);
  check('the same night replays identically', JSON.stringify(a) === JSON.stringify(b));
  check('a different night does not', JSON.stringify(overnightFor('ES', '2026-08-27', 5000)) !== JSON.stringify(a));
  check('and neither does a different root', JSON.stringify(overnightFor('NQ', '2026-08-28', 5000)) !== JSON.stringify(a));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
