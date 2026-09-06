import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { buildEarningsCalendar } from '../../data/earnings';
import { buildIpoCalendar, isPending } from '../../data/ipo';
import { macroCards } from '../../data/macroDetail';
import Panel from '../ui/Panel';
import DataState from '../ui/DataState';
import ProvenanceChip from '../ui/ProvenanceChip';
import WatchButton from '../ui/WatchButton';

/*
==================================================
  SLAYER TERMINAL - WHAT IS COMING (components/earnings/UnifiedCalendar.tsx)
  Part 9.4 — earnings, listings and the macro prints, on one date line.
==================================================

  Three calendars lived on two pages and never met. A reader planning a week
  had to hold the earnings slate on this page, the listings panel below it
  and the FOMC/CPI/NFP dates on the macro desk in their head, and the one
  question that matters — what is happening on Thursday — could not be
  asked anywhere.

  ── WHY ALL THREE MACRO PRINTS, AND NO IMPORTANCE TIER ────────────────────

  The checklist asks for "high-importance econ releases". This desk carries
  exactly three kinds — the rate decision, CPI and payrolls — and all three
  ARE the high-importance tier; there is no medium or low here to filter
  out. A tier control with one value in it teaches a reader the calendar is
  deeper than it is, so the copy says which three rather than pretending to
  rank them.

  ── DEAD ROWS DO NOT TRAVEL ───────────────────────────────────────────────

  A withdrawn listing keeps its date, and on the calendars it comes from
  that is the point — the row survives so a reader does not assume they
  missed it. Here it is dropped: this list answers "what is ahead", and a
  deal that is not happening is not ahead of anybody. The listings panel
  below is where a pulled deal is read.
*/

type Kind = 'earnings' | 'listing' | 'macro';

interface Row {
  key: string;
  kind: Kind;
  iso: string;
  daysOut: number;
  title: string;
  detail: string;
  href: string | null;
  /** A company this row is about, when it is about one. A macro print is not. */
  ticker: string | null;
}

const KIND_WORDS: Record<Kind, { label: string; ink: string }> = {
  earnings: { label: 'Earnings', ink: 'text-textPrimary' },
  listing: { label: 'Listing', ink: 'text-select' },
  macro: { label: 'Macro', ink: 'text-warn' },
};

/** Sessions-out for earnings, calendar days for the other two — labelled per row. */
const whenWords = (kind: Kind, n: number): string => {
  if (n === 0) return 'today';
  const unit = kind === 'earnings' ? (n === 1 ? 'session' : 'sessions') : n === 1 ? 'day' : 'days';
  return `in ${n} ${unit}`;
};

