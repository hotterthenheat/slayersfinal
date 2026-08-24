import { fmtUsd } from '../../data/gex';
import { heatCellStyle, heatPoles, heatScaleGradient, heatScaleLabels } from './heatmap';
import type { GexMatrixData } from '../../types/gex';

interface GexMatrixProps {
  data: GexMatrixData;
  spot: number;
  /** Stretch to the container: rows share the extra height natively (the
      premium-ladder trick). The fullscreen takeover uses this — without it
      the grid hugged ~600px and left the viewport empty underneath (Noah,
      2026-08-18). Off by default so small tiles keep hugging their content. */
  fill?: boolean;
  /** Re-denominate the strike column (the instrument lens) — default prints
      the native strike. */
  strikeFormat?: (strike: number) => string;
}

/**
 * Strike × expiry exposure heatmap. Cell palette comes from heatmap.ts
 * (mono or diverging mode); values are always printed and the digit color
 * flips by cell luminance, so color is never the only channel.
 */
const GexMatrix = ({ data, fill = false, strikeFormat }: GexMatrixProps) => {
  const { expiries, strikes, cells, maxAbs, spotRowIndex, callWallIndex, putWallIndex } = data;

  return (
    // Default max-h-full, not h-full: when the grid is shorter than its
    // container the block hugs the table, so the scale bar stops running past
    // the last row into empty space. Taller than the container and it still
    // scrolls. `fill` flips both: the table stretches to the box instead.
    <div className={`flex gap-2 min-h-0 ${fill ? 'h-full' : 'max-h-full'}`}>
      <div className="flex-grow overflow-auto min-w-0">
        <table className={`w-full border-collapse ${fill ? 'h-full' : ''}`}>
          <thead className="sticky top-0 z-10">
            <tr className="bg-[#0c0c0c]">
              {/* w-px + whitespace-nowrap = shrink to content. Without it the
                  auto table layout hands this column a share of the leftover
                  width, which at fullscreen left a ~320px gap before the data. */}
              <th className="w-px px-2 py-1.5 text-left font-mono text-[9px] font-semibold uppercase tracking-widest text-textMuted border-b border-borderSubtle whitespace-nowrap">
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
                  <td className="w-px px-2 py-1 font-mono text-[11px] whitespace-nowrap">
                    <span className={isSpot ? 'text-textPrimary font-bold' : 'text-textPrimary font-semibold'}>
                      {strikeFormat ? strikeFormat(strike) : strike % 1 === 0 ? strike.toFixed(0) : strike.toFixed(2)}
                    </span>
                    {isSpot && (
                      <span className="ml-1.5 font-mono text-[8px] font-bold uppercase tracking-wider text-textMuted">
                        spot
                      </span>
                    )}
                    {/* Wall chips wear the FIELD's poles, not bull/bear — a
                        green chip beside a steel row read as two unrelated
                        colors (steel = absorb side = call-dominant, gold =
                        amplify side = put-dominant). Poles come from
                        heatPoles so a mode switch re-inks them. */}
                    {isCallWall && !isSpot && (
                      <span className="ml-1.5 font-mono text-[8px] font-bold uppercase tracking-wider" style={{ color: heatPoles.neg }}>
                        cw
                      </span>
                    )}
                    {isPutWall && !isSpot && (
                      <span className="ml-1.5 font-mono text-[8px] font-bold uppercase tracking-wider" style={{ color: heatPoles.pos }}>
                        pw
                      </span>
                    )}
                  </td>
                  {cells[r].map((cell, c) => (
                    <td
                      key={c}
                      style={heatCellStyle(cell.value, maxAbs)}
                      className={`px-2 py-1 text-right font-mono text-[11px] tnum whitespace-nowrap transition-colors duration-700 ${
                        // Magenta, matching the king LINE on the chart
                        // (palette.KING) — silver stopped standing out once the
                        // steel ramp's platinum pole arrived, and Noah retired
                        // it (2026-08-18). Magenta is chromatic against both
                        // the steel and gold poles.
                        // A single 1px line vanished on a bright pole — the
                        // dark outer ring is what makes it findable on both
                        // ends of the ramp, not the accent alone.
                        cell.king
                          ? 'shadow-[inset_0_0_0_2px_#EA00FF,inset_0_0_0_3px_rgba(10,10,10,0.85)]'
                          : ''
                      }`}
                    >
                      {cell.king && (
                        <span className="mr-1.5 inline-block w-2 h-2 rounded-full bg-[#EA00FF] ring-1 ring-[#0a0a0a]/70 align-middle" />
                      )}
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
