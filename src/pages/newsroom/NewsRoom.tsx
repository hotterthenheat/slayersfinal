/*
==================================================
  SLAYER TERMINAL - NEWS ROOM
  THE news page. Round 3 of the room's shape (Noah,
  2026-08-29, sketch with two circled voids beside
  the planet): "make the globe the literal entire
  page and the circle regions on the globe can quite
  literally be where we show our information. they
  will act like pages that can be switched to other
  pages which will in turn show different information
  but in the same fields."

  So: the globe IS the page — a fixed stage under the
  TopBar, edge to edge (the v2 side-rail layout and
  the v1 wire-list are both dead; v1 is archived in
  docs/news-page-reference.md). Information floats in
  two PAGED ZONES over the planet's flanks — each a
  glass panel whose header chips switch what the same
  field of space is showing (wire / movers / hotspots
  on the left; read / odds / zones on the right).
  Everything still speaks data/newsroom.ts — one
  generator, decorated from the same feed the Pulse
  widget reads.

  The stage is `fixed` — safe because AppShell's
  route entrance retains nothing after it completes
  (from-only keyframes, backwards fill: the
  containing-block law).
==================================================
*/

import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, Pause, Play } from 'lucide-react';
import RichRead from '../../components/ui/RichRead';
import AnimatedNumber from '../../components/ui/AnimatedNumber';
import Chip from '../../components/ui/Chip';
import CompanyLogo from '../../components/ui/CompanyLogo';
import CatTag from '../../components/news/CatTag';
import Simulator from '../../core/simulator';
import { readAllClocks, fmtGap } from '../../data/worldClocks';
import { placeAt, placeRead, bearingFrom, type PlaceReport, type PlaceHit } from '../../data/placeReport';
import {
  buildEconCalendar,
  buildGeoNews,
  buildRoomInsights,
  freshnessOf,
  severityWord,
  type GeoNewsEvent,
  type NewsGrade,
} from '../../data/newsroom';

const GlobePane = lazy(() => import('./GlobePane'));

const GRADE_TEXT: Record<NewsGrade, string> = {
  THREAT: 'text-bear',
  ALLY: 'text-bull',
  WATCH: 'text-textSecondary',
};
const GRADE_METER: Record<NewsGrade, string> = { THREAT: 'bg-bear/85', ALLY: 'bg-bull', WATCH: 'bg-white/40' };

/* The house easing — same curve as everywhere else. */
const EASE = 'cubic-bezier(0.16,1,0.3,1)';

/* ── a zone: one field of space, many pages ───────────────────────────────
   The glass panel the sketch circled. Header chips switch WHAT the field
   shows; the body soft-fades between pages. Translucent on purpose — the
   planet must read through the information floating on it. */
interface ZonePage {
  key: string;
  label: string;
  body: React.ReactNode;
}
const Zone = ({
  pages,
  drill,
}: {
  pages: ZonePage[];
  /** A drill-in page (a place's dossier) — REPLACES the field until Back:
      the header row becomes back + title, the chips wait underneath it all.
      Noah, 2026-08-29: "when i click on any of these states or places...
      transitioned smoothly into a page that shows all the news regarding
      that said place". */
  drill?: { title: React.ReactNode; body: React.ReactNode; onBack: () => void } | null;
}) => {
  const [page, setPage] = useState(pages[0].key);
  const active = pages.find(p => p.key === page) ?? pages[0];
  return (
    <div className="flex flex-col min-h-0 h-full rounded-lg border border-borderSubtle bg-panel/70 backdrop-blur-md backdrop-saturate-150 overflow-hidden">
      {drill ? (
        <div className="px-2.5 py-1.5 flex items-center gap-2 border-b border-borderSubtle/60 shrink-0">
          <button
            onClick={drill.onBack}
            className="group inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-textSecondary hover:text-textPrimary transition-colors"
          >
            <ArrowLeft className="w-3 h-3 group-hover:-translate-x-0.5 transition-transform duration-200 ease-out" />
            Back
          </button>
          <span className="min-w-0 truncate">{drill.title}</span>
        </div>
      ) : (
        <div className="px-2.5 py-1.5 flex items-center gap-1 border-b border-borderSubtle/60 shrink-0">
          {pages.map(p => (
            <Chip key={p.key} active={p.key === page} onClick={() => setPage(p.key)} title={p.label}>
              {p.label}
            </Chip>
          ))}
        </div>
      )}
      <div key={drill ? 'drill' : active.key} className="flex-1 min-h-0 overflow-auto animate-soft-in">
        {drill ? drill.body : active.body}
      </div>
    </div>
  );
};

/* Odds meter — back from the v1 archive, contract intact: it stays MOUNTED
   across headline switches so the split SLIDES between stories. */
const OddsBar = ({ probUp }: { probUp: number }) => (
  <div>
    <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-wider tnum">
      <span className={probUp < 50 ? 'text-bear font-semibold' : 'text-textSecondary'}>
        Down <AnimatedNumber value={100 - probUp} format={v => `${Math.round(v)}%`} />
      </span>
      <span className={probUp >= 50 ? 'text-bull font-semibold' : 'text-textSecondary'}>
        Up <AnimatedNumber value={probUp} format={v => `${Math.round(v)}%`} />
      </span>
    </div>
    <div className="mt-1.5 flex h-1.5 rounded-full overflow-hidden bg-white/[0.06]">
      <span className="h-full bg-bear/80" style={{ width: `${100 - probUp}%`, transition: `width 520ms ${EASE}` }} />
      <span className="h-full bg-bull" style={{ width: `${probUp}%`, transition: `width 520ms ${EASE}` }} />
    </div>
  </div>
);

