import { Routes, Route, Navigate } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import { MarketDataProvider } from './context/MarketDataContext';
import { TrackerProvider } from './context/TrackerContext';
import AppShell from './components/layout/AppShell';
import { LaunchProvider } from './components/layout/LaunchTransition';
import Compass from './pages/Compass';
import Tracker from './pages/Tracker';
import GexLayout from './pages/gex/GexLayout';
import Pulse from './pages/Pulse';
import Workspace from './pages/workspace/Workspace';
import ExposureProfile from './pages/gex/ExposureProfile';
import RankedTargets from './pages/gex/RankedTargets';
import VannaCharm from './pages/gex/VannaCharm';
import VolLab from './pages/gex/VolLab';
import GexHistory from './pages/gex/GexHistory';
import FlowDeskLayout from './pages/flowdesk/FlowDeskLayout';
import LiveTape from './pages/flowdesk/LiveTape';
import FlowScanner from './pages/flowdesk/FlowScanner';
import FlowTracker from './pages/flowdesk/FlowTracker';
import DarkPool from './pages/flowdesk/DarkPool';
import Stocks from './pages/Stocks';
import News from './pages/News';
import EarningsHub from './pages/EarningsHub';
import ProveIt from './pages/proveit/ProveIt';
import Landing from './pages/landing/Landing';
import CommunityLayout from './pages/community/CommunityLayout';
import Ideas from './pages/community/Ideas';
import Requests from './pages/community/Requests';
import Feedback from './pages/community/Feedback';

const App = () => {
  return (
    <MotionConfig reducedMotion="user">
      <MarketDataProvider>
        <TrackerProvider>
        <LaunchProvider>
        <Routes>
          {/* Public landing — full-bleed, outside the app shell. First thing a
              visitor sees; "Launch terminal" plays the gate into /pulse. */}
          <Route path="/" element={<Landing />} />
          <Route path="/welcome" element={<Navigate to="/" replace />} />
          <Route element={<AppShell />}>
            <Route path="/home" element={<Navigate to="/pulse" replace />} />
            <Route path="/pulse" element={<Pulse />} />
            <Route path="/live-terminal" element={<Navigate to="/pulse" replace />} />
            <Route path="/workspace" element={<Workspace />} />
            <Route path="/compass" element={<Compass />} />
            <Route path="/skys-vision" element={<Navigate to="/compass" replace />} />
            <Route path="/stocks" element={<Stocks />} />
            <Route path="/news" element={<News />} />
            <Route path="/earnings" element={<EarningsHub />} />
            <Route path="/prove-it" element={<ProveIt />} />
            <Route path="/tracker" element={<Tracker />} />
            <Route path="/pinpoint" element={<GexLayout />}>
              <Route index element={<Navigate to="/pinpoint/exposure-profile" replace />} />
              <Route path="command" element={<Navigate to="/pulse" replace />} />
              <Route path="flow-map" element={<Navigate to="/pulse" replace />} />
              <Route path="exposure-profile" element={<ExposureProfile />} />
              <Route path="ranked-targets" element={<RankedTargets />} />
              <Route path="strike-profile" element={<Navigate to="/pinpoint/exposure-profile" replace />} />
              <Route path="vanna-charm" element={<VannaCharm />} />
              <Route path="vol-lab" element={<VolLab />} />
              <Route path="history" element={<GexHistory />} />
            </Route>
            <Route path="/trace" element={<FlowDeskLayout />}>
              <Route index element={<Navigate to="/trace/live-tape" replace />} />
              <Route path="live-tape" element={<LiveTape />} />
              <Route path="dark-pool" element={<DarkPool />} />
              <Route path="dark-feed" element={<Navigate to="/trace/dark-pool" replace />} />
              <Route path="scanner" element={<FlowScanner />} />
              <Route path="tracker" element={<FlowTracker />} />
            </Route>
            <Route path="/liquidity" element={<Navigate to="/trace" replace />} />
            {/* Legacy section paths from before the rebrand */}
            <Route path="/flow-desk/*" element={<Navigate to="/trace" replace />} />
            <Route path="/pinpoint-gex/*" element={<Navigate to="/pinpoint" replace />} />
            <Route path="/community" element={<CommunityLayout />}>
              <Route index element={<Navigate to="/community/ideas" replace />} />
              <Route path="ideas" element={<Ideas />} />
              <Route path="requests" element={<Requests />} />
              <Route path="feedback" element={<Feedback />} />
            </Route>
            <Route path="/auditor-log" element={<Navigate to="/tracker" replace />} />
          </Route>
        </Routes>
        </LaunchProvider>
        </TrackerProvider>
      </MarketDataProvider>
    </MotionConfig>
  );
};

export default App;
