import { useMemo } from 'react';
import { listExpiries, summariseExpiries, type ExpirySummary } from '../../data/optionChain';
import Simulator from '../../core/simulator';
import DataTable, { type Column } from '../../components/ui/DataTable';
import { useNavigate } from 'react-router-dom';
import { useMarketData } from '../../context/MarketDataContext';
import { buildExpiryLadder, rowWords, wallOwnership, LADDER_COLUMNS } from '../../data/expiryLadder';
import { fmtUsd } from '../../data/gex';
import GexMatrix from '../../components/gex/GexMatrix';
import HeatPill from '../../components/gex/HeatPill';
import Panel from '../../components/ui/Panel';
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
  const navigate = useNavigate();

  const ladder = useMemo(() => (marketData ? buildExpiryLadder(marketData, 10) : null), [marketData]);

  const view = useMemo(() => {
    if (!ladder || ladder.rows.length === 0) return null;
    const walls = wallOwnership(ladder);

    /* The ALL-column heavyweight is the book's supreme — the same meaning the
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
        r.cells.map((c, j) => ({ value: c.netGex, supreme: i === kingRow && j === allCol }))
      ),
      maxAbs: ladder.maxAbs,
      spotRowIndex,
      callWallIndex: walls.call ? ladder.rows.findIndex(r => r.strike === walls.call!.strike) : -1,
      putWallIndex: walls.put ? ladder.rows.findIndex(r => r.strike === walls.put!.strike) : -1,
    };
    /*
      THE SIDE RAIL'S TWO COMPANION SURFACES, from the same rows.

      LENS TOTALS — the whole book summed per lens, as one pill each: the
      one-glance answer to "where does this book's gamma LIVE" before any
      strike is read. Shares are of the DATED lenses only, the ladder's own
      dominance rule.

      THE WALL ROWS — each wall's full lens row lifted out as a 1×7 pill
      strip beside its ownership sentence, so the headline is visual as
      well as worded. Same cells, same maxAbs, so a wall strip can never
      disagree with the row it came from.
    */
    const lensTotals = ladder.columns.map((expiry, j) => ({
      expiry,
      total: ladder.rows.reduce((a, r) => a + (r.cells[j]?.netGex ?? 0), 0),
    }));
    const datedAbs = lensTotals.filter(t => t.expiry !== 'ALL').reduce((a, t) => a + Math.abs(t.total), 0);
    const maxLens = Math.max(...lensTotals.map(t => Math.abs(t.total)), 1e-9);
    const wallRow = (strike: number | undefined) =>
      strike === undefined ? null : (ladder.rows.find(r => r.strike === strike) ?? null);

    return {
      data,
      walls,
      notes: ladder.rows.map(rowWords),
      lensTotals,
      datedAbs,
      maxLens,
      callRow: wallRow(walls.call?.strike),
      putRow: wallRow(walls.put?.strike),
    };
  }, [ladder]);

  /*
    §6's per-expiry rows, off the real listed board.

    THE HOOK SITS ABOVE THE GUARD, deliberately. Dropped below the early
    return it becomes a CONDITIONAL hook — React #310, the same crash this
    desk already shipped once on the Time Machine's memo and caught in the
    sweep. The columns underneath are plain data and may live anywhere.
  */
  const expirySummaries = useMemo(() => {
    if (!marketData) return [];
    const iv = Simulator.TICKERS[marketData.ticker]?.iv ?? 0.2;
    return summariseExpiries(marketData.ticker, marketData.spot, iv, listExpiries(), 12);
  }, [marketData?.ticker, marketData?.spot]);

  if (!ladder || !view) {
    return (
      <div className="flex items-center justify-center h-64 font-mono text-[11px] uppercase tracking-widest text-textMuted">
        Awaiting the book…
      </div>
    );
  }

  const expiryCols: Column<ExpirySummary>[] = [
    { key: 'exp', header: 'Expiry', width: '170px', sortValue: r => r.expiry.dte,
      render: r => (
        <span className="font-mono text-[11px]">
          <span className={r.expiry.dte === 0 ? 'text-warn' : 'text-textPrimary'}>
            {r.expiry.dte === 0 ? '0DTE' : `${r.expiry.dte}d`}
          </span>
          <span className="text-textMuted ml-2">{r.expiry.weekday} {r.expiry.label}</span>
        </span>
      ) },
    { key: 'oi', header: 'Open interest', align: 'right', width: '150px', sortValue: r => r.totalOi,
      render: r => (
        <span className="font-mono text-[11px] text-textSecondary">
          {r.totalOi.toLocaleString()}
          <span className="text-textMuted ml-1.5">{r.oiSharePct.toFixed(0)}%</span>
        </span>
      ) },
    { key: 'vol', header: 'Volume', align: 'right', width: '120px', sortValue: r => r.totalVolume,
      render: r => <span className="font-mono text-[11px] text-textSecondary">{r.totalVolume.toLocaleString()}</span> },
    { key: 'net', header: 'Net premium', align: 'right', width: '130px', sortValue: r => r.netPremium,
      render: r => (
        <span className={`font-mono text-[11px] ${r.netPremium >= 0 ? 'text-bull' : 'text-bear'}`}>
          {r.netPremium >= 0 ? '+' : '−'}${(Math.abs(r.netPremium) / 1e6).toFixed(1)}M
        </span>
      ) },
    { key: 'iv', header: 'ATM IV', align: 'right', width: '100px', sortValue: r => r.atmIv,
      render: r => <span className="font-mono text-[11px] text-textSecondary">{r.atmIv.toFixed(1)}%</span> },
  ];


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

      {/* THE PAGE IS A ROW, NOT A COLUMN: the matrix takes the width it
          needs and the side rail's companion surfaces take the rest — one
          big heatmap floating in a void is half a product on a screen that
          paid for a whole one. Below xl the rail folds under. */}
      <div className="flex-1 flex flex-col xl:flex-row gap-4 min-h-0">
        <div className="border border-borderSubtle bg-panel rounded-md p-2 flex-1 flex min-h-0">
          <GexMatrix
            data={view.data}
            spot={ladder.spot}
            rowNotes={view.notes}
            fill
            onSelectStrike={s => navigate('/pulse', { state: { focusPrice: s } })}
          />
        </div>

        <div className="xl:w-[340px] shrink-0 flex flex-col gap-4 min-h-0">
          <Panel title="Book By Lens" subtitle="whole-book gamma" className="w-full" bodyClassName="flex flex-col gap-1">
            {view.lensTotals.map(t => (
              <div key={t.expiry} className="flex items-center gap-2">
                <span className={`w-10 shrink-0 font-mono text-[9px] font-semibold uppercase tracking-widest ${t.expiry === '0DTE' ? 'text-warn' : 'text-textMuted'}`}>
                  {t.expiry}
                </span>
                <HeatPill value={t.total} maxAbs={view.maxLens} className="h-[19px] flex-1">
                  {fmtUsd(t.total)}
                </HeatPill>
                <span className="w-9 shrink-0 text-right font-mono text-[9px] tnum text-textMuted">
                  {t.expiry === 'ALL' || view.datedAbs === 0 ? '' : `${Math.round((Math.abs(t.total) / view.datedAbs) * 100)}%`}
                </span>
              </div>
            ))}
          </Panel>

          {(view.callRow || view.putRow) && (
            <Panel title="The Walls" subtitle="each wall's lens row" className="w-full" bodyClassName="flex flex-col gap-3">
              {([
                ['Call wall', view.walls.call, view.callRow],
                ['Put wall', view.walls.put, view.putRow],
              ] as const).map(([label, wall, row]) =>
                wall && row ? (
                  <div key={label} className="flex flex-col gap-1">
                    <p className="font-mono text-[10px] leading-snug text-textPrimary">
                      {label} <span className="font-bold tnum">{wall.strike}</span>{' '}
                      <span className="text-textMuted">— {wall.words}</span>
                    </p>
                    <div className="flex gap-1">
                      {row.cells.map(c => (
                        <HeatPill
                          key={c.expiry}
                          value={c.netGex}
                          maxAbs={ladder.maxAbs}
                          className="h-[17px] flex-1"
                          title={`${wall.strike} · ${c.expiry} · ${fmtUsd(c.netGex)}`}
                        >
                          <span className="text-[8px]">{c.expiry}</span>
                        </HeatPill>
                      ))}
                    </div>
                  </div>
                ) : null
              )}
            </Panel>
          )}
        </div>
      </div>

      {/* §6 — HOW BIG IS EACH EXPIRY IN THE FIRST PLACE. The grid above
          answers "which expiry owns this strike"; a strike can look dominant
          there while sitting on an expiry carrying two percent of the
          board's open interest, and the grid alone cannot say so. Built off
          the real listed board (data/optionChain.ts), so these are dated
          contracts rather than lens weightings. */}
      <Panel
        title="By expiry"
        subtitle="open interest, volume and net premium on each listed date"
        className="w-full"
        flush
        actions={<ProvenanceChip sources={['chain']} note="Per-expiry sums from the modelled multi-expiry chain." />}
      >
        <DataTable
          columns={expiryCols}
          rows={expirySummaries}
          rowKey={r => r.expiry.label}
          initialSort={{ key: 'oi', dir: 'desc' }}
          maxHeight="300px"
          emptyText="No listed expiries."
        />
      </Panel>

      <p className="font-mono text-[10px] leading-relaxed text-textSecondary">
        A strike whose gamma is concentrated in 0DTE is a level that will not survive the bell; one spread across
        the dated lenses is structure. ALL is the aggregate, not a seventh expiry — it never competes for the
        composition read, and its heavyweight wears the supreme's ring.
      </p>
    </div>
  );
};

export default ExpiryLadder;