const Stat = ({ label, children, tone = 'text-textPrimary' }: { label: string; children: React.ReactNode; tone?: string }) => (
  <div className="border border-borderSubtle/70 bg-inset/60 rounded-md px-2.5 py-2 min-w-0">
    <div className="font-mono text-[9px] uppercase tracking-widest text-textMuted truncate">{label}</div>
    <div className={`mt-1 font-mono text-sm font-semibold tnum ${tone}`}>{children}</div>
  </div>
);

/** A door out of the room — small, labeled, never a naked icon. `onWarm`
    runs on hover so the destination can precompute (the Weigher door warms
    the simulator's history for the name — the click then lands instantly
    instead of paying the seed stall). */
const Door = ({ onClick, onWarm, children }: { onClick: () => void; onWarm?: () => void; children: React.ReactNode }) => (
  <button
    onClick={onClick}
    onMouseEnter={onWarm}
    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-borderSubtle bg-white/[0.03] hover:bg-white/[0.06] font-mono text-[10px] uppercase tracking-wider text-textSecondary hover:text-textPrimary transition-colors"
  >
    <ArrowUpRight className="w-3 h-3" />
    {children}
  </button>
);

/* A ticker is an ADDRESS (Noah, 2026-08-29: "click WMT anywhere →
   everything about WMT") — logo + symbol, click opens the name's dossier.
   Rendered inside row buttons, so the click stops there. */
const TickerChip = ({ t, size = 15, onOpen }: { t: string; size?: number; onOpen: (t: string) => void }) => (
  <span
    onClick={ev => {
      ev.stopPropagation();
      onOpen(t);
    }}
    title={`Everything about ${t}`}
    role="link"
    className="inline-flex items-center gap-1.5 cursor-pointer group/tk"
  >
    <CompanyLogo ticker={t} size={size} />
    <span className="font-mono text-[11px] font-bold text-textPrimary underline-offset-2 group-hover/tk:underline">{t}</span>
  </span>
);

