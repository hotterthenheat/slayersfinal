/*
==================================================
  SLAYER TERMINAL - PINE PARSER (data/pine/parser.ts)
  Tokens to an AST. Syntax only — what is SUPPORTED is analyse.ts's job.
==================================================

  The split matters. This parser accepts the whole shape of the language,
  including constructs the engine cannot run: `while`, arrays, drawing
  objects. That is deliberate. A parser that choked on `line.new` would
  report "unexpected token" at a column number, when the true answer is
  "this engine does not implement drawing objects" — and the reader needs
  the second sentence, not the first.

  So: parse everything, then refuse precisely, by name, in analyse.ts.
*/

import { lex, PineSyntaxError, type Token } from './lexer';
import type { Arg, BinOp, Expr, Program, Stmt } from './ast';

const KEYWORDS = new Set(['if', 'else', 'for', 'while', 'var', 'varip', 'to', 'by', 'true', 'false', 'na', 'switch', 'break', 'continue', 'import', 'export', 'type', 'method', 'enum']);

/*
  PINE DECLARES TYPES, and real scripts lean on it: `float holdY = na`,
  `var line eLine = na`, `var float[] stPrice = array.new_float(20, na)`.
  The type is not information this engine needs — every value carries its own
  at runtime — but a parser that cannot READ it treats `float holdY` as two
  identifiers in a row and fails on a line that is perfectly ordinary.

  So the type is parsed and discarded. `analyse.ts` is what decides that an
  `array<float>` is not something the engine can run.
*/
const TYPE_WORDS = new Set(['int', 'float', 'bool', 'string', 'color', 'line', 'label', 'box', 'table', 'array', 'matrix', 'map', 'linefill', 'polyline', 'chart']);

class Parser {
  private i = 0;
  private calls = 0;

  constructor(private readonly toks: Token[]) {}

  private peek(k = 0): Token { return this.toks[Math.min(this.i + k, this.toks.length - 1)]; }
  private at(text: string): boolean { const t = this.peek(); return (t.kind === 'op' || t.kind === 'ident') && t.text === text; }
  private atKind(k: Token['kind']): boolean { return this.peek().kind === k; }
  private next(): Token { return this.toks[this.i++]; }

  private eat(text: string): boolean {
    if (this.at(text)) { this.i += 1; return true; }
    return false;
  }

  private expect(text: string): Token {
    if (!this.at(text)) throw new PineSyntaxError(`Expected ${JSON.stringify(text)}, found ${JSON.stringify(this.peek().text || this.peek().kind)}`, this.peek().line);
    return this.next();
  }

  private expectKind(k: Token['kind']): Token {
    if (!this.atKind(k)) throw new PineSyntaxError(`Expected ${k}, found ${JSON.stringify(this.peek().text || this.peek().kind)}`, this.peek().line);
    return this.next();
  }

  private skipNewlines(): void {
    while (this.atKind('newline')) this.i += 1;
  }

  // ── program ──────────────────────────────────────────────────────────
  parseProgram(): { body: Stmt[]; calls: number } {
    const body: Stmt[] = [];
    this.skipNewlines();
    while (!this.atKind('eof')) {
      if (this.atKind('dedent') || this.atKind('indent')) { this.i += 1; continue; }
      body.push(this.parseStmt());
      this.skipNewlines();
    }
    return { body, calls: this.calls };
  }

  /** An indented block, or a single statement on the same line. */
  private parseBlock(): Stmt[] {
    if (this.atKind('newline')) {
      this.skipNewlines();
      if (!this.atKind('indent')) throw new PineSyntaxError('Expected an indented block', this.peek().line);
      this.i += 1;
      const out: Stmt[] = [];
      this.skipNewlines();
      while (!this.atKind('dedent') && !this.atKind('eof')) {
        out.push(this.parseStmt());
        this.skipNewlines();
      }
      if (this.atKind('dedent')) this.i += 1;
      return out;
    }
    return [this.parseStmt()];
  }

