import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Info } from 'lucide-react';
import { useMarketData } from '../../context/MarketDataContext';
import { buildExposureProfile } from '../../data/exposure';
import { buildGexView, fmtUsd } from '../../data/gex';
import type { MarketSnapshot } from '../../types/market';
import Panel from '../../components/ui/Panel';
import SegmentedControl from '../../components/ui/SegmentedControl';
import { SkeletonRows } from '../../components/ui/Skeleton';
import PositioningMap from '../../components/gex/PositioningMap';
import type { ExposureExpiry } from '../../types/gex';

/** The heatmap sweeps on its own cadence (10s) so cells don't vibrate every
    tick. The per-tick glyph pulse went with the heatmap — the profile reads the
    scan, and the scan is what paces this desk. */
const SCAN_INTERVAL_MS = 10_000;

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
  const { marketData } = useMarketData();
  /* The hero profile's own horizon. */
  const [profileExpiry, setProfileExpiry] = useState<ExposureExpiry>('0DTE');
  // Strike the reader is pointing at / has pinned in the map.
  const [hoverStrike, setHoverStrike] = useState<number | null>(null);
  const [selectedStrike, setSelectedStrike] = useState<number | null>(null);

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
  /* The window the LEVELS are derived over. Fixed at ±10 now that the desk has
     no Focus-Mode grid to expand — the level rail is the same rail either way. */
  const gexView = useMemo(() => (scan ? buildGexView(scan, 'GEX', 10) : null), [scan]);
  const gexLevels = gexView?.levels ?? null;
  /* The pulsed matrix and the session VWAP left with the panels that read them
     — the grid and the six-card level strip. Both were still being rebuilt on
     every tick to feed nothing: `pulseMatrix` re-glyphs a whole strike x expiry
     grid, and `buildCommandView` builds the entire cockpit to reach one number. */

  if (!scan || !exposure || !gexLevels) {
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
            {/*
              FOUR LEVELS, NOT SIX.

              KING and PIN · MAX OI resolved to the same strike in the measured
              state ($495.00 on both), which is not a coincidence — the king is
              the max-exposure strike and the pin is the max-open-interest one,
              and on a book where exposure follows open interest they land
              together most days. Two cards for one number is worse than one,
              because a reader has to check whether they agree before they can
              ignore one.

              VWAP is not a dealer level at all. It is where the session has
              traded, which belongs on a chart, not in a strip of positioning
              levels — and the profile below already draws spot.

              The four that stay are the four the map's own right-hand rail
              labels: the two walls, the flip, and the king. The pin survives as
              a marker inside the profile, where it sits on its own strike.
            */}
            <LevelChip spot={scan.spot} label="Call Wall" value={gexLevels.callWall} tone="text-bull" />
            <LevelChip spot={scan.spot} label="Flip" value={gexLevels.flip} tone="text-flip" />
            <LevelChip spot={scan.spot} label="Put Wall" value={gexLevels.putWall} tone="text-bear" />
            <LevelChip spot={scan.spot} label="King" value={gexLevels.king} tone="text-king" />
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
        hero
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

      {/*
        THE HEATMAP IS NOT HERE ANY MORE.

        This desk carried four reads of one book at once: the regime banner, the
        strike profile, a strike x expiry grid, and a paragraph explaining the
        grid. Three of them answered the same question and the grid answered it
        worst — a full-bleed wall of ~120 saturated cells, each printing a dollar
        figure to one decimal, which is the densest surface in the product and the
        one nobody reads a number off.

        The expiry dimension it existed for is answered twice already, on this
        same desk, by views built for it: `?view=rolloff` schedules when gamma
        leaves the book, and `?view=dependency` says which expiry the structure is
        resting on. Keeping a third, uglier answer on the default view is not
        extra information, it is the same information taxing every visit.

        The component itself is unchanged and still mounts where a reader ASKS for
        a grid — the Pulse workspace widget and the landing panel loop. What
        changed is that the flagship desk no longer opens with it.
      */}

      {/* Read */}
      <p className="flex items-start gap-2 text-caption text-textSecondary leading-relaxed px-1">
        <Info className="w-3.5 h-3.5 text-textMuted mt-px shrink-0" />
        <span>
          <span className="font-mono font-semibold uppercase tracking-wider mr-1.5 text-textSecondary">Reading the gamma</span>
          Net dealer gamma by strike, against the price axis. <span className="text-longGamma">Blue</span> is long
          gamma — dealers absorb, so dips get bought toward the walls and the tape pins.{' '}
          <span className="text-shortGamma">Gold</span> is short gamma — hedging amplifies whichever way price goes. The
          sign is a REGIME, not a direction: neither colour says up or down, and the flip is the price where it turns.
          For the same book by expiry, use Roll-off and Dependency above.
        </span>
      </p>
    </div>
  );
};

export default GammaChart;
