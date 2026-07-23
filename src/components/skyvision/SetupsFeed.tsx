import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import SignalBadge from '../ui/SignalBadge';
import Sparkline from './Sparkline';
import SetupCard from './SetupCard';
import type { Setup, SetupGroup } from '../../types/skyvision';

// Shared FLIP transition — groups/cards glide to their new rank on each scan
const flip = {
  layout: { duration: 0.35, ease: [0.16, 1, 0.3, 1] as const },
  opacity: { duration: 0.2 },
};

interface SetupsFeedProps {
  groups: SetupGroup[];
  selectedSetupId?: string | null;
  onSelectSetup?: (setup: Setup) => void;
  onOpenAnalysis: (setup: Setup) => void;
}

const SetupsFeed = ({ groups, selectedSetupId, onSelectSetup, onOpenAnalysis }: SetupsFeedProps) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <AnimatePresence initial={false}>
      {groups.map(group => {
        const up = group.changePct >= 0;
        return (
          <motion.div
            key={group.ticker}
            layout
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={flip}
            className="inst-surface rounded-md overflow-hidden"
          >
            {/* Group header */}
            <div className="flex items-center gap-3 px-3 h-10 border-b border-borderSubtle">
              <span className="font-mono text-caption font-bold text-textPrimary tracking-wide leading-4">{group.ticker}</span>
              <SignalBadge tone="neutral">{group.found} found</SignalBadge>
              <Sparkline data={group.sparkline} up={up} />
              <span className="font-mono text-caption font-semibold text-textPrimary tnum leading-4">
                ${group.spot.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="ml-auto font-mono text-micro uppercase tracking-widest text-textMuted">
                Strongest → weakest
              </span>
            </div>

            {/* Setup cards */}
            <div className="p-2.5 flex flex-col gap-2">
              <AnimatePresence initial={false}>
                {group.setups.map((setup, idx) => (
                  <motion.div
                    key={setup.id}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={flip}
                  >
                    <SetupCard
                      setup={setup}
                      expanded={expandedId === setup.id}
                      isSelected={selectedSetupId === setup.id}
                      isTop={idx === 0}
                      onToggle={() => setExpandedId(prev => (prev === setup.id ? null : setup.id))}
                      onSelect={() => onSelectSetup?.(setup)}
                      onOpenAnalysis={() => onOpenAnalysis(setup)}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </motion.div>
        );
      })}
      </AnimatePresence>

      {groups.length === 0 && (
        <div className="inst-surface rounded-md py-12 text-center font-mono text-label text-textMuted">
          No setups meet this scanner's threshold right now
        </div>
      )}
    </div>
  );
};

export default SetupsFeed;
