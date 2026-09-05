import { useEffect, useMemo, useRef, useState } from 'react';
import DataState from '../../components/ui/DataState';
import { useMarketData } from '../../context/MarketDataContext';
import CharmClockStrip from '../../components/gex/CharmClockStrip';
import { RTH_MINUTES } from '../../core/calendar';
import { buildVannaCharm } from '../../data/vannacharm';
import { readSessionClock } from '../../data/moc';
import Fact from '../../components/ui/Fact';
import Panel from '../../components/ui/Panel';
import SegmentedControl from '../../components/ui/SegmentedControl';
import Term from '../../components/ui/Term';
import ProvenanceChip from '../../components/ui/ProvenanceChip';
import { fmtUsd } from '../../data/gex';
import MigrationMap from '../../components/gex/vannacharm/MigrationMap';
import LevelShiftList from '../../components/gex/vannacharm/LevelShiftList';
import WallDrift from '../../components/gex/vannacharm/WallDrift';
import NetGexDrift from '../../components/gex/vannacharm/NetGexDrift';
import { buildNetGexSeries } from '../../data/gexSeries';
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

  /*
    THE LIVE CLOCK, and this is the half that makes P-0 real.

    `readSessionClock` has existed in `data/moc.ts` — timezone-correct for any
    viewer, holiday-aware, already computing the seconds to the 16:00 cross —
    and rendered NOWHERE. The charm projection meanwhile ran on a hardcoded
    three hours, so 09:35 and 15:55 drew the same map.

    Read on the SCAN tier rather than per render: the page already rebuilds its
    view when `scanSnapshot` changes, and re-reading the wall clock on every
    render would make this memo useless while moving the map by a second's
    worth of decay each time. A charm map that shifts under the cursor is
    noise, not freshness.

    Zero outside a live session is the honest answer, not a floor: after the
    bell there IS no charm left to come, and the projection collapsing onto the
    current map is what that means.
  */
  const hoursToClose = useMemo(() => {
    const clock = readSessionClock();
    return clock.secondsToClose / 3600;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanSnapshot]);

  const data = useMemo(
    () =>
      scanSnapshot
        ? buildVannaCharm(scanSnapshot, mode, Number(ivKey) as IvShift, 10, hoursToClose)
        : null,
    [scanSnapshot, mode, ivKey, hoursToClose]
  );

  /* P-3's series, on the page's own scan tier — keyed on the snapshot so the
     two timelines below always show the same session at the same moment. */
  const netSeries = useMemo(
    () => (scanSnapshot ? buildNetGexSeries(scanSnapshot.ticker) : null),
    [scanSnapshot]
  );

  if (!data) {
    return (
      <Panel className="w-full">
        <DataState kind="loading" title="Reading the book" body="The first tick has not arrived yet." />
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
        {/* P-1's chip — the last tab that stated no basis. Chain + exposure,
            same pair the Exposure Profile wears: every number here is the
            modelled book re-priced under a vanna/charm shift. */}
        <ProvenanceChip
          sources={['chain', 'exposure', 'carry']}
          className="ml-auto"
          note="Vanna and charm are both rate-sensitive: the discount factor sits inside every one of these numbers, so the carry curve is a source here whether or not it is the headline."
        />
        <span className="font-mono text-[10px] text-textMuted uppercase tracking-widest tnum">
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
          {/*
            P-15. IN THE READ COLUMN, not above the map — and that placement
            is a measured constraint, not a preference. Sat above the grid it
            pushed the migration map's lowest rows below the fold at 1440x900
            and 1280x800, and the sweep caught it: hovering those rows
            produced no read-out card because the pointer was moving to a
            coordinate off-screen. Here it costs the map no vertical space at
            all, and it sits with the other things this column measures.

            It reads the SAME hoursToClose the map is projected through, so
            the two cannot disagree about what time it is — which was the
            whole point of P-0 making the clock real.
          */}
          <Panel title="Charm Clock" subtitle="how much of today's decay has been paid" className="w-full">
            <CharmClockStrip elapsedMinutes={RTH_MINUTES - hoursToClose * 60} />
          </Panel>
          <Panel title="Level Shifts" subtitle="where the structure moves" flush className="w-full">
            <LevelShiftList shifts={data.shifts} />
          </Panel>
          {/* Measurements, not narrative (Mo, 2026-08-19: "walls hold —
              expect the morning structure to govern the close" reads as a
              prediction). Each level with its distance from spot, the charm
              concentration, the biggest mover since the last scan — then ONE
              line stating what this scenario computes. */}
          <Panel title="Migration Read" subtitle="the structure, measured" className="w-full flex-1" bodyClassName="flex flex-col">
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
                      <span className={`font-normal ${row.l.distPct > 0 ? 'text-bull' : row.l.distPct < 0 ? 'text-bear' : 'text-textMuted'}`}>
                        {' '}
                        {row.l.distPct > 0 ? '+' : ''}
                        {row.l.distPct.toFixed(2)}%
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

      {/* The session, twice over: WHERE the levels moved, and whether the
          gamma behind them GREW or DRAINED — different facts (a pin can turn
          into a trend with nothing moving on the drift at all), so they sit
          side by side over one time axis. Stacked below xl, like the panels
          above them. */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Panel
          title="Wall Drift"
          subtitle="session timeline — walls, flip & spot"
          className="w-full min-w-0"
          bodyClassName="h-[240px]"
        >
          <WallDrift drift={data.drift} />
        </Panel>
        {/* P-3 — the total through the session. Its own scan-tier build off
            the SAME cadence as the page's (the memo keys on scanSnapshot), so
            the two timelines can never show different sessions. */}
        <Panel
          title="Net GEX"
          subtitle="session timeline — the whole book's total, and its sign"
          className="w-full min-w-0"
          bodyClassName="h-[240px]"
        >
          {/* netSeries is null only while `data` is too, and that state returns
              above — but the guard stays local rather than relying on the
              ordering of two memos. */}
          {netSeries && <NetGexDrift series={netSeries} />}
        </Panel>
      </div>
    </>
  );
};

export default VannaCharm;
