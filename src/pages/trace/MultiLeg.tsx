/*
==================================================
  SLAYER TERMINAL - MULTI-LEG (Trace)
  The tape reconstructed into structures (Noah,
  2026-08-30 — expansion page 7, the reference's
  page was a paywall wall; its column headers were
  the whole spec).

  Every structure explains itself in plain English
  — what the shape DOES, never what to do with it.
  Strategy dots wear the categorical palette; risk
  columns carry the ink (max loss bear, max profit
  bull, "Uncapped" loudest of all).
==================================================
*/

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, X } from 'lucide-react';
import { useMarketData } from '../../context/MarketDataContext';
import Simulator from '../../core/simulator';
import { buildSpreadFlow, spreadLegRow, SPREAD_KINDS, type SpreadKind, type SpreadTrade } from '../../data/flowBook';
import { fmtUsd } from '../../data/gex';
import BookDrill from '../../components/trace/BookDrill';
import { earnMarks, weightInk } from '../../components/trace/earnedInk';
import { DOOR, DOOR_HOVER_TEXT } from '../../components/trace/door';
import FlowTop from '../../components/trace/FlowTop';
import { LiveHold, useHold } from '../../components/trace/LiveHold';
import StatsStrip, { Fact, FactPill } from '../../components/trace/StatsStrip';
import ColumnChooser, { useHiddenColumns } from '../../components/trace/ColumnChooser';
import FlowSearch, { normSymbol } from '../../components/trace/FlowSearch';
import FilterDoor, { FilterSection } from '../../components/trace/FilterDoor';
import ReadDoor from '../../components/trace/ReadDoor';
import DataTable, { type Column } from '../../components/ui/DataTable';
import Chip from '../../components/ui/Chip';
import CompanyLogo from '../../components/ui/CompanyLogo';
import RichRead from '../../components/ui/RichRead';

const ROW_CAP = 80;

const num = (v: number) => v.toLocaleString('en-US');

/** Categorical strategy dots — a shape is a kind, never a verdict. */
const KIND_DOT: Record<SpreadKind, string> = {
  vertical: '#7EA6F0',
  condor: '#9B8FE8',
  butterfly: '#E8C468',
  straddle: '#6ECFC4',
  strangle: '#E89AC0',
  calendar: '#E0D080',
  ratio: '#93B87A',
};

const KIND_META = Object.fromEntries(SPREAD_KINDS.map(k => [k.key, k])) as Record<
  SpreadKind,
  (typeof SPREAD_KINDS)[number]
>;

const riskCell = (v: number | 'uncapped' | null, tone: 'loss' | 'profit') => {
  if (v === null) return <span className="text-textMuted">—</span>;
  if (v === 'uncapped')
    return <span className={`font-bold ${tone === 'loss' ? 'text-warn' : 'text-bull'}`}>Uncapped</span>;
  return <span className={tone === 'loss' ? 'text-bear' : 'text-bull'}>{fmtUsd(v)}</span>;
};

const doorBtn =
  'inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-textSecondary hover:text-textPrimary border border-borderSubtle rounded px-2 py-1 hover:bg-white/[0.04] transition-colors';

/** One structure opened up — the legs, the risk box, and the plain-English
    line saying what the shape does. */
