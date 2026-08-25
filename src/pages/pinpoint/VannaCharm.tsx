import { useEffect, useMemo, useRef, useState } from 'react';
import { useMarketData } from '../../context/MarketDataContext';
import { buildVannaCharm } from '../../data/vannacharm';
import Fact from '../../components/ui/Fact';
import Panel from '../../components/ui/Panel';
import SegmentedControl from '../../components/ui/SegmentedControl';
import Term from '../../components/ui/Term';
import { fmtUsd } from '../../data/gex';
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
      {/* Scenario controls — the page's own names explain themselves */}
      <div className="flex items-center gap-3 flex-wrap">
        <SegmentedControl ariaLabel="Migration mode" options={MODE_OPTIONS} value={mode} onChange={setMode} />
        {mode === 'VANNA' && (
          <SegmentedControl ariaLabel="IV shift" options={IV_OPTIONS} value={ivKey} onChange={setIvKey} />
        )}
        <span className="font-mono text-[10px] uppercase tracking-wider text-textMuted">
          <Term k={mode === 'CHARM' ? 'Charm' : 'Vanna'}>what is {mode === 'CHARM' ? 'charm' : 'vanna'}?</Term>
        </span>
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
          {/* Measurements, not narrative (Mo, 2026-08-19: "walls hold —
              expect the morning structure to govern the close" reads as a
              prediction). Each level with its distance from spot, the charm
              concentration, the biggest mover since the last scan — then ONE
              line stating what this scenario computes. */}
          <Panel title="Migration Read" subtitle="each level, and how far spot sits from it" className="w-full flex-1" bodyClassName="flex flex-col">
            {/* The rows SPREAD over the card's height (the panel is stretched
                to match its column) and the scenario line pins to the floor —
                a stack hugging the top left half the card empty (Noah,
                2026-08-19: "this should fill the card"). */}
            <div className="flex-1 flex flex-col justify-evenly gap-1.5">
              {(
                [
                  { key: 'Gamma flip' as const, label: undefined, l: data.read.flip },
                  { key: 'Call wall' as const, label: undefined, l: data.read.callWall },
                  { key: 'Put wall' as const, label: undefined, l: data.read.putWall },
                  { key: 'Charm' as const, label: 'Largest charm', l: data.read.charm },
                ]
              ).map(row => (
                <Fact
                  key={row.key + (row.label ?? '')}
                  label={<Term k={row.key}>{row.label ?? row.key}</Term>}
                  value={
                    <>
                      {row.l.price % 1 === 0 ? row.l.price.toFixed(0) : row.l.price.toFixed(2)}
                      {/*
                        "from spot", spelled out. This percentage is the level's
                        DISTANCE from spot, and it sat unlabelled directly
                        beside Level Shifts — a panel whose rows report whether
                        a level MOVED. Two adjacent panels, the same four level
                        names, bare signed percentages in both, and one of them
                        saying "holds" while the other showed -0.90%. Both
                        numbers were right; nothing on screen said they measured
                        different things.
                      */}
                      <span className={`font-normal ${row.l.distPct > 0 ? 'text-bull' : row.l.distPct < 0 ? 'text-bear' : 'text-textMuted'}`}>
                        {' '}
                        {row.l.distPct > 0 ? '+' : ''}
                        {row.l.distPct.toFixed(2)}%
                        <span className="text-textMuted"> from spot</span>
                      </span>
                    </>
                  }
                />
              ))}
              {data.read.delta && (
                <Fact
                  label="Moved most since last scan"
                  value={
                    <>
                      {data.read.delta.strike % 1 === 0 ? data.read.delta.strike.toFixed(0) : data.read.delta.strike.toFixed(2)}
                      <span className="font-normal text-textSecondary">
                        {' '}
                        {data.read.delta.changeUsd >= 0 ? '+' : ''}
                        {fmtUsd(data.read.delta.changeUsd)}
                      </span>
                    </>
                  }
                />
              )}
            </div>
            <p className="mt-auto pt-2 border-t border-borderSubtle/60 font-mono text-[10px] text-textMuted tnum shrink-0">
              {data.read.line}
            </p>
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
