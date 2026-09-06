import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Simulator from '../../core/simulator';
import {
  STATS,
  STAT_KEYS,
  STAT_WINDOWS,
  fmtStat,
  minSessionsFor,
  rankStat,
  rollingStat,
  seriesLength,
  toDailyBars,
  type StatKey,
  type StatRow,
  type StatWindow,
} from '../../data/stockStats';
import { UNIVERSE } from '../../data/universe';
import Panel from '../ui/Panel';
import DataState from '../ui/DataState';
import ProvenanceChip from '../ui/ProvenanceChip';
import Sparkline from '../compass/Sparkline';

/*
==================================================
  SLAYER TERMINAL - STATISTICS (components/stocks/StatisticsPanel.tsx)
  Part 7.3 — how a name has actually behaved, over a window it names.
==================================================

  ── THE WINDOW IS PRINTED EVERYWHERE THE NUMBER IS ────────────────────────

  A 5-session volatility and a 20-session volatility are different numbers
  about different things. Every reading here carries its window in the
  heading over it, in the roster's column header and in the sentence under
  the series, because a panel whose label does not move with its selector
  teaches a reader to misread it.

  ── THE ROSTER FILLS ITSELF, RATHER THAN FREEZING THE PAGE ────────────────

  A name that has never been simulated costs ~360ms of forward simulation to
  measure — measured on this machine, 6 names in 2,165ms, and 0ms once warm.
  Ranking all 28 on mount would be a ten-second freeze on a board whose whole
  job is to be scanned.

  So the roster fills through the browser's idle time, one name a slice, and
  says how far it has got. A reader who only wants the top of the list has it
  in the first frame; a reader who waits gets the whole roster; nobody waits
  for a spinner over an empty table. The count is on the surface because a
  ranking over nine names is a different claim from a ranking over
  twenty-eight, and a ranking that does not say which it is invites the
  reader to assume the second.
*/

type Progress = { rows: StatRow[]; done: number; total: number };

