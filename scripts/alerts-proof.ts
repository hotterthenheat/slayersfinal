/*
  Acceptance test for T-22's alert kinds.

  Proves:
  1. The validator heals a pre-kinds price entry (no `kind` field) and drops
     a malformed entry ALONE; every kind round-trips through storage whole
  2. Arming refuses: the cap, and each kind's own idea of a duplicate —
     while RSI 70 and RSI 30 on one pane are NOT duplicates
  3. `evaluateAlert`, kind by kind, on staged contexts:
     price crossings both ways; a level alert that waits on an absent level,
     establishes its side lazily, and fires when the LEVEL moves across the
     close (following the level is the point); the indicator timeframe gate;
     RSI against its threshold; net GEX sign flip; a new king; wall migration
     measured in strike-steps with an at-threshold fire; flow prints gated by
     BOTH the premium floor and the arming time
  4. Store discipline: markFired is idempotent, commitArm refuses a fired
     alert, rearm resets each kind to unestablished
  5. `readExposureNow` — totals, king, real-null walls, and the chain's step
*/
import {
  MAX_ALERTS, alertLabel, armFlow, armGexFlip, armIndicator, armLevel, armNewKing,
  armPrice, armWallMove, clearAlerts, commitArm, evaluateAlert, getAlerts,
  markFired, rearmAlert,
  type Alert, type AlertContext,
} from '../src/components/gex/alertStore';
import { readExposureNow } from '../src/data/gex';

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
};

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

/** A context where nothing is readable — the staging baseline. */
const bare = (over: Partial<AlertContext> = {}): AlertContext => ({
  close: 100,
  tf: '5m',
  levels: { callWall: null, putWall: null, flip: null, king: null },
  netGex: null,
  step: 0,
  values: {},
  prints: [],
  ...over,
});

// ── 1. the validator ──────────────────────────────────────────────────────
{
  const key = 'slayer_price_alerts_LEGACY';
  store.set(key, JSON.stringify([
    { id: 'old-1', price: 512, above: true, firedAt: 0 },          // pre-kinds
    { id: 'bad-1', kind: 'level', level: 'ceiling', side: 0, firedAt: 0 }, // no such level
    { id: 'bad-2', kind: 'flow', floor: -5, armedAt: 0, firedAt: 0 },      // negative floor
    { id: 'ok-1', kind: 'gexflip', sign: 1, firedAt: 0 },
  ]));
  const back = getAlerts('LEGACY');
  check('a pre-kinds price entry heals to kind "price"', back.some(a => a.id === 'old-1' && a.kind === 'price' && a.kind === 'price' && (a as { price?: number }).price === 512));
  check('malformed entries are dropped ALONE', back.length === 2 && back.some(a => a.id === 'ok-1'), back.map(a => a.id).join(','));
}
{
  /* Round-trip: arm one of everything, then re-read the raw JSON under a new
     key — every kind must come back whole. */
  const t = 'RT';
  check('PREMISE: one of every kind arms', [
    armPrice(t, 512, 500),
    armLevel(t, 'callWall'),
    armIndicator(t, 'vwap', '5m'),
    armIndicator(t, 'rsi', '5m', 70),
    armGexFlip(t),
    armNewKing(t),
    armWallMove(t, 2),
    armFlow(t, 1_000_000, 1000),
  ].every(a => a !== null));
  store.set('slayer_price_alerts_RT2', store.get('slayer_price_alerts_RT')!);
  const back = getAlerts('RT2');
  check('all eight round-trip through storage', back.length === 8, String(back.length));
  check('each carries its kind', ['price', 'level', 'indicator', 'indicator', 'gexflip', 'newking', 'wallmove', 'flow'].every(k => back.some(a => a.kind === k)));
  check('every kind has words', back.every(a => alertLabel(a).length > 0), back.map(alertLabel).join(' | '));
}

