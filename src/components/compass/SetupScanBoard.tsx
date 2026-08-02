import { memo, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, SearchX } from 'lucide-react';
import Panel from '../ui/Panel';
import SegmentedControl from '../ui/SegmentedControl';
import EmptyState from '../ui/EmptyState';
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

/* Content height, capped — never a fixed allowance. A box built for fifty rows
   holding eight is the "so much empty space" the scan pane was accused of; a
   cap only bites once there is more than a screenful to hold. */
const SCROLL_CAP = 'max(360px, calc(100vh - 340px))';

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
  selectedId: string | null;
  onSelect: (setup: Setup) => void;
  onStudy: (setup: Setup) => void;
  /** Changes when the scan itself changes, so paging starts from the top again. */
  resetKey: string;
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
  selectedId,
  onSelect,
  onStudy,
  resetKey,
}: SetupScanBoardProps) => {
  const [page, setPage] = useState(0);

  useEffect(() => {
    setPage(0);
  }, [resetKey, layout]);

  const pageCount = Math.max(1, Math.ceil(setups.length / CARDS_PER_PAGE));
  const safePage = Math.min(page, pageCount - 1);
  const pageStart = safePage * CARDS_PER_PAGE;
  const cardPage = setups.slice(pageStart, pageStart + CARDS_PER_PAGE);

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
        key: 'score',
        header: 'Score',
        align: 'right',
        sortValue: s => s.score,
        render: s => <span className="text-textPrimary font-semibold">{s.score}</span>,
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
        <SegmentedControl
          ariaLabel="Scan layout"
          options={SCAN_LAYOUT_OPTIONS}
          value={layout}
          onChange={v => onLayoutChange(v as ScanLayout)}
        />
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
          maxHeight={SCROLL_CAP}
          emptyText="No setups meet this scanner's threshold right now"
        />
      ) : (
        <div className="overflow-y-auto p-2.5" style={{ maxHeight: SCROLL_CAP }}>
          <div className="grid gap-2 sm:grid-cols-2">
            {cardPage.map((setup, i) => (
              <SetupScanCard
                key={setup.id}
                setup={setup}
                rank={pageStart + i + 1}
                selected={selectedId === setup.id}
                onSelect={() => onSelect(setup)}
                onStudy={() => onStudy(setup)}
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
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={safePage === 0}
                aria-label="Previous page of setups"
                className="-my-1 py-1 px-1.5 rounded-md border border-borderSubtle text-textSecondary hover:text-textPrimary hover:border-borderMuted disabled:opacity-40 disabled:hover:text-textSecondary transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}
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
