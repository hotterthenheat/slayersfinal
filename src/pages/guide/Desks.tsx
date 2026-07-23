import { Link } from 'react-router-dom';
import {
  LayoutDashboard,
  Compass,
  Radio,
  Crosshair,
  Sigma,
  BarChart3,
  Newspaper,
  CalendarClock,
  BookMarked,
  type LucideIcon,
} from 'lucide-react';
import { Card, Points } from './parts';

interface DeskDoc {
  icon: LucideIcon;
  name: string;
  to: string;
  tagline: string;
  shows: React.ReactNode[];
  read: React.ReactNode[];
  controls: React.ReactNode[];
  example: React.ReactNode;
}

const DESKS: DeskDoc[] = [
  {
    icon: LayoutDashboard,
    name: 'Pulse',
    to: '/pulse',
    tagline: 'Your customizable live workspace — the cockpit you build once and live in.',
    shows: [
      'A grid of panels you arrange yourself: live chart, GEX heatmap, dealer positioning, key levels, order flow, dark pool, the liquidity map and more.',
      'Each panel is a compact version of a full desk, all following the active ticker (or its own ticker, if you pin one).',
    ],
    read: [
      'Think of it as a dashboard: the chart for price, the heatmap and positioning for where dealers sit, order flow for what is printing now.',
      'Below 1024px the drag-grid collapses into a clean vertical stack so it stays readable on a phone.',
    ],
    controls: [
      <><span className="text-textPrimary">Customize</span> — drag to move, drag an edge to resize; your layout is saved in your browser.</>,
      <><span className="text-textPrimary">Desk profiles</span> — one tap loads a ready workspace: Scalper, Swing, Macro or Earnings.</>,
      <>Each panel has its own ticker field, so you can watch SPY and NVDA side by side.</>,
    ],
    example: (
      <>Load the <span className="text-textPrimary">Scalper</span> profile to get chart + order flow + key levels + the
      liquidity map together. Watch cumulative delta against price — when delta pushes up but price stalls at a call
      wall, that is absorption.</>
    ),
  },
  {
    icon: Compass,
    name: 'Compass',
    to: '/compass',
    tagline: 'Finds the setup — scores contracts across weeklies, swings and LEAPS.',
    shows: [
      'A ranked list of trade setups, each with a composite score and a plain-English read of why it ranked.',
      'A contract search / weigher: type any contract to score it against the current tape, plus a Lotto board for short-dated, high-risk names.',
    ],
    read: [
      'A higher composite means more of the inputs line up (flow, positioning, momentum, richness) — it is a ranking, not a prediction.',
      'Read the one-line rationale under each setup before the number; it tells you which factor is doing the work.',
    ],
    controls: [
      'Switch the scanner between Top Setups and the Lotto board.',
      'Search a specific contract to weigh it on demand.',
    ],
    example: (
      <>If a call setup scores high on "ask-side flow + supportive positioning," cross-check Pinpoint: is spot above the
      gamma flip with a call wall overhead as the target?</>
    ),
  },
  {
    icon: Radio,
    name: 'Trace',
    to: '/trace',
    tagline: 'Reads the flow — the live options tape and where size is printing.',
    shows: [
      'Live Tape: streaming prints with sweep / block tags. Dark Pool: off-exchange crosses. Scanner: filter the tape. Reconstruction: child prints clustered into the parent order behind them. Tracker: your saved flow.',
    ],
    read: [
      <><span className="text-textPrimary">Sweep</span> = urgency — the order took multiple exchanges at once. <span className="text-textPrimary">Block</span> = negotiated size crossed in one clip.</>,
      <>Aggressor colour follows the app convention: an <span className="text-bull">ask-lift reads green</span> (buy aggression), a bid is muted supply.</>,
      'Cumulative delta is the running buy-minus-sell — a rising line into a level is pressure building against it.',
    ],
    controls: [
      'Filter by type (all / sweeps / blocks), by direction (bull / bear), and by premium (≥$100K / ≥$500K / ≥$1M).',
      'Choose columns and save filter views for the setups you watch most.',
    ],
    example: (
      <>Repeated ask-side sweeps into a single strike, clustered in a few minutes, is what Reconstruction groups into one
      inferred parent order — a desk working size, not noise.</>
    ),
  },
  {
    icon: Crosshair,
    name: 'Pinpoint',
    to: '/pinpoint',
    tagline: 'Dealer positioning — where market-makers are hedged and what that pins.',
    shows: [
      'The GEX heatmap and exposure profile, the full greek matrix, Greeks & Regime, Vanna / Charm migration, the Vol Lab, Hedge Impact, Fracture stress and State Density.',
    ],
    read: [
      <>Net GEX per strike: <span className="text-bull">green supports</span> (long gamma — dealers dampen moves), <span className="text-bear">red amplifies</span> (short gamma — dealers accelerate them).</>,
      <><span className="text-textPrimary">Call wall</span> often caps as resistance; <span className="text-textPrimary">put wall</span> often holds as support; the <span className="text-flip">gamma flip</span> is the level where the regime changes sign; the <span className="text-king">king strike</span> is the strongest single pin.</>,
      'Hover any heatmap cell or column header for the exact read — the numbers are always printed, colour is a second signal.',
    ],
    controls: [
      'The Pinpoint sub-tabs switch between positioning, dynamics (vanna/charm, history) and volatility (vol lab, state density).',
      'On the matrix, toggle By strike vs By |exposure|, and reveal advanced greeks.',
    ],
    example: (
      <>Spot sitting below the gamma flip with red −GEX stacked beneath it means dealers accelerate down-moves — a break
      lower can go faster than it "should." Walls at 495 / 500 bracket the likely range.</>
    ),
  },
  {
    icon: Sigma,
    name: 'Prove It',
    to: '/prove-it',
    tagline: 'The receipts — quant modeling and how each engine has tracked.',
    shows: [
      'A Monte Carlo path fan with its percentile cone and a terminal-price histogram, the dealer surface (2D / 3D), the model scoreboard, a calibration plot and an edge-decay chart.',
    ],
    read: [
      'The cone is the percentile band across sampled paths; the near-white line is the median. Hover the fan for the median and the 50% / 90% bands at any horizon.',
      'On the calibration plot, points sitting on the diagonal mean predicted probability matched realized frequency — off the diagonal means over- or under-confident.',
    ],
    controls: [
      'Pick the forecast window (10d / 30d / 60d).',
      'Flip the dealer surface between 2D heatmap and the 3D render.',
    ],
    example: (
      <>A wide 90% band with a median near spot says the market is pricing a big move but no strong direction — an
      environment that favours premium sellers or long straddles over a directional bet.</>
    ),
  },
];

