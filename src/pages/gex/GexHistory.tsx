import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMarketData } from '../../context/MarketDataContext';
import { buildGexHistory, type LevelPoint } from '../../data/gexhistory';
import { fmtUsd } from '../../data/gex';
import { CALL_WALL, PUT_WALL, FLIP, KING, SPOT, FOCUS } from '../../components/gex/palette';
import Panel from '../../components/ui/Panel';
import StatCard from '../../components/ui/StatCard';
import MetricGrid from '../../components/ui/MetricGrid';
import SignalBadge from '../../components/ui/SignalBadge';
import SegmentedControl from '../../components/ui/SegmentedControl';
import DataTable, { type Column } from '../../components/ui/DataTable';
import { Play, Pause, SkipBack, SkipForward, ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';

const SERIES = [
  { key: 'callWall', label: 'Call Wall', color: CALL_WALL },
  { key: 'flip', label: 'Flip', color: FLIP },
  { key: 'putWall', label: 'Put Wall', color: PUT_WALL },
  { key: 'king', label: 'King', color: KING },
] as const;

// Event-marker inks — structural events, never a direction call.
const EV_FLIP = FLIP; // baby blue — spot crossing the gamma flip
const EV_GEX = '#FF9500'; // amber warn — net GEX changing sign (regime flip)

type SessionEvent = { i: number; kind: 'flip' | 'gex'; label: string; color: string };

const SPEEDS = [
  { value: '0.5', label: '0.5×' },
  { value: '1', label: '1×' },
  { value: '2', label: '2×' },
  { value: '4', label: '4×' },
] as const;
type SpeedKey = (typeof SPEEDS)[number]['value'];

/** Compact machined transport button. */
const TBtn = ({
  onClick,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
  children: ReactNode;
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
    title={label}
    className="inst-surface rounded-md h-8 w-8 flex items-center justify-center text-textSecondary hover:text-textPrimary hover:bg-white/[0.05] transition-colors disabled:opacity-25 disabled:pointer-events-none"
  >
    {children}
  </button>
);

/** Multi-line session timeline — every structural level plus spot, one SVG. */
const MigrationChart = ({
  points,
  hover,
  cursor,
  events,
  onHover,
  onScrub,
}: {
  points: LevelPoint[];
  hover: number | null;
  cursor: number;
  events: SessionEvent[];
  onHover: (i: number | null) => void;
  onScrub: (i: number) => void;
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
  const idxFrom = (clientX: number, rect: DOMRect) =>
    Math.max(0, Math.min(points.length - 1, Math.round(((clientX - rect.left) / rect.width) * (points.length - 1))));

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full cursor-pointer"
      style={{ height: H }}
      preserveAspectRatio="none"
      onMouseLeave={() => onHover(null)}
      onMouseMove={e => onHover(idxFrom(e.clientX, (e.currentTarget as SVGElement).getBoundingClientRect()))}
      onClick={e => onScrub(idxFrom(e.clientX, (e.currentTarget as SVGElement).getBoundingClientRect()))}
    >
      {/* event markers sit behind the level lines */}
      {events.map(e => (
        <g key={`ev-${e.i}-${e.kind}`}>
          <line x1={X(e.i)} x2={X(e.i)} y1={padY} y2={H - padY} stroke={e.color} strokeOpacity={0.26} strokeWidth={1} strokeDasharray="2 4" />
          <circle cx={X(e.i)} cy={padY} r={2.5} fill={e.color} />
        </g>
      ))}
      <path d={path('spot')} fill="none" stroke={SPOT} strokeOpacity={0.5} strokeWidth={1.25} strokeDasharray="3 3" />
      {SERIES.map(s => (
        <path key={s.key} d={path(s.key)} fill="none" stroke={s.color} strokeWidth={1.75} strokeLinejoin="round" />
      ))}
      {SERIES.map(s => (
        <g key={`tag-${s.key}`}>
          <rect x={W - padR + 2} y={Y(last[s.key] as number) - 7} width={padR - 4} height={14} rx={2} fill={s.color} fillOpacity={0.16} />
          <text x={W - padR + 5} y={Y(last[s.key] as number) + 3} fontSize={10} fill={s.color} fontFamily="monospace">
            {(last[s.key] as number).toFixed(0)}
          </text>
        </g>
      ))}
      {hover !== null && (
        <line x1={X(hover)} x2={X(hover)} y1={padY} y2={H - padY} stroke="#fff" strokeOpacity={0.25} strokeWidth={1} />
      )}
      {/* replay playhead — holo silver selection language */}
      <line x1={X(cursor)} x2={X(cursor)} y1={padY - 8} y2={H - padY} stroke={FOCUS} strokeOpacity={0.9} strokeWidth={1.5} />
      <circle cx={X(cursor)} cy={Y(points[cursor].spot)} r={3.5} fill={FOCUS} />
    </svg>
  );
};

const GexHistory = () => {
  const { marketData } = useMarketData();
  const view = useMemo(() => (marketData ? buildGexHistory(marketData) : null), [marketData]);
  const [hover, setHover] = useState<number | null>(null);
  const [cursor, setCursor] = useState<number | null>(null); // replay playhead; null == now (last)
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<SpeedKey>('1');

  const n = view ? view.points.length : 0;

  // Event indices read straight off the series the page already built — same
  // comparisons the builder counts, surfaced as replay markers (no new math).
  const events = useMemo<SessionEvent[]>(() => {
    if (!view) return [];
    const out: SessionEvent[] = [];
    const pts = view.points;
    for (let i = 1; i < pts.length; i++) {
      if (Math.sign(pts[i].netGex) !== Math.sign(pts[i - 1].netGex)) {
        out.push({ i, kind: 'gex', label: pts[i].netGex >= 0 ? 'Net GEX turned positive' : 'Net GEX turned negative', color: EV_GEX });
      }
      const wasAbove = pts[i - 1].spot >= pts[i - 1].flip;
      const isAbove = pts[i].spot >= pts[i].flip;
      if (wasAbove !== isAbove) {
        out.push({ i, kind: 'flip', label: isAbove ? 'Spot crossed above gamma flip' : 'Spot crossed below gamma flip', color: EV_FLIP });
      }
    }
    return out;
  }, [view]);

  // Advance the playhead across recorded snapshots — never past the last.
  useEffect(() => {
    if (!playing || n === 0) return;
    const id = window.setInterval(() => {
      setCursor(prev => {
        const cur = prev ?? n - 1;
        return cur >= n - 1 ? cur : cur + 1;
      });
    }, 700 / parseFloat(speed));
    return () => window.clearInterval(id);
  }, [playing, speed, n]);

  // Stop when the replay reaches the last recorded snapshot.
  useEffect(() => {
    if (playing && cursor !== null && cursor >= n - 1) setPlaying(false);
  }, [playing, cursor, n]);

  if (!view) {
    return (
      <Panel title="History & Replay">
        <div className="h-40 flex items-center justify-center font-mono text-label uppercase tracking-widest text-textMuted">Reconstructing session…</div>
      </Panel>
    );
  }

  const cursorIdx = cursor ?? n - 1;
  const activeIdx = hover ?? cursorIdx;
  const hp = view.points[activeIdx];
  const widthDelta = view.widthNow - view.widthOpen;
  const loSpot = Math.min(...view.points.map(p => p.spot));
  const hiSpot = Math.max(...view.points.map(p => p.spot));
  const activeEvents = events.filter(e => e.i === activeIdx);
  const sessionDate = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  const scrubTo = (i: number) => {
    setPlaying(false);
    setCursor(Math.max(0, Math.min(n - 1, i)));
  };
  const togglePlay = () => {
    if (playing) return setPlaying(false);
    if (cursorIdx >= n - 1) setCursor(0);
    setPlaying(true);
  };

  const anchors = [
    { label: 'Open', i: 0 },
    { label: 'Mid', i: Math.floor((n - 1) / 2) },
    { label: 'Now', i: n - 1 },
  ];

  const columns: Column<LevelPoint>[] = [
    { key: 'time', header: 'Time', render: p => <span className="font-mono text-caption text-textSecondary tnum leading-4">{p.time}</span> },
    { key: 'spot', header: 'Spot', align: 'right', sortValue: p => p.spot, render: p => <span className="font-mono text-caption text-textPrimary tnum leading-4">${p.spot.toFixed(2)}</span> },
    { key: 'callWall', header: 'Call Wall', align: 'right', sortValue: p => p.callWall, render: p => <span className="font-mono text-caption tnum text-bull leading-4">${p.callWall.toFixed(2)}</span> },
    { key: 'flip', header: 'Flip', align: 'right', sortValue: p => p.flip, render: p => <span className="font-mono text-caption tnum text-flip leading-4">${p.flip.toFixed(2)}</span> },
    { key: 'putWall', header: 'Put Wall', align: 'right', sortValue: p => p.putWall, render: p => <span className="font-mono text-caption tnum text-bear leading-4">${p.putWall.toFixed(2)}</span> },
    { key: 'king', header: 'King', align: 'right', sortValue: p => p.king, render: p => <span className="font-mono text-caption tnum text-king leading-4">${p.king.toFixed(2)}</span> },
    {
      key: 'netGex',
      header: 'Net GEX',
      align: 'right',
      sortValue: p => p.netGex,
      render: p => <span className={`font-mono text-caption tnum ${p.netGex >= 0 ? 'text-bull' : 'text-bear'} leading-4`}>{fmtUsd(p.netGex)}</span>,
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
        <StatCard label="Showing as of" value={hp.time} sub={`spot $${hp.spot.toFixed(2)} · flip $${hp.flip.toFixed(2)}`} tone="select" />
      </MetricGrid>

      {/* ── Replay deck ─────────────────────────────────────────────── */}
      <Panel
        title="Session replay"
        subtitle="step the recorded timeline"
        tone="select"
        actions={
          <span className="inline-flex items-center gap-2 font-mono">
            <span className="text-label uppercase tracking-widest text-textMuted">Showing state as of</span>
            <span className="text-data font-semibold tnum text-select">{hp.time}</span>
          </span>
        }
      >
        <div className="flex flex-col gap-3.5">
          {/* session picker + jump anchors */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex items-center gap-2">
              <span className="font-mono text-label uppercase tracking-widest text-textMuted">Session</span>
              <span className="inline-flex items-center gap-1.5 rounded border border-select/25 bg-select/[0.06] px-2 py-1 font-mono text-caption text-textPrimary">
                <CalendarDays size={12} className="text-select" />
                {sessionDate}
                <span className="text-textMuted">· Regular 09:30–16:00</span>
              </span>
            </div>
            <div className="inline-flex items-center gap-1.5">
              <span className="font-mono text-label uppercase tracking-widest text-textMuted mr-1">Jump</span>
              {anchors.map(a => {
                const active = cursorIdx === a.i && hover === null;
                return (
                  <button
                    key={a.label}
                    onClick={() => scrubTo(a.i)}
                    aria-pressed={active}
                    className={`rounded-md h-7 px-2.5 font-mono text-label uppercase tracking-wider transition-colors border ${
                      active
                        ? 'bg-select/[0.10] text-select border-select/30'
                        : 'bg-white/[0.02] text-textSecondary hover:text-textPrimary border-borderSubtle'
                    }`}
                  >
                    {a.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* transport + speed */}
          <div className="flex flex-wrap items-center gap-2.5">
            <TBtn onClick={() => scrubTo(0)} disabled={cursorIdx === 0} label="Jump to open">
              <SkipBack size={14} />
            </TBtn>
            <TBtn onClick={() => scrubTo(cursorIdx - 1)} disabled={cursorIdx === 0} label="Step back">
              <ChevronLeft size={16} />
            </TBtn>
            <button
              onClick={togglePlay}
              aria-label={playing ? 'Pause replay' : 'Play replay'}
              title={playing ? 'Pause' : 'Play'}
              className="rounded-md h-8 px-3.5 inline-flex items-center gap-1.5 border border-select/30 bg-select/[0.10] text-select hover:bg-select/[0.16] transition-colors font-mono text-label uppercase tracking-wider"
            >
              {playing ? <Pause size={13} /> : <Play size={13} />}
              {playing ? 'Pause' : 'Play'}
            </button>
            <TBtn onClick={() => scrubTo(cursorIdx + 1)} disabled={cursorIdx === n - 1} label="Step forward">
              <ChevronRight size={16} />
            </TBtn>
            <TBtn onClick={() => scrubTo(n - 1)} disabled={cursorIdx === n - 1} label="Jump to now">
              <SkipForward size={14} />
            </TBtn>

            <div className="ml-auto inline-flex items-center gap-2">
              <span className="font-mono text-label uppercase tracking-widest text-textMuted">Speed</span>
              <SegmentedControl<SpeedKey> options={SPEEDS} value={speed} onChange={setSpeed} ariaLabel="Replay speed" />
            </div>
          </div>

          {/* scrubber with event-marker rail */}
          <div>
            <input
              type="range"
              min={0}
              max={n - 1}
              step={1}
              value={cursorIdx}
              onChange={e => scrubTo(parseInt(e.target.value, 10))}
              aria-label="Scrub session timeline"
              className="w-full accent-select cursor-pointer"
            />
            <div className="relative h-3 mt-0.5">
              {events.map(e => (
                <div
                  key={`rail-${e.i}-${e.kind}`}
                  className="absolute top-0 -translate-x-1/2 w-[2px] h-2.5 rounded-full"
                  style={{ left: `${(e.i / (n - 1)) * 100}%`, background: e.color, opacity: 0.85 }}
                  title={`${view.points[e.i].time} — ${e.label}`}
                />
              ))}
            </div>
            <div className="flex items-center justify-between font-mono text-label tnum text-textMuted select-none">
              <span>{view.open.time}</span>
              <span className="uppercase tracking-wider">
                {view.points.length} snapshots · {events.length} events
              </span>
              <span>{view.now.time}</span>
            </div>
          </div>

          {/* legend + current-moment event note */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-0.5 border-t border-borderSubtle">
            <span className="inline-flex items-center gap-1.5 font-mono text-label text-textSecondary">
              <span className="w-2 h-2 rounded-full" style={{ background: EV_FLIP }} /> Flip cross
              <span className="text-textMuted">({view.flipCrosses})</span>
            </span>
            <span className="inline-flex items-center gap-1.5 font-mono text-label text-textSecondary">
              <span className="w-2 h-2 rounded-full" style={{ background: EV_GEX }} /> Net GEX sign flip
              <span className="text-textMuted">({view.netGexFlips})</span>
            </span>
            <span className="ml-auto inline-flex items-center gap-2">
              {activeEvents.length > 0 ? (
                activeEvents.map(e => (
                  <SignalBadge key={e.kind} tone={e.kind === 'gex' ? 'warn' : 'neutral'} dot>
                    {e.label}
                  </SignalBadge>
                ))
              ) : (
                <span className="font-mono text-label text-textMuted">no structural event at this snapshot</span>
              )}
            </span>
          </div>
        </div>
      </Panel>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        <Panel
          title="Level migration timeline"
          subtitle={
            hover !== null
              ? `${hp.time} — inspecting`
              : playing
                ? `${hp.time} — replaying`
                : cursorIdx !== n - 1
                  ? `${hp.time} — paused`
                  : 'call wall · flip · put wall · king vs spot'
          }
          className="xl:col-span-8"
          actions={
            <span className="hidden sm:flex items-center gap-2.5">
              {SERIES.map(s => (
                <span key={s.key} className="inline-flex items-center gap-1 font-mono text-label uppercase tracking-wider text-textMuted">
                  <span className="w-2.5 h-[2px] inline-block" style={{ background: s.color }} /> {s.label}
                </span>
              ))}
            </span>
          }
        >
          <MigrationChart points={view.points} hover={hover} cursor={cursorIdx} events={events} onHover={setHover} onScrub={scrubTo} />
        </Panel>

        <Panel title="How structure moved" subtitle={`open ${view.open.time} → now`} className="xl:col-span-4">
          <div className="flex flex-col gap-3">
            {view.shifts.map(s => (
              <div key={s.label} className="flex items-center justify-between gap-2 border-b border-borderSubtle pb-2.5 last:border-0">
                <span className="font-mono text-label text-textSecondary">{s.label}</span>
                <span className="flex items-center gap-2 font-mono text-caption tnum leading-4">
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
            <p className="text-label text-textMuted leading-relaxed mt-1">
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
          selectedKey={String(activeIdx)}
          onRowClick={p => scrubTo(p.t)}
          initialSort={{ key: 'time', dir: 'desc' }}
          maxHeight="300px"
        />
      </Panel>
    </>
  );
};

export default GexHistory;
