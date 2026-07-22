import { useLocation, useOutlet } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import PageHeader from '../../components/ui/PageHeader';
import SubNav from '../../components/ui/SubNav';
import { GUIDE_SUBPAGES } from './subnav';

/** Section shell for the in-app Help / Guide — header, subpage tabs, cross-fade body. */
const GuideLayout = () => {
  const location = useLocation();
  const outlet = useOutlet();

  const active =
    GUIDE_SUBPAGES.find(page => location.pathname.startsWith(page.path)) ?? GUIDE_SUBPAGES[0];

  return (
    <div className="max-w-5xl mx-auto w-full">
      <PageHeader breadcrumb={['Terminal', 'Guide', active.label]} title="Guide & Help" subtitle={active.subtitle} />
      <div className="mt-4">
        <SubNav ariaLabel="Guide subpages" items={GUIDE_SUBPAGES} />
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="mt-5 flex flex-col gap-7"
        >
          {outlet}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default GuideLayout;
