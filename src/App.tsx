import { Routes, Route, Navigate } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import { MarketDataProvider } from './context/MarketDataContext';
import { TrackerProvider } from './context/TrackerContext';
import AppShell from './components/layout/AppShell';
import { LaunchProvider } from './components/layout/LaunchTransition';
import Compass from './pages/Compass';
import Weigher from './pages/Weigher';
import OptionChain from './pages/weigher/OptionChain';
import IndexFutures from './pages/IndexFutures';
import MacroDesk from './pages/MacroDesk';
import Journal from './pages/Journal';
import AlertsPage from './pages/Alerts';
import Backtest from './pages/Backtest';
import TickerOverview from './pages/TickerOverview';
import Tracker from './pages/Tracker';
import PinpointLayout from './pages/pinpoint/PinpointLayout';
import Pulse from './pages/workspace/Pulse';
import PulseBoard from './pages/PulseBoard';
import Terrain from './pages/terrain/Terrain';
import ExposureProfile from './pages/pinpoint/ExposureProfile';
import RankedTargets from './pages/pinpoint/RankedTargets';
import VannaCharm from './pages/pinpoint/VannaCharm';
import ExpiryLadder from './pages/pinpoint/ExpiryLadder';
import GreekSurfaces from './pages/pinpoint/GreekSurfaces';
import ExposureCompare from './pages/pinpoint/ExposureCompare';
import GexHistory from './pages/pinpoint/GexHistory';
import ModelError from './pages/pinpoint/ModelError';
import OiHeatScreen from './pages/pinpoint/OiHeatScreen';
import PainMap from './pages/pinpoint/PainMap';
import TraceLayout from './pages/trace/TraceLayout';
import LiveTape from './pages/trace/LiveTape';
import FlowTracker from './pages/trace/FlowTracker';
import FlowScanner from './pages/trace/FlowScanner';
import IntervalFlowPage from './pages/trace/IntervalFlow';
import DarkPool from './pages/trace/DarkPool';
import VolLab from './pages/pinpoint/VolLab';
import Stocks from './pages/Stocks';
import Disclosures from './pages/Disclosures';
import NewsRoom from './pages/newsroom/NewsRoom';
import EarningsHub from './pages/EarningsHub';
import EarningsDossier from './pages/EarningsDossier';
import ProveIt from './pages/proveit/ProveIt';
import Landing from './pages/landing/Landing';
import NotFound from './pages/NotFound';
import CommunityLayout from './pages/community/CommunityLayout';
import Ideas from './pages/community/Ideas';
import Requests from './pages/community/Requests';
import Feedback from './pages/community/Feedback';
import Leaderboard from './pages/community/Leaderboard';
import MemberProfile from './pages/community/MemberProfile';

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
