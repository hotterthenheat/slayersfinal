import { useEffect, useMemo, useRef, useState } from 'react';
import { useMarketData } from '../../context/MarketDataContext';
import Simulator from '../../core/simulator';
import { buildVolLab } from '../../data/vollab';
import Panel from '../../components/ui/Panel';
import IvSurface from '../../components/gex/vollab/IvSurface';
import TermStructure from '../../components/gex/vollab/TermStructure';
import RiskNeutralDist from '../../components/gex/vollab/RiskNeutralDist';
import RegimePanel from '../../components/gex/vollab/RegimePanel';

/** Vol analytics recalibrate on the scan tier — surfaces must not flicker per tick. */
const SCAN_INTERVAL_MS = 10_000;

const VolLab = () => {
  const { activeTicker, marketData } = useMarketData();

  const [scanKey, setScanKey] = useState<{ ticker: string; spot: number } | null>(null);
  const [calibratedAt, setCalibratedAt] = useState('');
  const lastScanTimeRef = useRef(0);

  useEffect(() => {
    if (!marketData) return;
    const now = Date.now();
    const due =
      !scanKey ||
      now - lastScanTimeRef.current >= SCAN_INTERVAL_MS ||
      scanKey.ticker !== marketData.ticker;
    if (due) {
      lastScanTimeRef.current = now;
      setScanKey({ ticker: marketData.ticker, spot: marketData.spot });
      setCalibratedAt(new Date(now).toLocaleTimeString('en-GB'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketData]);

  const data = useMemo(() => {
    if (!scanKey) return null;
    const iv = Simulator.TICKERS[scanKey.ticker]?.iv ?? 0.2;
    return buildVolLab(scanKey.ticker, scanKey.spot, iv);
  }, [scanKey]);

  if (!data) {
    return (
      <Panel className="h-64" bodyClassName="flex items-center justify-center">
        <span className="font-mono text-[11px] text-textMuted uppercase tracking-widest">
          Awaiting feed initialization…
        </span>
      </Panel>
    );
  }

  return (
    <>
      {/* Model header */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="inline-flex items-center gap-1.5 border border-borderSubtle bg-panel rounded-md px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-textSecondary">
          Model <span className="text-textPrimary font-semibold">SLAYER-VOL v0.2</span>
          <span className="text-textMuted">· SIM</span>
        </span>
        <span className="font-mono text-[10px] text-textMuted uppercase tracking-widest tnum">
          calibrated {calibratedAt}
        </span>
        <span className="ml-auto font-mono text-[10px] text-textMuted uppercase tracking-widest tnum">
          scan {calibratedAt} · 10s
        </span>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-stretch">
        <Panel
          title="IV Surface"
          subtitle={`${activeTicker} · mid · DTE × moneyness`}
          className="min-w-0"
          bodyClassName="h-[300px]"
        >
          <IvSurface data={data.surface} />
        </Panel>

        <Panel
          title="Volatility Term Structure"
          subtitle="ATM IV vs DTE — current & history"
          className="min-w-0"
          bodyClassName="h-[300px]"
        >
          <TermStructure data={data.term} />
        </Panel>

        <Panel
          title="Risk-Neutral Distribution"
          subtitle="29D options-implied price density"
          className="min-w-0"
          bodyClassName="h-[300px]"
        >
          <RiskNeutralDist data={data.rnd} />
        </Panel>

        <Panel
          title="Volatility State"
          subtitle="calm / normal / stormy odds · 2y lookback"
          className="min-w-0"
          bodyClassName="h-[300px]"
        >
          <RegimePanel data={data.regime} />
        </Panel>
      </div>
    </>
  );
};

export default VolLab;
