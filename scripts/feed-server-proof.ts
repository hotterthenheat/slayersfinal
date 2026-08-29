/*
  Acceptance test for the SERVER end of the feed layer: the proxy route and
  the browser socket, over real HTTP and a real WebSocket.

  The unit proof (feed-layer-proof.ts) pins the vault, cache and hub in
  isolation. This one pins the wiring — the part where a correct library gets
  mounted wrongly and nobody notices until a key is in play. The upstream is
  staged (an injected fetch), so none of it needs a vendor.

  Proves:
  1. The browser's request reaches the vendor WITH the key attached, and the
     key is NEVER in what comes back
  2. An upstream error that echoes the key back is scrubbed before it is
     forwarded — the leak the vault exists to stop, on the path that actually
     leaks
  3. The allowlist refuses an unknown path BEFORE any credential is touched,
     so this cannot be used as an open proxy
  4. A vendor with no credential is a 503 that NAMES it — never an empty 200
     a widget would render as zero
  5. Two browsers asking at once are ONE upstream call, through the route
  6. health reports demo vs live honestly
  7. Over a real socket: sub → messages flow; two browsers on one topic are
     ONE upstream subscription; unsub and disconnect both release it
  8. A malformed frame is answered, not punished with a disconnect
*/
import express from 'express';
import http from 'node:http';
import { WebSocket } from 'ws';
import { createFeedRouter, type VendorTransport } from '../server/feed/router';
import { RestCache } from '../server/feed/cache';
import { FeedHub } from '../server/feed/hub';
import { attachFeedSocket } from '../server/feed/wsServer';
import { readVault } from '../server/feed/vault';
import type { FeedMessage, FeedSource, FeedTopic } from '../server/feed/types';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

const SECRET = 'mk_live_aa11bb22cc33dd44ee55ff66';
const vault = readVault({ MASSIVE_API_KEY: SECRET });

// ── the staged upstream ───────────────────────────────────────────────────
let upstreamCalls = 0;
let lastUrl = '';
let lastAuthHeader = '';
let nextFailsEchoingKey = false;

const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
  upstreamCalls++;
  lastUrl = String(url);
  lastAuthHeader = ((init?.headers ?? {}) as Record<string, string>)['Authorization'] ?? '';
  await wait(5);
  if (nextFailsEchoingKey) {
    /* Exactly what a real 401 body looks like: it hands the key back. */
    return new Response(`{"error":"invalid token ${SECRET}"}`, { status: 401 });
  }
  return new Response(JSON.stringify({ spot: 500.25, echoedKey: SECRET }), {
    status: 200, headers: { 'content-type': 'application/json' },
  });
}) as unknown as typeof fetch;

const transports: Record<string, VendorTransport> = {
  massive: {
    baseUrl: 'https://staged.example/v3',
    allow: ['/snapshot', '/chain'],
    auth: s => ({ headers: { Authorization: `Bearer ${s}` } }),
  },
};

// ── a staged streaming source, so the socket half needs no vendor ─────────
let opens = 0, closes = 0;
const emitters = new Map<string, (m: FeedMessage) => void>();
const source: FeedSource = {
  vendor: 'sim',
  rest: async () => ({}) as never,
  subscribe: (topic, onMessage) => {
    opens++;
    emitters.set(`${topic.channel}:${topic.symbol ?? '*'}`, onMessage);
    return () => { closes++; emitters.delete(`${topic.channel}:${topic.symbol ?? '*'}`); };
  },
};

const app = express();
const cache = new RestCache();
app.use('/api/feed', createFeedRouter({ vault, cache, transports, sim: source, fetchImpl }));
const server = http.createServer(app);
const hub = new FeedHub(source);
const ws = attachFeedSocket(server, hub);
await new Promise<void>(r => server.listen(0, r));
const port = (server.address() as { port: number }).port;
const BASE = `http://127.0.0.1:${port}`;

// ── 1+2. the key goes out, and never comes back ───────────────────────────
{
  const r = await fetch(`${BASE}/api/feed/massive/snapshot/SPY`);
  const body = await r.text();
  check('the proxy reaches the vendor with the key attached', lastAuthHeader === `Bearer ${SECRET}`, lastAuthHeader.slice(0, 24) + '…');
  check('the browser gets the answer', r.status === 200 && JSON.parse(body).spot === 500.25);
  check('and the key the vendor echoed back is SCRUBBED', !body.includes(SECRET), body.slice(0, 90));

  nextFailsEchoingKey = true;
  const bad = await fetch(`${BASE}/api/feed/massive/snapshot/QQQ`);
  const badBody = await bad.text();
  nextFailsEchoingKey = false;
  check('an upstream 401 is forwarded as 502, not as a fake success', bad.status === 502);
  check('— and the key inside that error body is scrubbed too', !badBody.includes(SECRET), badBody.slice(0, 110));
}

