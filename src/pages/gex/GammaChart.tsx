import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Grid3x3, Info } from 'lucide-react';
import { useMarketData } from '../../context/MarketDataContext';
import { useFocus } from '../../context/FocusContext';
import { buildExposureProfile } from '../../data/exposure';
import { buildGexView, fmtUsd, pulseMatrix } from '../../data/gex';
import { buildCommandView } from '../../data/command';
import type { MarketSnapshot } from '../../types/market';
import Panel from '../../components/ui/Panel';
import SegmentedControl from '../../components/ui/SegmentedControl';
import { SkeletonRows } from '../../components/ui/Skeleton';
import GexMatrix from '../../components/gex/GexMatrix';
import PositioningMap from '../../components/gex/PositioningMap';
import type { ExposureExpiry } from '../../types/gex';

/** The heatmap sweeps on its own cadence (10s) so cells don't vibrate every
    tick; the live glyph pulse still folds in per tick via `revision`. */
const SCAN_INTERVAL_MS = 10_000;

// Stable focus id so we can tell when this heatmap is expanded and, only then,
// build the full strike range instead of the spot-centred window.
const HEATMAP_FOCUS_ID = 'pinpoint-gamma-heatmap';

/*
  A level, and how far away it is.

  The distance is the half a trader acts on. A wall at $502.00 is a different
  proposition at 1.0% away than at 0.1%, and reading that off two numbers in
  different corners of the screen is work the panel can do. Every competing
  product in this category prints the gap for the same reason.
*/
const LevelChip = ({
  label,
  value,
  tone,
  spot,
}: {
  label: string;
  value: number;
  tone: string;
  spot: number;
}) => {
  const gap = spot > 0 ? ((value - spot) / spot) * 100 : 0;
  return (
    <span className="inline-flex flex-col leading-tight">
      <span className="font-mono text-micro uppercase tracking-widest text-textMuted">{label}</span>
      <span className={`font-mono text-caption font-semibold tnum ${tone}`}>${value.toFixed(2)}</span>
      {/* Neutral ink: the gap is a DISTANCE, and a distance has no direction to
          borrow green or red for. The arrow already says which side. */}
      <span className="font-mono text-micro tnum text-textMuted">
        {Math.abs(gap) < 0.005 ? 'at spot' : `${gap > 0 ? '↑' : '↓'} ${Math.abs(gap).toFixed(2)}%`}
      </span>
    </span>
  );
};

const PROFILE_EXPIRIES: readonly { value: ExposureExpiry; label: string }[] = [
  { value: '0DTE', label: '0DTE' },
  { value: '1D', label: '1D' },
  { value: '2D', label: '2D' },
  { value: '5D', label: '5D' },
  { value: '7D', label: '7D' },
  { value: 'ALL', label: 'All' },
];

