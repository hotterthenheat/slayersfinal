/*
==================================================
  SLAYER TERMINAL - FLOW ALERTS (Trace)
  The tape watching itself (Noah, 2026-08-30 —
  expansion page 3, from the reference's flow-alert
  stream).

  The reader's bell stays the reader's: those are
  alerts YOU armed. These are the desk's own
  watchers over the day book, and the feed is what
  they caught — dripped through the session on the
  engine clock, newest first.

  REASON, NOT RULE (Noah, 2026-08-30): the column
  answers the reader's actual question — "why is
  this in front of me" — in a house phrase. Reason
  dots use the CATEGORICAL palette (a reason names
  a kind, never a verdict — direction ink lives in
  the Side column).

  AND THE READER'S OWN (Noah, 2026-08-30): reasons
  you write land in this same feed, on the same
  clock, quoting the same book — marked with a
  hollow ring so you always know whose watcher
  caught the row. The builder is behind "Your
  reasons"; the vocabulary is data/flowReasons.ts.
==================================================
*/

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMarketData } from '../../context/MarketDataContext';
import Simulator from '../../core/simulator';
import {
  buildFlowAlerts,
  buildFlowBook,
  FLOW_ALERT_RULES,
  type AlertRuleKey,
  type FlowAlert,
} from '../../data/flowBook';
import { reasonSentence, useReasons } from '../../data/flowReasons';
import { fmtUsd } from '../../data/gex';
import type { BookContract } from '../../types/trace';
import DataTable, { type Column } from '../../components/ui/DataTable';
import Chip from '../../components/ui/Chip';
import CompanyLogo from '../../components/ui/CompanyLogo';
import RichRead from '../../components/ui/RichRead';
import BookDrill from '../../components/trace/BookDrill';
import ContractCell from '../../components/trace/ContractCell';
import FilterDoor, { FilterSection } from '../../components/trace/FilterDoor';
import { earnMarks, weightInk } from '../../components/trace/earnedInk';
import FlowTop from '../../components/trace/FlowTop';
import { LiveHold, useHold } from '../../components/trace/LiveHold';
import StatsStrip, { Fact, FactPill } from '../../components/trace/StatsStrip';
import ColumnChooser, { useHiddenColumns } from '../../components/trace/ColumnChooser';
import ReasonDoor from '../../components/trace/ReasonDoor';
import ReadDoor from '../../components/trace/ReadDoor';
import FlowSearch, { normSymbol } from '../../components/trace/FlowSearch';

const ROW_CAP = 80;

const num = (v: number) => v.toLocaleString('en-US');

/** Categorical reason dots — same idea as sector dots: a hue names the kind. */
const RULE_DOT: Record<AlertRuleKey, string> = {
  'big-money': '#9B8FE8',
  'into-earnings': '#E0D080',
  climbing: '#6ECFC4',
  falling: '#E89AC0',
  'fresh-size': '#7EA6F0',
  hammering: '#E8C468',
};

const RULE_META = Object.fromEntries(FLOW_ALERT_RULES.map(r => [r.key, r])) as Record<
  AlertRuleKey,
  (typeof FLOW_ALERT_RULES)[number]
>;

