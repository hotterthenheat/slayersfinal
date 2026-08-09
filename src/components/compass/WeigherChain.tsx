import { useEffect, useMemo, useRef } from 'react';
import { weighContract, type WeighedContract } from '../../core/contractScore';
import type { MarketSnapshot } from '../../types/market';
import SpotRule from '../ui/SpotRule';

/*
==================================================
  SLAYER TERMINAL - WEIGHER CHAIN (compass/WeigherChain.tsx)
  Pick an expiry, then pick a contract off the chain. That is the whole input.

  What this replaces: four popovers and a parsed query string. The Weigher used
  to ask you to *describe* a contract — ticker, strike, side, expiry, each in
  its own picker, each with its own typed/assumed/unknown state — and then told
  you what it had understood. That is a form standing between a trader and a
  chain they already know how to read. Every options desk answers "which
  contract" the same way: here is the ladder, click one.

  So the chain IS the control. Calls on the left, strikes down the middle, puts
  on the right, the live price ruled in where it falls, and one click grades the
  cell you pressed.

  Every cell is a real weighing, not a preview: `weighContract` is the same call
  the grade panel below runs, so what a row shows and what the panel says can
  never drift. It runs 2n times for an n-strike ladder, memoised on the snapshot
  step and the expiry.
==================================================
*/

export interface WeigherChainProps {
  snapshot: MarketSnapshot;
  dte: number;
  /** Currently graded contract, so the chain can mark it. */
  selected: { strike: number; right: 'C' | 'P' } | null;
  onPick: (sel: { strike: number; right: 'C' | 'P' }) => void;
  /** How far either side of spot to list, as a fraction (0.10 = ±10%). */
  reachPct?: number;
}

/** Strike labels drop the decimals whenever the ladder is whole-dollar. */
const fmtStrike = (v: number): string => (v % 1 === 0 ? v.toFixed(0) : v.toFixed(2));

/*
  Verdict ink, not a verdict badge.

  A chain row is already dense; a pill per side would be two more boxes per
  strike and forty more on the ladder. The composite drives the ink on the
  premium instead — BUY reads in the direction's own colour, WATCH stays
  neutral, FADE is muted — so the column scans as a heat column without adding
  a single border.
*/
const premiumInk = (c: WeighedContract): string => {
  if (c.verdict === 'FADE') return 'text-textMuted';
  if (c.verdict === 'WATCH') return 'text-textSecondary';
  return c.right === 'C' ? 'text-bull' : 'text-bear';
};

interface CellProps {
  c: WeighedContract;
  isSelected: boolean;
  onPick: () => void;
  /** Calls read right-to-left so the two sides mirror around the strike. */
  align: 'left' | 'right';
}

const ChainCell = ({ c, isSelected, onPick, align }: CellProps) => {
  const right = align === 'right';
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={isSelected}
      aria-label={`${c.ticker} ${fmtStrike(c.strike)} ${c.right === 'C' ? 'call' : 'put'}, mid $${c.mid.toFixed(2)}, grade ${c.composite}`}
      // min-h-11 is the 44px touch floor; the two lines of content nearly fill
      // it anyway, so it costs a couple of pixels a row and buys a tappable chain.
      className={`min-h-11 w-full px-3 py-1.5 transition-colors ${right ? 'text-right' : 'text-left'} ${
        isSelected ? 'inst-selected' : 'hover:bg-rowHover'
      }`}
    >
      <div className={`flex items-baseline gap-2 ${right ? 'justify-end' : ''}`}>
        <span className={`font-mono text-caption font-semibold tnum ${premiumInk(c)}`}>${c.mid.toFixed(2)}</span>
        <span className="font-mono text-micro tnum text-textMuted">{c.composite}</span>
      </div>
      <div className={`mt-0.5 flex items-center gap-2 font-mono text-micro tnum text-textMuted ${right ? 'justify-end' : ''}`}>
        <span>Δ {Math.abs(c.delta).toFixed(2)}</span>
        <span>{c.ivPct}% IV</span>
        <span className="hidden sm:inline">OI {c.oi >= 1000 ? `${(c.oi / 1000).toFixed(1)}k` : c.oi}</span>
      </div>
    </button>
  );
};

