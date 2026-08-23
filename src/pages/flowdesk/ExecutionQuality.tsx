import { useMemo } from 'react';
import { useMarketData } from '../../context/MarketDataContext';
import { buildSessionTape } from '../../data/flowtape';
import { fmtUsd } from '../../data/gex';
import {
  EXECUTION_GRADE,
  buildExecutionQuality,
  gradeOf,
  type ExecutionCut,
  type PrintExecution,
} from '../../data/executionQuality';
import Panel from '../../components/ui/Panel';
import StatCard from '../../components/ui/StatCard';
import MetricGrid from '../../components/ui/MetricGrid';
import EmptyState from '../../components/ui/EmptyState';
import SignalBadge from '../../components/ui/SignalBadge';
import DataTable, { type Column } from '../../components/ui/DataTable';
import Term from '../../components/ui/Term';
import type { Tone } from '../../components/ui/tones';

/*
==================================================
  SLAYER TERMINAL - EXECUTION QUALITY (flowdesk/ExecutionQuality.tsx)

  What crossing the spread cost, per print and per session.

  docs/DATA-FEASIBILITY.md files this as P0 and says why:
  "You have every quote. Effective spread, quoted spread,
  price improvement vs NBBO, where in the spread each print
  landed, spread cost by strike and expiry. Retail platforms
  never show this because they don't want you to see it."
  Having the OPRA trade AND the NBBO at the same instant is
  the entire requirement, and this entitlement has both.

  WHY THE COLOUR IS NOT GREEN AND RED. Cost is not a
  direction. Green and red are the market's — they mean
  price up and price down everywhere else in this terminal —
  and spending them on "cheap fill / expensive fill" would
  make the same two inks mean two unrelated things on
  adjacent desks. A single amber ramp against the neutral
  family carries magnitude without claiming a direction, and
  amber already means "caution, read this" throughout.
==================================================
*/

/** How far back the session tape is read. Matches the other Trace desks. */
const HOW_FAR_BACK = 400;

/** Rows in the worst-fills table. It is a top list, not a tape. */
const WORST_ROWS = 12;

const gradeTone: Record<ReturnType<typeof gradeOf>, Tone> = {
  MID_OR_BETTER: 'select',
  INSIDE: 'neutral',
  AT_TOUCH: 'neutral',
  OUTSIDE: 'warn',
};

/** Amber ramp for cost. Deliberately one hue — see the header. */
const costFill = (share: number): string =>
  share >= 0.66 ? 'bg-warn/70' : share >= 0.33 ? 'bg-warn/40' : 'bg-textMuted/40';

/**
 * A cut of the session — by expiry, by moneyness — as a bar of basis points.
 *
 * bps, not dollars. Dollars rank by how much traded and would just re-print the
 * volume distribution under a cost heading; basis points say what a dollar of
 * premium PAID in that bucket, which is the comparison the cut exists to make.
 */
