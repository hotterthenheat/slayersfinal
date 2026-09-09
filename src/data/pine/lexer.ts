/*
==================================================
  SLAYER TERMINAL - PINE LEXER (data/pine/lexer.ts)
  Source text to tokens, with the indentation Pine's blocks are made of.
==================================================

  Pine's blocks are INDENTATION, like Python's, and its line breaks are
  significant — but a bracket or an unclosed call suspends both, so an
  argument list may run over several lines. The lexer therefore tracks a
  bracket depth and emits NEWLINE / INDENT / DEDENT only at depth zero.

  A LINE CONTINUATION in Pine is an indented line that continues the
  previous expression rather than opening a block. In general that is
  ambiguous at the token level — `f(x)` on the next line, more indented,
  may be a block body or the rest of an expression — so this lexer emits
  the INDENT and lets the parser decide, which is the same division of
  labour Pine uses.

  The one case it settles here is a line that ENDS INCOMPLETE. A line
  finishing on `?`, `:`, `+`, `and`, a comma — an operator with nothing
  after it — cannot be a statement and cannot open a block, so the break is
  not a break and the indent that follows is not a block. Long ternaries are
  written that way constantly:

      labSize = s == "Tiny" ? size.tiny : s == "Small" ? size.small :
           s == "Normal" ? size.normal : size.large

  Without this the second line reads as an INDENT into nothing and the whole
  script is refused over its formatting.
*/

export type TokKind =
  | 'num' | 'str' | 'color' | 'ident' | 'op'
  | 'newline' | 'indent' | 'dedent' | 'eof';

export interface Token {
  kind: TokKind;
  /** The text, for `op` and `ident`; the parsed value lives on `num`/`str`. */
  text: string;
  num?: number;
  line: number;
  col: number;
}

export class PineSyntaxError extends Error {
  constructor(message: string, readonly line: number) {
    super(message);
    this.name = 'PineSyntaxError';
  }
}

/* Longest first, so `<=` never lexes as `<` then `=`, and `:=` never as `:`. */
const OPERATORS = [
  /* LONGEST FIRST, ALWAYS — `+=` has to be found before `+`, or `sum += 1`
     lexes as `sum`, `+`, `= 1` and the parser reports "Unexpected =" on a
     line of perfectly ordinary Pine. That is what it did. */
  '+=', '-=', '*=', '/=', '%=',
  '=>', ':=', '==', '!=', '<=', '>=', '...',
  '+', '-', '*', '/', '%', '<', '>', '=', '?', ':', ',', '(', ')', '[', ']', '.',
];

const KEYWORD_OPS = new Set(['and', 'or', 'not']);

const isDigit = (c: string) => c >= '0' && c <= '9';
const isIdentStart = (c: string) => /[A-Za-z_]/.test(c);
const isIdentChar = (c: string) => /[A-Za-z0-9_]/.test(c);

export interface LexResult {
  tokens: Token[];
  /** The `//@version=N` annotation if the script declared one. */
  version: number | null;
}

/*
  Operators that cannot END a line's meaning. `=>` is deliberately absent:
  it finishes a function header and OPENS a block, which is the opposite.
*/
const CONTINUES = new Set([
  '?', ':', '+', '-', '*', '/', '%', ',',
  'and', 'or', 'not',
  '==', '!=', '<', '>', '<=', '>=',
  '=', ':=',
]);

