import Simulator from '../../core/simulator';
import { RTH_MINUTES } from '../../core/calendar';
import { sessionStarts } from '../indicators';
import { buildExpectedMoveCone } from '../expectedMove';
import { buildSessionLevels, type SessionLevel } from '../sessionLevels';
import { atmIv, realizedVol, riskReversal, termSlope, verdictFor, type RegimeVerdict } from '../volRegime';
import { buildGexPercentile, buildNetGexSeries, type NetGexPoint } from '../gexSeries';
import { buildCharmClock } from '../charmClock';
import { buildPins } from '../pins';
import type { Expiry } from '../expiry';

/*
==================================================
  SLAYER TERMINAL - WHAT ELSE THE PANE CAN SAY
  (data/pinpoint/extras.ts)
==================================================

  ══ THE REPO ALREADY KNOWS THESE; THE BOARD DID NOT ASK ═══════════════════

  Noah: "go thru the entire repo and see what we can add here to improve and
  be added here to be so benefical."

  Every reading below is an engine another desk already runs — Levels reads
  the flip gauge and the gamma series, Terrain draws the expected-move cone
  and the session levels, Holders builds the pins, the strip reads the vol
  regime. None of them had been asked by the board, and the board is the
  page a reader keeps open. So this is one call that asks all of them about
  THIS panel's symbol and expiry, and hands the pane a shape it can draw
  section by section.

  ══ THE SECTIONS, AND WHAT EACH ONE IS FOR ═════════════════════════════════

    MOVE      what the options market says the range to the close is —
              ±1σ and ±2σ in dollars, and the two strikes the 1σ edges land
              on, which the table then marks. Every competitor draws these
              as bands; on a strike ladder they are two rows.
    VOL       implied against realized, the verdict, the skew and the term —
              the conditions the whole book is read under.
    SESSION   the book's net over the day, where it stands against history,
              and how much of the day's charm has already been realized.
    LEVELS    the session's own prices — PDH, PDL, ORH, ORL, IBH, IBL — by
              distance from spot, so a strike ladder and a chart agree about
              which numbers matter today.
    PINS      max pain against the gamma pin, and the gap between them.

  ══ NULL MEANS "CANNOT SAY", NEVER ZERO ════════════════════════════════════

  A cone with no session bars behind it, a percentile with no history, a
  pin on an empty chain — each comes back null and the pane draws the
  section's absence rather than a figure that would read as a measurement.
*/

export interface MoveRead {
  /** ±1σ and ±2σ price edges at the close, from the cone's last point. */
  up1: number;
  dn1: number;
  up2: number;
  dn2: number;
  /** The chain strikes the 1σ edges land on — what the table marks. */
  upStrike: number;
  dnStrike: number;
  /** Dollars of one sigma to the close. */
  sigma: number;
  /** Trading minutes left. */
  minutesToClose: number;
}

export interface VolRead {
  /** ATM implied at the panel's tenor, decimal. */
  iv: number;
  /** Twenty-session realized, decimal; null when the history is too short. */
  rv20: number | null;
  verdict: RegimeVerdict;
  /** 25Δ put IV − 25Δ call IV, vol points. Positive is a put skew. */
  rr: number;
  /** Front over back ATM. Above one is backwardation. */
  slope: number;
}

export interface SessionRead {
  points: NetGexPoint[];
  min: number;
  max: number;
  /** Where the book stands against its own history, or null with none. */
  pctile: number | null;
  sessions: number;
  /** Share of the day's charm already realized, 0–1. */
  charmRealized: number;
  minutesElapsed: number;
}

export interface LevelsRead {
  /** Every session level, nearest to spot first. */
  levels: (SessionLevel & { away: number })[];
  nearestAbove: SessionLevel | null;
  nearestBelow: SessionLevel | null;
}

export interface PinsRead {
  maxPain: number | null;
  gammaPin: number | null;
  gap: number | null;
}

export interface Extras {
  move: MoveRead | null;
  vol: VolRead | null;
  session: SessionRead | null;
  levels: LevelsRead | null;
  pins: PinsRead | null;
}

/** Today's bars, from the last session open. */
function todaysBars(sym: string) {
  const bars = Simulator.getCandles(sym) ?? [];
  const starts = sessionStarts(bars, 1);
  return starts.length > 0 ? bars.slice(starts[starts.length - 1]) : [];
}

/**
 * Everything the pane can say about one symbol at one expiry, beyond the
 * book itself. `step` is the chain's strike spacing, so the move's edges can
 * be named as strikes.
 */
