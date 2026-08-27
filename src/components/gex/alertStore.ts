import { useCallback, useSyncExternalStore } from 'react';

/*
==================================================
  SLAYER TERMINAL - ALERTS (gex/alertStore.ts)

  Things you asked to be told about, kept per
  symbol and visible on every pane showing it.
==================================================

  WHY THIS IS A MODULE-LEVEL STORE AND NOT COMPONENT STATE.

  Terrain mounts up to four panes and two of them can be on the same symbol.
  Alerts are keyed by symbol, so with per-component state and a shared key the
  second pane's save silently overwrites the first pane's alert — and the first
  pane goes on drawing a line for something that is no longer stored. One store
  with subscribers means both panes read the same list and both repaint when
  either changes.

  Persistence is the drawings store's shape verbatim, including the
  self-healing validator: anything that is not a well-formed alert is dropped
  on read rather than thrown, so a half-written key from a previous version
  cannot take a chart down with it. An entry saved by the price-only version
  of this file (no `kind` field) is healed to `kind: 'price'` — the reader's
  standing alerts survive the upgrade.

  WHAT AN ALERT IS AND IS NOT.

  It is a mark on a pane that changes when the thing it watches happens, while
  you are watching. It is not a notification: nothing runs when the tab is
  closed, and the menu says so in as many words. A promise to tell someone
  about a price and then not telling them is worse than not offering it.

  THE KINDS (T-22). A fixed price is only one thing worth watching:
    price     — close reaches a price you typed          (crossed toward)
    level     — close crosses a NAMED level: call wall, put wall, flip, king.
                The level moves with the book, so the alert follows the level
                rather than freezing the price it had when armed.
    indicator — close crosses VWAP or an EMA, or RSI crosses a threshold.
                Indicator values depend on the bar size, so the alert is
                stamped with the arming pane's timeframe and only a pane on
                that timeframe evaluates it.
    gexflip   — the book's total net GEX changes sign
    newking   — the largest-exposure strike moves to a different strike
    wallmove  — either wall migrates at least N strikes from where it stood
    flow      — an option print at or over a premium floor arrives (only
                prints AFTER arming count — the tape's history is not news)

  SIDES AND BASELINES ARE ESTABLISHED LAZILY, ON THE FIRST EVALUATION.
  "Crossed" needs to know which side you started on, and "moved" needs to
  know where it stood — but the menu that arms an alert does not hold the
  indicator's value or the book's walls (they depend on the pane's bars and
  the tick). So a fresh alert carries side 0 / baseline 0, and the first tick
  that can read the watched thing fills it in via `evaluateAlert` returning
  an `armed` copy. Recomputing the side on LATER ticks is the bug the price
  kind always guarded against: an alert that re-arms itself behind the price
  never fires.

  THE FIRING RULES ARE PURE. `evaluateAlert(alert, ctx)` takes everything it
  reads as an argument and touches no store, so the proof script can hand it
  a staged book and a staged tape and check every rule — the chart's only job
  is building the context from data it already holds.
*/

export type LevelName = 'callWall' | 'putWall' | 'flip' | 'king';
export type IndicatorSource = 'vwap' | 'ema9' | 'ema21' | 'ema50' | 'rsi';

interface AlertBase {
  id: string;
  /** When it fired, in epoch ms. 0 while it is still waiting. */
  firedAt: number;
}

export interface PriceAlert extends AlertBase {
  kind: 'price';
  price: number;
  /** Which way it has to be crossed — fixed when the alert is armed, from the
      side of the market the price was on at that moment. Recomputing it later
      would let an alert re-arm itself behind the price and never fire. */
  above: boolean;
}

export interface LevelAlert extends AlertBase {
  kind: 'level';
  level: LevelName;
  /** Which side of the level the close was on when first evaluated:
      1 above, -1 below, 0 not yet established (level absent, or close
      sitting exactly on it). */
  side: -1 | 0 | 1;
}

export interface IndicatorAlert extends AlertBase {
  kind: 'indicator';
  source: IndicatorSource;
  /** RSI only — the line the oscillator has to cross. 0 for the price-cross
      sources, which compare close against the indicator itself. */
  threshold: number;
  side: -1 | 0 | 1;
  /** The arming pane's timeframe — an EMA21 on 1m and on 15m are different
      lines, so only a pane on this timeframe evaluates this alert. */
  tf: string;
}

