/*
==================================================
  SLAYER TERMINAL - INDICATOR PARAMETERS
  (data/indicatorParams.ts) — Part 2, "Indicator
  picker with parameter editing".
==================================================

  WHAT WAS THERE. Twenty-four indicators, every one of them at a fixed
  period. The sub-panes read their periods from one spec so the legend and
  the series could not disagree — a real discipline, kept here — and the
  overlays carried literals: `bollingerSeries(bars, 20, 2)`,
  `smaSeries(bars, 200)`, `emaSeries(bars, key === 'ema9' ? 9 : …)`. A
  reader who trades a 5/13 EMA cross could not have one. The picker chose
  WHICH indicator; nobody could choose HOW it was built.

  ── ONE TABLE, THREE READERS ─────────────────────────────────────────────

  The spec below is read by the chart (to compute the series), the menu (to
  offer the editor and bound it) and the legend (to name the band). A period
  the legend prints that the series does not use is the bug the old
  sub-pane spec was written to prevent, and it stays prevented: the chart
  and the legend both call `paramsFor`, and the sub-pane spec's defaults
  are THIS table's defaults rather than a second copy.

  ── ADDITIVE, SO NOTHING SAVED HAS TO MIGRATE ─────────────────────────────

  `ChartIndicators` is twenty-four booleans persisted in Terrain configs,
  Pulse desks and the four-way board. Turning each into `{on, period}`
  would mean a migration in three stores and a version bump nobody asked
  for. Instead the set gains ONE optional key, `params`, holding only the
  values a reader has changed. A saved config with no `params` reads as
  every default, which is exactly what it was before. A reader who edits
  RSI to 9 saves `{ params: { rsi: [9] } }` and nothing else moves.

  ── BOUNDS ARE THE EDITOR'S, NOT THE FORMULA'S ───────────────────────────

  `rsiSeries(bars, 1)` will compute. It will also draw a line that flips
  between 0 and 100 on every bar, which is a number and not an indicator.
  The min/max here are where the indicator stops meaning what its name
  says, and the editor refuses outside them so the chart never has to.
*/

/** Every indicator that has something a reader can tune. */
export type ParamKey =
  | 'ema9' | 'ema21' | 'ema50' | 'sma' | 'bb'
  | 'keltner' | 'donchian' | 'supertrend'
  | 'rsi' | 'macd' | 'atrPane' | 'stoch' | 'stochRsi' | 'adx' | 'cci'
  | 'williamsR' | 'mfi' | 'cmf' | 'roc' | 'aroon';

export type IndicatorParams = Partial<Record<ParamKey, number[]>>;

export interface ParamSpec {
  /** The indicator's name as the legend prints it — "EMA", "Stoch RSI". */
  name: string;
  /** One label per parameter, for the editor: ['period'], ['fast','slow','signal']. */
  labels: string[];
  defaults: number[];
  min: number[];
  max: number[];
  /** Decimal places the editor keeps. 0 = integer periods; 1 = a multiplier like 2.0σ. */
  decimals: number[];
}

const period = (name: string, dflt: number, max = 500): ParamSpec => ({
  name, labels: ['period'], defaults: [dflt], min: [2], max: [max], decimals: [0],
});

