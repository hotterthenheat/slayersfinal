/*
==================================================
  SLAYER TERMINAL - WORKSPACE LIVE CHART
  The chart widget owns its own window. Each copy on
  the desk keeps its own timeframe and overlays, so
  two live charts side by side can watch the same
  name on different clocks — which is most of the
  reason to put two of them on a desk.

  State lives HERE rather than in the registry so
  every instance gets its own, for free.
==================================================
*/

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import Feed from '../../core/feed';
import ChartToolbar from '../../components/gex/ChartToolbar';
import StrikeChart, { DEFAULT_OVERLAYS, type ChartOverlays } from '../../components/gex/StrikeChart';
import { FOCUS, KING } from '../../components/gex/palette';
import { buildLevelRead } from '../../data/levelview';

const fmtFocus = (v: number) => (v % 1 === 0 ? v.toFixed(0) : v.toFixed(2));
import TickerQuickPick from '../../components/gex/TickerQuickPick';
import SpotPrice from '../../components/gex/SpotPrice';
import { buildPrints } from '../../data/gex';
import { twinFamilyFor, twinPrice, fmtTwin } from '../../data/indexTwins';
import PulseBoard from '../PulseBoard';
import { useFadeClose } from '../../components/ui/useFadeClose';
import type { Timeframe } from '../../data/timeframe';
import type { WorkspaceCtx } from './registry';