const GammaChart = () => {
  const { activeTicker, marketData } = useMarketData();
  const { focusedId } = useFocus();
  // Expanded (Focus Mode) shows the full chain — every strike; the inline view
  // stays a tighter window centred on spot so it reads without scrolling.
  const fullChain = focusedId === HEATMAP_FOCUS_ID;
  // Expiry spotlight — null = all columns even; else the highlighted column index.
  const [highlightCol, setHighlightCol] = useState<number | null>(null);
  // The hero profile's own horizon. The heatmap's rail highlights a DATE column;
  // this scopes an aggregate window, so they are deliberately separate controls
  // rather than one pretending to drive both.
  const [profileExpiry, setProfileExpiry] = useState<ExposureExpiry>('0DTE');
  // Strike the reader is pointing at / has pinned in the map.
  const [hoverStrike, setHoverStrike] = useState<number | null>(null);
  const [selectedStrike, setSelectedStrike] = useState<number | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => setRevision(r => r + 1), [marketData]);

  // Scan-tier snapshot (10s; ticker switch is immediate).
  const [scan, setScan] = useState<MarketSnapshot | null>(null);
  const scanRef = useRef<MarketSnapshot | null>(null);
  const lastRef = useRef(0);
  useEffect(() => {
    if (!marketData) return;
    const now = Date.now();
    const due =
      !scanRef.current || now - lastRef.current >= SCAN_INTERVAL_MS || scanRef.current.ticker !== marketData.ticker;
    if (due) {
      scanRef.current = marketData;
      lastRef.current = now;
      setScan(marketData);
    }
  }, [marketData]);

  const exposure = useMemo(
    () => (scan ? buildExposureProfile(scan, profileExpiry, 10) : null),
    [scan, profileExpiry]
  );
  const gexView = useMemo(() => (scan ? buildGexView(scan, 'GEX', fullChain ? 20 : 10) : null), [scan, fullChain]);
  const gexLevels = gexView?.levels ?? null;
  // Pulse the matrix glyphs each tick for a live read (geometry stays fixed).
  const matrix = useMemo(() => (gexView ? pulseMatrix(gexView.matrix, revision) : null), [gexView, revision]);
  const vwap = useMemo(() => (scan ? buildCommandView(scan).orderFlow.vwap : null), [scan]);

  if (!scan || !exposure || !gexLevels || !matrix) {
    return (
      <Panel>
        <div className="h-64 overflow-hidden">
          <SkeletonRows rows={5} />
        </div>
      </Panel>
    );
  }

  const longGamma = exposure.netGex >= 0;

  return (
    <div className="flex flex-col gap-4">
      {/*
        Regime banner + key levels.

        The net-gamma figure is inked in the REGIME tokens, not in bull/bear.
        Its sign is not a direction — positive means dealers absorb and the tape
        pins, negative means hedging amplifies whichever way price goes — and the
        heatmap below and the positioning map beside it already say so in blue
        and gold. Green and red here made one number speak two languages on one
        screen. `heatmapRegime.test.ts` holds the line.

        The named LEVELS keep their own identity colours (call wall green, put
        wall red, flip baby-blue, king magenta), because those are not a signed
        quantity — they are four specific prices, and the map's right-hand rail
        labels them in exactly the same four colours.
      */}
      <Panel flush>
        <div className="flex items-center gap-x-6 gap-y-3 flex-wrap px-3.5 py-3">
          <div className="min-w-0">
            <div className="font-mono text-micro uppercase tracking-widest text-textMuted">Dealer gamma @ spot</div>
            <div className="flex items-baseline gap-2.5">
              <span className={`font-mono text-lg font-bold tnum ${longGamma ? 'text-longGamma' : 'text-shortGamma'}`}>
                {longGamma ? '+' : '−'}
                {fmtUsd(Math.abs(exposure.netGex))}
              </span>
              <span
                className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-mono text-micro font-bold uppercase tracking-wider ${
                  longGamma ? 'bg-longGamma/10 text-longGamma' : 'bg-shortGamma/10 text-shortGamma'
                }`}
              >
                <Activity className="w-3 h-3" />
                {longGamma ? 'Long gamma' : 'Short gamma'}
              </span>
            </div>
            <div className="mt-0.5 font-mono text-micro text-textSecondary">
              {longGamma ? 'pinning — dealers dampen moves toward the walls' : 'trending — dealer hedging amplifies the move'}
            </div>
          </div>
          <div className="flex items-center gap-x-4 gap-y-2 flex-wrap ml-auto">
            <LevelChip spot={scan.spot} label="Call Wall" value={gexLevels.callWall} tone="text-bull" />
            <LevelChip spot={scan.spot} label="Flip" value={gexLevels.flip} tone="text-flip" />
            <LevelChip spot={scan.spot} label="Put Wall" value={gexLevels.putWall} tone="text-bear" />
            <LevelChip spot={scan.spot} label="King" value={gexLevels.king} tone="text-king" />
            <LevelChip spot={scan.spot} label="Pin · Max OI" value={exposure.levels.pin} tone="text-textSecondary" />
            {vwap != null && <LevelChip spot={scan.spot} label="VWAP" value={vwap} tone="text-textSecondary" />}
          </div>
        </div>
      </Panel>

      {/*
        THE HERO — dealer gamma against the price axis.

        This desk used to open on the strike x expiry grid, and a grid asks the
        reader to hold the price in their head: the walls were four numbers in
        the corner and the cells were a spreadsheet. Every product in this
        category leads with the same picture instead — exposure by strike, pinned
        to a price axis, with spot and the walls drawn on it — because that is
        the one view where "where is price, and what is above and below it" is a
        glance rather than an arithmetic.

        `PositioningMap` already draws exactly this on Pinpoint > Levels, where
        it sat in a 40%-wide column beside a nine-column table of the same
        numbers. It is the desk's own component, given the width it was designed
        for and the desk whose name it answers. Nothing here is a second copy:
        the same builder, the same component, the same tokens.
      */}
      <Panel
        title="Dealer gamma by strike"
        subtitle="Net GEX against the price axis · spot, walls and the flip drawn where they sit"
        flush
        actions={
          <SegmentedControl
            ariaLabel="Profile horizon"
            options={PROFILE_EXPIRIES}
            value={profileExpiry}
            onChange={setProfileExpiry}
          />
        }
        bodyClassName="p-2"
      >
        <PositioningMap
          data={exposure}
          hoverStrike={hoverStrike}
          selectedStrike={selectedStrike}
          onHoverStrike={setHoverStrike}
          onSelectStrike={strike => setSelectedStrike(cur => (cur === strike ? null : strike))}
        />
      </Panel>

      {/* GEX heatmap — the same book, resolved by expiry. Detail under the hero. */}
      <Panel
        title={
          <span className="inline-flex items-center gap-1.5">
            <Grid3x3 className="w-3.5 h-3.5 text-select" /> Gamma Heatmap
            <span className="rounded border border-borderMuted px-1.5 py-px text-micro tracking-normal text-textSecondary">
              {activeTicker}
            </span>
          </span>
        }
        subtitle={
          fullChain
            ? 'full chain · every strike × expiry'
            : 'the same book resolved by expiry · expand for the full chain'
        }
        flush
        focusable
        focusId={HEATMAP_FOCUS_ID}
        actions={
          /* `max-w-full` was inert here: the Panel header's actions wrapper is
             `shrink-0`, so it sizes to its content and a percentage max-width
             against it resolves to no constraint at all. Seven expiries then
             measured 396px inside a 358px phone column and pushed the whole
             desk sideways. A concrete cap leaves the panel title its room and
             lets the rail scroll — the same treatment the desk subnav uses when
             its tabs outrun the screen. */
          <div className="inline-flex items-center gap-0.5 rounded-md border border-borderSubtle bg-panel p-0.5 max-w-[10rem] sm:max-w-none overflow-x-auto no-scrollbar">
            {['All', ...matrix.expiries].map((label, i) => {
              const col = i === 0 ? null : i - 1;
              const on = highlightCol === col;
              return (
                <button
                  key={label}
                  onClick={() => setHighlightCol(col)}
                  aria-pressed={on}
                  className={`shrink-0 inline-flex items-center min-h-6 rounded px-2 py-1 font-mono text-micro font-semibold uppercase tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-select/60 ${
                    on ? 'bg-select/15 text-select' : 'text-textMuted hover:text-textPrimary'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        }
        // Capped inline; uncapped when expanded so the overlay shows every strike.
        /* Shorter than it was. It led the desk when it was the only visual and
           took most of the viewport for it; under the profile it is the detail
           read, and a detail read that pushes the hero off screen is not one. */
        bodyClassName={fullChain ? 'p-2' : 'h-[26rem] min-h-[260px] p-2'}
      >
        <GexMatrix data={matrix} spot={scan.spot} highlightCol={highlightCol} />
      </Panel>

      {/* Read */}
      <p className="flex items-start gap-2 text-caption text-textSecondary leading-relaxed px-1">
        <Info className="w-3.5 h-3.5 text-textMuted mt-px shrink-0" />
        <span>
          <span className="font-mono font-semibold uppercase tracking-wider mr-1.5 text-textSecondary">Reading the gamma</span>
          The profile above is net dealer gamma by strike against the price axis; the grid resolves the same book by
          expiry. <span className="text-longGamma">Blue</span> is long gamma — dealers absorb, so dips get bought toward
          the walls and the tape pins. <span className="text-shortGamma">Gold</span> is short gamma — hedging amplifies
          whichever way price goes. The sign is a REGIME, not a direction: neither colour says up or down. The nearest
          expiries carry the most gamma, and the flip is the price where the sign turns. Candlesticks live on Pulse —
          this is the positioning read.
        </span>
      </p>
    </div>
  );
};

export default GammaChart;
