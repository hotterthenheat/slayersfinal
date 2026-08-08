import { Link } from 'react-router-dom';
import {
  LayoutDashboard,
  Compass,
  Radio,
  Crosshair,
  Sigma,
  BarChart3,
  BookMarked,
  type LucideIcon,
} from 'lucide-react';
import { Card, Points } from './parts';
import { groupOfPath } from '../../components/layout/nav';

// The rule that governs this page now lives in ./parts.tsx, which every guide
// page imports. It was here, and being here is why Overview.tsx and Faq.tsx
// kept the stale wording through two waves that corrected this file.

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
    tagline: 'Your customizable workspace — the cockpit you build once and work from.',
    shows: [
      'A grid of panels you arrange yourself: chart, GEX heatmap, dealer positioning, exposure matrix, order flow, the options tape, dark pool, the swing map and more.',
      'Each panel is a compact version of a full desk, all following the active ticker (or its own ticker, if you pin one).',
      <>A separate <span className="text-textPrimary">Data connections</span> tray holds modules that stay dark until a
      feed is wired up — DOM ladder, footprint, true time &amp; sales. They name the feed they need instead of drawing
      filler.</>,
    ],
    read: [
      'It is a dashboard: the chart for price, the heatmap and positioning for where dealers sit, Order Flow for cumulative delta, the Options Flow tape for the prints themselves.',
      'Below 1024px the drag-grid collapses into a clean vertical stack so it stays readable on a phone.',
    ],
    controls: [
      <><span className="text-textPrimary">Customize</span> — drag, resize and add panels are off until you enter it;
      outside Customize the desk is chromeless. Your layout is saved in your browser.</>,
      <>Panels resize from any edge or corner, to any size, and the desk stays gapless on its own: make one panel
      smaller and its neighbours slide over and grow to take exactly the space it gave up. You never have to tidy up
      after a drag. The one size limit is that a panel cannot be shrunk past its own title bar, because then there
      would be nothing left to click to grow it back.</>,
      <>A panel with no neighbour to hand space to — the only one in its row — springs back to full width instead. Any
      other outcome would leave a hole nothing on the desk can reach.</>,
      <><span className="text-textPrimary">Fill</span> re-packs everything on demand, for a desk that arrived with gaps
      already in it. <span className="text-textPrimary">Fit</span> is the stronger one: it re-flows the panels into tidy
      full rows, changing the arrangement rather than preserving it.</>,
      <>Every panel header carries <span className="text-textPrimary">Detach</span> and{' '}
      <span className="text-textPrimary">Pop out</span>, both available without entering Customize. Detach floats a panel
      free of the grid; pop out gives it its own window you can drag to a second monitor. Either way the panel keeps
      running off the same scan.</>,
      <>The two differ in what happens to the space behind them. A detached panel is still hovering over the desk, so
      its cell is held for it and docking puts it back exactly where it was. A popped-out panel has left this screen
      entirely, so the desk closes over it rather than showing a hole where it used to be, and it comes home to
      wherever there is room.</>,
      <>The <span className="text-textPrimary">Windows</span> menu in the toolbar lists whatever is out of the grid and
      where, brings it all back in one press, and — in browsers that allow it — picks which display new pop-outs open on.
      Window positions are saved with the layout; after a reload the menu offers to reopen them, since a browser will not
      let a page open windows without a click.</>,
      <>The <span className="text-textPrimary">Views</span> menu carries thirteen ready workspaces, Scalper, Swing
      and Macro among them. Presets stay restorable however you edit them.</>,
      <>Each panel has its own ticker field, so you can watch SPY and NVDA side by side.</>,
    ],
    example: (
      <>Load the <span className="text-textPrimary">Scalper</span> view for chart + order flow.
      Watch cumulative delta against price — when delta pushes up but price stalls at a call wall, that is
      absorption.</>
    ),
  },
  {
    icon: Compass,
    name: 'Compass',
    to: '/compass',
    tagline: 'Finds the setup — a ranked board at four horizons, plus a weigher for any contract you name.',
    shows: [
      /* This line said "all six are 0DTE or 1DTE — the board is a same-day and
         next-day instrument". That was true before the sleeve axis existed;
         `SLEEVES` in `types/compass.ts` now stamps 0, 7, 45 and 365 days, and
         the page was telling a LEAPS reader their 365-day board was a same-day
         instrument. */
      <>A ranked board of contracts, each with a score from 8 to 99 and the scanner's thesis written out for that
      ticker and strike. The horizon is the top axis — <span className="text-textPrimary">0DTE</span>,
      {' '}<span className="text-textPrimary">Weekly</span> (7 days), <span className="text-textPrimary">Swing</span>
      {' '}(45) and <span className="text-textPrimary">LEAPS</span> (365) — and it decides the expiry every row is
      stamped with. The scanners are a filter <em>inside</em> a horizon, not a horizon of their own, so the same
      scanner produces a different board on each tab.</>,
      <>The <span className="text-textPrimary">Weigher</span>: search any contract you already hold, at any expiry from
      same-day to LEAPS, and have it graded on its own six-factor composite — the math, theta burden, vol pricing, flow
      and dark pool, news lean, liquidity — with a better-risk/reward alternative beside it. It speaks the board's
      lexicon but not the board's number: the weights change with the sleeve, so the two scales are not
      interchangeable. And <span className="text-textPrimary">Lotto</span>, a 0DTE desk with the closing-auction (MOC)
      engine, high variance by design.</>,
    ],
    read: [
      <>The board's score has three inputs: how close the strike sits to spot, whether the contract's direction agrees
      with the ticker's lean, and a ±1.5-point jitter that breaks ties between names. The jitter is narrower than one
      rung of the strike ladder is worth, so it can separate two contracts but never reorder them. Counter-trend
      contracts are marked down and cannot reach the top of the board. It ranks candidates — it does not forecast
      one.</>,
      <>Score sets the board's verdict: <span className="text-textPrimary">QUALIFIED</span> at 88 and above,
      {' '}<span className="text-textPrimary">WATCH</span> from 72, <span className="text-textPrimary">FADED</span> below
      that. Health sits in its own column on the board, and momentum in the contract chain; neither is an input to the
      score, so read them as a second opinion rather than a confirmation.</>,
      'The paragraph under a setup is the scanner\'s premise applied to that name, not a breakdown of why this contract outranked the next one.',
    ],
    /* Two of the desk's five control groups used to be documented here — the
       modes and the scanners. A reader looking for the sleeve tabs, the
       Structures board, the Cards/Table density switch or the leaderboard's
       rank-by control found nothing, on the one page whose job is to say what
       the controls do. */
    controls: [
      'Three modes: Setups, Weigher and Lotto.',
      <>Inside Setups, the horizon runs along the top: <span className="text-textPrimary">0DTE</span>, Weekly, Swing,
      LEAPS — and <span className="text-textPrimary">Structures</span>, which is a different instrument rather than a
      different horizon: verticals, condors, butterflies and straddles, each with its payoff curve and its
      defined risk.</>,
      <>Under the horizon, six scanners: Top Setups, Quick Scalp, Discounted, Rebounds, Whale Sweeps and All — each
      with its own score floor. The count beside a tab is what that floor admitted across the whole field, not what
      fits on screen: the board itself is capped at the top 240 rows. All's floor is the bottom of the scale, so its
      count is the field.</>,
      <><span className="text-textPrimary">Cards</span> and <span className="text-textPrimary">Table</span> are the
      same board at two densities — cards carry the evidence chips and the invalidation line, the table trades those
      for rows on screen and sortable columns.</>,
      'The Largest Impact Contracts leaderboard has its own rank-by control, and it ranks the whole book by that column rather than re-sorting the rows you can see.',
    ],
    example: (
      <>A near-the-money call on a bullish name will outrank a far-OTM one on the same name, because proximity is most
      of the score. That is a starting shortlist, not a reason — the cross-check lives on Pinpoint: is spot above the
      gamma flip, with a call wall overhead?</>
    ),
  },
  {
    icon: Radio,
    name: 'Trace',
    to: '/trace',
    tagline: 'Reads the flow — the options tape and where size is printing.',
    shows: [
      <>Four subtabs. <span className="text-textPrimary">Tape</span>: options prints tagged sweep or block, newest
      first. <span className="text-textPrimary">Dark Pool</span>: off-exchange blocks mapped to shelves.
      {' '}<span className="text-textPrimary">Scanner</span>: per-contract aggregation — volume, ΔOI and bull/bear
      scoring. <span className="text-textPrimary">Reconstruction</span>: child prints clustered into the parent order
      they may belong to.</>,
    ],
    read: [
      <><span className="text-textPrimary">Sweep</span> = urgency — the order took multiple exchanges at once. <span className="text-textPrimary">Block</span> = negotiated size crossed in one clip.</>,
      <>Aggressor colour follows the app convention: a print that lifted the ask <span className="text-bull">reads green</span>,
      one that hit the bid <span className="text-bear">reads red</span>. Mid prints stay muted, because a mid fill names
      no aggressor.</>,
      'The session strip above the tape is the aggregate read: total premium, the call/put split, bull vs bear premium as a share of the session, the sweep and block counts, and the largest single print.',
    ],
    controls: [
      'Filter by type (all / sweeps / blocks), by direction (bull / bear), and by premium (≥$100K / ≥$500K / ≥$1M).',
      'Choose columns and save filter views for the setups you watch most. Pause freezes the rendered rows while the tape keeps collecting behind it.',
    ],
    example: (
      <>Repeated ask-side sweeps into one strike over a few minutes is what Reconstruction groups into a single inferred
      parent. Inferred is the operative word: no ticket IDs confirm the grouping, so the panel prints its competing
      explanations — several desks lifting the same strike independently would leave the same footprint.</>
    ),
  },
  {
    icon: Crosshair,
    name: 'Pinpoint',
    to: '/pinpoint',
    tagline: 'Dealer positioning — where market-makers are hedged and what that pins.',
    shows: [
      <>Five desks. <span className="text-textPrimary">Gamma</span>: the strike × expiry heatmap, this ticker or the
      whole complex. <span className="text-textPrimary">Levels</span>: the dealer positioning map and every strike
      scored. <span className="text-textPrimary">Greeks</span>: the eight-greek exposure matrix and regime, plus vanna
      and charm migration. <span className="text-textPrimary">Stress</span>: hedge impact and the fracture line.
      {' '}<span className="text-textPrimary">History</span>: how the walls, flip and net GEX moved this session.</>,
      <>The volatility surface and the density it implies are <span className="text-textPrimary">not</span> here. They
      moved to Prove It — they are what a calibrated model says about the chain, not a picture of where dealers are
      hedged. Old Pinpoint volatility links redirect there.</>,
    ],
    read: [
      <>Net GEX per strike: <span className="text-bull">green supports</span> (long gamma — dealers dampen moves), <span className="text-bear">red amplifies</span> (short gamma — dealers accelerate them).</>,
      <><span className="text-textPrimary">Call wall</span> often caps as resistance; <span className="text-textPrimary">put wall</span> often holds as support; the <span className="text-flip">gamma flip</span> is the level where the regime changes sign; the <span className="text-king">king strike</span> is the strongest single pin.</>,
      'Hover any heatmap cell for the exact read — the numbers are always printed, colour is a second signal.',
      'Spot, the walls, the flip and the king come from one derivation the whole terminal shares, so two panels on one screen cannot print two different numbers for them. The pin is the stated exception: it is the heaviest open-interest strike inside the window a panel is showing, so it moves with the strike range by design rather than by disagreement.',
    ],
    controls: [
      'Five desk tabs across the top; four of them carry a View toggle for their second read (this ticker vs complex, exposure vs ranked, matrix vs migration, hedge vs fracture).',
      'On the greek matrix, toggle By strike vs By |exposure|, and reveal the advanced greeks beyond the core three.',
    ],
    example: (
      <>Spot sitting below the gamma flip with red −GEX stacked beneath it means dealers accelerate down-moves — a break
      lower can go faster than it "should." The Levels desk names the range the book is currently defending: the put
      wall under spot, the call wall above it.</>
    ),
  },
  {
    icon: Sigma,
    name: 'Prove It',
    to: '/prove-it',
    tagline: 'The receipts — quant modeling, and how the engines this desk can grade have tracked.',
    shows: [
      <><span className="text-textPrimary">Models</span>: a Monte Carlo path fan with its percentile cone and a
      terminal-price histogram, the dealer surface, the model scoreboard, and the market-state replay — the closest
      simulated analogs of today's state, a probability-calibration plot and an edge-decay curve.</>,
      <><span className="text-textPrimary">Volatility lab</span>: the IV surface, term structure, skew and the
      volatility-state odds. <span className="text-textPrimary">Risk-neutral density</span>: the terminal-price odds the
      chain implies, against realized. Both arrived from Pinpoint — model output belongs on the desk that scores
      models.</>,
    ],
    read: [
      'The cone is the percentile band across sampled paths; the near-white line is the median. Hover the fan for the median and the 50% / 90% bands at any horizon.',
      'On the calibration plot, points sit near the diagonal when a band\'s predicted probability matched the rate that band resolved at. Each analog\'s outcome is drawn from its own predicted probability, so agreement there is what a working sampler looks like, not evidence the model was right: the plot catches a broken sampler, it cannot corroborate one.',
      'Open Assumptions under the Monte Carlo: it names the model, the IV, the drift proxy, the horizon and the path count. Every stat above it recomputes from that same seeded run.',
    ],
    controls: [
      'Three views: Models, Volatility lab and Risk-neutral density.',
      'The forecast window (10d / 30d / 60d) sets the Monte Carlo horizon, so it only appears on Models.',
      'Flip the dealer surface between the 2D heatmap and the 3D render.',
    ],
    example: (
      <>A wide 90% band with a median near spot says the market is pricing a big move but no strong direction — an
      environment that favours premium sellers or long straddles over a directional bet.</>
    ),
  },
];