const LiveChartWidget = ({ ctx }: { ctx: WorkspaceCtx }) => {
  const [timeframe, setTimeframe] = useState<Timeframe>('1m');
  const [overlays, setOverlays] = useState<ChartOverlays>(DEFAULT_OVERLAYS);
  const [full, setFull] = useState(false);
  /* The 4-way board opens as a TAKEOVER over the desk, not a route (Noah,
     2026-08-17: the route's Back remounted the whole desk — a hard cut).
     The /pulse/board route survives for direct links. */
  const [quad, setQuad] = useState(false);
  const { closing: fullClosing, close: closeFull } = useFadeClose(() => setFull(false));
  const { closing: quadClosing, close: closeQuad } = useFadeClose(() => setQuad(false));

  // Dark-pool prints for the DP overlay. Deterministic per ticker and pinned to
  // it (PulseBoard's contract), so the lines don't wander with the 1s pulse —
  // without this prop the toolbar's Dark pool toggle drew nothing (Noah,
  // 2026-08-18).
  const prints = useMemo(
    () => buildPrints(ctx.ticker, ctx.gex.levels.spot),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctx.ticker]
  );

  /* A strike ARRIVES (Noah, 2026-08-22: "why does it take me to the default
     pulse page") — the chart comes to you: the takeover opens on the arrival
     token, the FOCUS line already on the tape, so the destination is
     unmistakable. One-shot: closing it leaves the docked chart focused. */
  useEffect(() => {
    if (!ctx.focusOpen) return;
    setFull(true);
    // The level view needs the trails on — the focused band IS the level's
    // history, and it can't lead a field that isn't drawn.
    setOverlays(o => (o.trails ? o : { ...o, trails: true }));
  }, [ctx.focusOpen]);

  /* What the focused level is doing today — distance, tests, gamma trend —
     re-read per revision so the distance walks with the tape. */
  const levelRead = useMemo(
    () => (ctx.focusPrice != null ? buildLevelRead(ctx.ticker, ctx.focusPrice) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctx.focusPrice, ctx.ticker, ctx.revision]
  );

  // Same takeover contract as the heatmap widget: Esc exits (fading), page
  // scroll locks underneath. The z-[80] guard hands Esc to a board cell's
  // own fullscreen first.
  useEffect(() => {
    if (!full && !quad) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (quad) {
        if (document.querySelector('[class*="z-[80]"]')) return;
        closeQuad();
        return;
      }
      closeFull();
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [full, quad, closeFull, closeQuad]);

  const body = (
    <div className="h-full min-h-0 flex flex-col">
      {/* Controls sit in the body, not the header — the header is the drag
          handle, and a click there would start dragging the panel. The quad
          button is the door to /pulse/board — it moved here when the desk
          became the Pulse page (2026-08-17); the old page carried it before. */}
      <div className={`shrink-0 border-b border-borderSubtle/60 flex items-center flex-wrap ${full ? 'px-3 py-2 gap-3' : 'px-2 py-1.5 gap-2'}`}>
        {/* Fullscreen earns the TradingView move (Noah, 2026-08-17): change
            the name without leaving the takeover — same quick-pick the 4-way
            cells carry, wired to this panel's pin. Docked keeps the header
            picker. */}
        {full && ctx.pickTicker && (
          <>
            <span className="inline-flex items-center gap-3">
              <TickerQuickPick ticker={ctx.ticker} onPick={ctx.pickTicker} />
              {/* LIVE tick, not ctx.gex.levels.spot: levels ride the 10s scan
                  tier, so the header price sat still while the candles moved
                  (Noah, 2026-08-18). The widget re-renders per revision (1s),
                  so a direct sim read stays on the candle's clock. */}
              <SpotPrice
                value={Feed.TICKERS[ctx.ticker]?.currentPrice ?? ctx.gex.levels.spot}
                className="font-mono text-[12px] font-semibold tnum text-textPrimary"
              />
              {/* The price twins on index names (Noah, 2026-08-18) — the
                  cash index and the futures beside the ETF, no TradingView
                  detour. */}
              {(() => {
                const fam = twinFamilyFor(ctx.ticker);
                if (!fam) return null;
                const s = Feed.TICKERS[ctx.ticker]?.currentPrice ?? ctx.gex.levels.spot;
                return (
                  <span className="font-mono text-[10px] text-textMuted tnum">
                    {fam.index} {fmtTwin(twinPrice(fam, 'index', s, s))} · {fam.futures}{' '}
                    {fmtTwin(twinPrice(fam, 'futures', s, s))}
                  </span>
                );
              })()}
            </span>
            <span className="w-px h-4 bg-borderSubtle shrink-0 mx-1.5" aria-hidden />
          </>
        )}
        {/* spread: timeframes left, everything else on the right edge with
            Expand furthest right — the campaign chart's grammar (Noah,
            2026-08-17). candles: the theme picker rides along. */}
        <div className="flex-1 min-w-0">
          <ChartToolbar
            minimal
            candles
            spread
            timeframe={timeframe}
            onTimeframe={setTimeframe}
            overlays={overlays}
            onOverlays={setOverlays}
            onOpenQuad={() => setQuad(true)}
            fullscreen={full}
            onToggleFullscreen={() => (full ? closeFull() : setFull(true))}
          />
        </div>
        {/* The FOCUS line's chip — a strike sent here from Ranked Targets /
            Exposure Profile. Says what the dashed line on the tape IS, and
            is the only way to take it down by hand (it also clears when the
            desk changes name). Lime = the selection voice: what you clicked. */}
        {ctx.focusPrice != null && (
          <span
            className="inline-flex items-center gap-1.5 pl-2 pr-1 py-0.5 rounded border font-mono text-[9px] uppercase tracking-widest animate-soft-in"
            style={{ color: FOCUS, borderColor: `${FOCUS}66`, background: `${FOCUS}0f` }}
          >
            Focus
            <span className="text-[11px] font-bold tnum normal-case tracking-normal">{fmtFocus(ctx.focusPrice)}</span>
            {/* The strike's standing right now — it wears the king's magenta
                on the tape while it holds the crown, and this says why */}
            {Math.abs(ctx.gex.levels.king - ctx.focusPrice) < 1e-9 && (
              <span className="font-bold" style={{ color: KING }}>
                King
              </span>
            )}
            {/* The level read — the three things that decide whether a ranked
                level is about to matter: distance, tests today, gamma trend.
                Neutral ink: none of these is a market direction. */}
            {levelRead && (
              <span className="inline-flex items-center gap-1.5 normal-case tracking-normal text-[10px] text-textSecondary tnum">
                <span aria-hidden="true" className="text-textMuted">·</span>
                <span className="text-textPrimary">
                  {levelRead.distPct > 0 ? '+' : ''}
                  {levelRead.distPct.toFixed(2)}%
                </span>
                <span aria-hidden="true" className="text-textMuted">·</span>
                <span title="Times price has tested this level this session">
                  {levelRead.touches === 0
                    ? 'untested today'
                    : `tested ${levelRead.touches}× · last ${levelRead.lastTouch}`}
                </span>
                <span aria-hidden="true" className="text-textMuted">·</span>
                <span title="Gamma at this strike, now against the session open">
                  {levelRead.trend === 'NEW'
                    ? 'gamma new since open'
                    : `gamma ${levelRead.trend.toLowerCase()} ${levelRead.changePct! > 0 ? '+' : ''}${levelRead.changePct!.toFixed(0)}%`}
                </span>
              </span>
            )}
            {ctx.clearFocus && (
              <button
                onClick={ctx.clearFocus}
                aria-label="Clear focus line"
                title="Clear the focus line"
                className="inline-flex items-center justify-center w-4 h-4 rounded hover:bg-white/[0.08] transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </span>
        )}
      </div>
      <div className="flex-1 min-h-0 p-2">
        {/* Ticker-keyed slow fade (the Weigher's browse grammar): a name
            change breathes in instead of hard-swapping the tape. */}
        <div key={ctx.ticker} className="h-full min-h-0 animate-soft-in-slow">
          <StrikeChart
            ticker={ctx.ticker}
            revision={ctx.revision}
            levels={ctx.gex.levels}
            timeframe={timeframe}
            overlays={overlays}
            prints={prints}
            focusPrice={ctx.focusPrice ?? null}
            height={full ? 460 : 180}
          />
        </div>
      </div>
    </div>
  );

  // Portal, not a plain fixed div: react-grid-layout positions panels with CSS
  // transforms, and a transformed ancestor becomes the containing block for
  // position:fixed — an in-place overlay would size itself to the widget.
  if (full) {
    return createPortal(
      <div
        className={`fixed inset-0 z-[80] bg-canvas p-3 flex flex-col animate-soft-in transition-opacity duration-200 ease-out ${
          fullClosing ? 'opacity-0' : ''
        }`}
      >
        <div className="flex-1 min-h-0 border border-borderSubtle bg-panel rounded-lg overflow-hidden">{body}</div>
      </div>,
      document.body
    );
  }

  return (
    <>
      {body}
      {quad &&
        createPortal(
          <div
            className={`fixed inset-0 z-[70] bg-canvas flex flex-col animate-soft-in transition-opacity duration-200 ease-out ${
              quadClosing ? 'opacity-0' : ''
            }`}
          >
            <div className="flex-1 min-h-0 overflow-y-auto px-4 lg:px-6 py-4">
              <div className="flex flex-col gap-4 pb-10">
                <PulseBoard onBack={closeQuad} />
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};

export default LiveChartWidget;
