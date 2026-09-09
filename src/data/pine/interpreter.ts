/*
==================================================
  SLAYER TERMINAL - PINE INTERPRETER (data/pine/interpreter.ts)
  Walks the AST once per bar, the way Pine does.
==================================================

  THE EXECUTION MODEL, which is the whole difficulty.

  Pine does not evaluate a script once over a vector of prices. It runs the
  WHOLE script on bar 0, then again on bar 1, and so on to the last bar. A
  plain `x = ...` is recomputed every bar; a `var x = ...` initialises on the
  first bar and then keeps whatever it was last assigned. `close[1]` reaches
  back into what a series was on the previous bar, so every variable and
  every call site carries a history, not just a value.

  So this file keeps three things per bar and commits them at the end of it:
  the current scope, one history array per named variable, and one history
  array per call site. `expr[n]` reads bar `i - n` out of whichever of those
  the target names.

  STATE IS KEYED BY CALL PATH, not by call site alone. A user function
  holding a `ta.ema` that is called from two places is two moving averages in
  Pine, so the key is the stack of invocation sites plus the call's own id.

  WHERE THIS DIVERGES FROM TRADINGVIEW, deliberately and on the record:

    · Every bar is a closed historical bar. There is no realtime tick, so
      `barstate.isconfirmed` is always true and a script's realtime branch is
      never taken. Nothing here repaints, because nothing here is live.
    · A `ta.*` call inside an `if` advances only on the bars where the branch
      runs. That is Pine's own behaviour and the reason TradingView tells you
      to call them unconditionally, so it is matched rather than corrected.
*/

import type { Candle } from '../../types/market';
import type { Arg, Expr, Program, Stmt } from './ast';
import { CONSTS, FNS, VARS, type Ctx, type PineValue, type Slot } from './builtins';

export interface PlotOut {
  title: string;
  color: string | null;
  style: string;
  linewidth: number;
  /** One value per bar, aligned to the bars the run was given. */
  values: (number | null)[];
}

export interface ShapeOut {
  title: string;
  color: string | null;
  shape: string;
  location: string;
  text: string | null;
  /** Bar indices where the condition was true. */
  at: number[];
}

export interface InputDef {
  /** `input.int`, `input.bool`, … */
  kind: string;
  title: string;
  value: PineValue;
  group: string | null;
}

export interface AlertDef { title: string; message: string }

export interface PineRun {
  title: string;
  overlay: boolean;
  plots: PlotOut[];
  shapes: ShapeOut[];
  inputs: InputDef[];
  alerts: AlertDef[];
  /** Bars the run covered — the caller aligns its own series to this. */
  bars: number;
}

export class PineRuntimeError extends Error {
  constructor(message: string, readonly line: number) {
    super(message);
    this.name = 'PineRuntimeError';
  }
}

/* A script is user input, so it gets a budget. A `while` that never ends
   would otherwise take the tab with it. */
const STEP_BUDGET = 4_000_000;
const LOOP_CAP = 100_000;

type Scope = Map<string, PineValue | PineValue[]>;

interface RunOpts {
  timeframe?: string;
  ticker?: string;
  /** Values the reader set for `input.*`, by their title. */
  inputs?: Record<string, PineValue>;
  /**
   * Bars for THIS symbol at another interval, in minutes — what
   * `request.security` is served from. The host owns aggregation (Terrain's
   * `displayBars`), so a script's 10-minute series is the same array the
   * chart would draw if it were switched to ten minutes.
   */
  resolveBars?: (minutes: number) => readonly Candle[] | null;
  /** The chart's own interval in minutes, for aligning a higher one to it. */
  chartMinutes?: number;
}

/**
 * Pine writes an interval as a bare number of minutes, or D/W/M.
 * Returns null for anything this engine cannot aggregate to.
 */
export function pineTfMinutes(tf: string): number | null {
  const t = tf.trim().toUpperCase();
  if (/^\d+$/.test(t)) return Number(t);
  const m = /^(\d*)([SDWM])$/.exec(t);
  if (!m) return null;
  const n = m[1] === '' ? 1 : Number(m[1]);
  switch (m[2]) {
    case 'S': return null;      // sub-minute is not aggregated here
    case 'D': return n * 1440;
    case 'W': return n * 10080;
    case 'M': return n * 43200; // a calendar month is approximated; see the note at the call site
    default: return null;
  }
}

