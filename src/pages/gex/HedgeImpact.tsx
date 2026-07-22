import { useMemo, useState } from 'react';
import { Gauge, Waves, TrendingDown, SlidersHorizontal, ChevronDown } from 'lucide-react';
import { useMarketData } from '../../context/MarketDataContext';
import { buildHedgeImpact, type HedgeImpactView, type StressLabel } from '../../data/hedgeimpact';
import Panel from '../../components/ui/Panel';
import StatCard from '../../components/ui/StatCard';
import MetricGrid from '../../components/ui/MetricGrid';
import SignalBadge from '../../components/ui/SignalBadge';
import type { Tone } from '../../components/ui/tones';

const fmtUsd = (v: number): string => {
  const a = Math.abs(v);
  const s = v < 0 ? '−' : '';
  if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(0)}M`;
  if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(0)}K`;
  return `${s}$${a.toFixed(0)}`;
};

const fmtNum = (v: number): string => {
  const a = Math.abs(v);
  if (a >= 1e6) return `${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${(a / 1e3).toFixed(0)}K`;
  return `${Math.round(a)}`;
};

const hexTone = (hex: number): Tone => (hex >= 1 ? 'bear' : hex >= 0.7 ? 'warn' : 'bull');

const stressTone: Record<StressLabel, Tone> = {
  LIGHT: 'bull',
  BUILDING: 'select',
  STRETCHED: 'warn',
  CRITICAL: 'bear',
};

/** HEX(move%) curve — where hedging outruns the book (crosses 1). */
const HexCurve = ({ view }: { view: HedgeImpactView }) => {
  const W = 560;
  const H = 170;
  const maxMove = 3;
  const maxHex = Math.max(1.4, ...view.curve.map(c => c.hex));
  const X = (m: number) => (m / maxMove) * W;
  const Y = (h: number) => H - (h / maxHex) * (H - 10) - 4;
  const oneY = Y(1);
  const line = view.curve.map((c, i) => `${i === 0 ? 'M' : 'L'}${X(c.movePct).toFixed(1)},${Y(c.hex).toFixed(1)}`).join(' ');
  const bx = X(Math.min(maxMove, view.failureBoundaryPct));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }} preserveAspectRatio="none">
      {/* danger zone above HEX = 1 */}
      <rect x={0} y={0} width={W} height={oneY} fill="rgba(255,59,48,0.05)" />
      <line x1={0} x2={W} y1={oneY} y2={oneY} stroke="#FF3B30" strokeOpacity={0.5} strokeWidth={1} strokeDasharray="4 3" />
      <text x={4} y={oneY - 4} fontSize={8.5} fill="#FF3B30" fontFamily="monospace">HEX = 1 · hedging outruns liquidity</text>
      {/* failure boundary marker */}
      {view.failureBoundaryPct <= maxMove && (
        <>
          <line x1={bx} x2={bx} y1={0} y2={H} stroke="#FF9500" strokeOpacity={0.6} strokeWidth={1} />
          <text x={bx + 4} y={H - 5} fontSize={8.5} fill="#FF9500" fontFamily="monospace">{view.failureBoundaryPct.toFixed(2)}% boundary</text>
        </>
      )}
      <path d={line} fill="none" stroke="#ededed" strokeWidth={1.75} />
      {[0, 1, 2, 3].map(m => (
        <text key={m} x={X(m)} y={12} fontSize={8} fill="#6b6b6b" fontFamily="monospace">{m}%</text>
      ))}
    </svg>
  );
};

/** One 5/15/30/60-min window row: dealer flow vs the depth to absorb it. */
const WindowRow = ({ w }: { w: HedgeImpactView['windows'][number] }) => {
  const tone = hexTone(w.hex);
  const barPct = Math.min(100, (w.hex / 2) * 100);
  const buy = w.flowUsd >= 0;
  return (
    <div className="px-3.5 py-2.5 grid grid-cols-[62px_1fr_92px] items-center gap-3">
      <span className="font-mono text-[12px] font-semibold text-textPrimary">{w.label}</span>
      <div className="min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className={`font-mono text-[11px] tnum ${buy ? 'text-bull' : 'text-bear'}`}>
            {buy ? 'BUY' : 'SELL'} {fmtUsd(Math.abs(w.flowUsd))}
          </span>
          <span className="font-mono text-[10px] text-textMuted tnum">
            {fmtNum(w.shares)} sh · {fmtNum(w.futures)} fut · depth {fmtUsd(w.depthUsd)}
          </span>
        </div>
        {/* HEX bar — threshold at the 50% mark (HEX = 1) */}
        <div className="relative h-2 rounded-full bg-white/[0.06] overflow-hidden">
          <span
            className={`block h-full rounded-full ${w.hex >= 1 ? 'bg-bear' : w.hex >= 0.7 ? 'bg-warn' : 'bg-bull'}`}
            style={{ width: `${barPct}%` }}
          />
          <span className="absolute top-0 bottom-0 left-1/2 w-px bg-white/40" aria-hidden />
        </div>
      </div>
      <div className="flex items-center justify-end gap-2">
        <span className="font-mono text-lg font-bold tnum text-textPrimary">{w.hex.toFixed(2)}</span>
        <SignalBadge tone={tone}>{w.hex >= 1 ? 'OVER' : 'OK'}</SignalBadge>
      </div>
    </div>
  );
};