// ── 2. arming gates ───────────────────────────────────────────────────────
{
  const t = 'GATES';
  check('a duplicate price is refused', armPrice(t, 500, 490) !== null && armPrice(t, 500, 490) === null);
  check('a second alert on the same level is refused', armLevel(t, 'flip') !== null && armLevel(t, 'flip') === null);
  check('the same indicator on ANOTHER timeframe is its own alert', armIndicator(t, 'ema21', '5m') !== null && armIndicator(t, 'ema21', '15m') !== null);
  check('RSI 70 and RSI 30 are different alerts', armIndicator(t, 'rsi', '5m', 70) !== null && armIndicator(t, 'rsi', '5m', 30) !== null);
  check('a second GEX-flip watch is refused', armGexFlip(t) !== null && armGexFlip(t) === null);
  check(`PREMISE: that filled ${MAX_ALERTS - 1} of ${MAX_ALERTS}`, getAlerts(t).length === MAX_ALERTS - 1, String(getAlerts(t).length));
  check('the cap admits the last one and refuses the next', armNewKing(t) !== null && armFlow(t, 1_000_000, 0) === null);
  clearAlerts(t);
  check('clear empties the pane', getAlerts(t).length === 0);
}

// ── 3. firing, kind by kind ───────────────────────────────────────────────
const mk = (a: Record<string, unknown>): Alert => ({ id: 'x', firedAt: 0, ...a } as unknown as Alert);
{
  // price
  const up = mk({ kind: 'price', price: 505, above: true });
  check('price: below its mark, an "above" alert waits', !evaluateAlert(up, bare({ close: 504.9 })).fire);
  check('price: reaching the mark fires', evaluateAlert(up, bare({ close: 505 })).fire);
  const dn = mk({ kind: 'price', price: 495, above: false });
  check('price: a "below" alert fires crossing down', !evaluateAlert(dn, bare({ close: 495.1 })).fire && evaluateAlert(dn, bare({ close: 494.8 })).fire);
}
{
  // level — the alert follows the level
  const a = mk({ kind: 'level', level: 'callWall', side: 0 });
  check('level: an absent level is waited on, not guessed', evaluateAlert(a, bare()).armed === undefined && !evaluateAlert(a, bare()).fire);
  const seen = evaluateAlert(a, bare({ close: 100, levels: { callWall: 103, putWall: null, flip: null, king: null } }));
  check('level: the first readable tick establishes the side, without firing', !seen.fire && seen.armed !== undefined && (seen.armed as { side: number }).side === -1);
  const armed = seen.armed!;
  check('level: sitting exactly on the level establishes nothing', evaluateAlert(a, bare({ close: 103, levels: { callWall: 103, putWall: null, flip: null, king: null } })).armed === undefined);
  check('level: the same side again does not fire', !evaluateAlert(armed, bare({ close: 101, levels: { callWall: 103, putWall: null, flip: null, king: null } })).fire);
  check('level: the CLOSE crossing the wall fires', evaluateAlert(armed, bare({ close: 103.2, levels: { callWall: 103, putWall: null, flip: null, king: null } })).fire);
  check('level: the WALL moving across the close fires too — the alert follows the level', evaluateAlert(armed, bare({ close: 100, levels: { callWall: 99.5, putWall: null, flip: null, king: null } })).fire);
  check('level: the level vanishing mid-watch waits instead of firing', !evaluateAlert(armed, bare({ close: 104 })).fire);

  /* And the other side: armed from ABOVE the level, touching it fires —
     the crossing floor is inclusive both ways. */
  const wallsK = (k: number) => ({ callWall: null, putWall: null, flip: null, king: k });
  const above = evaluateAlert(mk({ kind: 'level', level: 'king', side: 0 }), bare({ close: 104, levels: wallsK(103) })).armed!;
  check('level: armed from above, the side is 1', (above as { side: number }).side === 1);
  check('level: staying above does not fire', !evaluateAlert(above, bare({ close: 103.5, levels: wallsK(103) })).fire);
  check('level: touching the level from above fires — inclusive', evaluateAlert(above, bare({ close: 103, levels: wallsK(103) })).fire);
}
{
  // indicator
  const vw = mk({ kind: 'indicator', source: 'vwap', threshold: 0, side: 0, tf: '5m' });
  const ctx = bare({ close: 100, values: { vwap: 101 } });
  check('indicator: a pane on another timeframe does not evaluate it', evaluateAlert(vw, { ...ctx, tf: '15m' }).armed === undefined && !evaluateAlert(vw, { ...ctx, tf: '15m' }).fire);
  const seen = evaluateAlert(vw, ctx);
  check('indicator: VWAP side establishes from the close', (seen.armed as { side: number } | undefined)?.side === -1);
  check('indicator: an uncomputable value is waited on', evaluateAlert(vw, bare({ values: { vwap: null } })).armed === undefined);
  check('indicator: the close crossing VWAP fires', evaluateAlert(seen.armed!, bare({ close: 101.5, values: { vwap: 101 } })).fire);
  const rsi = mk({ kind: 'indicator', source: 'rsi', threshold: 70, side: 0, tf: '5m' });
  const low = evaluateAlert(rsi, bare({ values: { rsi: 55 } }));
  check('RSI: watches the oscillator against the threshold, not the close', (low.armed as { side: number } | undefined)?.side === -1);
  check('RSI: crossing the threshold fires', evaluateAlert(low.armed!, bare({ values: { rsi: 70 } })).fire);
  check('RSI: drifting below again does not', !evaluateAlert(low.armed!, bare({ values: { rsi: 69.9 } })).fire);
}
{
  // gexflip
  const a = mk({ kind: 'gexflip', sign: 0 });
  check('gexflip: an unreadable book establishes nothing', evaluateAlert(a, bare()).armed === undefined);
  check('gexflip: a zero total establishes nothing — zero has no sign', evaluateAlert(a, bare({ netGex: 0 })).armed === undefined);
  const armed = evaluateAlert(a, bare({ netGex: 2e9 })).armed!;
  check('gexflip: the first signed total is the baseline', (armed as { sign: number }).sign === 1);
  check('gexflip: the same sign does not fire', !evaluateAlert(armed, bare({ netGex: 5e8 })).fire);
  check('gexflip: the sign flipping fires', evaluateAlert(armed, bare({ netGex: -1e8 })).fire);
}
{
  // newking
  const a = mk({ kind: 'newking', strike: 0 });
  const armed = evaluateAlert(a, bare({ levels: { callWall: null, putWall: null, flip: null, king: 505 } })).armed!;
  check('newking: the first king seen is the baseline', (armed as { strike: number }).strike === 505);
  check('newking: the crown staying put does not fire', !evaluateAlert(armed, bare({ levels: { callWall: null, putWall: null, flip: null, king: 505 } })).fire);
  check('newking: the crown moving fires', evaluateAlert(armed, bare({ levels: { callWall: null, putWall: null, flip: null, king: 510 } })).fire);
}
{
  // wallmove
  const a = mk({ kind: 'wallmove', strikes: 2, callBase: 0, putBase: 0, step: 0 });
  const walls = (cw: number | null, pw: number | null) => ({ callWall: cw, putWall: pw, flip: null, king: null });
  check('wallmove: no walls yet means keep waiting', evaluateAlert(a, bare({ levels: walls(null, null), step: 1 })).armed === undefined);
  check('wallmove: an unknown strike spacing means keep waiting', evaluateAlert(a, bare({ levels: walls(505, 495), step: 0 })).armed === undefined);
  const armed = evaluateAlert(a, bare({ levels: walls(505, 495), step: 1 })).armed! as Alert & { callBase: number; putBase: number; step: number };
  check('wallmove: both walls and the spacing freeze at arming', armed.callBase === 505 && armed.putBase === 495 && armed.step === 1);
  check('wallmove: one strike of drift is not two', !evaluateAlert(armed, bare({ levels: walls(506, 495), step: 1 })).fire);
  check('wallmove: exactly N strikes fires — the floor is inclusive', evaluateAlert(armed, bare({ levels: walls(507, 495), step: 1 })).fire);
  check('wallmove: the PUT wall migrating fires on its own', evaluateAlert(armed, bare({ levels: walls(505, 493), step: 1 })).fire);
  check('wallmove: a wall going unnamed is not a migration', !evaluateAlert(armed, bare({ levels: walls(null, 495), step: 1 })).fire);
}
{
  // flow
  const a = mk({ kind: 'flow', floor: 1_000_000, armedAt: 1000 });
  check('flow: a print already on the tape when armed does not count', !evaluateAlert(a, bare({ prints: [{ at: 999, premium: 5_000_000 }] })).fire);
  check('flow: a fresh print under the floor does not count', !evaluateAlert(a, bare({ prints: [{ at: 2000, premium: 999_999 }] })).fire);
  check('flow: a fresh print AT the floor fires', evaluateAlert(a, bare({ prints: [{ at: 2000, premium: 1_000_000 }] })).fire);
  check('flow: a print stamped the arming instant is not news', !evaluateAlert(a, bare({ prints: [{ at: 1000, premium: 5_000_000 }] })).fire);
}
{
  // a fired alert is inert
  const done = { ...mk({ kind: 'price', price: 505, above: true }), firedAt: 5 };
  check('a fired alert evaluates to nothing, even past its mark', !evaluateAlert(done, bare({ close: 600 })).fire);
}