export interface GexFlipAlert extends AlertBase {
  kind: 'gexflip';
  /** Net GEX sign when first evaluated; 0 until a nonzero total is seen. */
  sign: -1 | 0 | 1;
}

export interface NewKingAlert extends AlertBase {
  kind: 'newking';
  /** The king strike when first evaluated; 0 until seen (no strike is 0). */
  strike: number;
}

export interface WallMoveAlert extends AlertBase {
  kind: 'wallmove';
  /** How many strike-steps of migration count as "moved". */
  strikes: number;
  /** Where each wall stood when first evaluated; 0 = that wall was unnamed
      at arming and is not watched (a wall appearing later is a different
      event than one moving). */
  callBase: number;
  putBase: number;
  /** The chain's strike spacing, frozen at arming so N strikes stays the
      distance the reader meant. 0 until established. */
  step: number;
}

export interface FlowAlert extends AlertBase {
  kind: 'flow';
  /** Premium floor in dollars. */
  floor: number;
  /** Epoch ms of arming — prints already on the tape do not count. */
  armedAt: number;
}

export type Alert =
  | PriceAlert
  | LevelAlert
  | IndicatorAlert
  | GexFlipAlert
  | NewKingAlert
  | WallMoveAlert
  | FlowAlert;

export type AlertKind = Alert['kind'];

const LEVEL_NAMES: readonly LevelName[] = ['callWall', 'putWall', 'flip', 'king'];
const INDICATOR_SOURCES: readonly IndicatorSource[] = ['vwap', 'ema9', 'ema21', 'ema50', 'rsi'];
const isSide = (v: unknown): v is -1 | 0 | 1 => v === -1 || v === 0 || v === 1;
const isFin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

const storageKey = (ticker: string) => `slayer_price_alerts_${ticker}`;

/** Heals what it can, drops what it cannot. A pre-kinds entry (price/above
    and no `kind`) becomes a price alert rather than being thrown away. */
const readAlert = (a: unknown): Alert | null => {
  if (typeof a !== 'object' || a === null) return null;
  const c = a as Record<string, unknown>;
  if (typeof c.id !== 'string' || !isFin(c.firedAt)) return null;
  const base = { id: c.id, firedAt: c.firedAt as number };
  const kind = c.kind ?? (isFin(c.price) && typeof c.above === 'boolean' ? 'price' : null);
  switch (kind) {
    case 'price':
      if (!isFin(c.price) || (c.price as number) <= 0 || typeof c.above !== 'boolean') return null;
      return { ...base, kind: 'price', price: c.price as number, above: c.above };
    case 'level':
      if (!LEVEL_NAMES.includes(c.level as LevelName) || !isSide(c.side)) return null;
      return { ...base, kind: 'level', level: c.level as LevelName, side: c.side };
    case 'indicator':
      if (!INDICATOR_SOURCES.includes(c.source as IndicatorSource) || !isFin(c.threshold) || !isSide(c.side) || typeof c.tf !== 'string') return null;
      return { ...base, kind: 'indicator', source: c.source as IndicatorSource, threshold: c.threshold as number, side: c.side, tf: c.tf };
    case 'gexflip':
      if (!isSide(c.sign)) return null;
      return { ...base, kind: 'gexflip', sign: c.sign };
    case 'newking':
      if (!isFin(c.strike)) return null;
      return { ...base, kind: 'newking', strike: c.strike as number };
    case 'wallmove':
      if (!isFin(c.strikes) || (c.strikes as number) < 1 || !isFin(c.callBase) || !isFin(c.putBase) || !isFin(c.step)) return null;
      return { ...base, kind: 'wallmove', strikes: c.strikes as number, callBase: c.callBase as number, putBase: c.putBase as number, step: c.step as number };
    case 'flow':
      if (!isFin(c.floor) || (c.floor as number) <= 0 || !isFin(c.armedAt)) return null;
      return { ...base, kind: 'flow', floor: c.floor as number, armedAt: c.armedAt as number };
    default:
      return null;
  }
};

