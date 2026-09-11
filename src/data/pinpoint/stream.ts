import { ROLE_WORDS, type Role } from './board';
import { asLevels, type Matrix, type MatrixRow } from './matrix';

/*
==================================================
  SLAYER TERMINAL - THE BOOK'S OWN STREAM
  (data/pinpoint/stream.ts)
==================================================

  ══ WHAT IS CHANGING, AS SENTENCES ═════════════════════════════════════════

  Noah's reference for the panel beside the table is a feed: a column of
  timestamped one-line events, each from a named source, each saying one
  thing that happened — "King wall migrated 749 → 743", "$99K put sweep ·
  SPY 744P". The table says what is at every level exactly; the feed says
  what MOVED, in the order it moved, which a table in strike order cannot.

  Everything here is derived from two readings of the same book — the last
  one and this one — and nothing else. There is no model behind it and no
  narrator: an event exists because two numbers differed in a way the desk
  already has a word for. Three sources, and they are the three engines the
  board already runs:

    LEVELS   the structural names moved — pin, walls, flip
    FLOW     a strike's net built, drained, or crossed side over the window
    SCORE    a strike entered or left the shortlist

  ══ SEEDED, THEN DIFFED ════════════════════════════════════════════════════

  A feed that is empty until something happens is a feed that says "nothing"
  on every cold open, which is not what a reader arriving at 09:31 needs. The
  first reading SEEDS it with where things stand — the pin, the walls, the
  biggest moves over the window — and every reading after that DIFFS
  against the one before.

  ══ AN EVENT FIRES ONCE ════════════════════════════════════════════════════

  Every event carries an id built from what it says, so the same move seen
  on the next tick is the same id and is dropped by `mergeStream`. A build
  that keeps building re-fires each time it grows another twentieth of the
  book's ruler, which is the difference between "still building" being news
  and being noise.
*/

export type StreamSource = 'levels' | 'flow' | 'score' | 'book';

export interface StreamEvent {
  /** Built from the content — the same event twice has the same id. */
  id: string;
  /** When it was observed, ms. */
  at: number;
  source: StreamSource;
  /** The one line. */
  text: string;
  /** The strike it is about, where it is about one. */
  strike: number | null;
  /** 0..1 — how much it deserves the eye when several land at once. */
  weight: number;
}

/** How many events a panel keeps. Past this the oldest go. */
export const STREAM_CAP = 40;

/** A build has to grow this fraction of the book's ruler before the same
    strike gets a second "built" line — see the note above. */
const REFIRE = 0.05;

const named = (role: Role) => (role ? ROLE_WORDS[role] : '');