const FlowAlerts = () => {
  const { marketData, activeTicker } = useMarketData();
  const [rule, setRule] = useState<string>('ALL');
  const [side, setSide] = useState<'ALL' | 'C' | 'P'>('ALL');
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const myReasons = useReasons();

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
  const keyOf = useCallback((a: { id: string }) => a.id, []);
  const openRow = useCallback((a: { row: { key: string } }) => setOpenKey(a.row.key), []);
  const alerts = useMemo(() => buildFlowAlerts(book, myReasons), [book, myReasons]);

  /* One lookup for both shelves — the column, the chips and the header hint
     all resolve a reason's words through this, so a row and its filter chip
     can never describe the same reason differently. */
  const reasonOf = useMemo(() => {
    const mine = new Map(myReasons.map(r => [r.id, r]));
    return (key: string): { label: string; phrase: string; mine: boolean } | null => {
      const house = RULE_META[key as AlertRuleKey];
      if (house) return { label: house.label, phrase: house.reason, mine: false };
      const own = mine.get(key);
      return own ? { label: own.name, phrase: reasonSentence(own), mine: true } : null;
    };
  }, [myReasons]);

  /* Delete the reason you were filtered to and the filter would go on hiding
     everything for a reason that no longer exists — an empty table with no
     way to read why. Fall back to the whole feed. */
  useEffect(() => {
    if (rule !== 'ALL' && !reasonOf(rule)) setRule('ALL');
  }, [rule, reasonOf]);

  const rows = useMemo(() => {
    const nq = normSymbol(query);
    return alerts.filter(
      a =>
        (rule === 'ALL' || a.rule === rule) &&
        (side === 'ALL' || a.row.right === side) &&
        (nq === '' || normSymbol(`${a.row.ticker}${a.row.strike}${a.row.right}`).includes(nq))
    );
  }, [alerts, rule, side, query]);
  const shown = useMemo(() => rows.slice(0, ROW_CAP), [rows]);

  /* One row per contract for the search's tallies — a loud contract alerts
     twice, and counting it twice would double its money in the suggestions. */
  const searchRows = useMemo(() => {
    const seen = new Map<string, BookContract>();
    for (const a of alerts) if (!seen.has(a.row.key)) seen.set(a.row.key, a.row);
    return [...seen.values()];
  }, [alerts]);

  /* Three registers per column (Noah, 2026-08-30) - and the Print $ champion
     in magenta is this feed's own LARGEST PRINT, the tape chart's grammar. */
  const marks = useMemo(
    () => ({
      prem: earnMarks(shown, a => a.clipPremium),
      vol: earnMarks(shown, a => a.row.volume),
      oi: earnMarks(shown, a => a.row.oi),
    }),
    [shown]
  );

  // The drilldown anchors on the EXACT print the rule fired on.
  const clipMap = useMemo(() => {
    const m = new Map<string, { size: number; fill: number; side: 'ASK' | 'BID'; time: string }>();
    for (const a of shown) {
      if (!m.has(a.row.key)) m.set(a.row.key, { size: a.clipSize, fill: a.clipFill, side: a.side, time: a.time });
    }
    return m;
  }, [shown]);
  const clipFor = useMemo(() => (row: BookContract) => clipMap.get(row.key), [clipMap]);
  /* The read's "Latest:" door must open even when a filter has hidden that
     row — the drill list quietly carries it up front then. */
  const drillList = useMemo(() => {
    const base = shown.map(a => a.row);
    const latest = alerts[0];
    return latest && !base.some(r => r.key === latest.row.key) ? [latest.row, ...base] : base;
  }, [shown, alerts]);

  /* ReactNode, not a string: the newest contract is a DOOR — the same white
     underline the tables wear, opening the same card (Noah, 2026-08-30). */
  const read = useMemo<ReactNode>(() => {
    if (alerts.length === 0) return <RichRead text="Nothing flagged yet today — the desk is watching." />;
    const byRule = new Map<string, number>();
    for (const a of alerts) byRule.set(a.rule, (byRule.get(a.rule) ?? 0) + 1);
    const loud = [...byRule.entries()].sort((a, b) => b[1] - a[1])[0];
    const loudName = reasonOf(loud[0])?.label ?? 'A reason';
    const mineCount = alerts.reduce((n, a) => n + (a.mine ? 1 : 0), 0);
    const latest = alerts[0];
    // Yours gets its own clause when you have any — the feed is mixed, so the
    // sentence says how much of it is the desk and how much is you.
    const yours =
      mineCount === 0
        ? ''
        : mineCount === 1
          ? ' One came from a reason you wrote.'
          : ` ${mineCount} came from reasons you wrote.`;
    /* The Screener's grammar (Noah, 2026-08-30): plain count, the leading
       reason in its own words, one newest print — never "the desk has
       flagged", never a quoted label, never "at … at …". */
    const phrase = reasonOf(loud[0])?.phrase ?? loudName;
    const why = phrase.charAt(0).toLowerCase() + phrase.slice(1);
    const names = new Set(alerts.map(a => a.row.ticker)).size;
    return (
      <>
        <RichRead text={`${alerts.length} alerts today on ${names} names — [[${loud[1]}]] because ${why}.${yours} Newest: `} />
        <ReadDoor onOpen={() => setOpenKey(latest.row.key)}>
          {latest.row.ticker} {latest.row.strike}
          {latest.row.right}
        </ReadDoor>
        <RichRead
          text={`, ${num(latest.clipSize)} on the ${latest.side === 'ASK' ? 'ask' : 'bid'} at $${latest.clipFill.toFixed(2)} (${
            latest.time
          }).`}
        />
      </>
    );
  }, [alerts, reasonOf]);

  const activeRule = rule === 'ALL' ? null : reasonOf(rule);

  const columns = useMemo<Column<FlowAlert>[]>(
    () => [
      {
        key: 'time',
        header: 'Time',
        sortValue: a => a.minute,
        render: a => <span className="text-[11px] text-textSecondary">{a.time}</span>,
      },
      {
        key: 'ticker',
        header: 'Ticker',
        sortValue: a => a.row.ticker,
        render: a => (
          <span className="inline-flex items-center gap-1.5">
            <CompanyLogo ticker={a.row.ticker} size={15} />
            <span className="font-bold text-textPrimary">{a.row.ticker}</span>
          </span>
        ),
      },
      {
        key: 'contract',
        header: 'Contract',
        align: 'right',
        sortValue: a => a.row.strike,
        render: a => <ContractCell strike={a.row.strike} right={a.row.right} expiry={a.row.expiry} />,
      },
      {
        key: 'dte',
        header: 'DTE',
        align: 'right',
        sortValue: a => a.row.dte,
        render: a => <span className="text-textPrimary">{a.row.dte}d</span>,
      },
      {
        key: 'reason',
        header: 'Reason',
        sortValue: a => a.rule,
        /* The why, spoken — not the machinery's name for it. A house reason
           wears its categorical hue; one of yours wears a hollow ring and
           leads with the handle you gave it. Shape says whose, hue says which. */
        render: a => {
          const meta = reasonOf(a.rule);
          if (!meta) return <span className="text-textMuted">—</span>;
          return (
            <span
              className="inline-flex items-center gap-1.5 text-[11px] text-textPrimary"
              title={a.mine ? `${meta.label} — ${meta.phrase}` : meta.phrase}
            >
              {a.mine ? (
                <span className="w-1.5 h-1.5 rounded-full shrink-0 border border-textSecondary" />
              ) : (
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: RULE_DOT[a.rule as AlertRuleKey] }}
                />
              )}
              {a.mine ? (
                <>
                  <span className="font-semibold">{meta.label}</span>
                  <span className="text-textSecondary truncate">{meta.phrase}</span>
                </>
              ) : (
                meta.phrase
              )}
            </span>
          );
        },
      },
      {
        key: 'clip',
        header: 'The print',
        align: 'right',
        sortValue: a => a.clipSize,
        render: a => (
          <span className="text-textPrimary">
            {num(a.clipSize)} <span className="text-[10px] text-textSecondary">@ ${a.clipFill.toFixed(2)}</span>
          </span>
        ),
      },
      {
        key: 'clipprem',
        header: 'Print $',
        align: 'right',
        sortValue: a => a.clipPremium,
        render: a => <span className={weightInk(a.clipPremium, marks.prem)}>{fmtUsd(a.clipPremium)}</span>,
      },
      {
        key: 'sideCol',
        header: 'Side',
        align: 'right',
        sortValue: a => a.side,
        // The tape's rule: at the ask = the contract being bought.
        render: a => (
          <span className={`text-[10px] ${a.side === 'ASK' ? 'text-bull' : 'text-bear'}`}>{a.side}</span>
        ),
      },
      {
        key: 'vol',
        header: 'Vol',
        align: 'right',
        sortValue: a => a.row.volume,
        render: a => <span className={weightInk(a.row.volume, marks.vol)}>{num(a.row.volume)}</span>,
      },
      {
        key: 'oi',
        header: 'OI',
        align: 'right',
        sortValue: a => a.row.oi,
        render: a => <span className={weightInk(a.row.oi, marks.oi)}>{num(a.row.oi)}</span>,
      },
      {
        key: 'voloi',
        header: 'Vol/OI',
        align: 'right',
        sortValue: a => a.row.volOverOI,
        render: a => (
          <span className={a.row.volOverOI >= 1.5 ? 'font-bold text-textPrimary' : 'text-textSecondary'}>
            {a.row.volOverOI.toFixed(2)}
          </span>
        ),
      },
      {
        key: 'otm',
        header: 'OTM %',
        align: 'right',
        sortValue: a => a.row.otmPct,
        render: a => (
          <span className="text-textSecondary">
            {a.row.otmPct >= 0 ? '+' : ''}
            {a.row.otmPct.toFixed(1)}%
          </span>
        ),
      },
      {
        key: 'earn',
        header: 'Earnings',
        align: 'right',
        sortValue: a => a.row.earnDays ?? 999,
        render: a =>
          a.row.earnDays == null ? (
            <span className="text-textMuted">—</span>
          ) : (
            <span className={a.row.earnDays <= 5 ? 'text-warn' : 'text-textSecondary'}>
              {a.row.earnDays === 0 ? 'today' : `in ${a.row.earnDays}d`}
            </span>
          ),
      },
    ],
    // The Reason cell reads the shelf through reasonOf, the magnitude cells
    // read the marks — frozen deps here rot both.
    [reasonOf, marks]
  );

  /* THE TAPE'S HEAD, THIS PAGE'S RULES (Noah, 2026-08-30): the composition
     strip — facts left, champions as pills right — and the column chooser.
     The bull/bear pills only show when they are not the magenta one. */
  const champs = useMemo(() => {
    const by = (pick: (a: FlowAlert) => boolean) =>
      shown.filter(pick).reduce<FlowAlert | null>((a, x) => (a === null || x.clipPremium > a.clipPremium ? x : a), null);
    return { ask: by(a => a.side === 'ASK'), bid: by(a => a.side === 'BID'), all: by(() => true) };
  }, [shown]);
  const facts = useMemo(() => {
    const byRule = new Map<string, number>();
    let mine = 0;
    for (const a of alerts) {
      byRule.set(a.rule, (byRule.get(a.rule) ?? 0) + 1);
      if (a.mine) mine++;
    }
    const loud = [...byRule.entries()].sort((a, b) => b[1] - a[1])[0];
    return { total: alerts.length, loudName: loud ? (reasonOf(loud[0])?.label ?? '') : '', loudCount: loud ? loud[1] : 0, mine };
  }, [alerts, reasonOf]);
  const pill = (a: FlowAlert) => (
    <>
      {a.row.ticker} {a.row.strike}
      {a.row.right} · {fmtUsd(a.clipPremium)}
    </>
  );
  const { hidden, toggle, showAll, hideAll } = useHiddenColumns('slayer_flowalerts_cols');
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
          {champs.ask && champs.ask !== champs.all && (
            <FactPill label="Top ask" ink="bull" onOpen={() => setOpenKey(champs.ask!.row.key)}>
              {pill(champs.ask)}
            </FactPill>
          )}
          {champs.bid && champs.bid !== champs.all && (
            <FactPill label="Top bid" ink="bear" onOpen={() => setOpenKey(champs.bid!.row.key)}>
              {pill(champs.bid)}
            </FactPill>
          )}
          {champs.all && (
            <FactPill label="Largest print" ink="supreme" onOpen={() => setOpenKey(champs.all!.row.key)}>
              {pill(champs.all)}
            </FactPill>
          )}
        </>
      }
    >
      <Fact value={num(facts.total)}>alerts today</Fact>
      {facts.loudName && (
        <Fact value={facts.loudCount}>
          <span className="text-textPrimary">{facts.loudName}</span>
        </Fact>
      )}
      <Fact value={facts.mine} tone={facts.mine > 0 ? 'text-textSecondary' : 'text-textMuted'}>
        from your reasons
      </Fact>
    </StatsStrip>
  );

  return (
    <>
      <FlowTop hold={holdDoor} strip={strip} tools={tools} hint={<>{activeRule
            ? `${activeRule.label} — ${activeRule.phrase}`
            : 'Every reason a contract is flagged — the desk’s and yours, newest first'}</>} count={<>{rows.length > ROW_CAP ? `latest ${ROW_CAP} of ${num(rows.length)} today` : `${num(rows.length)} today`}</>} read={read} readLabel="Desk read">
        <FlowSearch value={query} onChange={setQuery} rows={searchRows} countNoun="contracts" />
        <ReasonDoor book={book} />
        <FilterDoor live={rule !== 'ALL' || side !== 'ALL'}>
          <FilterSection label="Reason">
            <Chip active={rule === 'ALL'} onClick={() => setRule('ALL')}>
              All reasons
            </Chip>
            {FLOW_ALERT_RULES.map(r => (
              <Chip key={r.key} active={rule === r.key} onClick={() => setRule(r.key)} title={r.hint}>
                {r.label}
              </Chip>
            ))}
          </FilterSection>
          {myReasons.length > 0 && (
            <FilterSection label="Yours">
              {myReasons.map(r => (
                <Chip
                  key={r.id}
                  active={rule === r.id}
                  onClick={() => setRule(r.id)}
                  title={reasonSentence(r)}
                >
                  {r.name}
                </Chip>
              ))}
            </FilterSection>
          )}
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
          rows={shown}
          rowKey={keyOf}
          onRowClick={openRow}
          selectedKey={openKey ? shown.find(a => a.row.key === openKey)?.id ?? null : null}
          backToTop
          emptyText="Nothing flagged yet today — the desk is watching"
        />
      </div>

      <BookDrill list={drillList} openKey={openKey} onOpen={setOpenKey} clipFor={clipFor} tick={tick} />
    </>
  );
};

export default FlowAlerts;
