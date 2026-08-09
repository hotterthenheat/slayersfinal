import React, { useEffect, useRef } from 'react';
import Panel from '../ui/Panel';
import SpotRule from '../ui/SpotRule';
import { expiryRead } from './setupHorizon';
import type { ChainAction, ChainSide, ContractChain as ContractChainData, Momentum, OptionRight } from '../../types/compass';

export interface ChainSelection {
  ticker: string;
  strike: number;
  right: OptionRight;
}

interface ContractChainProps {
  data: ContractChainData;
  selected: ChainSelection | null;
  onSelect: (sel: ChainSelection) => void;
  /** Which clock these premiums are on — the live tier, unlike the board. */
  freshness?: React.ReactNode;
}

// Neutral is deliberately the quietest tone — signals (green/red) should stand
// out against it, not compete with a bright neutral.
const momentumText: Record<Momentum, string> = {
  STRENGTHENING: 'text-bull',
  NEUTRAL: 'text-textMuted',
  WEAKENING: 'text-bear',
};

// Escalating severity: calm → amber → red. Only the genuinely-bad tier is red,
// so the panel reads as data instead of a wall of alerts.
const actionStyle: Record<ChainAction, string> = {
  HOLD: 'border-borderSubtle text-textSecondary bg-transparent',
  REDUCE: 'border-warn/30 text-warn bg-warn/5',
  SELL: 'border-bear/40 text-bear bg-bear/10 font-semibold',
};

const healthText = (h: number): string => (h >= 56 ? 'text-bull' : h >= 45 ? 'text-textSecondary' : 'text-bear');

interface CellProps {
  side: ChainSide;
  right: OptionRight;
  strike: number;
  ticker: string;
  isSelected: boolean;
  onSelect: () => void;
}

