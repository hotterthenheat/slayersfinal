import { useLocation, useOutlet } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useMarketData } from '../../context/MarketDataContext';
import PageHeader from '../../components/ui/PageHeader';
import TickerSearch from '../../components/ui/TickerSearch';
import StatRibbon from '../../components/ui/StatRibbon';
import { deriveMarketKpis } from '../../data/kpis';
import SubNav from '../../components/ui/SubNav';
import { FLOWDESK_SUBPAGES } from './subnav';

/** Section shell for Trace — header, ticker context and subpage tabs.
    Header + tabs hold still; only the subpage body cross-fades on tab change. */
const FlowDeskLayout = () => {
  const { activeTicker, changeTicker, marketData } = useMarketData();
  const location = useLocation();
  const outlet = useOutlet();

  const active = FLOWDESK_SUBPAGES.find(page => location.pathname.startsWith(page.path)) ?? FLOWDESK_SUBPAGES[0];

  return (
    <>
      <PageHeader
        breadcrumb={['Terminal', 'Trace', active.label]}
        title="Trace"
        subtitle={active.subtitle}
        ribbon={marketData ? <StatRibbon stats={deriveMarketKpis(marketData)} /> : undefined}
        actions={<TickerSearch value={activeTicker} onChange={changeTicker} />}
      />
      <SubNav ariaLabel="Trace subpages" items={FLOWDESK_SUBPAGES} />
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

export default FlowDeskLayout;