const load = (ticker: string): Alert[] => {
  try {
    const raw = localStorage.getItem(storageKey(ticker));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: Alert[] = [];
    for (const item of parsed) {
      const a = readAlert(item);
      if (a) out.push(a);
    }
    return out;
  } catch {
    return [];
  }
};

const save = (ticker: string, list: Alert[]) => {
  try {
    if (list.length === 0) localStorage.removeItem(storageKey(ticker));
    else localStorage.setItem(storageKey(ticker), JSON.stringify(list));
  } catch {
    /* storage full, private, or switched off — never fatal */
  }
};

/* The cached array IS the snapshot. useSyncExternalStore compares snapshots by
   identity, so returning a fresh array each read would re-render forever. */
const cache = new Map<string, Alert[]>();
const subs = new Map<string, Set<() => void>>();

const read = (ticker: string): Alert[] => {
  let list = cache.get(ticker);
  if (!list) {
    list = load(ticker);
    cache.set(ticker, list);
  }
  return list;
};

const write = (ticker: string, next: Alert[]) => {
  cache.set(ticker, next);
  save(ticker, next);
  subs.get(ticker)?.forEach(fn => fn());
};

let seq = 0;
const freshId = () => `${Date.now()}-${++seq}`;

/** The most a pane is worth cluttering. Past this the marks stop being
    readable and the column of them stops being a set of decisions. */
export const MAX_ALERTS = 8;

export const getAlerts = read;

/** The shared gate: cap and duplicate check. `same` says what "the same
    alert" means for the kind being armed. Returns the armed alert or null
    with nothing written. */
const arm = (ticker: string, make: () => Alert, same: (a: Alert) => boolean): Alert | null => {
  const list = read(ticker);
  if (list.length >= MAX_ALERTS) return null;
  if (list.some(same)) return null;
  const alert = make();
  write(ticker, [...list, alert]);
  return alert;
};

/** `spot` fixes which way the alert has to be crossed. Refused if it is not a
    real number, or a duplicate, or the pane is already carrying its most. */
export function armPrice(ticker: string, price: number, spot: number): Alert | null {
  if (!isFin(price) || price <= 0 || !isFin(spot)) return null;
  return arm(
    ticker,
    () => ({ id: freshId(), kind: 'price', price, above: price > spot, firedAt: 0 }),
    a => a.kind === 'price' && Math.abs(a.price - price) < 1e-9
  );
}

export function armLevel(ticker: string, level: LevelName): Alert | null {
  return arm(
    ticker,
    () => ({ id: freshId(), kind: 'level', level, side: 0, firedAt: 0 }),
    a => a.kind === 'level' && a.level === level
  );
}

export function armIndicator(ticker: string, source: IndicatorSource, tf: string, threshold = 0): Alert | null {
  if (!isFin(threshold)) return null;
  return arm(
    ticker,
    () => ({ id: freshId(), kind: 'indicator', source, threshold, side: 0, tf, firedAt: 0 }),
    a => a.kind === 'indicator' && a.source === source && a.tf === tf && Math.abs(a.threshold - threshold) < 1e-9
  );
}

export function armGexFlip(ticker: string): Alert | null {
  return arm(
    ticker,
    () => ({ id: freshId(), kind: 'gexflip', sign: 0, firedAt: 0 }),
    a => a.kind === 'gexflip'
  );
}

export function armNewKing(ticker: string): Alert | null {
  return arm(
    ticker,
    () => ({ id: freshId(), kind: 'newking', strike: 0, firedAt: 0 }),
    a => a.kind === 'newking'
  );
}

export function armWallMove(ticker: string, strikes: number): Alert | null {
  if (!isFin(strikes) || strikes < 1) return null;
  return arm(
    ticker,
    () => ({ id: freshId(), kind: 'wallmove', strikes, callBase: 0, putBase: 0, step: 0, firedAt: 0 }),
    a => a.kind === 'wallmove' && a.strikes === strikes
  );
}

export function armFlow(ticker: string, floor: number, now: number): Alert | null {
  if (!isFin(floor) || floor <= 0) return null;
  return arm(
    ticker,
    () => ({ id: freshId(), kind: 'flow', floor, armedAt: now, firedAt: 0 }),
    a => a.kind === 'flow' && Math.abs(a.floor - floor) < 1e-9
  );
}