const SpreadCard = ({ trade, onClose }: { trade: SpreadTrade; onClose: () => void }) => {
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const go = (fn: () => void) => {
    onClose();
    fn();
  };

  const fact = (label: string, value: React.ReactNode) => (
    <div className="flex items-baseline justify-between gap-3 py-1 border-b border-borderSubtle/50 last:border-0">
      <span className="font-mono text-[10px] uppercase tracking-wider text-textMuted">{label}</span>
      <span className="font-mono text-xs tnum text-textPrimary text-right">{value}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-[480px] border border-borderMuted bg-panel/90 backdrop-blur-xl backdrop-saturate-150 rounded-md shadow-2xl shadow-black/60 p-4 animate-soft-in">
        {/* THE HEAD CARRIES WEIGHT AT BOTH ENDS (Noah, 2026-08-30: "clean up
            this box a bit"): who it is on the left — logo, ticker, the
            structure as a pill — and when/where on the right, beside the
            close. The old line ran four registers together and trailed off
            after the name. */}
        <div className="flex items-center gap-2.5 mb-2.5">
          <CompanyLogo ticker={trade.ticker} size={20} beside />
          <span className="font-mono text-sm font-bold text-textPrimary">{trade.ticker}</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] px-2 py-0.5 font-mono text-[10px] font-semibold text-textPrimary">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: KIND_DOT[trade.kind] }} />
            {KIND_META[trade.kind].label}
          </span>
          <span className="ml-auto font-mono text-[10px] text-textMuted tnum whitespace-nowrap">
            {trade.time} · spot ${trade.spot.toFixed(2)}
          </span>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1 -mr-1 rounded text-textMuted hover:text-textPrimary hover:bg-white/[0.06] transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="text-[12px] text-textSecondary leading-snug mb-3">
          <RichRead text={KIND_META[trade.kind].read} />
        </div>

        {/* The legs — each line one fill */}
        <div className="border border-borderSubtle rounded mb-3 overflow-hidden">
          {trade.legs.map((l, i) => (
            <div
              key={i}
              className="flex items-center gap-2 px-2.5 py-1.5 border-b border-borderSubtle/60 last:border-0 font-mono text-[11px]"
            >
              <span className={`font-bold ${l.side === 'BUY' ? 'text-bull' : 'text-bear'}`}>{l.side}</span>
              <span className="text-textSecondary">×{l.ratio}</span>
              <span className="font-bold text-textPrimary tnum">{l.strike}</span>
              <span className={`font-semibold ${l.right === 'C' ? 'text-bull' : 'text-bear'}`}>
                {l.right === 'C' ? 'call' : 'put'}
              </span>
              <span className="text-[10px] text-textMuted">
                {l.expiry} · {l.dte}d
              </span>
              <span className="ml-auto tnum text-textPrimary">@ ${l.fill.toFixed(2)}</span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-x-6 mb-3">
          <div>
            {fact(
              'Net',
              <>
                ${Math.abs(trade.net).toFixed(2)}{' '}
                <span className="text-[10px] text-textSecondary">{trade.net >= 0 ? 'debit' : 'credit'}</span>
              </>
            )}
            {fact('Size', `${num(trade.size)}×`)}
            {fact('Premium', fmtUsd(trade.premium))}
            {fact('IV', `${trade.iv.toFixed(1)}%`)}
          </div>
          <div>
            {fact('Max loss', riskCell(trade.maxLoss, 'loss'))}
            {fact('Max profit', riskCell(trade.maxProfit, 'profit'))}
            {fact(
              'Delta',
              <span className={trade.delta >= 0 ? 'text-bull' : 'text-bear'}>
                {trade.delta >= 0 ? '+' : ''}
                {trade.delta.toFixed(2)}
              </span>
            )}
            {fact(
              'Theta',
              <span className="text-textSecondary">
                {trade.theta >= 0 ? '+' : ''}
                {trade.theta.toFixed(2)}
              </span>
            )}
          </div>
        </div>

        {/* THE DOORS, HALF AND HALF: two equal doors spanning the card under a
            rule. The old pair hugged the left edge beneath a symmetric facts
            grid and left the whole right half of the bottom empty (Noah:
            "heavier on the left side than the right"). */}
        <div className="grid grid-cols-2 gap-2 pt-3 border-t border-borderSubtle">
          <button
            onClick={() => go(() => navigate('/weigher', { state: { weigh: { ticker: trade.ticker } } }))}
            className={`${doorBtn} justify-center py-1.5`}
          >
            Weigh it <ArrowUpRight className="w-3 h-3" />
          </button>
          <button
            onClick={() => go(() => navigate('/compass', { state: { tickerFilter: trade.ticker } }))}
            className={`${doorBtn} justify-center py-1.5`}
          >
            The board <ArrowUpRight className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
};

/** The strikes a structure prints, each paired with the leg that owns it — a
    calendar has two legs on one strike, and the label shows that strike once. */
const distinctStrikes = (t: SpreadTrade): { strike: number; legIdx: number }[] => {
  const seen = new Set<number>();
  const out: { strike: number; legIdx: number }[] = [];
  t.legs.forEach((l, legIdx) => {
    if (seen.has(l.strike)) return;
    seen.add(l.strike);
    out.push({ strike: l.strike, legIdx });
  });
  return out.sort((a, b) => a.strike - b.strike);
};

const MultiLeg = () => {
  const { marketData, activeTicker } = useMarketData();
  const [kind, setKind] = useState<SpreadKind | 'ALL'>('ALL');
  const [money, setMoney] = useState<'ALL' | 'DEBIT' | 'CREDIT'>('ALL');
  const [query, setQuery] = useState('');
  const [drill, setDrill] = useState<SpreadTrade | null>(null);
  /* The tape card for ONE leg. Held as (structure, leg key) so ↑/↓ inside the
     card steps between that structure's own legs and nothing else. */
  const [legTrade, setLegTrade] = useState<SpreadTrade | null>(null);
  const [legKey, setLegKey] = useState<string | null>(null);

  const liveTrades = useMemo(
    () => buildSpreadFlow(Simulator.universeQuotes(activeTicker)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeTicker, marketData]
  );
  // The shared hold (see LiveHold): structures and tick freeze together while paused.
  const hold = useHold(useMemo(() => ({ trades: liveTrades, tick: marketData }), [liveTrades, marketData]), activeTicker);
  const { trades, tick } = hold.value;
  const holdDoor = <LiveHold paused={hold.paused} onToggle={hold.toggle} heldAt={hold.heldAt} />;
  // Stable row callbacks so the memoised DataTable can sit out the ticks (see DataTable).
  const keyOf = useCallback((t: { id: string }) => t.id, []);
  const openRow = useCallback((t: SpreadTrade) => setDrill(t), []);

  const rows = useMemo(() => {
    const nq = normSymbol(query);
    return trades.filter(
      t =>
        (kind === 'ALL' || t.kind === kind) &&
        (money === 'ALL' || (money === 'DEBIT' ? t.net >= 0 : t.net < 0)) &&
        // A structure matches on its ticker or ANY of its legs' contracts.
        (nq === '' ||
          normSymbol(t.ticker).includes(nq) ||
          t.legs.some(l => normSymbol(`${t.ticker}${l.strike}${l.right}`).includes(nq)))
    );
  }, [trades, kind, money, query]);
  const shown = useMemo(() => rows.slice(0, ROW_CAP), [rows]);
  const legRows = useMemo(() => (legTrade ? legTrade.legs.map((_, i) => spreadLegRow(legTrade, i)) : []), [legTrade]);

  /* The search's suggestion rows: one per structure, anchored on its first
     leg — every leg still matches when typed, but tallies count structures. */
  const searchRows = useMemo(
    () => trades.map(t => ({ ticker: t.ticker, strike: t.legs[0].strike, right: t.legs[0].right, premium: t.premium })),
    [trades]
  );

  // Three registers per column — components/trace/earnedInk.ts.
  const marks = useMemo(
    () => ({
      size: earnMarks(shown, t => t.size),
      prem: earnMarks(shown, t => t.premium),
    }),
    [shown]
  );

  /* ReactNode: the largest structure is a door into its own card, whether
     or not the current cut shows it. */
  /* THE SCREENER'S GRAMMAR (Noah, 2026-08-30: "i dont like confusing
     sentences in our website" — holding up "$2.9B across 456 contracts on 22
     names — calls 57% of it, puts 43%" as the model): the total first, the
     split second, one supporting fact. No desk-speak ("structures"), no
     colon-headed puzzles ("The largest: a 1,486× …"). */
  const read = useMemo<ReactNode>(() => {
    if (trades.length === 0) return <RichRead text="No multi-leg trades on the tape yet today." />;
    const byKind = new Map<SpreadKind, number>();
    const names = new Set<string>();
    let prem = 0;
    let paid = 0;
    for (const t of trades) {
      byKind.set(t.kind, (byKind.get(t.kind) ?? 0) + 1);
      names.add(t.ticker);
      prem += t.premium;
      if (t.net >= 0) paid++;
    }
    const loud = [...byKind.entries()].sort((a, b) => b[1] - a[1])[0];
    const big = [...trades].sort((a, b) => b.premium - a.premium)[0];
    return (
      <>
        <RichRead
          text={`${fmtUsd(prem)} across ${trades.length} multi-leg trades on ${names.size} names — ${loud[1]} ${KIND_META[
            loud[0]
          ].label.toLowerCase()}s, ${paid} paid, ${trades.length - paid} collected. Biggest: `}
        />
        <ReadDoor onOpen={() => setDrill(big)}>
          {big.ticker} {KIND_META[big.kind].label.toLowerCase()}
        </ReadDoor>
        <RichRead text={`, ${num(big.size)} of them for [[${fmtUsd(big.premium)}]] ${big.net >= 0 ? 'paid' : 'collected'}.`} />
      </>
    );
  }, [trades]);

  const activeKind = kind === 'ALL' ? null : KIND_META[kind];

  const columns = useMemo<Column<SpreadTrade>[]>(
    () => [
      {
        key: 'time',
        header: 'Time',
        sortValue: t => t.minute,
        render: t => <span className="text-[11px] text-textSecondary">{t.time}</span>,
      },
      {
        key: 'ticker',
        header: 'Ticker',
        sortValue: t => t.ticker,
        render: t => (
          <span className="inline-flex items-center gap-1.5">
            <CompanyLogo ticker={t.ticker} size={15} beside />
            <span className="font-bold text-textPrimary">{t.ticker}</span>
          </span>
        ),
      },
      {
        key: 'kind',
        header: 'Strategy',
        sortValue: t => t.kind,
        render: t => (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-textPrimary">
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: KIND_DOT[t.kind] }} />
            {KIND_META[t.kind].label}
          </span>
        ),
      },
      {
        key: 'strikes',
        header: 'Strikes',
        sortValue: t => t.legs[0].strike,
        /* Every strike is its own door to the tape, white-underlined like the
           contract cell on every other flow page (Noah, 2026-08-30). The ROW
           still opens the structure card — that is this page's own fact — so
           each strike stops the click from reaching it. One button per DISTINCT
           strike, which is exactly what strikesLabel prints. */
        render: t => (
          <span className="inline-flex items-baseline gap-1 font-mono tnum">
            {distinctStrikes(t).map(({ strike, legIdx }, n) => (
              <span key={legIdx} className="inline-flex items-baseline">
                {n > 0 && <span className="text-textMuted mx-1">/</span>}
                <button
                  onClick={e => {
                    e.stopPropagation();
                    setLegTrade(t);
                    setLegKey(`${t.id}-l${legIdx}`);
                  }}
                  title="Open this contract on the tape"
                  className={`font-bold text-textPrimary pb-[2px] ${DOOR} ${DOOR_HOVER_TEXT}`}
                >
                  {strike}
                </button>
              </span>
            ))}
          </span>
        ),
      },
      {
        key: 'exp',
        header: 'Exp',
        /* LEFT, not right (Noah, 2026-08-30: "expirations should be aligned
           beggining first"). The date is the fact you read and it is always the
           same width; the "· 102d" tail is not. Flushing the right edge lined
           up the tails and left the DATES ragged — the wrong thing anchored. */
        sortValue: t => t.dte,
        render: t => (
          <span className="text-textSecondary text-[11px]">
            {t.expiry} <span className="text-textMuted">· {t.dte}d</span>
          </span>
        ),
      },
      {
        key: 'size',
        header: 'Size',
        align: 'right',
        sortValue: t => t.size,
        render: t => <span className={weightInk(t.size, marks.size)}>{num(t.size)}×</span>,
      },
      {
        key: 'net',
        header: 'Net $',
        align: 'right',
        sortValue: t => t.net,
        render: t => (
          <span className="text-textPrimary">
            ${Math.abs(t.net).toFixed(2)}{' '}
            <span className="text-[10px] text-textMuted">{t.net >= 0 ? 'debit' : 'credit'}</span>
          </span>
        ),
      },
      {
        key: 'prem',
        header: 'Premium',
        align: 'right',
        sortValue: t => t.premium,
        render: t => <span className={weightInk(t.premium, marks.prem)}>{fmtUsd(t.premium)}</span>,
      },
      {
        key: 'maxloss',
        header: 'Max loss',
        align: 'right',
        sortValue: t => (t.maxLoss === 'uncapped' ? Number.MAX_SAFE_INTEGER : t.maxLoss),
        render: t => riskCell(t.maxLoss, 'loss'),
      },
      {
        key: 'maxprofit',
        header: 'Max profit',
        align: 'right',
        sortValue: t => (t.maxProfit === 'uncapped' ? Number.MAX_SAFE_INTEGER : (t.maxProfit ?? -1)),
        render: t => riskCell(t.maxProfit, 'profit'),
      },
      {
        key: 'iv',
        header: 'IV',
        align: 'right',
        sortValue: t => t.iv,
        render: t => <span className="text-textPrimary">{t.iv.toFixed(0)}%</span>,
      },
      {
        key: 'delta',
        header: 'Delta',
        align: 'right',
        sortValue: t => t.delta,
        render: t => (
          <span className={t.delta >= 0 ? 'text-bull' : 'text-bear'}>
            {t.delta >= 0 ? '+' : ''}
            {t.delta.toFixed(2)}
          </span>
        ),
      },
      {
        key: 'theta',
        header: 'Theta',
        align: 'right',
        sortValue: t => t.theta,
        render: t => (
          <span className="text-textSecondary">
            {t.theta >= 0 ? '+' : ''}
            {t.theta.toFixed(2)}
          </span>
        ),
      },
      {
        key: 'stock',
        header: 'Stock',
        align: 'right',
        sortValue: t => t.spot,
        render: t => <span className="text-textSecondary">${t.spot.toFixed(2)}</span>,
      },
      {
        key: 'legs',
        header: 'Legs',
        align: 'right',
        sortValue: t => t.legs.length,
        render: t => <span className="text-textPrimary">×{t.legs.length}</span>,
      },
    ],
    []
  );

  /* THE TAPE'S HEAD, THIS PAGE'S RULES (Noah, 2026-08-30): the composition
     strip — facts left, champions as pills right — and the column chooser.
     The bull/bear pills only show when they are not the magenta one. */
  const champs = useMemo(() => {
    const by = (pick: (t: SpreadTrade) => boolean) =>
      shown.filter(pick).reduce<SpreadTrade | null>((a, t) => (a === null || t.premium > a.premium ? t : a), null);
    return { paid: by(t => t.net >= 0), collected: by(t => t.net < 0), all: by(() => true) };
  }, [shown]);
  const facts = useMemo(() => {
    let paid = 0;
    let collected = 0;
    const byKind = new Map<SpreadKind, number>();
    for (const t of trades) {
      if (t.net >= 0) paid++;
      else collected++;
      byKind.set(t.kind, (byKind.get(t.kind) ?? 0) + 1);
    }
    const loud = [...byKind.entries()].sort((a, b) => b[1] - a[1])[0];
    return { paid, collected, loudKind: loud ? KIND_META[loud[0]].label : '', loudCount: loud ? loud[1] : 0 };
  }, [trades]);
  const pill = (t: SpreadTrade) => (
    <>
      {t.ticker} {KIND_META[t.kind].label.toLowerCase()} · {fmtUsd(t.premium)}
    </>
  );
  const { hidden, toggle, showAll, hideAll } = useHiddenColumns('slayer_multileg_cols');
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
          {champs.paid && champs.paid !== champs.all && (
            <FactPill label="Largest paid" ink="bull" onOpen={() => setDrill(champs.paid!)}>
              {pill(champs.paid)}
            </FactPill>
          )}
          {champs.collected && champs.collected !== champs.all && (
            <FactPill label="Largest collected" ink="bear" onOpen={() => setDrill(champs.collected!)}>
              {pill(champs.collected)}
            </FactPill>
          )}
          {champs.all && (
            <FactPill label="Largest" ink="supreme" onOpen={() => setDrill(champs.all!)}>
              {pill(champs.all)}
            </FactPill>
          )}
        </>
      }
    >
      <Fact value={num(trades.length)}>structures today</Fact>
      {facts.loudKind && (
        <Fact value={facts.loudCount}>
          <span className="text-textPrimary">{facts.loudKind}</span>
        </Fact>
      )}
      <span className="font-mono text-[10px] tnum whitespace-nowrap text-textSecondary">
        <span className="text-textPrimary font-semibold">{facts.paid}</span> paid
        <span className="text-textMuted"> · </span>
        <span className="text-textPrimary font-semibold">{facts.collected}</span> collected
      </span>
    </StatsStrip>
  );

  return (
    <>
      <FlowTop hold={holdDoor} strip={strip} tools={tools} hint={<>{activeKind ? `${activeKind.label} — ${activeKind.read}` : 'Every structure on the tape today, newest first'}</>} count={<>{rows.length > ROW_CAP ? `latest ${ROW_CAP} of ${num(rows.length)} today` : `${num(rows.length)} today`}</>} read={read} readLabel="Structure read">
        <FlowSearch value={query} onChange={setQuery} rows={searchRows} countNoun="structures" />
        <FilterDoor live={kind !== 'ALL' || money !== 'ALL'}>
          <FilterSection label="Shape">
            <Chip active={kind === 'ALL'} onClick={() => setKind('ALL')}>
              All shapes
            </Chip>
            {SPREAD_KINDS.map(k => (
              <Chip key={k.key} active={kind === k.key} onClick={() => setKind(k.key)} title={k.read}>
                {k.label}
              </Chip>
            ))}
          </FilterSection>
          <FilterSection label="Money">
            {(['ALL', 'DEBIT', 'CREDIT'] as const).map(m => (
              <Chip key={m} active={money === m} onClick={() => setMoney(m)}>
                {m === 'ALL' ? 'Both' : m === 'DEBIT' ? 'Paid' : 'Collected'}
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
          selectedKey={drill?.id ?? null}
          backToTop
          emptyText="No structures on this cut today"
        />
      </div>

      {drill && <SpreadCard trade={drill} onClose={() => setDrill(null)} />}

      {/* The same contract card the rest of Trace opens — the legs of whichever
          structure the reader reached in through. */}
      <BookDrill
        list={legRows}
        openKey={legKey}
        onOpen={k => {
          setLegKey(k);
          if (k === null) setLegTrade(null);
        }}
        tick={tick}
      />
    </>
  );
};

export default MultiLeg;
