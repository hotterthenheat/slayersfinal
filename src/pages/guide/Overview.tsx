import { Link } from 'react-router-dom';
import {
  LayoutDashboard,
  Compass,
  Radio,
  Crosshair,
  Sigma,
  ArrowRight,
  type LucideIcon,
} from 'lucide-react';
import { Section, Card, Callout, Kbd } from './parts';

const DESKS: { icon: LucideIcon; name: string; to: string; blurb: string }[] = [
  { icon: LayoutDashboard, name: 'Pulse', to: '/pulse', blurb: 'Your customizable live workspace — the home desk.' },
  { icon: Compass, name: 'Compass', to: '/compass', blurb: 'Finds the setup — scores contracts across weeklies, swings and LEAPS.' },
  { icon: Radio, name: 'Trace', to: '/trace', blurb: 'Reads the flow — the live options tape and where size prints.' },
  { icon: Crosshair, name: 'Pinpoint', to: '/pinpoint', blurb: 'Dealer positioning — where market-makers are hedged and what that pins.' },
  { icon: Sigma, name: 'Prove It', to: '/prove-it', blurb: 'The receipts — quant modeling and how each engine has tracked.' },
];

const STEPS = [
  <>Pick a ticker from the top bar — or press <Kbd>]</Kbd> / <Kbd>[</Kbd> to step through the watchlist. Every desk follows the active ticker.</>,
  <>Open <Link to="/pulse" className="text-textPrimary underline underline-offset-2 decoration-white/40 hover:decoration-white/80">Pulse</Link> and load a desk profile (Scalper, Swing, Macro, Earnings) — an instant workspace for how you trade.</>,
  <>Head to <Link to="/pinpoint" className="text-textPrimary underline underline-offset-2 decoration-white/40 hover:decoration-white/80">Pinpoint</Link> to see the dealer positioning: the GEX heatmap, the call/put walls, and the gamma flip.</>,
  <>Cross-check the live tape in <Link to="/trace" className="text-textPrimary underline underline-offset-2 decoration-white/40 hover:decoration-white/80">Trace</Link> — is real size printing where the positioning says it should?</>,
  <>Press <Kbd>⌘</Kbd><Kbd>K</Kbd> any time to jump between desks, tickers and actions without leaving the keyboard.</>,
];

const Overview = () => (
  <>
    <Section title="What Slayer is">
      <p className="text-body leading-relaxed text-textSecondary max-w-[70ch]">
        Slayer Terminal is a dealer-flow options terminal. It reads where market-makers are positioned, where size is
        actually printing, and how that pins or accelerates price — then turns it into plain-English reads. The through
        line is simple: <span className="text-textPrimary">Compass finds the setup, Pinpoint reads the dealer
        positioning behind it, and Trace confirms it on the tape.</span>
      </p>
    </Section>

    <Section title="The desks">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {DESKS.map(d => (
          <Link
            key={d.name}
            to={d.to}
            className="group rounded-lg border border-borderSubtle bg-panel hover:bg-panelRaised hover:border-borderMuted transition-colors p-4 flex flex-col gap-2"
          >
            <div className="flex items-center gap-2">
              <d.icon className="w-4 h-4 text-textSecondary group-hover:text-textPrimary transition-colors" />
              <span className="font-mono text-data font-bold uppercase tracking-wider text-textPrimary">{d.name}</span>
            </div>
            <p className="text-data text-textSecondary leading-relaxed">{d.blurb}</p>
          </Link>
        ))}
        <Link
          to="/guide/desks"
          className="group rounded-lg border border-dashed border-borderMuted hover:border-textMuted transition-colors p-4 flex items-center justify-center gap-2 text-textMuted hover:text-textPrimary"
        >
          <span className="font-mono text-caption uppercase tracking-wider">How to read each desk</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </Section>

    <Section title="Your first five minutes">
      <Card className="p-4">
        <ol className="flex flex-col gap-3">
          {STEPS.map((s, i) => (
            <li key={i} className="flex gap-3 text-data leading-relaxed text-textSecondary">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-borderSubtle bg-inset font-mono text-label font-semibold text-textPrimary tnum">
                {i + 1}
              </span>
              <span className="pt-0.5">{s}</span>
            </li>
          ))}
        </ol>
      </Card>
    </Section>

    <Callout>
      New to the vocabulary — GEX, walls, gamma flip, charm/vanna? The{' '}
      <Link to="/guide/concepts" className="text-textPrimary underline underline-offset-2 decoration-white/40 hover:decoration-white/80">Concepts</Link> tab defines every term you
      will see on the desks. For how to treat what is shown, read the{' '}
      <Link to="/legal/disclaimer" className="text-textPrimary underline underline-offset-2 decoration-white/40 hover:decoration-white/80">Disclaimer</Link> — the terminal is a
      research tool, not investment advice.
    </Callout>
  </>
);

export default Overview;
