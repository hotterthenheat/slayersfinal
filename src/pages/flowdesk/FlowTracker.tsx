import { useMemo, useState } from 'react';
import { Bookmark, TrendingUp } from 'lucide-react';
import { useMarketData } from '../../context/MarketDataContext';
import { buildScannerRows, buildContractIntraday, type IntradayPoint, type ScannerRow } from '../../data/flowscan';
import { fmtUsd } from '../../data/gex';
import { SPOT } from '../../components/gex/palette';
import Panel from '../../components/ui/Panel';
import StatCard from '../../components/ui/StatCard';
import MetricGrid from '../../components/ui/MetricGrid';
import SignalBadge from '../../components/ui/SignalBadge';

/** Cumulative net premium (area) with the price path overlaid on its own scale. */
const FlowChart = ({ points }: { points: IntradayPoint[] }) => {
  const W = 900;
  const H = 300;
  const padY = 18;
  const cums = points.map(p => p.cumPremium);
  const prices = points.map(p => p.price);
  const cMax = Math.max(...cums, 0);
  const cMin = Math.min(...cums, 0);
  const pLo = Math.min(...prices) * 0.999;
  const pHi = Math.max(...prices) * 1.001;
  const X = (i: number) => (i / (points.length - 1)) * W;
  const Yc = (v: number) => padY + (1 - (v - cMin) / (cMax - cMin || 1)) * (H - padY * 2);
  const Yp = (v: number) => padY + (1 - (v - pLo) / (pHi - pLo || 1)) * (H - padY * 2);
  const zeroY = Yc(0);
  const positive = points[points.length - 1].cumPremium >= 0;

  const areaPath =
    points.map((p, i) => `${i === 0 ? 'M' : 'L'}${X(i).toFixed(1)},${Yc(p.cumPremium).toFixed(1)}`).join(' ') +
    ` L${W},${zeroY.toFixed(1)} L0,${zeroY.toFixed(1)} Z`;
  const pricePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${X(i).toFixed(1)},${Yp(p.price).toFixed(1)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }} preserveAspectRatio="none">
      <defs>
        <linearGradient id="flowfill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={positive ? '#c2d6f0' : '#ff3b30'} stopOpacity={0.28} />
          <stop offset="100%" stopColor={positive ? '#c2d6f0' : '#ff3b30'} stopOpacity={0.02} />
        </linearGradient>
      </defs>
      <line x1={0} x2={W} y1={zeroY} y2={zeroY} stroke="#fff" strokeOpacity={0.12} strokeWidth={1} />
      <path d={areaPath} fill="url(#flowfill)" />
      <path
        d={points.map((p, i) => `${i === 0 ? 'M' : 'L'}${X(i).toFixed(1)},${Yc(p.cumPremium).toFixed(1)}`).join(' ')}
        fill="none"
        stroke={positive ? '#dfe6f4' : '#ff6b63'}
        strokeWidth={1.75}
      />
      <path d={pricePath} fill="none" stroke={SPOT} strokeOpacity={0.55} strokeWidth={1.25} strokeDasharray="3 3" />
    </svg>
  );
};