export const PARAM_SPEC: Record<ParamKey, ParamSpec> = {
  /* Overlays — prices, on the tape's own scale. */
  ema9: period('EMA', 9),
  ema21: period('EMA', 21),
  ema50: period('EMA', 50),
  sma: period('SMA', 200, 1000),
  bb: { name: 'BB', labels: ['period', 'σ'], defaults: [20, 2], min: [2, 0.5], max: [500, 5], decimals: [0, 1] },
  keltner: { name: 'Keltner', labels: ['ema', 'atr', 'mult'], defaults: [20, 10, 2], min: [2, 2, 0.5], max: [500, 200, 5], decimals: [0, 0, 1] },
  donchian: period('Donchian', 20),
  supertrend: { name: 'Supertrend', labels: ['atr', 'mult'], defaults: [10, 3], min: [2, 0.5], max: [200, 10], decimals: [0, 1] },

  /* Sub-panes — their own units, their own bands. The defaults are the
     conventional ones a reader arriving from another terminal expects. */
  rsi: period('RSI', 14),
  macd: { name: 'MACD', labels: ['fast', 'slow', 'signal'], defaults: [12, 26, 9], min: [2, 3, 2], max: [200, 500, 200], decimals: [0, 0, 0] },
  atrPane: period('ATR', 14),
  stoch: { name: 'Stoch', labels: ['%K', '%D', 'smooth'], defaults: [14, 3, 3], min: [2, 1, 1], max: [200, 50, 50], decimals: [0, 0, 0] },
  stochRsi: { name: 'Stoch RSI', labels: ['rsi', 'stoch', '%K', '%D'], defaults: [14, 14, 3, 3], min: [2, 2, 1, 1], max: [200, 200, 50, 50], decimals: [0, 0, 0, 0] },
  adx: period('ADX', 14),
  cci: period('CCI', 20),
  williamsR: period('Williams %R', 14),
  mfi: period('MFI', 14),
  cmf: period('CMF', 20),
  roc: period('ROC', 12),
  aroon: period('Aroon', 25),
};

export const PARAM_KEYS = Object.keys(PARAM_SPEC) as ParamKey[];

export const isParamKey = (key: string): key is ParamKey => key in PARAM_SPEC;

/** Clamp one value to its slot's bounds and precision. Non-finite → default. */
function clampAt(spec: ParamSpec, i: number, v: number | undefined): number {
  const d = spec.defaults[i];
  if (v === undefined || !Number.isFinite(v)) return d;
  const bounded = Math.min(spec.max[i], Math.max(spec.min[i], v));
  const f = 10 ** spec.decimals[i];
  return Math.round(bounded * f) / f;
}

/**
 * The parameters an indicator is built with: the reader's, where set and
 * sane, else the defaults — slot by slot, so a saved `[9]` for MACD does
 * not leave slow and signal undefined.
 */
export function paramsFor(key: ParamKey, overrides?: IndicatorParams): number[] {
  const spec = PARAM_SPEC[key];
  const mine = overrides?.[key];
  return spec.defaults.map((_, i) => clampAt(spec, i, mine?.[i]));
}

/** True when the reader has moved this indicator off its defaults. */
export function isCustom(key: ParamKey, overrides?: IndicatorParams): boolean {
  const cur = paramsFor(key, overrides);
  return cur.some((v, i) => v !== PARAM_SPEC[key].defaults[i]);
}

/**
 * The label a band or a menu row wears — "EMA 21", "BB 20·2", "MACD 12 26 9".
 *
 * Periods join with a space and a multiplier with a middle dot, because
 * "BB 20 2" reads as two periods and "20·2" reads as a period and a
 * setting, which is what it is.
 */
export function paramLabel(key: ParamKey, overrides?: IndicatorParams): string {
  const spec = PARAM_SPEC[key];
  const vals = paramsFor(key, overrides);
  const parts = vals.map((v, i) => (spec.decimals[i] > 0 ? v.toFixed(spec.decimals[i]).replace(/\.0$/, '') : String(v)));
  if (parts.length === 0) return spec.name;
  const hasMult = spec.decimals.some(d => d > 0);
  return `${spec.name} ${hasMult ? parts.join('·') : parts.join(' ')}`;
}

/** Set one slot, returning a new params map with everything else intact. */
export function withParam(overrides: IndicatorParams | undefined, key: ParamKey, slot: number, value: number): IndicatorParams {
  const spec = PARAM_SPEC[key];
  const cur = paramsFor(key, overrides);
  const next = cur.map((v, i) => (i === slot ? clampAt(spec, i, value) : v));
  /* Back on the defaults means the key comes OUT of the map, so a config
     that has been edited and restored serialises the same as one that was
     never touched. */
  const isDefault = next.every((v, i) => v === spec.defaults[i]);
  const out: IndicatorParams = { ...(overrides ?? {}) };
  if (isDefault) delete out[key];
  else out[key] = next;
  return out;
}

/** Drop every override — the "reset all" the editor offers. */
export const NO_PARAMS: IndicatorParams = {};
