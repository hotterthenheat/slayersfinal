import { useCallback, useEffect, useRef, useState } from 'react';
import { fmtUsd } from '../../data/gex';
import Term from '../ui/Term';
import type { TermKey } from '../../data/terms';
import type { KeyLevelKind, KeyLevelRow } from '../../types/gex';

interface KeyLevelsRailProps {
  rows: KeyLevelRow[];
  maxPressure: number;
  /** Click a level to flash it on the chart */
  onSelect?: (price: number) => void;
  /** Re-denominated surfaces (the instrument lens) pass their own print —
      default keeps the native strike style. */
  priceFormat?: (price: number) => string;
}

// Level identity colors — same hierarchy as the chart price lines
const KIND_TEXT: Record<KeyLevelKind, string> = {
  'call-wall': 'text-bull',
  'put-wall': 'text-bear',
  flip: 'text-flip',
  king: 'text-king',
  pin: 'text-textSecondary',
  spot: 'text-textPrimary',
};

const KIND_BAR: Record<KeyLevelKind, string> = {
  'call-wall': 'bg-bull/90',
  'put-wall': 'bg-bear/80',
  flip: 'bg-flip/60',
  king: 'bg-king/60',
  pin: 'bg-textMuted/60',
  spot: 'bg-textPrimary/60',
};

/** Each structural level explains itself on hover (the Term sweep, 2026-08-19) */
const KIND_TERM: Partial<Record<KeyLevelKind, TermKey>> = {
  'call-wall': 'Call wall',
  'put-wall': 'Put wall',
  flip: 'Gamma flip',
  pin: 'Pin',
  king: 'King',
};

/*
  THE RAIL MEASURES ITSELF.

  Three data columns need about 190px before the level name gets anything.
  Dropped into a Pulse widget six of twelve columns wide on a 390px phone the
  rail has 171, and the first version of this fix — a minmax floor on the name
  — only moved the damage: the name fitted and the pressure figure was clipped
  by 15px instead. There is no arrangement of three columns that reads at
  171px.

  So below a threshold it shows two. Which level and how much exposure is
  parked there are the reasons to look at this rail at all; distance from spot
  is the one a reader can get from the price printed under the name.

  It measures its OWN width rather than the viewport, because the width comes
  from the desk's 12-column grid and a widget can be narrow on a wide screen.
  Same ResizeObserver pattern as ExposureMatrix, for the same reason.
*/
const DIST_COLUMN_MIN = 210;

const KeyLevelsRail = ({ rows, maxPressure, onSelect, priceFormat }: KeyLevelsRailProps) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [showDist, setShowDist] = useState(true);

  const sync = useCallback(() => {
    const el = ref.current;
    if (el) setShowDist(el.clientWidth >= DIST_COLUMN_MIN);
  }, []);

  useEffect(() => {
    sync();
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [sync]);

  const cols = showDist
    ? 'grid-cols-[minmax(56px,1fr)_auto_auto]'
    : 'grid-cols-[minmax(56px,1fr)_auto]';

  return (
  <div ref={ref} className="flex flex-col">
    {/*
      THE NAME COLUMN HAS A FLOOR NOW.

      The two right-hand columns were fixed at w-14 and w-16, which with the
      padding and two gap-x-3s came to 164px of the row before the level name
      got any. Dropped into a Pulse widget six of twelve columns wide on a
      390px phone, the row had 171px — so "Call wall" and "513.50" were handed
      a 7px box and spilled straight out of it.

      Tighter fixed columns and a minmax floor on the name, so the name is the
      last thing squeezed rather than the first, and truncates with an
      ellipsis when it finally is.
    */}
    <div className={`grid ${cols} gap-x-2 px-2.5 py-1.5 border-b border-borderSubtle font-mono text-[8px] font-semibold uppercase tracking-widest text-textMuted select-none`}>
      <span className="truncate">Level</span>
      {showDist && <span className="text-right w-12">Dist</span>}
      <span className="text-right w-14">Pressure</span>
    </div>
    {rows.map(row => {
      const isSpot = row.kind === 'spot';
      const pct = Math.min(100, (row.pressure / (maxPressure || 1)) * 100);
      return (
        <div
          key={row.kind}
          role={onSelect ? 'button' : undefined}
          onClick={onSelect ? () => onSelect(row.price) : undefined}
          title={onSelect ? 'Flash on chart' : undefined}
          className={`grid ${cols} gap-x-2 items-center px-2.5 py-[7px] border-b border-borderSubtle/30 last:border-0 transition-colors ${
            isSpot ? 'bg-white/[0.04]' : ''
          } ${onSelect ? 'cursor-pointer hover:bg-white/[0.03]' : ''}`}
        >
          <span className="min-w-0">
            <span className={`block truncate font-mono text-[10px] font-semibold uppercase tracking-wider ${KIND_TEXT[row.kind]}`}>
              {KIND_TERM[row.kind] ? <Term k={KIND_TERM[row.kind] as TermKey}>{row.label}</Term> : row.label}
            </span>
            <span className="block truncate font-mono text-[11px] font-bold tnum text-textPrimary">
              {priceFormat ? priceFormat(row.price) : row.price % 1 === 0 ? row.price.toFixed(0) : row.price.toFixed(2)}
            </span>
          </span>
          {showDist && (
            <span
              className={`w-12 text-right font-mono text-[10px] tnum ${
                isSpot ? 'text-textMuted' : row.distPct >= 0 ? 'text-bull' : 'text-bear'
              }`}
            >
              {isSpot ? '—' : `${row.distPct >= 0 ? '+' : ''}${row.distPct.toFixed(2)}%`}
            </span>
          )}
          <span className="w-14 text-right">
            <span className="block font-mono text-[10px] tnum text-textSecondary">
              {isSpot ? '—' : fmtUsd(row.pressure)}
            </span>
            {!isSpot && (
              <span className="mt-0.5 ml-auto block h-[2px] w-full rounded-full bg-white/[0.04]">
                <span className={`block h-full rounded-full ${KIND_BAR[row.kind]}`} style={{ width: `${pct}%` }} />
              </span>
            )}
          </span>
        </div>
      );
    })}
    </div>
  );
};

export default KeyLevelsRail;
