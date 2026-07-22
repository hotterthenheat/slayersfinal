import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { Kbd } from './parts';

interface QA {
  q: string;
  a: React.ReactNode;
}

const FAQ: QA[] = [
  {
    q: 'Is this financial advice?',
    a: (
      <>No. Slayer Terminal is a research and educational tool. Nothing here is a recommendation to buy, sell or hold
      any security — see the{' '}
      <Link to="/legal/disclaimer" className="text-textPrimary hover:underline">Disclaimer</Link> for the full terms.</>
    ),
  },
  {
    q: 'Is the data live?',
    a: (
      <>Prices, levels and flow update continuously while the terminal is open. How to treat what is shown — and its
      limits — is covered in the{' '}
      <Link to="/legal/disclaimer" className="text-textPrimary hover:underline">Disclaimer</Link>: data may be delayed
      or incomplete, and should not be the sole basis for any trading decision.</>
    ),
  },
  {
    q: 'Do I need an account?',
    a: <>No. There are no accounts yet — every desk works without signing in. If accounts arrive later, they will be optional for the core terminal.</>,
  },
  {
    q: 'Where is my data stored?',
    a: (
      <>Your workspace layout, watchlists, tracker, journal and saved views live in your browser's local storage on
      your device — nothing is sent to a server. You can wipe it any time from Settings. See the{' '}
      <Link to="/legal/privacy" className="text-textPrimary hover:underline">Privacy Policy</Link>.</>
    ),
  },
  {
    q: 'Which desk should I start with?',
    a: (
      <><Link to="/pulse" className="text-textPrimary hover:underline">Pulse</Link> is the cockpit — start there.
      Use <Link to="/compass" className="text-textPrimary hover:underline">Compass</Link> to find a setup,{' '}
      <Link to="/pinpoint" className="text-textPrimary hover:underline">Pinpoint</Link> to read the dealer positioning
      behind it, and <Link to="/trace" className="text-textPrimary hover:underline">Trace</Link> to confirm it on the
      tape.</>
    ),
  },
  {
    q: 'How do I switch tickers quickly?',
    a: (
      <>Use the ticker switcher in the top bar, press <Kbd>]</Kbd> / <Kbd>[</Kbd> to step through the watchlist, or open
      the command palette with <Kbd>⌘</Kbd><Kbd>K</Kbd> and type a symbol. Every desk follows the active ticker.</>
    ),
  },
  {
    q: 'Can I customize my workspace?',
    a: (
      <>Yes — <Link to="/pulse" className="text-textPrimary hover:underline">Pulse</Link> is fully arrangeable: drag and
      resize panels, load a desk profile (Scalper / Swing / Macro / Earnings), and your layout is remembered in your
      browser.</>
    ),
  },
  {
    q: 'Does it work on mobile?',
    a: <>The navigation and page layouts are responsive, and the Pulse workspace collapses into a readable vertical stack on a phone. Dense tables and heatmaps scroll inside their own panel. That said, the heavy analytics are built for a wide screen — a desktop is the best experience.</>,
  },
  {
    q: 'Can I track my trades?',
    a: (
      <>Yes — <Link to="/tracker" className="text-textPrimary hover:underline">Tracker</Link> keeps your setups and a
      journal, and the exposure ledger can export to CSV. Everything is stored locally in your browser.</>
    ),
  },
  {
    q: 'Why do a few panels say “live data unavailable”?',
    a: <>Some surfaces need feeds the current build does not carry — full Level-2 depth or tick-by-aggressor prints, for example. Those panels say so honestly rather than showing filler, and will light up when the feed is connected.</>,
  },
  {
    q: 'Is there a keyboard-only way to drive the terminal?',
    a: (
      <>Yes. <Kbd>⌘</Kbd><Kbd>K</Kbd> opens the command palette for pages, tickers and actions; <Kbd>?</Kbd> shows every
      shortcut; <Kbd>[</Kbd> / <Kbd>]</Kbd> change ticker. See the{' '}
      <Link to="/guide/shortcuts" className="text-textPrimary hover:underline">Shortcuts</Link> tab.</>
    ),
  },
  {
    q: 'How do I get help or send feedback?',
    a: (
      <>Post in <Link to="/community" className="text-textPrimary hover:underline">Community</Link> (ideas, feature
      requests, feedback) or email{' '}
      <a href="mailto:info@slayerterminal.com" className="text-textPrimary hover:underline">info@slayerterminal.com</a>.</>
    ),
  },
];

const Faq = () => (
  <div className="rounded-lg border border-borderSubtle bg-panel divide-y divide-borderSubtle overflow-hidden">
    {FAQ.map(item => (
      <details key={item.q} className="group">
        <summary className="flex items-center gap-3 px-4 py-3.5 cursor-pointer list-none [&::-webkit-details-marker]:hidden hover:bg-white/[0.02] transition-colors">
          <ChevronRight className="w-4 h-4 text-textMuted shrink-0 transition-transform group-open:rotate-90" />
          <span className="text-[14px] font-medium text-textPrimary">{item.q}</span>
        </summary>
        <div className="px-4 pb-4 pl-11 text-[13.5px] text-textSecondary leading-relaxed">{item.a}</div>
      </details>
    ))}
  </div>
);

export default Faq;
