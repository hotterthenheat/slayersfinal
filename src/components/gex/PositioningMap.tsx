import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { preserveGreek } from '../ui/greek';
import ChartLegend from '../ui/ChartLegend';
import EmptyState from '../ui/EmptyState';
import HoverReadout from '../ui/HoverReadout';
import SignalBadge from '../ui/SignalBadge';
import SpotRule from '../ui/SpotRule';
import { ROW_INTERACTIVE, interactiveRowProps, rowKeyDown } from '../ui/interactiveRow';
import { LONG_GAMMA, SHORT_GAMMA } from './palette';
import TrendLine from './TrendLine';
import Simulator from '../../core/simulator';
import { fmtUsd } from '../../data/gex';
import { DEALER_BIAS_LABEL, type ExposureProfileData, type StrikeExposure, type ZoneBand, type ZoneKind } from '../../types/gex';
import type { Tone } from '../ui/tones';
import { DUR, EASE } from '../../lib/motion';
import {
  bands as buildBands,
  cumHalfOf,
  cumulative,
  ghostRuns,
  netMaxOf,
  priceScale,
  tierFor,
  type Tier,
} from './positioningMapModel';

interface PositioningMapProps {
  data: ExposureProfileData;
  /** Strike currently hovered in either panel (synced highlight) */
  hoverStrike?: number | null;
  /** Strike pinned by click — silver selection language */
  selectedStrike?: number | null;
  onHoverStrike?: (strike: number | null) => void;
  onSelectStrike?: (strike: number) => void;
}

const ZONE_STYLE: Record<ZoneKind, { rail: string; text: string }> = {
  'call-wall': { rail: 'bg-bull/80', text: 'text-bull' },
  'put-wall': { rail: 'bg-bear/70', text: 'text-bear' },
  friction: { rail: 'bg-textMuted/40', text: 'text-textMuted' },
};

// SVG and inline styles cannot reach a Tailwind class; this is the `textPrimary`
// token. Deliberately NOT holo silver: index.css:89 documents `.data-bar` as the
// fix for spending selection language on magnitude.
const INK = '#ededed';

const GUTTER_W = 52;
const RAIL_W = 64;
const RAIL_EDGE_W = 4;
const HEADER_H = 26;
const HEADER_H_MICRO = 22;
const AXIS_H = 14;
const FOOTER_H = 20;
/** Uncapped, the landing's ~1050px gives every band a 55:1 aspect ratio. */
const PLOT_CAP = 840;
/**
 * Every band is absolutely positioned, so the plot has no intrinsic height of
 * its own. Where a host's height is content-driven rather than definite — the
 * Pinpoint grid collapses to one column below `xl`, and a single-item row is
 * sized by its content — that would leave the panel as a header and nothing
 * else. A zero-width spacer gives the lane a content height to fall back on;
 * `min-h-0` still lets it shrink below this wherever the height IS definite, so
 * the workspace tile's 212px plot is untouched.
 */
const PLOT_FALLBACK_H = 320;
/** At or above, the zone rail carries labels; below, it is a colour edge. */
const W_RAIL = 400;
/** At or above (and with room per band), tip values print on canvas. */
const W_LABEL = 640;
const W_LEGEND_LONG = 560;
/** Reserved so a tip label can never clip and never lands on a coloured fill. */
const LABEL_PAD_ON = 64;
const LABEL_PAD_OFF = 6;
/* Half the inked height of an 11px mono label — the vertical reach a value has
   either side of its band's centre line, used to decide whether a marker that
   straddles two bands lands on either one's text. */
const LABEL_HALF_H = 7;
/* The widest a value label gets: `-$254.2M` is 8 glyphs of 11px mono at ~6.6px
   plus the 6px inset. Used to decide whether a placement has room BEFORE it is
   rendered, which is the only point at which the choice can still be made. */
const LABEL_W = 60;

/** The two opaque markers' edges, in plot-local pixels. */
interface MarkerBox {
  spotLeft: number;
  spotTop: number;
  spotBottom: number;
  flipRight: number;
  flipTop: number;
  flipBottom: number;
}
/* Out of everyone's way until measured: nothing to the right of `Infinity`,
   nothing to the left of 0, and a vertical span no band can intersect. */
const NO_MARKERS: MarkerBox = {
  spotLeft: Infinity,
  spotTop: Infinity,
  spotBottom: -Infinity,
  flipRight: 0,
  flipTop: Infinity,
  flipBottom: -Infinity,
};
const sameBox = (a: MarkerBox, b: MarkerBox) =>
  (Object.keys(a) as (keyof MarkerBox)[]).every(k => a[k] === b[k]);

const fmtStrike = (v: number) => (v % 1 === 0 ? v.toFixed(0) : v.toFixed(2));

/* Regime tokens. This badge sits three lines under the desk's own net-gamma
   read, and until now the two disagreed: the banner said SHORT GAMMA in gold and
   this said BEARISH in red, about one number. See DealerBias in types/gex.ts. */
const BIAS_TONE: Record<ExposureProfileData['bias'], Tone> = {
  LONG_GAMMA: 'longGamma',
  SHORT_GAMMA: 'shortGamma',
  BALANCED: 'neutral',
};

/** exposure.ts:140/143's own participles — no second lexicon for one quantity. */
const gammaWords = (net: number) => (net < 0 ? 'moves amplified' : 'dips absorbed');

/**
 * The floating per-strike read-out. Everything here is derived from the same raw
 * per-strike history the headline reads, so the card can never show two
 * contradictory values for one quantity.
 */
