import { useMemo } from 'react';
import { useMarketData } from '../../context/MarketDataContext';
import Simulator from '../../core/simulator';
import { buildSurfaceIntegrity } from '../../data/surfaceIntegrity';
import Panel from '../../components/ui/Panel';
import StatCard from '../../components/ui/StatCard';
import MetricGrid from '../../components/ui/MetricGrid';
import SignalBadge from '../../components/ui/SignalBadge';

/*
  SURFACE INTEGRITY — the arbitrage checks every desk should run before trusting
  a vol surface. Engine in data/surfaceIntegrity.ts. PASS/FAIL is data quality,
  not market direction, so a break takes amber (a caveat) and never bear red —
  green and red stay the market's.
*/

const SurfaceIntegrity = () => {
  const { activeTicker, marketData } = useMarketData();
  const iv = Simulator.TICKERS[activeTicker]?.iv ?? 0.25;

  const view = useMemo(
    () => (marketData ? buildSurfaceIntegrity(activeTicker, marketData.spot, iv) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeTicker, marketData?.spot && Math.round(marketData.spot * 4), iv]
  );

  if (!view) {
    return (
      <Panel className="h-64" bodyClassName="flex items-center justify-center">
        <span className="font-mono text-label text-textMuted uppercase tracking-widest">Checking the surface…</span>
      </Panel>
    );
  }

  const { checks, score, clean, read } = view;

  return (
    <div className="flex flex-col gap-4">
      <Panel title="Surface integrity" subtitle={`${activeTicker} · arbitrage-free checks on the vol surface`}>
        <div className="flex flex-col gap-4">
          <p className="text-caption leading-relaxed text-textSecondary">{read}</p>

          <MetricGrid min="200px">
            <StatCard
              label="Integrity score"
              value={`${score}%`}
              sub={clean ? 'arbitrage-free' : 'breaks present'}
              tone={clean ? 'select' : 'warn'}
              emphasis
            />
            {checks.map(c => (
              <StatCard
                key={c.key}
                label={c.label}
                value={c.pass ? 'PASS' : `${c.violations} FAIL`}
                sub={`${c.total} checks`}
                tone={c.pass ? 'neutral' : 'warn'}
              >
                <SignalBadge tone={c.pass ? 'neutral' : 'warn'} dot={!c.pass} className="mt-1">
                  {c.pass ? 'holds' : 'arbitrage'}
                </SignalBadge>
              </StatCard>
            ))}
          </MetricGrid>

          <div className="flex flex-col gap-2">
            {checks.map(c => (
              <div key={c.key} className="inst-surface rounded-md px-3 py-2.5 flex flex-col gap-1">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-caption font-semibold text-textPrimary">{c.label}</span>
                  <SignalBadge tone={c.pass ? 'neutral' : 'warn'} dot={!c.pass}>
                    {c.pass ? 'PASS' : `${c.violations} / ${c.total}`}
                  </SignalBadge>
                </div>
                <p className="text-micro leading-relaxed text-textMuted">{c.note}</p>
                {!c.pass && c.worst && (
                  <p className="font-mono text-micro text-warn/90">
                    Worst at {c.worst.dte}d · {(c.worst.moneyness * 100).toFixed(0)}% K/F — {c.worst.detail}
                  </p>
                )}
              </div>
            ))}
          </div>

          <p className="text-micro leading-relaxed text-textMuted">
            A surface that fails these is not just ugly — it prices free money or a probability below zero. The checks run
            on the same seeded surface the Vol Lab draws; a real fitted feed would run them before it published a quote.
          </p>
        </div>
      </Panel>
    </div>
  );
};

export default SurfaceIntegrity;
