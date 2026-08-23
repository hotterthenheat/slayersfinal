import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Columns3, Layers, RotateCcw, Ruler, Waves } from 'lucide-react';
import { useMarketData } from '../../context/MarketDataContext';
import { buildGexView } from '../../data/gex';
import { buildExposureProfile } from '../../data/exposure';
import { expiryCalendar } from '../../core/expiryCalendar';
import Simulator from '../../core/simulator';
import { buildDarkPoolView } from '../../data/darkpool';
import { fmtUsd } from '../../data/gex';
import type { MarketSnapshot } from '../../types/market';
import type { OverlayMode } from '../../types/gex';
import PageHeader from '../../components/ui/PageHeader';
import LayerToggle from '../../components/ui/LayerToggle';
import { SkeletonRows } from '../../components/ui/Skeleton';
import StrikeChart from '../../components/gex/StrikeChart';
import StrikeLadder from '../../components/terrain/StrikeLadder';
import TimeframePicker from '../../components/ui/TimeframePicker';
import { FOCUS_RING } from '../../components/ui/focusRing';
import type { Timeframe } from '../../data/timeframe';

/*
==================================================
  SLAYER TERMINAL - TERRAIN (pages/terrain/Terrain.tsx)

  The house candlestick chart, given the whole screen, with
  every structural layer this product can actually measure
  drawn on it at once.

  Every other desk answers its question in a panel and
  leaves the joining to the reader. Pinpoint draws the
  dealer's book against a price axis of its own; Trace lists
  the off-exchange blocks in a table with no axis at all; the
  chart that could carry both is a 460px tile on a page of
  other tiles. Three pictures, and the overlay happens in
  the reader's head.

  Terrain is that overlay, drawn. Same `StrikeChart` the
  workspace and the landing page already use — the same
  candles, the same walls, the same node heatmap, the same
  pan and zoom — sized to the viewport and given the
  off-exchange shelves as a fourth layer.

  IT IS THE SAME CHART ON PURPOSE. A second charting stack
  for one desk means two answers to where a price sits, two
  crosshairs, two sets of pan-and-zoom behaviour, and a
  reader who has to learn the instrument twice.

  WHAT IS NOT HERE, AND WHY. An order book, a depth ladder
  and a liquidity-void layer would all belong on this
  picture, and none is offered: this product's entitlements
  carry no Level 2 and no NBBO update stream, so those
  layers would have to be invented. A toggle that flips and
  draws a guess is worse than no toggle.
==================================================
*/

/** The book is re-read on the scan cadence; the candles follow every tick. */
const SCAN_INTERVAL_MS = 10_000;

interface LayerSpec {
  key: 'positioning' | 'levels' | 'shelves' | 'ladder';
  label: string;
  icon: typeof Layers;
}

const LAYERS: readonly LayerSpec[] = [
  { key: 'positioning', label: 'Positioning', icon: Layers },
  { key: 'levels', label: 'Levels', icon: Ruler },
  { key: 'shelves', label: 'Dark pool', icon: Waves },
  { key: 'ladder', label: 'Ladder', icon: Columns3 },
];

type LayerKey = LayerSpec['key'];
type LayerState = Record<LayerKey, boolean>;

/*
  Layers live in the URL so a screenshot of this desk is reproducible and a link
  to it carries what the sender was looking at.

  Only the layers that are OFF are written. All on is the default and the common
  case, so the clean URL is the one you get by not touching anything — the
  alternative spells out three names on every visit to say "unchanged".
*/
const PARAM = 'off';

function readLayers(raw: string | null): LayerState {
  const off = new Set((raw ?? '').split(',').filter(Boolean));
  return {
    positioning: !off.has('positioning'),
    levels: !off.has('levels'),
    shelves: !off.has('shelves'),
    ladder: !off.has('ladder'),
  };
}

/**
 * The chart's overlay vocabulary, from our two switches.
 *
 * `OverlayMode` gained `NONE` for this: it encodes two independent layers as
 * one enum, so before Terrain there was no way to express "neither", and both
 * switches off would have silently fallen back to drawing the levels.
 */
function overlayFor(layers: LayerState): OverlayMode {
  if (layers.positioning && layers.levels) return 'BOTH';
  if (layers.positioning) return 'NODES';
  if (layers.levels) return 'LEVELS';
  return 'NONE';
}

