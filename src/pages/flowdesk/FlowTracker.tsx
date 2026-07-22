import { useMemo, useState } from 'react';
import { Bookmark, BookmarkCheck, Clock, Radar, TrendingUp } from 'lucide-react';
import { useMarketData } from '../../context/MarketDataContext';
import { buildScannerRows, buildContractIntraday, type IntradayPoint, type ScannerRow } from '../../data/flowscan';
import { fmtUsd } from '../../data/gex';
import { SPOT } from '../../components/gex/palette';
import Panel from '../../components/ui/Panel';
import StatCard from '../../components/ui/StatCard';
import MetricGrid from '../../components/ui/MetricGrid';
import SignalBadge from '../../components/ui/SignalBadge';
import SegmentedControl from '../../components/ui/SegmentedControl';
import type { Tone } from '../../components/ui/tones';

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

/* ---- Per-item presentation derived from values the scanner already computed ---- */

/** Why this contract auto-surfaced — mirrors the exact filter that selected it. */
function surfaceReasons(r: ScannerRow): { label: string; tone: Tone }[] {
  const out: { label: string; tone: Tone }[] = [];
  if (r.sweeps > 0) out.push({ label: `Sweep ×${r.sweeps}`, tone: 'warn' });
  if (Math.abs(r.deltaOi) > r.oi * 0.15) out.push({ label: r.deltaOi >= 0 ? 'OI build' : 'OI unwind', tone: 'neutral' });
  if (out.length === 0) out.push({ label: 'Notable size', tone: 'neutral' });
  return out;
}

/** Activity status read off vol/OI — the same threshold the drilldown already flags. */
function statusOf(r: ScannerRow): { label: string; tone: Tone } {
  return r.volOverOi > 1 ? { label: 'Building', tone: 'warn' } : { label: 'Steady', tone: 'neutral' };
}

/** Compact auto-note condensed from the same bid-side conviction read. */
function noteOf(r: ScannerRow): string {
  if (r.bullScore > 22) return `${r.bidPct}% bid-side — ${r.right === 'C' ? 'calls lifted' : 'puts hit'}, tape reads bullish.`;
  if (r.bullScore < -22) return `${r.bidPct}% bid-side — ${r.right === 'C' ? 'calls sold' : 'puts bought'}, tape reads bearish.`;
  return `${r.bidPct}% bid-side — two-sided, no clear aggressor yet.`;
}

