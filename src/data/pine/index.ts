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
import type { SlayerFeed } from './feed';

export type { Refusal } from './analyse';
export type { PineRun, PlotOut, ShapeOut, InputDef, AlertDef } from './interpreter';
export type { PineValue } from './builtins';
export type { SlayerFeed, BookBar, BookStrike, ChainNow } from './feed';
export { REFUSED, REFUSED_CALLS } from './builtins';

/*
  WHAT THE ENGINE ACCEPTS, as a flat list the editor can print.

  For a SUBSET this is the most useful reference there is: a writer needs to
  know the shape of what is available, and learning it one refusal at a time
  is the slow way. Derived from the built-in tables rather than typed out
  again, so it cannot fall behind them.
*/
export const FNS_INDEX: string[] = [
  /* `slayer.*` is deliberately absent — it gets its own panel, because a
     flat alphabetical list cannot say which half of it is a series. */
  ...Object.keys(FNS).filter(k => !k.startsWith('slayer.')),
  ...Object.keys(VARS).filter(k => !k.startsWith('slayer.')),
  'plot', 'plotshape', 'alertcondition', 'indicator', 'bgcolor',
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
  'linefill.new', 'request.security_lower_tf',
  /* The language itself, which no built-in table holds. */
  'type', 'method', 'enum', 'switch', 'for…in', 'varip', 'break', 'continue',
].sort();

/*
  THE DESK'S OWN NAMESPACE, WITH THE ONE THING A WRITER MUST KNOW ABOUT EACH.

  `kind` is not decoration. A SERIES has a value at every bar and behaves the
  way a script expects — cross it, compare it, look back at it. A SNAPSHOT is
  one reading of today's chain handed back on every bar, so it plots as a
  flat line by construction and crossing it means nothing. The engine also
  says so at run time, in `run.notes`; this is the same fact where a writer
  can see it BEFORE they write the line.
*/
export interface SlayerRef {
  name: string;
  kind: 'series' | 'snapshot';
  /** Argument shape, when it takes one. */
  takes?: string;
  what: string;
}

