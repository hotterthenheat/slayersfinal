import type { FeedVendor } from './types';

/*
==================================================
  SLAYER TERMINAL - THE KEY VAULT (server/feed/vault.ts)

  Both keys live here. Neither one ever reaches a
  browser.
==================================================

  THE FAILURE THIS PREVENTS is not exotic: a key pasted into a `.env` that
  Vite inlines, or echoed back inside an upstream error body that a route
  forwards verbatim. Both ship a paid credential to every visitor, and
  neither looks like a bug in review — the first is one `VITE_` prefix, the
  second is one `res.json(err)`.

  SO THERE ARE THREE RULES, and all three are proven:

  1. KEYS COME FROM THE PROCESS, never from a bundled file, and never from a
     name Vite would inline. Vite exposes `import.meta.env` entries prefixed
     `VITE_`; a key named that way is a key in the JavaScript. `readVault`
     REFUSES to read one and says why, rather than quietly working in dev and
     leaking in production.

  2. NOTHING CLIENT-BOUND IS SENT UNSCANNED. `redact` walks a payload and
     replaces any occurrence of any held secret with a marker. It is applied
     at the edge, so an upstream error that happens to echo the key back
     cannot pass through.

  3. A MISSING KEY IS A NAMED STATE, not a crash and not a silent skip. A
     desk running with Massive configured and UW absent should say exactly
     that — the product already has a provenance vocabulary for "this number
     has no source", and the vault reports in the same terms.

  WHY REDACTION IS SUBSTRING, NOT EQUALITY. The leak that matters is a key
  INSIDE something else — a URL in an error message, a header echoed in a
  debug body. Comparing whole values would pass every one of those.
*/

/** How a vendor's credential is configured. */
export interface VaultKey {
  vendor: FeedVendor;
  /** The environment variable read. Never `VITE_*` — see rule 1. */
  envName: string;
  /** Present only when configured. */
  secret?: string;
}

export interface Vault {
  keys: VaultKey[];
  /** Vendors with a usable credential right now. */
  configured: FeedVendor[];
  /** Vendors whose key is absent — the honest "no source" list. */
  missing: FeedVendor[];
}

/** The one marker a reader sees where a secret was. */
export const REDACTED = '[redacted]';

const ENV_NAMES: Record<Exclude<FeedVendor, 'sim'>, string> = {
  massive: 'MASSIVE_API_KEY',
  uw: 'UW_API_TOKEN',
};

/**
 * Thrown rather than tolerated: a credential under a `VITE_` name is a
 * credential in the browser bundle, and a vault that shrugged at it would be
 * a vault that lies.
 */
export class BundledKeyError extends Error {
  constructor(names: string[]) {
    super(
      `Refusing to start: ${names.join(', ')} ${names.length === 1 ? 'is' : 'are'} prefixed VITE_, ` +
        `which Vite inlines into the browser bundle. Rename to ${Object.values(ENV_NAMES).join(' / ')} ` +
        `and keep them server-side only.`
    );
    this.name = 'BundledKeyError';
  }
}

/**
 * Read both keys from the process environment.
 *
 * @param env injected so the proof can stage environments without touching
 *            the real process — the same reason every engine in this
 *            codebase takes its clock as an argument.
 */
export function readVault(env: Record<string, string | undefined> = process.env): Vault {
  /* Rule 1, checked first: any VITE_-prefixed spelling of either key is a
     hard stop, whether or not the correct one is also set. */
  const bundled = Object.keys(env).filter(
    n => n.startsWith('VITE_') && /(MASSIVE|UW|POLYGON|UNUSUAL)/i.test(n) && /(KEY|TOKEN|SECRET)/i.test(n)
  );
  if (bundled.length > 0) throw new BundledKeyError(bundled.sort());

  const keys: VaultKey[] = (Object.keys(ENV_NAMES) as Exclude<FeedVendor, 'sim'>[]).map(vendor => {
    const envName = ENV_NAMES[vendor];
    const raw = env[envName]?.trim();
    return { vendor, envName, secret: raw ? raw : undefined };
  });

  return {
    keys,
    configured: keys.filter(k => k.secret).map(k => k.vendor),
    missing: keys.filter(k => !k.secret).map(k => k.vendor),
  };
}

/** The secret for a vendor, or null when that key is not configured. */
export function secretFor(vault: Vault, vendor: FeedVendor): string | null {
  return vault.keys.find(k => k.vendor === vendor)?.secret ?? null;
}

/**
 * Scrub every held secret out of anything on its way to a browser.
 *
 * Walks strings, arrays, plain objects and Error messages — and object KEYS
 * as well as values, because an upstream that returns `{ "<key>": "quota" }`
 * leaks just as completely as one that returns it as a value.
 */
export function redact<T>(value: T, vault: Vault): T {
  const secrets = vault.keys.map(k => k.secret).filter((s): s is string => !!s && s.length >= 8);
  if (secrets.length === 0) return value;

  const scrubString = (s: string): string => {
    let out = s;
    for (const secret of secrets) out = out.split(secret).join(REDACTED);
    return out;
  };

  const walk = (v: unknown, depth: number): unknown => {
    /* Bounded: a cyclic or absurdly deep upstream body must not hang the
       edge. Past the bound the value is dropped rather than passed
       unscanned — an unscanned value is the one thing this must never do. */
    if (depth > 12) return REDACTED;
    if (typeof v === 'string') return scrubString(v);
    if (v === null || typeof v !== 'object') return v;
    if (v instanceof Error) {
      const e = new Error(scrubString(v.message));
      e.name = v.name;
      return e;
    }
    if (Array.isArray(v)) return v.map(x => walk(x, depth + 1));
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[scrubString(k)] = walk(val, depth + 1);
    }
    return out;
  };

  return walk(value, 0) as T;
}