const StatisticsPanel = ({ ticker, className = '' }: { ticker: string; className?: string }) => {
  const navigate = useNavigate();
  const [key, setKey] = useState<StatKey>('vol');
  const [window_, setWindow] = useState<StatWindow>(10);
  const words = STATS[key];

  /* The selected name, measured now — it is already warm, because the board
     that opened this panel has been reading it. */
  const reading = useMemo(() => {
    const bars = Simulator.getCandles(ticker) ?? [];
    return rollingStat(bars, key, window_);
  }, [ticker, key, window_]);

  /*
    THE ROSTER, ONE NAME A SLICE.

    `peekCandles` never seeds, so the first pass is free and instant for the
    names already warm; the rest are warmed one at a time between frames.
    The effect restarts whenever the metric or the window changes and drops
    its results on unmount, so a reader flicking between windows never sees
    a half-finished list from the previous one.
  */
  const [progress, setProgress] = useState<Progress>({ rows: [], done: 0, total: UNIVERSE.length });
  const runRef = useRef(0);
  useEffect(() => {
    const run = ++runRef.current;
    const names = UNIVERSE.map(u => u.ticker);
    const rows: StatRow[] = [];
    let i = 0;
    setProgress({ rows: [], done: 0, total: names.length });

    const step = () => {
      if (runRef.current !== run) return;
      const t = names[i];
      /* Warm names first, free. An unseeded name is warmed here and stays
         warm for every other desk that asks for it afterwards. */
      const bars = Simulator.peekCandles(t) ?? Simulator.getCandles(t) ?? [];
      const r = rollingStat(bars, key, window_);
      if (r.now !== null) rows.push({ ticker: t, now: r.now, sessions: r.sessions });
      i += 1;
      setProgress({ rows: [...rows], done: i, total: names.length });
      if (i < names.length) schedule();
    };
    const schedule = () => {
      const w = globalThis as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
      if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(step, { timeout: 400 });
      else setTimeout(step, 0);
    };
    schedule();
    return () => {
      runRef.current += 1;
    };
  }, [key, window_]);

  const ranked = useMemo(() => rankStat(progress.rows, key).slice(0, 12), [progress.rows, key]);
  const sessions = useMemo(() => toDailyBars(Simulator.getCandles(ticker) ?? []).length, [ticker]);
  const points = seriesLength(sessions, window_);
  const filling = progress.done < progress.total;

  return (
    <Panel
      title={`Statistics · ${ticker}`}
      subtitle={`${words.label.toLowerCase()} over ${window_} sessions — ${words.blurb}`}
      className={className}
      actions={<ProvenanceChip sources={['candles']} note="Every figure here is computed from the session bars the desk holds — nothing is drawn from a table of statistics." />}
    >
      {/* the two selectors, and the window they compose */}
      <div className="flex items-center gap-3 flex-wrap mb-3" data-stat-controls>
        <div className="flex items-center gap-0.5" role="group" aria-label="Statistic">
          {STAT_KEYS.map(k => (
            <button
              key={k}
              type="button"
              onClick={() => setKey(k)}
              aria-pressed={key === k}
              title={STATS[k].blurb}
              className={`px-2.5 py-1 rounded font-mono text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                key === k ? 'bg-white/[0.07] text-textPrimary' : 'text-textMuted hover:text-textSecondary'
              }`}
            >
              {STATS[k].label}
            </button>
          ))}
        </div>
        <span className="h-4 w-px bg-borderSubtle" aria-hidden />
        <div className="flex items-center gap-0.5" role="group" aria-label="Window length">
          {STAT_WINDOWS.map(w => (
            <button
              key={w}
              type="button"
              onClick={() => setWindow(w)}
              aria-pressed={window_ === w}
              className={`px-2.5 py-1 rounded font-mono text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                window_ === w ? 'bg-white/[0.07] text-textPrimary' : 'text-textMuted hover:text-textSecondary'
              }`}
            >
              {w}d
            </button>
          ))}
        </div>
        {/*
          THE WINDOWS THAT ARE NOT OFFERED, AND WHY. The store seeds 22
          sessions per name, so a 60-session or 52-week statistic cannot be
          computed — and a control that silently returns a 22-session number
          under a "1 year" label is the failure this desk exists to avoid.
        */}
        <span className="font-mono text-[10px] uppercase tracking-widest text-textMuted" title={`The desk holds ${sessions} sessions for ${ticker}. A window longer than that would be a shorter window wearing a longer label.`}>
          {sessions} sessions in the store
        </span>
      </div>

      {reading.reason ? (
        <DataState kind="unavailable" title="Not enough history for this window" body={`${reading.reason} Shorten the window, or open the name so the desk walks more of its tape.`} pad="sm" />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-5 items-start">
          {/* the sliding window, walked back through the sessions */}
          <div className="min-w-0" data-stat-series>
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="font-mono text-[24px] font-bold tnum text-textPrimary leading-none">{fmtStat(key, reading.now)}</span>
              <span className="font-mono text-[10px] uppercase tracking-widest text-textMuted">
                {ticker} · {words.label.toLowerCase()} · {window_}-session window
              </span>
            </div>
            <div className="mt-3">
              <Sparkline data={reading.series} up={(reading.now ?? 0) >= (reading.series[0] ?? 0)} width={640} height={90} />
            </div>
            {/*
              A SERIES OF THREE IS NOT A TREND, and the sentence says which it
              is. A 20-session window over 22 sessions leaves two steps of
              history behind the current reading; drawing that as a line and
              saying nothing would invite a reader to read a shape into it.
            */}
            <p className="mt-2 text-[11px] text-textMuted leading-relaxed max-w-[80ch]">
              {points <= 3
                ? `Only ${points} ${points === 1 ? 'reading' : 'readings'} fit behind the current one at this window — ${minSessionsFor(window_, 4)} sessions would be needed for a shape worth reading. Shorten the window to see the walk.`
                : `${points} readings, oldest first, each measured over its own ${window_} sessions. The line is where the window has been, not where it is going.`}
            </p>
          </div>

          {/* the roster, ranked, filling as it warms */}
          <div className="min-w-0" data-stat-roster>
            <div className="flex items-baseline justify-between gap-2 border-b border-borderSubtle pb-1.5">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-textPrimary">
                {words.best === 'high' ? 'Highest' : 'Lowest'} on the roster
              </span>
              <span className="font-mono text-[10px] uppercase tracking-widest text-textMuted tnum">
                {filling ? `${progress.done} of ${progress.total}` : `${progress.rows.length} names`}
              </span>
            </div>
            {ranked.length === 0 ? (
              <p className="mt-2 text-[11px] text-textMuted leading-relaxed">Measuring the roster — names appear as the desk walks each one's tape.</p>
            ) : (
              <ul className="mt-1 flex flex-col">
                {ranked.map((r, i) => (
                  <li key={r.ticker}>
                    <button
                      type="button"
                      onClick={() => navigate(`/stocks/${r.ticker}`)}
                      className={`w-full grid grid-cols-[20px_56px_1fr_auto] items-center gap-2 py-1 text-left hover:bg-white/[0.03] rounded-sm transition-colors ${r.ticker === ticker ? 'bg-select/[0.05]' : ''}`}
                    >
                      <span className="font-mono text-[10px] tnum text-textMuted">{i + 1}</span>
                      <span className="font-mono text-[11px] font-semibold text-textPrimary">{r.ticker}</span>
                      <span className="h-[4px] rounded-sm bg-white/[0.05] overflow-hidden">
                        <span
                          className="block h-full rounded-sm bg-textSecondary/50"
                          style={{ width: `${Math.min(100, (Math.abs(r.now) / Math.max(...ranked.map(x => Math.abs(x.now)), 1e-9)) * 100)}%` }}
                        />
                      </span>
                      <span className="font-mono text-[11px] tnum text-textSecondary text-right">{fmtStat(key, r.now)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-[11px] text-textMuted leading-relaxed">
              {filling
                ? `Ranking ${progress.rows.length} measured so far — the rest are being walked between frames rather than all at once, because warming a cold name costs about a third of a second.`
                : `Ranked over ${progress.rows.length} of ${progress.total} covered names; the rest hold fewer than ${minSessionsFor(window_)} sessions.`}
            </p>
          </div>
        </div>
      )}
    </Panel>
  );
};

export default StatisticsPanel;
