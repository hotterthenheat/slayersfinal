import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Link2, Plus } from 'lucide-react';
import MatrixPanel from './MatrixPanel';
import ErrorBoundary from '../../components/ui/ErrorBoundary';
import { useMarketData } from '../../context/MarketDataContext';
import { useIsBelowLg } from '../../components/ui/useMediaQuery';
import { LADDER_METRICS, type LadderMetric } from '../../data/gex';
import { NET_NEG_INK, NET_POS_INK, SHOCK, badgeWords, buildMatrix, cellMoney, quoteOf } from '../../data/matrix';
import { csvFilename, toCsv } from '../../core/csv';

/*
==================================================
  SLAYER TERMINAL - MATRIX
  A board of books. Every strike, one panel each.
==================================================

  ══ THE DESK OWNS ALMOST NOTHING ══════════════════════════════════════════

  A panel here is a whole reading: its own symbol, its own family, its own
  scroll. What is left for the desk is only what cannot belong to one panel —
  HOW MANY there are, and whether the quiet strikes are dimmed.

  That division is the point rather than a tidiness. A desk-wide family switch
  turns five panels into five symbols of the same picture; a per-panel one
  lets them be five PICTURES — SPY in gamma beside SPY in delta beside SPY in
  vega, which is the comparison a board exists to make and the one a single
  tab bar at the top cannot express (Noah: "if i want spx vex on one and spx
  gex on one or spx dex xyz"). So the tabs live in `MatrixPanel`, and this
  file is a frame.

  ══ NOTHING HERE COMPUTES AN EXPOSURE ═════════════════════════════════════

  Same split as Terrain: `data/matrix.ts` decides, the view places. Every
  number on this page came out of a function `scripts/matrix-proof.ts` holds
  to account.
*/

const MATRIX_KEY = 'slayer.matrix.v1';

/** One to five. Five books of sixty-one strikes is already more than a
    reader scans; past that the panels are too narrow to hold a figure and
    its bar on the same line, which is the whole grammar of a cell. */
export const MATRIX_COUNTS = [1, 2, 3, 4, 5] as const;
export type MatrixCount = (typeof MATRIX_COUNTS)[number];

/*
  ══ A PANEL NEVER GETS NARROWER THAN ITS TABLE ════════════════════════════

  Strike plus three legs is 78 + 3×92 of content before any padding. Below
  roughly this the figure and the micro-bar under it stop lining up and the
  cell reads as two marks instead of one, so the row of panels SCROLLS
  sideways rather than squeezing. A board that has quietly become unreadable
  to fit the window is worse than a board you have to push.
*/
const PANEL_MIN_PX = 352;

interface PanelCfg {
  ticker: string;
  metric: LadderMetric;
}

interface MatrixCfg {
  panels: PanelCfg[];
  /**
   * ══ THE BOARD'S WHOLE PURPOSE IS COMPARISON ═══════════════════════════
   *
   * Sixty-one strikes at 29px is about 1,770px of table in a 900px viewport,
   * so a panel only ever shows half its book. With each panel scrolling
   * alone, putting SPY gamma beside SPY delta meant scrolling both to 505 by
   * hand — and one stray wheel event broke the alignment silently, leaving
   * two panels that LOOK aligned and are not. That is worse than no board.
   *
   * Linked, they scroll by ROW INDEX. Every book is the same span of strikes
   * either side of its own spot, so row N is the same distance from spot in
   * every panel — which is the right correspondence for two symbols as well
   * as for two families of one symbol.
   */
  link: boolean;
  /** Dim the strikes that carry nothing — see `markMeaningful`. OFF on a
      cold open, because the first thing asked of this page was the WHOLE
      chain including the empty strikes; hiding them is a choice the reader
      makes, not one the page makes for them. */
  focus: boolean;
}

const METRIC_KEYS = new Set<string>(LADDER_METRICS.map(m => m.key));

/** The opening board: one symbol, two families. It is the shortest possible
    statement of what this page is for — the same book read two ways. */
function defaults(): MatrixCfg {
  return {
    panels: [
      { ticker: 'SPY', metric: 'gex' },
      { ticker: 'SPY', metric: 'dex' },
    ],
    focus: false,
    link: true,
  };
}