// ── 4. store discipline ───────────────────────────────────────────────────
{
  const t = 'DISC';
  const lvl = armLevel(t, 'king')!;
  const armed = evaluateAlert(lvl, bare({ close: 100, levels: { callWall: null, putWall: null, flip: null, king: 103 } })).armed!;
  commitArm(t, armed);
  check('commitArm stores the established side', (getAlerts(t).find(a => a.id === lvl.id) as { side: number }).side === -1);
  markFired(t, lvl.id, 111);
  markFired(t, lvl.id, 222);
  check('markFired is idempotent — the first time stands', getAlerts(t).find(a => a.id === lvl.id)!.firedAt === 111);
  commitArm(t, { ...armed, side: 1 } as Alert);
  check('commitArm refuses a fired alert', (getAlerts(t).find(a => a.id === lvl.id) as { side: number }).side === -1);
  rearmAlert(t, lvl.id, 100, 999);
  const re = getAlerts(t).find(a => a.id === lvl.id) as { firedAt: number; side: number };
  check('rearm resets a level alert to unestablished', re.firedAt === 0 && re.side === 0);

  const fl = armFlow(t, 1_000_000, 1000)!;
  markFired(t, fl.id, 2000);
  rearmAlert(t, fl.id, 100, 3000);
  check('rearm moves a flow alert\'s clock forward — old prints stay old', (getAlerts(t).find(a => a.id === fl.id) as { armedAt: number }).armedAt === 3000);

  const pr = armPrice(t, 90, 100)!;
  check('PREMISE: 90 from above arms as "below"', (pr as { above: boolean }).above === false);
  markFired(t, pr.id, 1);
  rearmAlert(t, pr.id, 80, 2);
  check('rearm re-sides a price alert from where the market is NOW', (getAlerts(t).find(a => a.id === pr.id) as { above: boolean }).above === true);
}

// ── 5. the book as an alert sees it ───────────────────────────────────────
{
  const chain = [
    { strike: 494, value: 4e8 },
    { strike: 496, value: 9e8 },   // heaviest put-dominant below spot → put wall
    { strike: 498, value: 1e8 },
    { strike: 502, value: -3e8 },
    { strike: 504, value: -12e8 }, // heaviest overall → king; call-dominant above → call wall
  ];
  const e = readExposureNow(chain, 500);
  check('netGex is the signed total', Math.abs(e.netGex - (4e8 + 9e8 + 1e8 - 3e8 - 12e8)) < 1);
  check('the king is the largest magnitude', e.king === 504);
  check('the walls are the sign-checked rule', e.callWall === 504 && e.putWall === 496);
  check('the flip is the crossing nearest spot', e.flip === 500);
  check('the step is the chain\'s own spacing', e.step === 2);
  const oneSided = readExposureNow([{ strike: 494, value: 4e8 }, { strike: 496, value: 9e8 }], 500);
  check('a one-sided book keeps its real nulls', oneSided.callWall === null && oneSided.flip === null);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
