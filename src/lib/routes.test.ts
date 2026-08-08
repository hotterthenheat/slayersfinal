import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NAV_ITEMS, REFERENCE_ITEMS } from '../components/layout/nav';

/*
==================================================
  SLAYER TERMINAL - INTERNAL LINK TARGETS (lib/routes.test.ts)
  Every internal link in the app resolves to a route the router declares.

  There was no check for this, and two links were already broken. The trailer's
  "Open desk" button and the convergence board both pointed at `/news`, a desk
  that was folded into the Stocks sleeves — so the one button whose entire job
  is "go see the real thing" landed on the not-found page. It had a test, too:
  `storyClock.test.ts` has a case called "keeps every Open desk target a real
  route", and what it asserted was that the string starts with a slash. The
  title was right and the assertion was checking spelling.

  A dead internal link is invisible to every other gate here. TypeScript sees a
  string, the router renders NotFound rather than throwing, and the UI audit
  sweeps a fixed route list rather than following links out of pages. It only
  shows up when someone clicks it.

  So the route table is read from App.tsx — the router IS the truth, and any
  second list would be one more thing to forget — and every literal link target
  in src/ is resolved against it.
==================================================
*/

const SRC = join(process.cwd(), 'src');

const walk = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
};

const FILES = walk(SRC).map(path => ({ path, rel: relative(process.cwd(), path), text: readFileSync(path, 'utf8') }));

// ---- the route table, read out of the router ---------------------------------

/**
 * Paths declared by `<Route>` in App.tsx, resolved through nesting.
 *
 * Written as a character scan rather than a regex because an opening tag can
 * carry JSX in its props — `element={<Suspense fallback={<RouteFallback />}>…}`
 * contains both `>` and `/>` that belong to other elements. Brace depth is what
 * separates the tag's own delimiters from its children's.
 */
function declaredRoutes(): Set<string> {
  const src = readFileSync(join(SRC, 'App.tsx'), 'utf8').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
  const found = new Set<string>();
  const stack: string[] = [];

  const join2 = (prefix: string, path: string) =>
    path.startsWith('/') ? path : `${prefix === '/' ? '' : prefix}/${path}`;

  for (let i = 0; i < src.length; i++) {
    if (src.startsWith('</Route>', i)) {
      stack.pop();
      i += 7;
      continue;
    }
    if (!src.startsWith('<Route', i)) continue;

    let depth = 0;
    let j = i + 6;
    let selfClosing = false;
    for (; j < src.length; j++) {
      const c = src[j];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (depth === 0 && c === '/' && src[j + 1] === '>') {
        selfClosing = true;
        break;
      } else if (depth === 0 && c === '>') break;
    }

    // Drop brace-balanced prop values before looking for `path`, so a `path`
    // appearing inside an `element={…}` cannot be mistaken for this route's.
    let tag = '';
    let d = 0;
    for (let k = i; k < j; k++) {
      const c = src[k];
      if (c === '{') d++;
      else if (c === '}') d--;
      else if (d === 0) tag += c;
    }

    const m = /\bpath="([^"]*)"/.exec(tag);
    const prefix = stack.length ? stack[stack.length - 1] : '';
    if (m) {
      const full = join2(prefix, m[1]);
      found.add(full);
      if (!selfClosing) stack.push(full);
    } else if (!selfClosing) {
      // A layout `<Route element={<AppShell />}>` adds nesting but no segment.
      stack.push(prefix);
    }
    i = selfClosing ? j + 1 : j;
  }
  return found;
}

const ROUTES = declaredRoutes();

/**
 * Wildcard routes match by prefix — `/flow-desk/*` covers `/flow-desk/anything`.
 *
 * The bare `*` catch-all is excluded, and that exclusion is the whole test.
 * It resolves to prefix `''`, which every path starts with, so leaving it in
 * made `resolves()` return true for literally any string: this file passed
 * clean on its first run while the two `/news` links it was written to catch
 * sat right there in the tree. The catch-all renders NotFound — landing on it
 * is the failure being looked for, not a way of satisfying it.
 */
const PREFIXES = [...ROUTES]
  .filter(r => r.endsWith('/*'))
  .map(r => r.slice(0, -2))
  .filter(Boolean);

function resolves(target: string): boolean {
  const path = target.split(/[?#]/)[0].replace(/\/$/, '') || '/';
  if (ROUTES.has(path)) return true;
  // An index route makes the parent addressable even with no `path` of its own.
  return PREFIXES.some(p => path === p || path.startsWith(`${p}/`));
}

// ---- link targets, read out of every component -------------------------------

/**
 * Literal internal destinations. Deliberately only the forms that actually
 * navigate — `to`, `href` and `navigate(…)` — so this stays a link check and
 * does not start policing every string in the tree that begins with a slash.
 */
function linkTargets(text: string): string[] {
  const out: string[] = [];
  const patterns = [
    /\bto=\{?["'`](\/[^"'`{}]*)["'`]/g,
    /\bto:\s*["'`](\/[^"'`{}]*)["'`]/g,
    /\broute:\s*["'`](\/[^"'`{}]*)["'`]/g,
    /\bhref=\{?["'`](\/[^"'`{}]*)["'`]/g,
    /\bnavigate\(\s*["'`](\/[^"'`{}]*)["'`]/g,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) out.push(m[1]);
  }
  return out;
}

describe('the router', () => {
  it('parses out of App.tsx', () => {
    // Anchors for the parser itself. If the scan silently returned nothing, or
    // stopped resolving nesting, every other case here would pass vacuously.
    expect(ROUTES.has('/')).toBe(true);
    expect(ROUTES.has('/compass')).toBe(true);
    expect(ROUTES.has('/pinpoint/gamma')).toBe(true);
    expect(ROUTES.has('/trace/live-tape')).toBe(true);
    expect(ROUTES.has('/guide/faq')).toBe(true);
    expect(ROUTES.has('/community/ideas')).toBe(true);
    expect(ROUTES.has('/legal/privacy')).toBe(true);
    expect(ROUTES.size).toBeGreaterThan(40);
  });

  it('declares a route for every nav destination', () => {
    for (const item of [...NAV_ITEMS, ...REFERENCE_ITEMS]) {
      expect(resolves(item.path), `nav item ${item.label} → ${item.path}`).toBe(true);
    }
  });
});

describe('internal links', () => {
  it('all resolve to a declared route', () => {
    const dead: string[] = [];
    for (const f of FILES) {
      for (const target of linkTargets(f.text)) {
        if (!resolves(target)) dead.push(`${f.rel} → ${target}`);
      }
    }
    expect(
      [...new Set(dead)].sort(),
      `These navigate to a path App.tsx does not declare, so they land on the ` +
        `not-found page. Repoint them, or add the route.`,
    ).toEqual([]);
  });
});
