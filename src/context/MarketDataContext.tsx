import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import Simulator from '../core/simulator';
import type { MarketSnapshot, TickerSymbol } from '../types/market';

interface MarketDataContextValue {
  activeTicker: TickerSymbol;
  marketData: MarketSnapshot | null;
  changeTicker: (ticker: string) => void;
}

const MarketDataContext = createContext<MarketDataContextValue | null>(null);

export const MarketDataProvider = ({ children }: { children: React.ReactNode }) => {
  const [activeTicker, setActiveTickerState] = useState<TickerSymbol>(Simulator.getActiveTicker());
  const [marketData, setMarketData] = useState<MarketSnapshot | null>(null);

  const tickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    startSimulator();
    return () => {
      stopSimulator();
    };
  }, []);

  const processTick = () => {
    Simulator.tick(setMarketData);
  };

  const startSimulator = () => {
    if (tickIntervalRef.current) clearInterval(tickIntervalRef.current);
    processTick();
    tickIntervalRef.current = setInterval(processTick, 1500);
  };

  const stopSimulator = () => {
    if (tickIntervalRef.current) {
      clearInterval(tickIntervalRef.current);
      tickIntervalRef.current = null;
    }
  };

  const changeTicker = (ticker: string) => {
    const sym = Simulator.setActiveTicker(ticker);
    setActiveTickerState(sym);
    // Trigger instant tick for snappy UI transition
    Simulator.tick(setMarketData);
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
