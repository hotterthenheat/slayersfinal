import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import Simulator from '../core/simulator';
import Ledger from '../core/ledger';
import type { ExecuteResult, LedgerStats, MarketSnapshot, TickerSymbol, TradeRecord } from '../types/market';

interface LedgerState {
  activeTrades: TradeRecord[];
  closedTrades: TradeRecord[];
  stats: LedgerStats;
}

interface MarketDataContextValue {
  activeTicker: TickerSymbol;
  marketData: MarketSnapshot | null;
  ledgerState: LedgerState;
  changeTicker: (ticker: string) => void;
  executeTrade: () => ExecuteResult;
  clearLedger: () => void;
}

const MarketDataContext = createContext<MarketDataContextValue | null>(null);

export const MarketDataProvider = ({ children }: { children: React.ReactNode }) => {
  const [activeTicker, setActiveTickerState] = useState<TickerSymbol>(Simulator.getActiveTicker());
  const [marketData, setMarketData] = useState<MarketSnapshot | null>(null);
  const [ledgerState, setLedgerState] = useState<LedgerState>({
    activeTrades: [],
    closedTrades: [],
    stats: { winRate: 0, profitFactor: 0, avgAccuracy: 0, totalPnL: 0, count: 0 }
  });

  const tickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Initialize Ledger on Mount
  useEffect(() => {
    Ledger.loadFromStorage();
    updateLedgerState();

    // Start Ticking
    startSimulator();

    return () => {
      stopSimulator();
    };
  }, []);

  const updateLedgerState = () => {
    setLedgerState({
      activeTrades: [...Ledger.getActiveTrades()],
      closedTrades: [...Ledger.getClosedTrades()],
      stats: Ledger.getStats()
    });
  };

  const processTick = () => {
    Simulator.tick((data) => {
      // 1. Update market state
      setMarketData(data);

      // 2. Evaluate open trades
      const currentActiveTicker = Simulator.getActiveTicker();
      Ledger.updateOpenTrades(currentActiveTicker, data.spot);

      // 3. Keep ledger stats in sync
      updateLedgerState();
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
      updateLedgerState();
    });
  };

  const executeTrade = (): ExecuteResult => {
    if (!marketData || !marketData.plan) return { success: false, message: 'No active plan' };
    const res = Ledger.executePlan(marketData.plan);
    updateLedgerState();
    return res;
  };

  const clearLedger = () => {
    Ledger.clearHistory();
    updateLedgerState();
  };

  return (
    <MarketDataContext.Provider value={{
      activeTicker,
      marketData,
      ledgerState,
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
