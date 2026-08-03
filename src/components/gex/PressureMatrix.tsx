import { CALL_WALL, PUT_WALL, FLIP, KING } from './palette';
import { fmtUsd } from '../../data/gex';
import HoverReadout from '../ui/HoverReadout';
import EmptyState from '../ui/EmptyState';
import { useState } from 'react';
import type { PressureRow } from '../../types/gex';

interface PressureMatrixProps {
  rows: PressureRow[];
  /** Max |pressure| across the window — every bar scales against this. */
  maxAbs: number;
  spot: number;
}

/**
 * Dealer pressure ladder — call exposure growing left, put exposure growing
 * right, from a shared centre rail at each strike. The read is the asymmetry:
 * where one side dwarfs the other is where dealer hedging has to lean, and the
 * PIN and FLIP rows say which of those strikes the book is anchored to.
 *
 * Bars are scaled against one shared `maxAbs` rather than per-row, so a strike
 * with real size looks bigger than one without — per-row normalisation would
 * make every row look equally loaded.
 */
/** One spoken line per row — the same facts the hover card shows. */
const rowLabel = (r: PressureRow): string =>
  [
    `Strike ${r.strike % 1 === 0 ? r.strike.toFixed(0) : r.strike.toFixed(2)}`,
    r.pin ? 'pin' : '',
    r.flip ? 'gamma flip' : '',
    `calls ${fmtUsd(r.call.pressure)}, delta OI ${r.call.deltaOI.toLocaleString()}, volume ${r.call.volume.toLocaleString()}`,
    `puts ${fmtUsd(r.put.pressure)}, delta OI ${r.put.deltaOI.toLocaleString()}, volume ${r.put.volume.toLocaleString()}`,
    `net ${fmtUsd(r.net)} — dealers ${r.net >= 0 ? 'long gamma here, moves into it get absorbed' : 'short gamma here, moves get amplified'}`,
  ]
    .filter(Boolean)
    .join('. ');

