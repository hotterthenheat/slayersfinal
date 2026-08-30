import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import resolveConfig from 'tailwindcss/resolveConfig.js';
import tailwindConfig from '../tailwind.config';

/*
==================================================
  SLAYER TERMINAL - DEAD COLOUR CLASSES (proof)

  A colour utility naming a token that does not exist.
==================================================

  WHY THIS EXISTS. This build has shipped the same defect at least three
  times: `bg-longGamma/70`, `stroke-accent`, `text-accent`,
  `border-accent/60`. Every one of them is a class that LOOKS like the
  house vocabulary and resolves to nothing, because the token it names was
  never in tailwind.config.ts.

  It is a nasty failure precisely because it is not a crash and not a
  layout break. Tailwind's JIT only emits utilities it can resolve, so the
  class silently produces no rule; the element still mounts, still occupies
  exactly the right box, and still passes every geometry assertion the UI
  sweep makes. What the reader gets is `background: rgba(0,0,0,0)` or
  `stroke: none` — an element that is present and invisible. A chart line
  drawn at the correct coordinates with no stroke looks identical to an
  empty chart, and the ATM badge on the option chain simply inherited its
  row's ink and stopped marking anything.

  WHY IT CHECKS THE RESOLVED PALETTE rather than the built stylesheet.
  Grepping dist/ for the emitted selector is the more direct question, but
  it can only be asked after `npm run build`, and this repo's CI runs Test
  BEFORE Build. Resolving the config gives the same answer one step
  earlier, with no build and no ordering constraint — and it is the
  narrower, more honest question anyway: does the token exist?

  WHAT IT DELIBERATELY DOES NOT FLAG.

    variants        `hover:bg-panelHover` and `md:text-6xl` are fine. The
                    prefix is stripped and the remainder checked, because
                    the bare class genuinely is not emitted and a scanner
                    that ignores this reports four false positives — which
                    is how the first version of this check behaved.
    opacity         `bg-white/10` is `white` at 10%. Split on `/`.
    arbitrary       `accent-[#D2FF00]`, `fill-white/[0.015]` — Tailwind
                    emits these verbatim; there is no token to miss.
    non-colour      `border-0` is a WIDTH, `text-6xl` a SIZE. Only the
                    scale for that utility's colour axis is consulted, so
                    a numeric or size suffix is left alone.
    comments        the note in IndexFutures.tsx that explains this very
                    bug contains the string `stroke-accent`. Prose is not
                    markup; only className/class strings are read.
==================================================
*/

/* `as unknown as` because resolveConfig's generic return does not carry a
   `colors` key in its type, though it always has one at runtime. */
const full = resolveConfig(tailwindConfig as never) as unknown as {
  theme: { colors: Record<string, unknown> };
};

/** Every colour name Tailwind will resolve, flattened: `bull`, `red-500`, … */
const COLOURS = new Set<string>();
for (const [name, val] of Object.entries(full.theme.colors)) {
  if (typeof val === 'string') COLOURS.add(name);
  else if (val && typeof val === 'object') {
    for (const shade of Object.keys(val as Record<string, unknown>)) {
      COLOURS.add(shade === 'DEFAULT' ? name : `${name}-${shade}`);
    }
  }
}

/** Utilities whose suffix is a COLOUR. `border`/`divide`/`outline`/`ring`
 *  also take widths and styles, so those are filtered before the lookup. */
const COLOUR_UTILITIES = [
  'bg', 'text', 'border', 'stroke', 'fill', 'ring', 'divide',
  'outline', 'decoration', 'accent', 'caret', 'shadow',
  'from', 'to', 'via',
];

/** Suffixes that are never colours, whichever utility carries them.
 *
 *  `border` and `divide` are the awkward ones: they take a SIDE or an AXIS
 *  before anything else, so `border-b`, `border-x-2` and `divide-y` are
 *  structural and carry no colour at all. Leaving these out reported 281
 *  false failures on the first run — every `border-b` in the codebase. */
const SIDE_OR_AXIS = /^[trblsexy](-\d+(\.\d+)?)?$/;
const NOT_A_COLOUR = new RegExp(
  '^(' + [
    '\\d+(\\.\\d+)?',                      // border-2, ring-4
    'px|full|auto|min|max|fit',
    'xs|sm|base|md|lg|xl|\\d?xl',              // sizes, incl. 2xl…9xl
    'none|inherit|current|transparent',
    'solid|dashed|dotted|double|hidden|collapse|separate',
    'left|right|center|justify|start|end|top|bottom',
    'wrap|nowrap|balance|pretty|ellipsis|clip|inner',
    'inset|offset(-\\d+)?',
    'opacity-\\d+',
  ].join('|') + ')$'
);

const files: string[] = [];
(function walk(dir: string) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(tsx|ts)$/.test(p)) files.push(p);
  }
})('src');

type Dead = { file: string; line: number; cls: string };
const dead: Dead[] = [];