function readPanel(raw: unknown, fallback: PanelCfg): PanelCfg {
  if (!raw || typeof raw !== 'object') return fallback;
  const p = raw as Record<string, unknown>;
  const ticker = typeof p.ticker === 'string' && p.ticker.trim() ? p.ticker.trim().toUpperCase() : fallback.ticker;
  const metric = typeof p.metric === 'string' && METRIC_KEYS.has(p.metric) ? (p.metric as LadderMetric) : fallback.metric;
  return { ticker, metric };
}

/*
  Self-healing load, on the board loader's contract: anything malformed falls
  back to the default rather than throwing on read. A panel count of nine, a
  ticker that is a number, a family renamed in a later build — each is a value
  a browser can be holding after a deploy, and none of them may take the page
  down.
*/
/*
  ══ A BOARD YOU CAN SEND SOMEBODY ═════════════════════════════════════════

  The board lived only in this browser's storage, so "look at SPY gamma next
  to QQQ delta" was a sentence rather than a link. The URL carries it now, in
  a form a person can read and edit by hand:

      /matrix?b=SPY:gex,QQQ:dex&focus=1&link=0

  The URL WINS over storage when it is present, because a pasted link is an
  explicit request and the reader's last board is only a default. Nothing is
  required — a malformed pair is dropped and the rest is honoured, on the
  same contract as the stored shape.
*/
function fromUrl(search: string, def: MatrixCfg): MatrixCfg | null {
  let q: URLSearchParams;
  try {
    q = new URLSearchParams(search);
  } catch {
    return null;
  }
  const b = q.get('b');
  if (!b) return null;
  const panels = b
    .split(',')
    .map(pair => {
      const [t, mkey] = pair.split(':');
      const ticker = (t ?? '').trim().toUpperCase();
      if (!ticker) return null;
      const metric = mkey && METRIC_KEYS.has(mkey.trim()) ? (mkey.trim() as LadderMetric) : 'gex';
      return { ticker, metric } as PanelCfg;
    })
    .filter((p): p is PanelCfg => p !== null)
    .slice(0, MATRIX_COUNTS[MATRIX_COUNTS.length - 1]);
  if (panels.length === 0) return null;
  const flag = (key: string, fallback: boolean) => {
    const v = q.get(key);
    return v == null ? fallback : v !== '0' && v !== 'false';
  };
  return { panels, focus: flag('focus', def.focus), link: flag('link', def.link) };
}

/** The board as a query string — the same shape `fromUrl` reads. */
export function toQuery(cfg: MatrixCfg): string {
  const b = cfg.panels.map(p => `${p.ticker}:${p.metric}`).join(',');
  return `?b=${b}&focus=${cfg.focus ? 1 : 0}&link=${cfg.link ? 1 : 0}`;
}

function loadCfg(): MatrixCfg {
  const def = defaults();
  try {
    const url = typeof window !== 'undefined' ? fromUrl(window.location.search, def) : null;
    if (url) return url;
    const raw = localStorage.getItem(MATRIX_KEY);
    if (!raw) return def;
    const c = JSON.parse(raw) as Record<string, unknown>;
    if (!c || typeof c !== 'object') return def;
    const stored = Array.isArray(c.panels) ? (c.panels as unknown[]) : [];
    const panels = stored
      .slice(0, MATRIX_COUNTS[MATRIX_COUNTS.length - 1])
      .map((p, i) => readPanel(p, def.panels[i] ?? def.panels[0]));
    return {
      panels: panels.length > 0 ? panels : def.panels,
      focus: typeof c.focus === 'boolean' ? c.focus : def.focus,
      link: typeof c.link === 'boolean' ? c.link : def.link,
    };
  } catch {
    return def;
  }
}

