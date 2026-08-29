import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import DataState from '../../components/ui/DataState';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';
import { useMarketData } from '../../context/MarketDataContext';
import { buildRankedTargets, explainEdge, FACTOR_LABEL, RANK_FACTORS, RANK_LENSES, rankBy } from '../../data/rankedtargets';
import { fmtUsd } from '../../data/gex';
import Panel from '../../components/ui/Panel';
import SegmentedControl from '../../components/ui/SegmentedControl';
import SignalBadge from '../../components/ui/SignalBadge';
import Term from '../../components/ui/Term';
import ProvenanceChip from '../../components/ui/ProvenanceChip';
import type { MarketSnapshot } from '../../types/market';
import type { HedgingClass, RankLens, RankedTarget, TargetTag } from '../../types/gex';
import type { Tone } from '../../components/ui/tones';

/** Rankings sweep on the scan tier — priority must not reshuffle per tick. */
const SCAN_INTERVAL_MS = 10_000;

const TAG_TONE: Record<TargetTag, Tone> = {
  WALL: 'warn',
  PIN: 'neutral',
  KING: 'magenta',
  'SPOT TARGET': 'select',
};

const CLASS_TEXT: Record<HedgingClass, string> = {
  'DOWNSIDE CUSHION': 'text-bull',
  'UPSIDE RESISTANCE': 'text-bear',
  // White, not magenta: magenta is the pick's frame on this page, and a magnet
  // row wearing it read as a second #1 (Noah, 2026-08-18). White is the house
  // pin grammar (positioning-map pin rail, heatmap pin chip).
  MAGNET: 'text-textPrimary',
  NEUTRAL: 'text-textSecondary',
};

/** Left edge accent per hedging class — the whale-print grammar. Rendered as a
    real span, not an inset box-shadow: shadows rasterize per-row at fractional
    browser zoom and drift during the 10s reorder springs, so the columns of
    color stopped lining up (Noah, 2026-08-18). */
const CLASS_EDGE: Record<HedgingClass, string> = {
  'DOWNSIDE CUSHION': 'rgba(48,209,88,0.85)',
  'UPSIDE RESISTANCE': 'rgba(255,59,48,0.75)',
  MAGNET: 'rgba(237,237,237,0.6)',
  NEUTRAL: 'transparent',
};

/** The edge accent element. Parent must be `relative`; ladder rows and podium
    cards share this one spelling so the rails cannot disagree. */
const ClassEdge = ({ cls }: { cls: HedgingClass }) =>
  CLASS_EDGE[cls] === 'transparent' ? null : (
    <span
      aria-hidden="true"
      className="absolute left-0 inset-y-0 w-[2px] pointer-events-none"
      style={{ background: CLASS_EDGE[cls] }}
    />
  );

const fmtStrike = (v: number) => (v % 1 === 0 ? v.toFixed(0) : v.toFixed(2));

/** A target's standing under a lens, in that lens's own units. */
const fmtLens = (t: RankedTarget, lens: RankLens): string => {
  switch (lens) {
    case 'gex':
      return fmtUsd(t.netGex);
    case 'oi':
      return `${t.openInterest.toLocaleString()} OI`;
    case 'volume':
      return `${t.volume.toLocaleString()} vol`;
    case 'nbr':
      return `${t.nbr.toFixed(2)}x NBR`;
    case 'proximity':
      return `${Math.abs(t.bps)} bps from spot`;
    default:
      return '';
  }
};

const lensLabelOf = (lens: RankLens) => RANK_LENSES.find(l => l.value === lens)?.label ?? 'Priority';

/** Small two-tone C/P chip — never a banner. */
const CpChip = ({ t }: { t: RankedTarget }) => {
  const total = t.callVol + t.putVol || 1;
  const callPct = Math.round((t.callVol / total) * 100);
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="flex w-12 h-[4px] rounded-full overflow-hidden bg-white/[0.06]">
        <span className="h-full bg-bull/90" style={{ width: `${callPct}%` }} />
        <span className="h-full bg-bear/80" style={{ width: `${100 - callPct}%` }} />
      </span>
      <span className="font-mono text-[10px] tnum text-textPrimary">{callPct}%C</span>
    </span>
  );
};