const WeigherChain = ({ snapshot, dte, selected, onPick, reachPct = 0.1 }: WeigherChainProps) => {
  const { ticker, spot } = snapshot;

  /*
    The LISTED strikes, off the snapshot's own chain.

    The first cut of this called `strikeLadder(spot, 1, reachPct)` and that was
    a misread of the helper: its third argument is the ladder's STEP, not its
    reach, so passing 0.12 built nine strikes 12% apart — ±48% of spot. On SPY
    that listed a 618 call at a $0.02 mid as a tradable row. `snapshot.chain` is
    the grid the simulator actually quotes ($1 above $100, $0.50 below), which
    is the same source the desk's own Contract Chain reads, so the two panes
    cannot list different strikes for the same name.
  */
  const strikes = useMemo(
    () =>
      [...snapshot.chain]
        .map(n => n.strike)
        .filter(k => Math.abs(k - spot) / spot <= reachPct)
        .sort((a, b) => a - b),
    [snapshot.chain, spot, reachPct]
  );

  /* One weighing per side per strike — the same call the grade panel makes, so
     a row and the panel below it can never disagree. */
  const rows = useMemo(
    () =>
      strikes.map(strike => ({
        strike,
        call: weighContract(snapshot, 'C', strike, dte),
        put: weighContract(snapshot, 'P', strike, dte),
      })),
    [strikes, snapshot, dte]
  );

  // Where the live price sits, so the rule embeds between the right two rows.
  let spotRowIndex = rows.findIndex(r => r.strike > spot) - 1;
  if (spotRowIndex < -1) spotRowIndex = rows.length - 1;

  /*
    Land on the money.

    A full ladder starts at the lowest strike, so without this the chain opens
    on deep ITM calls and the tradable strikes are a screen down. The page owns
    the scroll (there is no inner scroller here on purpose), so this moves the
    WINDOW — and only when the money row is off-screen, so arriving on the desk
    does not yank a page the reader has not touched.
  */
  const listRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const list = listRef.current;
    const row = list?.children[Math.max(0, Math.min(spotRowIndex, rows.length - 1))] as HTMLElement | undefined;
    if (!list || !row) return;
    const box = row.getBoundingClientRect();
    const BAR_PX = 56;
    if (box.top >= BAR_PX && box.bottom <= window.innerHeight) return;
    window.scrollTo({ top: Math.max(0, window.scrollY + box.top - (window.innerHeight + BAR_PX) / 2), behavior: 'auto' });
    // Only on a change of name or expiry — re-centring on every repricing tick
    // would fight the scrollbar under the reader's hand.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker, dte, rows.length]);

  return (
    <div className="w-full">
      <div className="grid grid-cols-[1fr_auto_1fr] border-y border-borderSubtle">
        <div className="px-3 py-1.5 font-mono text-micro font-semibold uppercase tracking-widest text-bull">Calls</div>
        <div className="px-3 py-1.5 font-mono text-micro font-semibold uppercase tracking-widest text-textMuted text-center">
          Strike
        </div>
        <div className="px-3 py-1.5 font-mono text-micro font-semibold uppercase tracking-widest text-bear text-right">
          Puts
        </div>
      </div>

      <div ref={listRef}>
        {rows.map((row, i) => {
          const itm = row.strike < spot;
          return (
            <div key={row.strike}>
              <div className="grid grid-cols-[1fr_auto_1fr] border-b border-borderSubtle/50">
                <ChainCell
                  c={row.call}
                  align="left"
                  isSelected={selected?.strike === row.strike && selected.right === 'C'}
                  onPick={() => onPick({ strike: row.strike, right: 'C' })}
                />
                {/* The strike column carries the moneyness, which is the one
                    fact that belongs to the row rather than to either side. */}
                <div
                  className={`flex flex-col items-center justify-center px-3 border-x border-borderSubtle/50 ${
                    itm ? 'bg-white/[0.02]' : ''
                  }`}
                >
                  <span className="font-mono text-caption font-semibold tnum text-textPrimary">
                    {fmtStrike(row.strike)}
                  </span>
                  <span className="font-mono text-micro tnum text-textMuted">
                    {(((row.strike - spot) / spot) * 100).toFixed(1)}%
                  </span>
                </div>
                <ChainCell
                  c={row.put}
                  align="right"
                  isSelected={selected?.strike === row.strike && selected.right === 'P'}
                  onPick={() => onPick({ strike: row.strike, right: 'P' })}
                />
              </div>
              {i === spotRowIndex && (
                <div className="px-3 py-1">
                  <SpotRule ticker={ticker} price={spot} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default WeigherChain;