const PressureMatrix = ({ rows, maxAbs, spot }: PressureMatrixProps) => {
  const [hover, setHover] = useState<{ r: PressureRow; x: number; y: number } | null>(null);

  if (!rows.length) return <EmptyState size="sm" title="No chain in range" />;

  // The strike the spot currently sits on — drawn as the live rail.
  let spotStrike = rows[0].strike;
  let best = Infinity;
  for (const r of rows) {
    const d = Math.abs(r.strike - spot);
    if (d < best) {
      best = d;
      spotStrike = r.strike;
    }
  }

  const pct = (v: number) => `${Math.min(100, (Math.abs(v) / maxAbs) * 100)}%`;

  return (
    <div className="h-full min-h-0 flex flex-col">
      {/* Same column grid as a body row (flex-1 / w-14 / w-9 / flex-1), so each
          label sits over the column it names — STRIKE used to float 24px off its
          own column. The outer ticks are the axis the ladder had none of: bars
          are scaled against one shared maxAbs, and without a number on it the
          lengths were unreadable in absolute terms. */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-borderSubtle select-none font-mono text-micro uppercase tracking-wider text-textMuted">
        <span className="flex-1 flex items-baseline justify-between">
          <span className="tnum normal-case text-textSecondary">{fmtUsd(maxAbs)}</span>
          <span className="text-bull">Calls</span>
        </span>
        <span className="w-14 shrink-0 text-center">Strike</span>
        <span className="w-9 shrink-0" />
        <span className="flex-1 flex items-baseline justify-between">
          <span className="text-bear">Puts</span>
          <span className="tnum normal-case text-textSecondary">{fmtUsd(maxAbs)}</span>
        </span>
      </div>

      <div
        className="flex-grow overflow-y-auto min-h-0"
        tabIndex={0}
        role="group"
        aria-label="Dealer pressure ladder — scrollable"
      >
        {rows.map(r => {
          const isSpot = r.strike === spotStrike;
          return (
            <div
              key={r.strike}
              onMouseEnter={e => setHover({ r, x: e.clientX, y: e.clientY })}
              onMouseMove={e => setHover({ r, x: e.clientX, y: e.clientY })}
              onMouseLeave={() => setHover(h => (h && h.r.strike === r.strike ? null : h))}
              /* Everything this ladder knows beyond bar length — ΔOI, volume,
                 net, and whether dealers absorb or amplify here — lived only in
                 the hover card. Focus opens the same read-out, and the label
                 carries the figures so they are announced without it. */
              tabIndex={0}
              onFocus={e => {
                const b = e.currentTarget.getBoundingClientRect();
                setHover({ r, x: b.left + b.width / 2, y: b.bottom });
              }}
              onBlur={() => setHover(h => (h && h.r.strike === r.strike ? null : h))}
              aria-label={rowLabel(r)}
              className={`flex items-center gap-1.5 px-2 py-[3px] border-b border-borderSubtle/30 transition-colors hover:bg-rowHover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-select/60 ${
                isSpot ? 'bg-white/[0.05]' : ''
              }`}
            >
              {/* Calls grow leftward from the centre rail. Colour is fixed per
                  side, not signed: the dealer book is net long calls and net
                  short puts, so call pressure is always positive and put
                  pressure always negative. A signed colour would be a branch
                  that never fires. The sign that does move is the net, and the
                  hover read-out carries it. */}
              <div className="flex-1 flex justify-end">
                <span className="h-[9px] rounded-sm" style={{ width: pct(r.call.pressure), background: CALL_WALL, opacity: 0.75 }} />
              </div>

              <span
                className={`w-14 shrink-0 text-center font-mono text-label tnum ${
                  isSpot ? 'text-textPrimary font-semibold' : 'text-textSecondary'
                }`}
              >
                {r.strike % 1 === 0 ? r.strike.toFixed(0) : r.strike.toFixed(2)}
              </span>

              {/* Flags ride between the strike and the put bar so the ladder
                  stays scannable — a row is either anchored or it isn't. */}
              <span className="w-9 shrink-0 flex items-center gap-0.5">
                {r.pin && (
                  <span className="font-mono text-micro leading-none" style={{ color: KING }} title="Pin — highest total OI in range">
                    PIN
                  </span>
                )}
                {r.flip && (
                  <span className="font-mono text-micro leading-none" style={{ color: FLIP }} title="Gamma flip strike">
                    FLIP
                  </span>
                )}
              </span>

              <div className="flex-1">
                <span className="block h-[9px] rounded-sm" style={{ width: pct(r.put.pressure), background: PUT_WALL, opacity: 0.75 }} />
              </div>
            </div>
          );
        })}
      </div>

      {hover && (
        <HoverReadout x={hover.x} y={hover.y}>
          <div className="font-mono text-caption font-bold text-textPrimary tnum">
            {hover.r.strike % 1 === 0 ? hover.r.strike.toFixed(0) : hover.r.strike.toFixed(2)}
            {hover.r.pin && <span className="ml-1.5 text-micro font-normal" style={{ color: KING }}>pin</span>}
            {hover.r.flip && <span className="ml-1.5 text-micro font-normal" style={{ color: FLIP }}>flip</span>}
          </div>
          <div className="mt-0.5 font-mono text-micro text-textSecondary tnum">
            calls {fmtUsd(hover.r.call.pressure)} · ΔOI {hover.r.call.deltaOI.toLocaleString()} · vol{' '}
            {hover.r.call.volume.toLocaleString()}
          </div>
          <div className="font-mono text-micro text-textSecondary tnum">
            puts {fmtUsd(hover.r.put.pressure)} · ΔOI {hover.r.put.deltaOI.toLocaleString()} · vol{' '}
            {hover.r.put.volume.toLocaleString()}
          </div>
          <div className="mt-0.5 font-mono text-micro tnum">
            <span className="text-textMuted">net </span>
            <span className={hover.r.net >= 0 ? 'text-bull' : 'text-bear'}>{fmtUsd(hover.r.net)}</span>
            <span className="text-textMuted">
              {' '}
              — {hover.r.net >= 0 ? 'dealers long gamma here; moves into it get absorbed' : 'dealers short gamma here; moves get amplified'}
            </span>
          </div>
        </HoverReadout>
      )}
    </div>
  );
};

export default PressureMatrix;
