import { lazy, Suspense, useEffect } from 'react';
import { SkeletonRows } from './components/ui/Skeleton';
import { Routes, Route, Navigate, useLocation, useSearchParams } from 'react-router-dom';
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
import { GammaDesk, LevelsDesk, GreeksDesk, StressDesk } from './pages/gex/desks';
import GexHistory from './pages/gex/GexHistory';
import FlowDeskLayout from './pages/flowdesk/FlowDeskLayout';
import LiveTape from './pages/flowdesk/LiveTape';
import GammaTape from './pages/flowdesk/GammaTape';
import InformedFlow from './pages/flowdesk/InformedFlow';
import FlowScanner from './pages/flowdesk/FlowScanner';
import MetaorderReconstruction from './components/flowdesk/MetaorderReconstruction';
import DarkPool from './pages/flowdesk/DarkPool';
import Stocks from './pages/Stocks';
import EarningsHub from './pages/EarningsHub';
import Landing from './pages/landing/Landing';
import TerminalIndex from './pages/terminal/TerminalIndex';
import { writeLastDesk } from './pages/terminal/lastDesk';
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

// The trailer is a self-contained 78-second timeline with seventeen scenes and
// its own story layer. None of it is reachable from a desk, so it has no
// business in the initial bundle: lazy-loading keeps the landing page and every
// route that is not /trailer free of it.
const SlayerTrailer = lazy(() => import('./pages/trailer/SlayerTrailer'));

/** One loading grammar for the whole app — the Skeleton sheen, not a second
    animation. `animate-pulse` here was a third language competing with the
    launch gate and the skeletons. */
const RouteFallback = () => (
  <div className="p-4">
    <SkeletonRows rows={8} />
  </div>
);

/** The Volatility desk left Pinpoint for Prove It: a calibrated IV surface and
    the density it implies are what a model says, not where dealers are hedged.
    Its density half carried its own `?view=` name, so that link is carried over
    rather than dropping every old bookmark on the surface. */
const VolatilityMoved = () => {
  const [params] = useSearchParams();
  return <Navigate to={`/prove-it?view=${params.get('view') === 'density' ? 'density' : 'volatility'}`} replace />;
};

/** The terminal index's Resume row is the only reader of this. It records where
    the user was, never what the market did; `writeLastDesk` ignores everything
    that is not a desk, so the index, the Guide and the legal pages never
    overwrite a real destination. */
const LastDeskRecorder = () => {
  const { pathname } = useLocation();
  useEffect(() => {
    writeLastDesk(pathname);
  }, [pathname]);
  return null;
};

const App = () => {
  return (
    <MotionConfig reducedMotion="user">
      <ToastProvider>
      <MarketDataProvider>
        <TrackerProvider>
        <LaunchProvider>
        <FocusProvider>
        <LastDeskRecorder />
        <Routes>
          {/* Public landing — full-bleed, outside the app shell. First thing a
              visitor sees; "Launch terminal" plays the gate into /terminal. */}
          <Route path="/" element={<Landing />} />
          <Route path="/welcome" element={<Navigate to="/" replace />} />
          {/* Full-bleed and outside the app shell, like the landing page: the
              trailer owns the viewport and supplies its own chrome. */}
          <Route
            path="/trailer"
            element={
              <Suspense fallback={<RouteFallback />}>
                <SlayerTrailer />
              </Suspense>
            }
          />
          {/* Retired routes → the quant desk is Prove It */}
          <Route path="/experience" element={<Navigate to="/prove-it" replace />} />
          <Route path="/quant-lab" element={<Navigate to="/prove-it" replace />} />
          <Route path="/immersive" element={<Navigate to="/prove-it" replace />} />
          <Route element={<AppShell />}>
            {/* Home is the index, not a desk: it inherits the top bar, so the
                nav is there to guide the visitor the moment they arrive. Not
                lazy — a Suspense fallback on the app's front door is the wrong
                trade for a page that loads no data. */}
            <Route path="/terminal" element={<TerminalIndex />} />
            <Route path="/home" element={<Navigate to="/terminal" replace />} />
            <Route path="/pulse" element={<PulseWorkspace />} />
            <Route path="/live-terminal" element={<Navigate to="/pulse" replace />} />
            {/* Workspace folded into Pulse — Pulse is the one customizable desk */}
            <Route path="/workspace" element={<Navigate to="/pulse" replace />} />
            <Route path="/compass" element={<Compass />} />
            <Route path="/stocks" element={<Stocks />} />
            <Route path="/earnings" element={<EarningsHub />} />
            <Route path="/prove-it" element={<Suspense fallback={<RouteFallback />}><ProveIt /></Suspense>} />
            {/* Fracture folded into Pinpoint Stress; Lotto folded into Compass */}
            <Route path="/fracture" element={<Navigate to="/pinpoint/stress?view=fracture" replace />} />
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
              {/* Five consolidated desks; the second read on each lives as an
                  in-desk ?view= sub-toggle rather than its own tab. */}
              <Route path="gamma" element={<GammaDesk />} />
              <Route path="levels" element={<LevelsDesk />} />
              <Route path="greeks" element={<GreeksDesk />} />
              <Route path="stress" element={<StressDesk />} />
              <Route path="history" element={<GexHistory />} />
              {/* Retired sub-desks → consolidated desk + the matching sub-view */}
              <Route path="complex" element={<Navigate to="/pinpoint/gamma?view=complex" replace />} />
              <Route path="exposure-profile" element={<Navigate to="/pinpoint/levels" replace />} />
              <Route path="strike-profile" element={<Navigate to="/pinpoint/levels" replace />} />
              <Route path="ranked-targets" element={<Navigate to="/pinpoint/levels?view=ranked" replace />} />
              <Route path="greeks-regime" element={<Navigate to="/pinpoint/greeks" replace />} />
              <Route path="vanna-charm" element={<Navigate to="/pinpoint/greeks?view=migration" replace />} />
              {/* Volatility moved out of the section entirely — these land on
                  Prove It directly, never on a redirect that redirects again. */}
              <Route path="volatility" element={<VolatilityMoved />} />
              <Route path="vol-lab" element={<Navigate to="/prove-it?view=volatility" replace />} />
              <Route path="state-density" element={<Navigate to="/prove-it?view=density" replace />} />
              <Route path="hedge-impact" element={<Navigate to="/pinpoint/stress" replace />} />
              <Route path="fracture" element={<Navigate to="/pinpoint/stress?view=fracture" replace />} />
            </Route>
            <Route path="/trace" element={<FlowDeskLayout />}>
              <Route index element={<Navigate to="/trace/live-tape" replace />} />
              <Route path="live-tape" element={<LiveTape />} />
              <Route path="gamma-tape" element={<GammaTape />} />
              <Route path="informed-flow" element={<InformedFlow />} />
              <Route path="dark-pool" element={<DarkPool />} />
              {/* Liquidity Map moved to Pulse — it's an order-flow overlay surface, not a Trace desk */}
              <Route path="liquidity" element={<Navigate to="/pulse" replace />} />
              <Route path="dark-feed" element={<Navigate to="/trace/dark-pool" replace />} />
              <Route path="scanner" element={<FlowScanner />} />
              <Route path="reconstruction" element={<MetaorderReconstruction />} />
              {/* FlowTracker folded away — Scanner is the single flow-hunting
                  surface, /tracker the single persistent watch home. */}
              <Route path="tracker" element={<Navigate to="/trace/scanner" replace />} />
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
              the terminal index instead of rendering a blank page: a stale
              bookmark should land somewhere neutral, not inside a desk. */}
          <Route path="*" element={<Navigate to="/terminal" replace />} />
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