const ChainCell = ({ side, right, strike, ticker, isSelected, onSelect }: CellProps) => {
  const label = `${ticker} ${strike % 1 === 0 ? strike.toFixed(0) : strike.toFixed(2)}${right}`;
  // Premium is a price, not a signal — always neutral. Direction lives in the
  // change %, colored by its actual sign.
  const changeUp = side.changePct >= 0;

  return (
    <button
      onClick={onSelect}
      /* min-h-11 is 44px: these cells measured 104x30, under the 32px hit-area
         floor and well under a finger. Two lines of content already nearly
         fill it, so the floor costs a couple of pixels a row and buys a
         tappable chain. */
      className={`min-h-11 text-left px-2.5 py-2 transition-colors ${
        isSelected ? 'bg-select/[0.07] shadow-[inset_0_0_0_1px_rgba(199,211,232,0.5)]' : 'hover:bg-rowHover'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-label font-semibold text-textPrimary">{label}</span>
        <span className="text-right leading-tight">
          <span className="block font-mono text-label font-semibold tnum text-textPrimary">${side.premium.toFixed(2)}</span>
          <span className={`block font-mono text-micro tnum ${changeUp ? 'text-bull' : 'text-bear'}`}>
            {changeUp ? '+' : ''}{side.changePct}%
          </span>
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="font-mono text-micro text-textMuted uppercase tracking-wide">
          Health <span className={healthText(side.health)}>{side.health}</span>
        </span>
        <span className={`font-mono text-micro uppercase tracking-wide ${momentumText[side.momentum]}`}>
          {side.momentum}
        </span>
        <span
          className={`inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-micro font-semibold uppercase ${actionStyle[side.action]}`}
        >
          {side.action}
        </span>
      </div>
    </button>
  );
};

const ContractChain = ({ data, selected, onSelect, freshness }: ContractChainProps) => {
  const { ticker, spot, rows, expiry, atmIndex } = data;
  const exp = expiryRead(expiry);

  // Find where the live price sits so the marker embeds between strikes
  let spotRowIndex = rows.findIndex(r => r.strike > spot) - 1;
  if (spotRowIndex < -1) spotRowIndex = rows.length - 1; // spot above all strikes

  /*
    Open on the money.

    The chain lists every strike the name has, which is the point — a twelve-row
    window is a chain with the picking already done for you. But a full chain
    starts at the lowest strike, so on SPY the panel opened on 31 rows of deep
    in-the-money calls and the reader had a thousand pixels of scrolling before
    reaching anything anyone trades.

    The chain no longer scrolls inside itself — the page does — so "open on the
    money" now means putting the money-row under the reader's eye in the
    DOCUMENT. Same arithmetic, different scrollport.

    Only on a change of name or expiry: re-centring on every 1.5s repricing
    tick would fight the scrollbar under the user's hand. And only when the row
    is actually off-screen, so landing on the desk does not yank a page the
    reader has not touched yet.
  */
  const listRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const list = listRef.current;
    const row = list?.children[Math.max(0, Math.min(atmIndex, rows.length - 1))] as HTMLElement | undefined;
    if (!list || !row) return;
    const box = row.getBoundingClientRect();
    // BAR_PX is the fixed top bar; below it is the first pixel a reader sees.
    const BAR_PX = 56;
    const onScreen = box.top >= BAR_PX && box.bottom <= window.innerHeight;
    if (onScreen) return;
    window.scrollTo({
      top: Math.max(0, window.scrollY + box.top - (window.innerHeight + BAR_PX) / 2),
      behavior: 'auto',
    });
    // rows.length guards the case where a name's ladder changes shape.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker, expiry, rows.length]);

  return (
    <Panel
      title="Contract Chain"
      /* The expiry leads, because the premiums below are quoted for it and for
         nothing else. Without it the ladder read as a general price list and
         could be compared against a board on a different session — which is
         exactly what it was doing before the chain took the preset's clock. */
      subtitle={exp.chip}
      actions={freshness}
      flush
      className="w-full h-full"
      bodyClassName="flex flex-col"
    >
      {/* Column headers */}
      <div className="grid grid-cols-2 border-b border-borderSubtle">
        <div className="px-3 py-1.5 font-mono text-micro font-semibold uppercase tracking-widest text-bull border-r border-borderSubtle">
          Calls
        </div>
        <div className="px-3 py-1.5 font-mono text-micro font-semibold uppercase tracking-widest text-bear">Puts</div>
      </div>

      {/* Every strike, in page flow. This used to cap at max(560px, 62vh) and
          scroll inside itself, which is the "box inside a box" a full chain is
          worst at: the reader hits the bottom of the document with half the
          ladder still hidden behind an inner scrollbar. The centring effect
          above is what solves the real problem the cap was aimed at — landing
          on the money instead of on 31 rows of deep ITM calls. */}
      <div ref={listRef}>
        {rows.map((row, i) => (
          <div key={row.strike}>
            <div className="grid grid-cols-2 border-b border-borderSubtle/50 divide-x divide-borderSubtle">
              <ChainCell
                side={row.call}
                right="C"
                strike={row.strike}
                ticker={ticker}
                isSelected={selected?.strike === row.strike && selected?.right === 'C'}
                onSelect={() => onSelect({ ticker, strike: row.strike, right: 'C' })}
              />
              <ChainCell
                side={row.put}
                right="P"
                strike={row.strike}
                ticker={ticker}
                isSelected={selected?.strike === row.strike && selected?.right === 'P'}
                onSelect={() => onSelect({ ticker, strike: row.strike, right: 'P' })}
              />
            </div>

            {/* Embedded live-price marker — slides to sit under the strike it just crossed */}
            {i === spotRowIndex && (
              <div className="px-3 py-1">
                <SpotRule ticker={ticker} price={spot} />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Selected footer */}
      <div className="px-3 py-2 border-t border-borderSubtle font-mono text-micro uppercase tracking-widest text-textMuted">
        Selected:{' '}
        <span className="text-textPrimary">
          {selected ? `${selected.ticker} ${selected.strike}${selected.right}` : '—'}
        </span>
      </div>
    </Panel>
  );
};

export default ContractChain;
