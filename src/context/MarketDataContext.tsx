/* eslint-disable react-refresh/only-export-components -- provider component + its consumer hook are colocated by design (the React context pattern); fast-refresh's component-only rule does not apply here. */
import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Simulator from '../core/simulator';
import type { MarketSnapshot, TickerSymbol } from '../types/market';

interface MarketDataContextValue {
  activeTicker: TickerSymbol;
  marketData: MarketSnapshot | null;
  changeTicker: (ticker: string) => void;
}

/**
 * Two contexts, one provider. The market snapshot re-publishes on every 1.5s
 * tick; the ticker identity only changes when the user switches symbols. Splitting
 * them means chrome that only needs the active ticker (AppShell, the nav) no longer
 * re-renders on every price tick — only the handful of components that read
 * `marketData` do. `useMarketData()` still returns all three for the many
 * consumers that genuinely need the live snapshot.
 */
interface TickerContextValue {
  activeTicker: TickerSymbol;
  changeTicker: (ticker: string) => void;
}

const TickerContext = createContext<TickerContextValue | null>(null);
const SnapshotContext = createContext<MarketSnapshot | null>(null);

export const MarketDataProvider = ({ children }: { children: React.ReactNode }) => {
  const [activeTicker, setActiveTickerState] = useState<TickerSymbol>(Simulator.getActiveTicker());
  const [marketData, setMarketData] = useState<MarketSnapshot | null>(null);

  const tickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const processTick = () => Simulator.tick(setMarketData);
    const startSimulator = () => {
      if (tickIntervalRef.current) clearInterval(tickIntervalRef.current);
      processTick();
      tickIntervalRef.current = setInterval(processTick, 1500);
    };
    startSimulator();
    return () => {
      if (tickIntervalRef.current) {
        clearInterval(tickIntervalRef.current);
        tickIntervalRef.current = null;
      }
    };
  }, []);

  // Stable across ticks — identity only changes never (setters are stable), so
  // effects keyed on changeTicker don't re-run every tick.
  const changeTicker = useCallback((ticker: string) => {
    const sym = Simulator.setActiveTicker(ticker);
    setActiveTickerState(sym);
    // Trigger an instant tick for a snappy symbol switch.
    Simulator.tick(setMarketData);
  }, []);

  const tickerValue = useMemo<TickerContextValue>(
    () => ({ activeTicker, changeTicker }),
    [activeTicker, changeTicker],
  );

  return (
    <TickerContext.Provider value={tickerValue}>
      <SnapshotContext.Provider value={marketData}>{children}</SnapshotContext.Provider>
    </TickerContext.Provider>
  );
};

/** Ticker identity + switcher only — does NOT re-render on price ticks. */
export const useTicker = (): TickerContextValue => {
  const context = useContext(TickerContext);
  if (!context) {
    throw new Error('useTicker must be used within a MarketDataProvider');
  }
  return context;
};

/** Full live view (re-renders every tick). Use only where the snapshot is read. */
export const useMarketData = (): MarketDataContextValue => {
  const ticker = useContext(TickerContext);
  const marketData = useContext(SnapshotContext);
  if (!ticker) {
    throw new Error('useMarketData must be used within a MarketDataProvider');
  }
  return { activeTicker: ticker.activeTicker, marketData, changeTicker: ticker.changeTicker };
};
