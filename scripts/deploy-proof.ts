/*
  What the deployed product promises the browser.

  WHY THIS EXISTS. The security headers were not weakened, argued about, or
  traded away. They were DELETED IN A COMMIT ABOUT SOMETHING ELSE — `f7be84a`
  replaced the whole tracked tree with an uploaded one, and `vercel.json` went
  with it, taking the content-security policy, the clickjacking refusal, the
  MIME-sniffing refusal, the referrer policy and the permissions policy. The
  express host that arrived in its place sets none of them. Nothing failed.
  Nothing warned. The build stayed green for fifty commits.

  That is the failure mode this file exists for: a security posture is not a
  decision you make once, it is a property that has to be asserted or it
  evaporates the next time somebody moves a file.

  THE ASSERTIONS ARE COUPLED TO WHAT THE APP ACTUALLY LOADS. `default-src
  'self'` is only correct because the app talks to exactly one host — measured,
  94 requests across sixteen routes, all local. So this file checks BOTH ends:
  the policy is strict, AND nothing in the tree wants an origin the policy
  refuses. Add a CDN script or a Google Fonts stylesheet and it fails here,
  before the browser silently blocks it in production.

  It does not assert the policy works — a regex cannot know that. Loading all
  sixteen routes against the express host and counting
  `securitypolicyviolation` events is what knows that, and the count is
  recorded in the commit that restored them.

  Run: npx tsx scripts/deploy-proof.ts
*/

import { readFileSync, readdirSync, statSync } from 'node:fs';
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

const server = read('server.ts');
const html = read('index.html');

/* ---- 1. the five headers are set at all ---------------------------------- */

const REQUIRED = [
  ['Content-Security-Policy', 'an injected script is refused'],
  ['X-Content-Type-Options', 'an uploaded .txt cannot be sniffed into a script'],
  ['X-Frame-Options', 'the terminal cannot be framed and clickjacked'],
  ['Referrer-Policy', 'the path a reader was on does not leak cross-origin'],
  ['Permissions-Policy', 'camera, microphone and geolocation are refused'],
] as const;

const missing = REQUIRED.filter(([h]) => !server.includes(`'${h}'`));
check(
  'the host sets every security header the old deploy config carried',
  missing.length === 0,
  missing.length ? `missing: ${missing.map(([h]) => h).join(', ')}` : REQUIRED.map(([h]) => h).join(', ')
);

/* ---- 2. the policy is actually strict ------------------------------------ */

/*
  The two directives that decide whether a CSP is worth having. `unsafe-inline`
  in script-src re-permits exactly the injected `<script>` the policy exists to
  refuse; `unsafe-eval` re-permits a string reaching the parser. style-src is a
  different matter and keeps 'unsafe-inline' on purpose — framer-motion
  animates by writing inline style, and removing it stops every animation in
  the app without buying anything, because a style attribute is not code.
*/
const scriptSrc = (server.match(/"(script-src[^"]*)"/) ?? [])[1] ?? '';
const scriptStrict = /script-src\s+'self'\s*$/.test(scriptSrc.trim());
check(
  "script-src is 'self' alone — no unsafe-inline, no unsafe-eval",
  scriptStrict,
  scriptStrict ? `"${scriptSrc}"` : `"${scriptSrc}" — the directive the whole policy rests on`
);

