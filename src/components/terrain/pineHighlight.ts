/*
==================================================
  SLAYER TERMINAL - PINE, COLOURED (components/terrain/pineHighlight.ts)
==================================================

  A monochrome textarea reads as a text box. The chart beside it is a
  terminal, and the script that draws on it should look like it belongs to
  the same product.

  ─────────────────────────────────────────────────────────────────────────
  IT IS A SEPARATE PASS FROM THE ENGINE'S LEXER, AND ON PURPOSE.

  `data/pine/lexer.ts` refuses malformed input — that is its job, and it is
  the right job for a compiler. A highlighter cannot: a reader types
  `plot(clo` and the string is broken for as long as their finger is off the
  `s`, and a highlighter that throws there would strobe the whole panel on
  every keystroke. So this one never fails. Anything it cannot classify is
  plain text, which is also what it looks like before it is finished.

  It returns TOKENS, not markup. The caller renders them as React nodes, so
  a script containing `</span>` is text rather than a hole in the panel.

  ─────────────────────────────────────────────────────────────────────────
  THE PALETTE IS AN INTERFACE PALETTE, NOT A DATA ONE.

  The house rule is that the dealer inks — gold put-dominant, steel
  call-dominant, magenta supreme, blue flip — and red/green for direction
  are spoken for by the CHART. Code is chrome, so it may use lime and the
  cooler hues without colliding with anything that means something.

  `slayer.*` gets its own colour, brighter than the rest, because it is the
  half of this language no other platform has and a writer should be able to
  see at a glance how much of their script is reading the book.
*/

export type Tone =
  | 'plain' | 'comment' | 'keyword' | 'slayer' | 'fn' | 'builtin'
  | 'number' | 'string' | 'colour' | 'punct';

export interface PineToken {
  text: string;
  tone: Tone;
  /** For a `#rrggbb` literal light enough to read: paint it as itself. */
  ink?: string;
}

/* Reserved words and the word-shaped operators, which read as structure. */
const KEYWORDS = new Set([
  'if', 'else', 'for', 'while', 'var', 'varip', 'to', 'by', 'switch',
  'break', 'continue', 'and', 'or', 'not', 'na', 'true', 'false',
  'import', 'export', 'type', 'method', 'enum', 'series', 'simple', 'const',
  'int', 'float', 'bool', 'string', 'color', 'line', 'label', 'box', 'table', 'array',
]);

/* The bar's own values — the words a script is written around. */
const BUILTIN_VARS = new Set([
  'open', 'high', 'low', 'close', 'volume', 'hl2', 'hlc3', 'ohlc4', 'hlcc4',
  'time', 'time_close', 'bar_index', 'last_bar_index', 'barstate', 'syminfo',
  'timeframe', 'session', 'dayofweek', 'year', 'month', 'dayofmonth', 'hour', 'minute',
]);

/* A namespace before a dot means a library call — one colour for all of
   them, so the eye groups "this line is calling something" without having
   to learn eleven hues. */
const NAMESPACES = new Set([
  'ta', 'math', 'str', 'array', 'matrix', 'map', 'color', 'input', 'request',
  'line', 'label', 'box', 'table', 'barmerge', 'display', 'plot', 'shape',
  'location', 'size', 'extend', 'xloc', 'yloc', 'position', 'text', 'order',
  'format', 'strategy', 'runtime', 'chart', 'linefill', 'polyline', 'ticker',
  'syminfo', 'timeframe', 'barstate', 'session', 'currency', 'dayofweek',
  'adjustment', 'earnings', 'dividends', 'splits', 'scale', 'font', 'alert',
]);

/** Is a hex colour light enough to read on the editor's ground? */
function readable(hex: string): boolean {
  const h = hex.replace('#', '').slice(0, 6);
  if (h.length < 6) return false;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if ([r, g, b].some(v => Number.isNaN(v))) return false;
  /* Rec. 709 luma, against a near-black panel. Below this a literal painted
     as itself is a smudge, so it takes the string colour instead. */
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.32;
}

const isWordStart = (c: string): boolean => /[A-Za-z_]/.test(c);
const isWord = (c: string): boolean => /[A-Za-z0-9_]/.test(c);
const isDigit = (c: string): boolean => c >= '0' && c <= '9';

/**
 * Source to a flat run of coloured tokens, newlines included.
 *
 * Never throws and never drops a character: concatenating every `text` back
 * together returns the input exactly. The panel depends on that — the
 * coloured layer sits UNDER a transparent textarea and the two have to agree
 * on where every glyph is, to the pixel.
 */
