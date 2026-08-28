import { useMemo } from 'react';
import { useMarketData } from '../../context/MarketDataContext';
import { buildExpiryLadder, rowWords, wallOwnership, LADDER_COLUMNS } from '../../data/expiryLadder';
import GexMatrix from '../../components/gex/GexMatrix';
import ProvenanceChip from '../../components/ui/ProvenanceChip';
import Term from '../../components/ui/Term';
import type { GexMatrixData } from '../../types/gex';

/*
==================================================
  SLAYER TERMINAL - EXPIRY LADDER — P-2
  (pages/pinpoint/ExpiryLadder.tsx)
==================================================

  Which expiry owns this strike — is this wall a 0DTE artifact that
  evaporates at the bell, or structure that outlives the week?

  THE GRID IS GexMatrix, NOT A GRID OF ITS OWN. This page shipped twice
  with a hand-built table — first in red/green washes, then in the right
  ramp but the wrong chrome — while the desk already owned a strike×expiry
  heat surface with the pills, the quiet-run fold, the spot rule, the wall
  chips and the scale rail. The third cut is an ADAPTER: the ladder engine
  supplies the data and its composition sentences ride GexMatrix's notes
  column. One heat surface, one design; this file can no longer drift from
  it because it no longer draws anything.

  WHAT THIS PAGE ADDS OVER THE RAW MATRIX is P-2's actual product: the
  dominance read. The headline names which expiry owns each WALL — the two
  strikes the desk is watching — and every row carries its composition
  sentence, so "spread across expiries" and "evaporates at the bell" stay
  words, not colors.
*/

const ExpiryLadder = () => {
  const { marketData } = useMarketData();

  const ladder = useMemo(() => (marketData ? buildExpiryLadder(marketData, 10) : null), [marketData]);

  const view = useMemo(() => {
    if (!ladder || ladder.rows.length === 0) return null;
    const walls = wallOwnership(ladder);

    /* The ALL-column heavyweight is the book's king — the same meaning the
       matrix's magenta ring carries everywhere else. */
    let kingRow = -1;
    let kingMag = 0;
    ladder.rows.forEach((r, i) => {
      const all = Math.abs(r.cells.find(c => c.expiry === 'ALL')?.netGex ?? 0);
      if (all > kingMag) {
        kingMag = all;
        kingRow = i;
      }
    });
    const allCol = ladder.columns.indexOf('ALL');

    let spotRowIndex = 0;
    let spotD = Infinity;
    ladder.rows.forEach((r, i) => {
      const d = Math.abs(r.strike - ladder.spot);
      if (d < spotD) {
        spotD = d;
        spotRowIndex = i;
      }
    });

    const data: GexMatrixData = {
      expiries: [...LADDER_COLUMNS],
      strikes: ladder.rows.map(r => r.strike),
      cells: ladder.rows.map((r, i) =>
        r.cells.map((c, j) => ({ value: c.netGex, king: i === kingRow && j === allCol }))
      ),
      maxAbs: ladder.maxAbs,
      spotRowIndex,
      callWallIndex: walls.call ? ladder.rows.findIndex(r => r.strike === walls.call!.strike) : -1,
      putWallIndex: walls.put ? ladder.rows.findIndex(r => r.strike === walls.put!.strike) : -1,
    };
    return { data, walls, notes: ladder.rows.map(rowWords) };
  }, [ladder]);

  if (!ladder || !view) {
    return (
      <div className="flex items-center justify-center h-64 font-mono text-[11px] uppercase tracking-widest text-textMuted">
        Awaiting the book…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 flex-grow min-h-0">
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="font-mono text-[12px] font-bold uppercase tracking-widest text-textPrimary">
          <Term k="Expiry ladder">Which expiry owns this strike</Term>
        </h2>
        <ProvenanceChip sources={['chain', 'exposure']} />
      </div>

      {/* The headline: which expiry owns the WALLS. Nobody scans twenty rows
          — they came to ask about the two strikes the desk is watching. */}
      {(view.walls.call || view.walls.put) && (
        <div className="flex flex-col gap-0.5">
          {view.walls.call && (
            <p className="font-mono text-[11px] leading-relaxed text-textPrimary">
              Call wall <span className="font-bold tnum">{view.walls.call.strike}</span>{' '}
              <span className="text-textSecondary">— {view.walls.call.words}</span>
            </p>
          )}
          {view.walls.put && (
            <p className="font-mono text-[11px] leading-relaxed text-textPrimary">
              Put wall <span className="font-bold tnum">{view.walls.put.strike}</span>{' '}
              <span className="text-textSecondary">— {view.walls.put.words}</span>
            </p>
          )}
        </div>
      )}

      {/* flex-1, not a pixel cap: the page owns the rest of the viewport
          and the matrix's fill mode shares it across rows — the same
          premium-ladder trick the fullscreen takeover uses. */}
      <div className="border border-borderSubtle bg-panel rounded-md p-2 flex-1 flex min-h-0">
        <GexMatrix data={view.data} spot={ladder.spot} rowNotes={view.notes} fill />
      </div>

      <p className="font-mono text-[10px] leading-relaxed text-textSecondary">
        A strike whose gamma is concentrated in 0DTE is a level that will not survive the bell; one spread across
        the dated lenses is structure. ALL is the aggregate, not a seventh expiry — it never competes for the
        composition read, and its heavyweight wears the king's ring.
      </p>
    </div>
  );
};

export default ExpiryLadder;
