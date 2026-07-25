import { useState } from 'react';
import { fmtUsd } from '../../data/gex';
import type { OrderFlowData } from '../../types/gex';
import { BULL, BEAR } from './palette';
import HoverReadout from '../ui/HoverReadout';
import Term from '../ui/Term';
import type { TermKey } from '../../data/terms';
import { svgHoverIndex } from '../ui/svgHover';

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
            className="flex items-center gap-1.5 cursor-crosshair rounded-sm hover:bg-white/[0.03]"
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

const Stat = ({ label, help, value, tone = 'text-textPrimary' }: { label: string; help?: TermKey; value: string; tone?: string }) => (
  <span className="min-w-0">
    <span className="block font-mono text-micro uppercase tracking-widest text-textMuted">
      {help ? <Term k={help}>{label}</Term> : label}
    </span>
    <span className={`block font-mono text-micro font-semibold tnum ${tone}`}>{value}</span>
  </span>
);

/** Session order-flow read: cumulative delta, delta by price, tape stats. */
const OrderFlowPanel = ({ data }: OrderFlowPanelProps) => (
  <div className="flex flex-col gap-3 h-full min-h-0">
    <div>
      <div className="font-mono text-micro uppercase tracking-widest text-textMuted mb-1">Cumulative Delta</div>
      <CumulativeDelta data={data} />
    </div>
    <div tabIndex={0} role="region" aria-label="Order flow — scrollable" className="flex-grow min-h-0 overflow-y-auto focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-select/50">
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

export default OrderFlowPanel;
