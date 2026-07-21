import { useMemo, useState } from 'react';
import { useMarketData } from '../../context/MarketDataContext';
import { buildGexHistory, type LevelPoint } from '../../data/gexhistory';
import { fmtUsd } from '../../data/gex';
import { CALL_WALL, PUT_WALL, FLIP, KING, SPOT } from '../../components/gex/palette';
import Panel from '../../components/ui/Panel';
import StatCard from '../../components/ui/StatCard';
import MetricGrid from '../../components/ui/MetricGrid';
import SignalBadge from '../../components/ui/SignalBadge';
import DataTable, { type Column } from '../../components/ui/DataTable';

const SERIES = [
  { key: 'callWall', label: 'Call Wall', color: CALL_WALL },
  { key: 'flip', label: 'Flip', color: FLIP },
  { key: 'putWall', label: 'Put Wall', color: PUT_WALL },
  { key: 'king', label: 'King', color: KING },
] as const;

/** Multi-line session timeline — every structural level plus spot, one SVG. */
const MigrationChart = ({
  points,
  hover,
  onHover,
}: {
  points: LevelPoint[];
  hover: number | null;
  onHover: (i: number | null) => void;
}) => {
  const W = 1000;
  const H = 340;
  const padL = 4;
  const padR = 56;
  const padY = 16;
  const lo = Math.min(...points.map(p => Math.min(p.putWall, p.spot))) * 0.999;
  const hi = Math.max(...points.map(p => Math.max(p.callWall, p.spot))) * 1.001;
  const X = (i: number) => padL + (i / (points.length - 1)) * (W - padL - padR);
  const Y = (v: number) => padY + (1 - (v - lo) / (hi - lo)) * (H - padY * 2);
  const path = (key: keyof LevelPoint) =>
    points.map((p, i) => `${i === 0 ? 'M' : 'L'}${X(i).toFixed(1)},${Y(p[key] as number).toFixed(1)}`).join(' ');
  const last = points[points.length - 1];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      style={{ height: H }}
      preserveAspectRatio="none"
      onMouseLeave={() => onHover(null)}
      onMouseMove={e => {
        const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
        const rel = (e.clientX - rect.left) / rect.width;
        onHover(Math.max(0, Math.min(points.length - 1, Math.round(rel * (points.length - 1)))));
      }}
    >
      <path d={path('spot')} fill="none" stroke={SPOT} strokeOpacity={0.5} strokeWidth={1.25} strokeDasharray="3 3" />
      {SERIES.map(s => (
        <path key={s.key} d={path(s.key)} fill="none" stroke={s.color} strokeWidth={1.75} strokeLinejoin="round" />
      ))}
      {SERIES.map(s => (
        <g key={`tag-${s.key}`}>
          <rect x={W - padR + 2} y={Y(last[s.key] as number) - 7} width={padR - 4} height={14} rx={2} fill={s.color} fillOpacity={0.16} />
          <text x={W - padR + 5} y={Y(last[s.key] as number) + 3} fontSize={9} fill={s.color} fontFamily="monospace">
            {(last[s.key] as number).toFixed(0)}
          </text>
        </g>
      ))}
      {hover !== null && (
        <line x1={X(hover)} x2={X(hover)} y1={padY} y2={H - padY} stroke="#fff" strokeOpacity={0.25} strokeWidth={1} />
      )}
    </svg>
  );
};