const Terrain = () => {
  const { marketData } = useMarketData();
  const [params, setParams] = useSearchParams();
  const layers = readLayers(params.get(PARAM));

  const toggle = (key: LayerKey, on: boolean) => {
    const next = new URLSearchParams(params);
    const value = LAYERS.filter(l => !{ ...layers, [key]: on }[l.key])
      .map(l => l.key)
      .join(',');
    if (value) next.set(PARAM, value);
    else next.delete(PARAM);
    setParams(next, { replace: true });
  };

  /*
    The BOOK is read on the scan cadence, not every tick.

    Same reasoning the Gamma desk already applies: a strike's exposure does not
    meaningfully move in 1.5 seconds, and re-deriving it that often makes the
    node heatmap shimmer. The CANDLES are not throttled — `StrikeChart` folds in
    the newest bar on every `revision` bump, which is what makes it live.
  */
  /*
    Terrain owns the interval and the reset, so the chart can drop its own
    toolbar row.

    `StrikeChart` normally carries a row of its own — legend, pan/zoom hint,
    interval picker, reset — directly under whatever the host put above it. On
    a desk whose whole point is one toolbar and then the picture, that is the
    second toolbar the desk exists to avoid, so the two controls that are
    actually controls move up to the strip and the row goes.
  */
  const [timeframe, setTimeframe] = useState<Timeframe>('1m');
  const [resetSignal, setResetSignal] = useState(0);

  const [scan, setScan] = useState<MarketSnapshot | null>(null);
  const scanRef = useRef<MarketSnapshot | null>(null);
  const lastRef = useRef(0);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!marketData) return;
    setRevision(r => r + 1);
    const now = Date.now();
    const due =
      !scanRef.current ||
      now - lastRef.current >= SCAN_INTERVAL_MS ||
      scanRef.current.ticker !== marketData.ticker;
    if (due) {
      scanRef.current = marketData;
      lastRef.current = now;
      setScan(marketData);
    }
  }, [marketData]);

  const gex = useMemo(() => (scan ? buildGexView(scan, 'GEX', 20) : null), [scan]);
  /*
    ONE LADDER COLUMN PER TICKER — the active symbol first, then the watchlist.

    `buildGexView` answers "where are the levels" for the chart; a ladder needs
    the per-strike window, which is what `buildExposureProfile` returns. Every
    column is built from a snapshot taken on the SAME scan tick, so four columns
    can never be showing four different moments of the session.

    Rebuilt on `scanKey` rather than on `scan`: the columns other than the
    active one come from `Simulator.buildSnapshot`, which is not what
    `useMarketData` republishes, so keying on the scan's identity is what ties
    them to the same instant.
  */
  const scanKey = scan ? `${scan.ticker}:${lastRef.current}` : '';
  const columns = useMemo(() => {
    if (!scan || !layers.ladder) return [];
    const symbols = [scan.ticker, ...Simulator.WATCHLIST.filter(t => t !== scan.ticker)].slice(0, 4);
    return symbols.map(sym => {
      const snap = sym === scan.ticker ? scan : Simulator.buildSnapshot(sym);
      const profile = buildExposureProfile(snap, '0DTE', 15);
      // The nearest expiry this root actually lists, named the way a chain names
      // it — not "0DTE", which is a horizon rather than a date.
      const next = expiryCalendar(sym, 1)[0];
      const label = next
        ? `${next.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} (${next.dte}DTE)`
        : '0DTE';
      return { sym, profile, label, spot: snap.spot };
    });
    // `scanKey` is the dependency that matters; `scan` and `layers.ladder` are
    // read through it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanKey, layers.ladder]);

  /*
    EACH COLUMN IS PAINTED AGAINST ITS OWN BOOK.

    The first cut shared one scale across all four on the reasoning that
    comparable colours let you read the columns against each other. Rendered,
    that argument lost to arithmetic: SPY's book is two orders of magnitude
    bigger than NVDA's, so one shared maximum left three of the four columns
    uniformly near-black. A ladder nobody can read does not become useful by
    being technically comparable.

    And the comparison it was protecting is not one anyone makes. Raw dealer
    gamma dollars across different underlyings is not a like-for-like quantity —
    SPY carries more of everything — so "SPY's cell is brighter than NVDA's" was
    never a finding. What a reader actually wants from a column is where the
    book concentrates WITHIN that name, which is exactly what per-column
    normalisation shows. The dollar figure is printed in every cell for anyone
    who does want the absolute number.
  */
  const ladderMax = (strikes: { gex: { net: number } }[]) => {
    let m = 1;
    for (const s of strikes) m = Math.max(m, Math.abs(s.gex.net));
    return m;
  };
  const pool = useMemo(() => (scan ? buildDarkPoolView(scan) : null), [scan]);

  const shelves = useMemo(
    () => (layers.shelves ? (pool?.levels ?? []) : []),
    [layers.shelves, pool]
  );
  const poolPrints = useMemo(
    () => (layers.shelves ? (pool?.prints ?? []) : []),
    [layers.shelves, pool]
  );
  // The book's net across the drawn window — the one number that says which
  // regime the whole picture is in.
  const netGex = useMemo(() => (gex ? gex.nodes.reduce((a, n) => a + n.value, 0) : 0), [gex]);

  const controls = (
    <>
      <TimeframePicker value={timeframe} onChange={setTimeframe} />
      <button
        type="button"
        onClick={() => setResetSignal(n => n + 1)}
        title="Reset view (or double-click the chart)"
        className={`inline-flex shrink-0 items-center gap-1.5 rounded border border-borderSubtle bg-panel px-2 py-1 font-mono text-micro uppercase tracking-wider text-textSecondary transition-colors hover:border-borderMuted hover:text-textPrimary ${FOCUS_RING}`}
      >
        <RotateCcw className="w-3 h-3" aria-hidden="true" /> Reset
      </button>
      <span className="hidden lg:block w-px h-4 shrink-0 bg-borderSubtle" aria-hidden="true" />
      {LAYERS.map(l => (
        <LayerToggle
          key={l.key}
          label={l.label}
          icon={l.icon}
          checked={layers[l.key]}
          onChange={on => toggle(l.key, on)}
          /* A layer with an empty session behind it says so on the switch
             rather than flipping and drawing nothing. */
          unavailable={
            l.key === 'shelves' && pool && pool.levels.length === 0
              ? 'no off-exchange shelves this session'
              : undefined
          }
        />
      ))}
    </>
  );

  return (
    <>
      <PageHeader
        title="Terrain"
        subtitle="The house chart, full screen — candles with the dealer's book, the walls and the off-exchange shelves on one price axis"
        actions={controls}
        ribbon={
          gex ? (
            <span className="flex items-center gap-4 font-mono text-micro uppercase tracking-wider text-textMuted">
              <span>
                NET{' '}
                <span className={netGex < 0 ? 'text-shortGamma' : 'text-longGamma'}>{fmtUsd(netGex)}</span>
              </span>
              <span>
                {gex.nodes.length} STRIKES · {pool?.levels.length ?? 0} SHELVES
              </span>
            </span>
          ) : undefined
        }
      />

      {/*
        `flex min-h-0 flex-1 flex-col` against the shell's page column is what
        gives this desk the viewport. `min-h-0` is the half that does the work:
        a flex child's default `min-height: auto` refuses to shrink below its
        content, so without it the chart's own minimum height pushes the page
        into a scroll instead of fitting the screen.

        `/terrain` is a viewport-owning route (layout/chromeRoutes.ts), so there
        is no footer under this competing for the same pixels.
      */}
      {/* Chart left, ladders right — the two lanes read against each other on
          the same book at the same instant. */}
      <div className="flex min-h-0 flex-1 gap-3">
      <div className="flex min-h-0 flex-1 flex-col">
        {gex && scan ? (
          <StrikeChart
            ticker={scan.ticker}
            revision={revision}
            levels={gex.levels}
            overlay={overlayFor(layers)}
            timeframe={timeframe}
            onTimeframeChange={setTimeframe}
            showChrome={false}
            resetSignal={resetSignal}
            /* A floor, not a height: the chart is `flex-grow` with `autoSize`,
               so on any real screen it takes the whole lane. The floor only
               matters on a viewport too short to give it one. */
            height={280}
            shelves={shelves}
            poolPrints={poolPrints}
          />
        ) : (
          <SkeletonRows rows={10} />
        )}
      </div>

      {columns.length > 0 && (
        /*
          `hidden … lg:flex`, and `overflow-x-auto` rather than `flex-wrap`.

          Four 168px columns need 672px. Below `lg` the whole page is narrower
          than the rail alone, and a `shrink-0` rail in that lane squeezed the
          chart to ZERO width and put a horizontal scrollbar on the document —
          measured at 390, the desk rendered as a ladder with no chart. Above
          `lg` there is room for both, and the rail scrolls inside itself rather
          than wrapping, which would push a second row of columns off the fold
          on a desk whose whole promise is one screen.

          The layer switch still reads on: it governs whether the columns are
          BUILT, and the reader on a phone is not paying to derive four books
          they cannot see.
        */
        <div className="hidden min-h-0 shrink-0 overflow-x-auto no-scrollbar lg:flex">
          {columns.map(c => (
            <StrikeLadder
              key={c.sym}
              ticker={c.sym}
              expiryLabel={c.label}
              strikes={c.profile.strikes}
              spot={c.spot}
              maxAbs={ladderMax(c.profile.strikes)}
            />
          ))}
        </div>
      )}
      </div>
    </>
  );
};

export default Terrain;
