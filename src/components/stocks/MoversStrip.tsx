import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MARKET_PHASE_WORDS, marketPhase } from '../../core/stream';
import { runScreener, type ScreenerKey } from '../../data/screeners';
import Panel from '../ui/Panel';
import DataState from '../ui/DataState';
import ProvenanceChip from '../ui/ProvenanceChip';

/*
==================================================
  SLAYER TERMINAL - TOP MOVERS (components/stocks/MoversStrip.tsx)
  Part 7.4 — gainers, losers and the most-traded, above the board.
==================================================

  The boards behind this have existed in `screeners.ts` since the Weigher
  got its scanner card, and were rendered in exactly one place: a dropdown
  on a different desk. A reader on the screening board — the page whose
  whole job is "which name should I look at" — could not see the day's
  biggest movers without leaving it.

  ── THE TIMEFRAME SWITCH IS ABSENT, AND SAYS SO ───────────────────────────

  The checklist asks for a timeframe switch "where supported". It is not
  supported: `sessionChangePct` holds ONE move per name per day, so a 1-week
  or 1-month option would re-sort the same numbers under a different label
  and tell a reader something false about the window they were reading. The
  strip states the window it has instead of offering windows it does not.

  ── THE SESSION IS NAMED, BECAUSE THE SAME NUMBER MEANS DIFFERENT THINGS ──

  "Up 4%" at 10:15 on a Tuesday and "up 4%" at 02:00 on a Sunday are not the
  same claim. The strip carries the market phase — pre-market, open, after
  hours, closed, holiday, weekend — so a reader is never invited to read a
  frozen weekend board as live movement.
*/

const TABS: { key: ScreenerKey; label: string; blurb: string }[] = [
  { key: 'gainers', label: 'Gainers', blurb: 'the biggest gains on the desk universe' },
  { key: 'losers', label: 'Losers', blurb: 'the biggest falls on the desk universe' },
  { key: 'optionsVolume', label: 'Most active', blurb: 'where the contracts are actually trading' },
];

const MoversStrip = ({ className = '' }: { className?: string }) => {
  const navigate = useNavigate();
  const [tab, setTab] = useState<ScreenerKey>('gainers');
  const phase = useMemo(() => marketPhase(), []);
  const rows = useMemo(() => runScreener(tab, 6), [tab]);
  const active = TABS.find(t => t.key === tab)!;
  const words = MARKET_PHASE_WORDS[phase];
  /* A frozen board is not a broken one, and the difference is the whole
     reason the phase is on the surface. */
  const live = phase === 'rth' || phase === 'premarket' || phase === 'afterhours';

  return (
    <Panel
      title="Today’s movers"
      subtitle={`${active.blurb} — this session only, the one window the desk holds`}
      className={className}
      actions={
        <div className="flex items-center gap-2 flex-wrap">
          <span
            title={words.blurb}
            className={`font-mono text-[10px] uppercase tracking-widest cursor-help ${live ? 'text-textSecondary' : 'text-textMuted'}`}
            data-market-phase={phase}
          >
            {words.label}
          </span>
          <ProvenanceChip sources={['tape']} />
        </div>
      }
    >
      <div className="flex items-center gap-0.5 mb-2" role="group" aria-label="Mover board">
        {TABS.map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            aria-pressed={tab === t.key}
            className={`px-2.5 py-1 rounded font-mono text-[10px] font-semibold uppercase tracking-wider transition-colors ${
              tab === t.key ? 'bg-white/[0.07] text-textPrimary' : 'text-textMuted hover:text-textSecondary'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <DataState
          kind="empty"
          title="Nothing on this board today"
          body="No name on the desk universe clears this screen in the current session."
          pad="sm"
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-px bg-borderSubtle/60" data-movers>
          {rows.map(r => (
            <button
              key={r.ticker}
              type="button"
              onClick={() => navigate(`/stocks/${r.ticker}`)}
              title={r.note}
              className="bg-panel px-3 py-2.5 text-left flex flex-col gap-1 hover:bg-white/[0.03] transition-colors min-w-0"
              data-mover={r.ticker}
            >
              <span className="font-mono text-[12px] font-bold text-textPrimary">{r.ticker}</span>
              <span className="text-[11px] text-textMuted truncate">{r.name}</span>
              <span className="flex items-baseline gap-2">
                <span className="font-mono text-[13px] tnum text-textSecondary">${r.price.toFixed(2)}</span>
                <span className={`font-mono text-[11px] tnum ${r.changePct >= 0 ? 'text-bull' : 'text-bear'}`}>
                  {r.changePct >= 0 ? '+' : ''}
                  {r.changePct.toFixed(2)}%
                </span>
              </span>
              {tab === 'optionsVolume' && (
                <span className="font-mono text-[10px] uppercase tracking-wider text-textMuted">{r.metric} contracts</span>
              )}
            </button>
          ))}
        </div>
      )}
      {!live && (
        <p className="mt-2 text-[11px] text-textMuted leading-relaxed">
          The tape is {words.label.toLowerCase()} — these are the session’s moves, held rather than updating. {words.blurb}.
        </p>
      )}
    </Panel>
  );
};

export default MoversStrip;