const money = (v: number): string => {
  const a = Math.abs(v);
  const s = v < 0 ? '-' : '';
  if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(1)}K`;
  return `${s}$${a.toFixed(0)}`;
};

const signed = (v: number): string => (v >= 0 ? `+${money(v)}` : money(v));

const side = (net: number) => (net >= 0 ? 'put-dominant' : 'call-dominant');

const lead = (m: Matrix) => m.families[0];
const netOf = (m: Matrix, r: MatrixRow) => r.cells[lead(m)]?.net ?? 0;
const rowAt = (m: Matrix, strike: number | null) =>
  strike == null ? undefined : m.rows.find(r => r.strike === strike);

/* ── the first reading ──────────────────────────────────────────────────── */

/**
 * Where things stand, as the first lines of the feed.
 *
 * Ordered by weight so the pin leads, because that is the one line a reader
 * glancing over from a chart wants first.
 */
export function seedStream(m: Matrix): StreamEvent[] {
  const out: StreamEvent[] = [];
  const at = m.builtAt;
  /* THE LEADING FAMILY'S landmarks, not gamma's levels — a delta panel's
     feed must not open with a gamma pin wearing a delta figure. */
  const L = asLevels(m.landmarks, m.spot);

  const level = (role: Exclude<Role, null>, strike: number, weight: number) => {
    const r = rowAt(m, strike);
    if (!r) return;
    out.push({
      id: `levels:at:${role}:${strike}`,
      at,
      source: 'levels',
      text: `${named(role)} at ${strike} · ${money(netOf(m, r))} · ${side(netOf(m, r))}`,
      strike,
      weight,
    });
  };
  if (Number.isFinite(L.supreme)) level('pin', L.supreme, 1);
  if (Number.isFinite(L.callWall) && L.callWall !== L.supreme) level('callWall', L.callWall, 0.8);
  if (Number.isFinite(L.putWall) && L.putWall !== L.supreme) level('putWall', L.putWall, 0.8);
  if (Number.isFinite(L.flip) && L.flip !== m.spot) {
    out.push({
      id: `levels:flip:${L.flip}`,
      at,
      source: 'levels',
      text: `Flip at ${L.flip} · ${L.flip > m.spot ? 'above' : 'below'} spot by ${Math.abs(L.flip - m.spot).toFixed(2)}`,
      strike: null,
      weight: 0.7,
    });
  }

  const book = m.books[lead(m)];
  if (book) {
    out.push({
      id: `book:is:${book.net >= 0 ? 'put' : 'call'}`,
      at,
      source: 'book',
      text: `Book is ${side(book.net)} · ${money(book.net)} net ${lead(m)}`,
      strike: null,
      weight: 0.6,
    });
  }

  /* The biggest moves over the window, so the feed opens on what is
     happening and not only on where things are. */
  for (const e of moves(m)) out.push(e);

  return out.sort((a, b) => b.weight - a.weight);
}

/* ── every reading after ────────────────────────────────────────────────── */

/**
 * What changed between two readings of the same book.
 *
 * Both must be the same symbol, family and expiry — a diff across two
 * different books is not a change, it is a comparison, and that is another
 * desk's job. The caller guards it; this returns nothing rather than lying.
 */
export function diffStream(prev: Matrix, next: Matrix): StreamEvent[] {
  if (prev.ticker !== next.ticker || lead(prev) !== lead(next) || prev.expiry.key !== next.expiry.key) return [];
  const out: StreamEvent[] = [];
  const at = next.builtAt;

  /* LEVELS: a structural name landed on a different strike. */
  const moved = (role: Exclude<Role, null>, from: number, to: number, weight: number) => {
    if (from === to || !Number.isFinite(from) || !Number.isFinite(to)) return;
    const r = rowAt(next, to);
    out.push({
      id: `levels:moved:${role}:${from}:${to}`,
      at,
      source: 'levels',
      text: `${named(role)} moved ${from} → ${to}${r ? ` · ${money(netOf(next, r))}` : ''}`,
      strike: to,
      weight,
    });
  };
  const P = asLevels(prev.landmarks, prev.spot);
  const N = asLevels(next.landmarks, next.spot);
  moved('pin', P.supreme, N.supreme, 1);
  moved('callWall', P.callWall, N.callWall, 0.85);
  moved('putWall', P.putWall, N.putWall, 0.85);
  if (Number.isFinite(P.flip) && Number.isFinite(N.flip) && P.flip !== N.flip) {
    out.push({
      id: `levels:flip:${P.flip}:${N.flip}`,
      at,
      source: 'levels',
      text: `Flip moved ${P.flip} → ${N.flip}`,
      strike: null,
      weight: 0.75,
    });
  }

  /* BOOK: the whole book changed side. Rare, and the loudest thing here. */
  const pb = prev.books[lead(prev)];
  const nb = next.books[lead(next)];
  if (pb && nb && pb.net >= 0 !== nb.net >= 0) {
    out.push({
      id: `book:flipped:${nb.net >= 0 ? 'put' : 'call'}:${Math.round(at / 60000)}`,
      at,
      source: 'book',
      text: `Book flipped to ${side(nb.net)} · ${money(nb.net)}`,
      strike: null,
      weight: 1,
    });
  }

  /* FLOW: a strike crossed side since the last reading. Not the window's
     crossing — that is on the row already — but the tick's, which is the
     event happening now. */
  const before = new Map(prev.rows.map(r => [r.strike, netOf(prev, r)]));
  for (const r of next.rows) {
    const was = before.get(r.strike);
    const now = netOf(next, r);
    if (was === undefined || was === 0 || now === 0) continue;
    if (was >= 0 !== now >= 0) {
      out.push({
        id: `flow:crossed:${r.strike}:${now >= 0 ? 'put' : 'call'}:${Math.round(at / 60000)}`,
        at,
        source: 'flow',
        text: `${r.strike} crossed to ${side(now)} · ${money(now)}${r.role ? ` · ${named(r.role)}` : ''}`,
        strike: r.strike,
        weight: 0.9,
      });
    }
  }

  /* FLOW: the biggest builds and drains over the window, re-fired only as
     they grow. */
  for (const e of moves(next)) out.push(e);

  /*
    SCORE: the shortlist changed — at the TOP, not at the edge.

    ══ THE BOUNDARY OF A LIST IS WHERE THE NOISE LIVES ═════════════════════

    Measured on the first cut: "505 entered · #6", "498 left", "498 entered ·
    #5", "505 left", inside four seconds. Two strikes a hair apart in score
    trading the last place on a six-row list, and the feed reporting every
    swap as an event. The list's edge is a rounding line; crossing it is not
    news.

    Entering the TOP THREE is. So is leaving it. That is the claim the score
    engine can actually stand behind, and the feed says only that.
  */
  const TOP = 3;
  const wasTop = new Set(prev.loaded.slice(0, TOP).map(r => r.strike));
  next.loaded.slice(0, TOP).forEach((r, i) => {
    if (wasTop.has(r.strike)) return;
    out.push({
      id: `score:in:${r.strike}:${Math.round(at / 120000)}`,
      at,
      source: 'score',
      text: `${r.strike} into the top ${TOP} · #${i + 1}${r.role ? ` · ${named(r.role)}` : ''}`,
      strike: r.strike,
      weight: 0.6,
    });
  });
  const isTop = new Set(next.loaded.slice(0, TOP).map(r => r.strike));
  for (const r of prev.loaded.slice(0, TOP)) {
    if (isTop.has(r.strike)) continue;
    out.push({
      id: `score:out:${r.strike}:${Math.round(at / 120000)}`,
      at,
      source: 'score',
      text: `${r.strike} out of the top ${TOP}`,
      strike: r.strike,
      weight: 0.4,
    });
  }

  return out.sort((a, b) => b.weight - a.weight);
}