  private parseStmt(): Stmt {
    const t = this.peek();
    const line = t.line;

    if (this.at('if')) {
      this.i += 1;
      const test = this.parseExpr();
      const then = this.parseBlock();
      let alt: Stmt[] | null = null;
      this.skipNewlines();
      if (this.at('else')) {
        this.i += 1;
        alt = this.at('if') ? [this.parseStmt()] : this.parseBlock();
      }
      return { kind: 'if', test, then, else: alt, line };
    }

    if (this.at('for')) {
      this.i += 1;
      /* `for [i, v] in xs` — the index/value pair form. */
      if (this.at('[')) {
        this.i += 1;
        const index = this.expectKind('ident').text;
        this.expect(',');
        const val = this.expectKind('ident').text;
        this.expect(']');
        this.expect('in');
        const over = this.parseExpr();
        const body = this.parseBlock();
        return { kind: 'forIn', index, name: val, over, body, line };
      }
      const first = this.expectKind('ident').text;
      /* `for v in xs` — a collection, not a counter. */
      if (this.at('in')) {
        this.i += 1;
        const over = this.parseExpr();
        const body = this.parseBlock();
        return { kind: 'forIn', index: null, name: first, over, body, line };
      }
      const name = first;
      this.expect('=');
      const from = this.parseExpr();
      this.expect('to');
      const to = this.parseExpr();
      const step = this.eat('by') ? this.parseExpr() : null;
      const body = this.parseBlock();
      return { kind: 'for', name, from, to, step, body, line };
    }

    /* `break` and `continue` are statements, not names — without them a loop
       that stops at the first match is refused as an undefined identifier,
       which is what happened to the levels search. */
    if (this.at('break') || this.at('continue')) {
      const what = this.peek().text as 'break' | 'continue';
      this.i += 1;
      return { kind: 'jump', what, line };
    }

    if (this.at('while')) {
      this.i += 1;
      const test = this.parseExpr();
      const body = this.parseBlock();
      return { kind: 'while', test, body, line };
    }

    if (this.at('var') || this.at('varip')) {
      const varip = this.peek().text === 'varip';
      this.i += 1;
      return this.parseDecl(true, varip, line);
    }

    /* `[a, b] = f()` — tuple destructuring. */
    if (this.at('[')) {
      const save = this.i;
      try { return this.parseDecl(false, false, line); }
      catch { this.i = save; }
    }

    /* `float x = ...` — a declaration wearing its type. */
    if (t.kind === 'ident' && TYPE_WORDS.has(t.text) && this.looksLikeTypedDecl()) {
      return this.parseDecl(false, false, line);
    }

    /* A name followed by `=`, `:=` or `(...) =>`. */
    if (t.kind === 'ident' && !KEYWORDS.has(t.text)) {
      const save = this.i;
      const name = this.parseDottedName();
      if (this.at(':=')) {
        this.i += 1;
        const value = this.parseExpr();
        return { kind: 'assign', name, value, line };
      }
      /*
        `sum += close` is `sum := sum + close`, desugared here so the rest of
        the engine never learns a second way to assign. Pine has all five,
        and a loop body accumulating into a running total is the single most
        common shape in the language — without them `for i = 0 to 4` failed
        on its own second line with "Unexpected =", which reads as the
        reader's mistake and is not.
      */
      const COMPOUND: Record<string, BinOp> = { '+=': '+', '-=': '-', '*=': '*', '/=': '/', '%=': '%' };
      const op = COMPOUND[this.peek().text];
      if (op && this.peek().kind === 'op') {
        this.i += 1;
        const rhs = this.parseExpr();
        return {
          kind: 'assign',
          name,
          value: { kind: 'binary', op, left: { kind: 'ident', name, line }, right: rhs, line },
          line,
        };
      }
      if (this.at('=')) {
        this.i = save;
        return this.parseDecl(false, false, line);
      }
      if (this.at('(')) {
        /* Could be a call statement or a function definition — the `=>`
           after the parameter list is what separates them. */
        const afterName = this.i;
        const params = this.tryParseParamList();
        if (params && this.at('=>')) {
          this.i += 1;
          const body = this.parseBlock();
          return { kind: 'func', name, params, body, line };
        }
        this.i = afterName;
      }
      this.i = save;
    }

    const expr = this.parseExpr();
    return { kind: 'exprStmt', expr, line };
  }