// ---- the reason bar: priority, split by what earned it ----------------------

/** One alpha per reason, in bar order — the segments read by position and
    weight, never by a digit (the score stays engine-internal). */
const SEGMENT_ALPHA = [0.92, 0.7, 0.52, 0.38, 0.26];

/** The priority bar (Mo, 2026-08-19: "exactly why #1 beat #2 — NBR + OI +
    volume + net GEX + distance from spot"). Same track and length as before;
    now each factor's earned slice is its own segment, in a fixed order, so
    "why" is visible at a glance. The pick wears magenta, the rest white. */
const ReasonBar = ({ t, primary = false }: { t: RankedTarget; primary?: boolean }) => (
  <span className="flex w-full h-[3px] rounded-full bg-white/[0.06] overflow-hidden gap-px" title={t.reason}>
    {t.factors.map((f, i) => (
      <span
        key={f.key}
        title={FACTOR_LABEL[f.key]}
        className="h-full shrink-0 transition-[width] duration-700 ease-out"
        style={{
          width: `${f.points}%`,
          background: primary ? `rgba(234,0,255,${SEGMENT_ALPHA[i]})` : `rgba(237,237,237,${SEGMENT_ALPHA[i] * 0.55})`,
        }}
      />
    ))}
  </span>
);

/** The bar's key, spoken once in the panel header: five swatches in bar order. */
const ReasonLegend = () => (
  <span className="hidden md:inline-flex items-center gap-2.5 font-mono text-[9px] uppercase tracking-widest text-textSecondary select-none">
    <Term k="Priority">Bar</Term>
    {RANK_FACTORS.map((k, i) => (
      <span key={k} className="inline-flex items-center gap-1">
        <span className="w-2 h-[3px] rounded-full" style={{ background: `rgba(237,237,237,${SEGMENT_ALPHA[i] * 0.7})` }} />
        {FACTOR_LABEL[k].replace('distance from spot', 'distance').replace('neighbor ratio', 'NBR').replace('open interest', 'open int')}
      </span>
    ))}
  </span>
);

/** Why this strike sits where it does — #1 states its reason; every other
    podium card is compared with the card ABOVE it, factor by factor under the
    composite, or in the lens's own units under a single-reason lens. */
const EdgeLine = ({ t, above, lens }: { t: RankedTarget; above: RankedTarget | null; lens: RankLens }) => {
  let text: string;
  if (!above) {
    text = lens === 'priority' ? t.reason : `${fmtLens(t, lens)} — the book's highest`;
  } else if (lens === 'priority') {
    const { leads, trails } = explainEdge(t, above);
    const parts: string[] = [];
    if (trails.length) parts.push(`trails on ${trails.map(k => FACTOR_LABEL[k]).join(', ')}`);
    if (leads.length) parts.push(`leads on ${leads.map(k => FACTOR_LABEL[k]).join(', ')}`);
    text = `vs #${above.rank}: ${parts.length ? parts.join(' · ') : 'even on every reason'}`;
  } else {
    text = `vs #${above.rank}: ${fmtLens(t, lens)} against ${fmtLens(above, lens)}`;
  }
  return <span className="block font-mono text-[10px] leading-snug text-textSecondary truncate">{text}</span>;
};

// ---- podium: the three strikes that own the day ------------------------------

/** forwardRef: AnimatePresence popLayout measures exiting cards via ref. */
const PodiumCard = forwardRef<
  HTMLButtonElement,
  { t: RankedTarget; above: RankedTarget | null; lens: RankLens; onFlash: () => void }
