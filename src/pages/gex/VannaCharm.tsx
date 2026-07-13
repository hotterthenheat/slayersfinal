import { useEffect, useMemo, useRef, useState } from 'react';
import { useMarketData } from '../../context/MarketDataContext';
import { buildVannaCharm } from '../../data/vannacharm';
import Panel from '../../components/ui/Panel';
import SegmentedControl from '../../components/ui/SegmentedControl';
import MigrationMap from '../../components/gex/vannacharm/MigrationMap';
import LevelShiftList from '../../components/gex/vannacharm/LevelShiftList';
import WallDrift from '../../components/gex/vannacharm/WallDrift';
import type { MarketSnapshot } from '../../types/market';
import type { IvShift, ShiftMode } from '../../types/gex';

/** Migration projections sweep on the scan tier. */
const SCAN_INTERVAL_MS = 10_000;

const MODE_OPTIONS = [
  { value: 'CHARM', label: 'Charm · into close' },
  { value: 'VANNA', label: 'Vanna · IV shift' },
] as const;

const IV_OPTIONS = [
  { value: '-2', label: '−2 vol' },
  { value: '-1', label: '−1' },
  { value: '1', label: '+1' },
  { value: '2', label: '+2 vol' },
] as const;

const VannaCharm = () => {
  const { marketData } = useMarketData();
  const [mode, setMode] = useState<ShiftMode>('CHARM');
  const [ivKey, setIvKey] = useState<'-2' | '-1' | '1' | '2'>('-1');

  const [scanSnapshot, setScanSnapshot] = useState<MarketSnapshot | null>(null);
  const [lastScanAt, setLastScanAt] = useState('');
  const scanRef = useRef<MarketSnapshot | null>(null);
  const lastScanTimeRef = useRef(0);

  useEffect(() => {
    if (!marketData) return;
    const now = Date.now();
    const due =
      !scanRef.current ||
      now - lastScanTimeRef.current >= SCAN_INTERVAL_MS ||
      scanRef.current.ticker !== marketData.ticker;
    if (due) {
      scanRef.current = marketData;
      lastScanTimeRef.current = now;
      setScanSnapshot(marketData);
      setLastScanAt(new Date(now).toLocaleTimeString('en-GB'));
    }
  }, [marketData]);

  const data = useMemo(
    () => (scanSnapshot ? buildVannaCharm(scanSnapshot, mode, Number(ivKey) as IvShift) : null),
    [scanSnapshot, mode, ivKey]
  );

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
      {/* Scenario controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <SegmentedControl ariaLabel="Migration mode" options={MODE_OPTIONS} value={mode} onChange={setMode} />
        {mode === 'VANNA' && (
          <SegmentedControl ariaLabel="IV shift" options={IV_OPTIONS} value={ivKey} onChange={setIvKey} />
        )}
        <span className="ml-auto font-mono text-[10px] text-textMuted uppercase tracking-widest tnum">
          scan {lastScanAt} · 10s
        </span>
      </div>

      {/* Migration map + shifts/narrative */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
        <Panel
          title="Exposure Migration Map"
          subtitle={mode === 'CHARM' ? 'net gex — now vs close (charm decay)' : `net gex — now vs iv ${Number(ivKey) > 0 ? '+' : ''}${ivKey} (vanna)`}
          flush
          className="xl:col-span-7 min-w-0"
          bodyClassName="flex flex-col max-h-[560px]"
        >
          <MigrationMap data={data} />
        </Panel>

        <div className="xl:col-span-5 min-w-0 flex flex-col gap-4">
          <Panel title="Level Shifts" subtitle="where the structure moves" flush className="w-full">
            <LevelShiftList shifts={data.shifts} />
          </Panel>
          <Panel title="Migration Read" subtitle="dominant flow, in english" className="w-full flex-1">
            <ul className="flex flex-col gap-2">
              {data.insights.map((line, i) => (
                <li key={i} className="flex items-start gap-2 text-[11px] text-textSecondary leading-relaxed">
                  <span className="text-textMuted mt-px select-none">›</span>
                  <span className="tnum">{line}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>

      {/* Wall drift timeline */}
      <Panel
        title="Wall Drift"
        subtitle="session timeline — walls, flip & spot"
        className="w-full"
        bodyClassName="h-[240px]"
      >
        <WallDrift drift={data.drift} />
      </Panel>
    </>
  );
};

export default VannaCharm;
