import { useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts';
import { fmtUsd } from '../../data/gex';
import type { DeltaEquivFlow, DeltaPoint, OrderFlowData } from '../../types/gex';
import { BULL, BEAR } from './palette';
import HoverReadout from '../ui/HoverReadout';
import { ChartTip, TipHead, TipRow, TipNote } from '../charts/ChartTip';
import { splitBySign, type SignSplitRow } from '../charts/signSplit';
import { CURSOR, zeroAnchoredDomain } from '../charts/chartTheme';
import Term from '../ui/Term';
import type { TermKey } from '../../data/terms';
import DataUnavailablePanel from '../workspace/DataUnavailablePanel';

interface OrderFlowPanelProps {
  data: OrderFlowData;
}

/** Minutes into the session → HH:MM wall clock off the 09:30 open. */
const sessionClock = (minute: number): string => {
  const t = 9 * 60 + 30 + minute;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

/*
  Session cumulative delta, on recharts.

  Coloured by the sign it is AT each point, not the sign it happens to end on.
  The old version picked one colour from the last value and painted the whole
  path with it, so a session that spent the morning on net buying and closed on
  net selling was drawn entirely red — the same defect the render pass caught on
  the Gamma Tape. components/charts/signSplit inserts the interpolated crossings
  so the two halves meet exactly on the zero rule.
*/
const CumulativeDelta = ({ data }: { data: OrderFlowData }) => {
  const points = data.cumulativeDelta;
  if (points.length < 2) return null;

  const series = splitBySign(points, p => p.value);
  const domain = zeroAnchoredDomain(points.map(p => p.value));
  const n = points.length;

  return (
    <div
      className="h-24 w-full"
      role="img"
      aria-label={`Session cumulative delta, closing ${points[n - 1].value >= 0 ? 'net buying' : 'net selling'} at ${fmtUsd(Math.abs(points[n - 1].value))}.`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={series} margin={{ top: 4, right: 2, bottom: 0, left: 0 }}>
          <XAxis type="number" dataKey="x" domain={[0, Math.max(n - 1, 1)]} hide />
          <YAxis type="number" domain={domain} hide />
          <ReferenceLine y={0} stroke="rgba(255,255,255,0.10)" />
          <Tooltip
            cursor={CURSOR}
            content={
              <ChartTip<SignSplitRow<DeltaPoint>>
                render={r => {
                  if (!r.src) {
                    return (
                      <>
                        <TipHead>Delta crossed flat</TipHead>
                        <TipRow label="Cumulative" value="$0" />
                        <TipNote>Session buying and selling balanced exactly here before the pressure changed sides.</TipNote>
                      </>
                    );
                  }
                  const p = r.src;
                  const last = points[n - 1].value;
                  return (
                    <>
                      <TipHead sub="cumulative Δ">{sessionClock(p.minute)}</TipHead>
                      <TipRow
                        label={p.value >= 0 ? 'Net buying' : 'Net selling'}
                        value={fmtUsd(Math.abs(p.value))}
                        tone={p.value >= 0 ? 'text-bull' : 'text-bear'}
                      />
                      <TipRow label="Share of final" value={last === 0 ? '—' : `${Math.round((p.value / last) * 100)}%`} tone="text-textMuted" />
                      <TipNote>
                        {p.value >= 0
                          ? 'Buyers had paid the offer more than sellers hit the bid up to this point — pressure building on the bid side.'
                          : 'Sellers had hit the bid more than buyers lifted the offer up to this point — pressure building on the offer side.'}
                      </TipNote>
                    </>
                  );
                }}
              />
            }
          />
          <Area type="linear" dataKey="pos" stroke={BULL} strokeWidth={1.2} fill={BULL} fillOpacity={0.12} baseValue={0} connectNulls={false} dot={false} activeDot={{ r: 2.5, fill: BULL, stroke: 'none' }} isAnimationActive={false} />
          <Area type="linear" dataKey="neg" stroke={BEAR} strokeWidth={1.2} fill={BEAR} fillOpacity={0.12} baseValue={0} connectNulls={false} dot={false} activeDot={{ r: 2.5, fill: BEAR, stroke: 'none' }} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
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
