/*
==================================================
  SLAYER TERMINAL - SETUP SCAN BOARD (SetupScanBoard.tsx)
  The flat, globally-ranked board for the two-axis scan
  (sleeve × scanner). Cards or table, 24 per page.
  Grouping by ticker retired with the dossiers — rank
  is the organizing principle now; the ticker filter
  upstream is how a user narrows to one name.
==================================================
*/

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Setup } from '../../types/compass';
import Panel from '../ui/Panel';
import CardTabs from '../ui/CardTabs';
import SignalBadge from '../ui/SignalBadge';
import SetupScanCard from './SetupScanCard';
import { processState, PROCESS_META } from './setupProcess';
import { preserveGreek } from '../ui/greek';
import { ROW_INTERACTIVE, interactiveRowProps } from '../ui/interactiveRow';

export type ScanLayout = 'cards' | 'table';

/* 20 per page (10 rows of 2, Noah 2026-08-17): the parent panel stays a
   fixed, scannable height — content scrolls inside it and the pager does the
   walking; the box must never grow with the field. */
const PER_PAGE = 20;

/* One height for BOTH layouts — the board's geometry is a constant of the
   page, never a function of its content. Viewport-relative with a floor. */
const BOARD_HEIGHT = 'max(360px, calc(100vh - 380px))';

const LAYOUT_OPTIONS = [
  { value: 'cards', label: 'Cards' },
  { value: 'table', label: 'Table' },
] as const;

interface SetupScanBoardProps {
  /** Flat, already-ranked (rank = index + 1). */
  setups: Setup[];
  title: string;
  sweepAt: string | null;
  selectedId: string | null;
  onSelect: (setup: Setup) => void;
  onAnalysis: (setup: Setup) => void;
  /** Real-date chip for the active sleeve, e.g. "08/04/26". */
  expiryChip: string;
}

const SetupScanBoard = ({ setups, title, sweepAt, selectedId, onSelect, onAnalysis, expiryChip }: SetupScanBoardProps) => {
  const [layout, setLayout] = useState<ScanLayout>('cards');
  const [page, setPage] = useState(0);

  const pages = Math.max(1, Math.ceil(setups.length / PER_PAGE));
  // A sweep or filter can shrink the list under the current page — clamp,
  // never render an empty page with a working pager.
  useEffect(() => {
    if (page >= pages) setPage(pages - 1);
  }, [page, pages]);

  const start = Math.min(page, pages - 1) * PER_PAGE;
  const slice = setups.slice(start, start + PER_PAGE);

  return (
    <Panel
      title={title}
      actions={
        <div className="flex items-center gap-3">
          {sweepAt && (
            <span className="font-mono text-[10px] text-textMuted uppercase tracking-wider">
              Sweep <span className="text-textSecondary tnum">{sweepAt}</span>
            </span>
          )}
          {/* Child tier (Noah, 2026-08-17): in-panel controls wear the
              underline glide, never the parent pill rail. */}
          <CardTabs
            ariaLabel="Board layout"
            options={LAYOUT_OPTIONS}
            value={layout}
            onChange={v => setLayout(v as ScanLayout)}
          />
        </div>
      }
    >
      {setups.length === 0 ? (
        <div className="flex items-center justify-center" style={{ height: BOARD_HEIGHT }}>
          <p className="font-mono text-[11px] text-textSecondary px-1 text-center">
            Nothing cleared the bar on this sweep — an empty board is a read, not an error.
          </p>
        </div>
      ) : layout === 'cards' ? (
        /* FIXED height, not a cap — cards and table must occupy the IDENTICAL
           box so switching layouts never moves the row's bottom edge, and the
           right rail (absolute-inset) adopts this exact height (Noah,
           2026-08-05: "the gap changes again"). Content scrolls inside; the
           pager lives OUTSIDE the scroll, always in reach. */
        <div key="cards" className="overflow-y-auto pr-1 animate-soft-in" style={{ height: BOARD_HEIGHT }}>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {slice.map((s, i) => (
              <SetupScanCard
                key={s.id}
                setup={s}
                rank={start + i + 1}
                selected={s.id === selectedId}
                onSelect={onSelect}
                onAnalysis={onAnalysis}
                expiryChip={expiryChip}
              />
            ))}
          </div>
        </div>
      ) : (
        <div key="table" className="overflow-auto animate-soft-in" style={{ height: BOARD_HEIGHT }}>
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-borderSubtle">
                {['#', 'Contract', 'Expiry', 'State', '1σ move', 'Premium', 'Breaks at'].map(h => (
                  <th key={h} className="font-mono text-[9px] uppercase tracking-wider text-textMuted font-medium px-2 py-2">
                    {preserveGreek(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slice.map((s, i) => {
                const state = processState(s);
                const meta = PROCESS_META[state];
                const isCall = s.right === 'C';
                return (
                  <tr
                    key={s.id}
                    onClick={() => onSelect(s)}
                    {...interactiveRowProps(() => onSelect(s), s.id === selectedId, 'native')}
                    className={`border-b border-borderSubtle/50 transition-colors ${ROW_INTERACTIVE} ${
                      s.id === selectedId ? 'bg-white/[0.05]' : 'hover:bg-white/[0.02]'
                    }`}
                  >
                    <td className="font-mono text-[10px] text-textMuted px-2 py-2 tnum">{start + i + 1}</td>
                    <td className={`font-mono text-[12px] font-semibold px-2 py-2 ${isCall ? 'text-bull' : 'text-bear'}`}>
                      {s.contract}
                    </td>
                    <td className="font-mono text-[11px] text-textSecondary px-2 py-2">
                      {s.expiry} · {expiryChip}
                    </td>
                    <td className="px-2 py-2">
                      <SignalBadge tone={meta.tone} dot pulse={meta.pulse}>
                        {state}
                      </SignalBadge>
                    </td>
                    <td className="font-mono text-[11px] text-textPrimary px-2 py-2 tnum">±{s.sigmaMovePct}%</td>
                    <td className="font-mono text-[11px] text-textPrimary px-2 py-2 tnum">${s.mid.toFixed(2)}</td>
                    <td className="font-mono text-[11px] text-warn px-2 py-2 tnum">${s.invalidationPrice.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Always rendered — a pager row that appears and disappears with the
          page count would change the panel's height, the exact wobble this
          box exists to prevent. Buttons only show when there is a walk. */}
      <div className="flex items-center justify-end gap-2 pt-3 min-h-[34px]">
        <span className="font-mono text-[10px] text-textMuted tnum">
          {setups.length === 0
            ? '0 setups'
            : `${start + 1}–${Math.min(start + PER_PAGE, setups.length)} of ${setups.length}`}
        </span>
        {pages > 1 && (
          <>
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="p-1 rounded border border-borderSubtle text-textSecondary hover:text-textPrimary disabled:opacity-30 transition-colors"
              aria-label="Previous page"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setPage(p => Math.min(pages - 1, p + 1))}
              disabled={page >= pages - 1}
              className="p-1 rounded border border-borderSubtle text-textSecondary hover:text-textPrimary disabled:opacity-30 transition-colors"
              aria-label="Next page"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>
    </Panel>
  );
};

export default SetupScanBoard;
