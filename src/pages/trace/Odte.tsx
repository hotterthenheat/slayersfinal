/*
==================================================
  SLAYER TERMINAL - 0DTE (Trace)
  The same-day money (Noah, 2026-08-30 — expansion
  page 6, from the reference's four fixed charts;
  Noah: "much more modern charts... 4 way 3 way
  2 way or just 1 chart kind of like our terrain
  page"). So: a PANE DESK — one to four NetFlowPanes,
  each its own lens (Everything / SPY / QQQ / single
  names / tech), each with its own moneyness cut and
  fullscreen door. Layout + lenses persist.
==================================================
*/

import { useEffect, useMemo, useState } from 'react';
import { useMarketData } from '../../context/MarketDataContext';
import { LiveHold, useHold } from '../../components/trace/LiveHold';
import InkKey from '../../components/trace/InkKey';
import Simulator from '../../core/simulator';
import { buildFlowBook, buildNetFlowView, type MoneynessKey, type NetFlowSegment } from '../../data/flowBook';
import { fmtUsd } from '../../data/gex';
import Chip from '../../components/ui/Chip';
import RichRead from '../../components/ui/RichRead';
import NetFlowPane, { paneTimes } from '../../components/trace/NetFlowPane';
import ProvenanceChip from '../../components/ui/ProvenanceChip';
import { NearExpiryNote } from '../../components/ui/Confidence';
import { marketPhase } from '../../core/stream';

const STORE_KEY = 'slayer_odte_v1';

interface PaneCfg {
  seg: NetFlowSegment;
  mny: MoneynessKey;
}

interface OdteStore {
  count: 1 | 2 | 3 | 4;
  panes: PaneCfg[];
}

const DEFAULT_STORE: OdteStore = {
  count: 4,
  panes: [
    { seg: 'all', mny: 'all' },
    { seg: 'spy', mny: 'all' },
    { seg: 'qqq', mny: 'all' },
    { seg: 'stocks', mny: 'all' },
  ],
};

const SEGS: NetFlowSegment[] = ['all', 'stocks', 'index-funds', 'spy', 'qqq', 'tech'];
const MNYS: MoneynessKey[] = ['all', 'itm', 'otm', 'atm'];

function loadStore(): OdteStore {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return DEFAULT_STORE;
    const p = JSON.parse(raw) as Partial<OdteStore>;
    const count = ([1, 2, 3, 4] as const).includes(p.count as 1) ? (p.count as OdteStore['count']) : 4;
    const panes = DEFAULT_STORE.panes.map((d, i) => {
      const cfg = Array.isArray(p.panes) ? p.panes[i] : undefined;
      return {
        seg: cfg && SEGS.includes(cfg.seg) ? cfg.seg : d.seg,
        mny: cfg && MNYS.includes(cfg.mny) ? cfg.mny : d.mny,
      };
    });
    return { count, panes };
  } catch {
    return DEFAULT_STORE;
  }
}

