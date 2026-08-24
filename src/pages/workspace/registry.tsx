/*
==================================================
  SLAYER TERMINAL - WORKSPACE WIDGET REGISTRY
  Every widget wraps an existing panel component and
  receives the shared data context built by the page.
==================================================
*/

import { memo, type ReactNode } from 'react';
import LiveChartWidget from './LiveChartWidget';
import StrikeLadderWidget from './StrikeLadderWidget';
import CompassSetupsWidget from './CompassSetupsWidget';
import RankedTargetsWidget from './RankedTargetsWidget';
import EarningsWidget from './EarningsWidget';
import ContractWeigher from '../../components/compass/ContractWeigher';

/* The Weigher re-renders on its snapshot prop only — the desk's 1s heat
   pulse must not re-render the whole chain every second (the "buffering"
   Noah caught on the setups widget; same medicine here). Snapshot identity
   changes on the 10s scan tier. */
import PositioningMap from '../../components/gex/PositioningMap';
import ExposureMatrix from '../../components/gex/ExposureMatrix';
import KeyLevelsWidget from './KeyLevelsWidget';
import OrderFlowPanel from '../../components/gex/OrderFlowPanel';
import WallDrift from '../../components/gex/vannacharm/WallDrift';
import type {
  PulseView,
  ExposureProfileData,
  GexMatrixData,
  GexView,
  VannaCharmView,
} from '../../types/gex';
import type { MarketSnapshot } from '../../types/market';
import type { CompassView } from '../../types/compass';

const MemoWeigher = memo(ContractWeigher);

export interface WorkspaceCtx {
  ticker: string;
  /** Pin THIS panel to a name — the desk binds it per instance (the chart's
      fullscreen ticker picker rides on it; the header picker is the other
      door to the same state). */
  pickTicker?: (ticker: string) => void;
  /** The snapshot this context was built from — widgets that derive their own
      views (their own metric, their own expiry) rebuild from it. */
  snapshot: MarketSnapshot;
  revision: number;
  /** The 1s heat tick — widgets that rebuild their own matrix re-pulse with it */
  pulseTick: number;
  /** A strike another page sent here to be seen on the chart (Ranked Targets,
      Exposure Profile) — the live chart draws it as the FOCUS line until
      cleared or until the desk changes name. */
  focusPrice?: number | null;
  clearFocus?: () => void;
  /** A one-shot arrival token (changes per deep link): the chart that carries
      it lifts itself fullscreen so the strike is unmistakably on screen. The
      desk hands it to ONE chart. */
  focusOpen?: number;
  /** Focus a strike on THIS desk's chart — the in-desk door (a route push to
      /pulse from inside Pulse never re-runs the deep link). */
  focusStrike?: (price: number) => void;
  gex: GexView;
  /** Strike × expiry matrix with the 1s live pulse applied */
  matrix: GexMatrixData;
  exposure: ExposureProfileData;
  pulse: PulseView;
  vanna: VannaCharmView;
  setups: CompassView;
}

export interface WidgetDef {
  key: string;
  title: string;
  description: string;
  w: number;
  h: number;
  minW: number;
  minH: number;
  /** The tallest this panel is allowed to be, in grid rows (100px each):
      past it the content has nothing more to show and the panel is just
      empty surface (Noah, 2026-08-22: the Weigher "just keeps going"). A
      cap per panel, not per page — each one knows its own content. */
  maxH: number;
  render: (ctx: WorkspaceCtx) => ReactNode;
}

