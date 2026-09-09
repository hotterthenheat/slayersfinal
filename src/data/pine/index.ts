/*
==================================================
  SLAYER TERMINAL - PINE (data/pine/index.ts)
  A Pine Script v6 SUBSET, and an honest edge to it.
==================================================

  WHAT THIS IS. Readers write their own indicators in the language they
  already know, and Terrain draws them. The engine implements the core of
  the language — series semantics, the per-bar model, `ta.*`, `math.*`,
  `str.*`, `array.*`, `input.*`, `request.security` at another interval,
  `plot`, `plotshape`, and the `line`/`label`/`box`/`table` objects — against
  the tape's own bars.

  WHAT THIS IS NOT. It is not TradingView. Strategies, matrices, maps,
  alternate symbols and the fundamentals feeds are not implemented, and a
  script using them is REFUSED BY NAME rather than run with those parts
  silently dropped. `analyse.ts` says why that is the only safe way to ship
  a subset.

  So the API has three outcomes, not two: a syntax error, a list of
  refusals, or a run. A caller that draws anything before checking the
  middle one has defeated the design.
*/

import type { Candle } from '../../types/market';
import { parse, PineSyntaxError } from './parser';
import { analyse, type Refusal } from './analyse';
import { runPine, PineRuntimeError, type PineRun } from './interpreter';
import { FNS, VARS, type PineValue } from './builtins';

export type { Refusal } from './analyse';
export type { PineRun, PlotOut, ShapeOut, InputDef, AlertDef } from './interpreter';
export type { PineValue } from './builtins';
export { REFUSED, REFUSED_CALLS } from './builtins';

/*
  WHAT THE ENGINE ACCEPTS, as a flat list the editor can print.

  For a SUBSET this is the most useful reference there is: a writer needs to
  know the shape of what is available, and learning it one refusal at a time
  is the slow way. Derived from the built-in tables rather than typed out
  again, so it cannot fall behind them.
*/
export const FNS_INDEX: string[] = [
  ...Object.keys(FNS),
  ...Object.keys(VARS),
  'plot', 'plotshape', 'alertcondition', 'indicator',
  'input.int', 'input.float', 'input.bool', 'input.string', 'input.color',
  /* The object namespaces live in the interpreter rather than in FNS, because
     they mutate a store instead of returning a value — so they have to be
     listed by hand or the reference would not mention the half of the engine
     a levels indicator is written in. */
  'request.security',
  'line.new', 'line.delete', 'line.set_xy1', 'line.set_xy2', 'line.set_y1', 'line.set_y2',
  'line.set_color', 'line.set_width', 'line.set_style', 'line.set_extend', 'line.get_price',
  'label.new', 'label.delete', 'label.set_xy', 'label.set_x', 'label.set_y',
  'label.set_text', 'label.set_color', 'label.set_textcolor', 'label.set_style', 'label.set_size',
  'box.new', 'box.delete', 'box.set_lefttop', 'box.set_rightbottom',
  'box.set_bgcolor', 'box.set_border_color', 'box.set_extend',
  'table.new', 'table.cell', 'table.clear', 'table.delete', 'table.set_position',
  'table.set_cell_text', 'table.set_cell_bgcolor', 'table.set_cell_text_color',
].sort();

export type PineCompile =
  | { ok: true; program: ReturnType<typeof parse> }
  | { ok: false; stage: 'syntax'; line: number; message: string }
  | { ok: false; stage: 'unsupported'; refusals: Refusal[] };

/** Parse and vet a script. Nothing is drawn unless this returns `ok`. */
export function compilePine(src: string): PineCompile {
  let program: ReturnType<typeof parse>;
  try {
    program = parse(src);
  } catch (e) {
    if (e instanceof PineSyntaxError) return { ok: false, stage: 'syntax', line: e.line, message: e.message };
    return { ok: false, stage: 'syntax', line: 0, message: (e as Error).message };
  }
  const refusals = analyse(program);
  if (refusals.length > 0) return { ok: false, stage: 'unsupported', refusals };
  return { ok: true, program };
}

export type PineResult =
  | { ok: true; run: PineRun }
  | { ok: false; stage: 'syntax' | 'unsupported' | 'runtime'; message: string; line?: number; refusals?: Refusal[] };

/** Compile and run in one step, for a caller that only wants the outcome. */
export function evaluatePine(
  src: string,
  bars: readonly Candle[],
  opts: {
    timeframe?: string;
    ticker?: string;
    inputs?: Record<string, PineValue>;
    /** Bars for THIS symbol at another interval, in minutes — what
        `request.security` is served from. */
    resolveBars?: (minutes: number) => readonly Candle[] | null;
    /** The chart's own interval in minutes, for aligning a higher one. */
    chartMinutes?: number;
  } = {},
): PineResult {
  const c = compilePine(src);
  if (!c.ok) {
    if (c.stage === 'syntax') return { ok: false, stage: 'syntax', message: c.message, line: c.line };
    return {
      ok: false,
      stage: 'unsupported',
      message: `${c.refusals.length} construct${c.refusals.length === 1 ? '' : 's'} this engine does not implement`,
      refusals: c.refusals,
    };
  }
  try {
    return { ok: true, run: runPine(c.program, bars, opts) };
  } catch (e) {
    if (e instanceof PineRuntimeError) return { ok: false, stage: 'runtime', message: e.message, line: e.line };
    return { ok: false, stage: 'runtime', message: (e as Error).message };
  }
}
