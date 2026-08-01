import { useLocation, useOutlet } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { HardDrive } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import SubNav from '../../components/ui/SubNav';
import { COMMUNITY_SUBPAGES } from './subnav';
import { DUR, EASE } from '../../lib/motion';

/**
 * Section shell for Community — header, subpage tabs, cross-faded body.
 *
 * The standing notice is here rather than repeated per tab: this section has no
 * server behind it and never will in this build, and that fact belongs at the
 * top of the section once instead of as three different reassurances further
 * down three different pages.
 */
const CommunityLayout = () => {
  const location = useLocation();
  const outlet = useOutlet();

  const active = COMMUNITY_SUBPAGES.find(page => location.pathname.startsWith(page.path)) ?? COMMUNITY_SUBPAGES[0];

  return (
    <>
      <PageHeader
        breadcrumb={['Terminal', 'Community', active.label]}
        title="Community"
        subtitle={active.subtitle}
      />
      <SubNav ariaLabel="Community subpages" items={COMMUNITY_SUBPAGES} />

      <p className="flex items-start gap-2 rounded-md border border-borderSubtle bg-inset px-3 py-2 text-label text-textSecondary leading-relaxed">
        <HardDrive className="w-3.5 h-3.5 shrink-0 mt-0.5 text-textMuted" aria-hidden="true" />
        <span>
          <span className="font-mono uppercase tracking-wider text-textPrimary">Local to this browser.</span>{' '}
          There are no accounts yet, so nothing you write here is uploaded, shared or seen by anyone else.
          Clearing site data clears it. The Feedback tab can copy or save the whole record so you can send it
          yourself.
        </span>
      </p>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: DUR.base, ease: EASE }}
          className="flex flex-col gap-4"
        >
          {outlet}
        </motion.div>
      </AnimatePresence>
    </>
  );
};

export default CommunityLayout;
