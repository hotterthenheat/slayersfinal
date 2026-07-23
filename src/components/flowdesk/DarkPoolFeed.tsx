import { useMemo } from 'react';
import { Layers } from 'lucide-react';
import { buildDarkPoolFeed } from '../../data/darkpoolfeed';
import { fmtUsd } from '../../data/gex';
import Panel from '../../components/ui/Panel';
import TickerTag from '../../components/ui/TickerTag';

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
          and fill evenly; gap-px + mb-px keep the fused hairline look. */}
      <div className="columns-1 md:columns-2 xl:columns-3 gap-px bg-borderSubtle">
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
                  className="flex items-center px-3 py-1.5 border-b border-borderSubtle/25 last:border-0 hover:bg-white/[0.02] transition-colors"
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
    </Panel>
  );
};

export default DarkPoolFeed;