export function highlightPine(src: string): PineToken[] {
  const out: PineToken[] = [];
  const push = (text: string, tone: Tone, ink?: string): void => {
    if (!text) return;
    const last = out[out.length - 1];
    if (last && last.tone === tone && !last.ink && !ink) last.text += text;
    else out.push(ink ? { text, tone, ink } : { text, tone });
  };

  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];

    /* A comment runs to the end of the line, and a `//@version=` annotation
       is one too — it is a comment to everything except the lexer. */
    if (c === '/' && src[i + 1] === '/') {
      let j = i;
      while (j < n && src[j] !== '\n') j += 1;
      push(src.slice(i, j), 'comment');
      i = j;
      continue;
    }

    /* An UNTERMINATED string is the normal state of a string being typed, so
       it runs to the end of the line and stops rather than swallowing the
       rest of the script. */
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && src[j] !== c && src[j] !== '\n') {
        if (src[j] === '\\') j += 1;
        j += 1;
      }
      const end = j < n && src[j] === c ? j + 1 : j;
      push(src.slice(i, end), 'string');
      i = end;
      continue;
    }

    if (c === '#') {
      const m = /^#[0-9a-fA-F]{6,8}/.exec(src.slice(i));
      if (m) {
        push(m[0], 'colour', readable(m[0]) ? m[0].slice(0, 7) : undefined);
        i += m[0].length;
        continue;
      }
    }

    if (isDigit(c) || (c === '.' && isDigit(src[i + 1]))) {
      let j = i;
      while (j < n && /[0-9._eE]/.test(src[j])) {
        /* `1e-5` — the sign belongs to the exponent, not to the next term. */
        if ((src[j] === 'e' || src[j] === 'E') && (src[j + 1] === '+' || src[j + 1] === '-')) j += 1;
        j += 1;
      }
      push(src.slice(i, j), 'number');
      i = j;
      continue;
    }

    if (isWordStart(c)) {
      let j = i;
      while (j < n && isWord(src[j])) j += 1;
      let word = src.slice(i, j);
      /* A dotted name is ONE token — `slayer.callwall` should not read as a
         namespace, a dot and a field in three colours. */
      while (j < n && src[j] === '.' && isWordStart(src[j + 1] ?? '')) {
        let k = j + 1;
        while (k < n && isWord(src[k])) k += 1;
        word = src.slice(i, k);
        j = k;
      }
      const head = word.split('.')[0];
      const tone: Tone =
        word.startsWith('slayer.') ? 'slayer'
          : KEYWORDS.has(word) ? 'keyword'
            : word.includes('.') && NAMESPACES.has(head) ? 'fn'
              : BUILTIN_VARS.has(word) ? 'builtin'
                : 'plain';
      push(word, tone);
      i = j;
      continue;
    }

    if (/[()[\]{},:?=<>!+\-*/%]/.test(c)) {
      push(c, 'punct');
      i += 1;
      continue;
    }

    push(c, 'plain');
    i += 1;
  }
  return out;
}

/** The class for each tone. Kept beside the palette note in this file's head. */
/*
  THE PALETTE A PINE WRITER ALREADY KNOWS.

  This used to be the desk's own inks — `select` for keywords, violet for
  built-ins — and it read as a house style rather than as code. Somebody
  writing Pine has spent hours in the editor everybody else uses, and the
  colours there are not arbitrary: they are the ones every code editor since
  has borrowed, so a keyword being blue and a string being terracotta is
  nearer to muscle memory than to decoration. Matching them costs nothing and
  makes a pasted script look like itself.

  `slayer.*` is the one deliberate departure. It keeps the desk's own cyan
  because it is the one namespace no other editor has, and a writer glancing
  at a script should be able to see at once how much of it reads the book.
*/
export const TONE_CLASS: Record<Tone, string> = {
  plain: 'text-[#D4D4D4]',
  comment: 'text-[#6A9955]',
  keyword: 'text-[#569CD6]',
  slayer: 'text-[#7DE3FF]',
  fn: 'text-[#DCDCAA]',
  builtin: 'text-[#4EC9B0]',
  number: 'text-[#B5CEA8]',
  string: 'text-[#CE9178]',
  colour: 'text-[#CE9178]',
  punct: 'text-[#808080]',
};