  /**
   * A type annotation if one is here, consumed and discarded.
   * Handles `float`, `float[]`, `array<float>`, `map<string, float>`.
   */
  private skipTypeAnnotation(): void {
    if (!this.atKind('ident') || !TYPE_WORDS.has(this.peek().text)) return;
    /* Only a type when a NAME follows it — `float` alone could be a call. */
    const save = this.i;
    this.i += 1;
    if (this.at('[') && this.peek(1).kind === 'op' && this.peek(1).text === ']') this.i += 2;
    else if (this.at('<')) {
      let depth = 0;
      while (!this.atKind('eof')) {
        if (this.at('<')) depth += 1;
        else if (this.at('>')) { depth -= 1; this.i += 1; if (depth === 0) break; continue; }
        this.i += 1;
      }
    }
    if (this.atKind('ident') && !KEYWORDS.has(this.peek().text)) return;
    this.i = save;
  }

  /** Is this position the start of `[type] name =` — a declaration? */
  private looksLikeTypedDecl(): boolean {
    const save = this.i;
    this.skipTypeAnnotation();
    const moved = this.i !== save;
    const ok = moved && this.atKind('ident') && this.peek(1).kind === 'op' && this.peek(1).text === '=';
    this.i = save;
    return ok;
  }

  /** `[a, b] = e` or `x = e`, with `var`/`varip` already consumed. */
  private parseDecl(persist: boolean, varip: boolean, line: number): Stmt {
    this.skipTypeAnnotation();
    const names: string[] = [];
    if (this.eat('[')) {
      do { names.push(this.expectKind('ident').text); } while (this.eat(','));
      this.expect(']');
    } else {
      names.push(this.expectKind('ident').text);
    }
    this.expect('=');
    const init = this.parseExpr();
    return { kind: 'decl', names, init, persist, varip, line };
  }

  /** A bare `(a, b)` parameter list, or null when it is not one. */
  private tryParseParamList(): string[] | null {
    const save = this.i;
    if (!this.eat('(')) return null;
    const params: string[] = [];
    if (!this.at(')')) {
      do {
        if (!this.atKind('ident')) { this.i = save; return null; }
        /*
          `f(float x, int n) =>` — a parameter may wear its type, and the
          engine is untyped, so the word is consumed and dropped. Only when
          ANOTHER name follows it: `f(float)` is a parameter called float,
          which is legal and means something different.
        */
        if (TYPE_WORDS.has(this.peek().text) && this.peek(1).kind === 'ident') this.i += 1;
        else if (TYPE_WORDS.has(this.peek().text) && this.peek(1).text === '[' && this.peek(2).text === ']' && this.peek(3).kind === 'ident') this.i += 3;
        if (!this.atKind('ident')) { this.i = save; return null; }
        params.push(this.next().text);
        /* A default value makes it not a plain parameter list we handle;
           bail rather than mis-parse it as one. */
        if (this.at('=')) { this.i = save; return null; }
      } while (this.eat(','));
    }
    if (!this.eat(')')) { this.i = save; return null; }
    return params;
  }

  /** `<float>` / `<string, float>` before a call, consumed and discarded. */
  private skipGenericArgs(): void {
    if (!this.at('<')) return;
    const save = this.i;
    this.i += 1;
    let guard = 0;
    for (;;) {
      if (guard++ > 8) { this.i = save; return; }
      if (!this.atKind('ident') || !TYPE_WORDS.has(this.peek().text)) { this.i = save; return; }
      this.i += 1;
      if (this.at('[') && this.peek(1).text === ']') this.i += 2;
      if (this.eat(',')) continue;
      break;
    }
    if (!this.eat('>') || !this.at('(')) { this.i = save; return; }
  }

  private parseDottedName(): string {
    let name = this.expectKind('ident').text;
    while (this.at('.') && this.peek(1).kind === 'ident') {
      this.i += 1;
      name += '.' + this.next().text;
    }
    return name;
  }

