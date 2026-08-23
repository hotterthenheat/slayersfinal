import { useLocation, useOutlet } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import PageHeader from '../../components/ui/PageHeader';
import { GEX_SUBPAGES } from './subnav';
import { DUR, EASE } from '../../lib/motion';

/** Section shell for Pinpoint — header, ticker context and subpage tabs.
    Header + tabs hold still; only the subpage body cross-fades on tab change. */
const GexLayout = () => {
  const location = useLocation();
  const outlet = useOutlet();

  const active = GEX_SUBPAGES.find(page => location.pathname.startsWith(page.path)) ?? GEX_SUBPAGES[0];

  return (
    <PageHeader
      title="Pinpoint"
      subtitle={active.subtitle}
      items={GEX_SUBPAGES}
      itemsLabel="Pinpoint subpages"
    >
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
    </PageHeader>
  );
};

export default GexLayout;