export const SLAYER_INDEX: readonly SlayerRef[] = [
  { name: 'slayer.netgex', kind: 'series', what: 'net dealer gamma across the whole book, signed dollars' },
  { name: 'slayer.callwall', kind: 'series', what: 'heaviest call-dominant strike ABOVE spot — moves with price, so it cannot be crossed' },
  { name: 'slayer.putwall', kind: 'series', what: 'heaviest put-dominant strike BELOW spot — likewise' },
  { name: 'slayer.heaviest_call', kind: 'series', what: 'heaviest call-dominant strike anywhere — a level, so price does cross it' },
  { name: 'slayer.heaviest_put', kind: 'series', what: 'heaviest put-dominant strike anywhere' },
  { name: 'slayer.flip', kind: 'series', what: 'the gamma flip nearest spot, or na when the book never changes sign' },
  { name: 'slayer.supreme', kind: 'series', what: 'the strike carrying the most gamma of either sign' },
  { name: 'slayer.amplifying', kind: 'series', what: 'true when dealers are short gamma and hedge WITH the move' },
  { name: 'slayer.absorbing', kind: 'series', what: 'true when dealers are long gamma and hedge against it' },
  { name: 'slayer.step', kind: 'series', what: "the chain's strike spacing at this bar" },
  { name: 'slayer.strikes', kind: 'series', what: 'how many strikes the book carries at this bar' },
  { name: 'slayer.has_book', kind: 'series', what: 'is there a book behind this bar at all' },
  { name: 'slayer.gex_above', kind: 'series', what: 'net gamma at every strike ABOVE this bar — overhead supply' },
  { name: 'slayer.gex_below', kind: 'series', what: 'net gamma at every strike below it' },
  { name: 'slayer.wall_width', kind: 'series', what: 'call wall minus put wall — the corridor price is being held inside' },
  { name: 'slayer.pc_oi', kind: 'series', what: "the book's put/call open-interest ratio at this bar" },
  { name: 'slayer.doi_book_call', kind: 'series', what: 'call OI opening across the WHOLE book since the previous bar' },
  { name: 'slayer.doi_book_put', kind: 'series', what: 'the same for puts' },
  { name: 'slayer.nth_call', kind: 'series', takes: '(n)', what: 'the nth heaviest call-dominant strike — n=1 is the heaviest; na past the end' },
  { name: 'slayer.nth_put', kind: 'series', takes: '(n)', what: 'the nth heaviest put-dominant strike, for drawing a ladder' },
  { name: 'slayer.gex', kind: 'series', takes: '(price)', what: 'net gamma at the strike nearest a price' },
  { name: 'slayer.gex_band', kind: 'series', takes: '(pct)', what: 'net gamma summed within ±pct% of this bar' },
  { name: 'slayer.call_oi', kind: 'series', takes: '(price)', what: 'call open interest at the nearest strike' },
  { name: 'slayer.put_oi', kind: 'series', takes: '(price)', what: 'put open interest at the nearest strike' },
  { name: 'slayer.doi_call', kind: 'series', takes: '(price)', what: 'change in call OI since the previous bar' },
  { name: 'slayer.doi_put', kind: 'series', takes: '(price)', what: 'change in put OI since the previous bar' },
  { name: 'slayer.wall_gap', kind: 'series', takes: '(price)', what: 'distance to the nearer wall, in price' },
  { name: 'slayer.dex', kind: 'snapshot', what: "net dealer DELTA exposure on today's chain" },
  { name: 'slayer.vex', kind: 'snapshot', what: 'net dealer VEGA exposure' },
  { name: 'slayer.vanna', kind: 'snapshot', what: 'net dealer VANNA exposure' },
  { name: 'slayer.charm', kind: 'snapshot', what: 'net dealer CHARM exposure' },
  { name: 'slayer.maxpain', kind: 'snapshot', what: 'the max-pain strike' },
  { name: 'slayer.gammapin', kind: 'snapshot', what: 'the gamma-weighted centroid of the strikes' },

  /* ── the option tape, summed into these bars ── */
  { name: 'slayer.call_prem', kind: 'series', what: 'call premium printed in this bar — na where the tape does not reach back' },
  { name: 'slayer.put_prem', kind: 'series', what: 'put premium printed in this bar' },
  { name: 'slayer.flow_net', kind: 'series', what: "call premium minus put — the bar's lean, in dollars" },
  { name: 'slayer.has_flow', kind: 'series', what: 'is there tape behind this bar at all' },

  /* ── volatility ── */
  { name: 'slayer.rv', kind: 'series', what: 'annualised realised volatility off these bars, percent — rank it with ta.percentrank' },
  { name: 'slayer.iv', kind: 'snapshot', what: "today's implied volatility as the feed quotes it, percent" },

  /* ── the session's own levels, from the desk's canon ── */
  { name: 'slayer.vpoc', kind: 'snapshot', what: "the volume profile's point of control" },
  { name: 'slayer.vah', kind: 'snapshot', what: "the value area's high" },
  { name: 'slayer.val', kind: 'snapshot', what: "the value area's low" },
  { name: 'slayer.em1_hi', kind: 'snapshot', what: 'the one-sigma expected move for today, upper' },
  { name: 'slayer.em1_lo', kind: 'snapshot', what: 'the one-sigma expected move, lower' },
  { name: 'slayer.em2_hi', kind: 'snapshot', what: 'two sigma, upper' },
  { name: 'slayer.em2_lo', kind: 'snapshot', what: 'two sigma, lower' },
  { name: 'slayer.pdh', kind: 'snapshot', what: "yesterday's high" },
  { name: 'slayer.pdl', kind: 'snapshot', what: "yesterday's low" },
  { name: 'slayer.pdc', kind: 'snapshot', what: "yesterday's close" },
  { name: 'slayer.or_hi', kind: 'snapshot', what: "the opening range's high, once it is complete" },
  { name: 'slayer.or_lo', kind: 'snapshot', what: "the opening range's low" },
  { name: 'slayer.ib_hi', kind: 'snapshot', what: "the initial balance's high, once complete" },
  { name: 'slayer.ib_lo', kind: 'snapshot', what: "the initial balance's low" },
];

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
    resolveBars?: (minutes: number, symbol: string) => readonly Candle[] | null;
    /** The chart's own interval in minutes, for aligning a higher one. */
    chartMinutes?: number;
    /** The dealer book behind `slayer.*`, aligned to `bars` by the host. */
    slayer?: SlayerFeed;
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