  /*
    `switch` — an EXPRESSION, and one of the two shapes Pine gives it:

        v = switch x            v = switch
            1 => "one"              close > open => 1
            => "other"              => 0

    Each arm is `test => body`, and the arm with no test is the default. The
    body may be an inline expression or an indented block, so it reuses the
    same block parser every other construct does.
  */
  private parseSwitch(line: number): Expr {
    this.i += 1; // `switch`
    /* No subject means the condition form — each arm stands on its own. */
    const subject = this.atKind('newline') ? null : this.parseExpr();
    this.skipNewlines();
    if (!this.atKind('indent')) throw new PineSyntaxError('A switch needs its arms indented under it', line);
    this.i += 1;
    const arms: { test: Expr | null; body: Stmt[] }[] = [];
    this.skipNewlines();
    while (!this.atKind('dedent') && !this.atKind('eof')) {
      const test = this.at('=>') ? null : this.parseExpr();
      this.expect('=>');
      arms.push({ test, body: this.parseBlock() });
      this.skipNewlines();
    }
    if (this.atKind('dedent')) this.i += 1;
    return { kind: 'switch', subject, arms, line };
  }

  // ── expressions ──────────────────────────────────────────────────────
  parseExpr(): Expr {
    if (this.at('switch')) return this.parseSwitch(this.peek().line);
    return this.parseTernary();
  }

  private parseTernary(): Expr {
    const test = this.parseOr();
    if (this.at('?')) {
      const line = this.peek().line;
      this.i += 1;
      const a = this.parseExpr();
      this.expect(':');
      const b = this.parseExpr();
      return { kind: 'ternary', test, a, b, line };
    }
    return test;
  }

  private parseOr(): Expr {
    let left = this.parseAnd();
    while (this.at('or')) {
      const line = this.next().line;
      left = { kind: 'binary', op: 'or', left, right: this.parseAnd(), line };
    }
    return left;
  }

  private parseAnd(): Expr {
    let left = this.parseNot();
    while (this.at('and')) {
      const line = this.next().line;
      left = { kind: 'binary', op: 'and', left, right: this.parseNot(), line };
    }
    return left;
  }

  private parseNot(): Expr {
    if (this.at('not')) {
      const line = this.next().line;
      return { kind: 'unary', op: 'not', arg: this.parseNot(), line };
    }
    return this.parseComparison();
  }

  private parseComparison(): Expr {
    let left = this.parseAdditive();
    for (;;) {
      const t = this.peek();
      if (t.kind === 'op' && ['==', '!=', '<', '<=', '>', '>='].includes(t.text)) {
        this.i += 1;
        left = { kind: 'binary', op: t.text as '==', left, right: this.parseAdditive(), line: t.line };
      } else return left;
    }
  }

  private parseAdditive(): Expr {
    let left = this.parseMultiplicative();
    for (;;) {
      const t = this.peek();
      if (t.kind === 'op' && (t.text === '+' || t.text === '-')) {
        this.i += 1;
        left = { kind: 'binary', op: t.text, left, right: this.parseMultiplicative(), line: t.line };
      } else return left;
    }
  }

  private parseMultiplicative(): Expr {
    let left = this.parseUnary();
    for (;;) {
      const t = this.peek();
      if (t.kind === 'op' && (t.text === '*' || t.text === '/' || t.text === '%')) {
        this.i += 1;
        left = { kind: 'binary', op: t.text, left, right: this.parseUnary(), line: t.line };
      } else return left;
    }
  }

  private parseUnary(): Expr {
    const t = this.peek();
    if (t.kind === 'op' && (t.text === '-' || t.text === '+')) {
      this.i += 1;
      return { kind: 'unary', op: t.text, arg: this.parseUnary(), line: t.line };
    }
    return this.parsePostfix();
  }

  private parsePostfix(): Expr {
    let e = this.parsePrimary();
    while (this.at('[')) {
      const line = this.next().line;
      const offset = this.parseExpr();
      this.expect(']');
      e = { kind: 'index', target: e, offset, line };
    }
    return e;
  }

