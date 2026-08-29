/*
  Acceptance test for the backend feed layer — the vault, the REST cache and
  the fan-out hub. These are the three pieces every vendor task plugs into,
  and all three fail EXPENSIVELY and QUIETLY: a leaked key costs money, a
  stampeding cache costs rate limit, a leaking hub costs connections and
  looks fine until the afternoon.

  None of it needs a vendor. The upstream is staged, the clock is injected,
  and every property below is exact rather than statistical.

  Proves:
  1. Single flight: 100 SIMULTANEOUS readers of a cold key produce exactly
     ONE upstream call — the burst a TTL alone cannot absorb
  2. TTL: served inside the window, re-fetched after it, and a `ttl <= 0`
     read never serves a stale value while STILL coalescing its burst
  3. A failed load is not cached, every waiter on that flight sees the
     failure, and the next caller gets a real retry
  4. The hub opens ONE upstream for N browsers, fans every message to all of
     them, and closes upstream only when the LAST one leaves — by clean
     unsubscribe or by a dropped client
  5. A throwing client cannot starve the others
  6. The vault refuses a VITE_-prefixed key (which Vite would inline into the
     browser bundle), reports missing vendors by name, and redacts every held
     secret out of anything client-bound — including inside error messages,
     nested bodies and object KEYS
*/
import { RestCache } from '../server/feed/cache';
import { FeedHub, type HubClient } from '../server/feed/hub';
import { BundledKeyError, readVault, redact, secretFor, REDACTED } from '../server/feed/vault';
import type { FeedMessage, FeedSource, FeedTopic } from '../server/feed/types';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

// ── 1+2. the cache: single flight and TTL ─────────────────────────────────
{
  let clock = 1_000_000;
  const cache = new RestCache(() => clock);
  let calls = 0;
  const loader = async () => {
    calls++;
    await new Promise(r => setTimeout(r, 5)); // a real upstream is not instant
    return { spot: 500 + calls };
  };

  /* THE BURST: a hundred callers in the same frame, before any resolves. */
  const first = await Promise.all(Array.from({ length: 100 }, () => cache.get('chain:SPY', 5_000, loader)));
  check('100 simultaneous readers of a cold key make ONE upstream call', calls === 1, `${calls} calls`);
  check('and every one of them gets the same answer', new Set(first.map(f => f.spot)).size === 1, `${new Set(first.map(f => f.spot)).size} distinct`);
  const st = cache.readStats();
  check('the burst is counted as coalesced, not as hits', st.coalesced === 99 && st.loads === 1, `coalesced ${st.coalesced}, loads ${st.loads}`);

  /* Inside the window: served, no new call. */
  clock += 4_999;
  await cache.get('chain:SPY', 5_000, loader);
  check('inside the TTL the stored answer is served', calls === 1, `${calls} calls`);

  /* Past it: a real re-fetch, not a stale serve. */
  clock += 2;
  const after = await cache.get('chain:SPY', 5_000, loader);
  check('past the TTL it re-fetches rather than serving stale', calls === 2 && after.spot === 502, `${calls} calls, spot ${after.spot}`);

  /* ttl <= 0: never stored, but the stampede is still absorbed. */
  let liveCalls = 0;
  const live = async () => { liveCalls++; await new Promise(r => setTimeout(r, 5)); return { bid: 1 }; };
  await Promise.all(Array.from({ length: 25 }, () => cache.get('quote:SPY', 0, live)));
  await cache.get('quote:SPY', 0, live);
  check('a ttl of 0 coalesces its burst but never serves a stored value', liveCalls === 2, `${liveCalls} calls (1 for the burst, 1 for the later read)`);
}

// ── 3. a failure is not an answer ─────────────────────────────────────────
{
  const cache = new RestCache();
  let attempts = 0;
  const flaky = async () => {
    attempts++;
    await new Promise(r => setTimeout(r, 2));
    if (attempts === 1) throw new Error('upstream 503');
    return { ok: true };
  };

  const results = await Promise.allSettled(Array.from({ length: 10 }, () => cache.get('k', 60_000, flaky)));
  check('every waiter on a failed flight sees the failure', results.every(r => r.status === 'rejected'), `${results.filter(r => r.status === 'rejected').length}/10 rejected`);
  check('— and it was still only ONE upstream attempt', attempts === 1, `${attempts}`);
  /* Read defensively: a cache that DID store the failure hands back
     undefined here, and a proof that dies on that loses every assertion
     after it — the mutation is caught either way, but only one of the two
     says what broke. */
  const retry = await cache.get('k', 60_000, flaky).catch(() => null);
  check('the failure was not cached: the next caller gets a real retry', retry?.ok === true && attempts === 2, `got ${JSON.stringify(retry)} after ${attempts} attempts`);
  check('and the error was counted', cache.readStats().errors === 1);
}