class Interp {
  private readonly scopes: Scope[] = [new Map()];
  private readonly hist = new Map<string, (PineValue | PineValue[])[]>();
  private readonly slots = new Map<string, Slot>();
  private readonly lastCall = new Map<string, PineValue | PineValue[]>();
  /*
    `var` INSIDE A FUNCTION cannot live in the function's scope, because that
    scope is built fresh on every call and torn down after it — the value
    would reset on every bar. Pine keeps one per call site, so the store is
    keyed by the call path and the declaration's line, and the ephemeral
    scope only holds a binding back to it. Writes through `:=` follow that
    binding, or the assignment would update a copy nobody reads again.
  */
  private readonly varStore = new Map<string, PineValue | PineValue[]>();
  private readonly varBindings: Map<string, string>[] = [new Map()];
  private readonly path: number[] = [];
  private readonly funcs = new Map<string, { params: string[]; body: Stmt[] }>();
  private readonly securityCache = new Map<number, (PineValue | PineValue[])[]>();
  private steps = 0;

  readonly plots = new Map<number, PlotOut>();
  readonly shapes = new Map<number, ShapeOut>();
  readonly inputs: InputDef[] = [];
  readonly alerts: AlertDef[] = [];

  private ctx: Ctx;

  constructor(
    private readonly prog: Program,
    private readonly bars: readonly Candle[],
    private readonly opts: RunOpts,
  ) {
    this.ctx = { bars, i: 0, timeframe: opts.timeframe ?? '5m', ticker: opts.ticker ?? 'SPY' };
    for (const st of prog.body) if (st.kind === 'func') this.funcs.set(st.name, { params: st.params, body: st.body });
  }

  private tick(line: number): void {
    if (++this.steps > STEP_BUDGET) throw new PineRuntimeError('Script exceeded its execution budget — check for a runaway loop', line);
  }

  // ── scope ────────────────────────────────────────────────────────────
  private lookup(name: string): PineValue | PineValue[] | undefined {
    for (let s = this.scopes.length - 1; s >= 0; s--) {
      const v = this.scopes[s].get(name);
      if (v !== undefined) return v;
    }
    return undefined;
  }

  private setLocal(name: string, v: PineValue | PineValue[]): void {
    this.scopes[this.scopes.length - 1].set(name, v);
  }

  private assign(name: string, v: PineValue | PineValue[], line: number): void {
    for (let s = this.scopes.length - 1; s >= 0; s--) {
      if (this.scopes[s].has(name)) {
        this.scopes[s].set(name, v);
        const key = this.varBindings[s]?.get(name);
        if (key !== undefined) this.varStore.set(key, v);
        return;
      }
    }
    throw new PineRuntimeError(`Cannot reassign "${name}" — it was never declared`, line);
  }

  private slotFor(key: string): Slot {
    let s = this.slots.get(key);
    if (!s) { s = {}; this.slots.set(key, s); }
    return s;
  }

  private keyOf(id: number): string {
    return this.path.length ? `${this.path.join('.')}#${id}` : `#${id}`;
  }

  // ── history ──────────────────────────────────────────────────────────
  private histAt(key: string, back: number): PineValue | PineValue[] {
    const arr = this.hist.get(key);
    if (!arr) return null;
    const idx = arr.length - back;
    return idx >= 0 && idx < arr.length ? arr[idx] : null;
  }

  private commitBar(): void {
    for (const s of this.scopes[0]) {
      const arr = this.hist.get(s[0]) ?? [];
      arr.push(s[1]);
      this.hist.set(s[0], arr);
    }
    for (const [k, v] of this.lastCall) {
      const arr = this.hist.get(k) ?? [];
      arr.push(v);
      this.hist.set(k, arr);
    }
    this.lastCall.clear();
  }

