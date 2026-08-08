import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CSP,
  IMMUTABLE_CACHE,
  IMMUTABLE_PREFIX,
  SECURITY_HEADERS,
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
    const rule = ruleFor(`${IMMUTABLE_PREFIX}(.*)`);
    expect(rule, `expected a header rule for ${IMMUTABLE_PREFIX}(.*)`).toBeDefined();
    expect(asMap(rule)['Cache-Control']).toBe(IMMUTABLE_CACHE);
  });

  it('does not rewrite a missing asset to the app shell', () => {
    // The defect this guards: a deploy that shipped without its JS answered
    // /assets/index-a1b2.js with 200 and index.html, and the browser failed on
    // "Unexpected token '<'" — a parse error naming a file that parses fine.
    const rewrite = vercel.rewrites.find(r => r.destination === '/index.html');
    expect(rewrite?.source).toBe('/((?!assets/).*)');
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

  it('names one third party and no wildcards', () => {
    // Every allowed origin, spelled out. A `https:` anywhere in here would mean
    // any host on the internet, which is most of the way back to no policy.
    const origins = CSP.match(/https?:\/\/[^\s;]+/g) ?? [];
    expect([...new Set(origins)].sort()).toEqual([
      'https://fonts.googleapis.com',
      'https://fonts.gstatic.com',
    ]);
    expect(CSP).not.toMatch(/(^|[\s;])https:([\s;]|$)/);
    expect(CSP).not.toContain("'unsafe-eval'");
    expect(CSP).not.toContain('*');
  });

  it('still declares frame-ancestors alongside the legacy header', () => {
    expect(SECURITY_HEADERS['X-Frame-Options']).toBe('DENY');
    expect(CSP).toContain("frame-ancestors 'none'");
  });
});
