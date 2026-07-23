import { useEffect, useMemo, useRef, useState } from 'react';
import { useMarketData } from '../../context/MarketDataContext';
import Simulator from '../../core/simulator';
import { buildGexView, pulseMatrix } from '../../data/gex';
import { buildExposureProfile } from '../../data/exposure';
import GexMatrix from '../../components/gex/GexMatrix';
import TickerTag from '../../components/ui/TickerTag';
import type { GexMatrixData } from '../../types/gex';

/** Structure rebuilds on the slow scan; the glyphs pulse every tick. Same
    two-tier cadence the single-ticker Gamma Heatmap uses. */
const SCAN_INTERVAL_MS = 10_000;

interface Column {
  sym: string;
  spot: number;
  changePercent: number;
  longGamma: boolean;
  matrix: GexMatrixData;
}

/**
 * The complex, one screen. Every name in the watchlist gets its own net-gamma
 * heatmap — walls, flip, king and pin regime — lined up side by side so the
 * whole index-and-leaders picture reads at a glance. It's the single-ticker
 * Gamma Heatmap (same GexMatrix, same Slayer heat scale) run across the board.
 */
const ComplexBoard = () => {
  const { activeTicker, marketData } = useMarketData();
  // marketData bumps every tick — drives the per-second glyph pulse.
  const revRef = useRef(0);
  const revision = useMemo(() => ++revRef.current, [marketData]);

  // Slow scan: every ticker's price already advances each tick(); this rebuilds
  // their chains/exposure on the 10s cadence so geometry doesn't churn per tick.
  const [scanTick, setScanTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setScanTick(t => t + 1), SCAN_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  const base = useMemo(
    () =>
      Simulator.WATCHLIST.map(sym => {
        const snap = Simulator.buildSnapshot(sym);
        const gex = buildGexView(snap, 'GEX', 10);
        const exposure = buildExposureProfile(snap, '0DTE', 10);
        return {
          sym,
          spot: snap.spot,
          changePercent: snap.changePercent,
          longGamma: exposure.netGex >= 0,
          matrix: gex.matrix,
        };
      }),
    // activeTicker included so the board re-scans the instant you switch symbols.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scanTick, activeTicker]
  );

  const columns: Column[] = useMemo(
    () => base.map(b => ({ ...b, matrix: pulseMatrix(b.matrix, revision) })),
    [base, revision]
  );

  return (
    <div className="flex flex-col gap-3">
      <p className="font-mono text-micro uppercase tracking-widest text-textMuted">
        {columns.length} names · net gex by strike × expiry · scroll for more →
      </p>

      {/* Board: fixed-width ticker columns in a single horizontal scroll — see a
          few at once, swipe the rest, one per screen on a phone. */}
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
        {columns.map(col => (
          <section
            key={col.sym}
            aria-label={`${col.sym} gamma`}
            className="shrink-0 w-[min(92vw,520px)] inst-surface rounded-md flex flex-col overflow-hidden"
          >
            {/* Ticker header — symbol, spot, change and the pin-vs-trend regime */}
            <header className="flex items-center gap-2 px-3 h-11 border-b border-borderSubtle shrink-0">
              <TickerTag symbol={col.sym} className="font-mono text-label font-bold uppercase tracking-wider text-textPrimary" />
              <span className="font-mono text-caption tnum text-textSecondary">${col.spot.toFixed(2)}</span>
              <span className={`font-mono text-micro tnum ${col.changePercent >= 0 ? 'text-bull' : 'text-bear'}`}>
                {col.changePercent >= 0 ? '+' : ''}
                {col.changePercent.toFixed(2)}%
              </span>
              <span
                className={`ml-auto inline-flex items-center rounded px-1.5 py-0.5 font-mono text-micro font-bold uppercase tracking-wider ${
                  col.longGamma ? 'bg-bull/10 text-bull' : 'bg-bear/10 text-bear'
                }`}
              >
                {col.longGamma ? 'Long Γ' : 'Short Γ'}
              </span>
            </header>

            <div className="h-[clamp(380px,64vh,560px)] p-1.5 min-h-0">
              <GexMatrix data={col.matrix} spot={col.spot} />
            </div>
          </section>
        ))}
      </div>
    </div>
  );
};

export default ComplexBoard;