export const WIDGETS: WidgetDef[] = [
  {
    key: 'live-chart',
    title: 'Live Chart',
    description: 'Candles with walls, flip, king & GEX nodes — own timeframe & overlays',
    w: 8,
    h: 5,
    minW: 4,
    minH: 4,
    maxH: 10, // a tape earns height — about a full viewport
    // Its own component so each copy on the desk keeps its own timeframe
    render: ctx => <LiveChartWidget ctx={ctx} />,
  },
  {
    key: 'positioning-map',
    title: 'Dealer Positioning',
    description: 'Net dealer pressure by strike with walls & flip',
    w: 5,
    h: 5,
    minW: 3,
    minH: 4,
    maxH: 8,
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
    maxH: 8, // the table scrolls inside — taller is just more empty rows
    render: ctx => <ExposureMatrix data={ctx.exposure} />,
  },
  {
    // Key kept from the heatmap so saved desks upgrade in place — the strike ×
    // expiry grid became the Strike Pressure Ladder (Mo, 2026-08-19).
    key: 'gex-heatmap',
    title: 'Strike Pressure Ladder',
    description: 'Every strike a row — put & call gamma as bars, net, distance, OI, volume; spot, flip & walls through it — own expiry & range',
    w: 6,
    h: 5,
    minW: 4,
    minH: 4,
    maxH: 9,
    // Its own component so each copy on the desk keeps its own expiry
    render: ctx => <StrikeLadderWidget ctx={ctx} />,
  },
  {
    key: 'key-levels',
    title: 'Key Levels',
    description: 'Walls, pin, flip & king — readable as SPY, SPX or ES on index names',
    w: 4,
    h: 4,
    minW: 3,
    minH: 3,
    maxH: 6, // four levels and a lens — there is nothing below them
    // Own component: the instrument lens is per-copy state
    render: ctx => <KeyLevelsWidget ctx={ctx} />,
  },
  {
    key: 'order-flow',
    title: 'Order Flow',
    description: 'Cumulative delta & delta by price',
    w: 4,
    h: 5,
    minW: 3,
    minH: 4,
    maxH: 8,
    render: ctx => (
      <div className="h-full min-h-0 p-3">
        <OrderFlowPanel data={ctx.pulse.orderFlow} />
      </div>
    ),
  },
  // Launch trim (Noah, 2026-08-17): Positioning Insight + Volatility State
  // pulled from the picker — saved desks self-clean via loadSaved's registry
  // filter.
  {
    key: 'wall-drift',
    title: 'Wall Drift',
    description: 'Session timeline — walls, flip & spot',
    w: 6,
    h: 3,
    minW: 4,
    minH: 3,
    maxH: 5, // a timeline reads wide, not tall
    render: ctx => (
      <div className="h-full min-h-0 p-3">
        <WallDrift drift={ctx.vanna.drift} />
      </div>
    ),
  },
  {
    // Key kept from the old mini-feed so saved desks upgrade in place —
    // the hand-drawn row list became the ACTUAL Compass cards (Noah,
    // 2026-08-17: "actual one of compass not a render").
    key: 'top-setups',
    title: 'Compass Setups',
    description: 'The actual scan cards, ranked — click any card for the full analysis',
    w: 6,
    h: 5,
    minW: 4,
    minH: 3,
    maxH: 9, // the cards scroll inside
    render: ctx => <CompassSetupsWidget ctx={ctx} />,
  },
  {
    key: 'ranked-targets',
    title: 'Ranked Targets',
    description: 'The strikes that own the day — priority split by reason, re-ranked through any lens; click one to see it on the chart',
    w: 5,
    h: 5,
    minW: 4,
    minH: 3,
    maxH: 9,
    render: ctx => <RankedTargetsWidget ctx={ctx} />,
  },
  {
    key: 'earnings',
    title: 'Earnings Calendar',
    description: 'The next two weeks of reports with the move the market is charging — click a name for its dossier',
    w: 5,
    h: 4,
    minW: 4,
    minH: 3,
    maxH: 8,
    render: () => <EarningsWidget />,
  },
  {
    key: 'compass-weigher',
    title: 'Compass Weigher',
    description: 'The actual Weigher — expiry rail, contract chain & the full weigh view',
    w: 8,
    h: 6,
    minW: 5,
    minH: 4,
    maxH: 9, // the weigh view plus the chain — past this it was empty surface
    render: ctx => (
      <div className="h-full min-h-0 overflow-y-auto p-3">
        <MemoWeigher snapshot={ctx.snapshot} />
      </div>
    ),
  },
];

export const widgetByKey = (key: string): WidgetDef | undefined => WIDGETS.find(w => w.key === key);