/* Only className / class attribute values — never prose. Covers the three
   shapes this codebase uses: a plain string, a template literal, and the
   `${cond ? 'a' : 'b'}` arms inside one. */
const CLASS_ATTR = /\bclass(?:Name)?\s*=\s*(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\}|\{"([^"]*)"\}|\{'([^']*)'\})/gs;

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  const lineStarts: number[] = [0];
  for (let i = 0; i < src.length; i++) if (src[i] === '\n') lineStarts.push(i + 1);
  const lineOf = (idx: number) => {
    let lo = 0, hi = lineStarts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (lineStarts[mid] <= idx) lo = mid; else hi = mid - 1; }
    return lo + 1;
  };

  for (const m of src.matchAll(CLASS_ATTR)) {
    const body = m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5] ?? '';
    for (const raw of body.split(/[\s`]+/)) {
      if (!raw || raw.includes('[')) continue;              // arbitrary value
      const cls = raw.replace(/^(?:[\w-]+:)+/, '');          // strip variants
      const [base] = cls.split('/');                         // strip opacity
      const dash = base.indexOf('-');
      if (dash < 0) continue;
      const utility = base.slice(0, dash);
      const suffix = base.slice(dash + 1);
      if (!COLOUR_UTILITIES.includes(utility)) continue;
      /* `bg-gradient-to-b` sets a background-IMAGE direction, not a colour;
         the colours come from the from-/via-/to- stops beside it. */
      if (base.startsWith('bg-gradient-')) continue;
      if (!suffix || NOT_A_COLOUR.test(suffix)) continue;
      if ((utility === 'border' || utility === 'divide') && SIDE_OR_AXIS.test(suffix)) continue;
      if (!/^[a-zA-Z][\w-]*$/.test(suffix)) continue;
      if (COLOURS.has(suffix)) continue;
      dead.push({ file, line: lineOf(m.index ?? 0), cls: base });
    }
  }
}

let failed = 0;
const ok = (msg: string) => console.log(`  ok   ${msg}`);
const bad = (msg: string) => { failed++; console.log(`  FAIL ${msg}`); };

console.log('\nevery colour utility names a token that exists\n');

ok(`the palette resolved — ${COLOURS.size} colour names, house tokens included`);
['bull', 'bear', 'select', 'flip', 'supreme', 'darkpool', 'panelHover', 'textMuted']
  .forEach(t => (COLOURS.has(t) ? ok(`  house token present: ${t}`) : bad(`house token missing: ${t}`)));

/* The check itself. */
if (dead.length === 0) {
  ok(`no dead colour classes across ${files.length} source files`);
} else {
  for (const d of dead) bad(`${d.file}:${d.line} — \`${d.cls}\` names no colour token`);
}

/* MUTATION GUARD. The check above is only worth having if it would
   actually catch the bug, so a known-bad class is run through the same
   predicate. `accent` is the exact token that shipped broken three times. */
const wouldCatch = ['text-accent', 'border-accent', 'stroke-accent', 'bg-longGamma']
  .every(c => { const s = c.slice(c.indexOf('-') + 1); return !COLOURS.has(s); });
wouldCatch
  ? ok('and it would still catch the four classes that shipped broken')
  : bad('the predicate no longer rejects the classes that caused this check');

/* And it must NOT reject the shapes that are legitimate — the false
   positives the first draft of this scanner produced. */
const legit: Array<[string, string]> = [
  ['hover:bg-panelHover', 'a variant on a real token'],
  ['md:text-6xl', 'a font size, not a colour'],
  ['bg-white/10', 'an opacity modifier'],
  ['last:border-0', 'a border WIDTH'],
  ['border-b', 'a border SIDE'],
  ['border-x-2', 'a border axis with a width'],
  ['divide-y', 'a divide axis'],
  ['border-collapse', 'a table border style'],
  ['shadow-lg', 'a shadow size'],
  ['text-left', 'a text alignment'],
  ['fill-white', 'a default Tailwind colour'],
  ['text-textMuted', 'a house token'],
];
for (const [cls, why] of legit) {
  const stripped = cls.replace(/^(?:[\w-]+:)+/, '').split('/')[0];
  const dash = stripped.indexOf('-');
  const utility = stripped.slice(0, dash);
  const suffix = stripped.slice(dash + 1);
  const flagged =
    COLOUR_UTILITIES.includes(utility) && suffix && !NOT_A_COLOUR.test(suffix) &&
    !((utility === 'border' || utility === 'divide') && SIDE_OR_AXIS.test(suffix)) &&
    /^[a-zA-Z][\w-]*$/.test(suffix) && !COLOURS.has(suffix);
  flagged ? bad(`false positive: ${cls} (${why}) would be reported`) : ok(`leaves ${cls} alone — ${why}`);
}

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${failed} failing\n`);
process.exit(failed === 0 ? 0 : 1);
