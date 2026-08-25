import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import { MarketDataProvider } from './context/MarketDataContext';
import { TrackerProvider } from './context/TrackerContext';
import AppShell from './components/layout/AppShell';
import PageFault from './components/ui/PageFault';
import { LaunchProvider } from './components/layout/LaunchTransition';
import Compass from './pages/Compass';
import Tracker from './pages/Tracker';
import PinpointLayout from './pages/pinpoint/PinpointLayout';
import Pulse from './pages/workspace/Pulse';
import PulseBoard from './pages/PulseBoard';
import ExposureProfile from './pages/pinpoint/ExposureProfile';
import RankedTargets from './pages/pinpoint/RankedTargets';
import VannaCharm from './pages/pinpoint/VannaCharm';
import TraceLayout from './pages/trace/TraceLayout';
import LiveTape from './pages/trace/LiveTape';
import FlowTracker from './pages/trace/FlowTracker';
import Stocks from './pages/Stocks';
import EarningsHub from './pages/EarningsHub';
import EarningsDossier from './pages/EarningsDossier';
import ProveIt from './pages/proveit/ProveIt';
import Landing from './pages/landing/Landing';
import CommunityLayout from './pages/community/CommunityLayout';
import Ideas from './pages/community/Ideas';
import Requests from './pages/community/Requests';
import Feedback from './pages/community/Feedback';

const App = () => {
  /*
    THE OUTERMOST NET, AND WHY IT IS NOT REDUNDANT WITH APPSHELL'S.

    AppShell wraps its <Outlet /> in the same component, which covers every
    desk. Two things are not under that Outlet: the landing page, which is
    routed outside AppShell entirely, and AppShell's own chrome — TopBar and
    the command palette render above the Outlet, not inside it. Both were
    checked by wiring a throw to a query parameter and loading it: a desk page
    throwing rendered the fault panel with the header still there, while the
    landing page and TopBar each gave a white screen, 0 characters and nothing
    to click.

    Keyed on the path for the same reason AppShell's is: navigating somewhere
    else earns a clean try, and it is a prop rather than a React key so
    nothing below remounts on an ordinary render.
  */
  const location = useLocation();
  return (
    <MotionConfig reducedMotion="user">
      <MarketDataProvider>
        <TrackerProvider>
        <LaunchProvider>
        <PageFault resetKey={location.pathname}>
        <Routes>
          {/* Public landing — full-bleed, outside the app shell. First thing a
              visitor sees; "Launch terminal" plays the gate into /pulse. */}
          <Route path="/" element={<Landing />} />
          <Route path="/welcome" element={<Navigate to="/" replace />} />
          <Route element={<AppShell />}>
            <Route path="/home" element={<Navigate to="/pulse" replace />} />
            <Route path="/pulse" element={<Pulse />} />
            <Route path="/pulse/board" element={<PulseBoard />} />
            <Route path="/live-terminal" element={<Navigate to="/pulse" replace />} />
            {/* Workspace merged INTO Pulse (2026-08-17) — old links land there */}
            <Route path="/workspace" element={<Navigate to="/pulse" replace />} />
            <Route path="/compass" element={<Compass />} />
            <Route path="/skys-vision" element={<Navigate to="/compass" replace />} />
            <Route path="/stocks" element={<Stocks />} />
            {/* News unrouted (2026-08-24): nothing in the data entitlements
                carries headline text, and the generator attributed invented
                headlines — including rating actions with price targets — to
                real mastheads and real banks. Page kept on disk for the day a
                wire is licensed, same treatment as Vol Lab and Dark Pool. */}
            <Route path="/news" element={<Navigate to="/pulse" replace />} />
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
              {/* Launch trim (Noah, 2026-08-17): Vol Lab + History & Replay
                  unrouted — pages kept on disk, engines still feed widgets */}
              <Route path="vol-lab" element={<Navigate to="/pinpoint/exposure-profile" replace />} />
              <Route path="history" element={<Navigate to="/pinpoint/exposure-profile" replace />} />
            </Route>
            <Route path="/trace" element={<TraceLayout />}>
              <Route index element={<Navigate to="/trace/live-tape" replace />} />
              <Route path="live-tape" element={<LiveTape />} />
              {/* Launch trim (Noah, 2026-08-17): Dark Pool + Scanner unrouted.
                  Dark-pool prints still draw as levels on the Pulse chart via
                  buildPrints(); the tape carries blocks and sweeps only. */}
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
        </PageFault>
        </LaunchProvider>
        </TrackerProvider>
      </MarketDataProvider>
    </MotionConfig>
  );
};

export default App;
