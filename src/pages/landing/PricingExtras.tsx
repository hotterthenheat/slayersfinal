/*
==================================================
  SLAYER TERMINAL - PRICING EXTRAS (landing)
  Compare-plans matrix + FAQ accordion. Feature rows
  are OUR pages and engines — information catered to
  Slayer, presentation in house grammar.
==================================================
*/

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, Clock, Minus } from 'lucide-react';

// ---- compare plans -----------------------------------------------------------

type Avail = boolean | 'soon';

interface FeatureRow {
  label: string;
  detail: string;
  badge?: string;
  /** [Pinpoint, Compass, Lifetime] */
  tiers: [Avail, Avail, Avail];
}

const TIER_COLS = ['Pinpoint', 'Compass', 'Lifetime'];

const ROWS: FeatureRow[] = [
  {
    label: 'Pulse',
    detail: 'Chart with walls, flip & king, dealer pressure, order flow',
    tiers: [true, true, true],
  },
  {
    label: 'Pinpoint',
    detail: 'GEX · DEX · VEX by strike — exposure matrix & positioning map',
    tiers: [true, true, true],
  },
  {
    label: 'Ranked Targets',
    detail: 'Every strike scored 0–100 — the levels that matter today',
    tiers: [true, true, true],
  },
  {
    label: 'Trace',
    detail: 'Streaming options tape, sweeps, blocks & dark-pool prints',
    tiers: [true, true, true],
  },
  {
    label: 'Tracker & Workspace',
    detail: 'Bookmarked setups with live monitoring, saved desk layouts',
    tiers: [true, true, true],
  },
  {
    label: 'Discord chat & alerts',
    detail: 'Real-time community and setup alerts to your phone',
    tiers: [true, true, true],
  },
  {
    label: 'Compass',
    detail: 'Graded setups with ENTER / EXIT calls, explained in plain English',
    tiers: [false, true, true],
  },
  {
    label: 'Vanna & Charm',
    detail: 'How the levels migrate as time decays and volatility shifts',
    tiers: [false, true, true],
  },
  {
    label: 'Volatility Lab',
    detail: 'IV surface, term structure & expected move',
    tiers: [false, true, true],
  },
  {
    label: 'Contract health scores',
    detail: 'Live health & momentum across the whole chain',
    tiers: [false, true, true],
  },
  {
    label: 'Prove It',
    detail: 'Monte Carlo modeling, predictive analytics & the model scoreboard',
    tiers: [false, true, true],
  },
  {
    label: 'Research suite',
    detail: 'Stocks board, news outcome model & the earnings hub',
    tiers: [false, true, true],
  },
  {
    label: 'Private 1-on-1 onboarding',
    detail: 'A dedicated session to set up your desk',
    tiers: [false, false, true],
  },
  {
    label: 'Early beta access',
    detail: 'New tools before they ship to everyone',
    tiers: [false, false, true],
  },
];

const AvailCell = ({ a }: { a: Avail }) => (
  <span
    className={`inline-flex w-6 h-6 rounded-full items-center justify-center border ${
      a === 'soon'
        ? 'border-warn/30 bg-warn/10'
        : a
          ? 'border-select/25 bg-select/10'
          : 'border-borderSubtle bg-white/[0.02]'
    }`}
  >
    {a === 'soon' ? (
      <Clock className="w-3 h-3 text-warn" />
    ) : a ? (
      <Check className="w-3 h-3 text-select" />
    ) : (
      <Minus className="w-3 h-3 text-textMuted/50" />
    )}
  </span>
);

