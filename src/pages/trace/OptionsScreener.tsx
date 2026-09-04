/*
==================================================
  SLAYER TERMINAL - OPTIONS SCREENER (Trace)
  The whole day's option book, asked questions
  (Noah, 2026-08-30 — the expansion phase's first
  page; information architecture from the reference
  screener, rendered in the house grammar).

  Screens are QUESTIONS, not judgments — each chip
  is a filter + an ordering over data/flowBook's day
  rollup. States stay Compass's job: clicking a row
  opens the contract's card, and THERE the one state
  engine grades it (PrintDrilldown's exact seam).

  Every column is open — no locked cells here.
==================================================
*/

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMarketData } from '../../context/MarketDataContext';
import Simulator from '../../core/simulator';
import {
  applyFilters,
  buildFlowBook,
  DEFAULT_FILTERS,
  FLOW_SCREENS,
  runScreen,
  type BookFilters,
  type ScreenKey,
} from '../../data/flowBook';
import { fmtUsd } from '../../data/gex';
import { SLEEVES, type SleeveKey } from '../../types/compass';
import type { BookContract } from '../../types/trace';
import DataTable, { type Column } from '../../components/ui/DataTable';
import Chip from '../../components/ui/Chip';
import CompanyLogo from '../../components/ui/CompanyLogo';
import RichRead from '../../components/ui/RichRead';
import BookDrill from '../../components/trace/BookDrill';
import ContractCell from '../../components/trace/ContractCell';
import FilterDoor, { FilterSection } from '../../components/trace/FilterDoor';
import { earnMarks, weightInk } from '../../components/trace/earnedInk';
import FlowSearch, { normSymbol } from '../../components/trace/FlowSearch';
import FlowTop from '../../components/trace/FlowTop';
import { LiveHold, useHold } from '../../components/trace/LiveHold';
import StatsStrip, { Fact, FactPill } from '../../components/trace/StatsStrip';
import ColumnChooser, { useHiddenColumns } from '../../components/trace/ColumnChooser';
import LeanCell from '../../components/trace/LeanCell';

const FILTERS_KEY = 'slayer_screener_filters';
/** Render cap — the table stays readable and the DOM stays light. Never
    silent: the count strip says when the book runs past it. */
const ROW_CAP = 250;

const num = (v: number) => v.toLocaleString('en-US');

function loadFilters(): BookFilters {
  try {
    const raw = localStorage.getItem(FILTERS_KEY);
    if (!raw) return DEFAULT_FILTERS;
    const p = JSON.parse(raw) as Partial<BookFilters>;
    const sleeveKeys = SLEEVES.map(s => s.key);
    return {
      side: p.side === 'C' || p.side === 'P' ? p.side : 'ALL',
      tenors: Array.isArray(p.tenors) ? (p.tenors.filter(t => sleeveKeys.includes(t as SleeveKey)) as SleeveKey[]) : [],
      minVolume: Number.isFinite(p.minVolume) ? Math.max(0, Number(p.minVolume)) : 0,
      minPremium: Number.isFinite(p.minPremium) ? Math.max(0, Number(p.minPremium)) : 0,
      excludeItm: p.excludeItm === true,
    };
  } catch {
    return DEFAULT_FILTERS;
  }
}

// ---- the page ---------------------------------------------------------------

