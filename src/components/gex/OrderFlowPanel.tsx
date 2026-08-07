import { useState } from 'react';
import { fmtUsd } from '../../data/gex';
import type { DeltaEquivFlow, OrderFlowData } from '../../types/gex';
import { BULL, BEAR } from './palette';
import HoverReadout from '../ui/HoverReadout';
import Term from '../ui/Term';
import type { TermKey } from '../../data/terms';
import { svgHoverIndex } from '../ui/svgHover';
import DataUnavailablePanel from '../workspace/DataUnavailablePanel';

interface OrderFlowPanelProps {
  data: OrderFlowData;
}

/** Minutes into the session → HH:MM wall clock off the 09:30 open. */
const sessionClock = (minute: number): string => {
  const t = 9 * 60 + 30 + minute;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

/** SVG area chart of session cumulative delta — sign decides the fill tone. */
const CumulativeDelta = ({ data }: { data: OrderFlowData }) => {
  const points = data.cumulativeDelta;
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  if (points.length < 2) return null;

  const W = 100;
  const H = 40;
  let min = Infinity;
  let max = -Infinity;
  for (const p of points) {
    if (p.value < min) min = p.value;
    if (p.value > max) max = p.value;
  }
  const span = max - min || 1;
  const x = (i: number) => (i / (points.length - 1)) * W;
  const y = (v: number) => H - ((v - min) / span) * H;
  const zeroY = Math.max(0, Math.min(H, y(0)));

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)},${y(p.value).toFixed(2)}`).join(' ');
  const area = `${line} L${W},${zeroY.toFixed(2)} L0,${zeroY.toFixed(2)} Z`;
  const negative = (points[points.length - 1]?.value ?? 0) < 0;
  const stroke = negative ? BEAR : BULL;
  const fill = negative ? 'rgba(255,59,48,0.10)' : 'rgba(48,209,88,0.10)';
  const hp = hover ? points[hover.i] : null;

  return (
    <>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="w-full h-24 cursor-crosshair"
        role="img"
        aria-label="Session cumulative delta"
        onMouseMove={e => setHover({ i: svgHoverIndex(e, points.length), x: e.clientX, y: e.clientY })}
        onMouseLeave={() => setHover(null)}
      >
        <line x1="0" y1={zeroY} x2={W} y2={zeroY} stroke="rgba(255,255,255,0.08)" strokeWidth="0.4" />
        <path d={area} fill={fill} />
        <path d={line} fill="none" stroke={stroke} strokeWidth="0.7" vectorEffect="non-scaling-stroke" />
        {hover && (
          <line x1={x(hover.i)} x2={x(hover.i)} y1={0} y2={H} stroke="rgba(255,255,255,0.25)" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      {hover && hp && (
        <HoverReadout x={hover.x} y={hover.y}>
          <div className="font-mono text-caption font-bold text-textPrimary tnum">{sessionClock(hp.minute)}</div>
          <div className={`mt-0.5 font-mono text-data font-bold tnum ${hp.value >= 0 ? 'text-bull' : 'text-bear'}`}>
            {hp.value >= 0 ? '+' : '−'}
            {fmtUsd(Math.abs(hp.value))}
          </div>
          <div className="mt-0.5 font-mono text-micro text-textSecondary">
            {hp.value >= 0 ? 'net buying pressure building' : 'net selling pressure building'}
          </div>
        </HoverReadout>
      )}
    </>
  );
};

/** Horizontal delta-by-price histogram — the volume-profile read. */
const DeltaByPriceBars = ({ data }: { data: OrderFlowData }) => {
  const rows = [...data.deltaByPrice].sort((a, b) => b.price - a.price);
  const max = rows.reduce((a, r) => Math.max(a, Math.abs(r.value)), 1);
  const [hover, setHover] = useState<{ price: number; value: number; x: number; y: number } | null>(null);
  return (
    <div className="flex flex-col gap-[3px]">
      {rows.map(r => {
        const pct = Math.min(48, (Math.abs(r.value) / max) * 48);
        const neg = r.value < 0;
        const isPoc = r.price === data.poc;
        return (
          <div
            key={r.price}
            onMouseEnter={e => setHover({ price: r.price, value: r.value, x: e.clientX, y: e.clientY })}
            onMouseMove={e => setHover({ price: r.price, value: r.value, x: e.clientX, y: e.clientY })}
            onMouseLeave={() => setHover(h => (h && h.price === r.price ? null : h))}
            className="flex items-center gap-1.5 cursor-crosshair rounded-sm hover:bg-rowHover"
          >
            <span className={`w-12 shrink-0 text-right font-mono text-micro tnum ${isPoc ? 'text-textPrimary font-semibold' : 'text-textMuted'}`}>
              {r.price.toFixed(2)}
            </span>
            <div className="relative flex-1 h-[6px]">
              <span className="absolute left-1/2 top-0 bottom-0 w-px bg-borderMuted" />
              <span
                className="absolute top-[1px] h-[4px] rounded-sm"
                style={{
                  left: neg ? `calc(50% - ${pct}%)` : '50%',
                  width: `${pct}%`,
                  background: neg ? 'rgba(255,59,48,0.78)' : 'rgba(48,209,88,0.9)',
                }}
              />
            </div>
          </div>
        );
      })}
      {hover && (
        <HoverReadout x={hover.x} y={hover.y}>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-caption font-bold text-textPrimary tnum">{hover.price.toFixed(2)}</span>
            {hover.price === data.poc && (
              <span className="font-mono text-micro font-bold uppercase tracking-wider text-select">poc</span>
            )}
          </div>
          <div className={`mt-0.5 font-mono text-data font-bold tnum ${hover.value >= 0 ? 'text-bull' : 'text-bear'}`}>
            {hover.value >= 0 ? '+' : '−'}
            {fmtUsd(Math.abs(hover.value))}
          </div>
          <div className="mt-0.5 font-mono text-micro text-textSecondary">
            {hover.value >= 0 ? 'net buying · delta' : 'net selling · delta'}
          </div>
        </HoverReadout>
      )}
    </div>
  );
};

/** Compact share count with the panel's minus glyph. */
const fmtShares = (v: number): string => {
  const s = v < 0 ? '−' : '';
  const a = Math.abs(v);
  if (a >= 1e6) return `${s}${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${s}${(a / 1e3).toFixed(1)}K`;
  return `${s}${a.toFixed(0)}`;
};

/**
 * Cash-index delta-equivalent flow (P4.4). Share flow does not exist for a cash
 * index, so this shows what does: the options book restated as one
 * underlying-equivalent delta, net and by strike.
 */
const DeltaEquivFlowView = ({ flow }: { flow: DeltaEquivFlow }) => {
  const rows = flow.byStrike;
  const max = rows.reduce((a, r) => Math.max(a, Math.abs(r.value)), 1);
  const [hover, setHover] = useState<{ strike: number; value: number; x: number; y: number } | null>(null);
  const netLong = flow.netDollars >= 0;
  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      <p className="text-micro leading-relaxed text-textMuted">
        A cash index has no share volume. This is its options book restated as an underlying-equivalent delta — Σ delta × open interest × 100 — the honest stand-in for order flow.
      </p>
      <div tabIndex={0} role="group" aria-label="Delta-equivalent flow by strike — scrollable" className="flex-grow min-h-0 overflow-y-auto focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-select/60">
        <div className="font-mono text-micro uppercase tracking-widest text-textMuted mb-1.5">Delta-equivalent by strike</div>
        <div className="flex flex-col gap-[3px]">
          {rows.map(r => {
            const pct = Math.min(48, (Math.abs(r.value) / max) * 48);
            const neg = r.value < 0;
            return (
              <div
                key={r.strike}
                onMouseEnter={e => setHover({ strike: r.strike, value: r.value, x: e.clientX, y: e.clientY })}
                onMouseMove={e => setHover({ strike: r.strike, value: r.value, x: e.clientX, y: e.clientY })}
                onMouseLeave={() => setHover(h => (h && h.strike === r.strike ? null : h))}
                className="flex items-center gap-1.5 cursor-crosshair rounded-sm hover:bg-rowHover"
              >
                <span className="w-14 shrink-0 text-right font-mono text-micro tnum text-textMuted">{r.strike.toFixed(0)}</span>
                <div className="relative flex-1 h-[6px]">
                  <span className="absolute left-1/2 top-0 bottom-0 w-px bg-borderMuted" />
                  <span
                    className="absolute top-[1px] h-[4px] rounded-sm"
                    style={{
                      left: neg ? `calc(50% - ${pct}%)` : '50%',
                      width: `${pct}%`,
                      background: neg ? 'rgba(255,59,48,0.78)' : 'rgba(48,209,88,0.9)',
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2 pt-2 border-t border-borderSubtle">
        <Stat label="Call Δ-eq" value={fmtUsd(flow.callDollars)} tone="text-bull" />
        <Stat label="Put Δ-eq" value={fmtUsd(flow.putDollars)} tone="text-bear" />
        <Stat label="Net Δ-eq" value={fmtUsd(flow.netDollars)} tone={netLong ? 'text-bull' : 'text-bear'} />
        <Stat label="≈ Shares" value={fmtShares(flow.netShares)} tone={netLong ? 'text-bull' : 'text-bear'} />
      </div>
      {hover && (
        <HoverReadout x={hover.x} y={hover.y}>
          <div className="font-mono text-caption font-bold text-textPrimary tnum">{hover.strike.toFixed(0)}</div>
          <div className={`mt-0.5 font-mono text-data font-bold tnum ${hover.value >= 0 ? 'text-bull' : 'text-bear'}`}>
            {hover.value >= 0 ? '+' : '−'}
            {fmtUsd(Math.abs(hover.value))}
          </div>
          <div className="mt-0.5 font-mono text-micro text-textSecondary">
            {hover.value >= 0 ? 'net long delta · calls lead' : 'net short delta · puts lead'}
          </div>
        </HoverReadout>
      )}
    </div>
  );
};

const Stat = ({ label, help, value, tone = 'text-textPrimary' }: { label: string; help?: TermKey; value: string; tone?: string }) => (
  <span className="min-w-0">
    <span className="block font-mono text-micro uppercase tracking-widest text-textMuted">
      {help ? <Term k={help}>{label}</Term> : label}
    </span>
    <span className={`block font-mono text-micro font-semibold tnum ${tone}`}>{value}</span>
  </span>
);

/** Session order-flow read: cumulative delta, delta by price, tape stats. */
const OrderFlowPanel = ({ data }: OrderFlowPanelProps) => {
  if (!data.available) {
    // A cash index carries delta-equivalent flow instead of share flow (P4.4);
    // fall back to the bare unavailable state only when even that is absent.
    if (data.deltaEquiv) return <DeltaEquivFlowView flow={data.deltaEquiv} />;
    return <DataUnavailablePanel requires="real share volume, which cash indices do not have" />;
  }
  return (
  <div className="flex flex-col gap-3 h-full min-h-0">
    <div>
      <div className="font-mono text-micro uppercase tracking-widest text-textMuted mb-1">Cumulative Delta</div>
      <CumulativeDelta data={data} />
    </div>
    <div tabIndex={0} role="group" aria-label="Order flow — scrollable" className="flex-grow min-h-0 overflow-y-auto focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-select/60">
      <div className="font-mono text-micro uppercase tracking-widest text-textMuted mb-1.5">Delta by Price</div>
      <DeltaByPriceBars data={data} />
    </div>
    <div className="grid grid-cols-5 gap-2 pt-2 border-t border-borderSubtle">
      <Stat label="Buy $" value={fmtUsd(data.buyVolume)} tone="text-bull" />
      <Stat label="Sell $" value={fmtUsd(data.sellVolume)} tone="text-bear" />
      <Stat label="Delta" value={fmtUsd(data.netDelta)} tone={data.netDelta >= 0 ? 'text-bull' : 'text-bear'} />
      <Stat label="VWAP" help="VWAP" value={`$${data.vwap.toFixed(2)}`} />
      <Stat label="POC" help="POC" value={`$${data.poc.toFixed(2)}`} />
    </div>
  </div>
  );
};

export default OrderFlowPanel;