const Odte = () => {
  const { marketData, activeTicker } = useMarketData();
  const [store, setStore] = useState<OdteStore>(loadStore);
  const [fsIdx, setFsIdx] = useState<number | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(store));
    } catch {
      /* private mode — layout just doesn't persist */
    }
  }, [store]);

  // Fullscreen: Esc exits, page scroll locks underneath.
  useEffect(() => {
    if (fsIdx === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setFsIdx(null);
    };
    window.addEventListener('keydown', onKey, true);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = '';
    };
  }, [fsIdx]);

  const liveBook = useMemo(
    () => buildFlowBook(Simulator.universeQuotes(activeTicker)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeTicker, marketData]
  );
  // The shared hold (see LiveHold): book and tick freeze together while
  // paused, so every pane stops on the same bar.
  const hold = useHold(useMemo(() => ({ book: liveBook, tick: marketData }), [liveBook, marketData]), activeTicker);
  const { book, tick } = hold.value;
  const holdDoor = <LiveHold paused={hold.paused} onToggle={hold.toggle} heldAt={hold.heldAt} />;

  const read = useMemo(() => {
    const view = buildNetFlowView(book, 'all', 'all', paneTimes('SPY'));
    if (view.points.length === 0) return 'The same-day book is still waking up.';
    const bullish = view.ncp - view.npp >= 0;
    // Signed on purpose — RichRead inks +$/-$ by direction (2026-08-30).
    const signed = (v: number) => `${v >= 0 ? '+' : ''}${fmtUsd(v)}`;
    return `The same-day money leans ${bullish ? 'bullish' : 'bearish'} — net calls ${signed(view.ncp)} against net puts ${signed(
      view.npp
    )} across ${view.count} contracts expiring today.`;
  }, [book]);

  /* Hours to the 16:00 ET cash close, or null when the market is shut. The
     clock is read in ET rather than locally: a reader in London wants New
     York's close, which is the only close these contracts have. */
  const hoursToClose = useMemo(() => {
    if (marketPhase() !== 'rth') return null;
    const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const mins = (16 * 60) - (et.getHours() * 60 + et.getMinutes() + et.getSeconds() / 60);
    return Math.max(0, mins / 60);
  }, []);

  const setPane = (i: number, patch: Partial<PaneCfg>) =>
    setStore(s => ({ ...s, panes: s.panes.map((p, j) => (j === i ? { ...p, ...patch } : p)) }));

  /* The desk fills the frame: the grid takes every pixel down to the viewport
     floor and splits it EQUALLY — 2×2 for four panes, halves for two, one tall
     pane alone (Noah, 2026-08-30: "touch the bottom and in a 4 way split
     equally"). min-h-0 on the cells or the charts refuse to shrink. */
  const gridClass =
    store.count === 1
      ? 'grid grid-cols-1 grid-rows-1'
      : store.count === 2
        ? 'grid grid-cols-1 lg:grid-cols-2 grid-rows-1'
        : 'grid grid-cols-1 lg:grid-cols-2 lg:grid-rows-2';

  // Keyed by count too: a layout switch REMOUNTS the pane so the chart
  // re-fits its new frame instead of hugging the old one's view.
  const renderPane = (i: number, extraClass = '') => (
    <div key={`${store.count}-${i}`} className={`min-h-0 ${extraClass}`}>
      <NetFlowPane
        book={book}
        seg={store.panes[i].seg}
        mny={store.panes[i].mny}
        onSeg={seg => setPane(i, { seg })}
        onMny={mny => setPane(i, { mny })}
        tick={tick}
        /* SAME-DAY MEANS SAME-DAY. The pane's default reach is 1, so this
           page — named 0DTE, subtitled "the same-day money" — was quietly
           showing tomorrow's expiries too, and its own read said "today or
           tomorrow" underneath a heading that said neither. The page is the
           one making the claim, so the page sets the bound. */
        dteMax={0}
        onExpand={() => setFsIdx(i)}
      />
    </div>
  );

  return (
    <>
      <div className="flex items-center justify-between gap-3 px-3">
        <div className="flex items-center gap-3 min-w-0">
          {holdDoor}
          <div className="text-[13px] text-textPrimary leading-snug min-w-0">
            <RichRead text={read} />
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {/* The ink key beside the panes: the volume floor speaks the same
              three registers as the tables now, so the legend belongs here too. */}
          {/* 6.7 — the warning belongs BESIDE the figures, on the page whose
              whole subject is the last day of an option's life. Hours are
              given when the market is open; outside the session there is no
              honest countdown to print, and a stale one would be worse than
              none. */}
          <NearExpiryNote hours={hoursToClose ?? undefined} className="mr-3" />
          <ProvenanceChip
            sources={['prints']}
            note="Same-day premium summed from the print tape. Contracts expiring today only — the pane's reach is bounded to 0 DTE by this page, not by the pane."
            className="mr-3"
          />
          <InkKey className="mr-3" />
          <span className="font-mono text-[9px] uppercase tracking-widest text-textMuted mr-1">Panes</span>
          {([1, 2, 3, 4] as const).map(n => (
            <Chip key={n} active={store.count === n} onClick={() => setStore(s => ({ ...s, count: n }))}>
              {n}
            </Chip>
          ))}
        </div>
      </div>

      <div className={`${gridClass} gap-2 flex-1 min-h-0`}>
        {Array.from({ length: store.count }, (_, i) =>
          // Three panes: the last one stretches the full row.
          renderPane(i, store.count === 3 && i === 2 ? 'lg:col-span-2' : '')
        )}
      </div>

      {fsIdx !== null && (
        <div className="fixed inset-0 z-[80] bg-canvas p-3">
          <NetFlowPane
            book={book}
            seg={store.panes[fsIdx].seg}
            mny={store.panes[fsIdx].mny}
            onSeg={seg => setPane(fsIdx, { seg })}
            onMny={mny => setPane(fsIdx, { mny })}
            tick={tick}
            dteMax={0}
            onExpand={() => setFsIdx(null)}
            expanded
          />
        </div>
      )}
    </>
  );
};

export default Odte;
