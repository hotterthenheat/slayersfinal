import React, { memo, useMemo } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, SearchX } from 'lucide-react';
import Panel from '../ui/Panel';
import SegmentedControl from '../ui/SegmentedControl';
import EmptyState from '../ui/EmptyState';
import VerdictBadge from './VerdictBadge';
import DataTable, { type Column } from '../ui/DataTable';
import { StateBadge } from './StateBadge';
import { setupState, STATE_META } from './setupState';
import SetupScanCard from './SetupScanCard';
import { expiryRead } from './setupHorizon';
import type { Setup } from '../../types/compass';

export type ScanLayout = 'cards' | 'table';

/** The user's words, not ours. "List" is what a developer calls a stack of cards. */
const SCAN_LAYOUT_OPTIONS = [
  { value: 'cards', label: 'Cards' },
  { value: 'table', label: 'Table' },
] as const;

/** A page of twelve rows of two: a screenful you can actually read, out of the
    couple of hundred a sweep now admits. */
const CARDS_PER_PAGE = 24;

/* No height cap and no scroller of its own.

   There was one — `max(360px, calc(100vh - 340px))` — and it made the board a
   box inside the page: a reader who scrolled the window hit the bottom of the
   document with the board's own list still holding rows, then had to find the
   inner scrollbar and start again. The page paginates at CARDS_PER_PAGE, which
   is the actual answer to "a couple of hundred rows"; a second, invisible
   window on top of the pagination was doing nothing the pager did not.

   The table branch drops its cap for the same reason. */

interface SetupScanBoardProps {
  /** Flat and already globally ranked — best in the scan first. */
  setups: Setup[];
  /** Everything the sweep found, before the ticker filter. */
  totalFound: number;
  scannerLabel: string;
  /** The expiry range this preset actually selected, e.g. "0DTE". */
  expiryLabel: string;
  layout: ScanLayout;
  onLayoutChange: (layout: ScanLayout) => void;
  /**
   * Controlled by Compass, not held here.
   *
   * Review mode swaps this whole board out for the SignalMonitor, so local page
   * state was destroyed on unmount: browse to row 60, open a setup, come back,
   * and you were on page 1 with the contract you had just been reading three
   * pages away. Every other piece of browse state already lived in the page.
   */
  page: number;
  onPageChange: (page: number) => void;
  /** Rendered in the panel header — which clock these rows are on. */
  freshness?: React.ReactNode;
  selectedId: string | null;
  onSelect: (setup: Setup) => void;
  onStudy: (setup: Setup) => void;
}

/**
 * The scan layer, in both of its densities.
 *
 * Cards and Table are two readings of one list, so they live in one panel with
 * the switch in its header rather than in a metadata strip on the far side of
 * the screen — the control now sits on the thing it changes. Both densities show
 * the same fields for the same reason: a preset is a filter over one
 * presentation, so Top Setups, Quick Scalp, Discounted, Rebounds, Whale Sweeps
 * and All cannot look like different products.
 */