const GexHistory = () => {
  const { marketData } = useMarketData();
  const view = useMemo(() => (marketData ? buildGexHistory(marketData) : null), [marketData]);
  const [hover, setHover] = useState<number | null>(null);

  if (!view) {
    return (
      <Panel title="History & Replay">
        <div className="h-40 flex items-center justify-center font-mono text-xs text-textMuted">Reconstructing session…</div>
      </Panel>
    );
  }

  const hp = hover !== null ? view.points[hover] : view.now;
  const widthDelta = view.widthNow - view.widthOpen;
  const loSpot = Math.min(...view.points.map(p => p.spot));
  const hiSpot = Math.max(...view.points.map(p => p.spot));

  const columns: Column<LevelPoint>[] = [
    { key: 'time', header: 'Time', render: p => <span className="font-mono text-xs text-textSecondary tnum">{p.time}</span> },
    { key: 'spot', header: 'Spot', align: 'right', sortValue: p => p.spot, render: p => <span className="font-mono text-xs text-textPrimary tnum">${p.spot.toFixed(2)}</span> },
    { key: 'callWall', header: 'Call Wall', align: 'right', sortValue: p => p.callWall, render: p => <span className="font-mono text-xs tnum text-bull">${p.callWall.toFixed(2)}</span> },
    { key: 'flip', header: 'Flip', align: 'right', sortValue: p => p.flip, render: p => <span className="font-mono text-xs tnum text-flip">${p.flip.toFixed(2)}</span> },
    { key: 'putWall', header: 'Put Wall', align: 'right', sortValue: p => p.putWall, render: p => <span className="font-mono text-xs tnum text-bear">${p.putWall.toFixed(2)}</span> },
    { key: 'king', header: 'King', align: 'right', sortValue: p => p.king, render: p => <span className="font-mono text-xs tnum text-[#EA00FF]">${p.king.toFixed(2)}</span> },
    {
      key: 'netGex',
      header: 'Net GEX',
      align: 'right',
      sortValue: p => p.netGex,
      render: p => <span className={`font-mono text-xs tnum ${p.netGex >= 0 ? 'text-bull' : 'text-bear'}`}>{fmtUsd(p.netGex)}</span>,
    },
  ];

  return (
    <>
      <MetricGrid min="170px">
        <StatCard
          label="Wall band now"
          value={`$${view.widthNow.toFixed(2)}`}
          sub={`${widthDelta >= 0 ? 'widened' : 'tightened'} ${Math.abs(widthDelta).toFixed(2)} since open`}
          tone={widthDelta <= 0 ? 'bull' : 'warn'}
        />
        <StatCard label="Net GEX" value={fmtUsd(view.now.netGex)} sub={`${view.netGexFlips} sign flips today`} tone={view.now.netGex >= 0 ? 'bull' : 'bear'} />
        <StatCard label="Flip crosses" value={view.flipCrosses} sub="spot crossed the gamma flip" tone={view.flipCrosses > 2 ? 'warn' : 'neutral'} />
        <StatCard label="Session range" value={`$${loSpot.toFixed(2)}–$${hiSpot.toFixed(2)}`} sub={`${view.points.length} snapshots`} />
        <StatCard label="Scrubbed" value={hp.time} sub={`spot $${hp.spot.toFixed(2)} · flip $${hp.flip.toFixed(2)}`} tone="select" />
      </MetricGrid>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        <Panel
          title="Level migration timeline"
          subtitle={hover !== null ? `${hp.time} — scrubbing` : 'call wall · flip · put wall · king vs spot'}
          className="xl:col-span-8"
          actions={
            <span className="hidden sm:flex items-center gap-2.5">
              {SERIES.map(s => (
                <span key={s.key} className="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider text-textMuted">
                  <span className="w-2.5 h-[2px] inline-block" style={{ background: s.color }} /> {s.label}
                </span>
              ))}
            </span>
          }
        >
          <MigrationChart points={view.points} hover={hover} onHover={setHover} />
        </Panel>

        <Panel title="How structure moved" subtitle={`open ${view.open.time} → now`} className="xl:col-span-4">
          <div className="flex flex-col gap-3">
            {view.shifts.map(s => (
              <div key={s.label} className="flex items-center justify-between gap-2 border-b border-borderSubtle pb-2.5 last:border-0">
                <span className="font-mono text-[11px] text-textSecondary">{s.label}</span>
                <span className="flex items-center gap-2 font-mono text-xs tnum">
                  <span className="text-textMuted">${s.from.toFixed(2)}</span>
                  <span className="text-textMuted">→</span>
                  <span className="text-textPrimary">${s.to.toFixed(2)}</span>
                  <SignalBadge tone={Math.abs(s.deltaPct) < 0.05 ? 'neutral' : s.deltaPct >= 0 ? 'bull' : 'bear'}>
                    {s.deltaPct >= 0 ? '+' : ''}
                    {s.deltaPct.toFixed(2)}%
                  </SignalBadge>
                </span>
              </div>
            ))}
            <p className="text-[11px] text-textMuted leading-relaxed mt-1">
              {widthDelta <= 0
                ? 'Dealer walls tightened through the session — a compressing, pin-prone regime into the close.'
                : 'Walls widened as the session ran — structure loosened, giving price more room to trend.'}
            </p>
          </div>
        </Panel>
      </div>

      <Panel title="Session snapshots" subtitle="scrubbable timeline — every captured moment" flush>
        <DataTable
          columns={columns}
          rows={view.points}
          rowKey={p => String(p.t)}
          selectedKey={hover !== null ? String(hover) : null}
          onRowClick={p => setHover(p.t)}
          initialSort={{ key: 'time', dir: 'desc' }}
          maxHeight="300px"
        />
      </Panel>
    </>
  );
};

export default GexHistory;