  // ── expressions ──────────────────────────────────────────────────────
  private evalNum(e: Expr): number {
    const v = this.eval(e);
    return typeof v === 'number' ? v : typeof v === 'boolean' ? (v ? 1 : 0) : NaN;
  }

  eval(e: Expr): PineValue | PineValue[] {
    this.tick(e.line);
    switch (e.kind) {
      case 'num': return e.value;
      case 'str': return e.value;
      case 'bool': return e.value;
      case 'color': return e.value;
      case 'na': return null;
      case 'tuple': return e.items.map(x => this.eval(x) as PineValue);

      case 'ident': {
        const local = this.lookup(e.name);
        if (local !== undefined) return local;
        if (e.name in CONSTS) return CONSTS[e.name];
        if (e.name in VARS) return VARS[e.name](this.ctx);
        throw new PineRuntimeError(`"${e.name}" is not defined`, e.line);
      }

      case 'index': {
        const back = Math.trunc(this.evalNum(e.offset));
        if (back === 0) return this.eval(e.target);
        const t = e.target;
        if (t.kind === 'ident') {
          if (this.lookup(t.name) !== undefined) return this.histAt(t.name, back);
          if (t.name in VARS) {
            const j = this.ctx.i - back;
            if (j < 0) return null;
            const saved = this.ctx.i;
            this.ctx = { ...this.ctx, i: j };
            const v = VARS[t.name](this.ctx);
            this.ctx = { ...this.ctx, i: saved };
            return v;
          }
          return null;
        }
        if (t.kind === 'call') {
          /* Evaluate it so this bar's value is recorded, then read back. */
          this.eval(t);
          return this.histAt(this.keyOf(t.id), back);
        }
        throw new PineRuntimeError('Only a variable or a call can be indexed with [n]', e.line);
      }

      case 'unary': {
        if (e.op === 'not') return !this.truthy(this.eval(e.arg) as PineValue);
        const v = this.evalNum(e.arg);
        return Number.isFinite(v) ? (e.op === '-' ? -v : v) : null;
      }

      case 'binary': return this.binary(e.op, e.left, e.right, e.line);

      case 'ternary': return this.truthy(this.eval(e.test) as PineValue) ? this.eval(e.a) : this.eval(e.b);

      case 'ifExpr': {
        const branch = this.truthy(this.eval(e.test) as PineValue) ? e.then : e.else;
        if (!branch) return null;
        return this.execBlockValue(branch);
      }

      case 'call': return this.call(e.callee, e.args, e.id, e.line);
    }
  }

  private truthy(v: PineValue): boolean {
    return v === true || (typeof v === 'number' && v !== 0 && Number.isFinite(v));
  }

  private binary(op: string, le: Expr, re: Expr, line: number): PineValue {
    if (op === 'and') return this.truthy(this.eval(le) as PineValue) ? this.truthy(this.eval(re) as PineValue) : false;
    if (op === 'or') return this.truthy(this.eval(le) as PineValue) ? true : this.truthy(this.eval(re) as PineValue);

    const l = this.eval(le) as PineValue;
    const r = this.eval(re) as PineValue;

    if (op === '==') return l === r;
    if (op === '!=') return l !== r;

    /* `+` concatenates when either side is a string, as Pine does. */
    if (op === '+' && (typeof l === 'string' || typeof r === 'string')) return String(l ?? '') + String(r ?? '');

    const a = typeof l === 'number' ? l : typeof l === 'boolean' ? (l ? 1 : 0) : NaN;
    const b = typeof r === 'number' ? r : typeof r === 'boolean' ? (r ? 1 : 0) : NaN;
    /* na propagates through arithmetic and makes every comparison false —
       the same rule Pine applies, and the reason a warmup bar draws nothing
       rather than drawing a zero. */
    if (l === null || r === null || !Number.isFinite(a) || !Number.isFinite(b)) {
      return ['<', '<=', '>', '>='].includes(op) ? false : null;
    }
    switch (op) {
      case '+': return a + b;
      case '-': return a - b;
      case '*': return a * b;
      case '/': return b === 0 ? null : a / b;
      case '%': return b === 0 ? null : a % b;
      case '<': return a < b;
      case '<=': return a <= b;
      case '>': return a > b;
      case '>=': return a >= b;
      default: throw new PineRuntimeError(`Unknown operator ${op}`, line);
    }
  }

