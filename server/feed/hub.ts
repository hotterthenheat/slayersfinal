import { topicKey, type FeedMessage, type FeedSource, type FeedTopic } from './types';

/*
==================================================
  SLAYER TERMINAL - THE FAN-OUT HUB (server/feed/hub.ts)

  One vendor socket in, every browser out.
==================================================

  THE RULE THIS FILE EXISTS TO ENFORCE: never one vendor socket per user.
  With a hundred desks open on SPY the vendor should see ONE `option_trades`
  subscription, not a hundred — both because the plans meter connections and
  because a hundred sockets carrying identical bytes is a hundred chances for
  two browsers to disagree about the same print.

  SO SUBSCRIPTIONS ARE REFCOUNTED PER TOPIC. The first browser to want
  `gex:SPY` opens it upstream; the ninety-nine after it attach to the same
  stream; the LAST one to leave closes it. That last clause is the whole
  reason this is a class and not a Map of callbacks — a hub that opens
  correctly and never closes is a slow leak that looks fine all morning and
  is holding four hundred dead topics by the close.

  A CLIENT IS A BAG OF TOPICS, and dropping it drops its refs. Browsers
  vanish without saying goodbye — a closed laptop, a killed tab, a train
  tunnel — so `removeClient` is the same path as a clean unsubscribe rather
  than a special case. Whatever the socket layer notices, it calls that.

  ONE MISBEHAVING CLIENT MUST NOT TAKE THE DESK DOWN. A throw inside one
  browser's delivery callback is caught and counted: the other subscribers on
  that topic still get the message, and the count is readable so a
  consistently-throwing client is visible rather than silently starved.

  WHAT THIS FILE IS NOT. It holds no socket, no vendor, and no transport.
  `FeedSource` supplies the upstream and the caller supplies the delivery
  function, so the hub's whole contract is testable in-process — which is why
  the proof can assert "one upstream open, three clients fed, closed on the
  last leave" without a network.
*/

/** What the transport layer hands the hub — one connected browser. */
export interface HubClient {
  id: string;
  /** Deliver to this browser. The hub never throws out of this. */
  send: (m: FeedMessage) => void;
}

interface Topic {
  /** Clients watching this topic, by id. */
  subscribers: Map<string, HubClient>;
  /** The upstream teardown for the ONE subscription behind them. */
  close: () => void;
}

export interface HubStats {
  /** Upstream subscriptions opened since boot — the vendor-facing count. */
  opened: number;
  closed: number;
  /** Messages taken from upstream. */
  received: number;
  /** Deliveries to browsers. Fan-out ratio = delivered / received. */
  delivered: number;
  /** Client `send` callbacks that threw. */
  clientErrors: number;
}

export class FeedHub {
  private topics = new Map<string, Topic>();
  private clients = new Map<string, Set<string>>(); // clientId → topic keys
  private stats: HubStats = { opened: 0, closed: 0, received: 0, delivered: 0, clientErrors: 0 };

  constructor(private source: FeedSource) {}

  /**
   * Attach a browser to a topic, opening the upstream only if this is the
   * first watcher. Idempotent per (client, topic): a component that mounts
   * twice must not double-count a browser that can only leave once.
   */
  subscribe(client: HubClient, topic: FeedTopic): void {
    const key = topicKey(topic);
    let held = this.clients.get(client.id);
    if (!held) {
      held = new Set();
      this.clients.set(client.id, held);
    }
    if (held.has(key)) return;

    let t = this.topics.get(key);
    if (!t) {
      const subscribers = new Map<string, HubClient>();
      /* Opened BEFORE the entry is stored, so a source that delivers
         synchronously on subscribe still finds the subscriber map. */
      const close = this.source.subscribe(topic, m => this.deliver(key, m));
      t = { subscribers, close };
      this.topics.set(key, t);
      this.stats.opened++;
    }
    t.subscribers.set(client.id, client);
    held.add(key);
  }

  /** Detach one browser from one topic; closes upstream if it was the last. */
  unsubscribe(clientId: string, topic: FeedTopic): void {
    const key = topicKey(topic);
    this.clients.get(clientId)?.delete(key);
    const t = this.topics.get(key);
    if (!t) return;
    t.subscribers.delete(clientId);
    if (t.subscribers.size === 0) {
      t.close();
      this.topics.delete(key);
      this.stats.closed++;
    }
  }

  /** A browser went away — for any reason, clean or not. */
  removeClient(clientId: string): void {
    const held = this.clients.get(clientId);
    if (!held) return;
    /* Copied: unsubscribe mutates the same set. */
    for (const key of [...held]) {
      const t = this.topics.get(key);
      if (!t) continue;
      t.subscribers.delete(clientId);
      if (t.subscribers.size === 0) {
        t.close();
        this.topics.delete(key);
        this.stats.closed++;
      }
    }
    this.clients.delete(clientId);
  }

  private deliver(key: string, m: FeedMessage): void {
    const t = this.topics.get(key);
    if (!t) return;
    this.stats.received++;
    for (const c of t.subscribers.values()) {
      try {
        c.send(m);
        this.stats.delivered++;
      } catch {
        /* One bad browser is not the desk's problem — see the header. */
        this.stats.clientErrors++;
      }
    }
  }

  /** Upstream subscriptions currently open. The number to watch. */
  get openTopics(): number {
    return this.topics.size;
  }

  /** Browsers on a topic — for the proof and for an ops readout. */
  subscriberCount(topic: FeedTopic): number {
    return this.topics.get(topicKey(topic))?.subscribers.size ?? 0;
  }

  readStats(): Readonly<HubStats> {
    return { ...this.stats };
  }
}
