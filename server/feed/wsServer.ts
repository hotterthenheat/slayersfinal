import { WebSocketServer, type WebSocket } from 'ws';
import type { Server } from 'node:http';
import { FeedHub, type HubClient } from './hub';
import type { FeedTopic } from './types';

/*
==================================================
  SLAYER TERMINAL - THE BROWSER SOCKET (server/feed/wsServer.ts)

  The "many out" half. The hub owns the refcounts;
  this owns the wire.
==================================================

  DELIBERATELY THIN. Everything that could be got wrong about fan-out —
  one upstream per topic, the last leaver closing it, a dropped browser
  releasing what it held — lives in `hub.ts`, where it is provable without a
  network. This file translates frames into those calls and nothing more,
  which is why its own proof can be an end-to-end smoke test rather than a
  second copy of the hub's.

  A DEAD SOCKET IS THE NORMAL CASE. Browsers leave without a close frame —
  a shut laptop, a killed tab, a tunnel — and a server that only cleans up on
  `close` accumulates topics that nobody is watching. So there is a heartbeat:
  every client is pinged on an interval, a client that misses two rounds is
  terminated, and termination runs the SAME `removeClient` path as a clean
  goodbye. That is the difference between a hub that leaks and one that
  doesn't, and it cannot be tested by opening a tab and closing it politely.

  THE PROTOCOL IS THREE VERBS, because anything richer is a second API to
  keep honest:
    → {"op":"sub","channel":"gex","symbol":"SPY"}
    → {"op":"unsub","channel":"gex","symbol":"SPY"}
    ← {"topic":{...},"at":1234,"payload":{...}}
  A malformed frame is answered with an error message and NOT a disconnect:
  one fat-fingered frame from one pane should not drop the desk's whole feed.
*/

const HEARTBEAT_MS = 30_000;

interface Live {
  socket: WebSocket;
  alive: boolean;
}

export interface WsServerHandle {
  wss: WebSocketServer;
  close: () => Promise<void>;
  /** Sockets currently connected — for the health route and the proof. */
  clientCount: () => number;
}

export function attachFeedSocket(server: Server, hub: FeedHub, path = '/ws'): WsServerHandle {
  const wss = new WebSocketServer({ server, path });
  const live = new Map<string, Live>();
  let seq = 0;

  wss.on('connection', socket => {
    const id = `c${++seq}`;
    live.set(id, { socket, alive: true });

    const client: HubClient = {
      id,
      /* The hub catches throws out of this — a send to a socket that closed
         between the fan-out and here must not stop the other subscribers. */
      send: m => socket.send(JSON.stringify(m)),
    };

    socket.on('pong', () => {
      const l = live.get(id);
      if (l) l.alive = true;
    });

    socket.on('message', raw => {
      let msg: { op?: string; channel?: string; symbol?: string };
      try {
        msg = JSON.parse(String(raw));
      } catch {
        socket.send(JSON.stringify({ error: 'malformed frame' }));
        return;
      }
      if (!msg.channel || (msg.op !== 'sub' && msg.op !== 'unsub')) {
        socket.send(JSON.stringify({ error: 'expected {op:"sub"|"unsub", channel, symbol?}' }));
        return;
      }
      const topic = { channel: msg.channel, symbol: msg.symbol } as FeedTopic;
      if (msg.op === 'sub') hub.subscribe(client, topic);
      else hub.unsubscribe(id, topic);
    });

    /* One path for every kind of goodbye, clean or not. */
    const drop = () => {
      hub.removeClient(id);
      live.delete(id);
    };
    socket.on('close', drop);
    socket.on('error', drop);
  });

  const beat = setInterval(() => {
    for (const [id, l] of live) {
      if (!l.alive) {
        /* Missed two rounds: terminate, and release what it held through the
           same path a clean close uses. */
        l.socket.terminate();
        hub.removeClient(id);
        live.delete(id);
        continue;
      }
      l.alive = false;
      try {
        l.socket.ping();
      } catch {
        l.socket.terminate();
        hub.removeClient(id);
        live.delete(id);
      }
    }
  }, HEARTBEAT_MS);
  /* Never hold the process open on the heartbeat alone. */
  if (typeof beat.unref === 'function') beat.unref();

  return {
    wss,
    clientCount: () => live.size,
    close: () =>
      new Promise<void>(resolve => {
        clearInterval(beat);
        for (const [, l] of live) l.socket.terminate();
        live.clear();
        wss.close(() => resolve());
      }),
  };
}