>(({ t, above, lens, onFlash }, ref) => {
  const isPrimary = t.rank === 1;
  return (
    <motion.button
      ref={ref}
      layout
      layoutId={`rt-${t.strike}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ layout: { type: 'spring', stiffness: 340, damping: 32 }, opacity: { duration: 0.18 } }}
      onClick={onFlash}
      title="See this strike on the chart"
      className={`group relative text-left rounded-md border overflow-hidden transition-colors ${
        isPrimary
          ? 'border-king/40 bg-king/[0.05] hover:bg-king/[0.08]'
          : 'border-borderSubtle bg-inset hover:border-borderMuted hover:bg-white/[0.02]'
      }`}
    >
      {/* The pick's magenta frame is its whole voice — a class-colored edge
          bleeding into it read as a smudge (Noah, 2026-08-18). The class still
          speaks in the verdict strip. */}
      {!isPrimary && <ClassEdge cls={t.hedgingClass} />}
      {/* Header — rank, strike, tags. The strike score itself is
          engine-internal (Noah, 2026-08-16): rank + bar carry the priority. */}
      <div className="flex items-start gap-2 px-3.5 pt-3">
        <div className="flex items-baseline gap-2 flex-wrap min-w-0">
          <span className="font-mono text-[10px] tnum text-textSecondary">#{t.rank}</span>
          <span className="font-mono text-[18px] font-bold tnum text-textPrimary">{fmtStrike(t.strike)}</span>
          {t.tags.map(tag => (
            <SignalBadge key={tag} tone={TAG_TONE[tag]}>
              {tag}
            </SignalBadge>
          ))}
        </div>
        <ArrowUpRight className="absolute top-2.5 right-2.5 w-3 h-3 text-textMuted opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>

      {/* Priority bar, split by reason — and the reason in words */}
      <div className="px-3.5 mt-1.5 flex flex-col gap-1.5">
        <ReasonBar t={t} primary={isPrimary} />
        <EdgeLine t={t} above={above} lens={lens} />
      </div>

      {/* Stats — neutral ink; color is reserved for the verdict */}
      <div className="px-3.5 mt-3 grid grid-cols-4 gap-2 [&>*]:min-w-0">
        {[
          { label: 'BPS', term: 'BPS' as const, value: `${t.bps >= 0 ? '+' : ''}${t.bps}`, lens: 'proximity' as const },
          { label: 'NBR', term: 'NBR' as const, value: `${t.nbr.toFixed(2)}x`, strong: t.nbr >= 1.5, lens: 'nbr' as const },
          { label: 'Volume', term: undefined, value: t.volume.toLocaleString(), lens: 'volume' as const },
          { label: 'Open Int', term: undefined, value: t.openInterest.toLocaleString(), lens: 'oi' as const },
        ].map(s => (
          <div key={s.label}>
            <span className="block font-mono text-[9px] uppercase tracking-widest text-textSecondary">
              {s.term ? <Term k={s.term}>{s.label}</Term> : s.label}
            </span>
            <span className={`block font-mono text-[12px] tnum text-textPrimary ${s.strong || lens === s.lens ? 'font-bold' : ''}`}>
              {s.value}
            </span>
          </div>
        ))}
      </div>

      {/* Verdict strip — the only place color speaks */}
      <div className="mt-3 px-3.5 py-2 border-t border-borderSubtle/60 flex items-center gap-2">
        {/* Positive = put-dominant = short gamma = red (sim side-coding, unified 2026-08-18) */}
        <span className={`font-mono text-[13px] font-semibold tnum ${t.netGex > 0 ? 'text-bear' : 'text-bull'}`}>
          {fmtUsd(t.netGex)}
        </span>
        <span className={`font-mono text-[9px] font-semibold uppercase tracking-wider ${t.pressure === 'SUPPORT' ? 'text-bull' : 'text-bear'}`}>
          {t.pressure}
        </span>
        <span className="ml-3">
          <CpChip t={t} />
        </span>
        <span className={`ml-auto font-mono text-[10px] font-semibold uppercase tracking-wider ${CLASS_TEXT[t.hedgingClass]}`}>
          {t.hedgingClass}
        </span>
      </div>
    </motion.button>
  );
});
PodiumCard.displayName = 'PodiumCard';

// ---- ladder: the tail, dense and calm ----------------------------------------

const LadderRow = forwardRef<HTMLButtonElement, { t: RankedTarget; lens: RankLens; onFlash: () => void }>(
  ({ t, lens, onFlash }, ref) => {
    // The lens's own column reads bold — the column the order came from.
    const lensCls = (key: RankLens) => (lens === key ? 'font-bold' : '');
    return (
      <motion.button
        ref={ref}
        layout
        layoutId={`rt-${t.strike}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ layout: { type: 'spring', stiffness: 340, damping: 32 }, opacity: { duration: 0.18 } }}
        onClick={onFlash}
        title={`${t.reason} — click to see this strike on the chart`}
        className="group relative w-full flex items-center gap-3 px-3.5 h-11 text-left border-b border-borderSubtle/30 last:border-0 transition-colors hover:bg-white/[0.03]"
      >
        <ClassEdge cls={t.hedgingClass} />
        <span className="w-7 shrink-0 font-mono text-[10px] tnum text-textSecondary">#{t.rank}</span>
        <span className="w-40 shrink-0 flex items-center gap-1.5 min-w-0">
          <span className="font-mono text-[12px] font-bold tnum text-textPrimary">{fmtStrike(t.strike)}</span>
          {t.tags.map(tag => (
            <SignalBadge key={tag} tone={TAG_TONE[tag]}>
              {tag}
            </SignalBadge>
          ))}
        </span>
        {/* `min-[770px]`, not `md`. The priority lane joins at `md` (768) and
            the row it joins needs 770: measured 736px of content against a
            734px box at a 768px window. Two pixels is not much to look at,
            but it is the difference between a ladder that fits and a ladder
            that scrolls, and the guard does not grade on a curve. */}
        <span className="hidden min-[770px]:flex items-center w-24 shrink-0">
          <ReasonBar t={t} />
        </span>
        <span className={`w-14 shrink-0 text-right font-mono text-[11px] tnum text-textPrimary ${lensCls('proximity')}`}>
          {t.bps >= 0 ? '+' : ''}
          {t.bps}
        </span>
        <span className={`w-14 shrink-0 text-right font-mono text-[11px] tnum text-textPrimary ${t.nbr >= 1.5 ? 'font-bold' : lensCls('nbr')}`}>
          {t.nbr.toFixed(2)}x
        </span>
        <span className={`hidden lg:block w-20 shrink-0 text-right font-mono text-[11px] tnum text-textPrimary ${lensCls('volume')}`}>
          {t.volume.toLocaleString()}
        </span>
        <span className={`hidden lg:block w-20 shrink-0 text-right font-mono text-[11px] tnum text-textPrimary ${lensCls('oi')}`}>
          {t.openInterest.toLocaleString()}
        </span>
        <span className="hidden xl:block shrink-0">
          <CpChip t={t} />
        </span>
        <span className={`ml-auto w-24 shrink-0 text-right font-mono text-[11px] font-semibold tnum ${t.netGex > 0 ? 'text-bear' : 'text-bull'}`}>
          {fmtUsd(t.netGex)}
        </span>
        {/* `min-[662px]` rather than `sm`, because `sm` is 640 and the row
            needs 662. Every row inside that band read "DOWNSIDE CUSHIO",
            "UPSIDE RESISTAN", "NEUTRA" — the tail of the widest column gone.

            662 IS THE SECOND ANSWER, and the first one was wrong for an
            instructive reason. Measured against the old markup the scroller
            reported 8px of overflow at 640 and 0px from 648, which said the
            threshold was 648. It was not: the caption row sat OUTSIDE the
            scroller and the lanes spilled out of a row box that reported no
            overflow at all — at 648 the lanes summed to 642 inside a 614px
            box and `scrollWidth` still returned 614. The number was hiding
            behind the same structure that let the captions drift.

            With the row and its captions in one box the width is honest, and
            it is 628px of content against a 614px box at a 648px window — so
            the column needs 662. Threshold measured from the fixed lanes
            rather than the text: every lane is `w-*` and `shrink-0`, so it is
            identical whichever class word a row carries. */}
        <span className={`hidden min-[662px]:block w-36 shrink-0 text-right font-mono text-[9px] font-semibold uppercase tracking-wider ${CLASS_TEXT[t.hedgingClass]}`}>
          {t.hedgingClass}
        </span>
      </motion.button>
    );
  }
);
LadderRow.displayName = 'LadderRow';