export function removeAlert(ticker: string, id: string): void {
  const list = read(ticker);
  const next = list.filter(a => a.id !== id);
  if (next.length !== list.length) write(ticker, next);
}

export function clearAlerts(ticker: string): void {
  if (read(ticker).length) write(ticker, []);
}

/** Idempotent: a chart calls this on every tick a crossed alert is seen, and
    only the first call changes anything. Without that guard the fired time
    would keep moving and every pane would repaint on every tick. */
export function markFired(ticker: string, id: string, at: number): void {
  const list = read(ticker);
  const hit = list.find(a => a.id === id);
  if (!hit || hit.firedAt !== 0) return;
  write(ticker, list.map(a => (a.id === id ? { ...a, firedAt: at } : a)));
}

/** Store the side/baseline `evaluateAlert` established. Refused for an alert
    that fired or vanished between the evaluation and this call. */
export function commitArm(ticker: string, armed: Alert): void {
  const list = read(ticker);
  const hit = list.find(a => a.id === armed.id);
  if (!hit || hit.firedAt !== 0) return;
  write(ticker, list.map(a => (a.id === armed.id ? armed : a)));
}

/** Arm it again where it is — the reader has seen it fire and wants it back.
    The price kind re-sides from the market's position now; every lazy kind
    goes back to unestablished and the next tick re-reads the world. */
export function rearmAlert(ticker: string, id: string, spot: number, now: number): void {
  const list = read(ticker);
  const hit = list.find(a => a.id === id);
  if (!hit) return;
  const reset = (a: Alert): Alert => {
    switch (a.kind) {
      case 'price':
        return isFin(spot) ? { ...a, firedAt: 0, above: a.price > spot } : a;
      case 'level':
        return { ...a, firedAt: 0, side: 0 };
      case 'indicator':
        return { ...a, firedAt: 0, side: 0 };
      case 'gexflip':
        return { ...a, firedAt: 0, sign: 0 };
      case 'newking':
        return { ...a, firedAt: 0, strike: 0 };
      case 'wallmove':
        return { ...a, firedAt: 0, callBase: 0, putBase: 0, step: 0 };
      case 'flow':
        return { ...a, firedAt: 0, armedAt: now };
    }
  };
  const next = list.map(a => (a.id === id ? reset(a) : a));
  if (next.some((a, i) => a !== list[i])) write(ticker, next);
}

/*
  ── FIRING ────────────────────────────────────────────────────────────────
*/

/** Everything a tick knows that an alert might watch. Nulls mean "cannot be
    read right now" — an alert waits on null, it never guesses. */
export interface AlertContext {
  close: number;
  /** The evaluating pane's timeframe — gates indicator alerts. */
  tf: string;
  /** Named levels with REAL nulls (core/walls.ts rules), not spot fallbacks:
      "no call wall qualifies" must read as absent here, or a level alert
      would chase the fallback around the tape. */
  levels: { callWall: number | null; putWall: number | null; flip: number | null; king: number | null };
  /** Signed total of the book's net GEX; null when the book is unreadable. */
  netGex: number | null;
  /** The chain's strike spacing; 0 when unknown. */
  step: number;
  /** Latest value per indicator the evaluating pane computed; absent or null
      when not computable (too few bars). */
  values: Partial<Record<IndicatorSource, number | null>>;
  /** The flow tape, epoch-ms stamped, already narrowed to this symbol. */
  prints: readonly { at: number; premium: number }[];
}

export interface AlertVerdict {
  fire: boolean;
  /** The same alert with its lazy side/baseline filled in — returned only
      when something was established this evaluation. The caller stores it
      via `commitArm`. */
  armed?: Alert;
}

const NONE: AlertVerdict = { fire: false };

/** One crossing rule for everything that crosses: armed on side `side` of
    `ref`, fires when `x` lands on or past the other side of it. */
const crossed = (side: -1 | 1, x: number, ref: number): boolean =>
  side === 1 ? x <= ref : x >= ref;

const sideOf = (x: number, ref: number): -1 | 0 | 1 => (x > ref ? 1 : x < ref ? -1 : 0);

