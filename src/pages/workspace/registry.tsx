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
import KeyLevelsRail from '../../components/gex/KeyLevelsRail';
import OrderFlowPanel from '../../components/gex/OrderFlowPanel';
import WallDrift from '../../components/gex/vannacharm/WallDrift';
import RegimePanel from '../../components/gex/vollab/RegimePanel';
import SignalBadge from '../../components/ui/SignalBadge';
import type { Tone } from '../../components/ui/tones';
import type {
  CommandView,
  DealerBias,
  ExposureProfileData,
  GexMatrixData,
  GexView,
  VannaCharmView,
  VolLabData,
} from '../../types/gex';
import type { SkyVisionData } from '../../types/skyvision';

export interface WorkspaceCtx {
  ticker: string;
  revision: number;
  gex: GexView;
  /** Strike × expiry matrix with the 1s live pulse applied */
  matrix: GexMatrixData;
  exposure: ExposureProfileData;
  cmd: CommandView;
  vanna: VannaCharmView;
  vol: VolLabData;
  setups: SkyVisionData;
}

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
    title: 'Live Chart',
    description: 'Candles with walls, flip, king & GEX nodes',
    w: 8,
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
        />
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
    w: 7,
    h: 5,
    minW: 5,
    minH: 4,
    render: ctx => <ExposureMatrix data={ctx.exposure} />,
  },
  {
    key: 'gex-heatmap',
    title: 'GEX Heatmap',
    description: 'Strike × expiry heat, live 1s pulse',
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
    key: 'key-levels',
    title: 'Key Levels',
    description: 'Walls, pin, flip & king with distance',
    w: 4,
    h: 4,
    minW: 3,
    minH: 3,
    render: ctx => (
      <div className="h-full min-h-0 overflow-y-auto">
        <KeyLevelsRail
          rows={ctx.cmd.keyLevels}
          maxPressure={ctx.cmd.keyLevels.reduce((a, l) => Math.max(a, l.pressure), 1)}
        />
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
            <li key={i} className="flex items-start gap-2 text-[11px] text-textSecondary leading-relaxed">
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
    description: 'Session timeline — walls, flip & spot',
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
    description: 'Compass — strongest setup per ticker',
    w: 4,
    h: 4,
    minW: 3,
    minH: 3,
    render: ctx => (
      <div className="h-full min-h-0 overflow-y-auto">
        {ctx.setups.groups
          .map(g => g.setups[0])
          .filter(Boolean)
          .slice(0, 6)
          .map(s => (
            <div key={s.id} className="flex items-center gap-2 px-2.5 py-2 border-b border-borderSubtle/30 last:border-0">
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold ${
                  s.right === 'C' ? 'border-bull/30 bg-bull/10 text-bull' : 'border-bear/30 bg-bear/10 text-bear'
                }`}
              >
                {s.contract}
              </span>
              <span className="ml-auto font-mono text-[10px] text-textSecondary tnum">
                score <span className="text-textPrimary font-semibold">{s.score}</span>
              </span>
              <span className={`font-mono text-[10px] font-semibold tnum ${s.expectedMovePct >= 0 ? 'text-bull' : 'text-bear'}`}>
                {s.expectedMovePct >= 0 ? '+' : ''}
                {s.expectedMovePct}%
              </span>
            </div>
          ))}
      </div>
    ),
  },
];

export const widgetByKey = (key: string): WidgetDef | undefined => WIDGETS.find(w => w.key === key);