// ── 4+5. the hub ──────────────────────────────────────────────────────────
{
  /* A staged upstream that counts its own subscriptions — the whole point
     of the hub is that this number stays at 1. */
  let opens = 0, closes = 0;
  const emitters = new Map<string, (m: FeedMessage) => void>();
  const source: FeedSource = {
    vendor: 'sim',
    rest: async () => ({}) as never,
    subscribe: (topic, onMessage) => {
      opens++;
      const key = `${topic.channel}:${topic.symbol ?? '*'}`;
      emitters.set(key, onMessage);
      return () => { closes++; emitters.delete(key); };
    },
  };
  const hub = new FeedHub(source);
  const topic: FeedTopic = { channel: 'optionTrades', symbol: 'SPY' };
  const got: Record<string, number> = { a: 0, b: 0, c: 0 };
  const client = (id: string): HubClient => ({ id, send: () => { got[id]++; } });

  hub.subscribe(client('a'), topic);
  hub.subscribe(client('b'), topic);
  hub.subscribe(client('c'), topic);
  check('three browsers on one topic open ONE upstream subscription', opens === 1, `${opens} opens`);
  check('and the hub knows all three are watching', hub.subscriberCount(topic) === 3);

  emitters.get('optionTrades:SPY')!({ topic, at: 1, payload: { premium: 1e6 } });
  check('one upstream message reaches every browser', got.a === 1 && got.b === 1 && got.c === 1, JSON.stringify(got));
  check('the fan-out ratio is recorded', hub.readStats().received === 1 && hub.readStats().delivered === 3);

  /* Idempotence: a component that mounts twice must not double-count. */
  hub.subscribe(client('a'), topic);
  check('re-subscribing the same browser does not double-count it', hub.subscriberCount(topic) === 3 && opens === 1);

  hub.unsubscribe('a', topic);
  hub.unsubscribe('b', topic);
  check('upstream stays open while anyone is still watching', closes === 0 && hub.openTopics === 1, `${closes} closes`);
  hub.unsubscribe('c', topic);
  check('the LAST browser to leave closes it upstream', closes === 1 && hub.openTopics === 0);

  /* A dropped client — the common case, since browsers vanish silently. */
  hub.subscribe(client('a'), topic);
  hub.subscribe(client('b'), { channel: 'gex', symbol: 'SPY' });
  check('PREMISE: two topics open for one browser plus another', hub.openTopics === 2, `${hub.openTopics}`);
  hub.removeClient('a');
  check('dropping a browser releases every topic it held', hub.openTopics === 1 && hub.subscriberCount(topic) === 0);
  hub.removeClient('b');
  check('and the desk ends with nothing open upstream', hub.openTopics === 0, `${hub.openTopics} left`);

  /* One bad browser must not starve the rest. */
  const hub2 = new FeedHub(source);
  let good = 0;
  hub2.subscribe({ id: 'bad', send: () => { throw new Error('socket gone'); } }, topic);
  hub2.subscribe({ id: 'good', send: () => { good++; } }, topic);
  emitters.get('optionTrades:SPY')!({ topic, at: 2, payload: {} });
  check('a throwing browser does not stop the others being fed', good === 1, `good got ${good}`);
  check('and the bad one is counted rather than hidden', hub2.readStats().clientErrors === 1);
}

// ── 6. the vault ──────────────────────────────────────────────────────────
{
  const SECRET = 'mk_live_9f3a2b7c8d1e4f5a6b7c8d9e';
  const UWSEC = 'uw_tok_1122334455667788990011';

  const vault = readVault({ MASSIVE_API_KEY: SECRET, UW_API_TOKEN: UWSEC });
  check('both keys read from the process environment', secretFor(vault, 'massive') === SECRET && secretFor(vault, 'uw') === UWSEC);
  check('and the configured vendors are named', vault.configured.join(',') === 'massive,uw', vault.configured.join(','));

  const partial = readVault({ MASSIVE_API_KEY: SECRET });
  check('a missing key is a NAMED state, not a crash', partial.configured.join() === 'massive' && partial.missing.join() === 'uw', `missing ${partial.missing.join()}`);
  const blank = readVault({ MASSIVE_API_KEY: '   ' });
  check('whitespace is not a credential', blank.missing.includes('massive'));

  /* Rule 1 — the leak that ships a key to every visitor. */
  let threw = false;
  try { readVault({ VITE_MASSIVE_API_KEY: SECRET }); } catch (e) { threw = e instanceof BundledKeyError; }
  check('a VITE_-prefixed key is refused — Vite would inline it', threw);
  let threw2 = false;
  try { readVault({ MASSIVE_API_KEY: SECRET, VITE_UW_TOKEN: UWSEC }); } catch (e) { threw2 = e instanceof BundledKeyError; }
  check('— even when a correctly-named key is also present', threw2);

  /* Rule 2 — nothing client-bound goes out unscanned. */
  const leaky = {
    url: `https://api.example.com/v1/chain?apiKey=${SECRET}`,
    nested: { list: [{ note: `token ${UWSEC} rejected` }] },
    [`header-${SECRET}`]: 'echoed back as a KEY',
    fine: 'spot 500.25',
  };
  const clean = redact(leaky, vault);
  const asText = JSON.stringify(clean);
  check('a secret inside a URL is scrubbed', !asText.includes(SECRET), clean.url);
  check('a secret nested in an array of objects is scrubbed', !asText.includes(UWSEC));
  check('a secret used as an object KEY is scrubbed', Object.keys(clean).some(k => k.includes(REDACTED)));
  check('and the innocent fields survive untouched', clean.fine === 'spot 500.25');

  const err = redact(new Error(`GET /v1?apiKey=${SECRET} failed: 401`), vault);
  check('a secret echoed inside an upstream Error message is scrubbed', !err.message.includes(SECRET) && err.message.includes(REDACTED), err.message);

  /* A vault with no keys must not "redact" everything into markers. */
  const empty = readVault({});
  check('with no keys configured, payloads pass through unchanged', redact({ a: 'hello' }, empty).a === 'hello');
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
