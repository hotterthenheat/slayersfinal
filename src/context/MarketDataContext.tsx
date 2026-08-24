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
}

const MarketDataContext = createContext<MarketDataContextValue | null>(null);

/** How often playback advances one recorded bar. */
const TICK_MS = 1500;

export const MarketDataProvider = ({ children }: { children: React.ReactNode }) => {
  const [activeTicker, setActiveTickerState] = useState<TickerSymbol>(Feed.getActiveTicker());
  const [marketData, setMarketData] = useState<MarketSnapshot | null>(null);
  const tickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const advance = () => Feed.tick(setMarketData);
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
    setMarketData(Feed.snapshotFor(sym));
  };

  return (
    <MarketDataContext.Provider value={{ activeTicker, marketData, changeTicker }}>
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
