/*
==================================================
  SLAYER TERMINAL - NET FLOW (Trace)
  Which way is each name's money leaning (Noah,
  2026-08-30 — the seventh and last expansion page;
  the reference was fully paywalled, so this is
  ours from the ground up).

  Left: THE BOARD — every name ranked most bullish
  to most bearish by net premium (calls bought and
  puts sold vs the reverse), each number produced
  by the SAME series generator that draws the
  chart, so board and chart can never disagree.
  Right: the picked name through the session — its
  own candles as the spot line, net call and put
  washes, cut by moneyness and by tenor.
==================================================
*/

import { useMemo, useState, type ReactNode } from 'react';
import { useMarketData } from '../../context/MarketDataContext';
import Simulator from '../../core/simulator';
import {
  buildFlowBook,
  buildNetLeaders,
  type MoneynessKey,
} from '../../data/flowBook';
import { fmtUsd } from '../../data/gex';
import type { SleeveKey } from '../../types/compass';
import CompanyLogo from '../../components/ui/CompanyLogo';
import RichRead from '../../components/ui/RichRead';
import NetFlowPane, { paneTimes } from '../../components/trace/NetFlowPane';
import { directionInk, earnMarks } from '../../components/trace/earnedInk';
import InkKey from '../../components/trace/InkKey';
import { LiveHold, useHold } from '../../components/trace/LiveHold';
import ReadDoor from '../../components/trace/ReadDoor';

const num = (v: number) => v.toLocaleString('en-US');

