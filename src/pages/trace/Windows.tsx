/*
==================================================
  SLAYER TERMINAL - WINDOWS (Trace)
  The day cut into quarter-hours (Noah, 2026-08-30
  — expansion page 4, from the reference's
  interval-flow table; renamed per the reason-not-
  rule law — "Interval" is their tab's word).

  The question this page answers: WHEN did a
  contract's day actually happen? Most dribble all
  session; a few BURST — the whole day in one
  window, somebody acting all at once. Share-of-day
  is the tell, and the navigator strip lets the
  reader walk the session window by window.
==================================================
*/

import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMarketData } from '../../context/MarketDataContext';
import Simulator from '../../core/simulator';
import {
  buildFlowBook,
  buildIntervalSlices,
  intervalWindows,
  type IntervalSlice,
} from '../../data/flowBook';
import { fmtUsd } from '../../data/gex';
import type { BookContract } from '../../types/trace';
import DataTable, { type Column } from '../../components/ui/DataTable';
import Chip from '../../components/ui/Chip';
import CompanyLogo from '../../components/ui/CompanyLogo';
import RichRead from '../../components/ui/RichRead';
import BookDrill from '../../components/trace/BookDrill';
import ContractCell from '../../components/trace/ContractCell';
import ReadDoor from '../../components/trace/ReadDoor';
import FilterDoor, { FilterSection } from '../../components/trace/FilterDoor';
import { earnMarks, weightInk } from '../../components/trace/earnedInk';
import FlowSearch, { normSymbol } from '../../components/trace/FlowSearch';
import FlowTop from '../../components/trace/FlowTop';
import { LiveHold, useHold } from '../../components/trace/LiveHold';
import StatsStrip, { Fact, FactPill } from '../../components/trace/StatsStrip';
import ColumnChooser, { useHiddenColumns } from '../../components/trace/ColumnChooser';
import LeanCell from '../../components/trace/LeanCell';

const num = (v: number) => v.toLocaleString('en-US');

type CutKey = 'all' | 'bursts' | 'ask' | 'bid';

const CUTS: { key: CutKey; label: string; hint: string }[] = [
  { key: 'all', label: 'Everything', hint: 'Every contract that traded in this window, heaviest first' },
  { key: 'bursts', label: 'Bursts', hint: 'Half the contract’s whole day or more landed right here' },
  { key: 'ask', label: 'Lifted the ask', hint: 'Window flow that paid up — buyers' },
  { key: 'bid', label: 'Hit the bid', hint: 'Window flow that sold down — writers' },
];