/** Neutral provenance chip — chrome only, never a directional/status color. */
const ProvTag = ({ children, muted = true }: { children: string; muted?: boolean }) => (
  <span
    className={`font-mono text-[10px] font-medium uppercase tracking-wider border border-borderSubtle bg-white/[0.03] rounded px-1.5 py-0.5 shrink-0 ${
      muted ? 'text-textMuted' : 'text-textSecondary'
    }`}
  >
    {children}
  </span>
);

/** Assumptions disclosure — the modeled depth inputs behind the HEX read. */
const AssumptionsDrawer = ({ view }: { view: HedgeImpactView }) => {
  const [open, setOpen] = useState(false);
  return (
    <Panel
      title={
        <span className="inline-flex items-center gap-1.5">
          <SlidersHorizontal className="w-3.5 h-3.5" /> Assumptions
        </span>
      }
      subtitle="modeled liquidity & depth inputs"
      actions={
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold uppercase tracking-wider text-textSecondary hover:text-textPrimary transition-colors"
        >
          {open ? 'Hide' : 'Show'}
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      }
      bodyClassName={open ? 'py-3.5' : 'py-2.5'}
    >
      {!open ? (
        <p className="font-mono text-[11px] text-textMuted leading-relaxed">
          HEX divides a live-chain hedge requirement by modeled market depth. Expand for the depth inputs behind the read.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-[11px] text-textSecondary leading-relaxed">
            The hedge requirement (numerator) comes from the live options chain. The liquidity that absorbs it
            (denominator) is modeled per name and swaps for a real depth feed behind the same contract — so the depth
            values below are single modeled estimates. A live feed would carry base / liquid / illiquid depth ranges in
            their place.
          </p>

          <div className="flex flex-col divide-y divide-borderSubtle rounded-md border border-borderSubtle overflow-hidden">
            {/* Modeled ADV — the liquidity denominator */}
            <div className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <div className="font-mono text-[12px] font-semibold text-textPrimary">Avg daily $ volume</div>
                <div className="text-[10px] text-textMuted leading-tight mt-0.5">liquidity denominator · per name</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-mono text-[13px] font-semibold tnum text-textPrimary">{fmtUsd(view.advUsd)}</span>
                <ProvTag>modeled</ProvTag>
              </div>
            </div>

            {/* Per-window available depth — ADV scaled to each forecast window */}
            <div className="px-3 py-2.5">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="min-w-0">
                  <div className="font-mono text-[12px] font-semibold text-textPrimary">Available depth by window</div>
                  <div className="text-[10px] text-textMuted leading-tight mt-0.5">ADV scaled to each 5–60 min forecast window</div>
                </div>
                <ProvTag>modeled</ProvTag>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {view.windows.map(w => (
                  <div key={w.mins} className="rounded bg-white/[0.03] border border-borderSubtle px-2 py-1.5">
                    <div className="font-mono text-[10px] uppercase tracking-wider text-textMuted">{w.label}</div>
                    <div className="font-mono text-[12px] font-semibold tnum text-textPrimary mt-0.5">{fmtUsd(w.depthUsd)}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Live-chain hedge requirement — the numerator, shown for contrast */}
            <div className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <div className="font-mono text-[12px] font-semibold text-textPrimary">Hedge required · per 1% move</div>
                <div className="text-[10px] text-textMuted leading-tight mt-0.5">{fmtNum(view.hedgeSharesPer1pct)} shares · from the live chain</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-mono text-[13px] font-semibold tnum text-textPrimary">{fmtUsd(view.hedgePer1pctUsd)}</span>
                <ProvTag muted={false}>live chain</ProvTag>
              </div>
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
};

const HedgeImpact = () => {
  const { marketData } = useMarketData();
  const view = useMemo(() => (marketData ? buildHedgeImpact(marketData) : null), [marketData]);

  if (!view) {
    return (
      <Panel className="h-64" bodyClassName="flex items-center justify-center">
        <span className="font-mono text-[11px] text-textMuted uppercase tracking-widest">Modeling hedge impact…</span>
      </Panel>
    );
  }

  const headTone: Tone = view.longGamma ? 'bull' : 'bear';

  return (
    <>
      <MetricGrid min="170px">
        <StatCard
          label="HEX · 15 min"
          value={
            <span className="inline-flex items-baseline gap-1.5">
              {view.hex15.toFixed(2)}
              <span className="text-[10px] font-medium uppercase tracking-wide text-textMuted">modeled</span>
            </span>
          }
          sub="hedge ÷ liquidity"
          tone={hexTone(view.hex15)}
          emphasis
        />
        <StatCard
          label="Hedge flow"
          value={view.hedgeDirection}
          sub={view.longGamma ? 'long gamma — absorptive' : 'short gamma — reflexive'}
          tone={view.longGamma ? 'bull' : 'bear'}
        />
        <StatCard label="Inventory stress" value={`${view.stressLabel} ${view.inventoryStress}`} sub="dealer book strain" tone={stressTone[view.stressLabel]} />
        <StatCard
          label="Failure boundary"
          value={`${view.failureBoundaryPct.toFixed(2)}%`}
          sub={`${view.failureSide} · $${view.failureBoundaryPrice.toFixed(2)}`}
          tone={view.failureBoundaryPct < 0.8 ? 'bear' : view.failureBoundaryPct < 1.5 ? 'warn' : 'bull'}
        />
        <StatCard label="Hedge / 1%" value={fmtUsd(view.hedgePer1pctUsd)} sub={`${fmtNum(view.hedgeSharesPer1pct)} shares`} tone="neutral" />
      </MetricGrid>

      <Panel tone={headTone} bodyClassName="py-3.5" emphasis>
        <p className="text-[15px] text-textPrimary leading-relaxed">
          <span className={`font-mono text-[10px] font-semibold uppercase tracking-widest mr-2.5 ${view.longGamma ? 'text-bull' : 'text-bear'}`}>
            HEX read
          </span>
          {view.headline}
        </p>
      </Panel>

      <AssumptionsDrawer view={view} />

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* Hedge-flow forecast by window */}
        <Panel
          title={
            <span className="inline-flex items-center gap-1.5">
              <Gauge className="w-3.5 h-3.5" /> Dealer hedge-flow forecast
            </span>
          }
          subtitle="what dealers must trade — and whether the book can take it"
          flush
          className="xl:col-span-7"
        >
          <div className="flex flex-col divide-y divide-borderSubtle">
            {view.windows.map(w => (
              <WindowRow key={w.mins} w={w} />
            ))}
          </div>
          <p className="px-3.5 py-2.5 border-t border-borderSubtle font-mono text-[10px] text-textMuted leading-relaxed">
            HEX = required hedge ÷ liquidity available in the window. Under 1, dealers rebalance quietly; over 1, their own
            hedging is the flow that moves price.
          </p>
        </Panel>

        {/* HEX curve — the failure boundary */}
        <Panel
          title={
            <span className="inline-flex items-center gap-1.5">
              <TrendingDown className="w-3.5 h-3.5" /> Hedge failure boundary
            </span>
          }
          subtitle="HEX vs the size of the move, on a 15-min window"
          className="xl:col-span-5"
          tone={view.failureBoundaryPct < 1 ? 'warn' : 'neutral'}
        >
          <HexCurve view={view} />
          <p className="mt-3 text-xs text-textSecondary leading-relaxed">{view.note}</p>
        </Panel>
      </div>

      {/* Inventory stress */}
      <Panel
        title={
          <span className="inline-flex items-center gap-1.5">
            <Waves className="w-3.5 h-3.5" /> Dealer inventory stress
          </span>
        }
        subtitle="how far the book is from a clean, neutral hedge"
        tone={stressTone[view.stressLabel]}
      >
        <div className="flex items-center gap-4">
          <span className={`font-mono text-3xl font-bold tnum ${view.stressLabel === 'CRITICAL' ? 'text-bear' : view.stressLabel === 'STRETCHED' ? 'text-warn' : 'text-textPrimary'}`}>
            {view.inventoryStress}
          </span>
          <div className="flex-1">
            <div className="relative h-2.5 rounded-full bg-white/[0.06] overflow-hidden">
              <span
                className={`block h-full rounded-full ${view.stressLabel === 'CRITICAL' ? 'bg-bear' : view.stressLabel === 'STRETCHED' ? 'bg-warn' : view.stressLabel === 'BUILDING' ? 'bg-select' : 'bg-bull'}`}
                style={{ width: `${view.inventoryStress}%` }}
              />
              {[36, 58, 78].map(t => (
                <span key={t} className="absolute top-0 bottom-0 w-px bg-white/25" style={{ left: `${t}%` }} aria-hidden />
              ))}
            </div>
            <div className="mt-1.5 flex items-center justify-between font-mono text-[9px] uppercase tracking-wider text-textMuted">
              <span>Light</span>
              <span>Building</span>
              <span>Stretched</span>
              <span>Critical</span>
            </div>
          </div>
          <SignalBadge tone={stressTone[view.stressLabel]} dot>
            {view.stressLabel}
          </SignalBadge>
        </div>
      </Panel>

      <Panel bodyClassName="py-3">
        <p className="text-xs text-textSecondary leading-relaxed">
          <span className="font-mono font-semibold uppercase tracking-wider mr-2 holo-text">Beyond GEX</span>
          Two sessions can carry identical gamma and trade nothing alike — the difference is depth. HEX divides the hedge dealers
          are forced to do by the liquidity available to absorb it, so it reads the outcome GEX only implies. The forecast turns
          gamma into shares and futures over the next 5–60 minutes; the failure boundary is the move where that hedging outruns the
          book and starts feeding itself. Gamma and OI are the live chain; depth is modeled per name and swaps for a real feed
          behind the same contract.
        </p>
      </Panel>
    </>
  );
};

export default HedgeImpact;
