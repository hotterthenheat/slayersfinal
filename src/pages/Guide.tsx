import { Link } from 'react-router-dom';
import {
  LayoutDashboard,
  Compass as CompassIcon,
  Radio,
  Crosshair,
  Sigma,
  BarChart3,
  Newspaper,
  CalendarClock,
  BookMarked,
} from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';

interface DeskDoc {
  icon: typeof LayoutDashboard;
  name: string;
  to: string;
  blurb: string;
  points: string[];
}

const DESKS: DeskDoc[] = [
  {
    icon: LayoutDashboard,
    name: 'Pulse',
    to: '/pulse',
    blurb: 'Your customizable live workspace — the home desk.',
    points: [
      'Drag, resize and arrange panels into your own layout.',
      'One-tap desk profiles (Scalper, Swing, Macro, Earnings) preload a workspace.',
      'Every panel can track its own ticker independently.',
    ],
  },
  {
    icon: CompassIcon,
    name: 'Compass',
    to: '/compass',
    blurb: 'Finds the setup — scores contracts across weeklies, swings and LEAPS.',
    points: [
      'Ranked trade setups with a plain-English read on each.',
      'Search any contract and weigh it against the current tape.',
      'Lotto board for high-risk, short-dated names.',
    ],
  },
  {
    icon: Radio,
    name: 'Trace',
    to: '/trace',
    blurb: 'Reads the flow — the live options tape and where size is printing.',
    points: [
      'Streaming prints with sweep / block classification.',
      'Dark-pool crosses and off-exchange shelves.',
      'Metaorder reconstruction clusters child prints into the parent order behind them.',
    ],
  },
  {
    icon: Crosshair,
    name: 'Pinpoint',
    to: '/pinpoint',
    blurb: 'Dealer positioning — where market-makers are hedged and what that pins.',
    points: [
      'GEX heatmap, exposure profile and the full greek matrix.',
      'Greeks & regime, vanna / charm migration and the vol lab.',
      'Hedge-impact, fracture stress and risk-neutral state density.',
    ],
  },
  {
    icon: Sigma,
    name: 'Prove It',
    to: '/prove-it',
    blurb: 'The receipts — quant modeling and how each engine has tracked.',
    points: [
      'Monte Carlo price-path fan with the percentile cone.',
      'Probability calibration — predicted vs realized.',
      'Model scoreboard across every engine.',
    ],
  },
];

const RESEARCH: DeskDoc[] = [
  {
    icon: BarChart3,
    name: 'Stocks',
    to: '/stocks',
    blurb: 'Equity picks and sector rotation.',
    points: [],
  },
  {
    icon: Newspaper,
    name: 'News',
    to: '/news',
    blurb: 'Headlines with a read on the likely reaction.',
    points: [],
  },
  {
    icon: CalendarClock,
    name: 'Earnings',
    to: '/earnings',
    blurb: 'Calendar with play / fade / skip reads.',
    points: [],
  },
  {
    icon: BookMarked,
    name: 'Tracker',
    to: '/tracker',
    blurb: 'Your tracked setups and trade journal.',
    points: [],
  },
];

const GLOSSARY: { term: string; def: string }[] = [
  { term: 'GEX (Gamma Exposure)', def: "Net dealer gamma per strike — where hedging flows dampen (long gamma) or amplify (short gamma) moves." },
  { term: 'Call / Put Wall', def: 'The strikes with the heaviest call or put positioning — they often act as resistance and support.' },
  { term: 'Gamma Flip', def: 'The price level where net dealer gamma flips sign — above it dealers dampen, below it they accelerate.' },
  { term: 'King Strike', def: 'The single strike carrying the most exposure — the strongest pin on the board.' },
  { term: 'Charm / Vanna', def: 'How dealer hedges drift as time decays (charm) and as implied vol shifts (vanna).' },
  { term: 'Dark Pool', def: 'Off-exchange prints — large trades crossed away from the lit market.' },
];

const DeskCard = ({ d }: { d: DeskDoc }) => (
  <Link
    to={d.to}
    className="group rounded-lg border border-borderSubtle bg-panel hover:bg-panelRaised hover:border-borderMuted transition-colors p-4 flex flex-col gap-2"
  >
    <div className="flex items-center gap-2">
      <d.icon className="w-4 h-4 text-textSecondary group-hover:text-textPrimary transition-colors" />
      <span className="font-mono text-[13px] font-bold uppercase tracking-wider text-textPrimary">{d.name}</span>
    </div>
    <p className="text-[13px] text-textSecondary leading-relaxed">{d.blurb}</p>
    {d.points.length > 0 && (
      <ul className="mt-0.5 flex flex-col gap-1">
        {d.points.map((p, i) => (
          <li key={i} className="flex gap-2 text-[12px] text-textMuted leading-relaxed">
            <span className="text-textSecondary shrink-0">·</span>
            <span>{p}</span>
          </li>
        ))}
      </ul>
    )}
  </Link>
);

const Guide = () => (
  <div className="max-w-5xl mx-auto w-full flex flex-col gap-6">
    <PageHeader
      breadcrumb={['Terminal', 'Guide']}
      title="Guide"
      subtitle="What each desk does and the concepts behind the reads"
    />

    <section className="flex flex-col gap-3">
      <h2 className="font-mono text-[11px] font-semibold uppercase tracking-widest text-textMuted">The desks</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {DESKS.map(d => (
          <DeskCard key={d.name} d={d} />
        ))}
      </div>
    </section>

    <section className="flex flex-col gap-3">
      <h2 className="font-mono text-[11px] font-semibold uppercase tracking-widest text-textMuted">Research</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {RESEARCH.map(d => (
          <DeskCard key={d.name} d={d} />
        ))}
      </div>
    </section>

    <section className="flex flex-col gap-3">
      <h2 className="font-mono text-[11px] font-semibold uppercase tracking-widest text-textMuted">Key concepts</h2>
      <div className="rounded-lg border border-borderSubtle bg-panel divide-y divide-borderSubtle">
        {GLOSSARY.map(g => (
          <div key={g.term} className="px-4 py-3 grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-1 sm:gap-4">
            <span className="font-mono text-[12px] font-semibold uppercase tracking-wide text-textPrimary">{g.term}</span>
            <span className="text-[13px] text-textSecondary leading-relaxed">{g.def}</span>
          </div>
        ))}
      </div>
    </section>

    <section className="rounded-lg border border-borderSubtle bg-panel px-4 py-3.5 flex flex-wrap items-center gap-x-6 gap-y-2">
      <span className="text-[13px] text-textSecondary">
        Tip: press <kbd className="font-mono text-[11px] px-1.5 py-0.5 rounded border border-borderMuted text-textPrimary">⌘K</kbd> anywhere to jump between desks and tickers, or{' '}
        <kbd className="font-mono text-[11px] px-1.5 py-0.5 rounded border border-borderMuted text-textPrimary">?</kbd> for all shortcuts.
      </span>
      <Link
        to="/legal/disclaimer"
        className="sm:ml-auto font-mono text-[11px] uppercase tracking-wider text-textMuted hover:text-textPrimary transition-colors"
      >
        Read the disclaimer →
      </Link>
    </section>
  </div>
);

export default Guide;
