import { useMemo, useState } from 'react';
import { Layers } from 'lucide-react';
import { buildDarkPoolFeed, type DarkPoolFeedRow } from '../../data/darkpoolfeed';
import { fmtUsd } from '../../data/gex';
import Panel from '../../components/ui/Panel';
import TickerTag from '../../components/ui/TickerTag';
import HoverReadout from '../../components/ui/HoverReadout';

/** Shares → compact (13.51M / 820K). */
const fmtShares = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : `${Math.round(n / 1e3)}K`);

/**
 * Market-wide dark-pool prints, grouped by sector — where off-exchange dollars
 * are concentrating right now across the shared universe. Reads the deterministic
 * feed (buildDarkPoolFeed); swaps for a real consolidated print tape behind the
 * same shape.
 */
const DarkPoolFeed = () => {
  const sectors = useMemo(() => buildDarkPoolFeed(), []);
  const maxSectorNotional = Math.max(...sectors.map(s => s.notional), 1);
  const [hover, setHover] = useState<{ row: DarkPoolFeedRow; sector: string; sectorPct: number; x: number; y: number } | null>(null);

  return (
    <Panel
      title={
        <span className="inline-flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-darkpool" /> Dark-Pool Feed · by sector
        </span>
      }
      subtitle="off-exchange prints across the universe — where the size is going today"
      flush
    >
      {/* Masonry columns, not a grid: sectors vary in row count (Tech 6, Utilities 1),
          so a fixed grid left a ragged half-empty last row. Columns balance by height
          and fill evenly; gap-px + mb-px keep the fused hairline look.

          The count is set by column WIDTH, not by breakpoint. `xl:columns-3`
          capped it at three, so past that width the columns grew instead of
          multiplying: at 2560 each was 804px and every sector header had its
          name 718px from its notional. A 20rem column width holds the four data
          columns comfortably and lets the browser fit as many as the monitor
          affords — two at tablet, four at a laptop, seven at 2560. */}
      <div className="columns-[20rem] gap-px bg-borderSubtle">
        {sectors.map(sec => (
          <div key={sec.sector} className="bg-panel flex flex-col break-inside-avoid mb-px">
            {/* Sector header */}
            <div className="px-3 pt-2.5 pb-2 border-b border-borderSubtle/60">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-mono text-label font-bold uppercase tracking-wider text-textPrimary truncate">
                  {sec.sector}
                </span>
                <span className="font-mono text-caption font-bold tnum text-darkpool shrink-0">{fmtUsd(sec.notional)}</span>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="flex-1 h-1 rounded-full bg-white/[0.05] overflow-hidden">
                  <span
                    className="block h-full rounded-full bg-darkpool/70"
                    style={{ width: `${Math.max(6, (sec.notional / maxSectorNotional) * 100)}%` }}
                  />
                </span>
                <span className="font-mono text-micro text-textMuted tnum shrink-0">{sec.prints} prints</span>
              </div>
            </div>
            {/* Column header */}
            <div className="flex items-center px-3 py-1 font-mono text-micro uppercase tracking-widest text-textMuted border-b border-borderSubtle/40">
              <span className="w-12 shrink-0">Ticker</span>
              <span className="flex-1 text-right">Notional</span>
              <span className="w-14 text-right">%AvgVol</span>
              <span className="w-14 text-right">Size</span>
            </div>
            {/* Rows */}
            <div className="flex flex-col">
              {sec.rows.map(r => (
                <div
                  key={r.ticker}
                  onMouseEnter={e => setHover({ row: r, sector: sec.sector, sectorPct: (r.notional / sec.notional) * 100, x: e.clientX, y: e.clientY })}
                  onMouseMove={e => setHover({ row: r, sector: sec.sector, sectorPct: (r.notional / sec.notional) * 100, x: e.clientX, y: e.clientY })}
                  onMouseLeave={() => setHover(h => (h && h.row.ticker === r.ticker ? null : h))}
                  className="flex items-center px-3 py-1.5 border-b border-borderSubtle/25 last:border-0 cursor-crosshair hover:bg-rowHover transition-colors"
                >
                  <span className="w-12 shrink-0 flex flex-col leading-none">
                    <TickerTag symbol={r.ticker} className="font-mono text-label font-bold text-textPrimary" />
                    <span className={`font-mono text-micro tnum ${r.changePct >= 0 ? 'text-bull' : 'text-bear'}`}>
                      {r.changePct >= 0 ? '+' : ''}
                      {r.changePct.toFixed(2)}%
                    </span>
                  </span>
                  <span className="flex-1 text-right font-mono text-label font-semibold tnum text-textSecondary">
                    {fmtUsd(r.notional)}
                  </span>
                  <span className="w-14 text-right font-mono text-micro tnum text-textMuted">{r.avgVolPct.toFixed(0)}%</span>
                  <span className="w-14 text-right font-mono text-micro tnum text-textMuted">{fmtShares(r.size)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {hover && (
        <HoverReadout x={hover.x} y={hover.y}>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-caption font-bold text-textPrimary">{hover.row.name}</span>
            <span className="font-mono text-micro text-textMuted tnum">${hover.row.price.toFixed(2)}</span>
          </div>
          <div className="mt-0.5 flex items-baseline gap-3 font-mono text-micro uppercase tracking-wider text-textMuted">
            <span>
              Notional <span className="text-textPrimary tnum">{fmtUsd(hover.row.notional)}</span>
            </span>
            <span>
              Prints <span className="text-textPrimary tnum">{hover.row.prints}</span>
            </span>
          </div>
          <div className="mt-0.5 font-mono text-micro text-textSecondary">
            <span className="tnum">{hover.sectorPct.toFixed(1)}%</span> of {hover.sector} dark-pool notional
          </div>
        </HoverReadout>
      )}
    </Panel>
  );
};

export default DarkPoolFeed;
