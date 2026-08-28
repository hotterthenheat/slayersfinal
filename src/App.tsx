import { Routes, Route, Navigate } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import { MarketDataProvider } from './context/MarketDataContext';
import { TrackerProvider } from './context/TrackerContext';
import AppShell from './components/layout/AppShell';
import { LaunchProvider } from './components/layout/LaunchTransition';
import Compass from './pages/Compass';
import Weigher from './pages/Weigher';
import Tracker from './pages/Tracker';
import PinpointLayout from './pages/pinpoint/PinpointLayout';
import Pulse from './pages/workspace/Pulse';
import PulseBoard from './pages/PulseBoard';
import Terrain from './pages/terrain/Terrain';
import ExposureProfile from './pages/pinpoint/ExposureProfile';
import RankedTargets from './pages/pinpoint/RankedTargets';
import VannaCharm from './pages/pinpoint/VannaCharm';
import ExpiryLadder from './pages/pinpoint/ExpiryLadder';
import TraceLayout from './pages/trace/TraceLayout';
import LiveTape from './pages/trace/LiveTape';
import FlowTracker from './pages/trace/FlowTracker';
import Stocks from './pages/Stocks';
import News from './pages/News';
import EarningsHub from './pages/EarningsHub';
import EarningsDossier from './pages/EarningsDossier';
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
            <Route path="/pulse/board" element={<PulseBoard />} />
            <Route path="/terrain" element={<Terrain />} />
            <Route path="/live-terminal" element={<Navigate to="/pulse" replace />} />
            {/* Workspace merged INTO Pulse (2026-08-17) — old links land there */}
            <Route path="/workspace" element={<Navigate to="/pulse" replace />} />
            <Route path="/compass" element={<Compass />} />
            <Route path="/weigher" element={<Weigher />} />
            <Route path="/skys-vision" element={<Navigate to="/compass" replace />} />
            <Route path="/stocks" element={<Stocks />} />
            <Route path="/news" element={<News />} />
            <Route path="/earnings" element={<EarningsHub />} />
            <Route path="/earnings/:ticker" element={<EarningsDossier />} />
            <Route path="/prove-it" element={<ProveIt />} />
            <Route path="/tracker" element={<Tracker />} />
            <Route path="/pinpoint" element={<PinpointLayout />}>
              <Route index element={<Navigate to="/pinpoint/exposure-profile" replace />} />
              <Route path="command" element={<Navigate to="/pulse" replace />} />
              <Route path="flow-map" element={<Navigate to="/pulse" replace />} />
              <Route path="exposure-profile" element={<ExposureProfile />} />
              <Route path="ranked-targets" element={<RankedTargets />} />
              <Route path="strike-profile" element={<Navigate to="/pinpoint/exposure-profile" replace />} />
              <Route path="vanna-charm" element={<VannaCharm />} />
              <Route path="expiry-ladder" element={<ExpiryLadder />} />
              {/* Launch trim (Noah, 2026-08-17): Vol Lab + History & Replay
                  unrouted — pages kept on disk, engines still feed widgets */}
              <Route path="vol-lab" element={<Navigate to="/pinpoint/exposure-profile" replace />} />
              <Route path="history" element={<Navigate to="/pinpoint/exposure-profile" replace />} />
            </Route>
            <Route path="/trace" element={<TraceLayout />}>
              <Route index element={<Navigate to="/trace/live-tape" replace />} />
              <Route path="live-tape" element={<LiveTape />} />
              {/* Launch trim (Noah, 2026-08-17): Dark Pool + Scanner unrouted —
                  dark-pool prints still stream on the tape and the charts */}
              <Route path="dark-pool" element={<Navigate to="/trace/live-tape" replace />} />
              <Route path="dark-feed" element={<Navigate to="/trace/live-tape" replace />} />
              <Route path="scanner" element={<Navigate to="/trace/live-tape" replace />} />
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
