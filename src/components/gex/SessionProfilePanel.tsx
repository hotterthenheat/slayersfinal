import { useState } from 'react';
import { fmtUsd } from '../../data/gex';
import type { DeltaEquivFlow, SessionProfileData } from '../../types/gex';
import HoverReadout from '../ui/HoverReadout';
import Term from '../ui/Term';
import type { TermKey } from '../../data/terms';
import DataUnavailablePanel from '../workspace/DataUnavailablePanel';

/*
==================================================
  SLAYER TERMINAL - SESSION PROFILE (gex/SessionProfilePanel.tsx)

  Where the session's volume traded, the price it
  concentrated at, and the volume-weighted average.

  THIS WAS THE ORDER FLOW PANEL. It drew a cumulative-delta
  curve and a signed delta-by-price histogram, and neither
  quantity could be computed from what this product
  receives. Cumulative delta is the running imbalance
  between trades that LIFTED THE OFFER and trades that HIT
  THE BID; deciding which a trade was needs the trade and
  the quote standing at that instant. Our entitlements carry
  Nasdaq Basic and 15-minute-delayed CTA/UTP, and the series
  behind them is OHLCV bars.

  So the delta was the bar BODY times volume, times a
  constant, plus noise — and the code said so: "standing in
  for the unobserved aggressor split". `Buy $` and `Sell $`
  were worse, adding a dollar quantity to a body×volume one.

  What is here now is what the bars actually contain, and it
  is most of what the panel was being read for anyway: a
  volume profile, its point of control, and a true VWAP. No
  bar claims a side, because no bar knows one.
==================================================
*/

interface SessionProfilePanelProps {
  data: SessionProfileData;
}

const fmtVol = (v: number): string => {
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return v.toFixed(0);
};

/**
 * Volume by price — one unsigned bar per bucket, the point of control marked.
 *
 * UNSIGNED, and that is the point. The bar it replaced was a signed delta
 * painted bull or bear, which put a direction on a number that has none: volume
 * traded at a price is volume, and who was the aggressor is exactly the thing
 * this data cannot say. One neutral ink, length carrying the only fact there is.
 */
const VolumeByPriceBars = ({ data }: { data: SessionProfileData }) => {
  const rows = data.volumeByPrice;
  const max = rows.reduce((a, r) => Math.max(a, r.volume), 1);
  const [hover, setHover] = useState<{ price: number; volume: number; x: number; y: number } | null>(null);
  const total = data.sessionVolume || 1;

  return (
    <div className="flex flex-col gap-[3px]">
      {rows.map(r => {
        const pct = Math.min(100, (r.volume / max) * 100);
        const isPoc = r.price === data.poc;
        return (
          <div
            key={r.price}
            onMouseEnter={e => setHover({ price: r.price, volume: r.volume, x: e.clientX, y: e.clientY })}
            onMouseMove={e => setHover({ price: r.price, volume: r.volume, x: e.clientX, y: e.clientY })}
            onMouseLeave={() => setHover(h => (h && h.price === r.price ? null : h))}
            className="flex cursor-crosshair items-center gap-1.5 rounded-sm hover:bg-rowHover"
          >
            <span
              className={`w-14 shrink-0 text-right font-mono text-micro tnum ${
                isPoc ? 'font-bold text-select' : 'text-textMuted'
              }`}
            >
              {r.price.toFixed(2)}
            </span>
            <div className="relative h-[6px] flex-1">
              <span
                className="absolute top-[1px] left-0 h-[4px] rounded-sm"
                style={{
                  width: `${pct}%`,
                  /* The point of control gets the selection silver; every other
                     bucket is the same neutral. Volume has no direction to
                     colour, so the only thing worth highlighting is the one
                     price the session kept coming back to. */
                  background: isPoc ? 'rgba(228,232,244,0.85)' : 'rgba(228,232,244,0.28)',
                }}
              />
            </div>
          </div>
        );
      })}
      {hover && (
        <HoverReadout x={hover.x} y={hover.y}>
          <div className="font-mono text-caption font-bold tnum text-textPrimary">${hover.price.toFixed(2)}</div>
          <div className="mt-0.5 font-mono text-data font-bold tnum text-textPrimary">
            {fmtVol(hover.volume)} shares
          </div>
          <div className="mt-0.5 font-mono text-micro text-textSecondary">
            {((hover.volume / total) * 100).toFixed(1)}% of session volume
            {hover.price === data.poc ? ' · point of control' : ''}
          </div>
        </HoverReadout>
      )}
    </div>
  );
};

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

/** Session volume profile: where it traded, where it concentrated, and VWAP. */
const SessionProfilePanel = ({ data }: SessionProfilePanelProps) => {
  if (!data.available) {
    // A cash index carries delta-equivalent flow instead of share volume (P4.4);
    // fall back to the bare unavailable state only when even that is absent.
    if (data.deltaEquiv) return <DeltaEquivFlowView flow={data.deltaEquiv} />;
    return <DataUnavailablePanel requires="real share volume, which cash indices do not have" />;
  }
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div
        tabIndex={0}
        role="group"
        aria-label="Volume by price — scrollable"
        className="min-h-0 flex-grow overflow-y-auto focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-select/60"
      >
        <div className="mb-1.5 font-mono text-micro uppercase tracking-widest text-textMuted">Volume by price</div>
        <VolumeByPriceBars data={data} />
      </div>
      <div className="grid grid-cols-3 gap-2 border-t border-borderSubtle pt-2">
        <Stat label="Volume" value={fmtVol(data.sessionVolume)} />
        <Stat label="VWAP" help="VWAP" value={`$${data.vwap.toFixed(2)}`} />
        <Stat label="POC" help="POC" value={`$${data.poc.toFixed(2)}`} />
      </div>
    </div>
  );
};

export default SessionProfilePanel;
