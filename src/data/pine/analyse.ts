/*
==================================================
  SLAYER TERMINAL - PINE ANALYSER (data/pine/analyse.ts)
  What this engine will not run, said before it draws anything.
==================================================

  THIS FILE IS THE POINT OF THE WHOLE ENGINE.

  A Pine subset is only safe if it is LOUD about its edges. Given a script
  it cannot run, an engine has two options: approximate the missing parts,
  or refuse. Approximating produces a chart that looks like TradingView's
  and is not — and a reader would size a position on it. So: every
  construct the engine does not implement is collected here, with the line
  it appears on and the reason, and nothing is drawn until the list is
  empty.

  Being over-cautious is the cheap direction. A name this file cannot
  account for is refused as unknown rather than assumed harmless, so the
  failure mode of a gap in the built-in tables is a script that will not
  run, never a script that runs wrongly.
*/

import type { Expr, Program, Stmt } from './ast';
import { CONSTS, FNS, VARS, refusalFor, refusalForCall } from './builtins';

export interface Refusal {
  line: number;
  /** The construct, as the script wrote it. */
  name: string;
  why: string;
}

/** Handled by the interpreter itself rather than by the built-in table. */
const HANDLED_CALLS = new Set(['indicator', 'plot', 'plotshape', 'plotchar', 'alertcondition']);
const HANDLED_PREFIX = ['input.'];
/** Loop counters, parameters and the script's own names are all fine. */
const LANGUAGE_WORDS = new Set(['na', 'true', 'false']);

export function analyse(prog: Program): Refusal[] {
  const out: Refusal[] = [];
  const declared = new Set<string>();
  const funcs = new Set<string>();

  /* Pass one: every name the script itself brings into being. Scope is
     deliberately flattened — a name declared anywhere counts everywhere,
     because the cost of being wrong in that direction is a false refusal,
     and the cost in the other direction is silence. */
  const collect = (body: Stmt[]): void => {
    for (const st of body) {
      switch (st.kind) {
        case 'decl': st.names.forEach(n => declared.add(n)); break;
        case 'func':
          funcs.add(st.name);
          st.params.forEach(p => declared.add(p));
          collect(st.body);
          break;
        case 'for': declared.add(st.name); collect(st.body); break;
        case 'while': collect(st.body); break;
        case 'if': collect(st.then); if (st.else) collect(st.else); break;
        default: break;
      }
    }
  };
  collect(prog.body);

  const seen = new Set<string>();
  const refuse = (line: number, name: string, why: string): void => {
    const key = `${name}@${line}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ line, name, why });
  };

  const walkExpr = (e: Expr): void => {
    switch (e.kind) {
      case 'call': {
        const known = refusalForCall(e.callee);
        if (known) refuse(e.line, e.callee, known);
        else if (
          !funcs.has(e.callee) &&
          !HANDLED_CALLS.has(e.callee) &&
          !HANDLED_PREFIX.some(p => e.callee.startsWith(p)) &&
          !(e.callee in FNS)
        ) {
          refuse(e.line, e.callee, e.callee.includes('.')
            ? `no function by that name is implemented in the ${e.callee.split('.')[0]} namespace`
            : 'no function by that name is implemented');
        }
        e.args.forEach(a => walkExpr(a.value));
        break;
      }
      case 'ident': {
        const known = refusalFor(e.name);
        if (known) { refuse(e.line, e.name, known); break; }
        if (declared.has(e.name) || funcs.has(e.name) || LANGUAGE_WORDS.has(e.name)) break;
        if (e.name in VARS || e.name in CONSTS) break;
        refuse(e.line, e.name, e.name.includes('.')
          ? `no value by that name is implemented in the ${e.name.split('.')[0]} namespace`
          : 'this name is never defined in the script and is not a built-in');
        break;
      }
      case 'index': walkExpr(e.target); walkExpr(e.offset); break;
      case 'unary': walkExpr(e.arg); break;
      case 'binary': walkExpr(e.left); walkExpr(e.right); break;
      case 'ternary': walkExpr(e.test); walkExpr(e.a); walkExpr(e.b); break;
      case 'tuple': e.items.forEach(walkExpr); break;
      case 'ifExpr':
        walkExpr(e.test);
        e.then.forEach(walkStmt);
        if (e.else) e.else.forEach(walkStmt);
        break;
      default: break;
    }
  };

  const walkStmt = (st: Stmt): void => {
    switch (st.kind) {
      case 'decl':
        if (st.varip) refuse(st.line, 'varip', 'varip updates within a bar; every bar this engine runs is already closed');
        walkExpr(st.init);
        break;
      case 'assign': walkExpr(st.value); break;
      case 'exprStmt': walkExpr(st.expr); break;
      case 'if': walkExpr(st.test); st.then.forEach(walkStmt); if (st.else) st.else.forEach(walkStmt); break;
      case 'for': walkExpr(st.from); walkExpr(st.to); if (st.step) walkExpr(st.step); st.body.forEach(walkStmt); break;
      case 'while': walkExpr(st.test); st.body.forEach(walkStmt); break;
      case 'func': st.body.forEach(walkStmt); break;
    }
  };

  prog.body.forEach(walkStmt);

  /* The declaration itself decides whether this is even the right engine. */
  if (prog.declaration && prog.declaration.callee !== 'indicator') {
    refuse(prog.declaration.line, prog.declaration.callee,
      prog.declaration.callee === 'strategy'
        ? 'this is an indicator engine; there is no order simulator behind it'
        : 'only indicator() scripts run here');
  }

  return out.sort((a, b) => a.line - b.line);
}
