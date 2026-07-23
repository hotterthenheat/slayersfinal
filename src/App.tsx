import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import { MarketDataProvider } from './context/MarketDataContext';
import { TrackerProvider } from './context/TrackerContext';
import { FocusProvider } from './context/FocusContext';
import { ToastProvider } from './components/ui/Toast';
import AppShell from './components/layout/AppShell';
import { LaunchProvider } from './components/layout/LaunchTransition';
import Compass from './pages/Compass';
import Tracker from './pages/Tracker';
import GuideLayout from './pages/guide/GuideLayout';
import GuideOverview from './pages/guide/Overview';
import GuideDesks from './pages/guide/Desks';
import GuideConcepts from './pages/guide/Concepts';
import GuideFaq from './pages/guide/Faq';
import GuideShortcuts from './pages/guide/Shortcuts';
import GexLayout from './pages/gex/GexLayout';
import PulseWorkspace from './pages/pulse/PulseWorkspace';
import ExposureProfile from './pages/gex/ExposureProfile';
import GammaChart from './pages/gex/GammaChart';
import RankedTargets from './pages/gex/RankedTargets';
import VannaCharm from './pages/gex/VannaCharm';
import VolLab from './pages/gex/VolLab';
import GreeksRegime from './pages/gex/GreeksRegime';
import HedgeImpact from './pages/gex/HedgeImpact';
import StatePriceDensity from './components/gex/StatePriceDensity';
import GexHistory from './pages/gex/GexHistory';
import FlowDeskLayout from './pages/flowdesk/FlowDeskLayout';
import LiveTape from './pages/flowdesk/LiveTape';
import FlowScanner from './pages/flowdesk/FlowScanner';
import FlowTracker from './pages/flowdesk/FlowTracker';
import MetaorderReconstruction from './components/flowdesk/MetaorderReconstruction';
import DarkPool from './pages/flowdesk/DarkPool';
import Stocks from './pages/Stocks';
import News from './pages/News';
import EarningsHub from './pages/EarningsHub';
import Fracture from './pages/fracture/Fracture';
import Landing from './pages/landing/Landing';
import CommunityLayout from './pages/community/CommunityLayout';
import Ideas from './pages/community/Ideas';
import Requests from './pages/community/Requests';
import Feedback from './pages/community/Feedback';
import Disclaimer from './pages/legal/Disclaimer';
import Terms from './pages/legal/Terms';
import Privacy from './pages/legal/Privacy';

// Prove It pulls in the full three.js / WebGL stack for the dealer surface.
// Lazy-loading it keeps that ~600KB+ out of the initial bundle so the landing
// page and every other desk paint without downloading the 3D engine.
const ProveIt = lazy(() => import('./pages/proveit/ProveIt'));

const RouteFallback = () => (
  <div className="flex items-center justify-center h-[60vh]">
    <span className="font-mono text-label uppercase tracking-widest text-textMuted animate-pulse">Loading…</span>
  </div>
);

