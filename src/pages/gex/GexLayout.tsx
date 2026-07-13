import { useLocation, useOutlet } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useMarketData } from '../../context/MarketDataContext';
import PageHeader from '../../components/ui/PageHeader';
import TickerSearch from '../../components/ui/TickerSearch';
import SubNav from '../../components/ui/SubNav';
import { GEX_SUBPAGES } from './subnav';

/** Section shell for Pinpoint — header, ticker context and subpage tabs.
    Header + tabs hold still; only the subpage body cross-fades on tab change. */
const GexLayout = () => {
  const { activeTicker, changeTicker } = useMarketData();
  const location = useLocation();
  const outlet = useOutlet();

  const active = GEX_SUBPAGES.find(page => location.pathname.startsWith(page.path)) ?? GEX_SUBPAGES[0];

  return (
    <>
      <PageHeader
        breadcrumb={['Terminal', 'Pinpoint', active.label]}
        title="Pinpoint"
        subtitle={active.subtitle}
        actions={<TickerSearch value={activeTicker} onChange={changeTicker} />}
      />
      <SubNav ariaLabel="Pinpoint subpages" items={GEX_SUBPAGES} />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col gap-4"
        >
          {outlet}
        </motion.div>
      </AnimatePresence>
    </>
  );
};

export default GexLayout;