// ── 3+4. the allowlist and the missing credential ─────────────────────────
{
  /* A traversal path is the wrong probe here: fetch NORMALISES `../..`
     before it leaves the client, so the server sees a different path
     entirely and answers 404 — which would pass a sloppy assertion for the
     wrong reason. The real question is whether a well-formed path that is
     simply not on the list gets refused. */
  const before = upstreamCalls;
  const r = await fetch(`${BASE}/api/feed/massive/admin/keys`);
  check('a well-formed path off the allowlist is refused', r.status === 403, `${r.status}`);
  check('— and refused WITHOUT calling upstream', upstreamCalls === before, `${upstreamCalls - before} calls made`);

  const uw = await fetch(`${BASE}/api/feed/uw/anything`);
  const uwBody = await uw.json();
  check('an unconfigured vendor is a 503 that NAMES it', uw.status === 503 && uwBody.vendor === 'uw', JSON.stringify(uwBody).slice(0, 80));
}

// ── 5+6. one upstream call for a burst, and honest health ─────────────────
{
  const before = upstreamCalls;
  await Promise.all(Array.from({ length: 20 }, () => fetch(`${BASE}/api/feed/massive/chain/SPY?exp=0`)));
  check('20 browsers asking at once make ONE upstream call', upstreamCalls - before === 1, `${upstreamCalls - before}`);
  /* Read the KEYS, not the counters: readStats() returns only numbers, so
     asserting against it could never have failed — the mutation that keyed
     the cache on the secret survived exactly that vacuous check. */
  check('and the credential never became part of the cache key',
    cache.keys().length > 0 && !cache.keys().some(k => k.includes(SECRET)),
    `${cache.keys().length} keys, e.g. ${cache.keys()[0]}`);

  const h = await (await fetch(`${BASE}/api/feed/health`)).json();
  check('health names the configured vendor and the missing one', h.configured.join() === 'massive' && h.missing.join() === 'uw', JSON.stringify(h.configured) + '/' + JSON.stringify(h.missing));
  check('and calls this desk LIVE, since a key is present', h.mode === 'live', h.mode);

  const demoVault = readVault({});
  const demoApp = express();
  demoApp.use('/api/feed', createFeedRouter({ vault: demoVault, cache: new RestCache(), transports: {}, sim: source, fetchImpl }));
  const demoSrv = http.createServer(demoApp);
  await new Promise<void>(r => demoSrv.listen(0, r));
  const dPort = (demoSrv.address() as { port: number }).port;
  const dh = await (await fetch(`http://127.0.0.1:${dPort}/api/feed/health`)).json();
  check('with no keys at all it says DEMO rather than pretending', dh.mode === 'demo' && dh.configured.length === 0, dh.mode);
  demoSrv.close();
}

// ── 7+8. the socket ───────────────────────────────────────────────────────
{
  const topic: FeedTopic = { channel: 'gex', symbol: 'SPY' };
  const open = (): Promise<WebSocket> => new Promise(res => {
    const s = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    s.on('open', () => res(s));
  });

  const a = await open();
  const b = await open();
  const gotA: unknown[] = [], gotB: unknown[] = [];
  a.on('message', m => gotA.push(JSON.parse(String(m))));
  b.on('message', m => gotB.push(JSON.parse(String(m))));

  a.send(JSON.stringify({ op: 'sub', channel: 'gex', symbol: 'SPY' }));
  b.send(JSON.stringify({ op: 'sub', channel: 'gex', symbol: 'SPY' }));
  await wait(120);
  check('two browsers on one topic open ONE upstream subscription', opens === 1, `${opens} opens`);

  emitters.get('gex:SPY')!({ topic, at: 7, payload: { flip: 495.5 } });
  await wait(120);
  check('one upstream message reaches both browsers over the wire', gotA.length === 1 && gotB.length === 1, `a=${gotA.length} b=${gotB.length}`);
  check('and it arrives with its topic and payload intact',
    JSON.stringify(gotA[0]) === JSON.stringify({ topic, at: 7, payload: { flip: 495.5 } }), JSON.stringify(gotA[0]));

  /* A malformed frame is answered, not punished. */
  a.send('not json at all');
  await wait(100);
  check('a malformed frame gets an error message', gotA.some(m => (m as { error?: string }).error === 'malformed frame'));
  check('— and does NOT drop the socket', a.readyState === WebSocket.OPEN);

  a.send(JSON.stringify({ op: 'unsub', channel: 'gex', symbol: 'SPY' }));
  await wait(120);
  check('one browser leaving does not close the upstream', closes === 0 && hub.openTopics === 1, `${closes} closes`);

  b.close();
  await wait(200);
  check('the last browser DISCONNECTING closes it upstream', closes === 1 && hub.openTopics === 0, `${closes} closes, ${hub.openTopics} open`);
  /* `a` is still CONNECTED here — it unsubscribed from the topic but never
     left — so the socket count is 1 and should be. Asserting 0 at this point
     was the proof mis-reading its own staging. */
  check('a browser that unsubscribed is still connected', ws.clientCount() === 1, `${ws.clientCount()}`);
  a.close();
  await wait(200);
  check('and once it leaves too, the server holds no sockets', ws.clientCount() === 0, `${ws.clientCount()}`);
}

await ws.close();
server.close();
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
