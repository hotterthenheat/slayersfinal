import { fmtUsd } from '../../data/gex';
import { heatCellStyle, heatScaleGradient, heatScaleLabels } from './heatmap';
import type { GexMatrixData } from '../../types/gex';

interface GexMatrixProps {
  data: GexMatrixData;
  spot: number;
}

/**
 * Strike × expiry exposure heatmap. Cell palette comes from heatmap.ts
 * (mono or diverging mode); values are always printed and the digit color
 * flips by cell luminance, so color is never the only channel.
 */
const GexMatrix = ({ data }: GexMatrixProps) => {
  const { expiries, strikes, cells, maxAbs, spotRowIndex, callWallIndex, putWallIndex } = data;

  return (
    <div className="flex gap-2 h-full min-h-0">
      <div className="flex-grow overflow-auto min-w-0">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="bg-[#0c0c0c]">
              <th className="px-2 py-1.5 text-left font-mono text-[9px] font-semibold uppercase tracking-widest text-textMuted border-b border-borderSubtle">
                Strike
              </th>
              {expiries.map((exp, i) => (
                <th
                  key={exp}
                  className={`px-2 py-1.5 text-right font-mono text-[9px] font-semibold uppercase tracking-widest border-b border-borderSubtle ${
                    i === 0 ? 'text-warn' : 'text-textMuted'
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
                      <span className="ml-1.5 font-mono text-[8px] font-bold uppercase tracking-wider text-textMuted">
                        spot
                      </span>
                    )}
                    {isCallWall && !isSpot && (
                      <span className="ml-1.5 font-mono text-[8px] font-bold uppercase tracking-wider text-bull">
                        cw
                      </span>
                    )}
                    {isPutWall && !isSpot && (
                      <span className="ml-1.5 font-mono text-[8px] font-bold uppercase tracking-wider text-bear">
                        pw
                      </span>
                    )}
                  </td>
                  {cells[r].map((cell, c) => (
                    <td
                      key={c}
                      style={heatCellStyle(cell.value, maxAbs)}
                      className={`px-2 py-1 text-right font-mono text-[11px] tnum whitespace-nowrap transition-colors duration-700 ${
                        cell.king ? 'shadow-[inset_0_0_0_1px_#EA00FF]' : ''
                      }`}
                    >
                      {cell.king && <span className="mr-1 inline-block w-1.5 h-1.5 rounded-full bg-[#EA00FF]" />}
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
        <span className={`font-mono text-[9px] tnum ${heatScaleLabels.pos}`}>+{fmtUsd(maxAbs).replace('$', '')}</span>
        <div
          className="flex-grow w-2.5 my-1.5 rounded-full border border-borderSubtle"
          style={{ background: heatScaleGradient }}
        />
        <span className={`font-mono text-[9px] tnum ${heatScaleLabels.neg}`}>−{fmtUsd(maxAbs).replace('$', '')}</span>
        <span className="mt-1 font-mono text-[8px] text-textMuted uppercase">gex</span>
      </div>
    </div>
  );
};

export default GexMatrix;
