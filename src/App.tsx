import { lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import { MarketDataProvider } from './context/MarketDataContext';
import { TrackerProvider } from './context/TrackerContext';
import AppShell from './components/layout/AppShell';
import { LaunchProvider } from './components/layout/LaunchTransition';
import PinpointLayout from './pages/pinpoint/PinpointLayout';
import TraceLayout from './pages/trace/TraceLayout';
import Landing from './pages/landing/Landing';
import NotFound from './pages/NotFound';
import CommunityLayout from './pages/community/CommunityLayout';

/*
  FIFTY-TWO PAGES WERE IMPORTED EAGERLY, so every one of them landed in the
  entry chunk and a cold /pulse fetched 2.2 MB of JavaScript to draw a single
  screen. Manual chunking had already split the big libraries out, which
  helped caching and did nothing at all for that first load: the libraries
  were still reached from the entry, because the entry still contained every
  page that imports them.

  These are the leaf pages, and a reader visits one of them at a time. The
  Suspense boundary that catches them is inside AppShell, around the outlet
  only, so the chrome never unmounts while a chunk arrives — see the note
  there for why the fallback is null.

  WHAT STAYS EAGER, and why it is not an oversight: the three section
  layouts (Pinpoint, Trace, Community) are chrome, not content — a lazy
  layout would blank its own tab bar on the way in, which is the flicker
  this arrangement exists to avoid. Landing is the first paint of the app,
  so splitting it would only add a round trip before anything is on screen.
  NotFound is a few lines and has to be there the moment it is needed.
*/
const AlertsPage = lazy(() => import('./pages/Alerts'));
const Backtest = lazy(() => import('./pages/Backtest'));
const Compass = lazy(() => import('./pages/Compass'));
const DarkPool = lazy(() => import('./pages/trace/DarkPool'));
const Disclosures = lazy(() => import('./pages/Disclosures'));
const EarningsDossier = lazy(() => import('./pages/EarningsDossier'));
const EarningsHub = lazy(() => import('./pages/EarningsHub'));
const ExpiryLadder = lazy(() => import('./pages/pinpoint/ExpiryLadder'));
const ExposureCompare = lazy(() => import('./pages/pinpoint/ExposureCompare'));
const ExposureProfile = lazy(() => import('./pages/pinpoint/ExposureProfile'));
const Feedback = lazy(() => import('./pages/community/Feedback'));
const FlowAlerts = lazy(() => import('./pages/trace/FlowAlerts'));
const FlowScanner = lazy(() => import('./pages/trace/FlowScanner'));
const FlowTracker = lazy(() => import('./pages/trace/FlowTracker'));
const Footprints = lazy(() => import('./pages/trace/Footprints'));
const GexHistory = lazy(() => import('./pages/pinpoint/GexHistory'));
const GreekSurfaces = lazy(() => import('./pages/pinpoint/GreekSurfaces'));
const Ideas = lazy(() => import('./pages/community/Ideas'));
const IndexFutures = lazy(() => import('./pages/IndexFutures'));
const IntervalFlowPage = lazy(() => import('./pages/trace/IntervalFlow'));
const Journal = lazy(() => import('./pages/Journal'));
const Leaderboard = lazy(() => import('./pages/community/Leaderboard'));
const LiveTape = lazy(() => import('./pages/trace/LiveTape'));
const MacroDesk = lazy(() => import('./pages/MacroDesk'));
const MemberProfile = lazy(() => import('./pages/community/MemberProfile'));
const ModelError = lazy(() => import('./pages/pinpoint/ModelError'));
const MultiLeg = lazy(() => import('./pages/trace/MultiLeg'));
const NetFlow = lazy(() => import('./pages/trace/NetFlow'));
const NewsRoom = lazy(() => import('./pages/newsroom/NewsRoom'));
const Odte = lazy(() => import('./pages/trace/Odte'));
const OiHeatScreen = lazy(() => import('./pages/pinpoint/OiHeatScreen'));
const OptionChain = lazy(() => import('./pages/weigher/OptionChain'));
const OptionsScreener = lazy(() => import('./pages/trace/OptionsScreener'));
const PainMap = lazy(() => import('./pages/pinpoint/PainMap'));
const ProveIt = lazy(() => import('./pages/proveit/ProveIt'));
const Pulse = lazy(() => import('./pages/workspace/Pulse'));
const PulseBoard = lazy(() => import('./pages/PulseBoard'));
const RankedTargets = lazy(() => import('./pages/pinpoint/RankedTargets'));
const Requests = lazy(() => import('./pages/community/Requests'));
const Stocks = lazy(() => import('./pages/Stocks'));
const Terrain = lazy(() => import('./pages/terrain/Terrain'));
const TickerOverview = lazy(() => import('./pages/TickerOverview'));
const Tracker = lazy(() => import('./pages/Tracker'));
const TradeWindows = lazy(() => import('./pages/trace/Windows'));
const VannaCharm = lazy(() => import('./pages/pinpoint/VannaCharm'));
const VolLab = lazy(() => import('./pages/pinpoint/VolLab'));
const Weigher = lazy(() => import('./pages/Weigher'));

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
            {/* §3 — the multi-expiry chain, the layout every options reader
                already knows. Its own route so it can be linked to. */}
            <Route path="/chain" element={<OptionChain />} />
            {/* The board for when you do not have a name yet — nine
                questions asked of the whole universe rather than of one. */}
            {/* §12 + §13 — one desk, because they are one question: what is
                the underlying really doing, including while the cash is shut */}
            <Route path="/index-futures" element={<IndexFutures />} />
            {/* §14 + §16 — what decided the open overnight, and what is about to */}
            <Route path="/macro" element={<MacroDesk />} />
            {/* §18 — the journal: what was taken, why, and how it went */}
            <Route path="/journal" element={<Journal />} />
            {/* §17 — every armed alert, and everything that has fired */}
            <Route path="/alerts" element={<AlertsPage />} />
            {/* §9 — whether the scanners have ever been worth anything */}
            <Route path="/backtest" element={<Backtest />} />
            <Route path="/skys-vision" element={<Navigate to="/compass" replace />} />
            <Route path="/stocks" element={<Stocks />} />
            <Route path="/keyhole" element={<Disclosures mode="insiders" />} />
            <Route path="/disclosures" element={<Disclosures mode="congress" />} />
            {/* §2 — the company behind the ticker */}
            <Route path="/stocks/:ticker" element={<TickerOverview />} />
            {/* T-NEWS — the globe room replaces the wire list; /newsroom was
                its spike URL and follows here so old links still land. */}
            <Route path="/news" element={<NewsRoom />} />
            <Route path="/newsroom" element={<Navigate to="/news" replace />} />
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
              <Route path="greek-surfaces" element={<GreekSurfaces />} />
              <Route path="compare" element={<ExposureCompare />} />
              {/* Launch trim (Noah, 2026-08-17): Vol Lab + History & Replay
                  unrouted — pages kept on disk, engines still feed widgets */}
              <Route path="vol-lab" element={<VolLab />} />
              <Route path="history" element={<GexHistory />} />
              <Route path="pain-map" element={<PainMap />} />
              <Route path="oi-heat" element={<OiHeatScreen />} />
              <Route path="model-error" element={<ModelError />} />
            </Route>
            <Route path="/trace" element={<TraceLayout />}>
              <Route index element={<Navigate to="/trace/live-tape" replace />} />
              <Route path="live-tape" element={<LiveTape />} />
              <Route path="screener" element={<OptionsScreener />} />
              <Route path="net-flow" element={<NetFlow />} />
              <Route path="footprints" element={<Footprints />} />
              <Route path="flow-alerts" element={<FlowAlerts />} />
              <Route path="windows" element={<TradeWindows />} />
              <Route path="odte" element={<Odte />} />
              <Route path="multi-leg" element={<MultiLeg />} />
              {/* Launch trim (Noah, 2026-08-17): Dark Pool + Scanner unrouted —
                  dark-pool prints still stream on the tape and the charts */}
              <Route path="dark-pool" element={<DarkPool />} />
              <Route path="dark-feed" element={<Navigate to="/trace/live-tape" replace />} />
              <Route path="scanner" element={<FlowScanner />} />
              <Route path="tracker" element={<FlowTracker />} />
              <Route path="interval" element={<IntervalFlowPage />} />
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
              {/* §19 — the record, and the person behind it */}
              <Route path="leaderboard" element={<Leaderboard />} />
              <Route path="member/:handle" element={<MemberProfile />} />
            </Route>
            <Route path="/auditor-log" element={<Navigate to="/tracker" replace />} />
            {/* LAST, and inside the shell on purpose. Before this, an address
                that matched nothing rendered an empty page: no message, no
                console error, indistinguishable from the desk having broken.
                Keeping it inside AppShell means a lost reader still has the
                nav and the command palette. */}
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
        </LaunchProvider>
        </TrackerProvider>
      </MarketDataProvider>
    </MotionConfig>
  );
};

export default App;
