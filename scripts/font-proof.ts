/*
  One family name, spelled in four places that must agree — and no font in the
  repo that we do not have the right to serve.

  WHY THIS EXISTS. The terminal shipped Apple's SF Pro: the file under
  public/fonts carried "© 2015-2026 Apple Inc." in its own name table, and the
  comment beside the @font-face said it had been taken "from Apple's
  installer". Apple's licence covers UI in software built for Apple platforms;
  it does not cover self-hosting the file in a paid web product. A licence
  problem does not announce itself at runtime, so it needs an assertion.

  And the family name is one fact with four generators — the @font-face rule,
  the Tailwind `sans` stack, the Tailwind `mono` stack, and the FONT_FAMILY
  token that canvas and SVG chart code writes into `ctx.font` and `fontFamily`.
  Rename the face and the DOM follows Tailwind while every chart label silently
  drops to the browser default. Nothing throws. Typecheck passes. The only
  symptom is axis ticks that stop matching the table beside them, which is
  exactly the class of defect a person does not notice in a diff.

  Run: npx tsx scripts/font-proof.ts
*/

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');

let pass = 0,
  fail = 0;
const check = (name: string, ok: boolean, detail: string) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} — ${detail}`);
  ok ? pass++ : fail++;
};

// ---- 1. the four spellings agree -------------------------------------------

const css = read('src/index.css');
const tw = read('tailwind.config.ts');
const token = read('src/components/ui/typeface.ts');

const faceName = css.match(/@font-face\s*\{[^}]*font-family:\s*'([^']+)'/)?.[1] ?? '';
const faceUrl = css.match(/@font-face\s*\{[^}]*src:\s*url\('([^']+)'\)/)?.[1] ?? '';
const sansFirst = tw.match(/sans:\s*\['([^']+)'/)?.[1] ?? '';
const monoFirst = tw.match(/mono:\s*\['([^']+)'/)?.[1] ?? '';
const tokenName = token.match(/FONT_FAMILY = "'([^']+)'/)?.[1] ?? '';
const canvasName = token.match(/px \\"([^"]+)\\"/)?.[1] ?? token.match(/px "\+?([A-Za-z ]+)"/)?.[1] ?? '';

check(
  'the @font-face declares a family and a file',
  faceName !== '' && faceUrl !== '',
  `${faceName || '(none)'} ← ${faceUrl || '(none)'}`
);
check(
  'the Tailwind sans stack leads with the @font-face family',
  sansFirst === faceName && faceName !== '',
  `sans[0]=${sansFirst || '(none)'} vs face=${faceName || '(none)'}`
);
check(
  'the Tailwind mono stack leads with the same family',
  monoFirst === faceName && faceName !== '',
  `mono[0]=${monoFirst || '(none)'} vs face=${faceName || '(none)'}`
);
check(
  'the FONT_FAMILY token names the same family',
  tokenName === faceName && faceName !== '',
  `token=${tokenName || '(none)'} vs face=${faceName || '(none)'}`
);
check(
  'the canvas helper names the same family',
  canvasName === faceName && faceName !== '',
  `canvas=${canvasName || '(none)'} vs face=${faceName || '(none)'}`
);

// ---- 2. nothing spells the family by hand any more -------------------------

/*
  The token only helps if it is the single source. This walks src/ for any
  fontFamily / ctx.font literal that names a family directly, which is how the
  eight chart labels drifted from the @font-face in the first place. CodeRain
  is the one deliberate exception — the rain is an illustration of code and is
  drawn in a monospace stack on purpose.
*/
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

/*
  TWO EARLIER VERSIONS OF THIS SCAN PASSED ON THE DEFECT.

  The first opened on a quote and refused to cross one, so
  `fontFamily: "'SF Pro', sans-serif"` — a double-quoted literal wrapping a
  single-quoted family, the exact form all eight sites used — matched the empty
  string and never reached the generic keyword. The second stopped at a comma,
  in a font stack, which is a comma-separated list by definition.

  Both were found by putting the defect back and watching the guard stay green.
  A guard nobody has tried to break is a comment with a PASS next to it.
*/
const ALLOWED = ['src/components/ui/typeface.ts', 'src/pages/landing/CodeRain.tsx'];
const handSpelled: string[] = [];
for (const file of walk(path.join(ROOT, 'src'))) {
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  if (ALLOWED.includes(rel)) continue;
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(/(?:fontFamily\s*[:=]\s*\{?|ctx\.font\s*=\s*)([^\n]{0,90}?(?:sans-serif|monospace|serif))/g)) {
    handSpelled.push(`${rel}: ${m[1].replace(/\s+/g, ' ').slice(0, 46)}`);
  }
}
check(
  'no chart code spells the family by hand',
  handSpelled.length === 0,
  handSpelled.length ? handSpelled.join(' | ') : `${ALLOWED.length} allowed exceptions, no others`
);
// Guard the guard: the walk must actually be finding files.
check(
  'the source walk actually ran',
  walk(path.join(ROOT, 'src')).length > 100,
  `${walk(path.join(ROOT, 'src')).length} source files scanned`
);

// ---- 3. the file the @font-face points at is really there -------------------

const fontRel = path.join('public', faceUrl.replace(/^\//, ''));
check(
  'the font file the @font-face points at exists',
  faceUrl !== '' && existsSync(path.join(ROOT, fontRel)),
  `${fontRel}${existsSync(path.join(ROOT, fontRel)) ? '' : ' — MISSING'}`
);

const html = read('index.html');
check(
  'index.html preloads the file the @font-face loads',
  faceUrl !== '' && html.includes(`href="${faceUrl}"`),
  html.includes(`href="${faceUrl}"`) ? `preloads ${faceUrl}` : `preload does not name ${faceUrl}`
);

/*
  And every other asset index.html names has to be on disk too. A <link> to a
  file that is not there fails silently: no console error a user would see, no
  build failure, just the browser's default tab glyph — which is the state the
  page was in before it declared an icon at all.
*/
const declared = [...html.matchAll(/(?:href|content)="(\/[^"]+\.(?:svg|png|ico|webmanifest|woff2?))"/g)].map(m => m[1]);
const missingAssets = declared.filter(a => !existsSync(path.join(ROOT, 'public', a.replace(/^\//, ''))));
check(
  'every asset index.html declares exists in public/',
  declared.length > 0 && missingAssets.length === 0,
  declared.length === 0 ? 'no assets declared — did the head change?' : missingAssets.length ? `missing: ${missingAssets.join(', ')}` : `${declared.length} declared, all present`
);
check(
  'index.html declares a tab icon',
  /<link[^>]+rel="icon"/.test(html),
  /<link[^>]+rel="icon"/.test(html) ? 'rel="icon" present' : 'no icon declared — browsers will probe /favicon.ico'
);

// ---- 4. no font ships that we cannot serve ---------------------------------

/*
  Read the name table of every font in public/fonts and refuse a copyright we
  have no licence for. This is the assertion that would have caught the
  original: the file said "Apple Inc." in its own metadata the whole time.
*/
const FONT_DIR = path.join(ROOT, 'public/fonts');
const fontFiles = existsSync(FONT_DIR)
  ? readdirSync(FONT_DIR).filter(f => /\.(woff2?|ttf|otf)$/i.test(f))
  : [];

check(
  'there is a font to check',
  fontFiles.length > 0,
  `${fontFiles.length} font file(s) in public/fonts`
);

/*
  woff2 payloads are brotli-compressed, so the name table is not greppable in
  the raw bytes and decoding it here would mean vendoring a font parser. The
  filename is the part a reviewer sees and the part that gets copied around, so
  it is what this asserts — together with the OFL text that has to sit beside
  an OFL font anyway. The copyright inside the file was verified against
  fontTools when the swap was made; see src/index.css.
*/
const BANNED = /^(SF[-_ ]?Pro|SF[-_ ]?Mono|SF[-_ ]?Compact|New[-_ ]?York|Helvetica|Segoe|Roboto)/i;
const banned = fontFiles.filter(f => BANNED.test(f));
check(
  'no proprietary system font is vendored',
  banned.length === 0,
  banned.length ? `vendored: ${banned.join(', ')}` : `${fontFiles.join(', ')} — none matches a platform font`
);
check(
  'the OFL text ships beside the font',
  existsSync(path.join(FONT_DIR, 'Inter-LICENSE.txt')) &&
    /SIL Open Font License/i.test(read('public/fonts/Inter-LICENSE.txt')),
  existsSync(path.join(FONT_DIR, 'Inter-LICENSE.txt')) ? 'public/fonts/Inter-LICENSE.txt' : 'no licence file'
);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
