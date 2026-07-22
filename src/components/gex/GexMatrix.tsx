import { useState } from 'react';
import { fmtUsd } from '../../data/gex';
import { heatCellStyle, heatScaleGradient, heatScaleLabels } from './heatmap';
import type { GexMatrixData } from '../../types/gex';

interface GexMatrixProps {
  data: GexMatrixData;
  spot: number;
}

interface HoverCell {
  r: number;
  c: number;
  x: number;
  y: number;
}

/**
 * Strike × expiry exposure heatmap. Cell palette comes from heatmap.ts
 * (mono or diverging mode); values are always printed and the digit color
 * flips by cell luminance, so color is never the only channel. Hovering a
 * cell floats a read-out — strike, expiry, net GEX and what the sign means.
 */
const GexMatrix = ({ data }: GexMatrixProps) => {
  const { expiries, strikes, cells, maxAbs, spotRowIndex, callWallIndex, putWallIndex } = data;
  const [hover, setHover] = useState<HoverCell | null>(null);

  const marker = (r: number): string | null => {
    if (r === spotRowIndex) return 'Spot';
    if (r === callWallIndex) return 'Call wall';
    if (r === putWallIndex) return 'Put wall';
    return null;
  };

  const hovered = hover ? cells[hover.r]?.[hover.c] : null;

  return (
    <div className="relative flex gap-2 h-full min-h-0">
      <div className="flex-grow overflow-auto min-w-0">
        {/* table-fixed: geometry is tick-independent, so the pulse only swaps glyphs
            (fmtUsd char-count changes each second) instead of reflowing columns */}
        <table className="w-full table-fixed border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="bg-panelRaised">
              <th className="px-2 py-1.5 text-left font-mono text-[10px] font-semibold uppercase tracking-widest text-textSecondary border-b border-borderSubtle" style={{ width: '30%' }}>
                Strike
              </th>
              {expiries.map((exp, i) => (
                <th
                  key={exp}
                  className={`px-2 py-1.5 text-right font-mono text-[10px] font-semibold uppercase tracking-widest border-b border-borderSubtle ${
                    i === 0 ? 'text-textSecondary' : 'text-textMuted'
                  }`}
                >
                  {exp}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {strikes.map((strike, r) => {
              const isSpot = r === spotRowIndex;
              const isCallWall = r === callWallIndex;
              const isPutWall = r === putWallIndex;
              return (
                <tr
                  key={strike}
                  className={`border-b border-borderSubtle/40 last:border-0 ${
                    isSpot ? 'shadow-[inset_2px_0_0_0_rgba(237,237,237,0.6)]' : ''
                  }`}
                >
                  <td className="px-2 py-1 font-mono text-[11px] whitespace-nowrap">
                    <span className={isSpot ? 'text-textPrimary font-bold' : 'text-textPrimary font-semibold'}>
                      {strike % 1 === 0 ? strike.toFixed(0) : strike.toFixed(2)}
                    </span>
                    {isSpot && (
                      <span className="ml-1.5 font-mono text-[9px] font-bold uppercase tracking-wider text-textMuted">
                        spot
                      </span>
                    )}
                    {isCallWall && !isSpot && (
                      <span className="ml-1.5 font-mono text-[9px] font-bold uppercase tracking-wider text-bull">
                        cw
                      </span>
                    )}
                    {isPutWall && !isSpot && (
                      <span className="ml-1.5 font-mono text-[9px] font-bold uppercase tracking-wider text-bear">
                        pw
                      </span>
                    )}
                  </td>
                  {cells[r].map((cell, c) => (
                    <td
                      key={c}
                      style={heatCellStyle(cell.value, maxAbs)}
                      onMouseEnter={e => setHover({ r, c, x: e.clientX, y: e.clientY })}
                      onMouseMove={e => setHover({ r, c, x: e.clientX, y: e.clientY })}
                      onMouseLeave={() => setHover(h => (h && h.r === r && h.c === c ? null : h))}
                      className={`px-2 py-1 text-right font-mono text-[11px] tnum whitespace-nowrap cursor-crosshair transition-colors duration-700 ${
                        cell.king ? 'ring-1 ring-inset ring-king' : ''
                      } ${hover && hover.r === r && hover.c === c ? 'brightness-125' : ''}`}
                    >
                      {cell.king && <span className="mr-1 inline-block w-1.5 h-1.5 rounded-full bg-king" />}
                      {fmtUsd(cell.value)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Diverging color scale */}
      <div className="shrink-0 w-9 flex flex-col items-center py-1 select-none">
        <span className={`font-mono text-[10px] tnum ${heatScaleLabels.pos}`}>+{fmtUsd(maxAbs).replace('$', '')}</span>
        <div
          className="flex-grow w-2.5 my-1.5 rounded-full border border-borderSubtle"
          style={{ background: heatScaleGradient }}
        />
        <span className={`font-mono text-[10px] tnum ${heatScaleLabels.neg}`}>−{fmtUsd(maxAbs).replace('$', '')}</span>
        <span className="mt-1 font-mono text-[9px] text-textMuted uppercase">gex</span>
      </div>

      {/* Hover read-out — strike × expiry detail on the cell under the cursor */}
      {hover && hovered && (
        <div
          className="pointer-events-none fixed z-50 rounded-md border border-borderMuted bg-panelRaised px-3 py-2 shadow-2xl shadow-black"
          style={{ left: Math.min(hover.x + 14, window.innerWidth - 200), top: hover.y + 14 }}
        >
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[12px] font-bold text-textPrimary tnum">
              {strikes[hover.r] % 1 === 0 ? strikes[hover.r].toFixed(0) : strikes[hover.r].toFixed(2)}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-widest text-textMuted">{expiries[hover.c]}</span>
            {hovered.king && (
              <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-king">king</span>
            )}
          </div>
          <div className={`mt-0.5 font-mono text-[13px] font-bold tnum ${hovered.value >= 0 ? 'text-bull' : 'text-bear'}`}>
            {hovered.value >= 0 ? '+' : '−'}
            {fmtUsd(Math.abs(hovered.value))}
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-textSecondary">
            {hovered.value >= 0 ? 'dealer support · long γ' : 'negative gamma · short γ'}
            {marker(hover.r) && <span className="text-textMuted"> · {marker(hover.r)}</span>}
          </div>
        </div>
      )}
    </div>
  );
};

export default GexMatrix;