export function buildExtras(ticker: string, expiry: Expiry, spot: number, step: number): Extras {
  const sym = Simulator.ensureTicker(ticker);
  const baseIv = Simulator.TICKERS[sym]?.iv ?? 0;
  const sess = todaysBars(sym);
  const elapsed = sess.length > 0 ? (sess[sess.length - 1].time - sess[0].time) / 60 + 1 : 0;
  const minutesToClose = Math.max(0, RTH_MINUTES - elapsed);

  /* ── MOVE ── */
  let move: MoveRead | null = null;
  if (sess.length > 0 && baseIv > 0 && step > 0) {
    const cone = buildExpectedMoveCone(sess, baseIv, minutesToClose, 1);
    const last = cone.forward.length > 0 ? cone.forward[cone.forward.length - 1] : null;
    if (last && last.up1 > last.dn1) {
      const toStrike = (px: number) => Math.round(px / step) * step;
      move = {
        up1: last.up1,
        dn1: last.dn1,
        up2: last.up2,
        dn2: last.dn2,
        upStrike: toStrike(last.up1),
        dnStrike: toStrike(last.dn1),
        sigma: (last.up1 - last.dn1) / 2,
        minutesToClose,
      };
    }
  }

  /* ── VOL ── */
  let vol: VolRead | null = null;
  if (baseIv > 0 && spot > 0) {
    const dte = Math.max(1, expiry.dte);
    const iv = atmIv(spot, baseIv, dte);
    const rv20 = realizedVol(sym, 20);
    vol = { iv, rv20, verdict: verdictFor(iv, rv20), rr: riskReversal(spot, baseIv, dte), slope: termSlope(spot, baseIv) };
  }

  /* ── SESSION ── */
  let session: SessionRead | null = null;
  const series = buildNetGexSeries(sym);
  if (series.points.length > 0) {
    const last = series.points[series.points.length - 1];
    const pct = buildGexPercentile(sym, last.netGex);
    const charm = buildCharmClock(elapsed);
    session = {
      points: series.points,
      min: series.min,
      max: series.max,
      pctile: pct ? pct.pctile : null,
      sessions: pct ? pct.sessions : 0,
      charmRealized: charm.realizedShare,
      minutesElapsed: elapsed,
    };
  }

  /* ── LEVELS ── */
  let levels: LevelsRead | null = null;
  const all = Simulator.getCandles(sym) ?? [];
  if (all.length > 0 && spot > 0) {
    const built = buildSessionLevels(all, 15);
    const ranked = built.levels
      .filter(l => Number.isFinite(l.price) && l.price > 0)
      .map(l => ({ ...l, away: l.price - spot }))
      .sort((a, b) => Math.abs(a.away) - Math.abs(b.away));
    const above = ranked.filter(l => l.away > 0).sort((a, b) => a.away - b.away)[0] ?? null;
    const below = ranked.filter(l => l.away < 0).sort((a, b) => b.away - a.away)[0] ?? null;
    levels = ranked.length > 0 ? { levels: ranked, nearestAbove: above, nearestBelow: below } : null;
  }

  /* ── PINS ── */
  let pins: PinsRead | null = null;
  const { chain } = Simulator.chainFor(sym, expiry);
  if (chain.length > 0) {
    const p = buildPins(chain, spot);
    pins = p.maxPain === null && p.gammaPin === null ? null : { maxPain: p.maxPain, gammaPin: p.gammaPin, gap: p.gap };
  }

  return { move, vol, session, levels, pins };
}

/** The pane's sections, in the order they are drawn. */
export const SECTIONS = ['book', 'loaded', 'strike', 'move', 'vol', 'session', 'levels', 'pins', 'recent'] as const;
export type SectionKey = (typeof SECTIONS)[number];

/** What a panel opens with. Everything the repo can say is available; these
    are the ones a reader glancing over from a chart wants first. */
export const DEFAULT_SECTIONS: readonly SectionKey[] = ['book', 'loaded', 'strike', 'move', 'vol', 'recent'];

export const SECTION_WORDS: Record<SectionKey, string> = {
  book: 'Book',
  loaded: 'Loaded',
  strike: 'Strike',
  move: 'Move',
  vol: 'Vol',
  session: 'Session',
  levels: 'Levels',
  pins: 'Pins',
  recent: 'Recent',
};

export const SECTION_TITLES: Record<SectionKey, string> = {
  book: 'Net, side, regime and the named levels',
  loaded: 'The score’s shortlist, with each one’s change over the window',
  strike: 'Whatever the pointer is on: legs, greeks, every window',
  move: 'The expected range to the close, and the strikes its edges land on',
  vol: 'Implied against realized, the verdict, skew and term',
  session: 'The book’s net over the day, its rank against history, the charm clock',
  levels: 'Today’s session prices by distance from spot',
  pins: 'Max pain against the gamma pin',
  recent: 'What moved, newest first',
};

/** The lane's two readings. NET is the diverging picture; ABS is the gross
    weight at a strike regardless of side — the competitors' "absolute
    gamma", which answers "how much is here" rather than "which way". */
export type LaneMode = 'net' | 'abs';