export default function Matrix() {
  const [cfg, setCfg] = useState<MatrixCfg>(loadCfg);
  const belowLg = useIsBelowLg();

  useEffect(() => {
    try {
      localStorage.setItem(MATRIX_KEY, JSON.stringify(cfg));
    } catch {
      /* storage can be full, private, or switched off — never fatal */
    }
    /* `replaceState`, not `pushState`: switching a tab is not a navigation,
       and a board that stacked fifty history entries would make the back
       button useless for leaving the page. */
    try {
      window.history.replaceState(null, '', `${window.location.pathname}${toQuery(cfg)}`);
    } catch {
      /* some embeddings forbid history writes — never fatal */
    }
  }, [cfg]);

  /*
    ══ ONE TICK FOR THE WHOLE BOARD ══════════════════════════════════════════

    `marketData` is a new object on every simulator tick, so its IDENTITY is
    the clock. Turning it into a counter here means five panels rebuild on the
    same beat and share one render — five independent intervals would let two
    panels of the same symbol disagree about the spot for a frame, which on a
    board whose whole job is comparison is the one artefact that would make it
    untrustworthy.
  */
  const { marketData } = useMarketData();
  const [pulse, setPulse] = useState(0);
  useEffect(() => {
    setPulse(p => p + 1);
  }, [marketData]);

  /* ONE CLOCK FOR THE BOARD. Five panels printed five copies of the same
     second. A reading with no time on it cannot be told from a stale one —
     but it only needs saying once. */
  const [stamp, setStamp] = useState(() => Date.now());
  useEffect(() => {
    setStamp(Date.now());
  }, [marketData]);

  const count = cfg.panels.length;
  const setPanel = useCallback((i: number, patch: Partial<PanelCfg>) => {
    setCfg(c => ({ ...c, panels: c.panels.map((p, j) => (j === i ? { ...p, ...patch } : p)) }));
  }, []);

  /*
    THE COUNT IS SET BY NUMBER, and growing keeps what is already there.

    A reader on a three-panel board who presses 5 is asking for two MORE, not
    for a different board — so the existing three keep their symbols and
    families untouched and the new ones copy the last panel's symbol in the
    next family that is not already on screen. Shrinking drops from the right,
    which is the end they were added at.
  */
  const setCount = useCallback((n: MatrixCount) => {
    setCfg(c => {
      if (n === c.panels.length) return c;
      if (n < c.panels.length) return { ...c, panels: c.panels.slice(0, n) };
      const panels = [...c.panels];
      while (panels.length < n) {
        const last = panels[panels.length - 1] ?? defaults().panels[0];
        const taken = new Set(panels.filter(p => p.ticker === last.ticker).map(p => p.metric));
        const next = LADDER_METRICS.find(m => !taken.has(m.key))?.key ?? last.metric;
        panels.push({ ticker: last.ticker, metric: next });
      }
      return { ...c, panels };
    });
  }, []);

  const closePanel = useCallback((i: number) => {
    setCfg(c => (c.panels.length < 2 ? c : { ...c, panels: c.panels.filter((_, j) => j !== i) }));
  }, []);

  /*
    ══ ONE STRIKE AXIS, HELD BY THE DESK ═════════════════════════════════════

    Every panel registers its scroller here, and a scroll in one is written
    to the others.

    THE ECHO IS THE WHOLE PROBLEM. Writing `scrollTop` fires a `scroll` event
    on each panel it is written to, which would write back to the first, and
    the board would either oscillate or fight the reader's wheel. So a write
    marks the panels it touched and the marked ones ignore exactly one event
    — which is the same shape as the crosshair sync in Terrain, for the same
    reason.
  */
  const scrollers = useRef(new Map<number, HTMLElement>());
  const echo = useRef(new Set<number>());
  const registerScroller = useCallback((i: number, el: HTMLElement | null) => {
    if (el) scrollers.current.set(i, el);
    else scrollers.current.delete(i);
  }, []);
  const linkRef = useRef(cfg.link);
  linkRef.current = cfg.link;
  const onPanelScroll = useCallback((i: number, top: number) => {
    if (!linkRef.current) return;
    if (echo.current.delete(i)) return; // this one was written to, not scrolled
    for (const [j, el] of scrollers.current) {
      if (j === i || Math.abs(el.scrollTop - top) < 1) continue;
      echo.current.add(j);
      el.scrollTop = top;
    }
  }, []);

  /* Leaving link mode on does not retroactively align a board that drifted
     apart while it was off, so turning it ON pulls everyone to the first
     panel's position rather than waiting for the next wheel event. */
  useEffect(() => {
    if (!cfg.link) return;
    const first = scrollers.current.get(0);
    if (!first) return;
    const top = first.scrollTop;
    for (const [j, el] of scrollers.current) {
      if (j === 0 || Math.abs(el.scrollTop - top) < 1) continue;
      echo.current.add(j);
      el.scrollTop = top;
    }
  }, [cfg.link, count]);

  /* The desk's keys. Typing in the ticker box must not count as a command,
     which is what the tag test is for. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
      if (e.key >= '1' && e.key <= '5') {
        setCount(Number(e.key) as MatrixCount);
        e.preventDefault();
      } else if (e.key === 'f' || e.key === 'F') {
        setCfg(c => ({ ...c, focus: !c.focus }));
        e.preventDefault();
      } else if (e.key === 'l' || e.key === 'L') {
        setCfg(c => ({ ...c, link: !c.link }));
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setCount]);

  /*
    ══ THE EXPORT IS THE BOARD, NOT A TABLE ══════════════════════════════════

    Every panel, every strike, with the panel's symbol and family on each row
    so five books in one file stay tellable apart. It rebuilds from the engine
    rather than scraping the DOM, so what lands in the file is the numbers the
    panel was drawn from — and the formatted money goes in beside the raw
    value, because a spreadsheet cannot sum "$793.8M".
  */
  const exportCsv = useCallback(() => {
    const columns = [
      { key: 'ticker', label: 'Ticker' },
      { key: 'family', label: 'Family' },
      { key: 'shock', label: 'Per' },
      { key: 'strike', label: 'Strike' },
      { key: 'spot', label: 'Spot' },
      { key: 'put', label: 'Put' },
      { key: 'call', label: 'Call' },
      { key: 'net', label: 'Net' },
      { key: 'netWords', label: 'Net (formatted)' },
      { key: 'share', label: 'Share of book' },
      { key: 'tags', label: 'Tags' },
      { key: 'm5', label: '5m change' },
    ];
    type Line = Record<string, unknown>;
    const lines: Line[] = [];
    for (const p of cfg.panels) {
      const m = buildMatrix(p.ticker, [p.metric]);
      const total = m.totals[p.metric] ?? 0;
      for (const r of m.rows) {
        const c = r.cells[p.metric];
        lines.push({
          ticker: m.ticker,
          family: p.metric.toUpperCase(),
          shock: SHOCK[p.metric],
          strike: r.strike,
          spot: m.spot,
          put: c?.put ?? 0,
          call: c?.call ?? 0,
          net: c?.net ?? 0,
          netWords: cellMoney(c?.net ?? 0),
          share: total > 0 ? Math.abs(c?.net ?? 0) / total : 0,
          tags: r.tags.join(' '),
          m5: p.metric === 'gex' ? badgeWords(r.drift?.m5 ?? null) ?? '' : '',
        });
      }
    }
    const blob = new Blob([toCsv(columns, lines, (row, key) => row[key])], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = csvFilename(`matrix-${cfg.panels.map(p => `${p.ticker}${p.metric}`).join('-')}`);
    document.body.appendChild(a);
    a.click();
    a.remove();
    /* Revoked next frame, not immediately: Safari has not started the
       download when click() returns, and a URL revoked underneath it yields
       an empty file with no error anywhere. */
    requestAnimationFrame(() => URL.revokeObjectURL(url));
  }, [cfg.panels]);

  /*
    ══ A QUOTE BELONGS TO A SYMBOL, NOT TO A PANEL ═══════════════════════════

    Four SPY panels printed `$500.01 −0.05%` four times in four headers, and
    five panels printed the same clock five times — a third of the header
    chrome spent on repetition, on a board whose whole reason for existing is
    that the panels DIFFER. So the desk states each distinct symbol once and
    the panels carry only their own identity. The price is still in every
    table too, on the spot rule, where it is in context.
  */
  const quotes = useMemo(() => {
    const seen = new Set<string>();
    const out: { ticker: string; spot: number; change: number }[] = [];
    for (const p of cfg.panels) {
      const key = p.ticker.toUpperCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(quoteOf(p.ticker));
    }
    return out;
    // `pulse` is the clock — the quotes move with the book.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.panels, pulse]);

  /* Side by side above `lg`; stacked below it, where two of these tables next
     to each other would each be too narrow to read. */
  const grid = useMemo(
    () => (belowLg ? '1fr' : `repeat(${count}, minmax(${PANEL_MIN_PX}px, 1fr))`),
    [belowLg, count]
  );

  return (
    /*
      FULL BLEED from `lg`, the same measurement Terrain uses: the negative
      margins cancel the shell's own padding and the height is the viewport
      less the 56px top bar. Below `lg` every one of those comes off and the
      page scrolls normally, because a stacked board is a long page.
    */
    <div
      data-matrix-desk
      className={`relative -mx-4 flex flex-col px-1.5 lg:-mx-6 lg:-mb-16 lg:-mt-5 lg:h-[calc(100vh-3.5rem)] lg:min-h-0 lg:py-1.5 2xl:-mx-8 ${
        belowLg ? 'gap-1.5 pb-6 pt-2' : ''
      }`}
    >
      {/* ── the desk bar: how many, and whether the quiet ones are dimmed ── */}
      <div className="mb-1.5 flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border border-borderSubtle bg-canvas/85 px-2 py-1 backdrop-blur-[6px]">
        <div role="group" aria-label="Panels on the board" className="inline-flex items-center gap-1">
          <span className="mr-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-textMuted">Panels</span>
          {MATRIX_COUNTS.map(n => {
            const on = n === count;
            return (
              <button
                key={n}
                data-matrix-count={n}
                aria-pressed={on}
                onClick={() => setCount(n)}
                title={`${n} ${n === 1 ? 'book' : 'books'} side by side`}
                className={`h-[18px] w-[18px] rounded font-mono text-[10px] font-semibold tabular-nums transition-colors ${
                  on ? 'bg-borderMuted text-textPrimary' : 'text-textMuted hover:bg-white/[0.06] hover:text-textSecondary'
                }`}
              >
                {n}
              </button>
            );
          })}
          {count < MATRIX_COUNTS[MATRIX_COUNTS.length - 1] && (
            <button
              data-matrix-add
              onClick={() => setCount((count + 1) as MatrixCount)}
              title="Add a book"
              aria-label="Add a book"
              className="ml-0.5 inline-flex h-[18px] items-center gap-0.5 rounded px-1 font-mono text-[9px] uppercase tracking-[0.12em] text-textMuted transition-colors hover:bg-white/[0.06] hover:text-textSecondary"
            >
              <Plus className="h-2.5 w-2.5" />
              Panel
            </button>
          )}
        </div>

        {/* FOCUS DIMS, IT DOES NOT DELETE. The shape of a book includes its
            empty stretches, and a table that closed its gaps would be a
            tidier and less true picture — so the rows stay where they are and
            lose their light. See `markMeaningful`. */}
        <button
          data-matrix-focus
          aria-pressed={cfg.focus}
          onClick={() => setCfg(c => ({ ...c, focus: !c.focus }))}
          title="Dim every strike that is not named, heavy or moving — nothing is removed"
          className={`rounded px-2 py-[3px] font-mono text-[9px] font-semibold uppercase tracking-[0.12em] transition-colors ${
            cfg.focus
              ? 'bg-borderMuted text-textPrimary'
              : 'text-textMuted hover:bg-white/[0.06] hover:text-textSecondary'
          }`}
        >
          Focus
        </button>

        {/* LINKED SCROLL. Default on: two panels that look aligned and are
            not is worse than no board at all. */}
        <button
          data-matrix-link
          aria-pressed={cfg.link}
          onClick={() => setCfg(c => ({ ...c, link: !c.link }))}
          title="Scroll every panel to the same distance from spot — press L"
          className={`inline-flex items-center gap-1 rounded px-2 py-[3px] font-mono text-[9px] font-semibold uppercase tracking-[0.12em] transition-colors ${
            cfg.link
              ? 'bg-borderMuted text-textPrimary'
              : 'text-textMuted hover:bg-white/[0.06] hover:text-textSecondary'
          }`}
        >
          <Link2 className="h-2.5 w-2.5" />
          Link
        </button>

        <button
          data-matrix-csv
          onClick={exportCsv}
          title="Download every panel's strikes as CSV — the board exactly as shown"
          className="inline-flex items-center gap-1 rounded px-2 py-[3px] font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-textMuted transition-colors hover:bg-white/[0.06] hover:text-textSecondary"
        >
          <Download className="h-2.5 w-2.5" />
          CSV
        </button>

        {/* ── the board's symbols, once each ─────────────────────────────── */}
        <div data-matrix-quotes className="ml-auto flex items-center gap-3 font-mono text-[10px]">
          {quotes.map(q => (
            <span key={q.ticker} data-matrix-quote={q.ticker} className="flex items-baseline gap-1.5">
              <span className="uppercase tracking-[0.14em] text-textMuted">{q.ticker}</span>
              <span className="font-semibold tnum text-textPrimary">${q.spot.toFixed(2)}</span>
              <span className={`tnum ${q.change >= 0 ? 'text-bull' : 'text-bear'}`}>
                {q.change >= 0 ? '+' : ''}
                {q.change.toFixed(2)}%
              </span>
            </span>
          ))}
          <Stamp at={stamp} />
        </div>

        {/* ── the ink key ──────────────────────────────────────────────────
            TWO SWATCHES, because there are two ideas. It listed four — put
            leg, call leg, net put-dominant, net call-dominant — which is
            what a legend looks like when the same concept has been given two
            unrelated colours in adjacent columns. The hue is the side now,
            everywhere, and the legs are lighter tints of it. */}
        <div className="hidden items-center gap-2.5 font-mono text-[9px] text-textMuted 2xl:flex">
          <Swatch ink={NET_POS_INK} words="put-dominant" />
          <Swatch ink={NET_NEG_INK} words="call-dominant" />
        </div>
      </div>

      {/* ── the board ───────────────────────────────────────────────────────
          It scrolls SIDEWAYS rather than squeezing — see `PANEL_MIN_PX`. */}
      <div
        className={`grid min-h-0 gap-1.5 ${belowLg ? '' : 'flex-1 overflow-x-auto overflow-y-hidden'}`}
        style={{ gridTemplateColumns: grid }}
      >
        {cfg.panels.map((p, i) => (
          /*
            THE KEY IS THE POSITION, AND ONLY THE POSITION.

            It used to carry the symbol and the family, so switching a tab
            unmounted the panel and built a new one: the scroll position, the
            held rulers and the width observer all went with it, and the
            reader was thrown back to spot every time they flipped SPY from
            gamma to delta. That is precisely the comparison the per-panel
            tabs exist to make, and the key was undoing it.
          */
          <div key={i} className={`flex min-w-0 ${belowLg ? 'h-[68vh] min-h-[420px]' : 'min-h-0'}`}>
            {/* One bad symbol or one NaN in a family took down all five
                panels and the desk with them. Terrain has wrapped its panes
                since per-widget isolation landed; this is the same guard,
                reset by the things a reader changes to get out of trouble. */}
            <ErrorBoundary label={`${p.ticker} ${p.metric.toUpperCase()}`} resetKey={`${p.ticker}|${p.metric}`} fill>
              <MatrixPanel
                index={i}
                ticker={p.ticker}
                metric={p.metric}
                focus={cfg.focus}
                pulse={pulse}
                onTicker={next => setPanel(i, { ticker: next })}
                onMetric={next => setPanel(i, { metric: next })}
                onClose={count > 1 ? () => closePanel(i) : null}
                registerScroller={registerScroller}
                onScroll={onPanelScroll}
              />
            </ErrorBoundary>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * When the board last moved.
 *
 * ══ A CLOCK THAT STOPS WITHOUT SAYING SO IS WORSE THAN NO CLOCK ═══════════
 *
 * Background the tab and the browser throttles the timers behind the feed.
 * The stamp then sits at whatever second it reached, looking exactly like a
 * live one — which is the failure a timestamp is supposed to prevent, dressed
 * up as the fix for it. So it watches itself: past `STALE_MS` with no new
 * reading it goes amber and says how old it is.
 */
const STALE_MS = 6000;

function Stamp({ at }: { at: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const age = Math.max(0, now - at);
  const stale = age >= STALE_MS;
  const d = new Date(at);
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    <span
      data-matrix-stamp
      data-stale={stale ? 'true' : 'false'}
      title={stale ? `This reading is ${Math.round(age / 1000)}s old — the feed has stopped updating` : 'When this reading was taken'}
      className={`tnum ${stale ? 'text-[#E8A33D]' : 'text-textMuted'}`}
    >
      {p(d.getHours())}:{p(d.getMinutes())}:{p(d.getSeconds())}
      {stale && ` · ${Math.round(age / 1000)}s old`}
    </span>
  );
}

function Swatch({ ink, words }: { ink: string; words: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span aria-hidden className="h-[2px] w-3 rounded-full" style={{ background: ink }} />
      {words}
    </span>
  );
}