const RESEARCH: { icon: LucideIcon; name: string; to: string; blurb: string }[] = [
  { icon: BarChart3, name: 'Stocks', to: '/stocks', blurb: 'Equity picks and sector rotation — which groups are leading or lagging.' },
  { icon: Newspaper, name: 'News', to: '/news', blurb: 'Headlines paired with a read on the likely reaction.' },
  { icon: CalendarClock, name: 'Earnings', to: '/earnings', blurb: 'Calendar with play / fade / skip reads and implied moves.' },
  { icon: BookMarked, name: 'Tracker', to: '/tracker', blurb: 'Your tracked setups and trade journal, saved in your browser.' },
];

const Block = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div>
    <div className="font-mono text-micro font-semibold uppercase tracking-widest text-textMuted mb-1.5">{title}</div>
    {children}
  </div>
);

const Desks = () => (
  <div className="flex flex-col gap-5">
    {DESKS.map(d => (
      <Card key={d.name} className="p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-md border border-borderSubtle bg-inset">
              <d.icon className="w-4 h-4 text-textSecondary" />
            </span>
            <span className="font-mono text-read font-bold uppercase tracking-wider text-textPrimary">{d.name}</span>
          </div>
          <Link
            to={d.to}
            className="font-mono text-label uppercase tracking-wider text-textMuted hover:text-textPrimary transition-colors"
          >
            Open {d.name} →
          </Link>
        </div>
        <p className="text-data text-textSecondary leading-relaxed -mt-1">{d.tagline}</p>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-4">
          <Block title="What it shows">
            <Points items={d.shows} />
          </Block>
          <Block title="How to read it">
            <Points items={d.read} />
          </Block>
          <Block title="Controls">
            <Points items={d.controls} />
          </Block>
          <Block title="A worked read">
            <p className="text-data text-textSecondary leading-relaxed rounded-md border border-borderSubtle bg-white/[0.02] px-3 py-2.5">
              {d.example}
            </p>
          </Block>
        </div>
      </Card>
    ))}

    <div>
      <div className="font-mono text-label font-semibold uppercase tracking-widest text-textMuted mb-3">
        Research desks
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {RESEARCH.map(d => (
          <Link
            key={d.name}
            to={d.to}
            className="group rounded-lg border border-borderSubtle bg-panel hover:bg-panelRaised hover:border-borderMuted transition-colors p-4 flex flex-col gap-2"
          >
            <div className="flex items-center gap-2">
              <d.icon className="w-4 h-4 text-textSecondary group-hover:text-textPrimary transition-colors" />
              <span className="font-mono text-caption font-bold uppercase tracking-wider text-textPrimary">{d.name}</span>
            </div>
            <p className="text-caption text-textMuted leading-relaxed">{d.blurb}</p>
          </Link>
        ))}
      </div>
    </div>
  </div>
);

export default Desks;