  private argValues(args: Arg[]): { pos: PineValue[]; named: Record<string, PineValue> } {
    const pos: PineValue[] = [];
    const named: Record<string, PineValue> = {};
    for (const a of args) {
      const v = this.eval(a.value) as PineValue;
      if (a.name) named[a.name] = v;
      else pos.push(v);
    }
    return { pos, named };
  }

  private call(callee: string, args: Arg[], id: number, line: number): PineValue | PineValue[] {
    const key = this.keyOf(id);

    // user-defined function
    const fn = this.funcs.get(callee);
    if (fn) {
      const { pos } = this.argValues(args);
      const scope: Scope = new Map();
      fn.params.forEach((p, k) => scope.set(p, pos[k] ?? null));
      this.scopes.push(scope);
      this.varBindings.push(new Map());
      this.path.push(id);
      try {
        const out = this.execBlockValue(fn.body);
        this.lastCall.set(key, out);
        return out;
      } finally {
        this.path.pop();
        this.varBindings.pop();
        this.scopes.pop();
      }
    }

    // the declaration and the outputs are handled here, not in builtins.ts,
    // because they write into the run's result rather than returning a value
    if (callee === 'indicator' || callee === 'strategy' || callee === 'library') return null;

    if (callee.startsWith('input')) {
      const { pos, named } = this.argValues(args);
      const title = (named.title as string) ?? (typeof pos[1] === 'string' ? pos[1] : '') ?? '';
      const dflt = (named.defval as PineValue) ?? pos[0] ?? null;
      const override = this.opts.inputs?.[title || `#${id}`];
      const value = override !== undefined ? override : dflt;
      if (this.ctx.i === 0) {
        this.inputs.push({ kind: callee, title: title || `input ${this.inputs.length + 1}`, value, group: (named.group as string) ?? null });
      }
      return value;
    }

    if (callee === 'plot') {
      const { pos, named } = this.argValues(args);
      let p = this.plots.get(id);
      if (!p) {
        p = {
          title: (named.title as string) ?? (typeof pos[1] === 'string' ? pos[1] : `Plot ${this.plots.size + 1}`),
          color: (named.color as string) ?? (typeof pos[2] === 'string' ? pos[2] : null),
          style: (named.style as string) ?? 'line',
          linewidth: Math.trunc(Number(named.linewidth ?? 1)) || 1,
          values: new Array(this.bars.length).fill(null),
        };
        this.plots.set(id, p);
      }
      /* The colour may be a per-bar expression, so the last one wins — a
         single colour for the series, which is what a line can carry. */
      if (typeof named.color === 'string') p.color = named.color;
      const v = pos[0];
      p.values[this.ctx.i] = typeof v === 'number' && Number.isFinite(v) ? v : null;
      return null;
    }

    if (callee === 'plotshape' || callee === 'plotchar') {
      const { pos, named } = this.argValues(args);
      let s = this.shapes.get(id);
      if (!s) {
        /* plotshape(series, title, style, location, color, offset, text, …)
           — the colour is the FIFTH positional argument, and reading it only
           from `named` painted every script's shapes the fallback ink. */
        s = {
          title: (named.title as string) ?? (typeof pos[1] === 'string' ? pos[1] : `Shape ${this.shapes.size + 1}`),
          color: (named.color as string) ?? (typeof pos[4] === 'string' ? pos[4] : null),
          shape: (named.style as string) ?? (typeof pos[2] === 'string' ? pos[2] : 'circle'),
          location: (named.location as string) ?? (typeof pos[3] === 'string' ? pos[3] : 'abovebar'),
          text: (named.text as string) ?? (typeof pos[6] === 'string' ? pos[6] : null),
          at: [],
        };
        this.shapes.set(id, s);
      }
      if (typeof named.color === 'string') s.color = named.color;
      else if (typeof pos[4] === 'string') s.color = pos[4];
      if (this.truthy(pos[0])) s.at.push(this.ctx.i);
      return null;
    }

    if (callee === 'alertcondition') {
      const { pos, named } = this.argValues(args);
      if (this.ctx.i === 0) {
        this.alerts.push({
          title: (named.title as string) ?? (typeof pos[1] === 'string' ? pos[1] : `Alert ${this.alerts.length + 1}`),
          message: (named.message as string) ?? (typeof pos[2] === 'string' ? pos[2] : ''),
        });
      }
      return null;
    }

    if (callee === 'request.security') return this.security(args, id, line);

    const builtin = FNS[callee];
    if (!builtin) throw new PineRuntimeError(`"${callee}" is not implemented by this engine`, line);
    const { pos, named } = this.argValues(args);
    const out = builtin(this.ctx, pos, named, this.slotFor(key));
    this.lastCall.set(key, out);
    return out;
  }