/** The two biggest builds and the biggest drain over the chosen window,
    each with an id that re-fires as it grows — see `REFIRE`. */
function moves(m: Matrix): StreamEvent[] {
  const out: StreamEvent[] = [];
  const scale = m.scales[lead(m)] ?? 0;
  if (scale <= 0) return out;
  const material = m.rows.filter(r => r.flow && r.flow.material && !r.flow.crossed);
  const builds = material.filter(r => (r.flow?.grew ?? 0) > 0).sort((a, b) => (b.flow?.grew ?? 0) - (a.flow?.grew ?? 0)).slice(0, 2);
  const drains = material.filter(r => (r.flow?.grew ?? 0) < 0).sort((a, b) => (a.flow?.grew ?? 0) - (b.flow?.grew ?? 0)).slice(0, 1);
  for (const r of [...builds, ...drains]) {
    const grew = r.flow?.grew ?? 0;
    const bucket = Math.round(Math.abs(grew) / (scale * REFIRE));
    const pct = r.flow?.pct != null ? ` · ${r.flow.pct >= 0 ? '+' : ''}${r.flow.pct.toFixed(0)}%` : '';
    out.push({
      id: `flow:${grew >= 0 ? 'built' : 'drained'}:${r.strike}:${bucket}`,
      at: m.builtAt,
      source: 'flow',
      text: `${r.strike} ${grew >= 0 ? 'built' : 'drained'} ${signed(grew)} over ${m.lookback.label}${pct}${r.role ? ` · ${named(r.role)}` : ''}`,
      strike: r.strike,
      weight: Math.min(0.8, 0.3 + Math.abs(grew) / scale),
    });
  }
  return out;
}

/* ── the buffer ─────────────────────────────────────────────────────────── */

/**
 * Fold new events into the panel's buffer: newest first, the same id never
 * twice, and never more than the cap.
 *
 * An id already in the buffer is dropped rather than moved to the top, so a
 * wall that has not moved does not climb the feed every tick pretending to
 * be news.
 */
export function mergeStream(buffer: StreamEvent[], incoming: StreamEvent[], cap = STREAM_CAP): StreamEvent[] {
  if (incoming.length === 0) return buffer;
  const seen = new Set(buffer.map(e => e.id));
  const fresh = incoming.filter(e => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });
  if (fresh.length === 0) return buffer;
  return [...fresh, ...buffer].slice(0, cap);
}

/** The feed's own names for its sources — what the avatar column reads. */
export const SOURCE_WORDS: Record<StreamSource, string> = {
  levels: 'Levels',
  flow: 'Flow',
  score: 'Score',
  book: 'Book',
};