const NewsRoom = () => {
  const location = useLocation();
  const navigate = useNavigate();
  /* THE WIRE TICKS — the drip lands new stories through the session, so
     the room re-reads the generator every half minute. Ages grow, fresh
     ripples appear, the calendar countdowns fall. */
  const [wireRev, setWireRev] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setWireRev(r => r + 1), 30_000);
    return () => window.clearInterval(t);
  }, []);
  const events = useMemo(() => buildGeoNews(), [wireRev]);
  /* The Pulse widget's deep link still addresses these ids. */
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const incoming = (location.state as { selectedId?: string } | null)?.selectedId;
    return incoming && events.some(e => e.id === incoming) ? incoming : events[0]?.id ?? null;
  });
  const selected = events.find(e => e.id === selectedId) ?? null;

  /* A quiet early morning can open with NOTHING landed yet — select the
     first story the moment one drips in. */
  useEffect(() => {
    if (!selectedId && events.length > 0) setSelectedId(events[0].id);
  }, [selectedId, events]);

  /* THE WORLD CLOCKS, re-read every 30s. A minute would be enough for the
     digits, but a centre that opens between ticks should light up promptly
     rather than up to a minute late. */
  const [clocks, setClocks] = useState(() => readAllClocks());
  useEffect(() => {
    const id = setInterval(() => setClocks(readAllClocks()), 30_000);
    return () => clearInterval(id);
  }, []);

  /* SITUATION MODE — the room walks the day's stories on a clock, camera
     touring each. Any manual pick hands the wheel back to the reader. */
  const [tour, setTour] = useState(false);
  const pick = (id: string) => {
    setTour(false);
    setSelectedId(id);
  };
  useEffect(() => {
    if (!tour || events.length === 0) return;
    const t = window.setInterval(() => {
      setSelectedId(cur => {
        const i = events.findIndex(e => e.id === cur);
        return events[(i + 1) % events.length].id;
      });
    }, 8000);
    return () => window.clearInterval(t);
  }, [tour, events]);

  const calendar = useMemo(() => buildEconCalendar(), [wireRev]); // eslint-disable-line react-hooks/exhaustive-deps
  const insights = useMemo(() => buildRoomInsights(events), [events]);

  /* THE BOOT — the first load assembles a 3D chunk, two textures and the
     border atlas; until the planet has pixels the room shows a quiet orbit
     (Noah: "a quick loading screen thats in house and simple"). `ready`
     fades it, a timer unmounts it, and a FAILSAFE timer force-readies at 8s
     so the overlay can never wedge (the AnimatePresence-exit law, applied
     to a loader). */
  const [ready, setReady] = useState(false);
  const [bootGone, setBootGone] = useState(false);
  useEffect(() => {
    const failsafe = window.setTimeout(() => setReady(true), 8000);
    return () => window.clearTimeout(failsafe);
  }, []);
  useEffect(() => {
    if (!ready) return;
    const t = window.setTimeout(() => setBootGone(true), 650);
    return () => window.clearTimeout(t);
  }, [ready]);

  /* A place's dossier — every story out of one city, drilled into the left
     field. Opening it selects the city's loudest story, so the camera flies
     there and the right field reads from the same place. */
  const [cityView, setCityView] = useState<string | null>(null);
  const openCity = (city: string, topId: string) => {
    setPlaceView(null);
    setCityView(city);
    pick(topId);
    /* Fly regardless — picking an already-selected story re-fires nothing,
       and opening a place must always take you there. */
    const ev = events.find(x => x.id === topId);
    if (ev) setRegion(r => ({ lat: ev.origin.lat, lng: ev.origin.lng, alt: 1.75, n: (r?.n ?? 0) + 1 }));
  };

  /* A POINT'S dossier — the third address type, and the one that makes the
     whole sphere answer. A city ping opens the dossier above; clicking
     anywhere else on the planet used to do nothing at all, which left most
     of the globe as decoration. This reads the nearest centre, its local
     clock, what came out of it and — the reading only a globe has — what is
     AIMED at it from elsewhere.

     It does NOT select a story. A click on open ocean has no story to
     select, and quietly jumping the right field to some nearby headline
     would be the panel answering a question the reader did not ask. The
     camera does fly, because a place you asked about should be in front of
     you. */
  const [placeView, setPlaceView] = useState<PlaceReport | null>(null);
  const openPlace = (lat: number, lng: number) => {
    setTour(false);
    setCityView(null);
    setPlaceView(placeAt(lat, lng, events));
    setRegion(r => ({ lat, lng, alt: 1.6, n: (r?.n ?? 0) + 1 }));
  };

  /* A name's dossier — the same drill, second address type: everything
     about one ticker in the RIGHT field (its stories, its zones, its
     doors), camera flown to its HQ. */
  const [tickerView, setTickerView] = useState<string | null>(null);
  const openTicker = (t: string) => {
    const own = events.filter(e => e.item.ticker === t);
    if (own.length === 0) return;
    const top = [...own].sort((a, b) => b.severity - a.severity)[0];
    setTickerView(t);
    pick(top.id);
    setRegion(r => ({ lat: top.origin.lat, lng: top.origin.lng, alt: 1.75, n: (r?.n ?? 0) + 1 }));
  };

  /* Camera presets — a look, never a selection; using one ends the tour. */
  const [region, setRegion] = useState<{ lat: number; lng: number; alt?: number; n: number } | null>(null);
  const lookAt = (lat: number, lng: number) => {
    setTour(false);
    setRegion(r => ({ lat, lng, n: (r?.n ?? 0) + 1 }));
  };

  const movers = useMemo(
    () =>
      [...events]
        .filter(e => e.item.ticker)
        .sort((a, b) => Math.abs(b.item.prediction.expMove1dPct) - Math.abs(a.item.prediction.expMove1dPct))
        .slice(0, 6),
    [events]
  );
  const maxMove = Math.max(...movers.map(m => Math.abs(m.item.prediction.expMove1dPct)), 0.1);

  /* Origin cities aggregated — where today's news is COMING from. */
  const hotspots = useMemo(() => {
    const by = new Map<string, { city: string; n: number; threat: number; ally: number; events: GeoNewsEvent[] }>();
    for (const e of events) {
      const h = by.get(e.origin.city) ?? { city: e.origin.city, n: 0, threat: 0, ally: 0, events: [] };
      h.n++;
      if (e.grade === 'THREAT') h.threat++;
      if (e.grade === 'ALLY') h.ally++;
      h.events.push(e);
      by.set(e.origin.city, h);
    }
    return [...by.values()].sort((a, b) => b.n - a.n);
  }, [events]);

  /* ── the zone pages ─────────────────────────────────────────────────── */
  const wireBody = (
    <div className="flex flex-col">
      {events.length === 0 && (
        <div className="px-4 py-8 text-center font-mono text-[10px] uppercase tracking-widest text-textMuted">
          Nothing on the tape yet — stories land through the day
        </div>
      )}
      {events.map(e => {
        const isSel = e.id === selectedId;
        const faded = freshnessOf(e) === 'faded';
        return (
          <button
            key={e.id}
            onClick={() => pick(e.id)}
            className={`text-left px-3 py-2.5 border-b border-borderSubtle/60 last:border-b-0 transition-colors ${
              isSel ? 'bg-white/[0.05] shadow-[inset_2px_0_0_0_rgba(237,237,237,0.7)]' : 'hover:bg-white/[0.03]'
            } ${faded && !isSel ? 'opacity-55' : ''}`}
          >
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-[9px] text-textMuted tnum">{e.item.time}</span>
              {e.item.ticker && <TickerChip t={e.item.ticker} onOpen={openTicker} />}
              <span className={`font-mono text-[9px] font-semibold uppercase tracking-wider ${GRADE_TEXT[e.grade]}`}>{e.grade}</span>
              <span
                className={`ml-auto font-mono text-[11px] font-semibold tnum ${
                  e.item.prediction.expMove1dPct >= 0 ? 'text-bull' : 'text-bear'
                }`}
              >
                {e.item.prediction.expMove1dPct >= 0 ? '+' : ''}
                {e.item.prediction.expMove1dPct.toFixed(1)}%
              </span>
            </div>
            <p className="mt-1 text-[12px] text-textPrimary leading-snug">{e.item.headline}</p>
          </button>
        );
      })}
    </div>
  );

  const moversBody = (
    <div className="flex flex-col gap-2.5 p-3">
      {movers.map(m => (
        <button key={m.id} onClick={() => pick(m.id)} className="text-left group">
          <div className="flex items-baseline gap-2">
            <TickerChip t={m.item.ticker!} onOpen={openTicker} />
            <CatTag category={m.item.category} />
            <span
              className={`ml-auto font-mono text-[11px] font-semibold tnum ${
                m.item.prediction.expMove1dPct >= 0 ? 'text-bull' : 'text-bear'
              }`}
            >
              {m.item.prediction.expMove1dPct >= 0 ? '+' : ''}
              {m.item.prediction.expMove1dPct.toFixed(1)}%
            </span>
          </div>
          <div className="mt-1 h-1 rounded-full bg-white/[0.06] overflow-hidden">
            <span
              className={`block h-full rounded-full ${m.item.prediction.expMove1dPct >= 0 ? 'bg-bull' : 'bg-bear/85'}`}
              style={{ width: `${(Math.abs(m.item.prediction.expMove1dPct) / maxMove) * 100}%` }}
            />
          </div>
        </button>
      ))}
    </div>
  );

  const hotspotsBody = (
    <div className="flex flex-col">
      {hotspots.map(h => (
        <button
          key={h.city}
          onClick={() => openCity(h.city, h.events[0].id)}
          className="text-left px-3 py-2.5 border-b border-borderSubtle/60 last:border-b-0 hover:bg-white/[0.03] transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] font-semibold text-textPrimary">{h.city}</span>
            <span className="ml-auto font-mono text-[10px] text-textMuted tnum">
              {h.n} stor{h.n === 1 ? 'y' : 'ies'}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2 font-mono text-[10px]">
            {h.threat > 0 && <span className="text-bear">{h.threat} pressing</span>}
            {h.ally > 0 && <span className="text-bull">{h.ally} lifting</span>}
            {h.threat === 0 && h.ally === 0 && <span className="text-textMuted">no lean</span>}
          </div>
        </button>
      ))}
    </div>
  );

  const readBody = selected && (
    <div key={selected.id} className="flex flex-col gap-3 p-3 animate-soft-in">
      <div className="flex items-center gap-2 flex-wrap">
        {selected.item.ticker ? (
          <TickerChip t={selected.item.ticker} size={18} onOpen={openTicker} />
        ) : (
          <span className="font-mono text-[11px] font-bold text-textPrimary">MACRO</span>
        )}
        <span className={`font-mono text-[10px] font-semibold uppercase tracking-wider ${GRADE_TEXT[selected.grade]}`}>
          {selected.grade}
        </span>
        <CatTag category={selected.item.category} />
        <span className="ml-auto font-mono text-[9px] text-textMuted">{selected.item.source}</span>
      </div>
      <p className="text-[13px] text-textPrimary leading-snug">{selected.item.headline}</p>
      <div>
        <div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-widest text-textMuted">
          <span>Impact · {severityWord(selected.severity)}</span>
          <span className="normal-case tracking-normal">from {selected.origin.city}</span>
        </div>
        <div className="mt-1.5 h-1 rounded-full bg-white/[0.06] overflow-hidden">
          <span
            className={`block h-full rounded-full ${GRADE_METER[selected.grade]}`}
            style={{ width: `${selected.severity * 10}%`, transition: `width 520ms ${EASE}` }}
          />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="1-day exp" tone={selected.item.prediction.expMove1dPct >= 0 ? 'text-bull' : 'text-bear'}>
          <AnimatedNumber value={selected.item.prediction.expMove1dPct} format={v => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`} />
        </Stat>
        <Stat label="5-day exp" tone={selected.item.prediction.expMove5dPct >= 0 ? 'text-bull' : 'text-bear'}>
          <AnimatedNumber value={selected.item.prediction.expMove5dPct} format={v => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`} />
        </Stat>
        <Stat label="Confidence">
          <AnimatedNumber value={selected.item.prediction.confidencePct} format={v => `${Math.round(v)}%`} />
        </Stat>
      </div>
      <p className="text-xs text-textSecondary leading-relaxed">
        <RichRead text={selected.item.prediction.analog} />
      </p>
      {selected.item.ticker && (
        <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-borderSubtle/60">
          <Door
            onWarm={() => Simulator.ensureTicker(selected.item.ticker!)}
            onClick={() => navigate('/weigher', { state: { weigh: { ticker: selected.item.ticker } } })}
          >
            Weigh it
          </Door>
          <Door
            onWarm={() => Simulator.ensureTicker(selected.item.ticker!)}
            onClick={() => navigate('/compass', { state: { tickerFilter: selected.item.ticker } })}
          >
            Compass setups
          </Door>
          {selected.item.category === 'Earnings' && (
            <Door onClick={() => navigate(`/earnings/${selected.item.ticker}`)}>Earnings page</Door>
          )}
        </div>
      )}
    </div>
  );

  const calendarBody = (
    <div className="flex flex-col">
      <div className="px-3 py-2 border-b border-borderSubtle/60 font-mono text-[9px] uppercase tracking-widest text-textMuted">
        {calendar.filter(c => c.impact === 'high').length} high impact ahead
      </div>
      {calendar.map(ev => (
        <div key={ev.id} className="px-3 py-2.5 border-b border-borderSubtle/60 last:border-b-0">
          <div className={`pl-2 border-l-2 ${ev.impact === 'high' ? 'border-warn' : 'border-white/20'}`}>
            <div className="flex items-baseline gap-2">
              <span className="text-[12px] text-textPrimary leading-snug">{ev.title}</span>
              <span className="ml-auto font-mono text-[9px] text-textMuted tnum whitespace-nowrap">
                {ev.dayLabel} {ev.timeLabel}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2 font-mono text-[10px]">
              <span className="text-textSecondary">{ev.region}</span>
              {ev.forecast && (
                <span className="text-textMuted">
                  Fcst <span className="text-textPrimary tnum">{ev.forecast}</span>
                </span>
              )}
              {ev.previous && (
                <span className="text-textMuted">
                  Prev <span className="text-textPrimary tnum">{ev.previous}</span>
                </span>
              )}
              {ev.inMinutes < 0 ? (
                <span className="ml-auto text-textMuted">printed</span>
              ) : ev.inMinutes < 90 ? (
                <span className="ml-auto text-warn">in {ev.inMinutes}m</span>
              ) : null}
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  const insightsBody = (
    <div className="flex flex-col gap-4 p-3">
      {insights.map(i => (
        <div key={i.key}>
          <div
            className={`font-mono text-[10px] uppercase tracking-widest font-semibold ${
              i.ink === 'bull' ? 'text-bull' : i.ink === 'bear' ? 'text-bear' : 'text-textSecondary'
            }`}
          >
            {i.title}
          </div>
          <p className="mt-1.5 text-xs text-textSecondary leading-relaxed">
            <RichRead text={i.read} />
          </p>
        </div>
      ))}
    </div>
  );

  const oddsBody = selected && (
    <div className="flex flex-col gap-4 p-3">
      {/* NOT keyed by selection — the v1 motion contract: the split slides */}
      <OddsBar probUp={selected.item.prediction.probUpPct} />
      <div key={`pb-${selected.id}`} className="animate-soft-in">
        <div className="font-mono text-[10px] uppercase tracking-widest text-textMuted">Playbook</div>
        <p className="mt-1.5 text-xs text-textSecondary leading-relaxed">
          <RichRead text={selected.item.prediction.playbook} />
        </p>
      </div>
      <div key={`an-${selected.id}`} className="border-t border-borderSubtle/60 pt-3 animate-soft-in">
        <div className="font-mono text-[10px] uppercase tracking-widest text-textMuted">Historical analog</div>
        <p className="mt-1.5 text-xs text-textSecondary leading-relaxed">
          <RichRead text={selected.item.prediction.analog} />
        </p>
      </div>
    </div>
  );

  const zonesBody = selected && (
    <div key={selected.id} className="flex flex-col p-3 gap-2.5 animate-soft-in">
      <div className="font-mono text-[9px] uppercase tracking-widest text-textMuted">
        Where {selected.item.ticker ?? 'it'} lands · {selected.impacts.length} zones
      </div>
      {selected.impacts.map(z => (
        <div key={z.label}>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-textPrimary">{z.label}</span>
            <span className="ml-auto font-mono text-[9px] uppercase tracking-wider text-textMuted">
              {z.w >= 7 ? 'heavy' : z.w >= 4 ? 'firm' : 'light'}
            </span>
          </div>
          <div className="mt-1 h-1 rounded-full bg-white/[0.06] overflow-hidden">
            <span
              className={`block h-full rounded-full ${GRADE_METER[selected.grade]}`}
              style={{ width: `${Math.min(100, z.w * 10)}%` }}
            />
          </div>
        </div>
      ))}
      <div className="mt-1 font-mono text-[9px] text-textMuted leading-relaxed">
        Zones come from the story's supply-and-listing map; the heat on the planet pools the same weights.
      </div>
    </div>
  );

  /* The city dossier — the drill page's content: that place's whole tape,
     wire-row grammar, each story selectable while the dossier stays open. */
  const cityEvents = cityView ? events.filter(e => e.origin.city === cityView) : [];
  const cityDrill = cityView
    ? {
        title: (
          <span className="font-mono text-[11px] font-semibold text-textPrimary">
            {cityView}
            <span className="ml-2 font-normal text-[10px] text-textMuted tnum">
              {cityEvents.length} {cityEvents.length === 1 ? 'story' : 'stories'}
            </span>
          </span>
        ),
        onBack: () => setCityView(null),
        body: (
          <div className="flex flex-col">
            <div className="px-3 py-2 border-b border-borderSubtle/60 flex items-center gap-2 font-mono text-[10px]">
              {cityEvents.some(e => e.grade === 'THREAT') && (
                <span className="text-bear">{cityEvents.filter(e => e.grade === 'THREAT').length} pressing</span>
              )}
              {cityEvents.some(e => e.grade === 'ALLY') && (
                <span className="text-bull">{cityEvents.filter(e => e.grade === 'ALLY').length} lifting</span>
              )}
              <span className="ml-auto text-textMuted">everything out of {cityView}</span>
            </div>
            {cityEvents.map(e => {
              const isSel = e.id === selectedId;
              const faded = freshnessOf(e) === 'faded';
              return (
                <button
                  key={e.id}
                  onClick={() => pick(e.id)}
                  className={`text-left px-3 py-2.5 border-b border-borderSubtle/60 last:border-b-0 transition-colors ${
                    isSel ? 'bg-white/[0.05] shadow-[inset_2px_0_0_0_rgba(237,237,237,0.7)]' : 'hover:bg-white/[0.03]'
                  } ${faded && !isSel ? 'opacity-55' : ''}`}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-[9px] text-textMuted tnum">{e.item.time}</span>
                    {e.item.ticker && <TickerChip t={e.item.ticker} onOpen={openTicker} />}
                    <CatTag category={e.item.category} />
                    <span className={`font-mono text-[9px] font-semibold uppercase tracking-wider ${GRADE_TEXT[e.grade]}`}>
                      {e.grade}
                    </span>
                    <span
                      className={`ml-auto font-mono text-[11px] font-semibold tnum ${
                        e.item.prediction.expMove1dPct >= 0 ? 'text-bull' : 'text-bear'
                      }`}
                    >
                      {e.item.prediction.expMove1dPct >= 0 ? '+' : ''}
                      {e.item.prediction.expMove1dPct.toFixed(1)}%
                    </span>
                  </div>
                  <p className="mt-1.5 text-[12px] text-textPrimary leading-snug">{e.item.headline}</p>
                </button>
              );
            })}
          </div>
        ),
      }
    : null;

  /* THE PLACE DOSSIER — what is going on at a point the reader picked.

     Two lists, kept apart on purpose. OUT OF HERE is the ordinary reading
     every other surface on this desk can give. AIMED AT HERE is the one
     only this room has: the globe draws the arcs, so it is the only place
     that knows a Santa Clara headline lands on Taipei. Summing them would
     destroy exactly the distinction that makes the surface worth building.

     A remote click is told it is remote. The nearest centre is still named
     — with the gap and a bearing — rather than pretending the reader
     clicked it. */
  const placeRow = (h: PlaceHit, kind: 'out' | 'in') => {
    const e = h.event;
    const isSel = e.id === selectedId;
    const faded = freshnessOf(e) === 'faded';
    return (
      <button
        key={`${kind}-${e.id}`}
        onClick={() => pick(e.id)}
        className={`w-full text-left px-3 py-2.5 border-b border-borderSubtle/60 last:border-b-0 transition-colors ${
          isSel ? 'bg-white/[0.05] shadow-[inset_2px_0_0_0_rgba(237,237,237,0.7)]' : 'hover:bg-white/[0.03]'
        } ${faded && !isSel ? 'opacity-55' : ''}`}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-[9px] text-textMuted tnum">{e.item.time}</span>
          {e.item.ticker && <TickerChip t={e.item.ticker} onOpen={openTicker} />}
          <CatTag category={e.item.category} />
          <span className={`font-mono text-[9px] font-semibold uppercase tracking-wider ${GRADE_TEXT[e.grade]}`}>
            {e.grade}
          </span>
          <span className="ml-auto font-mono text-[9px] text-textMuted tnum">{h.km.toLocaleString()}km</span>
        </div>
        <p className="mt-1.5 text-[12px] text-textPrimary leading-snug">{e.item.headline}</p>
        {/* A landing says where it came FROM and which zone caught it — the
            two facts that turn "this is near you" into a trajectory. */}
        {kind === 'in' && (
          <p className="mt-1 font-mono text-[9px] text-textMuted">
            from {e.origin.city}
            {h.zone ? ` \u2192 ${h.zone}` : ''}
          </p>
        )}
      </button>
    );
  };

  const placeDrill = placeView
    ? {
        title: (
          <span className="font-mono text-[11px] font-semibold text-textPrimary">
            {placeView.remote ? `Near ${placeView.region.name}` : placeView.region.name}
            <span className="ml-2 font-normal text-[10px] text-textMuted tnum">{placeView.localTime} local</span>
          </span>
        ),
        onBack: () => setPlaceView(null),
        body: (
          <div className="flex flex-col">
            <div className="px-3 py-2.5 border-b border-borderSubtle/60">
              <div className="flex items-center gap-2 flex-wrap font-mono text-[9px] uppercase tracking-widest">
                <span className="text-textMuted">{placeView.region.area}</span>
                {placeView.clock ? (
                  <span className={placeView.clock.open ? 'text-bull' : 'text-textMuted'}>
                    {placeView.clock.open
                      ? `open \u00b7 closes in ${fmtGap(placeView.clock.minutesToEdge)}`
                      : `closed \u00b7 opens in ${fmtGap(placeView.clock.minutesToEdge)}`}
                  </span>
                ) : (
                  /* No exchange here — say so, rather than leaving a gap a
                     reader fills in with "closed". */
                  <span className="text-textMuted">no exchange</span>
                )}
                <span className="ml-auto text-textMuted tnum">
                  {placeView.lat.toFixed(1)}&deg;, {placeView.lng.toFixed(1)}&deg;
                </span>
              </div>
              <p className="mt-1.5 text-[12px] text-textPrimary leading-snug">{placeRead(placeView)}</p>
              {placeView.remote ? (
                <p className="mt-1 font-mono text-[9px] text-textMuted">
                  This point is {placeView.km.toLocaleString()}km {bearingFrom(placeView.region, placeView.lat, placeView.lng)} of{' '}
                  {placeView.region.name} — outside its catchment, so nothing here is claimed for it.
                </p>
              ) : (
                <p className="mt-1 font-mono text-[9px] text-textMuted">{placeView.region.known}.</p>
              )}
            </div>

            {/* The pressure landing here, in the heat layer's own currency
                so the bar and the pixels on the planet cannot disagree. */}
            {(placeView.threat > 0 || placeView.ally > 0) && (
              <div className="px-3 py-2 border-b border-borderSubtle/60">
                <div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-widest">
                  <span className="text-bear">{placeView.threat.toFixed(1)} pressing</span>
                  <span className="text-textMuted">weight here</span>
                  <span className="text-bull">{placeView.ally.toFixed(1)} lifting</span>
                </div>
                <div className="mt-1.5 flex h-1.5 rounded-full overflow-hidden bg-white/[0.06]">
                  <span
                    className="h-full bg-bear/80"
                    style={{
                      width: `${(placeView.threat / Math.max(0.01, placeView.threat + placeView.ally)) * 100}%`,
                      transition: `width 520ms ${EASE}`,
                    }}
                  />
                  <span
                    className="h-full bg-bull"
                    style={{
                      width: `${(placeView.ally / Math.max(0.01, placeView.threat + placeView.ally)) * 100}%`,
                      transition: `width 520ms ${EASE}`,
                    }}
                  />
                </div>
              </div>
            )}

            {placeView.origins.length > 0 && (
              <>
                <div className="px-3 py-1.5 border-b border-borderSubtle/60 font-mono text-[9px] uppercase tracking-widest text-textMuted">
                  Out of here &middot; {placeView.origins.length}
                </div>
                {placeView.origins.map(h => placeRow(h, 'out'))}
              </>
            )}

            {placeView.landings.length > 0 && (
              <>
                <div className="px-3 py-1.5 border-b border-borderSubtle/60 font-mono text-[9px] uppercase tracking-widest text-textMuted">
                  Aimed at here &middot; {placeView.landings.length}
                  <span className="ml-2 normal-case tracking-normal text-textMuted/70">
                    stories that reach it from somewhere else
                  </span>
                </div>
                {placeView.landings.map(h => placeRow(h, 'in'))}
              </>
            )}

            {placeView.origins.length === 0 && placeView.landings.length === 0 && (
              <div className="px-3 py-6 text-center">
                <div className="font-mono text-[10px] uppercase tracking-widest text-textMuted">Nothing here today</div>
                <p className="mt-1.5 text-[11px] text-textSecondary leading-snug">
                  No headline came out of this place and none is pointed at it. Spin to a lit ping, or try one of the
                  centres along the bottom.
                </p>
              </div>
            )}

            {/* The names touching this place, as doors. */}
            {placeView.tickers.length > 0 && (
              <div className="px-3 py-2.5 border-t border-borderSubtle/60 flex items-center gap-3 flex-wrap">
                <span className="font-mono text-[9px] uppercase tracking-widest text-textMuted">Names here</span>
                {placeView.tickers.slice(0, 6).map(t => (
                  <TickerChip key={t} t={t} onOpen={openTicker} />
                ))}
              </div>
            )}
          </div>
        ),
      }
    : null;

  /* The name's dossier — its stories, its zones, its doors. */
  const tickerEvents = tickerView ? events.filter(e => e.item.ticker === tickerView) : [];
  const tickerZones = (() => {
    const by = new Map<string, number>();
    for (const e of tickerEvents) for (const z of e.impacts) by.set(z.label, Math.max(by.get(z.label) ?? 0, z.w));
    return [...by.entries()].sort((a, b) => b[1] - a[1]);
  })();
  const tickerDrill = tickerView
    ? {
        title: (
          <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold text-textPrimary">
            <CompanyLogo ticker={tickerView} size={15} />
            {tickerView}
            <span className="font-normal text-[10px] text-textMuted tnum">
              {tickerEvents.length} {tickerEvents.length === 1 ? 'story' : 'stories'}
            </span>
          </span>
        ),
        onBack: () => setTickerView(null),
        body: (
          <div className="flex flex-col">
            <div className="px-3 py-2 border-b border-borderSubtle/60 flex items-center gap-2 font-mono text-[10px]">
              {tickerEvents.some(e => e.grade === 'THREAT') && (
                <span className="text-bear">{tickerEvents.filter(e => e.grade === 'THREAT').length} pressing</span>
              )}
              {tickerEvents.some(e => e.grade === 'ALLY') && (
                <span className="text-bull">{tickerEvents.filter(e => e.grade === 'ALLY').length} lifting</span>
              )}
              <span className="ml-auto text-textMuted">out of {tickerEvents[0]?.origin.city}</span>
            </div>

            {/* its doors */}
            <div className="px-3 py-2.5 border-b border-borderSubtle/60 flex items-center gap-2 flex-wrap">
              <Door onWarm={() => Simulator.ensureTicker(tickerView)} onClick={() => navigate('/weigher', { state: { weigh: { ticker: tickerView } } })}>
                Weigh it
              </Door>
              <Door onWarm={() => Simulator.ensureTicker(tickerView)} onClick={() => navigate('/compass', { state: { tickerFilter: tickerView } })}>
                Compass setups
              </Door>
              {tickerEvents.some(e => e.item.category === 'Earnings') && (
                <Door onClick={() => navigate(`/earnings/${tickerView}`)}>Earnings page</Door>
              )}
            </div>

            {/* its stories */}
            {tickerEvents.map(e => {
              const isSel = e.id === selectedId;
              return (
                <button
                  key={e.id}
                  onClick={() => pick(e.id)}
                  className={`text-left px-3 py-2.5 border-b border-borderSubtle/60 transition-colors ${
                    isSel ? 'bg-white/[0.05] shadow-[inset_2px_0_0_0_rgba(237,237,237,0.7)]' : 'hover:bg-white/[0.03]'
                  }`}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-[9px] text-textMuted tnum">{e.item.time}</span>
                    <CatTag category={e.item.category} />
                    <span className={`font-mono text-[9px] font-semibold uppercase tracking-wider ${GRADE_TEXT[e.grade]}`}>
                      {e.grade}
                    </span>
                    <span
                      className={`ml-auto font-mono text-[11px] font-semibold tnum ${
                        e.item.prediction.expMove1dPct >= 0 ? 'text-bull' : 'text-bear'
                      }`}
                    >
                      {e.item.prediction.expMove1dPct >= 0 ? '+' : ''}
                      {e.item.prediction.expMove1dPct.toFixed(1)}%
                    </span>
                  </div>
                  <p className="mt-1.5 text-[12px] text-textPrimary leading-snug">{e.item.headline}</p>
                </button>
              );
            })}

            {/* its zones */}
            {tickerZones.length > 0 && (
              <div className="p-3 flex flex-col gap-2">
                <div className="font-mono text-[9px] uppercase tracking-widest text-textMuted">Where {tickerView} lands</div>
                {tickerZones.map(([label, w]) => (
                  <div key={label}>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] text-textPrimary">{label}</span>
                      <span className="ml-auto font-mono text-[9px] uppercase tracking-wider text-textMuted">
                        {w >= 7 ? 'heavy' : w >= 4 ? 'firm' : 'light'}
                      </span>
                    </div>
                    <div className="mt-1 h-1 rounded-full bg-white/[0.06] overflow-hidden">
                      <span className="block h-full rounded-full bg-white/40" style={{ width: `${Math.min(100, w * 10)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ),
      }
    : null;

  return (
    /* THE STAGE. Desktop (lg+): the globe is the page — fixed under the
       TopBar, edge to edge, zones floating on the planet's flanks. Narrow:
       a normal scrolling page — globe card first, the two zones stacked
       under it at full width (the fallback from the feature list). */
    <div className="relative lg:fixed lg:left-0 lg:right-0 lg:top-14 lg:bottom-0 lg:z-[5] lg:bg-[#050505] lg:overflow-hidden flex flex-col gap-4 lg:gap-0 lg:block">
      <div className="relative h-[52vh] min-h-[380px] rounded-lg border border-borderSubtle bg-[#050505] overflow-hidden lg:absolute lg:inset-0 lg:h-auto lg:min-h-0 lg:rounded-none lg:border-0">
        <Suspense
          fallback={
            <div className="absolute inset-0 flex items-center justify-center font-mono text-[11px] text-textMuted uppercase tracking-widest">
              Spinning up the planet…
            </div>
          }
        >
          <GlobePane
            events={events}
            selectedId={selectedId}
            onSelect={pick}
            onCityOpen={openCity}
            onPlaceClick={openPlace}
            placeMark={placeView ? { lat: placeView.lat, lng: placeView.lng } : null}
            focusRegion={region}
            onReady={() => setReady(true)}
          />
        </Suspense>

        {/* Floating identity — the page header, whispered */}
        <div className="absolute left-4 top-3 z-10 pointer-events-none">
          <div className="font-mono text-[10px] uppercase tracking-widest text-textMuted">Terminal / News</div>
          <h1 className="mt-0.5 text-lg font-semibold tracking-tight text-textPrimary leading-none">News Room</h1>
        </div>

        {/* Situation mode — the room tours the day's stories on a clock */}
        <button
          onClick={() => setTour(t => !t)}
          title={tour ? 'Stop the tour' : "Walk the day's stories, one every few seconds"}
          className={`absolute right-4 lg:right-[374px] top-3 z-10 inline-flex items-center gap-1.5 px-3 h-7 rounded-full border font-mono text-[10px] uppercase tracking-wider transition-colors ${
            tour
              ? 'border-select/60 bg-select/10 text-select'
              : 'border-borderSubtle bg-panel/70 backdrop-blur-md text-textSecondary hover:text-textPrimary'
          }`}
        >
          {tour ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
          Situation mode
        </button>

        {/* THE TRADING DAY AROUND THE PLANET — and the camera presets, which
            these replace.

            The three chips (Americas / Europe / Asia) flew the camera and
            said nothing else. Each centre here does the same flight AND
            carries the two facts a reader actually wants off a globe: what
            time it is there, and whether that market is awake. An open
            centre is lit and named; a closed one is quiet and counts down
            to its bell. The globe's terminator shows daylight — this shows
            the SESSION, which is not the same thing and is the one that
            matters on this desk. */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 hidden lg:flex items-center gap-1">
          {clocks.map(c => (
            <button
              key={c.city}
              onClick={() => lookAt(c.lat, c.lng)}
              title={
                c.open
                  ? `${c.city} is open — closes in ${fmtGap(c.minutesToEdge)}. Click to fly there.`
                  : `${c.city} is closed — opens in ${fmtGap(c.minutesToEdge)}. Click to fly there.`
              }
              className={`group flex items-center gap-1.5 rounded-md border px-2 py-1 transition-colors ${
                c.open
                  ? 'border-bull/30 bg-bull/[0.07] hover:bg-bull/[0.12]'
                  : 'border-borderSubtle bg-panel/60 hover:bg-white/[0.05]'
              }`}
            >
              <span
                aria-hidden
                className={`w-1 h-1 rounded-full ${c.open ? 'bg-bull' : 'bg-textMuted/50'}`}
              />
              <span
                className={`font-mono text-[9px] uppercase tracking-widest ${
                  c.open ? 'text-textPrimary' : 'text-textMuted'
                }`}
              >
                {c.city}
              </span>
              <span
                className={`font-mono text-[10px] tnum font-semibold ${
                  c.open ? 'text-bull' : 'text-textSecondary'
                }`}
              >
                {c.time}
              </span>
            </button>
          ))}
        </div>

        {/* Grade legend — whisper, bottom left */}
        <div className="absolute left-4 bottom-3 z-10 pointer-events-none">
          <div className="font-mono text-[10px] flex items-center gap-3">
            <span className="text-bear font-semibold">THREAT presses</span>
            <span className="text-bull font-semibold">ALLY lifts</span>
            <span className="text-textSecondary">WATCH no lean</span>
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-textMuted hidden sm:block">
            ripple = landing · arcs = where it reaches · heat = how hard it lands
          </div>
        </div>

        <div className="absolute right-4 bottom-3 z-10 pointer-events-none font-mono text-[10px] text-textMuted tnum hidden xl:block">
          {events.length} {events.length === 1 ? 'headline' : 'headlines'} today
        </div>
      </div>

      {/* THE CIRCLED REGIONS — left field: where the news is; right field:
          what the selected story means. Each is one Zone, paged by chips.
          Narrow screens stack them under the globe at full width. */}
      <div className="h-[440px] lg:h-auto lg:absolute lg:left-4 lg:top-16 lg:bottom-12 lg:w-[350px] lg:z-10">
        <Zone
          /* A place click clears the city view and vice versa, so at most
             one of these is ever non-null — the ?? is belt and braces. */
          drill={placeDrill ?? cityDrill}
          pages={[
            { key: 'wire', label: 'Headlines', body: wireBody },
            { key: 'movers', label: 'Movers', body: moversBody },
            { key: 'origins', label: 'Origins', body: hotspotsBody },
            { key: 'calendar', label: 'Calendar', body: calendarBody },
          ]}
        />
      </div>
      <div className="h-[440px] lg:h-auto lg:absolute lg:right-4 lg:top-16 lg:bottom-12 lg:w-[350px] lg:z-10">
        <Zone
          drill={tickerDrill}
          pages={[
            { key: 'read', label: 'Summary', body: readBody },
            { key: 'odds', label: 'Odds', body: oddsBody },
            { key: 'zones', label: 'Zones', body: zonesBody },
            { key: 'insights', label: 'Insights', body: insightsBody },
          ]}
        />
      </div>

      {/* THE BOOT — a satellite circling a bare outline while the planet
          assembles; fades on ready, unmounts on a timer. */}
      {!bootGone && (
        <div
          className={`absolute inset-0 z-40 bg-[#050505] flex flex-col items-center justify-center gap-5 transition-opacity duration-500 ${
            ready ? 'opacity-0 pointer-events-none' : 'opacity-100'
          }`}
        >
          <span className="relative w-14 h-14">
            <span className="absolute inset-0 rounded-full border border-white/20" />
            <span className="absolute inset-2 rounded-full border border-white/[0.08]" />
            <span className="absolute inset-0 animate-orbit">
              <span className="absolute -top-[3px] left-1/2 -ml-[3px] w-1.5 h-1.5 rounded-full bg-[#C7D3E8]" />
            </span>
          </span>
          <div className="text-center select-none">
            <div className="font-mono text-[10px] uppercase tracking-widest text-textSecondary">News Room</div>
            <div className="mt-1 font-mono text-[10px] text-textMuted">assembling the planet</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NewsRoom;