const FlowTracker = () => {
  const { marketData } = useMarketData();
  const rows = useMemo(() => (marketData ? buildScannerRows(marketData) : []), [marketData]);
  // Auto-surface = biggest premium + genuine ΔOI or a sweep; the prints worth a look.
  const surfaced = useMemo(
    () => rows.filter(r => r.sweeps > 0 || Math.abs(r.deltaOi) > r.oi * 0.15).slice(0, 12),
    [rows]
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected: ScannerRow | null = surfaced.find(r => r.id === selectedId) ?? surfaced[0] ?? null;
  const intraday = useMemo(
    () => (selected && marketData ? buildContractIntraday(selected, marketData) : []),
    [selected, marketData]
  );

  // Pin / track is presentation-only local state — no backend.
  const [tracked, setTracked] = useState<Set<string>>(new Set());
  const toggleTrack = (id: string) =>
    setTracked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const [view, setView] = useState<'all' | 'tracked'>('all');
  const viewOpts = [
    { value: 'all' as const, label: 'All' },
    { value: 'tracked' as const, label: tracked.size ? `Pinned · ${tracked.size}` : 'Pinned' },
  ];
  const visible = view === 'tracked' ? surfaced.filter(r => tracked.has(r.id)) : surfaced;

  const totalPremium = surfaced.reduce((a, r) => a + r.premium, 0);
  const sweeps = surfaced.reduce((a, r) => a + (r.sweeps > 0 ? 1 : 0), 0);
  const bullish = surfaced.filter(r => r.sentiment === 'BULLISH').length;

  if (surfaced.length === 0) {
    return (
      <Panel title="Auto-surfaced flow">
        <div className="h-40 flex flex-col items-center justify-center gap-1.5 text-center">
          <span className="font-mono text-[11px] uppercase tracking-widest text-textSecondary">No notable prints on the tape</span>
          <span className="font-mono text-[10px] text-textMuted">Sweeps and blocks that clear the size + conviction bar will surface here.</span>
        </div>
      </Panel>
    );
  }

  const netCum = intraday.length ? intraday[intraday.length - 1].cumPremium : 0;
  const selReasons = selected ? surfaceReasons(selected) : [];
  const selStatus = selected ? statusOf(selected) : null;

  return (
    <>
      <MetricGrid min="170px">
        <StatCard label="Auto-surfaced" value={surfaced.length} sub="notable contracts pulled from the tape" />
        <StatCard label="Surfaced premium" value={fmtUsd(totalPremium)} sub={`${sweeps} carry sweeps`} />
        <StatCard label="Lean" value={`${bullish}/${surfaced.length}`} sub="reading bullish" tone={bullish > surfaced.length / 2 ? 'bull' : 'bear'} />
        <StatCard label="Pinned" value={tracked.size} sub="contracts you're tracking" tone="select" />
        <StatCard
          label={selected ? `${selected.strike}${selected.right} net flow` : 'Net flow'}
          value={fmtUsd(Math.abs(netCum))}
          sub={netCum >= 0 ? 'net premium accumulating' : 'net premium bleeding'}
          tone={netCum >= 0 ? 'bull' : 'bear'}
        />
      </MetricGrid>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* Auto-surfaced feed */}
        <Panel
          title={
            <span className="inline-flex items-center gap-1.5">
              <Radar className="w-3.5 h-3.5" /> Auto-surfaced flow
            </span>
          }
          subtitle="surfaced from sweeps & OI shifts — pin to track"
          actions={<SegmentedControl ariaLabel="Filter surfaced flow" options={viewOpts} value={view} onChange={setView} />}
          flush
          className="xl:col-span-4"
        >
          <div className="flex flex-col max-h-[560px] overflow-auto">
            {visible.length === 0 && (
              <div className="px-4 py-10 flex flex-col items-center gap-2 text-center">
                <Bookmark className="w-5 h-5 text-textMuted" />
                <p className="font-mono text-[11px] text-textMuted">Nothing pinned yet — use the bookmark on a row to track it.</p>
              </div>
            )}
            {visible.map(r => {
              const isSel = selected?.id === r.id;
              const isTracked = tracked.has(r.id);
              const reasons = surfaceReasons(r);
              const status = statusOf(r);
              return (
                <div
                  key={r.id}
                  className={`group relative flex items-stretch border-b border-borderSubtle last:border-0 transition-colors ${
                    isSel ? 'bg-select/[0.05] shadow-[inset_2px_0_0_0_rgba(228,232,244,0.7)]' : 'hover:bg-white/[0.02]'
                  }`}
                >
                  <button onClick={() => setSelectedId(r.id)} className="flex-1 min-w-0 text-left px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[13px] font-bold text-textPrimary">
                        {r.ticker} {r.strike}
                        <span className={r.right === 'C' ? 'text-bull' : 'text-bear'}>{r.right}</span>
                      </span>
                      <SignalBadge tone={r.sentiment === 'BULLISH' ? 'bull' : r.sentiment === 'BEARISH' ? 'bear' : 'neutral'}>
                        {r.bullScore >= 0 ? '+' : ''}
                        {r.bullScore}
                      </SignalBadge>
                    </div>

                    {/* Why surfaced + status */}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {reasons.map(rs => (
                        <SignalBadge key={rs.label} tone={rs.tone}>
                          {rs.label}
                        </SignalBadge>
                      ))}
                      <SignalBadge tone={status.tone} dot pulse={status.tone === 'warn'}>
                        {status.label}
                      </SignalBadge>
                    </div>

                    {/* Values */}
                    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] text-textSecondary tnum">
                      <span>{r.expiry}</span>
                      <span className="text-textMuted">·</span><span className="text-textPrimary font-semibold">{fmtUsd(r.premium)}</span>
                      <span className={r.deltaOi >= 0 ? 'text-bull' : 'text-bear'}>
                        · ΔOI {r.deltaOi >= 0 ? '+' : ''}
                        {r.deltaOi.toLocaleString()}
                      </span>
                      <span className="inline-flex items-center gap-1 text-textSecondary">
                        <Clock className="w-3 h-3" /> first seen {r.last}
                      </span>
                    </div>

                    {/* Auto-note */}
                    <p className="mt-1.5 text-[11px] text-textSecondary leading-snug">{noteOf(r)}</p>
                  </button>

                  {/* Track affordance */}
                  <div className="shrink-0 pt-3 pr-3">
                    <button
                      onClick={() => toggleTrack(r.id)}
                      aria-pressed={isTracked}
                      title={isTracked ? 'Tracking — click to unpin' : 'Track this contract'}
                      className={`p-1.5 rounded-md transition-colors ${
                        isTracked ? 'text-select bg-select/10' : 'text-textMuted hover:text-textPrimary hover:bg-white/[0.05]'
                      }`}
                    >
                      {isTracked ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
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
            actions={
              <button
                onClick={() => toggleTrack(selected.id)}
                aria-pressed={tracked.has(selected.id)}
                className={`inline-flex items-center gap-1.5 rounded border px-2 py-1 font-mono text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                  tracked.has(selected.id)
                    ? 'text-select bg-select/10 border-select/20'
                    : 'text-textSecondary border-borderSubtle hover:text-textPrimary hover:bg-white/[0.05]'
                }`}
              >
                {tracked.has(selected.id) ? <BookmarkCheck className="w-3.5 h-3.5" /> : <Bookmark className="w-3.5 h-3.5" />}
                {tracked.has(selected.id) ? 'Tracking' : 'Track'}
              </button>
            }
            className="xl:col-span-8"
          >
            {/* Surface context for the selected contract */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="font-mono text-[11px] uppercase tracking-wider text-textMuted">Why surfaced</span>
              {selReasons.map(rs => (
                <SignalBadge key={rs.label} tone={rs.tone}>
                  {rs.label}
                </SignalBadge>
              ))}
              {selStatus && (
                <SignalBadge tone={selStatus.tone} dot pulse={selStatus.tone === 'warn'}>
                  {selStatus.label}
                </SignalBadge>
              )}
              <span className="inline-flex items-center gap-1 font-mono text-[11px] text-textSecondary">
                <Clock className="w-3 h-3" /> first seen {selected.last}
              </span>
            </div>

            <FlowChart points={intraday} />
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="border border-borderSubtle bg-inset rounded-md px-2.5 py-2">
                <div className="font-mono text-[11px] uppercase tracking-widest text-textMuted">Volume</div>
                <div className="mt-1 font-mono text-sm font-semibold text-textPrimary tnum">{selected.volume.toLocaleString()}</div>
              </div>
              <div className="border border-borderSubtle bg-inset rounded-md px-2.5 py-2">
                <div className="font-mono text-[11px] uppercase tracking-widest text-textMuted">Open interest</div>
                <div className="mt-1 font-mono text-sm font-semibold text-textPrimary tnum">{selected.oi.toLocaleString()}</div>
              </div>
              <div className="border border-borderSubtle bg-inset rounded-md px-2.5 py-2">
                <div className="font-mono text-[11px] uppercase tracking-widest text-textMuted">Vol / OI</div>
                <div className={`mt-1 font-mono text-sm font-semibold tnum ${selected.volOverOi > 1 ? 'text-warn' : 'text-textPrimary'}`}>
                  {selected.volOverOi.toFixed(2)}
                </div>
              </div>
              <div className="border border-borderSubtle bg-inset rounded-md px-2.5 py-2">
                <div className="font-mono text-[11px] uppercase tracking-widest text-textMuted">Bid-side</div>
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
