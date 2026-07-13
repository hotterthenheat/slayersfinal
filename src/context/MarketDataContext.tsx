import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import Simulator from '../core/simulator';
import Auditor from '../core/auditor';
import type { ExecuteResult, LedgerStats, MarketSnapshot, TickerSymbol, TradeRecord } from '../types/market';

interface AuditorState {
  activeTrades: TradeRecord[];
  closedTrades: TradeRecord[];
  stats: LedgerStats;
}

interface MarketDataContextValue {
  activeTicker: TickerSymbol;
  marketData: MarketSnapshot | null;
  auditorState: AuditorState;
  changeTicker: (ticker: string) => void;
  executeTrade: () => ExecuteResult;
  clearLedger: () => void;
}

const MarketDataContext = createContext<MarketDataContextValue | null>(null);

export const MarketDataProvider = ({ children }: { children: React.ReactNode }) => {
  const [activeTicker, setActiveTickerState] = useState<TickerSymbol>(Simulator.getActiveTicker());
  const [marketData, setMarketData] = useState<MarketSnapshot | null>(null);
  const [auditorState, setAuditorState] = useState<AuditorState>({
    activeTrades: [],
    closedTrades: [],
    stats: { winRate: 0, profitFactor: 0, avgAccuracy: 0, totalPnL: 0, count: 0 }
  });

  const tickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Initialize Auditor on Mount
  useEffect(() => {
    Auditor.loadFromStorage();
    updateAuditorState();

    // Start Ticking
    startSimulator();

    return () => {
      stopSimulator();
    };
  }, []);

  const updateAuditorState = () => {
    setAuditorState({
      activeTrades: [...Auditor.getActiveTrades()],
      closedTrades: [...Auditor.getClosedTrades()],
      stats: Auditor.getStats()
    });
  };

  const processTick = () => {
    Simulator.tick((data) => {
      // 1. Update market state
      setMarketData(data);

      // 2. Evaluate open trades
      const currentActiveTicker = Simulator.getActiveTicker();
      Auditor.updateOpenTrades(currentActiveTicker, data.spot);

      // 3. Keep auditor stats in sync
      updateAuditorState();
    });
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
    Simulator.tick((data) => {
      setMarketData(data);
      updateAuditorState();
    });
  };

  const executeTrade = (): ExecuteResult => {
    if (!marketData || !marketData.plan) return { success: false, message: 'No active plan' };
    const res = Auditor.executePlan(marketData.plan);
    updateAuditorState();
    return res;
  };

  const clearLedger = () => {
    Auditor.clearHistory();
    updateAuditorState();
  };

  return (
    <MarketDataContext.Provider value={{
      activeTicker,
      marketData,
      auditorState,
      changeTicker,
      executeTrade,
      clearLedger
    }}>
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
