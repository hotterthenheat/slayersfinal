/*
==================================================
  SLAYER TERMINAL - LANDING (/)
  Statement-first hero over the Spline ribbon, then
  the product proves itself: every section below the
  fold runs the real panels on the simulated feed.
==================================================
*/

import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Check, ChevronDown, PlayCircle } from 'lucide-react';
import { SEED_IDEAS } from '../../data/community';
import { useLaunch } from '../../components/layout/LaunchTransition';
import SiteFooter from '../../components/layout/SiteFooter';
import { ComparePlans, Faq } from './PricingExtras';
import HeroScene from './HeroScene';
import LiveSections from './LiveSections';
import TiltBox from './TiltBox';
import { PILL } from '../../lib/motion';
import { useScrollSpy } from '../../hooks/useScrollSpy';

/**
 * Top tabs scroll to the section of THIS page that demonstrates each desk.
 *
 * They used to call `launch()` and throw the visitor straight into the terminal.
 * That made four of the five tabs exits rather than tabs: someone clicking
 * "Compass" is asking what Compass is, and the answer was being dropped into a
 * live trading desk before being told anything. It also left the page's own
 * sections unreachable from the nav, and made the active pill unreachable for
 * those four (the state was only ever set on the `#` branch).
 *
 * The way into the app is the "Launch terminal" button on the right, which is
 * where a visitor expects it.
 */
const NAV_LINKS = [
  { label: 'Pulse', to: '#workspace' },
  { label: 'Compass', to: '#setups' },
  { label: 'Trace', to: '#live' },
  { label: 'Pinpoint', to: '#showcase' },
  { label: 'Pricing', to: '#pricing' },
];

const TIERS = [
  {
    name: 'Pinpoint',
    kicker: 'The dealer-GEX terminal',
    price: '$125',
    period: '/mo',
    features: [
      'Dealer positioning · GEX · DEX · VEX',
      'Gamma exposure by strike',
      '0DTE levels & dealer dynamics',
      'Trace + Pulse',
      'Tracker · setups & trade history',
      'Discord chat & alerts',
    ],
    cta: 'Select plan',
    to: '/terminal',
    featured: false,
  },
  {
    name: 'Compass',
    kicker: 'Everything included',
    price: '$275',
    period: '/mo',
    features: [
      'Everything in Pinpoint',
      'Compass · ranked same-day contract board',
      'Volatility Lab · IV surface & expected move',
      'Contract health scores',
      'Prove It · Monte Carlo, model scoreboard & 3D dealer surface',
      'Research suite · Stocks, News & Earnings Hub',
    ],
    cta: 'Select plan',
    to: '/terminal',
    featured: true,
  },
  {
    name: 'Lifetime',
    kicker: 'Everything, forever',
    price: 'Custom',
    period: 'talk to us',
    features: [
      'Everything in Compass · forever',
      'One payment, no recurring billing',
      'Private 1-on-1 onboarding',
      'Early beta access to new tools',
    ],
    cta: 'Contact us',
    to: 'mailto:info@slayerterminal.com',
    featured: false,
  },
];

/** Anchor / route / mailto — one link component so columns stay declarative.
    Only the front door plays the gate: a single-value test, never a widened
    `startsWith('/')`, which would drag the legal pages through it too. */
const SmartLink = ({ to, className, children }: { to: string; className: string; children: React.ReactNode }) => {
  const { launch } = useLaunch();
  if (to === '/terminal') {
    return (
      <a
        href={to}
        className={className}
        onClick={e => {
          e.preventDefault();
          launch(to);
        }}
      >
        {children}
      </a>
    );
  }
  return to.startsWith('/') ? (
    <Link to={to} className={className}>
      {children}
    </Link>
  ) : (
    <a href={to} className={className}>
      {children}
    </a>
  );
};

const NAV_TARGETS = NAV_LINKS.map(l => l.to);

/** Flush hairline nav — the terminal's own chrome, not a floating glass bar.
    Clicking a tab glides to its section while a holo pill springs across.

    The pill follows the page, not the last click. Marking a tab active because
    it was clicked is a lie the moment the reader scrolls away from it — and most
    people scroll this page rather than click through it. 100 is the detection
    line: just below where a scrolled-to section comes to rest (84px, the
    scroll-margin), since at 80 a section you had just jumped to did not count as
    current and the pill lagged one behind on every click. */