/** Ladder column captions — one whisper, not one per row. */
const LadderHead = () => (
  <div
    /* `data-ladder-head` so the sweep can find this row wherever it sits. It
       used to live OUTSIDE the scroller, and a guard that looks for it inside
       one would find nothing there and measure whatever it fell back to — which
       is how the first version of that guard passed against the broken
       structure it was written to catch. */
    data-ladder-head=""
    className="flex items-center gap-3 px-3.5 h-7 border-b border-borderSubtle bg-[#0c0c0c] select-none"
  >
    <span className="w-7 shrink-0 font-mono text-[9px] uppercase tracking-widest text-textSecondary">Rank</span>
    <span className="w-40 shrink-0 font-mono text-[9px] uppercase tracking-widest text-textSecondary">Strike</span>
    {/* Same breakpoint as the rows' priority lane. */}
    <span className="hidden min-[770px]:block w-24 shrink-0 font-mono text-[9px] uppercase tracking-widest text-textSecondary">
      <Term k="Priority" />
    </span>
    <span className="w-14 shrink-0 text-right font-mono text-[9px] uppercase tracking-widest text-textSecondary">
      <Term k="BPS" />
    </span>
    <span className="w-14 shrink-0 text-right font-mono text-[9px] uppercase tracking-widest text-textSecondary">
      <Term k="NBR" />
    </span>
    <span className="hidden lg:block w-20 shrink-0 text-right font-mono text-[9px] uppercase tracking-widest text-textSecondary">Volume</span>
    <span className="hidden lg:block w-20 shrink-0 text-right font-mono text-[9px] uppercase tracking-widest text-textSecondary">Open Int</span>
    <span className="hidden xl:block w-[76px] shrink-0 font-mono text-[9px] uppercase tracking-widest text-textSecondary">C/P</span>
    <span className="ml-auto w-24 shrink-0 text-right font-mono text-[9px] uppercase tracking-widest text-textSecondary">
      <Term k="Net GEX" />
    </span>
    {/* Same breakpoint as the rows' class cell — a caption that appears at a
        width its column does not is a header for nothing. */}
    <span className="hidden min-[662px]:block w-36 shrink-0 text-right font-mono text-[9px] uppercase tracking-widest text-textSecondary">
      <Term k="Class" />
    </span>
  </div>
);