export function evaluateAlert(a: Alert, ctx: AlertContext): AlertVerdict {
  if (a.firedAt !== 0) return NONE;
  switch (a.kind) {
    case 'price':
      return { fire: a.above ? ctx.close >= a.price : ctx.close <= a.price };

    case 'level': {
      const ref = ctx.levels[a.level];
      if (ref === null) return NONE;
      if (a.side === 0) {
        const side = sideOf(ctx.close, ref);
        return side === 0 ? NONE : { fire: false, armed: { ...a, side } };
      }
      return { fire: crossed(a.side, ctx.close, ref) };
    }

    case 'indicator': {
      if (a.tf !== ctx.tf) return NONE;
      const v = ctx.values[a.source];
      if (v === null || v === undefined) return NONE;
      /* RSI watches the oscillator against the reader's line; the price
         sources watch the close against the indicator itself. */
      const x = a.source === 'rsi' ? v : ctx.close;
      const ref = a.source === 'rsi' ? a.threshold : v;
      if (a.side === 0) {
        const side = sideOf(x, ref);
        return side === 0 ? NONE : { fire: false, armed: { ...a, side } };
      }
      return { fire: crossed(a.side, x, ref) };
    }

    case 'gexflip': {
      const g = ctx.netGex;
      if (g === null || g === 0) return NONE;
      const sign: -1 | 1 = g > 0 ? 1 : -1;
      if (a.sign === 0) return { fire: false, armed: { ...a, sign } };
      return { fire: sign === -a.sign };
    }

    case 'newking': {
      const k = ctx.levels.king;
      if (k === null) return NONE;
      if (a.strike === 0) return { fire: false, armed: { ...a, strike: k } };
      return { fire: Math.abs(k - a.strike) > 1e-9 };
    }

    case 'wallmove': {
      if (a.callBase === 0 && a.putBase === 0) {
        const callBase = ctx.levels.callWall ?? 0;
        const putBase = ctx.levels.putWall ?? 0;
        /* Nothing to stand on: no wall qualifies, or the chain's spacing is
           unknown — keep waiting rather than watching nothing. */
        if ((callBase === 0 && putBase === 0) || ctx.step <= 0) return NONE;
        return { fire: false, armed: { ...a, callBase, putBase, step: ctx.step } };
      }
      const need = a.strikes * a.step - 1e-9;
      if (a.step <= 0) return NONE;
      const moved = (base: number, cur: number | null) =>
        base !== 0 && cur !== null && Math.abs(cur - base) >= need;
      return { fire: moved(a.callBase, ctx.levels.callWall) || moved(a.putBase, ctx.levels.putWall) };
    }

    case 'flow':
      return { fire: ctx.prints.some(p => p.at > a.armedAt && p.premium >= a.floor) };
  }
}

/** The words a rail row or a menu row prints for an alert — one place, so
    the pane and the menu never describe the same alert differently. */
export function alertLabel(a: Alert): string {
  switch (a.kind) {
    case 'price':
      return `${a.price.toFixed(2)} ${a.above ? 'above' : 'below'}`;
    case 'level':
      return `${{ callWall: 'call wall', putWall: 'put wall', flip: 'flip', king: 'king' }[a.level]} cross`;
    case 'indicator':
      return a.source === 'rsi'
        ? `RSI ${a.threshold} · ${a.tf}`
        : `${{ vwap: 'VWAP', ema9: 'EMA 9', ema21: 'EMA 21', ema50: 'EMA 50' }[a.source]} cross · ${a.tf}`;
    case 'gexflip':
      return 'net GEX flips sign';
    case 'newking':
      return 'new king';
    case 'wallmove':
      return `wall moves ${a.strikes}+ strikes`;
    case 'flow':
      return `print ≥ $${a.floor >= 1_000_000 ? `${(a.floor / 1_000_000).toFixed(a.floor % 1_000_000 ? 1 : 0)}M` : `${Math.round(a.floor / 1_000)}K`}`;
  }
}

export function useAlerts(ticker: string): Alert[] {
  const subscribe = useCallback(
    (fn: () => void) => {
      let set = subs.get(ticker);
      if (!set) {
        set = new Set();
        subs.set(ticker, set);
      }
      set.add(fn);
      return () => {
        set?.delete(fn);
      };
    },
    [ticker]
  );
  const snapshot = useCallback(() => read(ticker), [ticker]);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