const LandingNav = () => {
  const { active, getLinkProps } = useScrollSpy(NAV_TARGETS, { offset: 100 });

  return (
    <header className="glass fixed top-0 inset-x-0 z-40 border-b border-white/[0.07]">
      <div className="mx-auto max-w-6xl flex items-center gap-6 px-4 lg:px-6 py-3">
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="-my-1 py-1 font-mono text-data font-bold tracking-tight whitespace-nowrap select-none"
        >
          <span className="text-textMuted">&gt; </span>
          <span className="holo-text">slayer_terminal</span>
          <span className="inline-block w-[6px] h-[12px] ml-1 bg-textPrimary align-middle animate-cursor-blink" />
        </button>
        <nav className="hidden md:flex items-center gap-1 ml-auto">
          {NAV_LINKS.map(l => {
            const isActive = active === l.to;
            return (
              <motion.a
                key={l.label}
                {...getLinkProps(l.to)}
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.98 }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                className="relative px-3 py-1.5 rounded-md font-mono text-label uppercase tracking-wider"
              >
                {isActive && (
                  <motion.span
                    layoutId="landing-nav-pill"
                    className="absolute inset-0 rounded-md holo-bg"
                    transition={PILL}
                  />
                )}
                <span
                  className={`relative z-10 transition-colors ${
                    isActive ? 'text-ink font-semibold' : 'text-textSecondary hover:text-textPrimary'
                  }`}
                >
                  {l.label}
                </span>
              </motion.a>
            );
          })}
        </nav>
        <SmartLink
          to="/terminal"
          className="ml-auto md:ml-0 shrink-0 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md font-mono text-label font-semibold uppercase tracking-wider text-ink holo-bg transition-transform active:scale-[0.98]"
        >
          Launch terminal <ArrowRight className="w-3.5 h-3.5" />
        </SmartLink>
      </div>
    </header>
  );
};

/**
 * Scroll to a section the user arrived pointing at.
 *
 * A real anchor click moves the viewport; a client-side navigation does not. So
 * the footer's Pricing and FAQ links, followed from any other route, landed on
 * this page at the top with the hash sitting unused in the address bar. One
 * frame of delay because the sections below have to lay out before there is
 * anything to scroll to.
 */
const useHashTarget = () => {
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash) return;
    let el: Element | null = null;
    try {
      el = document.querySelector(hash);
    } catch {
      return; // a hash that is not a valid selector is not ours to chase
    }
    if (!el) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const t = window.setTimeout(
      () => el!.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' }),
      60,
    );
    return () => window.clearTimeout(t);
  }, [hash]);
};