const RankedTargets = () => {
  const { marketData } = useMarketData();
  const navigate = useNavigate();
  /* The LENS (Mo, 2026-08-19: the tabs must "actually change the ranking").
     Each option re-orders the whole ladder through one reason — or the
     composite — so #1 means #1 by THAT. The old isolators only hid rows. */
  const [lens, setLens] = useState<RankLens>('priority');

  const [scanSnapshot, setScanSnapshot] = useState<MarketSnapshot | null>(null);
  const [lastScanAt, setLastScanAt] = useState('');
  const scanRef = useRef<MarketSnapshot | null>(null);
  const lastScanTimeRef = useRef(0);

  useEffect(() => {
    if (!marketData) return;
    const now = Date.now();
    const due =
      !scanRef.current ||
      now - lastScanTimeRef.current >= SCAN_INTERVAL_MS ||
      scanRef.current.ticker !== marketData.ticker;
    if (due) {
      scanRef.current = marketData;
      lastScanTimeRef.current = now;
      setScanSnapshot(marketData);
      setLastScanAt(new Date(now).toLocaleTimeString('en-GB'));
    }
  }, [marketData]);

  const view = useMemo(() => (scanSnapshot ? buildRankedTargets(scanSnapshot) : null), [scanSnapshot]);
  const ranked = useMemo(() => (view ? rankBy(view.targets, lens) : []), [view, lens]);

  if (!view) {
    return (
      <Panel className="w-full">
        <DataState kind="loading" title="Ranking the strikes" body="The first tick has not arrived yet." />
      </Panel>
    );
  }

  // The composite's #1 — the primary target regardless of the lens in use
  const primary = view.targets[0];
  /* A strike goes to the chart as the FOCUS line (Mo, 2026-08-19: "clicking
     a strike should take me directly to that strike on the chart"). The name
     rides along so the desk can repoint if it has drifted. */
  const flash = (t: RankedTarget) => navigate('/pulse', { state: { focusPrice: t.strike, ticker: view.ticker } });
  const podium = ranked.slice(0, 3);
  const ladder = ranked.slice(3);
  const lensLabel = lensLabelOf(lens);

  return (
    <>
      {/* Controls + primary target */}
      <div className="flex items-center gap-3 flex-wrap">
        <SegmentedControl ariaLabel="Ranked by" options={RANK_LENSES} value={lens} onChange={setLens} />
        {primary && (
          <button
            onClick={() => flash(primary)}
            className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-king/30 bg-king/[0.05] hover:bg-king/[0.1] transition-colors"
            title="See the primary target on the chart"
          >
            <span className="font-mono text-[9px] font-semibold uppercase tracking-widest text-king">Primary target</span>
            <span className="font-mono text-[11px] font-bold tnum text-textPrimary">{fmtStrike(primary.strike)}</span>
            <ArrowUpRight className="w-3 h-3 text-textSecondary" />
          </button>
        )}
        {/* P-1's chip — the ladder ranks the modelled book, and says so. */}
        <ProvenanceChip sources={['chain', 'exposure']} className="ml-auto" />
        <span className="font-mono text-[10px] text-textMuted uppercase tracking-widest tnum">
          {ranked.length} strikes · <Term k="Ranked by">ranked by</Term> {lensLabel} · scan {lastScanAt} · 10s
        </span>
      </div>

      {/* Ranked ladder — podium up top, dense rows for the tail */}
      <Panel
        title="Ranked Targets"
        subtitle={`by ${lensLabel} — click a strike to see it on the chart`}
        actions={<ReasonLegend />}
        flush
        className="w-full"
      >
        <LayoutGroup>
          {/*
            TWO up until there is room for three.

            `md:grid-cols-3` put three cards across a 976px content area at a
            1024 viewport — 309px each — and each card's four-stat row (BPS,
            NBR, Volume, Open Int) needs 327px to print its figures. The card
            is `overflow-hidden`, so the last 20px was simply cut off: at
            1024 the Open Int column lost its final digits, which on a figure
            like 57,200 is not a smaller number, it is a WRONG one.

            Grid items default to `min-width: auto`, so the stats row could not
            shrink to fit either — it forced the overflow rather than absorbing
            it. `min-w-0` below lets it absorb; this breakpoint means it does
            not have to. At 1024-1279 two cards get ~480px each and every
            figure prints whole.
          */}
          <div className="p-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            <AnimatePresence initial={false} mode="popLayout">
              {podium.map((t, i) => (
                <PodiumCard key={t.strike} t={t} above={i > 0 ? podium[i - 1] : null} lens={lens} onFlash={() => flash(t)} />
              ))}
            </AnimatePresence>
          </div>
          {ladder.length > 0 && (
            /*
              THE CAPTIONS AND THE ROWS SCROLL AS ONE THING.

              The caption row used to be a SIBLING of the scroller rather than
              a child of it, so the two could move independently — and below
              about 560px, where the row is wider than the panel, they did.
              Measured at 390x844 on the built app: dragging the body 102px to
              the right moved every row from x=17 to x=-85 while the captions
              stayed at x=17. 102px of drift is two whole columns, so a reader
              who scrolled across to read NET GEX found it sitting under the
              caption for something else. At 430 the same drift was 62px; at
              560 and 1440 the row fits and there is none.

              It also pushed the PAGE: the caption row had no overflow of its
              own, so its 472px of fixed lanes set the width of everything
              above it and the desk slid 85px sideways at 390.

              One scroller now owns both axes, with the captions `sticky` at
              its top so they still hold still while the rows scroll UNDER
              them — which is the half of the old arrangement that was right.
              `min-w-max` makes the inner column as wide as the widest row when
              the panel is narrower than that, and leaves it at the panel's own
              width when it is not, so nothing changes from 560px up.

              508 rather than 480 because the captions are `h-7` and now live
              inside the box: the rows keep the same 480px of travel they had.
            */
            <div
              /* A hook rather than a class selector: the sweep measures this
                 box, and matching on `overflow-y-auto` is how the guard
                 silently stopped finding it the moment the class changed. */
              data-ladder=""
              className="border-t border-borderSubtle overflow-auto max-h-[508px]"
            >
              <div className="min-w-max">
                <div className="sticky top-0 z-10">
                  <LadderHead />
                </div>
                <AnimatePresence initial={false} mode="popLayout">
                  {ladder.map(t => (
                    <LadderRow key={t.strike} t={t} lens={lens} onFlash={() => flash(t)} />
                  ))}
                </AnimatePresence>
              </div>
            </div>
          )}
        </LayoutGroup>
      </Panel>
    </>
  );
};

export default RankedTargets;