  private parsePrimary(): Expr {
    const t = this.peek();
    const line = t.line;

    if (t.kind === 'num') { this.i += 1; return { kind: 'num', value: t.num ?? 0, line }; }
    if (t.kind === 'str') { this.i += 1; return { kind: 'str', value: t.text, line }; }
    if (t.kind === 'color') { this.i += 1; return { kind: 'color', value: t.text, line }; }

    if (this.at('(')) {
      this.i += 1;
      const e = this.parseExpr();
      this.expect(')');
      return e;
    }

    /* A bracket where a value is expected is a TUPLE, not an index — the
       return of a two-valued function, or a tuple argument. */
    if (this.at('[')) {
      this.i += 1;
      const items: Expr[] = [];
      this.skipNewlines();
      if (!this.at(']')) {
        do {
          this.skipNewlines();
          items.push(this.parseExpr());
          this.skipNewlines();
        } while (this.eat(','));
      }
      this.expect(']');
      return { kind: 'tuple', items, line };
    }

    if (this.at('if')) {
      this.i += 1;
      const test = this.parseExpr();
      const then = this.parseBlock();
      let alt: Stmt[] | null = null;
      this.skipNewlines();
      if (this.at('else')) {
        this.i += 1;
        alt = this.at('if') ? [{ kind: 'exprStmt', expr: this.parsePrimary(), line } as Stmt] : this.parseBlock();
      }
      return { kind: 'ifExpr', test, then, else: alt, line };
    }

    if (t.kind === 'ident') {
      if (t.text === 'true' || t.text === 'false') { this.i += 1; return { kind: 'bool', value: t.text === 'true', line }; }
      /* `na` is BOTH a literal and a function: `x = na` against `na(x)`,
         which tests whether a value is missing. The parenthesis decides,
         so the literal cannot be taken before looking at what follows it. */
      if (t.text === 'na' && !(this.peek(1).kind === 'op' && this.peek(1).text === '(')) {
        this.i += 1;
        return { kind: 'na', line };
      }
      const name = this.parseDottedName();
      /*
        A GENERIC TYPE ARGUMENT — `matrix.new<float>(2, 2)`, `map.new<string,
        float>()`, `array.new<line>()`.

        The engine is untyped, so the annotation carries no meaning here; it
        is consumed so the call parses and the ANALYSER gets to refuse it by
        name. Without this, `matrix.new<float>(2,2)` failed as a syntax error
        — which tells a reader their script is malformed when the truth is
        that this engine has no matrices, and those are very different
        things to be told.

        Only ever before a `(`, and only when what is between the angles
        looks like a type list. `a < b, c > (d)` is a comparison and must
        stay one, so the whole attempt rewinds unless the shape matches.
      */
      this.skipGenericArgs();
      if (this.at('(')) {
        this.i += 1;
        const args: Arg[] = [];
        this.skipNewlines();
        if (!this.at(')')) {
          do {
            this.skipNewlines();
            /* A named argument is `ident = expr`, and only at the top level
               of the list — `a == b` is a comparison, not a name. */
            if (this.peek().kind === 'ident' && this.peek(1).kind === 'op' && this.peek(1).text === '=') {
              const argName = this.next().text;
              this.i += 1;
              args.push({ name: argName, value: this.parseExpr() });
            } else {
              args.push({ value: this.parseExpr() });
            }
            this.skipNewlines();
          } while (this.eat(','));
        }
        this.skipNewlines();
        this.expect(')');
        return { kind: 'call', callee: name, args, line, id: this.calls++ };
      }
      return { kind: 'ident', name, line };
    }

    throw new PineSyntaxError(`Unexpected ${JSON.stringify(t.text || t.kind)}`, line);
  }
}

export function parse(src: string): Program {
  const { tokens, version } = lex(src);
  const p = new Parser(tokens);
  const { body, calls } = p.parseProgram();

  /* The declaration is whichever of indicator/strategy/library the script
     opened with — the engine needs its `overlay` to know which pane to draw
     into, and analyse.ts needs to know a strategy was asked for. */
  let declaration: Program['declaration'] = null;
  for (const st of body) {
    if (st.kind === 'exprStmt' && st.expr.kind === 'call' && ['indicator', 'strategy', 'library'].includes(st.expr.callee)) {
      declaration = st.expr;
      break;
    }
  }
  return { version, declaration, body, callSites: calls };
}

export { PineSyntaxError };
