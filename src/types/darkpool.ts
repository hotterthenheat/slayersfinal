/*
==================================================
  SLAYER TERMINAL - DARK POOL TYPES (darkpool.ts)
  Off-exchange prints with the read attached: not
  just "a block traded" but who is likely behind it
  and what to do about the level it printed at.
==================================================
*/

/** What the print is most likely doing — the read, not just the tape line. */
export type DarkPoolIntent = 'ACCUMULATION' | 'DISTRIBUTION' | 'HEDGE FLOW' | 'ROTATION';

/**
 * HOW the print was executed — a different axis from why.
 *
 * Intent answers "is someone building or leaving". This answers "what kind of
 * trade is that", which is the thing a reader of an off-exchange tape actually
 * sorts on: a single negotiated cross and two hundred algo child fills can add
 * up to the same dollars and mean completely different things.
 *
 * These are execution archetypes, not venue products. Same rule as the venue
 * field: naming a real broker's block-crossing product would hang an invented
 * fill on a service that exists.
 */
export type DarkPoolExecution =
  /** One negotiated print, large-in-scale, agreed away from the book. */
  | 'BLOCK CROSS'
  /** Crossed at the midpoint of the quote, neither side paying the spread. */
  | 'MIDPOINT'
  /** A reserve order working: repeated equal clips at one price. */
  | 'ICEBERG'
  /** Algo child orders, small and even, tracking a schedule. */
  | 'VWAP SLICE'
  /** Lit sweep that finished off-exchange — an aggressor, not a negotiation. */
  | 'SWEEP TO DARK'
  /** Reported well after it traded, which is why it can sit far from spot. */
  | 'LATE PRINT';

export interface DarkPoolPrint {
  id: number;
  time: string;
  ticker: string;
  price: number;
  size: number;
  /** Dollars */
  notional: number;
  venue: string;
  /** Signed % distance of the print from current spot */
  vsSpotPct: number;
  /** Print landed on one of the session's tracked liquidity shelves */
  atLevel: boolean;
  intent: DarkPoolIntent;
  /** How the print was executed — see DarkPoolExecution. */
  execution: DarkPoolExecution;
  /** Child fills behind the print. 1 is a single cross; an iceberg is dozens. */
  clips: number;
  /** Crossed inside the spread rather than on a side. */
  atMid: boolean;
  /** Seconds between the trade and its appearance on the tape. Off-exchange
      prints report late; a large one reporting very late is the whole reason a
      block can show up well away from where price is now. */
  reportLagSec: number;
  /** 0–100 — how confident the classifier is in the intent */
  conviction: number;
  /** One-line human read of the print */
  read: string;
}

export type LevelRole = 'SUPPORT' | 'RESISTANCE' | 'PIVOT';

export interface DarkPoolLevel {
  price: number;
  /** Aggregate off-exchange dollars transacted at this shelf */
  notional: number;
  prints: number;
  /** Share of session dark-pool notional, 0–100 */
  sharePct: number;
  role: LevelRole;
  /** Times intraday price reversed off this shelf */
  defended: number;
  /** Signed % distance from spot */
  distPct: number;
  /** How to actually trade against the shelf */
  usage: string;
}

export type Posture = 'ACCUMULATING' | 'DISTRIBUTING' | 'BALANCED';

export interface DarkPoolView {
  ticker: string;
  spot: number;
  /** −100…+100 — net accumulation vs distribution across sized prints */
  netPosturePct: number;
  posture: Posture;
  postureNote: string;
  totalNotional: number;
  levels: DarkPoolLevel[];
  prints: DarkPoolPrint[];
  largest: DarkPoolPrint | null;
}
