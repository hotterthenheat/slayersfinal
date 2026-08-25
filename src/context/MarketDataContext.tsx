import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import Feed from '../core/feed';
import type { MarketSnapshot, TickerSymbol } from '../types/market';

/*
==================================================
  SLAYER TERMINAL - MARKET CONTEXT (MarketDataContext.tsx)

  Holds the active name and the latest snapshot, and
  owns the one clock that advances playback.
==================================================
*/

interface MarketDataContextValue {
  activeTicker: TickerSymbol;
  marketData: MarketSnapshot | null;
  changeTicker: (ticker: string) => void;
  /**
   * True once the ACTIVE name's recording has played out — its price has
   * stopped moving and will not move again. The desk went on looking live
   * long after it had stopped being it, and nothing said so.
   *
   * Deliberately not `Feed.atEnd()`, which is true only when EVERY recording
   * has finished. Playback starts at 0.8 of each recording, so the four
   * watchlist names (1950 bars, starting at 1561) have 389 bars of runway and
   * the other eighteen (390 bars, starting at 313) have 77. Ticked headless:
   * a short name pins at tick 77 — one minute fifty-four — while `atEnd()`
   * stays false until tick 389, nine minutes forty-four. Driving a header
   * label off it would leave TSLA's price frozen and unremarked for nearly
   * eight minutes because SPY is still playing. Read per-name instead, from
   * the snapshot the UI already has.
   */
  recordingEnded: boolean;
}

const MarketDataContext = createContext<MarketDataContextValue | null>(null);

/** How often playback advances one recorded bar. */
const TICK_MS = 1500;

export const MarketDataProvider = ({ children }: { children: React.ReactNode }) => {
  const [activeTicker, setActiveTickerState] = useState<TickerSymbol>(Feed.getActiveTicker());
  const [marketData, setMarketData] = useState<MarketSnapshot | null>(null);
  const [recordingEnded, setRecordingEnded] = useState(false);
  const tickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /*
    HOW A PLAYED-OUT RECORDING IS RECOGNISED, WITHOUT ASKING THE FEED.

    `snapshotFor` returns `priceHistory` as `bars.slice(0, playhead + 1)`, so
    its length IS the playhead, and `tick` pins the playhead at the last bar
    once it gets there. A length that repeats is a recording that has ended;
    there is no ambiguity to guess at, and no new feed export to add.

    Comparing the price itself would not do: two consecutive recorded bars can
    close at the same number while playback is still running.

    Two repeats rather than one, and the ticker compared as well, so switching
    to a name whose recording happens to be the same length cannot read as a
    freeze. Not latched — it does not need to be. A pinned playhead keeps
    repeating, and the one thing that legitimately un-freezes the header is
    switching to a name that still has bars left.
  */
  const seenRef = useRef({ ticker: '', bars: -1, repeats: 0 });
  const noteSnapshot = (snap: MarketSnapshot) => {
    const seen = seenRef.current;
    const bars = snap.priceHistory.length;
    if (snap.ticker !== seen.ticker || bars !== seen.bars) seen.repeats = 0;
    else seen.repeats += 1;
    seen.ticker = snap.ticker;
    seen.bars = bars;
    setRecordingEnded(seen.repeats >= 2);
    setMarketData(snap);
  };

  useEffect(() => {
    const advance = () => Feed.tick(noteSnapshot);
    advance();
    tickIntervalRef.current = setInterval(advance, TICK_MS);
    return () => {
      if (tickIntervalRef.current) clearInterval(tickIntervalRef.current);
      tickIntervalRef.current = null;
    };
  }, []);

  /*
    Switching name reads the CURRENT instant — it does not advance the clock.

    This used to call `Feed.tick()` for a snappy transition, which moved the
    playhead a bar and consumed four tape prints every time you changed ticker.
    Looking at a different instrument is not time passing: clicking through six
    names in the picker would have jumped playback six bars ahead of the
    interval that is supposed to own it, and silently eaten 24 prints the tape
    would then never show.
  */
  const changeTicker = (ticker: string) => {
    const sym = Feed.setActiveTicker(ticker);
    setActiveTickerState(sym);
    noteSnapshot(Feed.snapshotFor(sym));
  };

  return (
    <MarketDataContext.Provider value={{ activeTicker, marketData, changeTicker, recordingEnded }}>
      {children}
    </MarketDataContext.Provider>
  );
};

export const useMarketData = (): MarketDataContextValue => {
  const context = useContext(MarketDataContext);
  if (!context) {
    throw new Error('useMarketData must be used within a MarketDataProvider');
  }
  return context;
};