const RESEARCH: { icon: LucideIcon; name: string; to: string; blurb: string }[] = [
  { icon: BarChart3, name: 'Stocks', to: '/stocks', blurb: 'Equity picks and sector rotation — which groups are leading or lagging.' },
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
    {DESKS.map(d => {
      // The group is named in text beside the desk, so a reader scrolling can
      // tell a Read desk from a Scan desk without reading the whole card.
      const group = groupOfPath(d.to);
      return (
      <Card key={d.name} className="relative p-5 flex flex-col gap-4 overflow-hidden">
        <span aria-hidden className="holo-bar absolute inset-y-0 left-0 w-[2px]" />
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <span className="holo-border flex h-8 w-8 items-center justify-center rounded-md">
              <d.icon className="w-4 h-4 text-select" />
            </span>
            <span className="font-mono text-read font-bold uppercase tracking-wider text-textPrimary">{d.name}</span>
            {group && (
              <span className="font-mono text-micro uppercase tracking-widest text-textMuted">{group}</span>
            )}
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
      );
    })}

    <div>
      <div className="font-mono text-label font-semibold uppercase tracking-widest text-textMuted mb-3">
        Research desks
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {RESEARCH.map(d => (
          <Link
            key={d.name}
            to={d.to}
            className="group relative rounded-lg border border-borderSubtle bg-panel hover:bg-panelRaised hover:border-borderMuted transition-colors p-4 flex flex-col gap-2 overflow-hidden"
          >
            <span aria-hidden className="holo-bar absolute inset-y-0 left-0 w-[2px]" />
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