const SetupScanBoard = ({
  setups,
  totalFound,
  scannerLabel,
  expiryLabel,
  layout,
  onLayoutChange,
  page,
  onPageChange,
  freshness,
  selectedId,
  onSelect,
  onStudy,
}: SetupScanBoardProps) => {
  /*
    The board no longer resets its own paging.

    It used to, on a `resetKey` effect — but review mode unmounts this component,
    so the effect fired again on the way back and sent the user to page 1 with
    the setup they had just been reading three pages away. An effect keyed on
    "what changed" cannot tell a change from a remount. Compass owns the page
    number and zeroes it at the three places a scan actually changes, which is
    where the decision belongs.
  */

  const pageCount = Math.max(1, Math.ceil(setups.length / CARDS_PER_PAGE));
  const safePage = Math.min(page, pageCount - 1);
  const pageStart = safePage * CARDS_PER_PAGE;
  const cardPage = setups.slice(pageStart, pageStart + CARDS_PER_PAGE);

  /*
    Chips every card on THIS PAGE is wearing.

    Measured on a normal scan: all four visible cards came back
    TREND ALIGNED · AT THE MONEY · 1σ CLEARS BREAKEVEN · TIGHT BOOK, 4 of 4
    identical. The chips are computed per contract and each one is true — but a
    label that is on every card separates none of them, and repeating it down
    the page is the decoration this field was cleaned up for once already.

    Scoped to the PAGE rather than the whole scan, because the page is what a
    reader is comparing. Two cards is not a pattern, so the rule only applies
    once there are enough cards for "they all say this" to mean anything.
  */
  const commonChips = useMemo(() => {
    /*
      The slice is taken INSIDE the memo, and that is the fix rather than a
      tidy-up. `cardPage` is a `.slice()` — a new array object every render — so
      a memo depending on it can never hit: the intersection re-ran on every
      render and handed every card a fresh `Set` identity, defeating the memo it
      was written to be. Depending on `[setups, safePage]` while READING
      `cardPage` would compute the right answer and lie to the linter about it;
      recomputing the slice here makes the dependencies honest and complete.
    */
    const page = setups.slice(safePage * CARDS_PER_PAGE, safePage * CARDS_PER_PAGE + CARDS_PER_PAGE);
    if (page.length < 3) return undefined;
    const [first, ...rest] = page;
    const shared = new Set(first.whyChips);
    for (const s of rest) {
      const own = new Set(s.whyChips);
      for (const c of [...shared]) if (!own.has(c)) shared.delete(c);
    }
    return shared.size ? shared : undefined;
  }, [setups, safePage]);

  const columns: Column<Setup>[] = useMemo(
    () => [
      {
        key: 'contract',
        header: 'Contract',
        sortValue: s => s.contract,
        render: s => (
          <span className="inline-flex items-center gap-2">
            <span className={`inline-block w-1.5 h-1.5 rounded-full ${s.right === 'C' ? 'bg-bull' : 'bg-bear'}`} />
            <span className="text-textPrimary font-semibold">{s.contract}</span>
          </span>
        ),
      },
      {
        // Date AND dte, the same chip the card carries — nothing on this desk
        // should leave a trader guessing which session a contract dies in.
        key: 'expiry',
        header: 'Expiry',
        help: 'DTE',
        sortValue: s => expiryRead(s.expiry).dte,
        render: s => <span className="text-textSecondary">{expiryRead(s.expiry).chip}</span>,
      },
      {
        key: 'state',
        header: 'State',
        sortValue: s => STATE_META[setupState(s)].rank,
        render: s => <StateBadge state={setupState(s)} />,
      },
      {
        /* The read, not the grade. `setup.score` is a 0-100 figure with nothing
           measured behind its weights; the verdict is the same read at a
           precision three coarse bands can carry. The sort still runs on the
           number, because a board ordered by a tag alone collapses every
           QUALIFIED into one indistinguishable block — and a hidden ordering key
           is a far weaker claim than a printed grade. */
        key: 'score',
        header: 'Read',
        align: 'right',
        sortValue: s => s.score,
        render: s => <VerdictBadge verdict={s.verdict} />,
      },
      {
        key: 'move',
        header: '1σ Move',
        align: 'right',
        sortValue: s => s.expectedMovePct,
        render: s => <span className="text-textPrimary">±{s.expectedMovePct}%</span>,
      },
      {
        key: 'mid',
        header: 'Mid',
        align: 'right',
        sortValue: s => s.mid,
        render: s => <span className="text-textPrimary">${s.mid.toFixed(2)}</span>,
      },
      {
        key: 'health',
        header: 'Health',
        align: 'right',
        sortValue: s => s.health,
        render: s => (
          <span className="text-textSecondary">
            {s.health}
            <span className="text-textMuted">/100</span>
          </span>
        ),
      },
      /* No Evidence column. The chips come from the scanner's own thesis
         library, so all 240 rows carried the identical three badges — three
         wrapped lines of row height, per row, restating what the tab above
         already says. They live on the card, where a per-contract set would
         show if the engine ever varies them, and in full analysis. */
      {
        key: 'invalidation',
        header: 'Breaks At',
        align: 'right',
        sortValue: s => s.invalidationPrice,
        render: s => (
          <span className="inline-flex items-center gap-1.5 text-warn" title={s.invalidationReason}>
            <AlertTriangle className="w-3 h-3 shrink-0" />
            {s.right === 'C' ? 'below' : 'above'} ${s.invalidationPrice.toFixed(2)}
          </span>
        ),
      },
    ],
    []
  );

  /* The panel is content-height under a cap, so it cannot leave a void — but a
     thin scan is still a fact about the market, and a fact gets said out loud
     rather than left as three rows floating in a box. */
  const status =
    setups.length < 6
      ? `Only ${setups.length} contract${setups.length === 1 ? '' : 's'} came back on this sweep. The All preset widens the scan.`
      : layout === 'table'
        ? `${setups.length} ranked rows. Any header re-ranks all of them.`
        : null;

  return (
    <Panel
      flush
      title={scannerLabel}
      subtitle={`${expiryLabel ? `${expiryLabel} · ` : ''}${setups.length} of ${totalFound}`}
      className="w-full"
      actions={
        <div className="flex items-center gap-2">
          {freshness}
          <SegmentedControl
            ariaLabel="Scan layout"
            options={SCAN_LAYOUT_OPTIONS}
            value={layout}
            onChange={v => onLayoutChange(v as ScanLayout)}
          />
        </div>
      }
    >
      {setups.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="Nothing clears this floor"
          body={`No contract met the ${scannerLabel} threshold on the last sweep. Try All, or wait for the next scan.`}
        />
      ) : layout === 'table' ? (
        /* One sorted body rather than pages: a header sort has to rank the whole
           scan, not whichever slice a pager happened to be showing. The sticky
           head and the cap carry the length.

           The selected row keeps DataTable's `inst-selected` rail. That marker
           is deliberate here and gone from the card: a 2px rail is what a
           selected row looks like in every table in this app, whereas on a card
           it was a third selection signal stacked on a border and a wash, and
           the loudest mark on the screen belonged to something nobody clicked. */
        <DataTable
          columns={columns}
          rows={setups}
          rowKey={s => s.id}
          onRowClick={onSelect}
          selectedKey={selectedId}
          initialSort={{ key: 'score', dir: 'desc' }}
          emptyText="No setups meet this scanner's threshold right now"
        />
      ) : (
        <div className="p-2.5">
          {/* Said once, where a fact about the whole board belongs, so removing
              it from every card hides nothing. */}
          {commonChips && (
            <p className="mb-2.5 font-mono text-micro uppercase tracking-wider text-textMuted">
              Every contract on this page:{' '}
              <span className="text-textSecondary">{[...commonChips].join(' · ')}</span>
            </p>
          )}
          {/* The cards are listitems, so the thing holding them has to be a
              list — an orphaned listitem is dropped from the tree entirely. */}
          <div role="list" aria-label="Ranked contracts" className="grid gap-2 sm:grid-cols-2">
            {cardPage.map((setup, i) => (
              <SetupScanCard
                key={setup.id}
                setup={setup}
                rank={pageStart + i + 1}
                selected={selectedId === setup.id}
                onSelect={() => onSelect(setup)}
                onStudy={() => onStudy(setup)}
                commonChips={commonChips}
              />
            ))}
          </div>
        </div>
      )}

      {setups.length > 0 && (status || (layout === 'cards' && pageCount > 1)) && (
        <div className="flex items-center gap-3 flex-wrap border-t border-borderSubtle px-3 py-2">
          {status && <span className="font-mono text-label text-textMuted">{status}</span>}
          {layout === 'cards' && pageCount > 1 && (
            <div className="ml-auto flex items-center gap-2">
              <span className="font-mono text-label text-textMuted uppercase tracking-wider tnum">
                {pageStart + 1}-{Math.min(pageStart + CARDS_PER_PAGE, setups.length)} of {setups.length}
              </span>
              <button
                onClick={() => onPageChange(Math.max(0, safePage - 1))}
                disabled={safePage === 0}
                aria-label="Previous page of setups"
                className="-my-1 py-1 px-1.5 rounded-md border border-borderSubtle text-textSecondary hover:text-textPrimary hover:border-borderMuted disabled:opacity-40 disabled:hover:text-textSecondary transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onPageChange(Math.min(pageCount - 1, safePage + 1))}
                disabled={safePage >= pageCount - 1}
                aria-label="Next page of setups"
                className="-my-1 py-1 px-1.5 rounded-md border border-borderSubtle text-textSecondary hover:text-textPrimary hover:border-borderMuted disabled:opacity-40 disabled:hover:text-textSecondary transition-colors"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
};

/* Memoised: the scan re-ranks on the 10s sweep, not on the 1.5s price tick, and
   a table of a couple of hundred rows is not something to reconcile six times a
   sweep for prices none of its cells show. Every prop Compass hands in is a
   stable identity for exactly this reason. */
export default memo(SetupScanBoard);