const StrikeReadout = ({
  row,
  ticker,
  role,
  cum,
  anchorWord,
}: {
  row: StrikeExposure;
  ticker: string;
  role: { tone: Tone; label: string };
  cum: number;
  anchorWord: string;
}) => {
  const series = useMemo(() => {
    const snaps = Simulator.getGexHistory(ticker) ?? [];
    const out: number[] = [];
    for (let i = Math.max(0, snaps.length - 391); i < snaps.length; i++) {
      const lvl = snaps[i].levels.find(l => l.strike === row.strike);
      if (lvl) out.push(lvl.value);
    }
    return out;
  }, [ticker, row.strike]);

  const now = series[series.length - 1] ?? row.gex.net;
  const recent = series.slice(-16);
  // Building/draining follows the MAGNITUDE of the exposure — a put wall
  // deepening from −$400M to −$800M is building, not draining.
  const rising = recent.length > 1 && Math.abs(recent[recent.length - 1]) >= Math.abs(recent[0]);
  const short = now < 0;

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-label font-bold text-textPrimary tnum">
          Strike {fmtStrike(row.strike)}
          {row.pin && (
            <span className="ml-1.5 font-mono text-micro font-bold uppercase tracking-wider text-textSecondary">pin</span>
          )}
        </span>
        <SignalBadge tone={role.tone}>{role.label}</SignalBadge>
      </div>

      <div className="mt-2">
        <div className="font-mono text-micro uppercase tracking-widest text-textMuted">Net gamma</div>
        <div className="font-mono text-lead leading-6 font-bold tnum" style={{ color: short ? SHORT_GAMMA : LONG_GAMMA }}>
          {now >= 0 ? '+' : ''}
          {fmtUsd(now)}
        </div>
        <div className="font-mono text-micro uppercase tracking-wider text-textSecondary">
          dealer {short ? 'short' : 'long'} gamma · {gammaWords(now)}
        </div>
        <div className="font-mono text-micro uppercase tracking-wider text-textSecondary">
          {rising ? '↗ exposure building' : '↘ exposure draining'}
        </div>
      </div>

      <div className="mt-2 flex items-center gap-3 font-mono text-micro uppercase tracking-wider text-textMuted tnum">
        <span>
          C <span className="text-bull">{fmtUsd(row.gex.call)}</span>
        </span>
        <span>
          P <span className="text-bear">{fmtUsd(row.gex.put)}</span>
        </span>
        <span>
          DEX <span className="text-textSecondary">{fmtUsd(row.dex.net)}</span>
        </span>
        <span>
          VEX <span className="text-textSecondary">{fmtUsd(row.vex.net)}</span>
        </span>
      </div>

      <div className="mt-2 pt-2 border-t border-borderSubtle/60 font-mono text-micro uppercase tracking-wider text-textMuted tnum">
        From {anchorWord} to {fmtStrike(row.strike)} ·{' '}
        <span style={{ color: cum < 0 ? SHORT_GAMMA : LONG_GAMMA }}>{fmtUsd(cum)}</span> · {gammaWords(cum)}
      </div>

      {recent.length > 1 && (
        <div className="mt-2 pt-2 border-t border-borderSubtle/60">
          <TrendLine points={recent} />
          <div className="flex justify-between font-mono text-micro text-textMuted">
            <span>15m ago</span>
            <span>latest</span>
          </div>
        </div>
      )}
    </>
  );
};

/**
 * Dealer positioning by strike — one signed net-gamma band per strike on a
 * continuous price axis, gold where dealers are short gamma and blue where they
 * are long.
 *
 * Bands are absolutely positioned rather than stacked, which is what lets the
 * same 21 strikes render at 190px and at 520px with nothing elided and nothing
 * scrolling. Because bands tile and are centered on their strike, the boundary
 * between two of them is the midpoint of the pair — exactly exposure.ts's
 * definition of the gamma flip — so the seam where the fill changes colour is
 * provably the engine's level rather than an interpolation of it.
 *
 * Chrome is measured, never configured: the three hosts hand this component
 * wildly different boxes and one of them is user-resizable, so any size a call
 * site could pass would be wrong the moment someone drags the handle.
 */
