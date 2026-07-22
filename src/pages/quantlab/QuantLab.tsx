import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, ArrowLeft } from 'lucide-react';
import { useMarketData } from '../../context/MarketDataContext';
import Simulator from '../../core/simulator';
import { buildVolLab } from '../../data/vollab';
import { buildGexView } from '../../data/gex';
import { runMonteCarlo } from '../../core/quant';
import { buildHedgeImpact } from '../../data/hedgeimpact';
import {
  buildOiSurface,
  buildRegimePanel,
  buildCorrelation,
  buildSignals,
  buildKeyMetrics,
} from '../../data/quantlab';
import type { MarketSnapshot } from '../../types/market';
import {
  SurfacePanel,
  MonteCarloLabPanel,
  RndPanel,
  HedgingPanel,
  RegimeDetectionPanel,
  CorrelationPanel,
  TermStructurePanel,
  KeyMetricsPanel,
  AlertsPanel,
} from './QuantPanels';

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const transpose = (g: number[][]): number[][] => (g[0] ?? []).map((_, c) => g.map(row => row[c]));

type Tab = 'MONITOR' | 'ANALYZE' | 'SIMULATE';

/* Panel keys → which tab shows them */
type PanelKey =
  | 'iv-surface' | 'gamma-surface' | 'rnd' | 'monte-carlo' | 'dealer-hedging'
  | 'oi-surface' | 'regime' | 'correlation' | 'term' | 'key-metrics' | 'alerts';

const TAB_PANELS: Record<Tab, PanelKey[]> = {
  ANALYZE: ['iv-surface', 'gamma-surface', 'rnd', 'monte-carlo', 'dealer-hedging', 'oi-surface', 'regime', 'correlation', 'term', 'key-metrics', 'alerts'],
  MONITOR: ['key-metrics', 'gamma-surface', 'regime', 'term', 'correlation', 'alerts'],
  SIMULATE: ['iv-surface', 'monte-carlo', 'rnd', 'dealer-hedging', 'oi-surface', 'key-metrics'],
};

/* Sidebar: labs scroll to a panel; a few deep-link to the matching desk. */
interface NavItem { label: string; anchor?: PanelKey; to?: string }
const NAV_GROUPS: { group: string; items: NavItem[] }[] = [
  { group: 'Dashboards', items: [{ label: 'Overview', anchor: 'key-metrics' }] },
  {
    group: 'Labs',
    items: [
      { label: 'Volatility Lab', anchor: 'iv-surface' },
      { label: 'Greeks Lab', to: '/pinpoint/greeks-regime' },
      { label: 'Dealer Lab', anchor: 'gamma-surface' },
      { label: 'Distribution Lab', anchor: 'rnd' },
      { label: 'Simulation Lab', anchor: 'monte-carlo' },
      { label: 'Market Regime', anchor: 'regime' },
      { label: 'Correlation Lab', anchor: 'correlation' },
      { label: 'OI Surface', anchor: 'oi-surface' },
    ],
  },
  {
    group: 'Research',
    items: [
      { label: 'Volatility Research', to: '/pinpoint/vol-lab' },
      { label: 'Term Structure', anchor: 'term' },
      { label: 'Microstructure', to: '/trace' },
      { label: 'Hedging Impact', anchor: 'dealer-hedging' },
    ],
  },
  {
    group: 'Risk',
    items: [
      { label: 'Risk Engine', to: '/pinpoint/hedge-impact' },
      { label: 'Scenario Analysis', anchor: 'monte-carlo' },
      { label: 'Signals', anchor: 'alerts' },
    ],
  },
  { group: 'Data', items: [{ label: 'Data Explorer', to: '/stocks' }, { label: 'Model Library', to: '/prove-it' }] },
];

const TICKERS = Simulator.WATCHLIST;

function buildSurfaces(snapshot: MarketSnapshot, iv: number) {
  const surface = buildVolLab(snapshot.ticker, snapshot.spot, iv).surface;
  const span = surface.max - surface.min || 1;
  const ivGrid = surface.cells.map(row => row.map(v => clamp((v - surface.min) / span, 0, 1)));
  const m = buildGexView(snapshot, 'GEX', 10).matrix;
  const norm = m.maxAbs || 1;
  const gammaGrid = transpose(m.cells.map(row => row.map(c => clamp(c.value / norm, -1, 1))));
  const oi = buildOiSurface(snapshot);
  const oiGrid = transpose(oi.grid);
  const mc = runMonteCarlo(snapshot, iv, 30);
  return {
    ivGrid,
    gammaGrid,
    oiGrid,
    mc,
    ivMin: surface.min,
    ivMax: surface.max,
    gammaMaxAbsB: norm / 1e9,
    peakStrike: oi.peakStrike,
  };
}

