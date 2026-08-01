import { Fragment, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import Simulator from '../../../core/simulator';
import { fmtUsd } from '../../../data/gex';
import { heatRgb } from '../heatmap';
import ChartLegend from '../../ui/ChartLegend';
import HoverReadout from '../../ui/HoverReadout';
import SignalBadge from '../../ui/SignalBadge';
import TrendLine from '../TrendLine';
import type { ShiftBarRow, VannaCharmView } from '../../../types/gex';
import { DUR, EASE } from '../../../lib/motion';

interface MigrationMapProps {
  data: VannaCharmView;
}

/**
 * Center-out bar that glides between scans / scenario switches.
 * Projection is a dimmer SOLID — opacity contrast survives 4px bars, outlines don't.
 */
const Bar = ({ value, max, top, ghost }: { value: number; max: number; top: boolean; ghost: boolean }) => {
  const pct = Math.min(48, (Math.abs(value) / (max || 1)) * 48);
  const neg = value < 0;
  const [r, g, b] = heatRgb(value, max);
  return (
    <motion.span
      className={`absolute ${top ? 'top-[2px]' : 'bottom-[2px]'} h-[4px] rounded-sm`}
      initial={false}
      animate={{ left: `${neg ? 50 - pct : 50}%`, width: `${pct}%`, opacity: pct < 0.5 ? 0 : 1 }}
      transition={{ duration: DUR.data, ease: EASE }}
      style={{ background: `rgba(${r},${g},${b},${ghost ? 0.35 : 0.95})` }}
    />
  );
};

/**
 * Now → projected for the strike, with real history behind it.
 *
 * Body only — the shell is the house HoverReadout, which portals to <body>,
 * clamps to the viewport and flips sides. This card used to position itself
 * against the row list, so inside the panel's scroll region it clipped at the
 * top and bottom of the very list it was describing.
 */
const ShiftHoverBody = ({ row, data }: { row: ShiftBarRow; data: VannaCharmView }) => {
  const series = useMemo(() => {
    const snaps = Simulator.getGexHistory(data.ticker) ?? [];
    const out: number[] = [];
    for (let i = Math.max(0, snaps.length - 16); i < snaps.length; i++) {
      const lvl = snaps[i].levels.find(l => l.strike === row.strike);
      if (lvl) out.push(lvl.value);
    }
    return out;
  }, [data.ticker, row.strike]);

  const delta = row.projected - row.current;
  const pct = row.current !== 0 ? (delta / Math.abs(row.current)) * 100 : 0;
  const up = delta >= 0;
  const strikeLabel = row.strike % 1 === 0 ? row.strike.toFixed(0) : row.strike.toFixed(2);
  const scenario = data.mode === 'CHARM' ? 'CHARM → CLOSE' : `VANNA ${data.ivShift > 0 ? '+' : ''}${data.ivShift} IV`;

  return (
    <div className="w-56">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-label font-bold text-textPrimary tnum">
          Strike {strikeLabel}
          {row.pin && <span className="ml-1.5 font-mono text-micro font-bold uppercase tracking-wider text-textSecondary">pin</span>}
        </span>
        <SignalBadge tone="neutral">{scenario}</SignalBadge>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <div>
          <div className="font-mono text-micro uppercase tracking-widest text-textMuted">Now</div>
          <div className={`font-mono text-body font-bold tnum ${row.current >= 0 ? 'text-bull' : 'text-bear'} leading-5`}>
            {row.current >= 0 ? '+' : ''}
            {fmtUsd(row.current)}
          </div>
        </div>
        <div>
          <div className="font-mono text-micro uppercase tracking-widest text-textMuted">Projected</div>
          <div className={`font-mono text-body font-bold tnum ${row.projected >= 0 ? 'text-bull' : 'text-bear'} leading-5`}>
            {row.projected >= 0 ? '+' : ''}
            {fmtUsd(row.projected)}
          </div>
        </div>
      </div>

      <div className={`mt-1 font-mono text-micro tnum font-semibold ${up ? 'text-bull' : 'text-bear'}`}>
        {up ? '↗' : '↘'} {up ? '+' : '−'}
        {fmtUsd(Math.abs(delta))} ({up ? '+' : '−'}
        {Math.abs(pct).toFixed(1)}%) under {data.mode === 'CHARM' ? 'charm decay' : 'the vol shift'}
      </div>

      {series.length > 1 && (
        <div className="mt-2 pt-2 border-t border-borderSubtle/60">
          <div className="font-mono text-micro uppercase tracking-widest text-textMuted mb-1">Value over time</div>
          <TrendLine points={series} />
          <div className="flex justify-between font-mono text-micro text-textMuted">
            <span>15m ago</span>
            <span>now</span>
          </div>
        </div>
      )}
    </div>
  );
};

const FlipMark = ({ price, projected }: { price: number; projected?: boolean }) => (
  <div className="flex items-center gap-1.5 px-2 py-0.5">
    <span className={`h-0 flex-grow border-t border-dashed ${projected ? 'border-flip/35' : 'border-flip/70'}`} />
    <span
      className={`inline-flex items-center rounded-[3px] border bg-canvas px-1.5 py-px font-mono text-micro font-bold uppercase tracking-wider whitespace-nowrap ${
        projected ? 'border-flip/40 text-flip/70' : 'border-flip/60 text-flip'
      }`}
    >
      {projected ? '→ FLIP' : 'FLIP'} {price % 1 === 0 ? price.toFixed(0) : price.toFixed(2)}
    </span>
    <span className={`h-0 w-3 shrink-0 border-t border-dashed ${projected ? 'border-flip/35' : 'border-flip/70'}`} />
  </div>
);

/**
 * Current vs projected net GEX per strike: solid bar = now, outlined ghost =
 * under the scenario. Both flips are marked so the regime-border move is the
 * first thing you see.
 */
const MigrationMap = ({ data }: MigrationMapProps) => {
  const { ticker, rows, maxAbs, flipCurrent, flipProjected } = data;

  const [hover, setHover] = useState<{ row: ShiftBarRow; x: number; y: number } | null>(null);

  const slotAfter = (level: number) => {
    let idx = rows.findIndex((row, i) => row.strike >= level && (rows[i + 1]?.strike ?? -Infinity) < level);
    if (idx === -1) idx = level > (rows[0]?.strike ?? 0) ? -0.5 : rows.length - 1;
    return idx;
  };
  const flipAfter = slotAfter(flipCurrent);
  const flipProjAfter = flipProjected !== flipCurrent ? slotAfter(flipProjected) : -2;

  return (
    <div className="flex flex-col h-full min-h-0 relative">
      {/* Legend */}
      <div className="flex items-center gap-3 px-2 py-1.5 border-b border-borderSubtle flex-wrap">
        <ChartLegend
          items={[
            { label: 'Current', swatchClass: 'bg-white/80' },
            { label: 'Projected', swatchClass: 'bg-white/30' },
          ]}
        />
        <span className="ml-auto font-mono text-micro uppercase tracking-wider text-textMuted select-none">
          {ticker} · net GEX
        </span>
      </div>

      {/* Rows */}
      <div
        tabIndex={0}
        role="region"
        aria-label="Exposure migration, scrollable"
        className="flex-grow overflow-y-auto min-h-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-select/60"
        onMouseLeave={() => setHover(null)}
      >
        {flipAfter === -0.5 && <FlipMark price={flipCurrent} />}
        {flipProjAfter === -0.5 && <FlipMark price={flipProjected} projected />}
        {rows.map((row, i) => (
          <Fragment key={row.strike}>
            <div
              onMouseMove={e => setHover({ row, x: e.clientX, y: e.clientY })}
              className={`flex items-center border-b border-borderSubtle/20 ${row.pin ? 'bg-white/[0.03]' : ''} ${
                hover?.row.strike === row.strike ? 'bg-white/[0.04]' : ''
              }`}
            >
              <span className="w-14 shrink-0 px-2 py-1 bg-inset border-r border-borderSubtle/40 font-mono text-micro font-semibold tnum text-textSecondary">
                {row.strike % 1 === 0 ? row.strike.toFixed(0) : row.strike.toFixed(2)}
                {row.pin && <span className="ml-1 font-mono text-micro font-bold uppercase text-textPrimary">pin</span>}
              </span>
              <div className="relative flex-1 h-[15px]">
                <span className="absolute left-1/4 top-0 bottom-0 w-px bg-white/[0.04]" />
                <span className="absolute left-3/4 top-0 bottom-0 w-px bg-white/[0.04]" />
                <span className="absolute left-1/2 top-0 bottom-0 w-px bg-borderMuted" />
                <Bar value={row.current} max={maxAbs} top ghost={false} />
                <Bar value={row.projected} max={maxAbs} top={false} ghost />
              </div>
            </div>
            {i === flipAfter && <FlipMark price={flipCurrent} />}
            {i === flipProjAfter && <FlipMark price={flipProjected} projected />}
          </Fragment>
        ))}
      </div>

      {hover && (
        <HoverReadout x={hover.x} y={hover.y}>
          <ShiftHoverBody row={hover.row} data={data} />
        </HoverReadout>
      )}

      <div className="px-2.5 py-1.5 border-t border-borderSubtle font-mono text-micro text-textMuted leading-relaxed select-none">
        Bright = positioning now · Dim = after {data.mode === 'CHARM' ? 'charm decay into the close' : `an IV ${data.ivShift > 0 ? '+' : ''}${data.ivShift} vol move`}
      </div>
    </div>
  );
};

export default MigrationMap;