const PositioningMap = ({ data, hoverStrike, selectedStrike, onHoverStrike, onSelectStrike }: PositioningMapProps) => {
  const { ticker, expiry, strikes, levels, zones, bias, netGex } = data;
  const interactive = !!onSelectStrike;

  const rootRef = useRef<HTMLDivElement | null>(null);
  const bandRefs = useRef<(HTMLDivElement | null)[]>([]);
  const plotRef = useRef<HTMLDivElement | null>(null);
  const spotTagRef = useRef<HTMLSpanElement | null>(null);
  const flipTagRef = useRef<HTMLSpanElement | null>(null);

  const [root, setRoot] = useState({ w: 0, h: 0 });
  const [tier, setTier] = useState<Tier>('FULL');
  const [hoverRow, setHoverRow] = useState<StrikeExposure | null>(null);
  const [cursor, setCursor] = useState({ x: 0, y: 0 });
  const [focusStrike, setFocusStrike] = useState<number | null>(null);
  const [rovingIdx, setRovingIdx] = useState(0);
  const [announce, setAnnounce] = useState('');

  // Seeded before the observer attaches, so the panel never paints one frame at
  // the wrong tier and then snaps.
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const read = (w: number, h: number) => {
      const rw = Math.round(w);
      const rh = Math.round(h);
      setRoot(prev => (prev.w === rw && prev.h === rh ? prev : { w: rw, h: rh }));
      setTier(prev => tierFor(h, prev));
    };
    const r = el.getBoundingClientRect();
    read(r.width, r.height);
    const ro = new ResizeObserver(entries => {
      const c = entries[0]?.contentRect;
      if (c) read(c.width, c.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [strikes.length]);

  const rootW = root.w;
  const showDerived = tier !== 'MICRO';
  const railW = tier === 'MICRO' ? RAIL_EDGE_W : rootW >= W_RAIL ? RAIL_W : RAIL_EDGE_W;
  const headerH = tier === 'MICRO' ? HEADER_H_MICRO : HEADER_H;
  // The plot box is derived from the chrome rather than measured. Every height
  // here is a constant this file also renders with, so the two cannot drift, and
  // a retier lands in the same commit instead of one frame later.
  const plot = {
    w: Math.max(0, Math.min(rootW, PLOT_CAP) - GUTTER_W - railW),
    h: Math.max(0, root.h - headerH - (showDerived ? AXIS_H : 0) - (tier === 'FULL' ? FOOTER_H : 0)),
  };

  const netMax = useMemo(() => netMaxOf(strikes), [strikes]);
  // The book's king, not the heaviest bar in this window. Crowning whatever is
  // biggest on screen had this panel and the levels rail naming different kings
  // on the same instrument, and it moved as the window resized. When the real
  // king sits outside the rendered range no row is crowned, which is the honest
  // answer rather than promoting a runner-up.
  const king = levels.king;
  const scale = useMemo(() => priceScale(strikes, plot.h), [strikes, plot.h]);
  const bandList = useMemo(() => buildBands(strikes, plot.h), [strikes, plot.h]);

  const anchor = useMemo(
    () => (selectedStrike != null && strikes.some(s => s.strike === selectedStrike) ? selectedStrike : levels.spot),
    [selectedStrike, strikes, levels.spot]
  );
  const cum = useMemo(() => cumulative(strikes, anchor), [strikes, anchor]);
  const cumHalf = useMemo(() => cumHalfOf(strikes), [strikes]);

  // Raw whole-book values ~15 minutes back, rescaled per strike by the SAME
  // effective multiplier this view applied to the live value — so the ghost and
  // the band are always on one scale, never a raw-vs-scaled mismatch.
  const prior = useMemo(() => {
    const snaps = Simulator.getGexHistory(ticker) ?? [];
    if (snaps.length < 2) return new Map<number, number>();
    const nowMap = new Map(snaps[snaps.length - 1].levels.map(l => [l.strike, l.value]));
    const pastMap = new Map(snaps[Math.max(0, snaps.length - 16)].levels.map(l => [l.strike, l.value]));
    const out = new Map<number, number>();
    for (const row of strikes) {
      const rawNow = nowMap.get(row.strike);
      const rawPast = pastMap.get(row.strike);
      if (rawNow == null || rawPast == null || rawNow === 0) continue;
      out.set(row.strike, rawPast * (row.gex.net / rawNow));
    }
    return out;
  }, [ticker, strikes]);

  // ±1σ expected move off the symbol's IV — the straddle-implied daily range
  const iv = Simulator.TICKERS[ticker]?.iv ?? 0.2;
  const em = levels.spot * iv * Math.sqrt(1 / 252);

  const bandH = strikes.length ? plot.h / strikes.length : 0;
  const labelsOn = showDerived && rootW >= W_LABEL && bandH >= 13;
  const spine = plot.w / 2;
  const usableHalf = Math.max(4, plot.w / 2 - (labelsOn ? LABEL_PAD_ON : LABEL_PAD_OFF));
  const xNet = useCallback(
    (v: number) => Math.max(-usableHalf, Math.min(usableHalf, (v / netMax) * usableHalf)),
    [netMax, usableHalf]
  );
  const xCum = useCallback(
    (v: number) => Math.max(-usableHalf, Math.min(usableHalf, (v / cumHalf) * usableHalf)),
    [cumHalf, usableHalf]
  );

  // exposure.ts:113 initialises flip = spot and leaves it there when the book
  // never changes sign. Two coincident rules is worse than one honest one.
  const flipDegenerate = Math.abs(levels.flip - levels.spot) < scale.step / 4;
  const flipPct = ((levels.flip - levels.spot) / levels.spot) * 100;

  /*
    WHERE THE TWO OPAQUE MARKERS SIT, IN PLOT-LOCAL X.

    A bar's value label is drawn in the gutter past its own end, and both
    gutters already hold something: the right one carries the spot marker's
    ticker and price pill, the left one the FLIP badge. On the band each marker
    crosses, the label and the marker were laid out independently and printed on
    top of each other — `$205.6M` under `SPY 502.19` on the right, `-$134.6M`
    under `FLIP 498.50 · 0.70% BELOW SPOT` on the left. Both are the strikes
    nearest the money, which carry the ladder's widest bars, so the collision
    lands on the two rows a reader is most likely to be reading.

    Neither edge can be reserved by a constant. The spot pill's left edge moves
    with the ticker's glyph count and the price's digit count; the flip badge's
    right edge moves with whether the percentage is shown. So they are measured,
    once per layout, and the label for those two bands is clamped to what is
    left. Nothing is hidden and nothing moves on any other row.
  */
  const [markers, setMarkers] = useState<MarkerBox>(NO_MARKERS);
  useLayoutEffect(() => {
    const plotEl = plotRef.current;
    if (!plotEl) return;
    const measure = () => {
      const box = plotEl.getBoundingClientRect();
      const spot = spotTagRef.current?.getBoundingClientRect();
      const flip = flipTagRef.current?.getBoundingClientRect();
      const next: MarkerBox = {
        spotLeft: spot ? spot.left - box.left : Infinity,
        spotTop: spot ? spot.top - box.top : Infinity,
        spotBottom: spot ? spot.bottom - box.top : -Infinity,
        flipRight: flip ? flip.right - box.left : 0,
        flipTop: flip ? flip.top - box.top : Infinity,
        flipBottom: flip ? flip.bottom - box.top : -Infinity,
      };
      setMarkers(prev => (sameBox(prev, next) ? prev : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(plotEl);
    if (spotTagRef.current) ro.observe(spotTagRef.current);
    if (flipTagRef.current) ro.observe(flipTagRef.current);
    return () => ro.disconnect();
    /*
      The deps are everything that can move a marker, measured synchronously
      BEFORE paint so a label is never placed against last render's geometry: the
      plot box, the tier that decides what renders, and the marker content
      itself — a longer ticker or a fourth price digit shifts the pill's left
      edge, and the percentage suffix changes the badge's right edge.

      Deliberately NOT an empty dep list and NOT dep-less. Dep-less would re-run
      on every `setCursor` from a mousemove, which is three forced layouts per
      pointer event on a 21-band chart for no new information. The observer is
      the backstop for a resize this list cannot see.
    */
  }, [plot.w, plot.h, showDerived, flipDegenerate, tier, ticker, levels.spot, levels.flip]);

  /*
    EVERY band a marker's text can land on, not the one band its centre line
    falls in.

    The first cut used `findIndex` on the marker's y, and a sweep of 8 tickers x
    6 horizons x 3 widths still found 37 collisions in 144 cases. A marker is
    17-19px tall against ~20px bands, so it routinely straddles two rows, and on
    the row it merely clips the label was still drawn in the gutter under it.
    The test is an intersection between the marker's own vertical extent and
    where a band's text is inked, which is what the eye is actually judging.
  */
  const bandsUnder = useCallback(
    (top: number, bottom: number) => {
      const hit = new Set<number>();
      bandList.forEach((b, i) => {
        const mid = b.top + b.height / 2;
        if (top < mid + LABEL_HALF_H && bottom > mid - LABEL_HALF_H) hit.add(i);
      });
      return hit;
    },
    [bandList]
  );
  const spotBands = useMemo(
    () => bandsUnder(markers.spotTop, markers.spotBottom),
    [bandsUnder, markers.spotTop, markers.spotBottom]
  );
  // Empty when the flip is degenerate: no badge is rendered, so the left gutter
  // is clear and every negative label keeps its normal placement.
  const flipBands = useMemo(
    () => (flipDegenerate ? new Set<number>() : bandsUnder(markers.flipTop, markers.flipBottom)),
    [bandsUnder, markers.flipTop, markers.flipBottom, flipDegenerate]
  );

  const activeStrike = hoverStrike ?? hoverRow?.strike ?? focusStrike ?? null;
  const activeBand = bandList.find(b => b.strike === activeStrike);

  const significant = useMemo(() => {
    const set = new Set<number>([levels.callWall, levels.putWall, levels.pin, king]);
    let above: number | null = null;
    let below: number | null = null;
    for (const s of strikes) {
      if (s.strike >= levels.spot) above = s.strike;
      if (below == null && s.strike <= levels.spot) below = s.strike;
    }
    if (above != null) set.add(above);
    if (below != null) set.add(below);
    return set;
  }, [strikes, levels.callWall, levels.putWall, levels.pin, levels.spot, king]);

  const roleOf = useCallback(
    (row: StrikeExposure): { tone: Tone; label: string } => {
      if (row.strike === king) return { tone: 'magenta', label: 'KING' };
      if (row.strike === levels.callWall) return { tone: 'bull', label: 'CALL WALL' };
      if (row.strike === levels.putWall) return { tone: 'bear', label: 'PUT WALL' };
      const callHeavy = Math.abs(row.gex.call) >= Math.abs(row.gex.put);
      return { tone: callHeavy ? 'bull' : 'bear', label: callHeavy ? 'CALL-HEAVY' : 'PUT-HEAVY' };
    },
    [king, levels.callWall, levels.putWall]
  );

  const bandLabel = useCallback(
    (row: StrikeExposure): string => {
      const tags: string[] = [];
      if (row.pin) tags.push('pin');
      if (row.strike === levels.callWall) tags.push('call wall');
      if (row.strike === levels.putWall) tags.push('put wall');
      if (row.strike === king) tags.push('largest exposure');
      const net = row.gex.net;
      return `Strike ${fmtStrike(row.strike)}, net gamma ${net < 0 ? 'negative' : 'positive'} ${fmtUsd(
        Math.abs(net)
      )}, dealer ${net < 0 ? 'short' : 'long'} gamma${tags.length ? `, ${tags.join(', ')}` : ''}`;
    },
    [king, levels.callWall, levels.putWall]
  );

  const moveTo = useCallback(
    (next: number) => {
      const i = Math.max(0, Math.min(strikes.length - 1, next));
      setRovingIdx(i);
      bandRefs.current[i]?.focus();
      setFocusStrike(strikes[i].strike);
      setAnnounce(bandLabel(strikes[i]));
      onHoverStrike?.(strikes[i].strike);
    },
    [strikes, bandLabel, onHoverStrike]
  );

  const onBandKeyDown = useCallback(
    (e: React.KeyboardEvent, i: number, strike: number) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        moveTo(e.key === 'ArrowUp' ? i - 1 : e.key === 'ArrowDown' ? i + 1 : e.key === 'Home' ? 0 : strikes.length - 1);
        return;
      }
      rowKeyDown(() => onSelectStrike?.(strike))(e);
    },
    [moveTo, onSelectStrike, strikes.length]
  );

  // Geometry churn during a drag must not re-key the overlays into a cross-fade,
  // so the keys carry the values only.
  const ribbonKey = useMemo(
    () => `${anchor}|${strikes.map(s => (cum.get(s.strike) ?? 0).toFixed(0)).join(',')}`,
    [anchor, strikes, cum]
  );
  const ghostKey = useMemo(() => strikes.map(s => (prior.get(s.strike) ?? 0).toFixed(0)).join(','), [strikes, prior]);

  const prevAnchor = useRef(anchor);
  const reAnchored = prevAnchor.current !== anchor;
  useEffect(() => {
    prevAnchor.current = anchor;
  }, [anchor]);

  const ribbonPath = useMemo(() => {
    if (!showDerived || bandList.length === 0 || plot.w === 0) return null;
    const anchorY = scale.yOf(anchor);
    const pts: [number, number][] = [];
    let placed = false;
    for (const b of bandList) {
      if (!placed && b.center > anchorY) {
        pts.push([spine, anchorY]);
        placed = true;
      }
      pts.push([spine + xCum(cum.get(b.strike) ?? 0), b.center]);
    }
    if (!placed) pts.push([spine, anchorY]);
    const line = pts.map(p => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ');
    const area = `M ${spine},${pts[0][1].toFixed(2)} L ${line.replace(/ /g, ' L ')} L ${spine},${pts[
      pts.length - 1
    ][1].toFixed(2)} Z`;
    return { line, area };
  }, [showDerived, bandList, plot.w, scale, anchor, spine, xCum, cum]);

  const ghostPaths = useMemo(() => {
    if (!showDerived || bandList.length === 0 || plot.w === 0) return [];
    // Stepped, not smoothed: the ghost has to be comparable to the bands it sits
    // against, and exposure exists at strikes and nowhere between them.
    return ghostRuns(bandList, prior).map(run =>
      run
        .map((b, i) => {
          const x = (spine + xNet(prior.get(b.strike) ?? 0)).toFixed(2);
          return `${i === 0 ? 'M' : 'L'} ${x},${b.top.toFixed(2)} L ${x},${(b.top + b.height).toFixed(2)}`;
        })
        .join(' ')
    );
  }, [showDerived, bandList, plot.w, prior, spine, xNet]);

  const zoneSpans = useMemo(
    () =>
      zones
        .map(z => {
          const inZone = bandList.filter(b => b.strike <= z.from && b.strike >= z.to);
          if (inZone.length === 0) return null;
          const top = inZone[0].top;
          const last = inZone[inZone.length - 1];
          return { zone: z, top, height: last.top + last.height - top };
        })
        .filter((v): v is { zone: ZoneBand; top: number; height: number } => v !== null),
    [zones, bandList]
  );

  /*
    Which strike labels the gutter can actually FIT.

    The rule was `bandH >= 14 || significant.has(strike) || …`, which reads as a
    density guard and is not one: a "significant" strike printed regardless of
    what sat next to it. On a dense ladder the flip and the spot are usually
    ADJACENT strikes, so 498 and 497 rendered one on top of the other — two
    numbers in the same twelve pixels, which is worse than printing neither.

    A real collision pass instead. Candidates are ranked — what the reader
    selected or is hovering first, then the named levels (king, pin, walls),
    then the plain rungs — and placed greedily, skipping any whose centre falls
    within LABEL_MIN_PX of one already placed. The order matters: at equal
    footing the important label takes the slot rather than whichever happened to
    come first down the ladder.

    The 1σ caption shares this lane but is positioned off `emTop`, which is
    computed past an early return and so cannot be a dependency here without
    breaking rules-of-hooks. It is excluded at the render site, where emTop is
    in scope.
  */
  const labelled = useMemo(() => {
    // 10px type on a 12px line — two labels closer than this touch.
    const LABEL_MIN_PX = 13;
    const rank = (strike: number): number => {
      if (selectedStrike === strike || activeStrike === strike) return 0;
      if (strike === king || strike === levels.pin) return 1;
      if (strike === levels.callWall || strike === levels.putWall) return 2;
      if (significant.has(strike)) return 3;
      // A plain rung is only a candidate when the ladder is loose enough that
      // every band could carry one.
      return bandH >= 14 ? 4 : Infinity;
    };
    const taken: number[] = [];
    const out = new Set<number>();
    for (const c of bandList
      .map(b => ({ strike: b.strike, center: b.center, r: rank(b.strike) }))
      .filter(c => Number.isFinite(c.r))
      .sort((a, b) => a.r - b.r || a.center - b.center)) {
      if (taken.some(t => Math.abs(t - c.center) < LABEL_MIN_PX)) continue;
      taken.push(c.center);
      out.add(c.strike);
    }
    return out;
  }, [bandList, bandH, significant, selectedStrike, activeStrike, king, levels.pin, levels.callWall, levels.putWall]);

  if (strikes.length === 0) {
    return <EmptyState title="NO STRIKES IN WINDOW" size="sm" fill />;
  }

  const anchorWord = anchor === levels.spot ? 'spot' : fmtStrike(anchor);
  const anchorLabel = `CUM FROM ${anchorWord === 'spot' ? 'SPOT' : anchorWord}`;

  /*
    A BAR'S VALUE, PLACED SO IT NEVER PRINTS ON A MARKER.

    Default is the gutter past the bar's own end, which is where 19 of the 21
    rows put it and where it has always gone. The two exceptions are the bands
    the opaque markers cross: there the label moves INSIDE its own bar and is
    clamped to stop at the marker's edge, so the number keeps its row, keeps its
    side of the spine, and stops at the pill instead of running under it.

    `text-ink` on a filled band — #0a0a0a over longGamma at 0.88 opacity
    measures 5.7:1 and over shortGamma 10.6:1, both past AA for this size.

    A bar too thin to hold the text keeps the outside placement: a thin bar's
    label lands far from the plot edge on the right, and far from left:0 on the
    left, so it is clear of both markers by construction.
  */
  const insideLabel = (v: number, left: number, width: number, align: 'left' | 'right') => (
    <span
      className={`absolute top-1/2 -translate-y-1/2 font-mono text-micro font-semibold tnum text-ink pointer-events-none whitespace-nowrap ${
        align === 'right' ? 'pr-1.5 text-right' : 'pl-1.5'
      }`}
      style={{ left, width }}
    >
      {fmtUsd(v)}
    </span>
  );

  const posLabel = (i: number, v: number, w: number) => {
    // A positive bar spans [spine, spine + w]; its label goes in the gutter past
    // the end. The spot marker's ticker + pill own [spotLeft, the plot's right].
    const outerLeft = spine + w + 4;
    if (!spotBands.has(i) || outerLeft + LABEL_W <= markers.spotLeft) {
      return (
        <span
          className="absolute top-1/2 -translate-y-1/2 pl-1 font-mono text-micro tnum text-textSecondary pointer-events-none whitespace-nowrap"
          style={{ left: outerLeft }}
        >
          {fmtUsd(v)}
        </span>
      );
    }
    // Right-aligned inside the bar so the digits END at the pill, never under
    // it. If the clear part of the bar cannot hold them, the row prints no
    // value: the marker is what that row is for, and the number is still in the
    // band's own aria-label and in the hover card.
    const room = Math.min(w, markers.spotLeft - spine);
    return room >= LABEL_W ? insideLabel(v, spine, room, 'right') : null;
  };

  const negLabel = (i: number, v: number, w: number) => {
    // A negative bar spans [spine - w, spine]; its label is right-aligned in the
    // gutter [0, spine - w]. The FLIP badge owns [0, flipRight].
    const outerRight = spine - w - 4;
    if (!flipBands.has(i) || outerRight - LABEL_W >= markers.flipRight) {
      return (
        <span
          className="absolute top-1/2 -translate-y-1/2 text-right pr-1 font-mono text-micro tnum text-textSecondary pointer-events-none"
          style={{ left: 0, width: Math.max(0, outerRight) }}
        >
          {fmtUsd(v)}
        </span>
      );
    }
    // Left-aligned inside the bar, starting past the badge. Same fallback.
    const start = Math.max(spine - w, markers.flipRight);
    const room = spine - start;
    return room >= LABEL_W ? insideLabel(v, start, room, 'left') : null;
  };

  const railLabelled = railW >= RAIL_W;
  const emTop = scale.yOf(levels.spot + em);
  const emBottom = scale.yOf(levels.spot - em);

  const readOnlyLabel =
    `Dealer positioning, ${ticker} ${expiry}. ${strikes.length} strikes. ` +
    `Spot ${fmtStrike(levels.spot)}. Gamma flip ${fmtStrike(levels.flip)}, ${Math.abs(flipPct).toFixed(2)}% ${
      flipPct >= 0 ? 'above' : 'below'
    } spot. Dealers ${levels.spot >= levels.flip ? 'long' : 'short'} gamma at spot. ` +
    `Call wall ${fmtStrike(levels.callWall)}, put wall ${fmtStrike(levels.putWall)}, pin ${fmtStrike(
      levels.pin
    )}, largest exposure ${fmtStrike(king)}.`;

  const legend = [
    {
      label: preserveGreek(rootW >= W_LEGEND_LONG ? 'Short γ · moves amplified' : 'Short γ'),
      kind: 'square' as const,
      color: SHORT_GAMMA,
    },
    {
      label: preserveGreek(rootW >= W_LEGEND_LONG ? 'Long γ · dips absorbed' : 'Long γ'),
      kind: 'square' as const,
      color: LONG_GAMMA,
    },
    {
      label: rootW >= W_LEGEND_LONG ? 'cumulative from spot' : 'Cum',
      kind: 'line' as const,
      swatchClass: 'bg-textPrimary/55',
    },
    { label: rootW >= W_LEGEND_LONG ? '15m ago' : '15m', kind: 'dashed' as const, swatchClass: 'border-textPrimary/35' },
  ];

  return (
    <div ref={rootRef} className="flex flex-col h-full min-h-0 relative">
      {/* Header — the book's directional regime (bull/bear, genuinely market
          direction) beside the dealer-inventory sign (gold/blue). Two systems,
          each on its own quantity. */}
      <div
        className="shrink-0 flex items-center gap-2 px-2 border-b border-borderSubtle select-none"
        style={{ height: headerH }}
      >
        <SignalBadge tone={BIAS_TONE[bias]}>{DEALER_BIAS_LABEL[bias]}</SignalBadge>
        <span className="font-mono text-micro font-semibold uppercase tracking-wider text-textMuted tnum whitespace-nowrap">
          NET{' '}
          <span style={{ color: netGex < 0 ? SHORT_GAMMA : LONG_GAMMA }}>
            {netGex >= 0 ? '+' : ''}
            {fmtUsd(netGex)}
          </span>
        </span>
        {showDerived && (
          /* `truncate` and `min-w-0`, not `whitespace-nowrap` alone. On a phone
             this label plus the NET read beside it measured 398px against a
             390px viewport and put a horizontal scrollbar on the whole page —
             a caption for the ghost line, costing the desk its layout. It gives
             way now; the ghost is still in the legend below. */
          <span className="ml-auto min-w-0 truncate font-mono text-micro uppercase tracking-widest text-textMuted tnum">
            {anchorLabel}
            {!railLabelled && ` ±${fmtUsd(cumHalf)}`}
          </span>
        )}
      </div>

      {/* The plot stack is capped: at the landing's ~1050px an uncapped plot
          gives every band a 55:1 aspect ratio, which is the hairline this
          redesign exists to fix. Capping here rather than at a call site means
          no host has to know. */}
      <div className="flex-grow min-h-0 w-full mx-auto flex flex-col" style={{ maxWidth: PLOT_CAP }}>
        <div className="flex-grow min-h-0 flex">
          <span aria-hidden="true" className="block w-0 shrink-0" style={{ height: PLOT_FALLBACK_H }} />
          {/* Lane A — gutter */}
          <div className="relative shrink-0 select-none" style={{ width: GUTTER_W }} aria-hidden="true">
            {bandList.map((b, i) => {
              const row = strikes[i];
              /* Fits its own slot (see `labelled`) — and is not sitting where the
                 1σ caption already is. The caption is `-translate-y-full` off
                 emTop, so it occupies roughly [emTop-13, emTop+1]; a label
                 centred at c occupies [c-7, c+7]. Written as the real interval
                 overlap rather than a symmetric window around emTop, which was
                 the first attempt and left "503" clipping the caption by 7px
                 because the caption is not centred on its anchor. */
              const capTop = emTop - 13;
              const capBottom = emTop + 1;
              const show =
                labelled.has(b.strike) &&
                !(showDerived && b.center - 7 < capBottom && b.center + 7 > capTop);
              const rail =
                b.strike === king ? 'rail-king' : row.pin ? 'rail-neutral' : '';
              return (
                <React.Fragment key={b.strike}>
                  {rail && (
                    <span className={`absolute w-[2px] ${rail}`} style={{ top: b.top, height: b.height, right: 5 }} />
                  )}
                  {show && (
                    <span
                      className={`absolute right-[9px] -translate-y-1/2 font-mono text-micro tnum whitespace-nowrap ${
                        selectedStrike === b.strike ? 'text-select' : 'text-textSecondary'
                      }`}
                      style={{ top: b.center }}
                    >
                      {fmtStrike(b.strike)}
                      {row.pin && <span className="ml-0.5 font-bold text-textPrimary">pin</span>}
                    </span>
                  )}
                </React.Fragment>
              );
            })}
            {/* ±1σ as the range it actually is — one vertical bracket instead of
                two full-width dashed rules competing with everything else. */}
            {showDerived && (
              <>
                <span
                  className="absolute w-[2px] bg-textSecondary/40"
                  style={{ right: 0, top: emTop, height: Math.max(0, emBottom - emTop) }}
                />
                <span className="absolute h-px w-[5px] bg-textSecondary/40" style={{ right: 0, top: emTop }} />
                <span className="absolute h-px w-[5px] bg-textSecondary/40" style={{ right: 0, top: emBottom }} />
                <span
                  className="absolute right-0 -translate-y-full font-mono text-micro text-textMuted whitespace-nowrap"
                  style={{ top: emTop }}
                >
                  {preserveGreek('1σ')}
                </span>
              </>
            )}
          </div>

          {/* Lane B — the plot */}
          <div
            ref={plotRef}
            className="relative flex-1 min-w-0 overflow-hidden"
            role={interactive ? 'group' : 'img'}
            aria-label={interactive ? 'Dealer positioning by strike' : readOnlyLabel}
            onMouseMove={e => setCursor({ x: e.clientX, y: e.clientY })}
            onMouseLeave={() => {
              setHoverRow(null);
              onHoverStrike?.(null);
            }}
            onBlur={e => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocusStrike(null);
            }}
          >
            {/* Regime wash — its height IS the distance to regime change. */}
            {!flipDegenerate && (
              <div
                className="absolute inset-x-0 pointer-events-none"
                style={{
                  top: Math.min(scale.yOf(levels.spot), scale.yOf(levels.flip)),
                  height: Math.abs(scale.yOf(levels.flip) - scale.yOf(levels.spot)),
                  background: `${levels.spot < levels.flip ? SHORT_GAMMA : LONG_GAMMA}08`,
                }}
              />
            )}

            <span className="absolute top-0 bottom-0 w-px bg-borderMuted pointer-events-none" style={{ left: spine }} />

            {bandList.map((b, i) => {
              const row = strikes[i];
              const v = row.gex.net;
              const w = Math.abs(xNet(v));
              const selected = selectedStrike === b.strike;
              const activate = () => onSelectStrike?.(b.strike);
              return (
                <div
                  key={b.strike}
                  ref={el => {
                    bandRefs.current[i] = el;
                  }}
                  // A bare `transition-colors` inherits the house curve at
                  // DUR.fast from tailwind.config, which is the selection wash.
                  className={`absolute inset-x-0 transition-colors ${interactive ? ROW_INTERACTIVE : ''} ${
                    selected ? 'inst-selected' : ''
                  }`}
                  /*
                    WCAG 2.2 SC 2.5.8 "Essential": a band's height and position
                    ARE the price axis. Padding it to 24px would put the strike
                    somewhere it isn't, which is a worse defect than a small
                    target. The keyboard path is the accessible route through
                    this rail — roving tabindex, arrow keys, Enter — and it is
                    wired directly below. Declared here rather than skipped
                    silently in the audit so the claim is visible in review.
                  */
                  data-target-size="essential"
                  style={{ top: b.top, height: b.height }}
                  onMouseEnter={() => {
                    setHoverRow(row);
                    onHoverStrike?.(b.strike);
                  }}
                  onClick={interactive ? activate : undefined}
                  {...(interactive
                    ? {
                        ...interactiveRowProps(activate, selected),
                        'aria-label': bandLabel(row),
                        tabIndex: i === rovingIdx ? 0 : -1,
                        onKeyDown: (e: React.KeyboardEvent) => onBandKeyDown(e, i, b.strike),
                        onFocus: () => {
                          setRovingIdx(i);
                          setFocusStrike(b.strike);
                        },
                      }
                    : { 'aria-hidden': true })}
                >
                  <motion.span
                    className="absolute inset-y-0 pointer-events-none"
                    initial={false}
                    animate={{ left: v < 0 ? spine - w : spine, width: w < 0.5 ? 0 : w }}
                    transition={{ duration: DUR.data, ease: EASE }}
                    style={{ background: v < 0 ? SHORT_GAMMA : LONG_GAMMA, opacity: 0.88 }}
                  />
                  {labelsOn && (v < 0 ? negLabel(i, v, w) : posLabel(i, v, w))}
                </div>
              );
            })}

            {/* Ribbon + ghost cross-fade rather than tween: framer cannot tween a
                points string, and recomputing 21 vertices a frame in up to three
                mounted instances buys nothing at a 10s scan cadence. */}
            {showDerived && plot.w > 0 && (
              <svg
                className="absolute inset-0 pointer-events-none"
                width={plot.w}
                height={plot.h}
                aria-hidden="true"
              >
                <AnimatePresence initial={false}>
                  {ghostPaths.length > 0 && (
                    <motion.g
                      key={`ghost-${ghostKey}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: DUR.data, ease: EASE }}
                    >
                      {ghostPaths.map((d, i) => (
                        <path key={i} d={d} fill="none" stroke={INK} strokeOpacity={0.35} strokeWidth={1} />
                      ))}
                    </motion.g>
                  )}
                </AnimatePresence>
                <AnimatePresence initial={false}>
                  {ribbonPath && (
                    <motion.g
                      key={`cum-${ribbonKey}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: reAnchored ? DUR.fast : DUR.data, ease: EASE }}
                    >
                      <path d={ribbonPath.area} fill={INK} fillOpacity={0.08} stroke="none" />
                      <polyline
                        points={ribbonPath.line}
                        fill="none"
                        stroke={INK}
                        strokeOpacity={0.55}
                        strokeWidth={1.25}
                        strokeLinejoin="round"
                      />
                    </motion.g>
                  )}
                </AnimatePresence>
              </svg>
            )}

            {/* The flip is the seam where the fill changes colour, and the seam is
                a band boundary, so it is the engine's midpoint and not a redraw of
                it. Only levels.flip is labelled: a book with a second sign change
                shows it, and claims nothing about it. */}
            {!flipDegenerate && (
              <>
                <span
                  className="absolute inset-x-0 h-0 border-t border-flip pointer-events-none"
                  style={{ top: scale.yOf(levels.flip) }}
                />
                <span
                  ref={flipTagRef}
                  className="absolute left-0 -translate-y-1/2 inline-flex items-center rounded-[3px] border border-flip/60 bg-canvas px-1.5 py-px font-mono text-micro font-bold uppercase tracking-wider text-flip whitespace-nowrap pointer-events-none"
                  style={{ top: scale.yOf(levels.flip) }}
                >
                  FLIP {fmtStrike(levels.flip)}
                  {showDerived && ` · ${Math.abs(flipPct).toFixed(2)}% ${flipPct >= 0 ? 'above' : 'below'} spot`}
                </span>
              </>
            )}

            {/* Spot, by price — the one full-width horizontal the panel keeps. */}
            <div
              className="absolute inset-x-0 -translate-y-1/2 flex items-center gap-1.5 pointer-events-none"
              style={{ top: scale.yOf(levels.spot) }}
            >
              {/* SpotRule's own root is the flex container, so it needs a block
                  parent to stretch into. */}
              <div className="flex-1 min-w-0">
                <SpotRule ticker={ticker} price={levels.spot} contentRef={spotTagRef} />
              </div>
              {flipDegenerate && (
                <span className="shrink-0 font-mono text-micro font-bold uppercase tracking-wider text-flip whitespace-nowrap">
                  · flip
                </span>
              )}
            </div>

            {activeBand && (
              <>
                <span
                  className="absolute inset-x-0 h-px bg-textPrimary/25 pointer-events-none"
                  style={{ top: activeBand.center }}
                />
                <span
                  className="absolute inset-x-0 border border-textPrimary/40 pointer-events-none"
                  style={{ top: activeBand.top, height: activeBand.height }}
                />
              </>
            )}
          </div>

          {/* Lane C — zones. Semantic green and red live here and never touch the
              paint: bear red washed under gold gamma fill muddies both. */}
          <div className="relative shrink-0 select-none" style={{ width: railW }} aria-hidden="true">
            {zoneSpans.map(({ zone, top, height }) => (
              <React.Fragment key={`${zone.kind}-${zone.from}`}>
                <span
                  className={`absolute rounded-full ${ZONE_STYLE[zone.kind].rail} ${
                    railLabelled ? 'w-[3px] left-0' : 'inset-x-0'
                  }`}
                  style={{ top, height }}
                />
                {railLabelled && (
                  // `CALL WALL` tracked at micro is ~58px; the lane is 64. Bar
                  // and label sit flush left or the longest label overruns.
                  <span
                    className={`absolute left-1.5 font-mono text-micro font-semibold uppercase tracking-wider whitespace-nowrap ${
                      ZONE_STYLE[zone.kind].text
                    }`}
                    style={{ top }}
                  >
                    {zone.label}
                  </span>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Axis — both scales stated, which is what makes two series on one spine
            honest. The map's ceiling is max|net| over the rendered strikes, not
            the engine's max(|put|,|call|,|net|), so it prints the number it used. */}
        {showDerived && (
          <div className="shrink-0 flex items-center select-none" style={{ height: AXIS_H }}>
            <span className="shrink-0" style={{ width: GUTTER_W }} />
            <div className="relative flex-1 min-w-0 font-mono text-micro text-textMuted tnum">
              <span className="absolute left-0 top-1/2 -translate-y-1/2">−{fmtUsd(netMax)}</span>
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">0</span>
              <span className="absolute right-0 top-1/2 -translate-y-1/2">+{fmtUsd(netMax)}</span>
            </div>
            <span
              className="shrink-0 pl-1 font-mono text-micro text-textMuted tnum whitespace-nowrap"
              style={{ width: railW }}
            >
              {railLabelled && `cum ±${fmtUsd(cumHalf)}`}
            </span>
          </div>
        )}
      </div>

      {tier === 'FULL' && (
        <div
          className="shrink-0 flex items-center px-2 border-t border-borderSubtle overflow-hidden"
          style={{ height: FOOTER_H }}
        >
          <ChartLegend variant="square" items={legend} />
        </div>
      )}

      {interactive && (
        <span className="sr-only" aria-live="polite">
          {announce}
        </span>
      )}

      {/* Only when the pointer is genuinely over THIS panel: prop-driven hover
          from the matrix moves the crosshair, it must not conjure a card at a
          stale cursor position. */}
      {hoverRow && (
        <HoverReadout x={cursor.x} y={cursor.y}>
          <StrikeReadout
            row={hoverRow}
            ticker={ticker}
            role={roleOf(hoverRow)}
            cum={cum.get(hoverRow.strike) ?? 0}
            anchorWord={anchorWord}
          />
        </HoverReadout>
      )}
    </div>
  );
};

export default PositioningMap;