/** The day's whole option book — screens, filters, and one dense table. */
const OptionsScreener = () => {
  const { marketData, activeTicker } = useMarketData();
  const [screen, setScreen] = useState<ScreenKey>('active');
  const [filters, setFilters] = useState<BookFilters>(loadFilters);
  const [query, setQuery] = useState('');
  const [openKey, setOpenKey] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(FILTERS_KEY, JSON.stringify(filters));
    } catch {
      /* private mode — filters just don't persist */
    }
  }, [filters]);

  // The book re-derives per clock minute inside buildFlowBook; the tick
  // subscription just gives it a chance to notice the minute turned.
  const liveBook = useMemo(
    () => buildFlowBook(Simulator.universeQuotes(activeTicker)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeTicker, marketData]
  );
  /* ONE hold for the whole page (Noah, 2026-08-30: "one shared live/paused
     for all of them"): paused, the book AND the tick freeze together, so the
     rows, the facts, the read and any open card stop on the same snapshot.
     A ticker change releases it. */
  const hold = useHold(useMemo(() => ({ book: liveBook, tick: marketData }), [liveBook, marketData]), activeTicker);
  const { book, tick } = hold.value;
  const holdDoor = <LiveHold paused={hold.paused} onToggle={hold.toggle} heldAt={hold.heldAt} />;
  // Stable row callbacks so the memoised DataTable can sit out the ticks (see DataTable).
  const keyOf = useCallback((r: { key: string }) => r.key, []);
  const openRow = useCallback((r: { key: string }) => setOpenKey(r.key), []);

  const rows = useMemo(() => {
    const cut = applyFilters(runScreen(book, screen), filters);
    const nq = normSymbol(query);
    return nq === '' ? cut : cut.filter(r => normSymbol(`${r.ticker}${r.strike}${r.right}`).includes(nq));
  }, [book, screen, filters, query]);
  const shown = useMemo(() => rows.slice(0, ROW_CAP), [rows]);

  /* Three registers per column (Noah, 2026-08-30: "majority of the numbers
     the same EXCEPT for the outliers"): quiet bulk, bold top quintile, and
     ONE magenta champion — see components/trace/earnedInk.ts. */
  const marks = useMemo(
    () => ({
      vol: earnMarks(shown, r => r.volume),
      oi: earnMarks(shown, r => r.oi),
      doi: earnMarks(shown, r => r.deltaOI),
      prem: earnMarks(shown, r => r.premium),
    }),
    [shown]
  );

  const read = useMemo(() => {
    if (rows.length === 0) return 'Nothing on this cut yet.';
    let prem = 0;
    let callPrem = 0;
    let fresh = 0;
    const names = new Set<string>();
    for (const r of rows) {
      prem += r.premium;
      if (r.right === 'C') callPrem += r.premium;
      if (r.volOverOI >= 1.5) fresh++;
      names.add(r.ticker);
    }
    const callPct = Math.round((callPrem / Math.max(1, prem)) * 100);
    return `${fmtUsd(prem)} across ${rows.length} contracts on ${names.size} names — calls ${callPct}% of it, puts ${100 - callPct}%. ${fresh} contracts trading past their open interest.`;
  }, [rows]);

  const activeScreen = FLOW_SCREENS.find(s => s.key === screen) ?? FLOW_SCREENS[0];
  // The read's rail wears the cut's lean — the tape's own grammar.
  const lean = useMemo<'bull' | 'bear'>(() => {
    let c = 0;
    let pp = 0;
    for (const r of rows) if (r.right === 'C') c += r.premium; else pp += r.premium;
    return c >= pp ? 'bull' : 'bear';
  }, [rows]);
  const filtersLive =
    filters.side !== 'ALL' ||
    filters.tenors.length > 0 ||
    filters.minVolume > 0 ||
    filters.minPremium > 0 ||
    filters.excludeItm;

  const toggleTenor = (k: SleeveKey) =>
    setFilters(f => ({
      ...f,
      tenors: f.tenors.includes(k) ? f.tenors.filter(t => t !== k) : [...f.tenors, k],
    }));

  const columns = useMemo<Column<BookContract>[]>(
    () => [
      {
        key: 'time',
        header: 'Last',
        sortValue: r => r.lastAtMin,
        render: r => <span className="text-[11px] text-textSecondary">{r.lastAt}</span>,
      },
      {
        key: 'ticker',
        header: 'Ticker',
        sortValue: r => r.ticker,
        render: r => (
          <span className="inline-flex items-center gap-1.5">
            <CompanyLogo ticker={r.ticker} size={15} />
            <span className="font-bold text-textPrimary">{r.ticker}</span>
          </span>
        ),
      },
      {
        key: 'contract',
        header: 'Contract',
        align: 'right',
        sortValue: r => r.strike,
        render: r => <ContractCell strike={r.strike} right={r.right} expiry={r.expiry} />,
      },
      {
        key: 'dte',
        header: 'DTE',
        align: 'right',
        sortValue: r => r.dte,
        render: r => <span className="text-textPrimary">{r.dte}d</span>,
      },
      {
        key: 'otm',
        header: 'OTM %',
        align: 'right',
        sortValue: r => r.otmPct,
        // Distance is a fact, not a verdict — neutral ink (the BPS rule).
        render: r => (
          <span className="text-textSecondary">
            {r.otmPct >= 0 ? '+' : ''}
            {r.otmPct.toFixed(1)}%
          </span>
        ),
      },
      {
        key: 'last',
        header: 'Fill · Chg',
        align: 'right',
        sortValue: r => r.chgPct,
        render: r => (
          <span className="text-textPrimary">
            ${r.last.toFixed(2)}{' '}
            <span className={`text-[10px] ${r.chgPct >= 0 ? 'text-bull' : 'text-bear'}`}>
              {r.chgPct >= 0 ? '+' : ''}
              {r.chgPct.toFixed(1)}%
            </span>
          </span>
        ),
      },
      {
        key: 'vol',
        header: 'Vol',
        align: 'right',
        sortValue: r => r.volume,
        render: r => <span className={weightInk(r.volume, marks.vol)}>{num(r.volume)}</span>,
      },
      {
        key: 'oi',
        header: 'OI',
        align: 'right',
        sortValue: r => r.oi,
        render: r => <span className={weightInk(r.oi, marks.oi)}>{num(r.oi)}</span>,
      },
      {
        key: 'doi',
        header: 'ΔOI',
        align: 'right',
        sortValue: r => r.deltaOI,
        render: r => {
          if (r.deltaOI === 0) return <span className="text-textMuted">—</span>;
          const a = Math.abs(r.deltaOI);
          // Signed fact: direction ink once loud, magenta for the champion.
          const tone =
            a >= marks.doi.top ? 'text-supreme font-bold' : a >= marks.doi.bar ? (r.deltaOI > 0 ? 'text-bull' : 'text-bear') : 'text-textSecondary';
          return (
            <span className={tone}>
              {r.deltaOI > 0 ? '+' : ''}
              {num(r.deltaOI)}{' '}
              {/* NEW, not a percentage from nothing — see OI_PCT_FLOOR. */}
              <span className="text-[10px] opacity-80">
                {r.deltaOIPct === null ? (
                  <span
                    className="uppercase tracking-widest font-bold"
                    title={`Only ${r.prevOI} contracts of open interest yesterday — a percentage change from that says nothing.`}
                  >
                    new
                  </span>
                ) : (
                  `${r.deltaOIPct > 0 ? '+' : ''}${r.deltaOIPct.toFixed(0)}%`
                )}
              </span>
            </span>
          );
        },
      },
      {
        key: 'prem',
        header: 'Prem',
        align: 'right',
        sortValue: r => r.premium,
        render: r => <span className={weightInk(r.premium, marks.prem)}>{fmtUsd(r.premium)}</span>,
      },
      {
        key: 'iv',
        header: 'IV · Δ',
        align: 'right',
        sortValue: r => r.iv,
        /* The Δ is a SIGNED CHANGE, so it wears direction ink — the same rule
           the Fill · Chg column beside it already follows (Noah, 2026-08-30:
           "the plus and minuses on the iv should be red or green depending on
           the negative or positive impact"). The level stays neutral: 61% IV
           is a fact about the contract, not a move. */
        render: r => (
          <span className="text-textPrimary">
            {r.iv.toFixed(0)}%{' '}
            <span className={`text-[10px] ${r.ivChg >= 0 ? 'text-bull' : 'text-bear'}`}>
              {r.ivChg >= 0 ? '+' : ''}
              {r.ivChg.toFixed(1)}
            </span>
          </span>
        ),
      },
      {
        key: 'voloi',
        header: 'Vol/OI',
        align: 'right',
        sortValue: r => r.volOverOI,
        // ≥1.5 = positions built TODAY — weight carries it, not neon.
        render: r => (
          <span className={r.volOverOI >= 1.5 ? 'font-bold text-textPrimary' : 'text-textSecondary'}>
            {r.volOverOI.toFixed(2)}
          </span>
        ),
      },
      {
        key: 'sweep',
        header: 'Sweep',
        align: 'right',
        sortValue: r => r.sweepPct,
        render: r => <span className={r.sweepPct >= 40 ? 'text-textPrimary' : 'text-textSecondary'}>{r.sweepPct}%</span>,
      },
      {
        key: 'floor',
        header: 'Floor',
        align: 'right',
        sortValue: r => r.floorPct,
        render: r =>
          r.floorPct === 0 ? (
            <span className="text-textMuted">—</span>
          ) : (
            <span className={r.floorPct >= 50 ? 'text-textPrimary font-bold' : 'text-textSecondary'}>{r.floorPct}%</span>
          ),
      },
      {
        key: 'multi',
        header: 'Multi',
        align: 'right',
        sortValue: r => r.multiPct,
        render: r => <span className={r.multiPct >= 30 ? 'text-textPrimary' : 'text-textSecondary'}>{r.multiPct}%</span>,
      },
      {
        key: 'lean',
        header: 'Lean',
        align: 'right',
        sortValue: r => r.askPct,
        // The tape's own bid/ask cell — one grammar everywhere.
        render: r => <LeanCell askPct={r.askPct} />,
      },
      {
        key: 'sector',
        header: 'Sector',
        sortValue: r => r.sector ?? '',
        render: r =>
          r.sector ? (
            <span className="inline-flex items-center gap-1.5 text-[10px] text-textSecondary">
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: r.sectorColor ?? '#666' }} />
              {r.sector}
            </span>
          ) : (
            <span className="text-textMuted">—</span>
          ),
      },
    ],
    [marks]
  );

  /* THE TAPE'S HEAD, THIS PAGE'S RULES (Noah, 2026-08-30): the composition
     strip — facts left, champions as pills right — and the column chooser.
     The bull/bear pills only show when they are not the magenta one. */
  const champs = useMemo(() => {
    const by = (pick: (r: BookContract) => boolean) =>
      shown.filter(pick).reduce<BookContract | null>((a, r) => (a === null || r.premium > a.premium ? r : a), null);
    return { call: by(r => r.right === 'C'), put: by(r => r.right === 'P'), all: by(() => true) };
  }, [shown]);
  const facts = useMemo(() => {
    let prem = 0;
    let callPrem = 0;
    let fresh = 0;
    const names = new Set<string>();
    for (const r of rows) {
      prem += r.premium;
      if (r.right === 'C') callPrem += r.premium;
      if (r.volOverOI >= 1.5) fresh++;
      names.add(r.ticker);
    }
    return { prem, callPct: Math.round((callPrem / Math.max(1, prem)) * 100), fresh, names: names.size };
  }, [rows]);
  const pill = (r: BookContract) => (
    <>
      {r.ticker} {r.strike}
      {r.right} · {fmtUsd(r.premium)}
    </>
  );
  const { hidden, toggle, showAll, hideAll } = useHiddenColumns('slayer_screener_cols');
  const shownColumns = useMemo(() => columns.filter(c => !hidden.has(c.key)), [columns, hidden]);
  const chooserCols = useMemo(
    () => columns.map(c => ({ key: c.key, label: typeof c.header === 'string' ? c.header : c.key })),
    [columns]
  );
  const tools = (
    <ColumnChooser columns={chooserCols} hidden={hidden} onToggle={toggle} onAll={showAll} onNone={() => hideAll(columns.map(c => c.key))} />
  );
  const strip = (
    <StatsStrip
      pills={
        <>
          {champs.call && champs.call !== champs.all && (
            <FactPill label="Top call" ink="bull" onOpen={() => setOpenKey(champs.call!.key)}>
              {pill(champs.call)}
            </FactPill>
          )}
          {champs.put && champs.put !== champs.all && (
            <FactPill label="Top put" ink="bear" onOpen={() => setOpenKey(champs.put!.key)}>
              {pill(champs.put)}
            </FactPill>
          )}
          {champs.all && (
            <FactPill label="Largest" ink="supreme" onOpen={() => setOpenKey(champs.all!.key)}>
              {pill(champs.all)}
            </FactPill>
          )}
        </>
      }
    >
      <span className="font-mono text-[11px] tnum whitespace-nowrap">
        <span className="text-textPrimary font-bold">{fmtUsd(facts.prem)}</span>
        <span className="text-textMuted"> · </span>
        <span className="text-bull font-semibold">calls {facts.callPct}%</span>
        <span className="text-textMuted"> / </span>
        <span className="text-bear font-semibold">puts {100 - facts.callPct}%</span>
      </span>
      <Fact value={num(rows.length)}>contracts</Fact>
      <Fact value={facts.names}>names</Fact>
      <Fact value={facts.fresh} tone={facts.fresh > 0 ? 'text-textSecondary' : 'text-textMuted'}>
        trading past their interest
      </Fact>
    </StatsStrip>
  );

  return (
    <>
      <FlowTop hold={holdDoor} strip={strip} tools={tools} hint={<>{activeScreen.label} — {activeScreen.hint}</>} count={<>{rows.length > ROW_CAP ? `heaviest ${ROW_CAP} of ${num(rows.length)} contracts` : `${num(rows.length)} contracts`}</>} read={<RichRead text={read} />} readLabel="Book read" tone={lean}>
        <FlowSearch value={query} onChange={setQuery} rows={book} countNoun="contracts" />
        <FilterDoor live={screen !== 'active' || filtersLive}>
          <FilterSection label="Screen">
            {FLOW_SCREENS.map(s => (
              <Chip key={s.key} active={screen === s.key} onClick={() => setScreen(s.key)} title={s.hint}>
                {s.label}
              </Chip>
            ))}
          </FilterSection>
          <FilterSection label="Side">
            {(['ALL', 'C', 'P'] as const).map(s => (
              <Chip key={s} active={filters.side === s} onClick={() => setFilters(f => ({ ...f, side: s }))}>
                {s === 'ALL' ? 'Both' : s === 'C' ? 'Calls' : 'Puts'}
              </Chip>
            ))}
          </FilterSection>
          <FilterSection label="Tenor">
            {SLEEVES.map(sl => (
              <Chip key={sl.key} active={filters.tenors.includes(sl.key)} onClick={() => toggleTenor(sl.key)} title={sl.blurb}>
                {sl.label}
              </Chip>
            ))}
          </FilterSection>
          <div className="grid grid-cols-2 gap-2 mb-2.5">
            <label className="block">
              <span className="font-mono text-[9px] uppercase tracking-widest text-textMuted">Min volume</span>
              <input
                type="number"
                min={0}
                value={filters.minVolume || ''}
                placeholder="0"
                onChange={e => setFilters(f => ({ ...f, minVolume: Math.max(0, Number(e.target.value) || 0) }))}
                className="mt-1 w-full bg-white/[0.04] border border-borderSubtle rounded px-2 py-1 font-mono text-[11px] text-textPrimary outline-none focus:border-borderMuted"
              />
            </label>
            <label className="block">
              <span className="font-mono text-[9px] uppercase tracking-widest text-textMuted">Min premium $</span>
              <input
                type="number"
                min={0}
                value={filters.minPremium || ''}
                placeholder="0"
                onChange={e => setFilters(f => ({ ...f, minPremium: Math.max(0, Number(e.target.value) || 0) }))}
                className="mt-1 w-full bg-white/[0.04] border border-borderSubtle rounded px-2 py-1 font-mono text-[11px] text-textPrimary outline-none focus:border-borderMuted"
              />
            </label>
          </div>
          <div className="flex items-center justify-between">
            <Chip active={filters.excludeItm} onClick={() => setFilters(f => ({ ...f, excludeItm: !f.excludeItm }))}>
              Out-of-the-money only
            </Chip>
            <button
              onClick={() => {
                setFilters(DEFAULT_FILTERS);
                setScreen('active');
              }}
              className="font-mono text-[10px] text-textMuted hover:text-textPrimary transition-colors"
            >
              Reset
            </button>
          </div>
        </FilterDoor>
      </FlowTop>

      <div className="w-full border-t border-borderSubtle">
        <DataTable
          columns={shownColumns}
          rows={shown}
          rowKey={keyOf}
          onRowClick={openRow}
          selectedKey={openKey}
          backToTop
          emptyText="Nothing matches this cut today — loosen the filters"
        />
      </div>

      <BookDrill list={shown} openKey={openKey} onOpen={setOpenKey} tick={tick} />
    </>
  );
};

export default OptionsScreener;