const Kpi = ({ label, value, tone }: { label: string; value: string; tone?: string }) => (
  <div className="px-3 border-r border-borderSubtle/60 last:border-0">
    <div className="font-mono text-[8.5px] uppercase tracking-wide text-textMuted whitespace-nowrap">{label}</div>
    <div className="font-mono text-[12px] tabular-nums whitespace-nowrap" style={{ color: tone ?? '#ededed' }}>{value}</div>
  </div>
);

const QuantLab = () => {
  const { activeTicker, marketData, changeTicker } = useMarketData();
  const [tab, setTab] = useState<Tab>('ANALYZE');
  const [asOf, setAsOf] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const iv = Simulator.TICKERS[activeTicker]?.iv ?? 0.25;

  useEffect(() => {
    if (marketData) setAsOf(new Date().toLocaleTimeString('en-US', { hour12: false }));
  }, [marketData]);

  // Heavy 3D grids + MC: build once per ticker (a live tick shouldn't rebuild the
  // meshes and flicker them). Cache by ticker.
  const surfCache = useRef<Record<string, ReturnType<typeof buildSurfaces>>>({});
  const surfaces = useMemo(() => {
    if (!marketData) return surfCache.current[activeTicker] ?? null;
    if (!surfCache.current[activeTicker]) surfCache.current[activeTicker] = buildSurfaces(marketData, iv);
    return surfCache.current[activeTicker];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTicker, marketData, iv]);

  // Lighter panels can breathe with the tape — recompute on a coarse spot bucket.
  const bucket = marketData ? Math.round(marketData.spot) : 0;
  const live = useMemo(() => {
    if (!marketData) return null;
    const vol = buildVolLab(activeTicker, marketData.spot, iv);
    return {
      rnd: vol.rnd,
      term: vol.term,
      metrics: buildKeyMetrics(marketData, iv),
      regime: buildRegimePanel(marketData),
      signals: buildSignals(marketData),
      hedge: buildHedgeImpact(marketData),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTicker, bucket, iv]);

  const corr = useMemo(() => buildCorrelation(), []);

  const scrollTo = (anchor: PanelKey) => {
    const el = document.getElementById(anchor);
    if (el && scrollRef.current) scrollRef.current.scrollTo({ top: el.offsetTop - 12, behavior: 'smooth' });
  };

  if (!marketData || !surfaces || !live) {
    return (
      <div className="fixed inset-0 z-[100] bg-canvas flex items-center justify-center">
        <span className="font-mono text-[11px] text-textMuted uppercase tracking-widest animate-pulse">spinning up the quant lab…</span>
      </div>
    );
  }

  const m = live.metrics;
  const show = (k: PanelKey) => TAB_PANELS[tab].includes(k);

  return (
    <div className="fixed inset-0 z-[100] bg-canvas text-textPrimary flex">
      {/* Sidebar */}
      <aside className="hidden md:flex w-[196px] shrink-0 flex-col border-r border-borderSubtle bg-panel/60">
        <div className="flex items-center gap-2 px-4 h-12 border-b border-borderSubtle">
          <Activity className="w-4 h-4 text-select" />
          <span className="font-mono text-[12px] font-bold tracking-tight">QUANT LAB</span>
        </div>
        <nav className="flex-grow overflow-y-auto py-2">
          {NAV_GROUPS.map(g => (
            <div key={g.group} className="mb-2">
              <div className="px-4 py-1 font-mono text-[8.5px] uppercase tracking-[0.2em] text-textMuted">{g.group}</div>
              {g.items.map(it =>
                it.to ? (
                  <Link
                    key={it.label}
                    to={it.to}
                    className="block px-4 py-1.5 text-[11.5px] text-textSecondary hover:text-textPrimary hover:bg-panelHover transition-colors"
                  >
                    {it.label}
                  </Link>
                ) : (
                  <button
                    key={it.label}
                    onClick={() => it.anchor && scrollTo(it.anchor)}
                    className="block w-full text-left px-4 py-1.5 text-[11.5px] text-textSecondary hover:text-textPrimary hover:bg-panelHover transition-colors"
                  >
                    {it.label}
                  </button>
                )
              )}
            </div>
          ))}
        </nav>
        <Link
          to="/pulse"
          className="flex items-center gap-1.5 px-4 h-10 border-t border-borderSubtle font-mono text-[10px] uppercase tracking-wider text-textSecondary hover:text-textPrimary transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Terminal
        </Link>
      </aside>

      {/* Main */}
      <div className="flex-grow min-w-0 flex flex-col">
        {/* Top bar */}
        <div className="shrink-0 border-b border-borderSubtle bg-panel/60">
          <div className="flex items-center gap-4 px-4 h-12 overflow-x-auto">
            <div className="flex items-center gap-2 shrink-0">
              <select
                value={activeTicker}
                onChange={e => changeTicker(e.target.value)}
                className="bg-inset border border-borderSubtle rounded px-2 py-1 font-mono text-[12px] font-bold text-textPrimary focus:outline-none focus:border-borderFocus"
              >
                {TICKERS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <div>
                <div className="font-mono text-[14px] font-bold tabular-nums leading-none">{marketData.spot.toFixed(2)}</div>
                <div className="font-mono text-[10px] tabular-nums" style={{ color: marketData.changePercent >= 0 ? '#30D158' : '#FF3B30' }}>
                  {marketData.changePercent >= 0 ? '+' : ''}{marketData.changePercent.toFixed(2)}%
                </div>
              </div>
            </div>
            <div className="flex items-center shrink-0">
              <Kpi label="IV Rank" value={m.ivRank.toFixed(1)} />
              <Kpi label="IV Pctile" value={`${m.ivPercentile.toFixed(1)}%`} />
              <Kpi label="IV 1D Δ" value={`${m.iv1dChangePct >= 0 ? '+' : ''}${m.iv1dChangePct.toFixed(1)}%`} tone={m.iv1dChangePct >= 0 ? '#30D158' : '#FF3B30'} />
              <Kpi label="HV 10D" value={`${m.hv10.toFixed(2)}%`} />
              <Kpi label="HV 30D" value={`${m.hv30.toFixed(2)}%`} />
              <Kpi label="VIX" value={m.vix.toFixed(2)} />
              <Kpi label="Realized" value={`${m.realizedVol.toFixed(2)}%`} />
            </div>
            <div className="flex items-center gap-3 ml-auto shrink-0">
              <div className="text-right">
                <div className="font-mono text-[8.5px] uppercase tracking-wide text-textMuted">Regime</div>
                <div className="font-mono text-[11px]" style={{ color: live.regime.regime === 'RISK-ON' ? '#30D158' : live.regime.regime === 'RISK-OFF' ? '#FF3B30' : '#a3a3a3' }}>
                  {live.regime.regime}
                </div>
              </div>
              <div className="font-mono text-[9px] text-textMuted whitespace-nowrap">Data as of {asOf}</div>
            </div>
          </div>
          {/* Tabs */}
          <div className="flex items-center gap-1 px-4 h-9 border-t border-borderSubtle/60">
            {(['MONITOR', 'ANALYZE', 'SIMULATE'] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`font-mono text-[10.5px] uppercase tracking-wider px-3 py-1 rounded transition-colors ${
                  tab === t ? 'bg-select/15 text-select border border-select/40' : 'text-textSecondary border border-transparent hover:text-textPrimary'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Panel grid */}
        <div ref={scrollRef} className="flex-grow overflow-y-auto p-3">
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3 auto-rows-min">
              {show('iv-surface') && (
                <SurfacePanel
                  id="iv-surface" num={1} title="Implied Volatility Surface"
                  meta={<span className="font-mono text-[9px] text-textMuted">strike × DTE</span>}
                  grid={surfaces.ivGrid} ramp="spectral"
                  colorbar={{ top: `${surfaces.ivMax.toFixed(0)}%`, bottom: `${surfaces.ivMin.toFixed(0)}%` }}
                />
              )}
              {show('gamma-surface') && (
                <SurfacePanel
                  id="gamma-surface" num={2} title="Gamma Exposure Surface"
                  meta={<span className="font-mono text-[9px] text-textMuted">Γ net · strike × exp</span>}
                  grid={surfaces.gammaGrid} ramp="gamma"
                  colorbar={{ top: `+${surfaces.gammaMaxAbsB.toFixed(1)}B`, bottom: `−${surfaces.gammaMaxAbsB.toFixed(1)}B` }}
                />
              )}
              {show('rnd') && <RndPanel id="rnd" num={3} rnd={live.rnd} spot={marketData.spot} />}
              {show('monte-carlo') && <MonteCarloLabPanel id="monte-carlo" num={4} mc={surfaces.mc} spot={marketData.spot} />}
              {show('dealer-hedging') && <HedgingPanel id="dealer-hedging" num={5} snapshot={marketData} squeezeScore={live.hedge.inventoryStress} />}
              {show('oi-surface') && (
                <SurfacePanel
                  id="oi-surface" num={6} title="Open Interest Surface"
                  meta={<span className="font-mono text-[9px] text-textMuted">strike × exp · peak {surfaces.peakStrike.toFixed(0)}</span>}
                  grid={surfaces.oiGrid} ramp="magma"
                  colorbar={{ top: 'High', bottom: 'Low' }}
                />
              )}
              {show('regime') && <RegimeDetectionPanel id="regime" num={7} regime={live.regime} />}
              {show('correlation') && <CorrelationPanel id="correlation" num={8} corr={corr} />}
              {show('term') && <TermStructurePanel id="term" num={9} term={live.term} />}
              {show('key-metrics') && (
                <div className="lg:col-span-2 xl:col-span-2">
                  <KeyMetricsPanel id="key-metrics" num={10} m={m} />
                </div>
              )}
              {show('alerts') && (
                <div className="xl:col-span-1">
                  <AlertsPanel id="alerts" num={11} signals={live.signals} />
                </div>
              )}
            </div>
        </div>
      </div>
    </div>
  );
};

export default QuantLab;