const Windows = () => {
  const { marketData, activeTicker } = useMarketData();
  const [winSel, setWinSel] = useState<number | 'latest'>('latest');
  const [cut, setCut] = useState<CutKey>('all');
  const [side, setSide] = useState<'ALL' | 'C' | 'P'>('ALL');
  const [query, setQuery] = useState('');
  const [openKey, setOpenKey] = useState<string | null>(null);

  const liveBook = useMemo(
    () => buildFlowBook(Simulator.universeQuotes(activeTicker)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeTicker, marketData]
  );
  // The shared hold (see LiveHold): book and tick freeze together while paused.
  const hold = useHold(useMemo(() => ({ book: liveBook, tick: marketData }), [liveBook, marketData]), activeTicker);
  const { book, tick } = hold.value;
  const holdDoor = <LiveHold paused={hold.paused} onToggle={hold.toggle} heldAt={hold.heldAt} />;
  // Stable row callbacks so the memoised DataTable can sit out the ticks (see DataTable).
  const keyOf = useCallback((s: { key: string }) => s.key, []);
  const openRow = useCallback((s: { row: { key: string } }) => setOpenKey(s.row.key), []);
  const windows = useMemo(() => intervalWindows(book), [book]);

  // "Latest" follows the newest COMPLETE window; the live one is a click away.
  const latestIdx = windows.length >= 2 ? windows[windows.length - 2].idx : windows[windows.length - 1]?.idx ?? 0;
  const winIdx = winSel === 'latest' ? latestIdx : Math.min(winSel, windows.length - 1);
  const win = windows[winIdx];

  const slices = useMemo(() => {
    const all = buildIntervalSlices(book, winIdx);
    const nq = normSymbol(query);
    return all.filter(s => {
      if (side !== 'ALL' && s.row.right !== side) return false;
      if (nq !== '' && !normSymbol(`${s.row.ticker}${s.row.strike}${s.row.right}`).includes(nq)) return false;
      if (cut === 'bursts') return s.shareOfDayPct >= 50;
      if (cut === 'ask') return s.askPct >= 58;
      if (cut === 'bid') return s.askPct <= 42;
      return true;
    });
  }, [book, winIdx, cut, side, query]);

  const maxNav = useMemo(() => Math.max(...windows.map(w => w.totalVol), 1), [windows]);

  /* Three registers per column — components/trace/earnedInk.ts. Window facts
     and whole-day facts each measure their own crowd. */
  const marks = useMemo(
    () => ({
      wvol: earnMarks(slices, s => s.vol),
      wprem: earnMarks(slices, s => s.premium),
      dayVol: earnMarks(slices, s => s.row.volume),
      oi: earnMarks(slices, s => s.row.oi),
      dayPrem: earnMarks(slices, s => s.row.premium),
    }),
    [slices]
  );

  /* ReactNode: the loudest slice's contract is a door into its card. */
  const read = useMemo<ReactNode>(() => {
    if (!win || slices.length === 0)
      return <RichRead text={`Nothing traded between ${win ? win.label.replace('–', ' and ') : 'these minutes'} on this cut.`} />;
    const total = slices.reduce((a, s) => a + s.vol, 0);
    const names = new Set(slices.map(s => s.row.ticker)).size;
    const loud = slices[0];
    return (
      <>
        <RichRead
          text={`Between ${win.label.replace('–', ' and ')} the book traded ${num(total)} contracts across ${names} names. The loudest: `}
        />
        <ReadDoor onOpen={() => setOpenKey(loud.row.key)}>
          {loud.row.ticker} {loud.row.strike}
          {loud.row.right}
        </ReadDoor>
        <RichRead
          text={`, [[${num(loud.vol)}]] contracts — ${loud.shareOfDayPct.toFixed(0)}% of its whole day${
            win.live ? '. This window is still filling' : ''
          }.`}
        />
      </>
    );
  }, [slices, win]);

  const activeCut = CUTS.find(c => c.key === cut) ?? CUTS[0];

  const columns = useMemo<Column<IntervalSlice>[]>(
    () => [
      {
        key: 'ticker',
        header: 'Ticker',
        sortValue: s => s.row.ticker,
        render: s => (
          <span className="inline-flex items-center gap-1.5">
            <CompanyLogo ticker={s.row.ticker} size={15} />
            <span className="font-bold text-textPrimary">{s.row.ticker}</span>
          </span>
        ),
      },
      {
        key: 'contract',
        header: 'Contract',
        align: 'right',
        sortValue: s => s.row.strike,
        render: s => <ContractCell strike={s.row.strike} right={s.row.right} expiry={s.row.expiry} />,
      },
      {
        key: 'dte',
        header: 'DTE',
        align: 'right',
        sortValue: s => s.row.dte,
        render: s => <span className="text-textPrimary">{s.row.dte}d</span>,
      },
      {
        key: 'otm',
        header: 'OTM %',
        align: 'right',
        sortValue: s => s.row.otmPct,
        render: s => (
          <span className="text-textSecondary">
            {s.row.otmPct >= 0 ? '+' : ''}
            {s.row.otmPct.toFixed(1)}%
          </span>
        ),
      },
      {
        key: 'wvol',
        header: 'This window',
        align: 'right',
        sortValue: s => s.vol,
        render: s => <span className={weightInk(s.vol, marks.wvol)}>{num(s.vol)}</span>,
      },
      {
        key: 'share',
        header: 'Share of day',
        align: 'right',
        sortValue: s => s.shareOfDayPct,
        // The burst tell — half a day in one window earns WEIGHT, not hue
        // (the lime retreat: data intensity is bold white, neon is not a fact).
        render: s => {
          const hot = s.shareOfDayPct >= 50;
          return (
            <span className="inline-flex items-center gap-1.5 justify-end">
              <span className="relative inline-block w-10 h-1 rounded-full bg-white/[0.08] overflow-hidden align-middle">
                <span
                  className={`absolute left-0 top-0 h-full ${hot ? 'bg-white/85' : 'bg-white/40'}`}
                  style={{ width: `${Math.min(100, s.shareOfDayPct)}%` }}
                />
              </span>
              <span className={`tnum ${hot ? 'font-bold text-textPrimary' : 'text-textSecondary'}`}>
                {s.shareOfDayPct.toFixed(0)}%
              </span>
            </span>
          );
        },
      },
      {
        key: 'fill',
        header: 'Fill',
        align: 'right',
        sortValue: s => s.avgFill,
        render: s => <span className="text-textPrimary">${s.avgFill.toFixed(2)}</span>,
      },
      {
        key: 'wprem',
        header: 'Window $',
        align: 'right',
        sortValue: s => s.premium,
        render: s => <span className={weightInk(s.premium, marks.wprem)}>{fmtUsd(s.premium)}</span>,
      },
      {
        key: 'lean',
        header: 'Lean',
        align: 'right',
        sortValue: s => s.askPct,
        render: s => <LeanCell askPct={s.askPct} />,
      },
      {
        key: 'ivchg',
        header: 'IV Δ',
        align: 'right',
        sortValue: s => s.ivChg,
        // Signed change = direction ink, same as the screener's IV · Δ.
        render: s => (
          <span className={s.ivChg >= 0 ? 'text-bull' : 'text-bear'}>
            {s.ivChg >= 0 ? '+' : ''}
            {s.ivChg.toFixed(1)}
          </span>
        ),
      },
      {
        key: 'sweep',
        header: 'Sweep',
        align: 'right',
        sortValue: s => s.sweepPct,
        render: s => <span className={s.sweepPct >= 40 ? 'text-textPrimary' : 'text-textSecondary'}>{s.sweepPct}%</span>,
      },
      {
        key: 'floor',
        header: 'Floor',
        align: 'right',
        sortValue: s => s.floorPct,
        // A floor cross is an institution's fingerprint — bright when it owns
        // the window.
        render: s =>
          s.floorPct === 0 ? (
            <span className="text-textMuted">—</span>
          ) : (
            <span className={s.floorPct >= 50 ? 'text-textPrimary font-bold' : 'text-textSecondary'}>{s.floorPct}%</span>
          ),
      },
      {
        key: 'multi',
        header: 'Multi',
        align: 'right',
        sortValue: s => s.multiPct,
        render: s => <span className={s.multiPct >= 30 ? 'text-textPrimary' : 'text-textSecondary'}>{s.multiPct}%</span>,
      },
      {
        key: 'voloi',
        header: 'Vol/OI',
        align: 'right',
        sortValue: s => s.volOverOI,
        render: s => (
          <span className={s.volOverOI >= 1.5 ? 'font-bold text-textPrimary' : 'text-textSecondary'}>
            {s.volOverOI.toFixed(2)}
          </span>
        ),
      },
      {
        key: 'dayvol',
        header: 'Day vol',
        align: 'right',
        sortValue: s => s.row.volume,
        render: s => <span className={weightInk(s.row.volume, marks.dayVol)}>{num(s.row.volume)}</span>,
      },
      {
        key: 'oi',
        header: 'OI',
        align: 'right',
        sortValue: s => s.row.oi,
        render: s => <span className={weightInk(s.row.oi, marks.oi)}>{num(s.row.oi)}</span>,
      },
      {
        key: 'daylean',
        header: 'Day lean',
        align: 'right',
        sortValue: s => s.row.askPct,
        render: s => <LeanCell askPct={s.row.askPct} />,
      },
      {
        key: 'prem',
        header: 'Day $',
        align: 'right',
        sortValue: s => s.row.premium,
        render: s => <span className={weightInk(s.row.premium, marks.dayPrem)}>{fmtUsd(s.row.premium)}</span>,
      },
      {
        key: 'earn',
        header: 'Earnings',
        align: 'right',
        sortValue: s => s.row.earnDays ?? 999,
        render: s =>
          s.row.earnDays == null ? (
            <span className="text-textMuted">—</span>
          ) : (
            <span className={s.row.earnDays <= 5 ? 'text-warn' : 'text-textSecondary'}>
              {s.row.earnDays === 0 ? 'today' : `in ${s.row.earnDays}d`}
            </span>
          ),
      },
    ],
    []
  );

  /* THE TAPE'S HEAD, THIS PAGE'S RULES (Noah, 2026-08-30): the composition
     strip — facts left, champions as pills right — and the column chooser.
     The bull/bear pills only show when they are not the magenta one. */
  const champs = useMemo(() => {
    const by = (pick: (s: IntervalSlice) => boolean, key: (s: IntervalSlice) => number) =>
      slices.filter(pick).reduce<IntervalSlice | null>((a, x) => (a === null || key(x) > key(a) ? x : a), null);
    return {
      lifted: by(s => s.askPct >= 58, s => s.vol),
      hit: by(s => s.askPct <= 42, s => s.vol),
      burst: by(() => true, s => s.shareOfDayPct),
    };
  }, [slices]);
  const facts = useMemo(() => {
    const total = slices.reduce((a, s) => a + s.vol, 0);
    const prem = slices.reduce((a, s) => a + s.premium, 0);
    const names = new Set(slices.map(s => s.row.ticker)).size;
    return { total, prem, names };
  }, [slices]);
  const pill = (s: IntervalSlice, v: string) => (
    <>
      {s.row.ticker} {s.row.strike}
      {s.row.right} · {v}
    </>
  );
  const { hidden, toggle, showAll, hideAll } = useHiddenColumns('slayer_windows_cols');
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
          {champs.lifted && champs.lifted !== champs.burst && (
            <FactPill label="Lifted most" ink="bull" onOpen={() => setOpenKey(champs.lifted!.row.key)}>
              {pill(champs.lifted, num(champs.lifted.vol))}
            </FactPill>
          )}
          {champs.hit && champs.hit !== champs.burst && (
            <FactPill label="Hit most" ink="bear" onOpen={() => setOpenKey(champs.hit!.row.key)}>
              {pill(champs.hit, num(champs.hit.vol))}
            </FactPill>
          )}
          {champs.burst && (
            <FactPill label="Burst" ink="supreme" onOpen={() => setOpenKey(champs.burst!.row.key)}>
              {pill(champs.burst, `${champs.burst.shareOfDayPct.toFixed(0)}% of its day`)}
            </FactPill>
          )}
        </>
      }
    >
      <span className="font-mono text-[11px] tnum whitespace-nowrap">
        <span className="text-textPrimary font-bold">{num(facts.total)}</span>
        <span className="text-textSecondary"> contracts</span>
        <span className="text-textMuted"> · </span>
        <span className="text-textPrimary font-bold">{fmtUsd(facts.prem)}</span>
      </span>
      <Fact value={facts.names}>names in the window</Fact>
      {/* A held page must not breathe "live" (the LiveHold honesty rule). */}
      {win?.live &&
        (hold.paused ? (
          <span className="font-mono text-[9px] uppercase tracking-widest text-warn">held</span>
        ) : (
          <span className="font-mono text-[9px] uppercase tracking-widest text-select animate-live-breathe">still filling</span>
        ))}
    </StatsStrip>
  );

  return (
    <>
      {/* The session as an instrument — every landed window a clickable bar,
          WHITE = where you are, LIME = the live window (status language, the
          same ink as every LIVE chip), hour marks so the strip decodes itself. */}
      <div className="max-w-full">
        <div
          className="flex items-end gap-px h-10 border-b border-borderSubtle"
          role="tablist"
          aria-label="Session windows"
        >
          {windows.map(w => {
            const sel = w.idx === winIdx;
            return (
              <button
                key={w.idx}
                role="tab"
                aria-selected={sel}
                title={`${w.label} · ${num(w.totalVol)} contracts${w.live ? ' · still filling' : ''}`}
                onClick={() => setWinSel(w.idx)}
                className="flex-1 max-w-[14px] min-w-[3px] h-full flex items-end group"
              >
                <span
                  className={`w-full rounded-t-[1px] transition-colors ${
                    sel
                      ? 'bg-white'
                      : w.live
                        ? hold.paused
                          ? 'bg-warn/70'
                          : 'bg-select animate-live-breathe'
                        : 'bg-white/[0.16] group-hover:bg-white/[0.35]'
                  }`}
                  style={{ height: `${Math.max(8, (w.totalVol / maxNav) * 100)}%` }}
                />
              </button>
            );
          })}
        </div>
        <div className="flex justify-between pt-1 px-1 font-mono text-[8px] uppercase tracking-widest text-textMuted tnum select-none">
          {[0, 0.25, 0.5, 0.75].map(f => {
            const w = windows[Math.min(windows.length - 1, Math.floor(windows.length * f))];
            return <span key={f}>{w ? w.label.split('–')[0] : ''}</span>;
          })}
          <span className="text-select">now</span>
        </div>
      </div>

      <FlowTop hold={holdDoor} strip={strip} tools={tools} hint={<>{activeCut.label} — {activeCut.hint}</>} count={<>{num(slices.length)} contracts in the window</>} read={read} readLabel="Window read">
        <button
          onClick={() => setWinSel(Math.max(0, winIdx - 1))}
          disabled={winIdx === 0}
          aria-label="Previous window"
          className="p-1 rounded text-textSecondary hover:text-textPrimary hover:bg-white/[0.06] disabled:opacity-30 transition-colors"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <span className="font-mono text-xs font-bold tnum text-textPrimary">{win?.label ?? '—'}</span>
        {win?.live &&
          (hold.paused ? (
            <span className="font-mono text-[9px] uppercase tracking-widest text-warn">held</span>
          ) : (
            <span className="font-mono text-[9px] uppercase tracking-widest text-select animate-live-breathe">live</span>
          ))}
        <button
          onClick={() => setWinSel(Math.min(windows.length - 1, winIdx + 1))}
          disabled={winIdx >= windows.length - 1}
          aria-label="Next window"
          className="p-1 rounded text-textSecondary hover:text-textPrimary hover:bg-white/[0.06] disabled:opacity-30 transition-colors"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
        <Chip active={winSel === 'latest'} onClick={() => setWinSel('latest')} title="Follow the newest complete window">
          Latest
        </Chip>
        <FlowSearch value={query} onChange={setQuery} rows={book} countNoun="contracts" />
        <FilterDoor live={cut !== 'all' || side !== 'ALL'}>
          <FilterSection label="Cut">
            {CUTS.map(c => (
              <Chip key={c.key} active={cut === c.key} onClick={() => setCut(c.key)} title={c.hint}>
                {c.label}
              </Chip>
            ))}
          </FilterSection>
          <FilterSection label="Side">
            {(['ALL', 'C', 'P'] as const).map(s => (
              <Chip key={s} active={side === s} onClick={() => setSide(s)}>
                {s === 'ALL' ? 'Both' : s === 'C' ? 'Calls' : 'Puts'}
              </Chip>
            ))}
          </FilterSection>
        </FilterDoor>
      </FlowTop>

      <div className="w-full border-t border-borderSubtle">
        <DataTable
          columns={shownColumns}
          rows={slices}
          rowKey={keyOf}
          onRowClick={openRow}
          selectedKey={openKey ? slices.find(s => s.row.key === openKey)?.key ?? null : null}
          backToTop
          emptyText="Nothing traded in this window on this cut"
        />
      </div>

      <BookDrill list={slices.map(s => s.row)} openKey={openKey} onOpen={setOpenKey} tick={tick} />
    </>
  );
};

export default Windows;