const App = () => {
  return (
    <MotionConfig reducedMotion="user">
      <ToastProvider>
      <MarketDataProvider>
        <TrackerProvider>
        <LaunchProvider>
        <FocusProvider>
        <Routes>
          {/* Public landing — full-bleed, outside the app shell. First thing a
              visitor sees; "Launch terminal" plays the gate into /pulse. */}
          <Route path="/" element={<Landing />} />
          <Route path="/welcome" element={<Navigate to="/" replace />} />
          {/* Retired routes → the quant desk is Prove It */}
          <Route path="/experience" element={<Navigate to="/prove-it" replace />} />
          <Route path="/quant-lab" element={<Navigate to="/prove-it" replace />} />
          <Route path="/immersive" element={<Navigate to="/prove-it" replace />} />
          <Route element={<AppShell />}>
            <Route path="/home" element={<Navigate to="/pulse" replace />} />
            <Route path="/pulse" element={<PulseWorkspace />} />
            <Route path="/live-terminal" element={<Navigate to="/pulse" replace />} />
            {/* Workspace folded into Pulse — Pulse is the one customizable desk */}
            <Route path="/workspace" element={<Navigate to="/pulse" replace />} />
            <Route path="/compass" element={<Compass />} />
            <Route path="/skys-vision" element={<Navigate to="/compass" replace />} />
            <Route path="/stocks" element={<Stocks />} />
            <Route path="/news" element={<News />} />
            <Route path="/earnings" element={<EarningsHub />} />
            <Route path="/prove-it" element={<Suspense fallback={<RouteFallback />}><ProveIt /></Suspense>} />
            {/* Fracture folded under Pinpoint; Lotto folded into Compass */}
            <Route path="/fracture" element={<Navigate to="/pinpoint/fracture" replace />} />
            <Route path="/lotto" element={<Navigate to="/compass" state={{ compassMode: 'lotto' }} replace />} />
            <Route path="/tracker" element={<Tracker />} />
            <Route path="/help" element={<Navigate to="/guide" replace />} />
            <Route path="/guide" element={<GuideLayout />}>
              <Route index element={<Navigate to="/guide/overview" replace />} />
              <Route path="overview" element={<GuideOverview />} />
              <Route path="desks" element={<GuideDesks />} />
              <Route path="concepts" element={<GuideConcepts />} />
              <Route path="faq" element={<GuideFaq />} />
              <Route path="shortcuts" element={<GuideShortcuts />} />
            </Route>
            <Route path="/pinpoint" element={<GexLayout />}>
              <Route index element={<Navigate to="/pinpoint/gamma" replace />} />
              <Route path="command" element={<Navigate to="/pulse" replace />} />
              <Route path="flow-map" element={<Navigate to="/pulse" replace />} />
              <Route path="gamma" element={<GammaChart />} />
              <Route path="exposure-profile" element={<ExposureProfile />} />
              <Route path="ranked-targets" element={<RankedTargets />} />
              <Route path="strike-profile" element={<Navigate to="/pinpoint/exposure-profile" replace />} />
              <Route path="vanna-charm" element={<VannaCharm />} />
              <Route path="greeks-regime" element={<GreeksRegime />} />
              <Route path="hedge-impact" element={<HedgeImpact />} />
              <Route path="fracture" element={<Fracture />} />
              <Route path="vol-lab" element={<VolLab />} />
              <Route path="state-density" element={<StatePriceDensity />} />
              <Route path="history" element={<GexHistory />} />
            </Route>
            <Route path="/trace" element={<FlowDeskLayout />}>
              <Route index element={<Navigate to="/trace/live-tape" replace />} />
              <Route path="live-tape" element={<LiveTape />} />
              <Route path="dark-pool" element={<DarkPool />} />
              {/* Liquidity Map moved to Pulse — it's an order-flow overlay surface, not a Trace desk */}
              <Route path="liquidity" element={<Navigate to="/pulse" replace />} />
              <Route path="dark-feed" element={<Navigate to="/trace/dark-pool" replace />} />
              <Route path="scanner" element={<FlowScanner />} />
              <Route path="reconstruction" element={<MetaorderReconstruction />} />
              <Route path="tracker" element={<FlowTracker />} />
            </Route>
            <Route path="/liquidity" element={<Navigate to="/pulse" replace />} />
            {/* Legacy section paths from before the rebrand — jump straight to the
                section's landing leaf so there's no redirect-of-a-redirect hop. */}
            <Route path="/flow-desk/*" element={<Navigate to="/trace/live-tape" replace />} />
            <Route path="/pinpoint-gex/*" element={<Navigate to="/pinpoint/gamma" replace />} />
            <Route path="/community" element={<CommunityLayout />}>
              <Route index element={<Navigate to="/community/ideas" replace />} />
              <Route path="ideas" element={<Ideas />} />
              <Route path="requests" element={<Requests />} />
              <Route path="feedback" element={<Feedback />} />
            </Route>
            <Route path="/legal/disclaimer" element={<Disclaimer />} />
            <Route path="/legal/terms" element={<Terms />} />
            <Route path="/legal/privacy" element={<Privacy />} />
            <Route path="/auditor-log" element={<Navigate to="/tracker" replace />} />
          </Route>
          {/* Any unmatched URL (typo, stale bookmark, removed path) falls back to
              the terminal home instead of rendering a blank page. */}
          <Route path="*" element={<Navigate to="/pulse" replace />} />
        </Routes>
        </FocusProvider>
        </LaunchProvider>
        </TrackerProvider>
      </MarketDataProvider>
      </ToastProvider>
    </MotionConfig>
  );
};

export default App;