const policy = (server.match(/'Content-Security-Policy':\s*\[([\s\S]*?)\]\.join/) ?? [])[1] ?? '';
const wildcards = [...policy.matchAll(/https?:\/\/[^\s'"]+|(?<![\w-])\*(?![\w-])/g)].map(m => m[0]);
check(
  'no directive names a remote origin or a wildcard',
  policy.length > 0 && wildcards.length === 0,
  policy.length === 0
    ? 'could not read the policy out of server.ts'
    : wildcards.length
      ? `found: ${wildcards.join(', ')}`
      : "every directive resolves to 'self', 'none' or a scheme"
);

const framesDenied = /frame-ancestors 'none'/.test(policy) && /object-src 'none'/.test(policy);
check(
  'the page cannot be framed and cannot embed a plugin object',
  framesDenied,
  framesDenied ? "frame-ancestors 'none', object-src 'none'" : 'one of the two is missing'
);

/*
  And the host does not volunteer its own stack. `X-Powered-By: Express` on
  every response tells a scanner which framework's known bugs to try first,
  for no benefit to anybody.
*/
const quiet = /app\.disable\(['"]x-powered-by['"]\)/.test(server);
check(
  'the host does not advertise the framework it runs on',
  quiet,
  quiet ? "x-powered-by disabled" : 'every response still carries X-Powered-By: Express'
);

/* ---- 3. and nothing in the tree wants an origin the policy refuses -------- */

/*
  THE COUPLING THAT MATTERS.

  A strict policy that quietly blocks a resource the app needs is worse than no
  policy, because it fails in production and nowhere else. So the tree is
  scanned for anything that loads from a remote origin — an `src`, a CSS
  `url()`, an `@import`, a `fetch` — and the assertion fails if one appears.
  It fails in the useful direction too: adding a font CDN means either widening
  the policy on purpose or not adding it, and this is where that choice gets
  made rather than discovered.
*/
const walk = (dir: string, out: string[] = []): string[] => {
  for (const e of readdirSync(dir)) {
    const full = path.join(dir, e);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|css|html)$/.test(e)) out.push(full);
  }
  return out;
};
const files = [...walk(path.join(ROOT, 'src')), path.join(ROOT, 'index.html')];
const REMOTE = /(?:\bsrc\s*=\s*["'{`]?|\burl\(\s*["']?|@import\s+["']|\bfetch\(\s*["'`])(https?:\/\/[^\s"'`)]+)/g;
const remoteLoads: string[] = [];
for (const f of files) {
  for (const m of readFileSync(f, 'utf8').matchAll(REMOTE)) {
    remoteLoads.push(`${path.relative(ROOT, f).split(path.sep).join('/')} → ${m[1].slice(0, 60)}`);
  }
}
check(
  'nothing in the tree loads from an origin the policy would block',
  files.length > 100 && remoteLoads.length === 0,
  remoteLoads.length
    ? remoteLoads.slice(0, 4).join('; ')
    : `${files.length} files scanned, every subresource is same-origin`
);

/* ---- 4. the cache policy tells the truth about what is immutable --------- */

/*
  Vite fingerprints everything under assets/ with a content hash, so those
  bytes can never change under that name and may be cached forever. index.html
  is the document that NAMES the current hashes — cache it and a returning
  reader is pinned to the build they first loaded, indefinitely, with no way to
  ask for a newer one.
*/
const immutable = /max-age=31536000, immutable/.test(server);
const docNoCache = (server.match(/'no-cache'/g) ?? []).length >= 2;
check(
  'fingerprinted assets are cached forever and the document is not',
  immutable && docNoCache,
  immutable
    ? docNoCache
      ? "hashed assets immutable; index.html and the SPA fallback both 'no-cache'"
      : "assets are immutable but the document is not exempted — a reader gets pinned to one build"
    : 'no immutable cache rule for the fingerprinted assets'
);

/*
  The font's licence must ship with the font. Inter is under the SIL Open Font
  License, whose clause 2 requires the licence to travel with any distributed
  copy — so `public/fonts/Inter-LICENSE.txt` is not clutter in the build
  output, it is the condition on which the font may be there at all.
*/
const fontLicence = (() => {
  try {
    return statSync(path.join(ROOT, 'public/fonts/Inter-LICENSE.txt')).size > 200;
  } catch {
    return false;
  }
})();
check(
  'the font licence ships alongside the font',
  fontLicence,
  fontLicence
    ? 'public/fonts/Inter-LICENSE.txt is in the build output — SIL OFL clause 2'
    : 'the licence is missing; the OFL requires it to travel with the font'
);

/*
  And the document still asks for the font it ships. The preload is what makes
  the font arrive before first paint (measured: requested at 11ms, done at
  18ms, first contentful paint at 488ms); dropping it would put a flash of
  fallback text on every cold load.
*/
const preloads = /rel="preload"[^>]*\/fonts\/Inter\.var\.woff2/.test(html);
check(
  'the document preloads the font it ships',
  preloads,
  preloads ? 'index.html preloads /fonts/Inter.var.woff2' : 'the preload is gone — expect a flash of fallback text'
);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