const NetFlow = () => {
  const { marketData, activeTicker } = useMarketData();
  const [picked, setPicked] = useState<string | null>(null);
  const [mny, setMny] = useState<MoneynessKey>('all');
  const [tenor, setTenor] = useState<SleeveKey | 'all'>('all');

  const liveBook = useMemo(
    () => buildFlowBook(Simulator.universeQuotes(activeTicker)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeTicker, marketData]
  );
  // The shared hold (see LiveHold): the board's book and the pane's tick
  // freeze together while paused — board and chart stop on one moment.
  const hold = useHold(useMemo(() => ({ book: liveBook, tick: marketData }), [liveBook, marketData]), activeTicker);
  const { book, tick } = hold.value;
  const holdDoor = <LiveHold paused={hold.paused} onToggle={hold.toggle} heldAt={hold.heldAt} />;
  /* Sampled at the chart tape's last bar — the pane beside this board draws
     to the SIM tape's now (~15x wall speed), and a board read at wall-now
     would quote a point hours behind the curve it sits next to. */
  const leaders = useMemo(() => buildNetLeaders(book, paneTimes('SPY').slice(-1)[0]), [book]);

  const sel = picked ?? leaders[0]?.ticker ?? 'SPY';
  const maxAbs = useMemo(() => Math.max(...leaders.map(l => Math.abs(l.net)), 1), [leaders]);
  /* Three registers on the board too: the bulk sits quiet, the loud quintile
     wears its direction, the single biggest lean wears the champion magenta. */
  const netMarks = useMemo(() => earnMarks(leaders, l => l.net), [leaders]);

  /* ReactNode: both named leaders are doors — clicking puts that name on
     the pane, the board's own gesture spoken from the sentence. */
  const read = useMemo<ReactNode>(() => {
    if (leaders.length === 0) return <RichRead text="The book is still waking up." />;
    const total = leaders.reduce((a, l) => a + l.net, 0);
    const top = leaders[0];
    const bottom = leaders[leaders.length - 1];
    // Signed on purpose — RichRead inks +$/-$ by direction (2026-08-30).
    const signed = (v: number) => `${v >= 0 ? '+' : ''}${fmtUsd(v)}`;
    // The board's magenta champion is the larger |net| — the sentence crowns
    // the same figure, so prose and rail can never disagree about who's loudest.
    const topIsChamp = Math.abs(top.net) >= Math.abs(bottom.net);
    const crown = (v: number, champ: boolean) => (champ ? `[[${signed(v)}]]` : signed(v));
    return (
      <>
        <RichRead
          text={`The board's money leans ${total >= 0 ? 'bullish' : 'bearish'} — ${signed(total)} net across ${leaders.length} names. `}
        />
        <ReadDoor onOpen={() => setPicked(top.ticker)} title={`Put ${top.ticker} on the pane`}>
          {top.ticker}
        </ReadDoor>
        <RichRead text={` leads bullish at ${crown(top.net, topIsChamp)}; `} />
        <ReadDoor onOpen={() => setPicked(bottom.ticker)} title={`Put ${bottom.ticker} on the pane`}>
          {bottom.ticker}
        </ReadDoor>
        <RichRead text={` leans hardest bearish at ${crown(bottom.net, !topIsChamp)}.`} />
      </>
    );
  }, [leaders]);

  return (
    <>
      {/* ONE horizontal line (Noah, 2026-08-30: "the live button with the
          words that follow it... including the ink code — they dont seem to
          be on the same horizontal line"): the row centres its three
          members instead of top-aligning them, and the key drops the
          baseline nudge it wore when it sat beside text alone. */}
      <div className="flex items-center gap-3 px-3">
        {holdDoor}
        <div className="text-[13px] text-textPrimary leading-snug flex-1 min-w-0">{read}</div>
        <InkKey />
      </div>

      <div className="flex flex-1 min-h-0 border-t border-borderSubtle">
        {/* THE BOARD — most bullish at the top, most bearish at the floor */}
        <div className="w-[290px] shrink-0 border-r border-borderSubtle overflow-y-auto">
          {leaders.map((l, i) => {
            const isSel = l.ticker === sel;
            return (
              <button
                key={l.ticker}
                onClick={() => setPicked(l.ticker)}
                className={`w-full flex flex-col gap-1 px-3 py-2 border-b border-borderSubtle/60 text-left transition-colors ${
                  isSel ? 'bg-white/[0.05] shadow-[inset_2px_0_0_0_rgba(237,237,237,0.7)]' : 'hover:bg-white/[0.03]'
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className="font-mono text-[9px] text-textMuted tnum w-5">{String(i + 1).padStart(2, '0')}</span>
                  <CompanyLogo ticker={l.ticker} size={15} />
                  <span className="font-mono text-[11px] font-bold text-textPrimary">{l.ticker}</span>
                  <span className={`ml-auto font-mono text-[11px] tnum ${directionInk(l.net, netMarks)}`}>
                    {fmtUsd(l.net)}
                  </span>
                </span>
                <span className="flex items-center gap-2 pl-7">
                  <span className="relative h-0.5 flex-1 rounded-full bg-white/[0.06] overflow-hidden">
                    <span
                      className={`absolute left-0 top-0 h-full ${l.net >= 0 ? 'bg-bull/60' : 'bg-bear/60'}`}
                      style={{ width: `${Math.round((Math.abs(l.net) / maxAbs) * 100)}%` }}
                    />
                  </span>
                  {/* The C and the P wear their side's ink (Noah, 2026-08-30) —
                      the same green and red the pane's legend dots use — so
                      the two figures decode without reading the letter. */}
                  <span className="font-mono text-[9px] text-textMuted tnum whitespace-nowrap">
                    <span className="text-bull">C</span> {fmtUsd(l.netCall)} · <span className="text-bear">P</span>{' '}
                    {fmtUsd(l.netPut)} · {num(l.volume)} vol
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {/* The picked name's session */}
        <div className="flex-1 min-w-0">
          <NetFlowPane
            book={book}
            seg="all"
            mny={mny}
            onSeg={() => {}}
            onMny={setMny}
            tick={tick}
            ticker={sel}
            tenor={tenor}
            onTenor={setTenor}
            dteMax={Infinity}
          />
        </div>
      </div>
    </>
  );
};

export default NetFlow;
