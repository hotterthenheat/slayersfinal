import { useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { buildContractFlow } from '../../data/contractflow';
import { fmtUsd } from '../../data/gex';
import { BEAR, BULL, FOCUS, MUTED_INK, SPOT } from '../../components/gex/palette';
import ChartLegend from '../../components/ui/ChartLegend';
import HoverReadout from '../../components/ui/HoverReadout';
import { svgHoverIndex } from '../../components/ui/svgHover';
import type { FlowPrint } from '../../types/flowdesk';

/*
  THIS CONTRACT TODAY — the one series a single print can honestly sit inside.

  A print is a point event, so the drawer's chart has to be about the sequence it
  landed in, not about the underlying. Every fill in this contract's session is
  placed by the premium paid, sized by lots and coloured by aggressor, with the
  clicked print ringed in selection silver at the newest end. That answers three
  things no number in the drawer can: whether this fill is the largest thing that
  happened in the contract today, whether the buyer paid up or caught a dip
  against the session's own average, and whether one side has been pressing all
  day or only just started.

  The x-axis is session ORDER, not a clock. The builder spreads its fills across
  a full 09:30-16:00 grid and pins the clicked print to the last slot, so a
  wall-clock axis would date a 10:52 print to 4:00 PM. Order is true, and it is
  all three of those readings need.

  Hand-rolled: recharts lives in one file repo-wide, and a bubble field under a
  stretched viewBox would render every circle as an ellipse anyway. Marks are
  HTML positioned in percent over the plot, so they stay round and land in the
  accessibility tree; only the rules and the average path are SVG.
*/

/** A mid-market fill has no direction, so it takes the palette's muted ink —
    the exported one, which exists so charts stop forking their own grey. */
const inkOf = (side: string) => (side === 'ASK' ? BULL : side === 'BID' ? BEAR : MUTED_INK);
const verbOf = (side: string) =>
  side === 'ASK' ? 'lifted the offer' : side === 'BID' ? 'hit the bid' : 'crossed at the mid';

/** Percent of plot width for the i-th fill. Inset on the left so the opening mark
    is not clipped, and stopped short of the right so the price tag on the clicked
    print's rule cannot sit on top of the print itself. */
const xPct = (i: number, n: number) => 3 + (n > 1 ? i / (n - 1) : 0.5) * 84;

const PrintSessionChart = ({ print }: { print: FlowPrint }) => {
  const cf = useMemo(() => buildContractFlow(print), [print]);
  const plotRef = useRef<HTMLDivElement | null>(null);
  const [cursor, setCursor] = useState<{ i: number; x: number; y: number; pointer: boolean } | null>(null);

  const pts = cf.points;
  const n = pts.length;
  const lo = cf.priceMin;
  const span = cf.priceMax - cf.priceMin || 1;
  const yPct = (price: number) => 92 - ((price - lo) / span) * 84;

  // Area-proportional, so a 420-lot clip reads as roughly ten times a 40-lot one
  // instead of ten times its width.
  const dia = (size: number) => 6 + 12 * Math.sqrt(size / (cf.volMax || 1));

  const avgNow = cf.avg[cf.avg.length - 1]?.price ?? print.fill;
  const avgPath = cf.avg.map((a, i) => `${i === 0 ? 'M' : 'L'}${xPct(i, n).toFixed(2)},${yPct(a.price).toFixed(2)}`).join(' ');
  const paidUp = print.fill >= avgNow;

  // Largest behind, smallest in front — otherwise a block swallows the fills
  // around it and the sequence stops being readable. The clicked print is forced
  // to the very top whatever it weighs; it is the whole reason the chart is here.
  const order = useMemo(
    () =>
      pts
        .map((_, i) => i)
        .sort((a, b) => (a === n - 1 ? 1 : b === n - 1 ? -1 : pts[b].size - pts[a].size)),
    [pts, n]
  );

  const summary =
    `This contract's session, ${n} fills. ${cf.count.ask} at the offer, ${cf.count.mid} at the mid, ` +
    `${cf.count.bid} at the bid. Premium ran $${cf.priceMin.toFixed(2)} to $${cf.priceMax.toFixed(2)}; ` +
    `size-weighted average $${avgNow.toFixed(2)}. This print, ${print.size.toLocaleString()} lots at ` +
    `$${print.fill.toFixed(2)}, is the newest and sits ${paidUp ? 'above' : 'below'} that average.`;

  const move = (i: number, x: number, y: number, pointer: boolean) => setCursor({ i, x, y, pointer });

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') return setCursor(null);
    const at = cursor?.i ?? n - 1;
    const next =
      e.key === 'ArrowRight' ? Math.min(n - 1, at + 1)
      : e.key === 'ArrowLeft' ? Math.max(0, at - 1)
      : e.key === 'Home' ? 0
      : e.key === 'End' ? n - 1
      : null;
    if (next == null) return;
    e.preventDefault();
    const r = plotRef.current?.getBoundingClientRect();
    move(next, (r?.left ?? 0) + ((xPct(next, n) / 100) * (r?.width ?? 0)), r?.top ?? 0, false);
  };

  const cur = cursor ? pts[cursor.i] : null;

  return (
    <div className="inst-surface rounded-md p-2 flex flex-col gap-1.5" role="group" aria-label="This contract's session">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-micro font-semibold uppercase tracking-widest text-textSecondary">
          This contract today
        </span>
        <span className="font-mono text-micro uppercase tracking-wider text-textMuted tnum">
          {n} fills · Modeled
        </span>
      </div>

      <ChartLegend
        items={[
          { label: `Lifted offer ${cf.count.ask}`, color: BULL, kind: 'dot' },
          { label: `Mid ${cf.count.mid}`, color: MUTED_INK, kind: 'dot' },
          { label: `Hit bid ${cf.count.bid}`, color: BEAR, kind: 'dot' },
          { label: `Session average $${avgNow.toFixed(2)}`, color: SPOT, kind: 'line' },
          { label: 'This print', color: FOCUS, kind: 'dashed' },
        ]}
      />

      <div className="flex items-stretch">
        {/* Premium ruler. HTML, not <text> — the plot's viewBox scales non-uniformly. */}
        <div className="relative w-11 shrink-0 h-[196px]">
          {[cf.priceMax, (cf.priceMax + cf.priceMin) / 2, cf.priceMin].map(v => (
            <span
              key={v}
              className="absolute right-1 -translate-y-1/2 whitespace-nowrap font-mono text-micro tnum text-textMuted"
              style={{ top: `${yPct(v)}%` }}
            >
              {v.toFixed(2)}
            </span>
          ))}
        </div>

        <div
          ref={plotRef}
          tabIndex={0}
          role="img"
          aria-label={summary}
          onMouseMove={e => move(svgHoverIndex(e as MouseEvent, n), e.clientX, e.clientY, true)}
          onMouseLeave={() => setCursor(null)}
          onKeyDown={onKeyDown}
          className="relative flex-1 min-w-0 h-[196px] cursor-crosshair focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-select/60"
        >
          <svg viewBox="0 0 100 100" width="100%" height="100%" preserveAspectRatio="none" aria-hidden="true">
            {[8, 50, 92].map(y => (
              <line
                key={y}
                x1={0}
                x2={100}
                y1={y}
                y2={y}
                stroke="rgba(255,255,255,0.05)"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {/* Where this print landed against everything before it. */}
            <line
              x1={0}
              x2={100}
              y1={yPct(print.fill)}
              y2={yPct(print.fill)}
              stroke={FOCUS}
              strokeOpacity={0.55}
              strokeWidth={1}
              strokeDasharray="4 4"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={avgPath}
              fill="none"
              stroke={SPOT}
              strokeWidth={1.4}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          {order.map(i => {
            const p = pts[i];
            const d = dia(p.size);
            const last = i === n - 1;
            return (
              <span
                key={i}
                aria-hidden="true"
                // Selection silver, as rings rather than an inline shadow: the
                // clicked print needs a knockout gap so its ring reads over the
                // marks it overlaps, and `ring-offset-panel` sources that gap
                // from the surface token instead of a fourth hand-mixed black.
                className={`pointer-events-none absolute rounded-full ${
                  last
                    ? 'ring-2 ring-select ring-offset-2 ring-offset-panel'
                    : cursor?.i === i
                      ? 'ring-[1.5px] ring-select'
                      : ''
                }`}
                style={{
                  left: `${xPct(i, n)}%`,
                  top: `${yPct(p.price)}%`,
                  width: d,
                  height: d,
                  marginLeft: -d / 2,
                  marginTop: -d / 2,
                  background: inkOf(p.side),
                  opacity: last ? 1 : 0.75,
                }}
              />
            );
          })}

          <span
            className="pointer-events-none absolute right-0.5 -translate-y-1/2 inline-flex items-center rounded-[3px] px-1 py-px font-mono text-micro font-bold tnum text-ink"
            style={{ top: `${yPct(print.fill)}%`, background: FOCUS }}
          >
            {print.fill.toFixed(2)}
          </span>
        </div>
      </div>

      <div className="flex items-baseline font-mono text-micro uppercase tracking-wider text-textMuted">
        <span className="w-11 shrink-0" />
        <span className="relative flex-1 min-w-0 h-3">
          <span className="absolute left-0">Session open</span>
          <span
            className="absolute -translate-x-1/2 whitespace-nowrap text-textSecondary"
            style={{ left: `${xPct(n - 1, n)}%` }}
          >
            This print
          </span>
        </span>
      </div>

      {/* Keyboard traversal announces here; the pointer gets the floating card. */}
      <p aria-live="polite" className="min-h-[13px] font-mono text-micro tnum text-textSecondary">
        {cur && !cursor?.pointer
          ? `Fill ${(cursor?.i ?? 0) + 1} of ${n} · $${cur.price.toFixed(2)} · ${cur.size.toLocaleString()} lots · ${verbOf(cur.side)}`
          : ''}
      </p>

      <p className="text-micro leading-relaxed text-textMuted">
        {paidUp
          ? `This fill paid $${(print.fill - avgNow).toFixed(2)} above the contract's size-weighted average for the session.`
          : `This fill came in $${(avgNow - print.fill).toFixed(2)} under the contract's size-weighted average for the session.`}
      </p>

      {cursor?.pointer && cur && (
        <HoverReadout x={cursor.x} y={cursor.y}>
          <div className="font-mono text-micro uppercase tracking-wider text-textMuted">
            Fill {cursor.i + 1} of {n}
          </div>
          <div className="font-mono text-caption font-bold text-textPrimary tnum">
            ${cur.price.toFixed(2)} · {cur.size.toLocaleString()} lots
          </div>
          <div className="mt-0.5 font-mono text-micro" style={{ color: inkOf(cur.side) }}>
            {verbOf(cur.side)}
          </div>
          <div className="font-mono text-micro tnum text-textMuted">{fmtUsd(cur.price * cur.size * 100)} premium</div>
        </HoverReadout>
      )}
    </div>
  );
};

export default PrintSessionChart;