const FlowTracker = () => {
  const { marketData } = useMarketData();
  const rows = useMemo(() => (marketData ? buildScannerRows(marketData) : []), [marketData]);
  // Notable = biggest premium + genuine ΔOI or a sweep; the "whales" worth watching.
  const watched = useMemo(
    () => rows.filter(r => r.sweeps > 0 || Math.abs(r.deltaOi) > r.oi * 0.15).slice(0, 12),
    [rows]
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected: ScannerRow | null = watched.find(r => r.id === selectedId) ?? watched[0] ?? null;
  const intraday = useMemo(
    () => (selected && marketData ? buildContractIntraday(selected, marketData) : []),
    [selected, marketData]
  );

  const totalPremium = watched.reduce((a, r) => a + r.premium, 0);
  const sweeps = watched.reduce((a, r) => a + (r.sweeps > 0 ? 1 : 0), 0);
  const bullish = watched.filter(r => r.sentiment === 'BULLISH').length;

  if (watched.length === 0) {
    return (
      <Panel title="Tracked flow">
        <div className="h-40 flex items-center justify-center font-mono text-xs text-textMuted">Watching the tape for notable prints…</div>
      </Panel>
    );
  }

  const netCum = intraday.length ? intraday[intraday.length - 1].cumPremium : 0;

  return (
    <>
      <MetricGrid min="170px">
        <StatCard label="Watching" value={watched.length} sub="notable contracts on the tape" tone="select" />
        <StatCard label="Tracked premium" value={fmtUsd(totalPremium)} sub={`${sweeps} carry sweeps`} />
        <StatCard label="Lean" value={`${bullish}/${watched.length}`} sub="reading bullish" tone={bullish > watched.length / 2 ? 'bull' : 'bear'} />
        <StatCard
          label={selected ? `${selected.strike}${selected.right} net flow` : 'Net flow'}
          value={fmtUsd(Math.abs(netCum))}
          sub={netCum >= 0 ? 'net premium accumulating' : 'net premium bleeding'}
          tone={netCum >= 0 ? 'bull' : 'bear'}
        />
      </MetricGrid>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* Watchlist */}
        <Panel
          title={
            <span className="inline-flex items-center gap-1.5">
              <Bookmark className="w-3.5 h-3.5" /> Tracked contracts
            </span>
          }
          subtitle="click to drill down"
          flush
          className="xl:col-span-4"
        >
          <div className="flex flex-col max-h-[520px] overflow-auto">
            {watched.map(r => {
              const isSel = selected?.id === r.id;
              return (
                <button
                  key={r.id}
                  onClick={() => setSelectedId(r.id)}
                  className={`text-left px-4 py-2.5 border-b border-borderSubtle last:border-0 transition-colors ${
                    isSel ? 'bg-select/[0.05] shadow-[inset_2px_0_0_0_rgba(228,232,244,0.7)]' : 'hover:bg-white/[0.02]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-bold text-textPrimary">
                      {r.ticker} {r.strike}
                      <span className={r.right === 'C' ? 'text-bull' : 'text-bear'}>{r.right}</span>
                    </span>
                    <SignalBadge tone={r.sentiment === 'BULLISH' ? 'bull' : r.sentiment === 'BEARISH' ? 'bear' : 'neutral'}>
                      {r.bullScore >= 0 ? '+' : ''}
                      {r.bullScore}
                    </SignalBadge>
                  </div>
                  <div className="mt-1 flex items-center gap-2 font-mono text-[10px] text-textMuted tnum">
                    <span>{r.expiry}</span>
                    <span>· {fmtUsd(r.premium)}</span>
                    <span className={r.deltaOi >= 0 ? 'text-bull' : 'text-bear'}>
                      · ΔOI {r.deltaOi >= 0 ? '+' : ''}
                      {r.deltaOi.toLocaleString()}
                    </span>
                    {r.sweeps > 0 && <span className="text-warn">· {r.sweeps} swp</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </Panel>

        {/* Drilldown */}
        {selected && (
          <Panel
            title={
              <span className="inline-flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5" /> {selected.ticker} {selected.strike}
                {selected.right} — intraday flow
              </span>
            }
            subtitle="cumulative net premium (fill) vs price (dashed)"
            className="xl:col-span-8"
          >
            <FlowChart points={intraday} />
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="border border-borderSubtle bg-inset rounded-md px-2.5 py-2">
                <div className="font-mono text-[9px] uppercase tracking-widest text-textMuted">Volume</div>
                <div className="mt-1 font-mono text-sm font-semibold text-textPrimary tnum">{selected.volume.toLocaleString()}</div>
              </div>
              <div className="border border-borderSubtle bg-inset rounded-md px-2.5 py-2">
                <div className="font-mono text-[9px] uppercase tracking-widest text-textMuted">Open interest</div>
                <div className="mt-1 font-mono text-sm font-semibold text-textPrimary tnum">{selected.oi.toLocaleString()}</div>
              </div>
              <div className="border border-borderSubtle bg-inset rounded-md px-2.5 py-2">
                <div className="font-mono text-[9px] uppercase tracking-widest text-textMuted">Vol / OI</div>
                <div className={`mt-1 font-mono text-sm font-semibold tnum ${selected.volOverOi > 1 ? 'text-warn' : 'text-textPrimary'}`}>
                  {selected.volOverOi.toFixed(2)}
                </div>
              </div>
              <div className="border border-borderSubtle bg-inset rounded-md px-2.5 py-2">
                <div className="font-mono text-[9px] uppercase tracking-widest text-textMuted">Bid-side</div>
                <div className="mt-1 font-mono text-sm font-semibold text-textPrimary tnum">{selected.bidPct}%</div>
              </div>
            </div>
            <p className="mt-3 text-xs text-textSecondary leading-relaxed">
              {selected.bullScore > 22
                ? `Aggressive ${selected.right === 'C' ? 'call buying' : 'put selling'} — ${selected.bidPct}% traded on the bid vs ask reads bullish. Net premium is ${netCum >= 0 ? 'building into' : 'leaving'} the contract through the session.`
                : selected.bullScore < -22
                  ? `Aggressive ${selected.right === 'C' ? 'call selling' : 'put buying'} — the tape leans bearish here. Watch whether net premium keeps ${netCum >= 0 ? 'holding up' : 'bleeding'}.`
                  : 'Two-sided flow — no clear aggressor. Let the cumulative-premium line pick a direction before following.'}
            </p>
          </Panel>
        )}
      </div>
    </>
  );
};

export default FlowTracker;