const CutList = ({ title, cuts }: { title: string; cuts: ExecutionCut[] }) => {
  const max = Math.max(...cuts.map(c => c.bps), 1);
  return (
    <div className="flex flex-col">
      <div className="px-4 py-2 border-b border-borderSubtle font-mono text-micro uppercase tracking-widest text-textMuted">
        {title}
      </div>
      <ul className="px-4 py-2 flex flex-col gap-1.5">
        {cuts.map(c => (
          <li key={c.key} className="flex items-center gap-3">
            <span className="w-[86px] shrink-0 font-mono text-label uppercase tracking-wider text-textSecondary">
              {c.key}
            </span>
            <span className="relative flex-1 h-[6px] rounded-full bg-white/[0.04] overflow-hidden">
              <span
                className={`absolute inset-y-0 left-0 rounded-full ${costFill(c.bps / max)}`}
                style={{ width: `${Math.max(2, (c.bps / max) * 100)}%` }}
              />
            </span>
            <span className="w-[62px] shrink-0 text-right font-mono text-label tnum text-textPrimary">
              {c.bps.toFixed(0)} bps
            </span>
            <span className="w-[60px] shrink-0 text-right font-mono text-micro tnum text-textMuted">
              {fmtUsd(c.cost)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

const ExecutionQuality = () => {
  const { activeTicker } = useMarketData();

  const view = useMemo(
    () => buildExecutionQuality(buildSessionTape(HOW_FAR_BACK), activeTicker),
    [activeTicker]
  );

  const worst = useMemo(
    () => [...view.rows].sort((a, b) => b.spreadCost - a.spreadCost).slice(0, WORST_ROWS),
    [view.rows]
  );

  if (view.prints === 0) {
    return (
      <Panel title="Execution quality" subtitle={`${activeTicker} · session`}>
        <EmptyState
          title="Nothing to score"
          body="Scoring a fill needs the NBBO that stood beside it. No print on this name's tape carries a two-sided quote yet."
        />
      </Panel>
    );
  }

  const maxBucketPremium = Math.max(...view.buckets.map(b => b.premium), 1);

  const columns: Column<PrintExecution>[] = [
    {
      key: 'time',
      group: 'Print',
      header: 'Time',
      width: '62px',
      sortValue: r => r.print.time,
      render: r => <span className="font-mono text-caption text-textSecondary tnum leading-4">{r.print.time}</span>,
    },
    {
      key: 'contract',
      group: 'Print',
      header: 'Contract',
      sortValue: r => r.print.strike,
      render: r => (
        <span className="font-mono text-caption text-textPrimary tnum leading-4">
          {r.print.strike}
          {r.print.right} · {r.print.dte}d
        </span>
      ),
    },
    {
      key: 'size',
      group: 'Print',
      header: 'Size',
      align: 'right',
      width: '72px',
      sortValue: r => r.print.size,
      render: r => (
        <span className="font-mono text-caption text-textSecondary tnum leading-4">
          {r.print.size.toLocaleString()}
        </span>
      ),
    },
    {
      key: 'quote',
      group: 'Quote',
      header: 'NBBO',
      align: 'right',
      width: '124px',
      sortValue: r => r.quotedSpread,
      render: r => (
        <span className="font-mono text-caption text-textMuted tnum leading-4">
          {r.print.bid.toFixed(2)} / {r.print.ask.toFixed(2)}
        </span>
      ),
    },
    {
      key: 'fill',
      group: 'Quote',
      header: 'Fill',
      align: 'right',
      width: '72px',
      sortValue: r => r.print.fill,
      render: r => (
        <span className="font-mono text-caption text-textPrimary tnum leading-4">{r.print.fill.toFixed(2)}</span>
      ),
    },
    {
      key: 'eq',
      group: 'Cost',
      header: 'E/Q',
      help: 'E/Q',
      align: 'right',
      width: '78px',
      sortValue: r => r.effectiveOverQuoted,
      render: r => (
        <span className="font-mono text-caption tnum leading-4 text-textPrimary">
          {r.effectiveOverQuoted.toFixed(2)}
        </span>
      ),
    },
    {
      key: 'grade',
      group: 'Cost',
      header: 'Landed',
      width: '104px',
      sortValue: r => r.effectiveOverQuoted,
      render: r => {
        const g = gradeOf(r.effectiveOverQuoted);
        return (
          <span title={EXECUTION_GRADE[g].note}>
            <SignalBadge tone={gradeTone[g]}>{EXECUTION_GRADE[g].label}</SignalBadge>
          </span>
        );
      },
    },
    {
      key: 'cost',
      group: 'Cost',
      header: 'Paid to cross',
      align: 'right',
      width: '104px',
      sortValue: r => r.spreadCost,
      render: r => (
        <span className="font-mono text-caption tnum leading-4 text-warn">{fmtUsd(r.spreadCost)}</span>
      ),
    },
  ];

  return (
    <>
      <MetricGrid min="170px">
        <StatCard
          label="Paid to cross"
          value={fmtUsd(view.spreadCost)}
          sub={`${view.costBps.toFixed(0)} bps of ${fmtUsd(view.premium)} premium`}
          tone="warn"
          emphasis
        />
        <StatCard
          label="Effective / quoted"
          value={view.effectiveOverQuoted.toFixed(2)}
          sub="1.00 = paid the full half-spread"
        />
        <StatCard
          label="Crossed at mid"
          value={`${view.midSharePct.toFixed(0)}%`}
          sub="of premium, paying no spread"
        />
        <StatCard
          label="Quoted spread"
          value={`${view.quotedSpreadPct.toFixed(1)}%`}
          sub="of mid, weighted by premium"
        />
        <StatCard
          label="Outside the NBBO"
          value={`${view.outsideSharePct.toFixed(1)}%`}
          sub="of premium filled beyond the quote"
          tone={view.outsideSharePct > 0 ? 'warn' : 'neutral'}
        />
      </MetricGrid>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-start">
        <Panel
          title="Where the fills landed"
          subtitle={`${view.ticker} · premium by distance from the midpoint · ${view.prints} scored prints`}
          flush
          className="lg:col-span-3"
        >
          {/*
            A histogram along ONE axis: how far from the midpoint the fill was,
            as a fraction of the half-spread. 0 is a midpoint cross, 1 is the
            touch, past 1 is outside the NBBO. Height is PREMIUM, not print
            count — a thousand ten-dollar fills at the touch is not the same
            finding as one block there, and counting prints would say it was.
          */}
          <div className="px-4 pt-4 pb-2 flex items-end gap-1 h-[190px]">
            {view.buckets.map(b => {
              const h = (b.premium / maxBucketPremium) * 100;
              const outside = b.hi === Infinity;
              return (
                <div key={b.lo} className="flex-1 flex flex-col justify-end items-center gap-1 h-full">
                  {/* Hidden on a phone. Eleven bands across 358px leaves 32px a
                      column and "$935.6K" needs 34 — the label pushed the last
                      column three pixels past the viewport and gave the page a
                      horizontal scrollbar. The figure is on the bar's own title
                      either way. */}
                  <span className="hidden sm:block font-mono text-micro tnum text-textMuted leading-none">
                    {b.premium > 0 ? fmtUsd(b.premium) : ''}
                  </span>
                  <span
                    className={`w-full rounded-t-sm ${outside ? 'bg-warn/70' : 'bg-textPrimary/30'}`}
                    style={{ height: `${Math.max(b.premium > 0 ? 2 : 0, h)}%` }}
                    title={`${b.prints} prints · ${fmtUsd(b.premium)} premium · ${fmtUsd(b.cost)} paid`}
                  />
                </div>
              );
            })}
          </div>
          <div className="px-4 pb-3 flex items-baseline justify-between font-mono text-micro uppercase tracking-wider text-textMuted">
            <span>At mid · no spread paid</span>
            <span>At the touch</span>
            <span className="text-warn">Outside</span>
          </div>
          <p className="px-4 py-2.5 border-t border-borderSubtle text-label leading-relaxed text-textMuted">
            <span className="font-mono uppercase tracking-wider text-textSecondary mr-2">Reading it</span>
            Each bar is the premium that filled that far from the NBBO midpoint, measured in half-spreads.
            Everything here is arithmetic on four reported fields — bid, ask, fill and size — under the standard
            definitions: effective spread is 2&thinsp;&times;&thinsp;|fill&nbsp;&minus;&nbsp;mid|, and what you
            paid to cross is half of that on every contract. Nothing on this desk is modelled.
          </p>
        </Panel>

        <div className="lg:col-span-2 flex flex-col gap-4">
          <Panel title="What it cost" subtitle="basis points of premium, by bucket" flush>
            <CutList title="By expiry" cuts={view.byExpiry} />
            <div className="border-t border-borderSubtle" />
            <CutList title="By aggressor side" cuts={view.bySide} />
          </Panel>

          <Panel title="The session in one line" tone={view.improvementDollars >= 0 ? 'neutral' : 'warn'}>
            <p className="text-caption leading-relaxed text-textSecondary">
              {view.prints.toLocaleString()} scored prints crossed {fmtUsd(view.premium)} of premium and paid{' '}
              <span className="text-warn tnum">{fmtUsd(view.spreadCost)}</span> in spread —{' '}
              <span className="tnum">{view.costBps.toFixed(0)}</span> basis points. Against paying the full
              half-spread on every one, the tape{' '}
              {view.improvementDollars >= 0 ? 'saved' : 'gave up'}{' '}
              <span className="tnum">{fmtUsd(Math.abs(view.improvementDollars))}</span>.
            </p>
            {view.worst && (
              <p className="mt-3 pt-3 border-t border-borderSubtle text-label leading-relaxed text-textMuted">
                <span className="font-mono uppercase tracking-wider text-textSecondary mr-2">Worst single fill</span>
                {view.worst.print.strike}
                {view.worst.print.right} {view.worst.print.dte}d, {view.worst.print.size.toLocaleString()} lots
                against a {view.worst.print.bid.toFixed(2)}/{view.worst.print.ask.toFixed(2)} quote — filled at{' '}
                {view.worst.print.fill.toFixed(2)} and paid {fmtUsd(view.worst.spreadCost)}.
              </p>
            )}
          </Panel>
        </div>
      </div>

      <Panel
        title="Most expensive fills"
        subtitle={`${view.ticker} · ranked by dollars paid to cross the spread`}
        flush
      >
        <DataTable
          columns={columns}
          rows={worst}
          rowKey={r => String(r.print.id)}
          initialSort={{ key: 'cost', dir: 'desc' }}
        />
        <p className="px-4 py-2.5 border-t border-borderSubtle text-label leading-relaxed text-textMuted">
          <span className="font-mono uppercase tracking-wider text-textSecondary mr-2">A large bill is not a bad fill</span>
          Paying to cross is what a taker does; a block that had to be done pays more than a small order that
          could wait. <Term k="E/Q">E/Q</Term> is the column that removes size from the
          question — it says what fraction of the available spread this print gave up, and 1.00 means it took
          the quote as it stood.
        </p>
      </Panel>
    </>
  );
};

export default ExecutionQuality;
