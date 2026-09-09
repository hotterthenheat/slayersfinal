/*
==================================================
  SLAYER TERMINAL - PINE AST (data/pine/ast.ts)
  The shapes the parser produces and the interpreter walks.
==================================================

  A NOTE ON CALL-SITE IDENTITY, which is the load-bearing idea here.

  Pine's `ta.*` functions are STATEFUL and each CALL SITE is its own
  instance: two `ta.ema(close, 9)` calls on one line are two independent
  moving averages, and one written inside an `if` still has to advance on
  every bar or its state is wrong. So the parser stamps every call with a
  unique `id`, and the interpreter keys each accumulator on that id rather
  than on the function name or its arguments.

  This is why the engine cannot simply reuse `data/indicators.ts`, whose
  functions map a whole bar array to a whole series: a script may write
  `ta.ema(close - open, 9)`, whose source does not exist until the script
  has run, and may pass a length that changes per bar.
*/

export type Expr =
  | NumberLit | StringLit | BoolLit | ColorLit | NaLit
  | Ident | Index | Unary | Binary | Ternary | Call | IfExpr | TupleLit;

export interface NumberLit { kind: 'num'; value: number; line: number }
export interface StringLit { kind: 'str'; value: string; line: number }
export interface BoolLit { kind: 'bool'; value: boolean; line: number }
export interface ColorLit { kind: 'color'; value: string; line: number }
export interface NaLit { kind: 'na'; line: number }

/** A name, possibly dotted — `close`, `ta.ema`, `math.max`. */
export interface Ident { kind: 'ident'; name: string; line: number }

/** `expr[n]` — n bars back. */
export interface Index { kind: 'index'; target: Expr; offset: Expr; line: number }

export interface Unary { kind: 'unary'; op: '-' | '+' | 'not'; arg: Expr; line: number }
export interface Binary { kind: 'binary'; op: BinOp; left: Expr; right: Expr; line: number }
export type BinOp = '+' | '-' | '*' | '/' | '%' | '<' | '<=' | '>' | '>=' | '==' | '!=' | 'and' | 'or';
export interface Ternary { kind: 'ternary'; test: Expr; a: Expr; b: Expr; line: number }

export interface Arg { name?: string; value: Expr }
export interface Call { kind: 'call'; callee: string; args: Arg[]; line: number; id: number }

/**
 * `[a, b]` where a VALUE is expected — a function returning two things, or a
 * tuple argument. Distinct from `Index`, which is the same bracket in
 * postfix position: `close[1]` indexes history, `[close, open]` is a pair.
 */
export interface TupleLit { kind: 'tuple'; items: Expr[]; line: number }

/** `if` used for its value rather than its effect. */
export interface IfExpr { kind: 'ifExpr'; test: Expr; then: Stmt[]; else: Stmt[] | null; line: number }

export type Stmt = VarDecl | Assign | ExprStmt | IfStmt | ForStmt | WhileStmt | FuncDef;

/** `x = e` (per-bar) or `var x = e` / `varip x = e` (persists across bars). */
export interface VarDecl { kind: 'decl'; names: string[]; init: Expr; persist: boolean; varip: boolean; line: number }
/** `x := e` */
export interface Assign { kind: 'assign'; name: string; value: Expr; line: number }
export interface ExprStmt { kind: 'exprStmt'; expr: Expr; line: number }
export interface IfStmt { kind: 'if'; test: Expr; then: Stmt[]; else: Stmt[] | null; line: number }
export interface ForStmt { kind: 'for'; name: string; from: Expr; to: Expr; step: Expr | null; body: Stmt[]; line: number }
export interface WhileStmt { kind: 'while'; test: Expr; body: Stmt[]; line: number }
export interface FuncDef { kind: 'func'; name: string; params: string[]; body: Stmt[]; line: number }

export interface Program {
  /** The `//@version=` annotation, when the script carries one. */
  version: number | null;
  /** `indicator(...)` / `strategy(...)` / `library(...)`, whichever it declared. */
  declaration: Call | null;
  body: Stmt[];
  /** How many call sites the parser stamped — the interpreter sizes its state from this. */
  callSites: number;
}