const UnifiedCalendar = ({ className = '' }: { className?: string }) => {
  const navigate = useNavigate();
  const [kinds, setKinds] = useState<Set<Kind>>(new Set<Kind>(['earnings', 'listing', 'macro']));

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];

    for (const e of buildEarningsCalendar()) {
      if (e.daysOut < 0) continue;
      out.push({
        key: `e-${e.ticker}`,
        kind: 'earnings',
        iso: e.dateLabel,
        daysOut: e.daysOut,
        title: `${e.ticker} reports`,
        detail: `${e.name} · ${e.slot === 'BMO' ? 'before the open' : 'after the close'} · ±${e.impliedMovePct.toFixed(1)}% priced${e.confirmed ? '' : ' · date still an estimate'}`,
        href: `/earnings/${e.ticker}`,
        ticker: e.ticker,
      });
    }

    for (const d of buildIpoCalendar()) {
      /* Only what is still ahead. A withdrawn deal keeps its date on the
         listings panel so nobody assumes they missed it; it does not belong
         on a list that answers "what is coming". */
      if (!isPending(d.status) || d.daysOut < 0) continue;
      out.push({
        key: `i-${d.id}`,
        kind: 'listing',
        iso: d.date,
        daysOut: d.daysOut,
        title: `${d.ticker} lists`,
        detail: `${d.name} · ${d.exchange}${d.rangeLow !== null && d.rangeHigh !== null ? ` · $${d.rangeLow}–$${d.rangeHigh} filed` : ''} · no options for about ${d.chainEta ?? 5} more sessions`,
        href: null,
        ticker: d.ticker,
      });
    }

    for (const m of macroCards()) {
      if (m.past || m.daysOut < 0) continue;
      out.push({
        key: `m-${m.iso}-${m.kind}`,
        kind: 'macro',
        iso: m.iso,
        daysOut: m.daysOut,
        title: m.label,
        detail: `${m.blurb} · consensus ${m.consensus}${m.unit}`,
        href: '/macro',
        /* A rate decision is not a company. Nothing to keep. */
        ticker: null,
      });
    }

    return out.sort((a, b) => a.daysOut - b.daysOut || a.title.localeCompare(b.title));
  }, []);

  const shown = rows.filter(r => kinds.has(r.kind));
  const counts = useMemo(() => {
    const c: Record<Kind, number> = { earnings: 0, listing: 0, macro: 0 };
    for (const r of rows) c[r.kind] += 1;
    return c;
  }, [rows]);

  const toggle = (k: Kind) =>
    setKinds(cur => {
      const next = new Set(cur);
      /* Never empty. Turning the last kind off leaves a reader looking at a
         blank panel wondering whether the week is quiet or the control is
         broken, so the last one on stays on. */
      if (next.has(k) && next.size > 1) next.delete(k);
      else next.add(k);
      return next;
    });

  /* Group by date so the answer to "what is happening Thursday" is one line
     of the page rather than a scan. */
  const days = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of shown) m.set(r.iso, [...(m.get(r.iso) ?? []), r]);
    return [...m.entries()];
  }, [shown]);

  return (
    <Panel
      title="What is coming"
      subtitle="earnings, new listings and the three macro prints this desk carries — one date line, ahead only"
      className={className}
      actions={
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-0.5" role="group" aria-label="Event kinds">
            {(Object.keys(KIND_WORDS) as Kind[]).map(k => (
              <button
                key={k}
                type="button"
                onClick={() => toggle(k)}
                aria-pressed={kinds.has(k)}
                title={kinds.has(k) && kinds.size === 1 ? 'The last kind stays on — an empty calendar reads as a fault' : undefined}
                className={`px-2 py-1 rounded font-mono text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                  kinds.has(k) ? `bg-white/[0.07] ${KIND_WORDS[k].ink}` : 'text-textMuted hover:text-textSecondary'
                }`}
              >
                {KIND_WORDS[k].label} {counts[k]}
              </button>
            ))}
          </div>
          <ProvenanceChip sources={['earnings', 'macro']} note="Earnings dates and implied moves from the earnings engine; listings from the IPO engine; FOMC from the published calendar, payrolls by the first-Friday rule, CPI approximated." />
        </div>
      }
    >
      {days.length === 0 ? (
        <DataState kind="empty" title="Nothing ahead on these kinds" body="Turn another kind back on, or the window really is quiet." pad="sm" />
      ) : (
        <div className="flex flex-col" data-unified-calendar>
          {days.map(([iso, items]) => (
            <div key={iso} className="grid grid-cols-1 sm:grid-cols-[132px_minmax(0,1fr)] gap-x-5 gap-y-1 py-2 border-b border-borderSubtle/60 last:border-0">
              <div className="flex sm:flex-col gap-x-2 gap-y-0.5 items-baseline sm:items-start">
                <span className="font-mono text-[12px] tnum text-textPrimary">{iso}</span>
                <span className="font-mono text-[10px] uppercase tracking-wider text-textMuted">{whenWords(items[0].kind, items[0].daysOut)}</span>
              </div>
              <ul className="flex flex-col gap-1 min-w-0">
                {items.map(r => (
                  <li key={r.key} className="min-w-0 flex items-start gap-1">
                    {/* Only the rows that are about a company get a star; a
                        macro print is a date, not a name a reader can keep. */}
                    {r.ticker ? <WatchButton ticker={r.ticker} className="mt-[1px] shrink-0" /> : <span className="w-6 shrink-0" />}
                    {r.href ? (
                      <button
                        type="button"
                        onClick={() => navigate(r.href!)}
                        className="w-full text-left grid grid-cols-[64px_minmax(0,1fr)] gap-2 items-baseline py-0.5 rounded-sm hover:bg-white/[0.03] transition-colors"
                        data-event-kind={r.kind}
                      >
                        <span className={`font-mono text-[10px] uppercase tracking-wider ${KIND_WORDS[r.kind].ink}`}>{KIND_WORDS[r.kind].label}</span>
                        <span className="min-w-0">
                          <span className="text-[13px] text-textPrimary">{r.title}</span>
                          <span className="block text-[11px] text-textMuted leading-snug">{r.detail}</span>
                        </span>
                      </button>
                    ) : (
                      <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-2 items-baseline py-0.5" data-event-kind={r.kind}>
                        <span className={`font-mono text-[10px] uppercase tracking-wider ${KIND_WORDS[r.kind].ink}`}>{KIND_WORDS[r.kind].label}</span>
                        <span className="min-w-0">
                          <span className="text-[13px] text-textPrimary">{r.title}</span>
                          <span className="block text-[11px] text-textMuted leading-snug">{r.detail}</span>
                        </span>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
};

export default UnifiedCalendar;