export function lex(src: string): LexResult {
  const tokens: Token[] = [];
  const indents: number[] = [0];
  let version: number | null = null;
  let depth = 0;                       // bracket depth; newlines are dead inside brackets
  const lines = src.split(/\r?\n/);

  const push = (t: Token) => tokens.push(t);

  for (let ln = 0; ln < lines.length; ln++) {
    const raw = lines[ln];
    const lineNo = ln + 1;

    /* The version annotation is a comment to everything except us. */
    const ver = /^\s*\/\/\s*@version\s*=\s*(\d+)/.exec(raw);
    if (ver) {
      version = Number(ver[1]);
      continue;
    }

    /* Indentation, measured before anything else on the line. A tab counts
       as one column: Pine's own compiler rejects mixed indentation, and
       guessing a tab width is how a block silently changes shape. */
    let i = 0;
    let col = 0;
    while (i < raw.length && (raw[i] === ' ' || raw[i] === '\t')) {
      col += 1;
      i += 1;
    }

    /* A blank or comment-only line has no indentation of its own. */
    const rest = raw.slice(i);
    if (rest.length === 0 || rest.startsWith('//')) continue;

    /* The previous line ended on an operator, so this one is the rest of it:
       take the newline back and leave the indent stack alone. */
    const prev = tokens[tokens.length - 1];
    const beforePrev = tokens[tokens.length - 2];
    const continuing =
      prev !== undefined &&
      prev.kind === 'newline' &&
      beforePrev !== undefined &&
      beforePrev.kind === 'op' &&
      CONTINUES.has(beforePrev.text);
    if (continuing) tokens.pop();

    if (depth === 0 && !continuing) {
      const top = indents[indents.length - 1];
      if (col > top) {
        indents.push(col);
        push({ kind: 'indent', text: '', line: lineNo, col });
      } else if (col < top) {
        while (indents.length > 1 && col < indents[indents.length - 1]) {
          indents.pop();
          push({ kind: 'dedent', text: '', line: lineNo, col });
        }
        if (col !== indents[indents.length - 1]) {
          throw new PineSyntaxError(`Indentation of ${col} does not match any open block`, lineNo);
        }
      }
    }

    while (i < raw.length) {
      const c = raw[i];

      if (c === ' ' || c === '\t') { i += 1; continue; }
      if (c === '/' && raw[i + 1] === '/') break;            // trailing comment

      if (isDigit(c) || (c === '.' && isDigit(raw[i + 1]))) {
        let j = i;
        while (j < raw.length && (isDigit(raw[j]) || raw[j] === '.')) j += 1;
        /* Pine writes exponents as 1e6; accept them so a literal does not
           split into a number, an identifier and a sign. */
        if (raw[j] === 'e' || raw[j] === 'E') {
          let k = j + 1;
          if (raw[k] === '+' || raw[k] === '-') k += 1;
          if (isDigit(raw[k])) { j = k; while (j < raw.length && isDigit(raw[j])) j += 1; }
        }
        const text = raw.slice(i, j);
        push({ kind: 'num', text, num: Number(text), line: lineNo, col: i });
        i = j;
        continue;
      }

      if (c === '#') {
        let j = i + 1;
        while (j < raw.length && /[0-9A-Fa-f]/.test(raw[j])) j += 1;
        push({ kind: 'color', text: raw.slice(i, j), line: lineNo, col: i });
        i = j;
        continue;
      }

      if (c === '"' || c === "'") {
        let j = i + 1;
        let out = '';
        while (j < raw.length && raw[j] !== c) {
          if (raw[j] === '\\' && j + 1 < raw.length) {
            const esc = raw[j + 1];
            out += esc === 'n' ? '\n' : esc === 't' ? '\t' : esc;
            j += 2;
          } else {
            out += raw[j];
            j += 1;
          }
        }
        if (j >= raw.length) throw new PineSyntaxError('String is never closed', lineNo);
        push({ kind: 'str', text: out, line: lineNo, col: i });
        i = j + 1;
        continue;
      }

      if (isIdentStart(c)) {
        let j = i;
        while (j < raw.length && isIdentChar(raw[j])) j += 1;
        const word = raw.slice(i, j);
        push({ kind: KEYWORD_OPS.has(word) ? 'op' : 'ident', text: word, line: lineNo, col: i });
        i = j;
        continue;
      }

      const op = OPERATORS.find(o => raw.startsWith(o, i));
      if (!op) throw new PineSyntaxError(`Unexpected character ${JSON.stringify(c)}`, lineNo);
      if (op === '(' || op === '[') depth += 1;
      if (op === ')' || op === ']') depth = Math.max(0, depth - 1);
      push({ kind: 'op', text: op, line: lineNo, col: i });
      i += op.length;
    }

    if (depth === 0 && tokens.length > 0 && tokens[tokens.length - 1].kind !== 'newline') {
      push({ kind: 'newline', text: '', line: lineNo, col: raw.length });
    }
  }

  const lastLine = lines.length;
  while (indents.length > 1) {
    indents.pop();
    push({ kind: 'dedent', text: '', line: lastLine, col: 0 });
  }
  push({ kind: 'eof', text: '', line: lastLine, col: 0 });
  return { tokens, version };
}