const Landing = () => {
  useHashTarget();
  return (
  <div className="min-h-screen bg-canvas text-textPrimary overflow-x-hidden">
    <LandingNav />

    {/* ── Hero: the statement. The product waits one scroll below. ── */}
    <section className="relative h-[94vh] min-h-[620px]">
      <div className="absolute inset-0">
        <HeroScene />
        {/* Light scrims — the rain now sits near-invisible, so the lockup reads
            without a heavy veil, and the cursor's revealed window can glow up
            even behind the copy. A soft center well + vignette + bottom fade,
            pointer-events off so the flashlight still tracks through them. */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse 64% 54% at 50% 45%, rgba(8,9,10,0.52) 0%, rgba(8,9,10,0.24) 46%, transparent 80%)',
          }}
        />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.5) 100%)' }}
        />
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-transparent via-transparent to-canvas" />
      </div>

      {/* pointer-events-none so mouse moves reach the scene's effector below;
          the CTAs re-enable their own pointer events. */}
      <div className="relative z-10 h-full flex flex-col items-center justify-center text-center px-6 pointer-events-none">
        <span className="font-mono text-label font-semibold uppercase tracking-[0.3em] text-select">
          Dealer-flow analytics
        </span>
        <h1 className="mt-5 text-4xl md:text-6xl font-bold tracking-tight leading-[1.04] max-w-3xl">
          See the forces that
          <br />
          <span className="holo-text">move the market.</span>
        </h1>
        <p className="mt-6 max-w-xl text-read md:text-base text-textSecondary leading-relaxed">
          Market makers have to hedge. That hedging pushes price toward some levels and away from
          others, every session, mechanically. Slayer maps those forces, then grades the trades.
        </p>

        <div className="mt-9 flex items-center gap-4 flex-wrap justify-center">
          <SmartLink
            to="/terminal"
            className="pointer-events-auto inline-flex items-center gap-2 px-5 py-2.5 rounded-md font-mono text-data font-semibold uppercase tracking-wider text-ink holo-bg holo-glow transition-transform hover:scale-[1.03]"
          >
            Launch terminal <ArrowRight className="w-4 h-4" />
          </SmartLink>
          {/* Points at `#live` — the section headed "Not screenshots. The actual
              panels." It used to point at `#showcase`, which is the charting
              section, and which the scroll cue directly below already covers.
              Two affordances that mean different things were doing the same
              jump; this one now lands on the section its label promises. */}
          {/* The trailer is a controlled entry, not a replacement front door:
              the launch button still owns the primary path into the terminal.
              This sits beside it for the visitor who would rather be shown the
              system working than read about it. */}
          <Link
            to="/trailer"
            className="pointer-events-auto inline-flex items-center gap-2 px-5 py-2.5 rounded-md border border-borderMuted bg-canvas/40 font-mono text-data uppercase tracking-wider text-textSecondary hover:text-textPrimary hover:bg-rowHover transition-colors"
          >
            <PlayCircle className="w-4 h-4" /> Watch terminal trailer
          </Link>
          <a
            href="#live"
            className="pointer-events-auto inline-flex items-center px-5 py-2.5 rounded-md font-mono text-data uppercase tracking-wider text-textMuted hover:text-textPrimary transition-colors"
          >
            See the panels
          </a>
        </div>
      </div>

      {/* Scroll cue */}
      <a
        href="#showcase"
        className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-1 text-textMuted hover:text-textSecondary transition-colors"
      >
        <span className="font-mono text-micro uppercase tracking-[0.3em]">Scroll</span>
        <ChevronDown className="w-4 h-4 animate-bounce" />
      </a>
    </section>

    {/* ── Showcase → marquee → pillars → live engines → story → workspace ── */}
    <LiveSections />

    {/* ── The desks ── */}
    <section className="px-6 md:px-10 py-20 max-w-6xl mx-auto">
      <span className="font-mono text-label font-semibold uppercase tracking-[0.25em] text-textSecondary">
        The desks
      </span>
      <h2 className="mt-3 text-3xl md:text-4xl font-bold tracking-tight">One chain, five desks.</h2>
      <p className="mt-4 text-body text-textSecondary leading-relaxed max-w-xl">
        Watch on Pulse, choose on Compass, read the flow on Trace, map the dealers on Pinpoint, and let Prove It keep the
        receipts. Every desk feeds the next.
      </p>
      <div className="mt-10 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { n: '01', name: 'Pulse', sub: 'The workspace you arrange', to: '/pulse' },
          { n: '02', name: 'Compass', sub: 'Scores the setup', to: '/compass' },
          { n: '03', name: 'Trace', sub: 'Reads the flow', to: '/trace' },
          { n: '04', name: 'Pinpoint', sub: 'Maps dealer positioning', to: '/pinpoint' },
          { n: '05', name: 'Prove It', sub: 'Keeps the receipts', to: '/prove-it' },
        ].map(d => (
          <SmartLink
            key={d.name}
            to={d.to}
            className="group rounded-lg border border-borderSubtle bg-panel hover:border-select/40 transition-colors p-4 flex flex-col justify-between gap-8 min-h-[140px]"
          >
            <span className="font-mono text-label tnum text-textMuted">{d.n}</span>
            <span className="flex flex-col gap-1">
              <span className="font-mono text-data font-bold uppercase tracking-wider text-textPrimary">{d.name}</span>
              <span className="text-caption text-textMuted leading-relaxed">{d.sub}</span>
            </span>
          </SmartLink>
        ))}
      </div>
    </section>

    {/* ── Community ── */}
    <section className="px-6 md:px-10 py-20 max-w-6xl mx-auto">
      <span className="font-mono text-label font-semibold uppercase tracking-[0.25em] text-textSecondary">
        Community
      </span>
      <h2 className="mt-3 text-3xl md:text-4xl font-bold tracking-tight">Built in the open.</h2>
      <p className="mt-4 text-body text-textSecondary leading-relaxed max-w-xl">
        A desk for theses, feature requests and feedback, with the roadmap published beside it: what is
        planned, what is being built, what shipped. Anything you write stays in your browser.
      </p>
      <div className="mt-8 border border-borderSubtle bg-panel rounded-lg overflow-hidden">
        {SEED_IDEAS.slice(0, 3).map(idea => (
          // Phones stack: the ticker and direction chip still eat a third of a
          // 342px row, and the quote is the whole point of it, so below `sm` the
          // quote gets its own full-width line and clamps to three instead.
          <div
            key={idea.id}
            className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-5 py-4 border-b border-borderSubtle/50 last:border-0"
          >
            {/* No vote box. These are the app's own worked examples on a desk with
                no accounts and no server, so a tally affordance would offer the
                reader a vote nobody can cast. */}
            <span className="flex items-center gap-3 sm:gap-4 shrink-0">
              <span className="font-mono text-caption font-bold text-textPrimary shrink-0">{idea.ticker}</span>
              <span
                className={`inline-flex items-center rounded px-1.5 py-0.5 font-mono text-micro font-bold uppercase tracking-wider shrink-0 ${
                  idea.direction === 'BULLISH' ? 'bg-bull/10 text-bull' : 'bg-bear/10 text-bear'
                }`}
              >
                {idea.direction}
              </span>
            </span>
            <span className="min-w-0 flex-1 text-caption text-textSecondary line-clamp-3 sm:line-clamp-none sm:truncate">
              "{idea.thesis}"
            </span>
            <span className="ml-auto hidden md:block font-mono text-micro text-textMuted shrink-0">
              {idea.author}
            </span>
          </div>
        ))}
        <Link
          to="/community"
          className="flex items-center justify-center gap-1.5 py-3 font-mono text-label uppercase tracking-wider text-textSecondary hover:text-select hover:bg-rowHover transition-colors"
        >
          Open the community <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </section>

    {/* ── Pricing ── */}
    <section id="pricing" className="px-6 md:px-10 py-20 max-w-6xl mx-auto">
      <span className="font-mono text-label font-semibold uppercase tracking-[0.25em] text-textSecondary">
        Pricing
      </span>
      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-5 items-stretch">
        {TIERS.map(tier => (
          <TiltBox
            key={tier.name}
            maxTilt={4}
            className={tier.featured ? 'border-select/50 bg-select/[0.03]' : ''}
          >
            <div className="h-full p-6 flex flex-col gap-4">
              {/* Badge lives inside the card — TiltBox clips overflow, so a
                  border-straddling chip would get cut in half. */}
              {tier.featured && (
                <span className="self-start inline-flex px-2 py-0.5 rounded font-mono text-micro font-bold uppercase tracking-widest text-ink holo-bg">
                  The whole desk
                </span>
              )}
              <div>
                <h3 className="text-read font-bold text-textPrimary tracking-tight">{tier.name}</h3>
                <span className="block mt-0.5 font-mono text-micro font-semibold uppercase tracking-widest text-textMuted">
                  {tier.kicker}
                </span>
                <div className="mt-3 flex items-baseline gap-1.5">
                  <span className="text-3xl font-bold tracking-tight text-textPrimary tnum">{tier.price}</span>
                  <span className="font-mono text-label text-textMuted">{tier.period}</span>
                </div>
              </div>
              <ul className="flex flex-col gap-2.5">
                {tier.features.map(f => (
                  <li key={f} className="flex items-start gap-2 text-caption text-textSecondary leading-snug">
                    <Check
                      className={`w-3.5 h-3.5 shrink-0 mt-px ${tier.featured ? 'text-select' : 'text-textMuted'}`}
                    />
                    {f}
                  </li>
                ))}
              </ul>
              <SmartLink
                to={tier.to}
                className={`mt-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-md font-mono text-caption font-semibold uppercase tracking-wider transition-colors ${
                  tier.featured
                    ? 'holo-bg text-ink'
                    : 'border border-borderMuted text-textSecondary hover:text-textPrimary hover:bg-rowHover'
                }`}
              >
                {tier.cta}
              </SmartLink>
            </div>
          </TiltBox>
        ))}
      </div>
      <p className="mt-6 text-center font-mono text-micro uppercase tracking-wider text-textMuted">
        Prices in USD · sign in to check out · access is granted at payment · cancel anytime
      </p>

      <ComparePlans />
    </section>

    {/* ── FAQ ── */}
    <Faq />

    {/* ── Closing CTA ── */}
    <section className="px-6 md:px-10 py-20 border-t border-borderSubtle text-center">
      <h2 className="text-3xl md:text-4xl font-bold tracking-tight max-w-2xl mx-auto">
        Trade with the machine,
        <br />
        not against it.
      </h2>
      <div className="mt-8 flex items-center justify-center gap-4 flex-wrap">
        <SmartLink
          to="/terminal"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md font-mono text-data font-semibold uppercase tracking-wider text-ink holo-bg holo-glow transition-transform hover:scale-[1.03]"
        >
          Launch terminal <ArrowRight className="w-4 h-4" />
        </SmartLink>
        <a
          href="#pricing"
          className="inline-flex items-center px-5 py-2.5 rounded-md border border-borderMuted font-mono text-data uppercase tracking-wider text-textSecondary hover:text-textPrimary hover:bg-rowHover transition-colors"
        >
          See pricing
        </a>
      </div>
    </section>

    <SiteFooter />
  </div>
  );
};

export default Landing;
