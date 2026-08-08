/*
==================================================
  SLAYER TERMINAL - WORKSPACE WIDGET REGISTRY
  Every widget wraps an existing panel component and
  receives the shared data context built by the page.
==================================================
*/

import type { ReactNode } from 'react';
import StrikeChart from '../../components/gex/StrikeChart';
import PositioningMap from '../../components/gex/PositioningMap';
import ExposureMatrix from '../../components/gex/ExposureMatrix';
import GexMatrix from '../../components/gex/GexMatrix';
import OrderFlowPanel from '../../components/gex/OrderFlowPanel';
import WallDrift from '../../components/gex/vannacharm/WallDrift';
import RegimePanel from '../../components/gex/vollab/RegimePanel';
import MonteCarloPanel from '../proveit/MonteCarloPanel';
import NetPremiumPanel from '../../components/flowdesk/NetPremiumPanel';
import PulseFlowTape from '../../components/flowdesk/PulseFlowTape';
import FlowAlertsPanel from '../../components/flowdesk/FlowAlertsPanel';
import GradientChart from '../../components/gex/GradientChart';
import PressureMatrix from '../../components/gex/PressureMatrix';
import MarketNotes from '../../components/gex/MarketNotes';
import SwingMapChart from '../../components/swing/SwingMapChart';
import SignalBadge from '../../components/ui/SignalBadge';
import EmptyState from '../../components/ui/EmptyState';
import TickerTag from '../../components/ui/TickerTag';
import AnimatedNumber from '../../components/ui/AnimatedNumber';
import Sparkline from '../../components/compass/Sparkline';
import type { Tone } from '../../components/ui/tones';
import { makeAutoNote } from '../../data/command';
import { buildDarkPoolView } from '../../data/darkpool';
// Aliased: both engines name their observational verdict map the same thing.
// Rendering through them is what keeps the engine's own word off the screen.
import { buildStockBoard, VERDICT_LABEL as STOCK_VERDICT_LABEL, VERDICT_TONE as STOCK_VERDICT_TONE } from '../../data/stocks';
import { runMonteCarlo } from '../../core/quant';
import { fmtUsd } from '../../data/gex';
import type { MarketSnapshot } from '../../types/market';
import type {
  CommandView,
  DealerBias,
  ExposureProfileData,
  GexMatrixData,
  GexView,
  VannaCharmView,
  VolLabData,
} from '../../types/gex';
import type { CompassData } from '../../types/compass';

export interface WorkspaceCtx {
  ticker: string;
  revision: number;
  /** Raw snapshot for widgets that run their own engine (dark pool, quant) */
  snapshot: MarketSnapshot;
  iv: number;
  gex: GexView;
  /** Strike × expiry matrix with the 1s live pulse applied */
  matrix: GexMatrixData;
  exposure: ExposureProfileData;
  cmd: CommandView;
  vanna: VannaCharmView;
  vol: VolLabData;
  setups: CompassData;
  /** Deep-link focus: a price level to mark on charts (from "view on chart"). */
  focusPrice?: number | null;
}

/**
 * `w`/`h` are the size a panel is BORN at, `minW`/`minH` the size below which its
 * content stops being readable. Both are load-bearing on a 12-column grid: two
 * widgets can only be added side by side when their default widths sum to 12 or
 * less, and Pulse's row-fitting insert refuses a row that cannot clear the
 * incoming widget's `minW`. Keep the common pairs summing to 12.
 */
export interface WidgetDef {
  key: string;
  title: string;
  description: string;
  w: number;
  h: number;
  minW: number;
  minH: number;
  render: (ctx: WorkspaceCtx) => ReactNode;
}

const biasTone: Record<DealerBias, Tone> = { BULLISH: 'bull', BEARISH: 'bear', NEUTRAL: 'neutral' };

