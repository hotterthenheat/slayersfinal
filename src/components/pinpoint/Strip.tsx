import { Fragment, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { NAV_ITEMS } from '../layout/nav';
import { useMarketData } from '../../context/MarketDataContext';
import { REGIME_WORDS, buildFlipGauge } from '../../data/flipGauge';
import { buildVolRegime } from '../../data/volRegime';
import AnimatedNumber from '../ui/AnimatedNumber';
import DistanceUnitPicker from '../ui/DistanceUnitPicker';
import TickerSearch from '../ui/TickerSearch';
import { GEX_SUBPAGES } from '../../pages/pinpoint/subnav';
import { TYPE } from './Desk';
import { useScanSnapshot } from './useScanSnapshot';
import { fmtStrike, regimeInk } from './ink';

/*
==================================================
  SLAYER TERMINAL - THE PINPOINT STRIP (components/pinpoint/Strip.tsx)
  One row of chrome: where you are, where you can go, what you are reading under.
==================================================

  ── THREE ROWS BECAME ONE ─────────────────────────────────────────────────

  The section opened with a boxed tab rail, then a context strip under it,
  then each desk's own control row — three rows of chrome, and at 1440 the
  first data pixel landed 240px down. At 390 the rail and the controls each
  wrapped to three rows and the first chart was 680px down.

  Trace fused its identity and its tabs onto one hairline (Noah, 2026-08-30:
  "push the tape up even more") and this strip is that grammar: the
  section's name, the nine desks, and on the right the five conditions
  every desk is read under — which name, where it is, which side of the
  flip that puts you on, what implied is doing, and the ruler distances are
  printed in. A desk's own controls, where it has any, sit on the picture
  they control.

  ── WHAT CAME OFF ────────────────────────────────────────────────────────

  THE PILL. The active tab wore an animated holographic gradient — the one
  thing on the desk in perpetual motion, and it was the navigation. The
  active desk is an underline now, as on Trace.

  TWO FACTS THAT ALWAYS READ ZERO. The roster percentile and the 25Δ skew
  rode here at the same weight as the two conditions that carry news; on
  this build both print 0. They live on the Vol desk, and the implied-vol
  figure here is the link to it.

  THE "LEVELS →" LINK. Levels is a tab, 400px to the left.

  ── TWO ROWS, ON PURPOSE ─────────────────────────────────────────────────

  The first cut put the conditions on the tab row with `ml-auto`, and at
  1440 they did not fit: nine tabs and five group labels are ~900px, the
  identity 90, the conditions ~600, against 1392. So the cluster wrapped
  and landed as a right-aligned orphan under an empty left half — chrome
  that does not line up, which reads worse than a second row that does.

  The rows are separate now and each is a whole line: the name and the
  desks on the hairline, the conditions left-aligned under it with the
  ruler at the right. Two rows against the three the section opened with,
  and the first data pixel sits ~150px down instead of ~240.

  ── BELOW xl ─────────────────────────────────────────────────────────────

  Nine tabs with five group labels do not fit under 1280. The same
  registry becomes one native select — every desk, one tap, nothing
  off-screen, reachable by keyboard and by a screen reader without a
  listbox being rebuilt. Trace made the same call for the same reason.
*/

const Identity = () => {
  const item = NAV_ITEMS.find(i => i.path === '/pinpoint');
  if (!item) return null;
  const Icon = item.icon;
  return (
    <div className="flex items-center gap-2 shrink-0">
      <span className="inline-flex w-5 h-5 rounded border border-borderSubtle bg-inset items-center justify-center shrink-0">
        <Icon className="w-3 h-3 text-textSecondary" aria-hidden />
      </span>
      {/* 13px, the section's ceiling — the identity shares the desk's own
          largest step rather than standing above it. */}
      <h1 className={`${TYPE.title} text-textPrimary whitespace-nowrap`}>{item.label}</h1>
    </div>
  );
};

const Strip = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { marketData, activeTicker, changeTicker } = useMarketData();
  const { snapshot: scan } = useScanSnapshot();
  const gauge = useMemo(() => (scan ? buildFlipGauge(scan) : null), [scan]);
  /* Vol is memoised on the ticker: it walks the roster to place the name
     against its peers, which is scan-tier work and must not run per tick. */
  const vol = useMemo(() => buildVolRegime(activeTicker, 30).find(r => r.ticker === activeTicker) ?? null, [activeTicker]);

  const active = GEX_SUBPAGES.find(p => location.pathname.startsWith(p.path)) ?? GEX_SUBPAGES[0];
  const regime = gauge?.regime ?? null;
  const words = regime ? REGIME_WORDS[regime] : null;

  /* The accessible name says exactly what the cluster draws. */
  const aria = marketData
    ? `${marketData.ticker} ${fmtStrike(marketData.spot)}. ` +
      (words ? `${words.label} — ${words.blurb}.` : 'No gamma flip on this book — no regime border to stand on.') +
      (vol ? ` ATM implied ${(vol.iv * 100).toFixed(2)} vol points` : '') +
      (vol && vol.premium !== null ? `, ${Math.abs(vol.premium * 100).toFixed(2)} ${vol.premium >= 0 ? 'over' : 'under'} 20-session realized.` : '.')
    : 'Waiting for the first tick';

  return (
    <div className="flex flex-col gap-2" data-pinpoint-strip>
      <div className="flex items-end gap-4 border-b border-borderSubtle">
      <div className="pb-2">
        <Identity />
      </div>

      {/* The tabs, from xl. `pb-px` houses the underline's 1px overhang so
          the nav never grows a scrollbar of its own — Trace's lesson. */}
      <nav aria-label="Pinpoint desks" data-subnav="true" className="hidden xl:flex items-center gap-0.5 min-w-0 self-end pb-px">
        {GEX_SUBPAGES.map((page, i) => {
          const isActive = page.path === active.path;
          const newGroup = page.group !== GEX_SUBPAGES[i - 1]?.group;
          return (
            <Fragment key={page.path}>
              {newGroup && (
                <span className="inline-flex items-center gap-2 pl-2 pr-1 first:pl-0 pb-2 select-none" aria-hidden>
                  {i > 0 && <span className="w-px h-3 bg-borderSubtle" />}
                  <span className={`${TYPE.label} text-textMuted whitespace-nowrap`}>{page.group}</span>
                </span>
              )}
              <Link
                to={page.path}
                aria-current={isActive ? 'page' : undefined}
                title={page.subtitle}
                className={`relative px-2 pb-2 pt-1 font-mono text-body whitespace-nowrap outline-none rounded-t transition-colors focus-visible:ring-1 focus-visible:ring-select/60 ${
                  isActive ? 'text-textPrimary font-semibold' : 'text-textSecondary hover:text-textPrimary'
                }`}
              >
                {page.label}
                {isActive && (
                  <motion.span layoutId="pinpoint-tab-underline" className="absolute left-2 right-2 -bottom-px h-0.5 bg-textPrimary" transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }} />
                )}
              </Link>
            </Fragment>
          );
        })}
      </nav>
      <div className="xl:hidden pb-2 min-w-0">
        <select
          aria-label="Pinpoint desks"
          data-subnav-select="true"
          value={active.path}
          onChange={e => navigate(e.target.value)}
          className="h-6 rounded-md border border-borderSubtle bg-canvas pl-2 pr-1 font-mono text-body text-textPrimary outline-none cursor-pointer focus-visible:ring-1 focus-visible:ring-select/60"
        >
          {GEX_SUBPAGES.map(page => (
            <option key={page.path} value={page.path} className="bg-canvas text-textPrimary">
              {page.group} · {page.label}
            </option>
          ))}
        </select>
      </div>

      </div>

      {/*
        The conditions. One live region, one accessible sentence.

        ══ AND NOT AT ALL WHERE THE DESK HOLDS ITS OWN SYMBOLS ═════════════

        See `ownSymbols` in subnav.ts. On a board of up to five independent
        books this row can only be right about one of them, with nothing
        saying which — so it stands down and the panels answer for
        themselves. The tabs above stay, because they are navigation rather
        than conditions, and every desk still needs the way out.
      */}
      {!active.ownSymbols && (
      <div role="status" aria-label={aria} data-regime={regime ?? 'none'} className="flex items-center gap-x-4 gap-y-2 flex-wrap">
        <TickerSearch value={activeTicker} onChange={changeTicker} />
        {marketData && (
          <span className={`${TYPE.num} text-textPrimary`}>
            <AnimatedNumber value={marketData.spot} format={v => fmtStrike(Number(v.toFixed(2)))} flash />
          </span>
        )}
        <span className="inline-flex items-baseline gap-2 min-w-0" title={words?.blurb ?? 'the book does not change sign — no regime border to stand on'}>
          <span className={`${TYPE.label} font-bold whitespace-nowrap`} style={{ color: regimeInk(regime) }}>
            {words ? words.label : 'NO FLIP'}
          </span>
          <span className={`${TYPE.body} text-textMuted truncate hidden 2xl:inline`}>{words ? words.blurb : 'no regime border to stand on'}</span>
        </span>
        {vol && (
          <Link
            to="/pinpoint/vol"
            title="The surface, the term structure, and the regime over time"
            className="hidden md:inline-flex items-baseline gap-2 rounded outline-none transition-colors hover:text-textPrimary focus-visible:ring-1 focus-visible:ring-select/60"
          >
            <span className={`${TYPE.label} text-textMuted`}>ATM IV</span>
            <span className={`${TYPE.num} text-textPrimary`}>{(vol.iv * 100).toFixed(2)}</span>
            <span className={`${TYPE.body} text-textMuted whitespace-nowrap`}>
              {vol.premium === null ? 'vs realized —' : `${vol.premium >= 0 ? '+' : '−'}${Math.abs(vol.premium * 100).toFixed(2)} vs realized`}
            </span>
          </Link>
        )}
        <span className="ml-auto">
          <DistanceUnitPicker dense />
        </span>
      </div>
      )}
    </div>
  );
};

export default Strip;
