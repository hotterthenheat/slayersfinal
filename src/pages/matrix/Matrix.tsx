import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import MatrixPanel from './MatrixPanel';
import { useMarketData } from '../../context/MarketDataContext';
import { useIsBelowLg } from '../../components/ui/useMediaQuery';
import { LADDER_METRICS, type LadderMetric } from '../../data/gex';
import { CALL_INK, NET_NEG_INK, NET_POS_INK, PUT_INK } from '../../data/matrix';

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
function loadCfg(): MatrixCfg {
  const def = defaults();
  try {
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

        {/* ── the ink key ──────────────────────────────────────────────────
            The net column carries its sign TWICE, in the minus and in the
            colour, and a reader has no way to learn the second one from the
            table itself. Four swatches is the whole cost of saying so. */}
        <div className="ml-auto hidden items-center gap-2.5 font-mono text-[9px] text-textMuted md:flex">
          <Swatch ink={PUT_INK} words="put leg" />
          <Swatch ink={CALL_INK} words="call leg" />
          <span className="text-borderMuted">·</span>
          <Swatch ink={NET_POS_INK} words="net put-dominant" />
          <Swatch ink={NET_NEG_INK} words="net call-dominant" />
        </div>
      </div>

      {/* ── the board ───────────────────────────────────────────────────────
          It scrolls SIDEWAYS rather than squeezing — see `PANEL_MIN_PX`. */}
      <div
        className={`grid min-h-0 gap-1.5 ${belowLg ? '' : 'flex-1 overflow-x-auto overflow-y-hidden'}`}
        style={{ gridTemplateColumns: grid }}
      >
        {cfg.panels.map((p, i) => (
          <div
            key={`${i}:${p.ticker}:${p.metric}`}
            className={`flex min-w-0 ${belowLg ? 'h-[68vh] min-h-[420px]' : 'min-h-0'}`}
          >
            <MatrixPanel
              index={i}
              ticker={p.ticker}
              metric={p.metric}
              focus={cfg.focus}
              pulse={pulse}
              onTicker={next => setPanel(i, { ticker: next })}
              onMetric={next => setPanel(i, { metric: next })}
              onClose={count > 1 ? () => closePanel(i) : null}
            />
          </div>
        ))}
      </div>
    </div>
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