export const WIDGETS: WidgetDef[] = [
  {
    key: 'live-chart',
    title: 'Chart',
    description: 'Candles with walls, flip, king & GEX nodes',
    // Half the grid, not two thirds: the chart is the panel most often paired
    // with a matrix, and at w=8 nothing wide enough to sit beside it fit.
    w: 6,
    h: 5,
    minW: 4,
    minH: 4,
    render: ctx => (
      <div className="h-full min-h-0 p-2 flex flex-col">
        <StrikeChart
          ticker={ctx.ticker}
          revision={ctx.revision}
          levels={ctx.gex.levels}
          overlay="BOTH"
          timeframe="1m"
          height={200}
          focusPrice={ctx.focusPrice ?? null}
        />
      </div>
    ),
  },
  {
    key: 'gradient-chart',
    title: 'Gradient Chart',
    description: 'Dealer gamma / charm field across the session, with the tape drawn over it',
    w: 8,
    h: 6,
    minW: 4,
    minH: 4,
    render: ctx => (
      <div className="h-full min-h-0 p-2 flex flex-col">
        <GradientChart ticker={ctx.ticker} revision={ctx.revision} levels={ctx.gex.levels} height={200} />
      </div>
    ),
  },
  {
    key: 'pressure-matrix',
    title: 'Dealer Pressure',
    description: 'Call vs put exposure at every strike in range, with the pin and flip rows flagged',
    w: 4,
    h: 6,
    minW: 3,
    minH: 4,
    render: ctx => <PressureMatrix rows={ctx.cmd.pressure} maxAbs={ctx.cmd.pressureMaxAbs} spot={ctx.snapshot.spot} />,
  },
  {
    key: 'market-notes',
    title: 'Session Notes',
    description: 'Generated observations as the book moves, plus your own lines',
    w: 4,
    h: 4,
    minW: 3,
    minH: 3,
    render: ctx => (
      <MarketNotes autoNote={makeAutoNote(ctx.snapshot, ctx.gex.levels, ctx.cmd.bias)} revision={ctx.revision} />
    ),
  },
  {
    key: 'flow-tape',
    title: 'Options Flow',
    description: 'Session print stream: premium, aggressor, sweeps & SigScore; click to isolate a contract',
    w: 8,
    h: 6,
    minW: 4,
    minH: 4,
    render: ctx => <PulseFlowTape ticker={ctx.ticker} revision={ctx.revision} />,
  },
  {
    key: 'flow-alerts',
    title: 'Flow Alerts',
    description: 'Typed alerts from the print stream: repeaters, grenades & sizable sweeps',
    w: 4,
    h: 6,
    minW: 3,
    minH: 3,
    render: ctx => <FlowAlertsPanel ticker={ctx.ticker} revision={ctx.revision} />,
  },
  {
    key: 'net-premium',
    title: 'Net Premium',
    description: 'Net call vs put premium tide through the session, next to price',
    w: 4,
    h: 6,
    minW: 3,
    minH: 3,
    render: ctx => <NetPremiumPanel ticker={ctx.ticker} revision={ctx.revision} />,
  },
  {
    key: 'swing-map',
    title: 'Swing Map',
    description: 'Daily swing targets: support/resistance zones, trend & measured move',
    w: 6,
    h: 6,
    minW: 4,
    minH: 4,
    render: ctx => (
      <div className="h-full min-h-0 p-2 flex flex-col">
        <SwingMapChart ticker={ctx.ticker} spot={ctx.snapshot.spot} revision={ctx.revision} height={200} focusPrice={ctx.focusPrice ?? null} />
      </div>
    ),
  },
  {
    key: 'positioning-map',
    title: 'Dealer Positioning',
    description: 'Net dealer pressure by strike with walls & flip',
    w: 5,
    h: 5,
    minW: 3,
    minH: 4,
    render: ctx => <PositioningMap data={ctx.exposure} />,
  },
  {
    key: 'exposure-matrix',
    title: 'Exposure Matrix',
    description: 'GEX · DEX · VEX by strike, put/call/net',
    // Ten columns behind a 560px table floor. At w=5 that floor is only cleared
    // above a ~1500px viewport, so the panel showed its own horizontal scrollbar
    // at its own declared minimum; 6 clears it from 1280 up, and 6 + the chart's
    // 6 is exactly the grid, which is the pairing this widget is asked for.
    w: 6,
    h: 5,
    minW: 6,
    minH: 4,
    render: ctx => <ExposureMatrix data={ctx.exposure} />,
  },
  {
    key: 'gex-heatmap',
    title: 'GEX Heatmap',
    description: 'Strike × expiry heat, 1s pulse',
    w: 5,
    h: 5,
    minW: 4,
    minH: 4,
    render: ctx => (
      <div className="h-full min-h-0 p-2">
        <GexMatrix data={ctx.matrix} spot={ctx.gex.levels.spot} />
      </div>
    ),
  },
  {
    key: 'order-flow',
    title: 'Order Flow',
    description: 'Cumulative delta & delta by price',
    w: 4,
    h: 5,
    minW: 3,
    minH: 4,
    render: ctx => (
      <div className="h-full min-h-0 p-3">
        <OrderFlowPanel data={ctx.cmd.orderFlow} />
      </div>
    ),
  },
  {
    key: 'insight',
    title: 'Positioning Insight',
    description: 'The engine explains the structure in plain words',
    w: 4,
    h: 4,
    minW: 3,
    minH: 3,
    render: ctx => (
      <div className="h-full min-h-0 overflow-y-auto p-3 flex flex-col gap-2.5">
        <span>
          <SignalBadge tone={biasTone[ctx.exposure.bias]} dot>
            {ctx.exposure.bias}
          </SignalBadge>
        </span>
        <ul className="flex flex-col gap-2">
          {ctx.exposure.insights.map((line, i) => (
            <li key={i} className="flex items-start gap-2 text-label text-textSecondary leading-relaxed">
              <span className="text-textMuted mt-px select-none">›</span>
              <span className="tnum">{line}</span>
            </li>
          ))}
        </ul>
      </div>
    ),
  },
  {
    key: 'wall-drift',
    title: 'Wall Drift',
    description: 'Session timeline: walls, flip & spot',
    w: 6,
    h: 3,
    minW: 4,
    minH: 3,
    render: ctx => (
      <div className="h-full min-h-0 p-3">
        <WallDrift drift={ctx.vanna.drift} />
      </div>
    ),
  },
  {
    key: 'vol-state',
    title: 'Volatility State',
    description: 'Calm / normal / stormy odds over time',
    w: 4,
    h: 4,
    minW: 3,
    minH: 3,
    render: ctx => (
      <div className="h-full min-h-0 p-3">
        <RegimePanel data={ctx.vol.regime} />
      </div>
    ),
  },
  {
    key: 'top-setups',
    title: 'Top Setups',
    description: 'Strongest setup per ticker across the scanned universe',
    // The desk's only genuinely multi-ticker panel, so it gets a board's width
    // rather than a sidebar's: six named columns need the room.
    w: 6,
    h: 5,
    minW: 4,
    minH: 4,
    render: ctx => {
      // flatMap, not map+filter: a group can be empty, and this keeps `s`
      // non-nullable without a cast.
      const rows = ctx.setups.groups.flatMap(g => (g.setups[0] ? [{ g, s: g.setups[0] }] : [])).slice(0, 8);
      return (
        <div className="h-full min-h-0 flex flex-col">
          {/* The chart panels on this desk name every series they draw. A
              multi-ticker board owes the same: without a header the numbers are
              three anonymous columns and the symbol lives inside a contract
              string. Widths are shared with the rows below so they line up. */}
          <div className="shrink-0 flex items-center gap-2 px-2.5 py-1.5 border-b border-borderSubtle bg-white/[0.015] font-mono text-micro uppercase tracking-widest text-textMuted">
            <span className="w-12">Ticker</span>
            <span className="w-14 text-right">Chg</span>
            <span className="w-16 text-center">Session</span>
            <span className="flex-1 min-w-0">Setup</span>
            <span className="w-8 text-right">Score</span>
            <span className="w-14 text-right">Exp move</span>
          </div>
          <div className="flex-grow min-h-0 overflow-y-auto">
            {rows.length === 0 && <EmptyState title="No setups in range" size="sm" />}
            {rows.map(({ g, s }) => (
              <div key={s.id} className="flex items-center gap-2 px-2.5 py-1.5 border-b border-borderSubtle/30 last:border-0">
                <TickerTag symbol={g.ticker} className="w-12 font-mono text-label font-bold text-textPrimary" />
                <span className={`w-14 text-right font-mono text-micro tnum ${g.changePct >= 0 ? 'text-bull' : 'text-bear'}`}>
                  {g.changePct >= 0 ? '+' : ''}
                  {g.changePct.toFixed(2)}%
                </span>
                {/* The group already carries the ticker's own session bars, so
                    the dead middle of the row becomes the context the symbol was
                    missing. Hover read-out comes with the primitive. */}
                <span className="w-16 flex justify-center">
                  <Sparkline data={g.sparkline} up={g.changePct >= 0} width={64} height={20} label={`${g.ticker} session`} />
                </span>
                <span className="flex-1 min-w-0 flex items-center gap-1.5 overflow-hidden">
                  <span
                    title={s.contract}
                    className={`shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-micro font-semibold ${
                      s.right === 'C' ? 'border-bull/30 bg-bull/10 text-bull' : 'border-bear/30 bg-bear/10 text-bear'
                    }`}
                  >
                    {s.strike % 1 === 0 ? s.strike.toFixed(0) : s.strike.toFixed(2)}
                    {s.right}
                  </span>
                  <span className="font-mono text-micro uppercase tracking-wider text-textMuted truncate">{s.expiry}</span>
                </span>
                <span className="w-8 text-right font-mono text-label font-semibold text-textPrimary tnum">
                  <AnimatedNumber value={s.score} format={v => v.toFixed(0)} />
                </span>
                <span className={`w-14 text-right font-mono text-micro font-semibold tnum ${s.expectedMovePct >= 0 ? 'text-bull' : 'text-bear'}`}>
                  {s.expectedMovePct >= 0 ? '+' : ''}
                  {s.expectedMovePct}%
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    },
  },
  {
    key: 'dark-pool',
    title: 'Dark Pool',
    description: 'Off-exchange posture & liquidity shelves',
    w: 4,
    h: 5,
    minW: 3,
    minH: 4,
    render: ctx => {
      const dp = buildDarkPoolView(ctx.snapshot);
      const tone: Tone = dp.posture === 'ACCUMULATING' ? 'bull' : dp.posture === 'DISTRIBUTING' ? 'bear' : 'neutral';
      return (
        <div className="h-full min-h-0 overflow-y-auto p-3 flex flex-col gap-2.5">
          <div className="flex items-center gap-2">
            <SignalBadge tone={tone} dot>
              {dp.posture}
            </SignalBadge>
            <span className="font-mono text-micro text-textMuted tnum">
              net posture {dp.netPosturePct >= 0 ? '+' : ''}
              {dp.netPosturePct.toFixed(0)}
            </span>
          </div>
          {dp.levels.slice(0, 6).map(l => (
            <div key={l.price} className="flex items-center justify-between gap-2 font-mono text-label">
              <span className="text-textPrimary tnum">${l.price.toFixed(2)}</span>
              <SignalBadge tone={l.role === 'SUPPORT' ? 'bull' : l.role === 'RESISTANCE' ? 'bear' : 'neutral'}>{l.role}</SignalBadge>
              <span className="text-textMuted tnum">{fmtUsd(l.notional)}</span>
            </div>
          ))}
        </div>
      );
    },
  },
  {
    key: 'monte-carlo',
    title: 'Monte Carlo',
    description: 'Price cone & terminal distribution',
    w: 6,
    h: 5,
    minW: 4,
    minH: 4,
    render: ctx => (
      <div className="h-full min-h-0 p-3">
        <MonteCarloPanel mc={runMonteCarlo(ctx.snapshot, ctx.iv, 30)} spot={ctx.snapshot.spot} height={180} />
      </div>
    ),
  },
  {
    key: 'stocks-board',
    title: 'Stocks Board',
    description: 'Top-ranked equity picks by composite',
    w: 4,
    h: 5,
    minW: 3,
    minH: 4,
    render: () => (
      <div className="h-full min-h-0 overflow-y-auto">
        {buildStockBoard()
          .slice(0, 8)
          .map(p => (
            <div key={p.ticker} className="flex items-center gap-2 px-2.5 py-2 border-b border-borderSubtle/30 last:border-0">
              <span className="font-mono text-label font-bold text-textPrimary">{p.ticker}</span>
              <SignalBadge tone={STOCK_VERDICT_TONE[p.verdict]}>{STOCK_VERDICT_LABEL[p.verdict]}</SignalBadge>
              <span className="ml-auto font-mono text-label font-semibold text-textPrimary tnum">{p.composite}</span>
            </div>
          ))}
      </div>
    ),
  },
];