export const ComparePlans = () => (
  <div className="mt-16">
    <h3 className="text-center text-2xl md:text-3xl font-bold tracking-tight">Compare plans</h3>
    <div className="mt-8 border border-borderSubtle bg-panel rounded-lg overflow-x-auto">
      <div className="min-w-[640px]">
        {/* Header */}
        <div className="flex items-center px-5 py-3 border-b border-borderSubtle">
          <span className="flex-grow font-mono text-[10px] font-bold uppercase tracking-widest text-textMuted">
            Features
          </span>
          {TIER_COLS.map((t, i) => (
            <span
              key={t}
              className={`w-28 text-center font-mono text-[10px] font-bold uppercase tracking-widest ${
                i === 1 ? 'text-select' : 'text-textSecondary'
              }`}
            >
              {t}
            </span>
          ))}
        </div>
        {/* Rows */}
        {ROWS.map(row => (
          <div key={row.label} className="flex items-center px-5 py-3.5 border-b border-borderSubtle/50 last:border-0">
            <div className="flex-grow min-w-0 pr-4">
              <span className="flex items-center gap-2">
                <span className="text-[13px] font-bold text-textPrimary tracking-tight">{row.label}</span>
                {row.badge && (
                  <span className="inline-flex items-center rounded border border-warn/30 bg-warn/10 px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-widest text-warn">
                    {row.badge}
                  </span>
                )}
              </span>
              <span className="block mt-0.5 text-[11px] text-textSecondary leading-snug">{row.detail}</span>
            </div>
            {row.tiers.map((a, i) => (
              <span key={i} className="w-28 flex justify-center shrink-0">
                <AvailCell a={a} />
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  </div>
);

// ---- FAQ -----------------------------------------------------------------------

const FAQS = [
  {
    q: 'Do you offer alerts and signals?',
    a: "Yes — that's Compass. Every setup is graded 0–100 and carries a live read: QUALIFIED, WATCH or FADED, with the reasoning in plain English. Discord alerts fire the moment a setup is detected. The terminal reads the tape — you decide and you place it.",
  },
  {
    q: 'Is the data live?',
    a: 'The terminal currently runs on a simulated feed while we finish the platform — every panel, engine and animation is the real product. Live market data lands with launch, and nothing about the interface changes when it does.',
  },
  {
    q: 'What makes Slayer different from other GEX tools?',
    a: "Most tools show you a chart of gamma and leave you to figure it out. Slayer maps the structure — walls, flip, pin, king strike — then grades the actual contracts that trade it, and keeps watching after you enter. It's the difference between a weather map and a pilot.",
  },
  {
    q: 'Do I need to be an options expert?',
    a: 'No. Every page explains itself in plain English — what a wall is, why the flip matters, what dealers are forced to do at each level. Real trading terms stay; jargon and buzzwords were deliberately purged.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes — subscriptions are month to month and stop at the end of your billing cycle, no questions. Lifetime is a single payment, forever. Billing questions: info@slayerterminal.com.',
  },
];

export const Faq = () => {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="px-6 md:px-10 py-20 max-w-3xl mx-auto">
      <div className="text-center">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.25em] text-textSecondary">FAQ</span>
        <h2 className="mt-3 text-3xl md:text-4xl font-bold tracking-tight">
          Questions, <span className="text-textMuted">answered.</span>
        </h2>
      </div>
      <div className="mt-10 border border-borderSubtle bg-panel rounded-lg overflow-hidden">
        {FAQS.map((item, i) => {
          const isOpen = open === i;
          return (
            <div key={item.q} className="border-b border-borderSubtle/60 last:border-0">
              <button
                onClick={() => setOpen(isOpen ? null : i)}
                className="w-full flex items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-white/[0.02]"
              >
                <span className={`flex-grow text-[14px] font-semibold tracking-tight ${isOpen ? 'text-textPrimary' : 'text-textSecondary'}`}>
                  {item.q}
                </span>
                <motion.span animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}>
                  <ChevronDown className="w-4 h-4 text-textMuted" />
                </motion.span>
              </button>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                    className="overflow-hidden"
                  >
                    <p className="px-5 pb-5 text-[13px] text-textSecondary leading-relaxed">{item.a}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </section>
  );
};
