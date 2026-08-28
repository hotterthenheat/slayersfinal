import { useMemo, useState } from 'react';
import { useMarketData } from '../../context/MarketDataContext';
import { buildExpiryLadder, rowWords, wallOwnership, LADDER_COLUMNS } from '../../data/expiryLadder';
import { fmtUsd } from '../../data/gex';
import { heatCellStyle, heatPoles } from '../../components/gex/heatmap';
import { SPOT } from '../../components/gex/palette';
import ProvenanceChip from '../../components/ui/ProvenanceChip';
import Term from '../../components/ui/Term';

/*
==================================================
  SLAYER TERMINAL - EXPIRY LADDER — P-2
  (pages/pinpoint/ExpiryLadder.tsx)
==================================================

  Strikes down, expiries across. The one question the Exposure Profile
  cannot answer: is this wall a 0DTE artifact that evaporates at the bell,
  or a monthly shelf that will still be there tomorrow?

  THE HEAT IS THE HOUSE HEAT — heatCellStyle from heatmap.ts, the steel/gold
  ramp Noah landed on in palette round 3, with the measured gamma curve that
  keeps a heavy-tailed book from rendering as a black grid and the solved
  ink crossover that keeps every cell legible. The first cut of this page
  hand-rolled red/green alpha washes — the industry-standard GEX heatmap
  this desk deliberately moved OFF, rebuilt as if the change never happened.
  A heat surface on this desk derives from heatmap.ts or it is wrong.

  ALL IS SET APART because it is the aggregate, not a seventh lens. It
  carries a divider and never competes in the dominance read — a column
  that wins every row says nothing.
*/

const ExpiryLadder = () => {
  const { marketData } = useMarketData();
  const [hovered, setHovered] = useState<number | null>(null);

  const ladder = useMemo(() => (marketData ? buildExpiryLadder(marketData, 10) : null), [marketData]);

  if (!ladder || ladder.rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 font-mono text-[11px] uppercase tracking-widest text-textMuted">
        Awaiting the book…
      </div>
    );
  }

  const hoveredRow = hovered === null ? null : ladder.rows.find(r => r.strike === hovered) ?? null;
  const walls = wallOwnership(ladder);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="font-mono text-[12px] font-bold uppercase tracking-widest text-textPrimary">
          <Term k="Expiry ladder">Which expiry owns this strike</Term>
        </h2>
        <ProvenanceChip sources={['chain', 'exposure']} />
        <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-textMuted">
          <span style={{ color: heatPoles.pos }}>gold amplifies</span> · <span style={{ color: heatPoles.neg }}>steel absorbs</span> · spot{' '}
          <span style={{ color: SPOT }}>{ladder.spot.toFixed(2)}</span>
        </span>
      </div>

      {/* The headline: which expiry owns the WALLS. Nobody scans twenty rows
          — they came to ask about the two strikes the desk is watching. */}
      {(walls.call || walls.put) && (
        <div className="flex flex-col gap-0.5">
          {walls.call && (
            <p className="font-mono text-[11px] leading-relaxed text-textPrimary">
              Call wall <span className="font-bold tnum">{walls.call.strike}</span>{' '}
              <span className="text-textSecondary">— {walls.call.words}</span>
            </p>
          )}
          {walls.put && (
            <p className="font-mono text-[11px] leading-relaxed text-textPrimary">
              Put wall <span className="font-bold tnum">{walls.put.strike}</span>{' '}
              <span className="text-textSecondary">— {walls.put.words}</span>
            </p>
          )}
        </div>
      )}

      <div className="border border-borderSubtle bg-panel rounded-md overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="sticky left-0 bg-panel px-2 py-1.5 text-left font-mono text-[9px] uppercase tracking-widest text-textMuted">
                Strike
              </th>
              {LADDER_COLUMNS.map(e => (
                <th
                  key={e}
                  className={`px-2 py-1.5 text-right font-mono text-[9px] uppercase tracking-widest text-textMuted ${
                    e === 'ALL' ? 'border-l border-borderMuted' : ''
                  }`}
                >
                  {e}
                </th>
              ))}
              <th className="px-2 py-1.5 text-left font-mono text-[9px] uppercase tracking-widest text-textMuted">
                Composition
              </th>
            </tr>
          </thead>
          <tbody>
            {ladder.rows.map(row => (
              <tr
                key={row.strike}
                onMouseEnter={() => setHovered(row.strike)}
                onMouseLeave={() => setHovered(null)}
                className={hovered === row.strike ? 'bg-white/[0.04]' : ''}
              >
                <td className="sticky left-0 bg-panel px-2 py-1 font-mono text-[10px] tnum text-textPrimary whitespace-nowrap">
                  {row.strike}
                  {/* The spot marker rides the first row at or below spot —
                      the same anchor the profile's own marker uses. */}
                  {!row.aboveSpot && ladder.rows.find(r => !r.aboveSpot)?.strike === row.strike && (
                    <span className="ml-1.5 font-bold" style={{ color: SPOT }} title={`Spot ${ladder.spot.toFixed(2)}`}>
                      ◀
                    </span>
                  )}
                </td>
                {row.cells.map(c => (
                  <td
                    key={c.expiry}
                    style={heatCellStyle(c.netGex, ladder.maxAbs)}
                    title={`${row.strike} · ${c.expiry} · ${fmtUsd(c.netGex)}`}
                    className={`px-2 py-1 text-right font-mono text-[10px] tnum ${
                      c.expiry === 'ALL' ? 'border-l border-borderMuted' : ''
                    }`}
                  >
                    {c.netGex === 0 ? '—' : fmtUsd(c.netGex)}
                  </td>
                ))}
                <td className="px-2 py-1 font-mono text-[9px] text-textMuted whitespace-nowrap">{rowWords(row)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="font-mono text-[10px] leading-relaxed text-textSecondary">
        {hoveredRow
          ? `${hoveredRow.strike}: ${rowWords(hoveredRow)}.`
          : 'A strike whose gamma is concentrated in 0DTE is a level that will not survive the bell; one spread across the dated lenses is structure. ALL is the aggregate, not a seventh expiry — it is set apart and never competes for the composition read.'}
      </p>
    </div>
  );
};

export default ExpiryLadder;