  /*
    `request.security(symbol, timeframe, expression)` — THIS symbol, another
    interval.

    HOW IT WORKS. The expression is evaluated ONCE PER HIGHER-TIMEFRAME BAR
    in a child interpreter whose `close`/`high`/`low` are that interval's
    bars, seeded with this script's own globals so the inputs it reads are
    the ones the reader set. The child keeps its own accumulators, so the
    `ta.ema` inside a function fetched at 10 minutes and the same function
    fetched at 15 are two averages, exactly as they are in Pine.

    HOW IT IS ALIGNED, which is the part that decides whether an indicator
    lies. Each chart bar is served the last higher-timeframe bar that had
    ALREADY CLOSED when the chart bar closed. Nothing is ever read from a
    higher bar still forming, so a signal that appears at 10:05 would have
    appeared at 10:05 in the session as it happened. That is `lookahead_off`
    and it is the only mode implemented; `lookahead_on` is refused, because
    honouring it means showing a bar before it finished.

    The whole series is computed on the first bar and cached, because the
    child has to walk its own bars in order for its accumulators to be right
    — asking it for one value at a time would restart them on every bar.
  */
  private security(args: Arg[], id: number, line: number): PineValue | PineValue[] {
    const cached = this.securityCache.get(id);
    if (cached) return cached[this.ctx.i] ?? null;

    if (args.length < 3) throw new PineRuntimeError('request.security needs a symbol, a timeframe and an expression', line);
    const tfArg = this.eval(args[1].value) as PineValue;
    const tf = typeof tfArg === 'string' ? tfArg : String(tfArg ?? '');
    const mins = pineTfMinutes(tf);
    if (mins === null) throw new PineRuntimeError(`This engine cannot aggregate to the interval ${JSON.stringify(tf)}`, line);
    const resolve = this.opts.resolveBars;
    if (!resolve) throw new PineRuntimeError('No higher-timeframe bars are available to this run', line);
    const htf = resolve(mins);
    if (!htf || htf.length === 0) throw new PineRuntimeError(`No bars at ${tf} to fetch`, line);

    /* Walk the higher interval once, in order, in a child that owns its own
       accumulators and its own history. */
    const child = new Interp(this.prog, htf, this.opts);
    for (const [k, v] of this.scopes[0]) child.scopes[0].set(k, v);
    const expr = args[2].value;
    const perHtfBar: (PineValue | PineValue[])[] = [];
    for (let j = 0; j < htf.length; j++) {
      child.ctx = { ...child.ctx, i: j };
      perHtfBar.push(child.eval(expr));
      child.commitBar();
    }

    /* Map each chart bar to the last higher bar CLOSED by the time it
       closed. Both series are ascending, so one walk does it. */
    const htfSec = mins * 60;
    const chartSec = Math.max(1, (this.opts.chartMinutes ?? 1) * 60);
    const out: (PineValue | PineValue[])[] = new Array(this.bars.length).fill(null);
    let j = 0;
    for (let i = 0; i < this.bars.length; i++) {
      const closeAt = this.bars[i].time + chartSec;
      while (j < htf.length && htf[j].time + htfSec <= closeAt) j += 1;
      out[i] = j > 0 ? perHtfBar[j - 1] : null;
    }
    this.securityCache.set(id, out);
    return out[this.ctx.i] ?? null;
  }

