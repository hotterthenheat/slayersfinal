import { Fragment, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import Simulator from '../../core/simulator';
import { fmtUsd } from '../../data/gex';
import SpotRule from '../ui/SpotRule';
import SignalBadge from '../ui/SignalBadge';
import TrendLine from './TrendLine';
import type { ExposureProfileData, StrikeExposure, ZoneBand, ZoneKind } from '../../types/gex';

interface PositioningMapProps {
  data: ExposureProfileData;
  /** Strike currently hovered in either panel (synced highlight) */
  hoverStrike?: number | null;
  /** Strike pinned by click — cyan selection language */
  selectedStrike?: number | null;
  onHoverStrike?: (strike: number | null) => void;
  onSelectStrike?: (strike: number) => void;
}

const ZONE_STYLE: Record<ZoneKind, { rail: string; text: string }> = {
  'call-wall': { rail: 'bg-bull/80', text: 'text-bull' },
  'put-wall': { rail: 'bg-bear/70', text: 'text-bear' },
  friction: { rail: 'bg-textMuted/40', text: 'text-textMuted' },
};

/**
 * One side's pressure bar, anchored at the center line, direction by sign.
 * Widths animate between scans so the map breathes instead of snapping.
 */
const CenterBar = ({ value, max, color, top }: { value: number; max: number; color: string; top: boolean }) => {
  const pct = Math.min(48, (Math.abs(value) / (max || 1)) * 48);
  const neg = value < 0;
  return (
    <motion.span
      className={`absolute ${top ? 'top-[2px]' : 'bottom-[2px]'} h-[4px] rounded-sm`}
      initial={false}
      animate={{ left: `${neg ? 50 - pct : 50}%`, width: `${pct}%`, opacity: pct < 0.5 ? 0 : 1 }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      style={{ background: color }}
    />
  );
};

const SpotMarker = ({ ticker, spot }: { ticker: string; spot: number }) => (
  <div className="px-2 py-1">
    <SpotRule ticker={ticker} price={spot} />
  </div>
);

/** Rate-of-change lookbacks in 1-minute bars. */
const ROC_WINDOWS: { label: string; bars: number }[] = [
  { label: '1 min', bars: 1 },
  { label: '5 min', bars: 5 },
  { label: '15 min', bars: 15 },
  { label: '1 hour', bars: 60 },
  { label: '1 day', bars: 390 },
];

const StrikeHoverCard = ({ row, ticker, y }: { row: StrikeExposure; ticker: string; y: number }) => {
  // Raw per-strike net-GEX history (same store that powers Wall Drift)
  const series = useMemo(() => {
    const snaps = Simulator.getGexHistory(ticker) ?? [];
    const out: number[] = [];
    for (let i = Math.max(0, snaps.length - 391); i < snaps.length; i++) {
      const lvl = snaps[i].levels.find(l => l.strike === row.strike);
      if (lvl) out.push(lvl.value);
    }
    return out;
  }, [ticker, row.strike]);

  const callHeavy = Math.abs(row.gex.call) >= Math.abs(row.gex.put);
  const now = series[series.length - 1] ?? row.gex.net;
  const recent = series.slice(-16);
  const rising = recent.length > 1 && recent[recent.length - 1] >= recent[0];
  const strikeLabel = row.strike % 1 === 0 ? row.strike.toFixed(0) : row.strike.toFixed(2);

  return (
    <div
      className={`absolute z-20 w-60 pointer-events-none border border-borderSubtle bg-[#0c0c0c]/95 rounded-md shadow-lg p-3 animate-soft-in ${
        callHeavy ? 'right-24' : 'left-16'
      }`}
      style={{ top: Math.max(4, y - 110) }}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] font-bold text-textPrimary tnum">
          Strike {strikeLabel}
          {row.pin && <span className="ml-1.5 font-mono text-[8px] font-bold uppercase tracking-wider text-textSecondary">pin</span>}
        </span>
        <SignalBadge tone={callHeavy ? 'bull' : 'bear'}>{callHeavy ? 'CALL-HEAVY' : 'PUT-HEAVY'}</SignalBadge>
      </div>

      {/* Current value */}
      <div className="mt-2">
        <div className="font-mono text-[8px] uppercase tracking-widest text-textMuted">Net GEX · now</div>
        <div className={`font-mono text-base font-bold tnum ${row.gex.net >= 0 ? 'text-bull' : 'text-bear'}`}>
          {row.gex.net >= 0 ? '+' : ''}
          {fmtUsd(row.gex.net)}
        </div>
        <div className={`font-mono text-[9px] uppercase tracking-wider ${rising ? 'text-bull' : 'text-bear'}`}>
          {rising ? '↗ exposure building' : '↘ exposure draining'}
        </div>
      </div>

      {/* Legs */}
      <div className="mt-2 flex items-center gap-3 font-mono text-[9px] uppercase tracking-wider text-textMuted tnum">
        <span>
          C <span className="text-bull">{fmtUsd(row.gex.call)}</span>
        </span>
        <span>
          P <span className="text-bear">{fmtUsd(row.gex.put)}</span>
        </span>
        <span>
          DEX <span className="text-textSecondary">{fmtUsd(row.dex.net)}</span>
        </span>
      </div>

      {/* Trend */}
      {recent.length > 1 && (
        <div className="mt-2 pt-2 border-t border-borderSubtle/60">
          <div className="font-mono text-[8px] uppercase tracking-widest text-textMuted mb-1">Value over time</div>
          <TrendLine points={recent} />
          <div className="flex justify-between font-mono text-[8px] text-textMuted">
            <span>15m ago</span>
            <span>now</span>
          </div>
        </div>
      )}

      {/* Rate of change */}
      {series.length > 2 && (
        <div className="mt-2 pt-2 border-t border-borderSubtle/60">
          <div className="font-mono text-[8px] uppercase tracking-widest text-textMuted mb-1">Rate of change</div>
          <div className="flex flex-col gap-[3px]">
            {ROC_WINDOWS.map(w => {
              const past = series[series.length - 1 - w.bars];
              if (past === undefined) return null;
              const delta = now - past;
              const pct = past !== 0 ? (delta / Math.abs(past)) * 100 : 0;
              const up = delta >= 0;
              return (
                <div key={w.label} className="flex items-center justify-between font-mono text-[9px] tnum">
                  <span className="text-textMuted">{w.label}</span>
                  <span className={up ? 'text-bull' : 'text-bear'}>
                    {up ? '+' : '−'}
                    {fmtUsd(Math.abs(delta)).replace('$', '$')} {up ? '+' : '−'}
                    {Math.abs(pct).toFixed(1)}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

/** Gamma flip — the sticky/slippery regime line. Hero orange, spottable in <2s. */
const FlipMarker = ({ price }: { price: number }) => (
  <div className="flex items-center gap-1.5 px-2 py-[2px]">
    <span className="h-0 flex-grow border-t border-dashed border-flip/70" />
    <span className="inline-flex items-center rounded-[3px] border border-flip/60 bg-canvas px-1.5 py-px font-mono text-[8px] font-bold uppercase tracking-wider text-flip whitespace-nowrap">
      FLIP {price % 1 === 0 ? price.toFixed(0) : price.toFixed(2)}
    </span>
    <span className="h-0 w-3 shrink-0 border-t border-dashed border-flip/70" />
  </div>
);

/**
 * Net dealer pressure by strike — put/call bars diverge from a center zero
 * line; wall / friction zones annotate the right rail. Sign convention is
 * spelled out in the footer so color is never the only signal.
 */
const PositioningMap = ({ data, hoverStrike, selectedStrike, onHoverStrike, onSelectStrike }: PositioningMapProps) => {
  const { ticker, strikes, maxAbs, levels, zones, spotAfterIndex } = data;
  const max = maxAbs.gex;

  // Hover card state — row under the cursor + cursor Y within the map body
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [hoverRow, setHoverRow] = useState<StrikeExposure | null>(null);
  const [hoverY, setHoverY] = useState(0);

  // Flip marker slot — sits after the last strike above the flip level (rows descending)
  let flipAfterIndex = strikes.findIndex(
    (row, i) => row.strike >= levels.flip && (strikes[i + 1]?.strike ?? -Infinity) < levels.flip
  );
  if (flipAfterIndex === -1) flipAfterIndex = levels.flip > (strikes[0]?.strike ?? 0) ? -0.5 : strikes.length - 1;

  const zoneFor = (strike: number): ZoneBand | undefined =>
    zones.find(z => strike <= z.from && strike >= z.to);
  const zoneStartsAt = (strike: number, i: number): ZoneBand | undefined => {
    const z = zoneFor(strike);
    if (!z) return undefined;
    const prev = strikes[i - 1];
    return !prev || !zoneFor(prev.strike) || zoneFor(prev.strike) !== z ? z : undefined;
  };

  return (
    <div className="flex flex-col h-full min-h-0 relative">
      {/* Legend */}
      <div className="flex items-center gap-3 px-2 py-1.5 border-b border-borderSubtle flex-wrap select-none">
        {[
          { label: 'Put pressure', cls: 'w-2.5 h-0.5 rounded-full bg-bear/80' },
          { label: 'Call pressure', cls: 'w-2.5 h-0.5 rounded-full bg-bull/90' },
          { label: 'Spot', cls: 'w-2.5 h-0.5 rounded-full bg-textPrimary' },
          { label: 'Pin', cls: 'w-3 h-0 border-t border-dashed border-textPrimary/70' },
          { label: 'Flip', cls: 'w-3 h-0 border-t border-dashed border-flip/80' },
        ].map(item => (
          <span key={item.label} className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-textSecondary">
            <span className={`inline-block ${item.cls}`} />
            {item.label}
          </span>
        ))}
      </div>

      {/* Scale header */}
      <div className="flex items-center px-2 py-1 border-b border-borderSubtle/60 select-none">
        <span className="w-14 shrink-0" />
        <div className="flex-1 flex justify-between font-mono text-[8px] text-textMuted tnum">
          <span>−{fmtUsd(max).replace('$', '$')}</span>
          <span>0</span>
          <span>+{fmtUsd(max)}</span>
        </div>
        <span className="w-20 shrink-0" />
      </div>

      {/* Rows */}
      <div
        ref={bodyRef}
        className="flex-grow overflow-y-auto min-h-0"
        onMouseMove={e => {
          const rect = bodyRef.current?.getBoundingClientRect();
          if (rect) setHoverY(e.clientY - rect.top + (bodyRef.current?.offsetTop ?? 0));
        }}
        onMouseLeave={() => setHoverRow(null)}
      >
        {spotAfterIndex === -0.5 && <SpotMarker ticker={ticker} spot={levels.spot} />}
        {strikes.map((row, i) => {
          const zone = zoneFor(row.strike);
          const zoneStart = zoneStartsAt(row.strike, i);
          return (
            <Fragment key={row.strike}>
              <div
                onMouseEnter={() => {
                  setHoverRow(row);
                  onHoverStrike?.(row.strike);
                }}
                onMouseLeave={onHoverStrike ? () => onHoverStrike(null) : undefined}
                onClick={onSelectStrike ? () => onSelectStrike(row.strike) : undefined}
                className={`flex items-center border-b border-borderSubtle/20 transition-colors ${
                  row.pin ? 'bg-white/[0.03]' : ''
                } ${onSelectStrike ? 'cursor-pointer' : ''} ${
                  selectedStrike === row.strike
                    ? 'bg-select/[0.05] shadow-[inset_2px_0_0_0_rgba(199,211,232,0.7)]'
                    : hoverStrike === row.strike
                      ? 'bg-white/[0.04]'
                      : ''
                }`}
              >
                <span className="w-14 shrink-0 px-2 py-[3px] bg-inset border-r border-borderSubtle/40 font-mono text-[10px] font-semibold tnum text-textSecondary">
                  {row.strike % 1 === 0 ? row.strike.toFixed(0) : row.strike.toFixed(2)}
                </span>
                <div className="relative flex-1 h-[14px]">
                  {/* quarter gridlines + center zero line */}
                  <span className="absolute left-1/4 top-0 bottom-0 w-px bg-white/[0.04]" />
                  <span className="absolute left-3/4 top-0 bottom-0 w-px bg-white/[0.04]" />
                  <span className="absolute left-1/2 top-0 bottom-0 w-px bg-borderMuted" />
                  {/* Pin magnet rule — behind the bars, unmistakable */}
                  {row.pin && <span className="absolute inset-x-0 top-1/2 border-t border-dashed border-textPrimary/30" />}
                  <CenterBar value={row.gex.call} max={max} color="rgba(48,209,88,0.9)" top />
                  <CenterBar value={row.gex.put} max={max} color="rgba(255,59,48,0.78)" top={false} />
                  {row.pin && (
                    <span className="absolute right-1 top-1/2 -translate-y-1/2 inline-flex items-center rounded-[3px] border border-textPrimary/60 bg-canvas px-1.5 py-px font-mono text-[8px] font-bold uppercase tracking-wider text-textPrimary">
                      PIN {row.strike % 1 === 0 ? row.strike.toFixed(0) : row.strike.toFixed(2)}
                    </span>
                  )}
                </div>
                {/* Zone rail */}
                <span className="w-20 shrink-0 flex items-center gap-1 pl-1.5 self-stretch">
                  {zone && <span className={`w-[3px] self-stretch rounded-full ${ZONE_STYLE[zone.kind].rail}`} />}
                  {zoneStart && (
                    <span className={`font-mono text-[8px] font-semibold uppercase tracking-wider ${ZONE_STYLE[zoneStart.kind].text}`}>
                      {zoneStart.label}
                    </span>
                  )}
                </span>
              </div>
              {i === spotAfterIndex && <SpotMarker ticker={ticker} spot={levels.spot} />}
              {i === flipAfterIndex && <FlipMarker price={levels.flip} />}
            </Fragment>
          );
        })}
      </div>

      {/* Hover readout — opposite side of the dominant bar, clear of the cursor */}
      {hoverRow && <StrikeHoverCard row={hoverRow} ticker={ticker} y={hoverY} />}

      {/* Sign convention */}
      <div className="px-2.5 py-1.5 border-t border-borderSubtle font-mono text-[9px] text-textMuted leading-relaxed select-none">
        Positive = dealer short gamma <span className="text-textSecondary">(upside supply)</span> · Negative = dealer
        long gamma <span className="text-textSecondary">(downside support)</span>
      </div>
    </div>
  );
};

export default PositioningMap;
