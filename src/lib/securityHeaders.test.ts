import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CSP,
  IMMUTABLE_CACHE,
  IMMUTABLE_PREFIX,
  SECURITY_HEADERS,
  isImmutable,
} from './securityHeaders';

/*
==================================================
  SLAYER TERMINAL - HEADER PARITY (lib/securityHeaders.test.ts)
  vercel.json says what server.ts says.

  server.ts imports the policy. vercel.json cannot import anything, so without
  this the two are hand-kept copies — and the one that gets reviewed in a diff
  is not necessarily the one in front of readers. A CSP that is right locally
  and absent in production is worse than no CSP, because it is believed.
==================================================
*/

type VercelHeader = { key: string; value: string };
type VercelRule = { source: string; headers: VercelHeader[] };

const vercel = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8')) as {
  rewrites: { source: string; destination: string }[];
  headers: VercelRule[];
};

const ruleFor = (source: string) => vercel.headers.find(h => h.source === source);
const asMap = (rule?: VercelRule) =>
  Object.fromEntries((rule?.headers ?? []).map(h => [h.key, h.value]));

describe('vercel.json header parity', () => {
  it('sends every security header on every response', () => {
    expect(asMap(ruleFor('/(.*)'))).toEqual(SECURITY_HEADERS);
  });

  it('caches the fingerprinted assets and nothing else', () => {
    const rule = vercel.headers.find(h => h.source.startsWith(IMMUTABLE_PREFIX));
    expect(rule, `expected a header rule under ${IMMUTABLE_PREFIX}`).toBeDefined();
    expect(asMap(rule)['Cache-Control']).toBe(IMMUTABLE_CACHE);
    // The rule must test for a content hash, not merely the directory — see
    // the isImmutable cases below for why that distinction is the whole point.
    expect(rule!.source).toMatch(/A-Za-z0-9/);
  });
});

describe('immutable caching applies only to content-addressed names', () => {
  /*
    This is the bug it exists to stop, and it shipped: the rule used to be the
    bare prefix /assets/, and Vite copies public/assets/* into dist/assets/
    unchanged. So twenty hand-authored files — og-cover.png, the social preview
    named twice in index.html — were served `immutable` for a year under names
    that never change. Republishing one would have reached nobody, and no deploy
    could undo it, because `immutable` suppresses revalidation even on reload.
  */
  it('marks Vite output immutable', () => {
    for (const p of [
      '/assets/charts-CJ9089NK.js',
      '/assets/index-CMPFMQfE.js',
      '/assets/ProveIt-C6bxuxuX.js',
      '/assets/index-BIotnoFC.css',
    ]) {
      expect(isImmutable(p), `${p} is content-addressed and should be immutable`).toBe(true);
    }
  });

  it('does NOT mark hand-authored public/assets files immutable', () => {
    for (const p of [
      '/assets/og-cover.png',
      '/assets/auditor-ledger.png',
      '/assets/gex-profile.png',
      '/assets/options-tape.png',
      '/assets/vanna-matrix.png',
      '/assets/media__1782853419089.png',
    ]) {
      expect(isImmutable(p), `${p} has a stable name and must stay revalidated`).toBe(false);
    }
  });

  it('never marks anything outside /assets/ immutable', () => {
    for (const p of ['/', '/index.html', '/favicon.svg', '/robots.txt', '/site.webmanifest']) {
      expect(isImmutable(p)).toBe(false);
    }
  });

  it('does not rewrite a missing static file to the app shell', () => {
    /*
      The defect this guards: a deploy that shipped without its JS answered
      /assets/index-a1b2.js with 200 and index.html, and the browser failed on
      "Unexpected token '<'" — a parse error naming a file that parses fine.

      Read off `public/` rather than pinned to a literal, because the literal
      was the actual failure mode. It said `/((?!assets/).*)` and passed for
      months; then `public/fonts/` and `public/logos/` were added — the one
      self-hosted family, and the brand marks CompanyLogo asks for by ticker —
      and a pinned string has nothing to say about a directory that did not
      exist when it was written. A missing font would have come back 200 with
      the HTML shell, which is the same silent-wrong-content bug in a new
      folder.

      So: every directory that actually ships under public/ must be excluded.
      Adding one and forgetting the rewrite fails here.
    */
    const shipped = readdirSync(join(process.cwd(), 'public'), { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name);
    expect(shipped.length, 'public/ has no directories — re-point this test').toBeGreaterThan(0);

    const rewrite = vercel.rewrites.find(r => r.destination === '/index.html');
    expect(rewrite, 'the SPA rewrite is gone').toBeTruthy();

    // The rewrite is what SENDS the shell. A path it still matches is a path
    // that gets HTML instead of a 404, so this asks the pattern itself rather
    // than reading its source text.
    const source = new RegExp(`^${rewrite!.source}$`);
    for (const dir of shipped) {
      expect(
        source.test(`/${dir}/missing-file.xyz`),
        `a miss under public/${dir}/ is rewritten to the app shell — it must 404`
      ).toBe(false);
    }
    // ...and a real client route still reaches the shell, or the exclusion has
    // swallowed the app.
    expect(source.test('/compass')).toBe(true);
    expect(source.test('/pinpoint/gamma')).toBe(true);
  });
});

describe('the content security policy', () => {
  const directive = (name: string) =>
    CSP.split('; ')
      .find(d => d.startsWith(`${name} `))
      ?.slice(name.length + 1)
      .split(' ') ?? [];

  it('keeps script-src free of the escapes that make a CSP decorative', () => {
    // style-src cannot avoid 'unsafe-inline' — framer-motion, recharts and
    // lightweight-charts animate by writing element.style. script-src can, and
    // it is the directive that actually stops injected script, so it is the one
    // held to the line. The font stylesheet's onload attribute moved into
    // main.tsx to keep this true.
    expect(directive('script-src')).toEqual(["'self'"]);
  });

  it('closes the directives default-src does not cover', () => {
    // base-uri and form-action do NOT fall back to default-src. Left unset, an
    // injected <base> can repoint every relative URL on the page.
    expect(directive('base-uri')).toEqual(["'self'"]);
    expect(directive('form-action')).toEqual(["'self'"]);
    expect(directive('frame-ancestors')).toEqual(["'none'"]);
    expect(directive('object-src')).toEqual(["'none'"]);
  });

  it('names no third party at all, and no wildcards', () => {
    /*
      Every allowed origin, spelled out. A `https:` anywhere in here would mean
      any host on the internet, which is most of the way back to no policy.

      The list is EMPTY now. It used to carry fonts.googleapis.com and
      fonts.gstatic.com for a two-family webfont stylesheet; the family is one
      self-hosted file under public/fonts, so the page reaches no third party for
      anything. Anything that turns up here is a new third-party dependency and wants a
      deliberate decision, not a passing edit.
    */
    const origins = CSP.match(/https?:\/\/[^\s;]+/g) ?? [];
    expect([...new Set(origins)].sort()).toEqual([]);
    expect(CSP).not.toMatch(/(^|[\s;])https:([\s;]|$)/);
    expect(CSP).not.toContain("'unsafe-eval'");
    expect(CSP).not.toContain('*');
  });

  it('still declares frame-ancestors alongside the legacy header', () => {
    expect(SECURITY_HEADERS['X-Frame-Options']).toBe('DENY');
    expect(CSP).toContain("frame-ancestors 'none'");
  });
});