  // ── statements ───────────────────────────────────────────────────────
  private execBlockValue(body: Stmt[]): PineValue | PineValue[] {
    let last: PineValue | PineValue[] = null;
    for (const st of body) last = this.exec(st);
    return last;
  }

  exec(st: Stmt): PineValue | PineValue[] {
    this.tick(st.line);
    switch (st.kind) {
      case 'func': return null;

      case 'decl': {
        if (st.persist) {
          const top = this.scopes.length - 1;
          const key = `${this.path.join('.')}#${st.line}:${st.names.join(',')}`;
          const held = this.varStore.has(key) ? this.varStore.get(key)! : this.eval(st.init);
          this.varStore.set(key, held);
          if (st.names.length > 1) {
            const parts = Array.isArray(held) ? held : [held];
            st.names.forEach((n, k) => {
              this.setLocal(n, (parts[k] ?? null) as PineValue);
              this.varBindings[top]?.set(n, `${key}:${k}`);
            });
          } else {
            this.setLocal(st.names[0], held);
            this.varBindings[top]?.set(st.names[0], key);
          }
          return held;
        }
        const v = this.eval(st.init);
        if (st.names.length > 1) {
          const parts = Array.isArray(v) ? v : [v];
          st.names.forEach((n, k) => this.setLocal(n, (parts[k] ?? null) as PineValue));
        } else {
          this.setLocal(st.names[0], v);
        }
        return v;
      }

      case 'assign': {
        const v = this.eval(st.value);
        this.assign(st.name, v, st.line);
        return v;
      }

      case 'exprStmt': return this.eval(st.expr);

      case 'if': {
        const branch = this.truthy(this.eval(st.test) as PineValue) ? st.then : st.else;
        return branch ? this.execBlockValue(branch) : null;
      }

      case 'for': {
        const from = Math.trunc(this.evalNum(st.from));
        const to = Math.trunc(this.evalNum(st.to));
        const step = st.step ? Math.trunc(this.evalNum(st.step)) : from <= to ? 1 : -1;
        if (step === 0) throw new PineRuntimeError('A for loop with a step of zero would never end', st.line);
        let n = 0;
        let last: PineValue | PineValue[] = null;
        for (let v = from; step > 0 ? v <= to : v >= to; v += step) {
          if (++n > LOOP_CAP) throw new PineRuntimeError(`Loop ran more than ${LOOP_CAP} times`, st.line);
          this.setLocal(st.name, v);
          last = this.execBlockValue(st.body);
        }
        return last;
      }

      case 'while': {
        let n = 0;
        let last: PineValue | PineValue[] = null;
        while (this.truthy(this.eval(st.test) as PineValue)) {
          if (++n > LOOP_CAP) throw new PineRuntimeError(`Loop ran more than ${LOOP_CAP} times`, st.line);
          last = this.execBlockValue(st.body);
        }
        return last;
      }
    }
  }

  run(): PineRun {
    for (let i = 0; i < this.bars.length; i++) {
      this.ctx = { ...this.ctx, i };
      /* Bar-local names are rebuilt each bar; `var` values are carried by
         being left in the scope and skipped by their initialiser. */
      for (const st of this.prog.body) this.exec(st);
      this.commitBar();
    }

    const decl = this.prog.declaration;
    let title = 'Pine indicator';
    let overlay = false;
    if (decl) {
      const first = decl.args.find(a => !a.name);
      if (first && first.value.kind === 'str') title = first.value.value;
      const ov = decl.args.find(a => a.name === 'overlay');
      if (ov && ov.value.kind === 'bool') overlay = ov.value.value;
    }
    return {
      title,
      overlay,
      plots: [...this.plots.values()],
      shapes: [...this.shapes.values()],
      inputs: this.inputs,
      alerts: this.alerts,
      bars: this.bars.length,
    };
  }
}

export function runPine(prog: Program, bars: readonly Candle[], opts: RunOpts = {}): PineRun {
  return new Interp(prog, bars, opts).run();
}
