import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, Lightbulb, LineChart, RefreshCw, Send, SquarePen, Trash2 } from 'lucide-react';
import Panel from '../../components/ui/Panel';
import SegmentedControl from '../../components/ui/SegmentedControl';
import SignalBadge from '../../components/ui/SignalBadge';
import EmptyState from '../../components/ui/EmptyState';
import TickerTag from '../../components/ui/TickerTag';
import { useToast } from '../../components/ui/Toast';
import type { Tone } from '../../components/ui/tones';
import Simulator from '../../core/simulator';
import { lookup as universeLookup } from '../../data/universe';
import { EXAMPLE_IDEAS, timeAgo } from '../../data/community';
import type { CommunityIdea, IdeaDirection } from '../../types/community';
import type { KeyLevels } from '../../types/gex';
import { packMeta, unpackMeta } from './localMeta';
import { useCommunity } from './store';
import { clockOf, firstNumber, fmtLevel, fmtPct, isThrough, pctFromSpot, useBooks, zoneOf } from './book';
import { Field, PrimaryButton, RowAction, TextArea } from './controls';
import { copyText } from './share';

type DirectionFilter = 'ALL' | IdeaDirection;
type SortKey = 'NEW' | 'TICKER';
type Horizon = 'INTRADAY' | 'SWING' | 'POSITION';
type PositionSide = 'FLAT' | 'LONG' | 'SHORT';

const DIR_OPTIONS = [
  { value: 'ALL', label: 'All' },
  { value: 'BULLISH', label: 'Bullish' },
  { value: 'BEARISH', label: 'Bearish' },
] as const;

const SORT_OPTIONS = [
  { value: 'NEW', label: 'Newest' },
  { value: 'TICKER', label: 'By ticker' },
] as const;

const POST_DIR_OPTIONS = [
  { value: 'BULLISH', label: 'Bullish' },
  { value: 'BEARISH', label: 'Bearish' },
] as const;

const HORIZON_OPTIONS = [
  { value: 'INTRADAY', label: 'Intraday' },
  { value: 'SWING', label: 'Swing' },
  { value: 'POSITION', label: 'Position' },
] as const;

const POSITION_OPTIONS = [
  { value: 'FLAT', label: 'No position' },
  { value: 'LONG', label: 'Long' },
  { value: 'SHORT', label: 'Short' },
] as const;

/** Order + labels for the structured thesis read-out on each card. */
const META_FIELDS: { key: string; label: string; tone?: Tone }[] = [
  { key: 'horizon', label: 'Horizon' },
  { key: 'entry', label: 'Entry' },
  { key: 'invalidation', label: 'Invalidation', tone: 'warn' },
  { key: 'targets', label: 'Targets' },
  { key: 'risk', label: 'Risk' },
];

const positionTone = (v: string): Tone => (v === 'LONG' ? 'bull' : v === 'SHORT' ? 'bear' : 'neutral');

/**
 * A symbol the terminal has a real reference price for: the curated universe
 * plus the core watchlist ETFs. Anything else would still build a chain (the
 * simulator invents a config for any string), and a wall drawn for a symbol
 * nobody priced is exactly the kind of plausible-looking number this desk is
 * not allowed to show.
 */
const isKnownSymbol = (t: string): boolean => !!universeLookup(t) || Simulator.WATCHLIST.includes(t);

/** Caption over a control that carries its own accessible name (a segmented
    control is a radiogroup, not something a <label> may wrap). */
const Captioned = ({ caption, children }: { caption: string; children: React.ReactNode }) => (
  <div className="flex flex-col gap-1">
    <span className="font-mono text-label uppercase tracking-wider text-textMuted">{caption}</span>
    <div>{children}</div>
  </div>
);

/** The engine's levels for one symbol, laid out as a strip. */
const BookStrip = ({ levels, note }: { levels: KeyLevels; note: React.ReactNode }) => (
  <div className="rounded-md border border-borderSubtle/70 bg-inset px-3 py-2 flex flex-col gap-1.5">
    <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1.5">
      {[
        { label: 'Spot', value: levels.spot },
        { label: 'Flip', value: levels.flip },
        { label: 'Call wall', value: levels.callWall },
        { label: 'Put wall', value: levels.putWall },
        { label: 'King', value: levels.king },
      ].map(l => (
        <span key={l.label} className="flex items-baseline gap-1.5">
          <span className="font-mono text-label uppercase tracking-wider text-textMuted">{l.label}</span>
          <span className="font-mono text-caption text-textPrimary tnum">{fmtLevel(l.value)}</span>
        </span>
      ))}
    </div>
    <span className="font-mono text-micro text-textMuted">{note}</span>
  </div>
);

/** One derived line: where a number the author typed sits in the book. */
const Placement = ({
  label,
  price,
  levels,
  tone = 'neutral',
}: {
  label: string;
  price: number;
  levels: KeyLevels;
  tone?: Tone;
}) => (
  <div className="flex flex-col gap-0.5 min-w-0">
    <span className="font-mono text-label uppercase tracking-wider text-textMuted">{label}</span>
    <span className={`font-mono text-caption tnum ${tone === 'warn' ? 'text-warn' : 'text-textPrimary'}`}>
      {fmtLevel(price)} <span className="text-textMuted">{fmtPct(pctFromSpot(price, levels.spot))}</span>
    </span>
    <span className="font-mono text-micro text-textMuted leading-tight">{zoneOf(price, levels)}</span>
  </div>
);

const Ideas = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const { state, addIdea, removeIdea } = useCommunity();
  const composerRef = useRef<HTMLDivElement>(null);

  const [dirFilter, setDirFilter] = useState<DirectionFilter>('ALL');
  const [sort, setSort] = useState<SortKey>('NEW');
  const [tickerFilter, setTickerFilter] = useState('ALL');

  // Structured thesis composer
  const [ticker, setTicker] = useState('');
  const [direction, setDirection] = useState<IdeaDirection>('BULLISH');
  const [horizon, setHorizon] = useState<Horizon>('SWING');
  const [entry, setEntry] = useState('');
  const [invalidation, setInvalidation] = useState('');
  const [targets, setTargets] = useState('');
  const [risk, setRisk] = useState('');
  const [position, setPosition] = useState<PositionSide>('FLAT');
  const [thesis, setThesis] = useState('');

  const composerSymbol = isKnownSymbol(ticker) ? ticker : null;

  // Every symbol on screen that the book can speak for: yours, plus whatever is
  // being typed into the composer right now.
  const bookTickers = useMemo(() => {
    const set = new Set(state.ideas.map(i => i.ticker).filter(isKnownSymbol));
    if (composerSymbol) set.add(composerSymbol);
    return Array.from(set);
  }, [state.ideas, composerSymbol]);

  const books = useBooks(bookTickers);
  const composerBook = composerSymbol ? books.byTicker[composerSymbol] : undefined;

  const canPost = ticker.trim().length > 0 && thesis.trim().length >= 10;

  // Parsed once: a field only earns a read-out when a number can be read out of
  // it and the symbol has a book to place it in.
  const draftEntry = composerBook ? firstNumber(entry) : null;
  const draftInvalidation = composerBook ? firstNumber(invalidation) : null;
  const draftTarget = composerBook ? firstNumber(targets) : null;

  const post = () => {
    const t = ticker.trim().toUpperCase();
    const body = thesis.trim();
    if (!t || body.length < 10) return;
    // Structured fields ride alongside the narrative in the existing thesis field.
    const packed = packMeta(body, { horizon, entry, invalidation, targets, risk, position });
    addIdea({
      id: `you-${Date.now()}`,
      author: 'you',
      ticker: t,
      direction,
      thesis: packed,
      votes: 0,
      createdAt: new Date().toISOString(),
    });
    setTicker('');
    setThesis('');
    setEntry('');
    setInvalidation('');
    setTargets('');
    setRisk('');
    setHorizon('SWING');
    setPosition('FLAT');
    toast.success(`${t} thesis saved to this browser`);
  };

  const loadTemplate = (idea: CommunityIdea) => {
    setTicker(idea.ticker);
    setDirection(idea.direction);
    setThesis(unpackMeta(idea.thesis).text);
    composerRef.current?.scrollIntoView({ block: 'start' });
    toast.info('Example loaded into the composer');
  };

  const copyIdea = async (idea: CommunityIdea) => {
    const { text, meta } = unpackMeta(idea.thesis);
    const lines = [`${idea.ticker} ${idea.direction}`, text];
    for (const f of META_FIELDS) if (meta[f.key]) lines.push(`${f.label}: ${meta[f.key]}`);
    if (await copyText(lines.join('\n'))) toast.success('Thesis copied');
    else toast.error('Clipboard unavailable');
  };

  const openOnPulse = (idea: CommunityIdea) => {
    const entryPrice = firstNumber(unpackMeta(idea.thesis).meta.entry ?? '');
    // The documented cross-page contract (PulseWorkspace consumes focusTicker /
    // focusPrice from router state).
    navigate('/pulse', {
      state: { focusTicker: idea.ticker, ...(entryPrice != null ? { focusPrice: entryPrice } : {}) },
    });
  };

  const tickerOptions = useMemo(() => {
    const seen = Array.from(new Set(state.ideas.map(i => i.ticker)));
    return [{ value: 'ALL', label: 'All' }, ...seen.slice(0, 8).map(t => ({ value: t, label: t }))];
  }, [state.ideas]);

  // Deleting the last idea for a symbol must not leave the board filtered to a
  // symbol that no longer has a chip.
  const activeTickerFilter = tickerOptions.some(o => o.value === tickerFilter) ? tickerFilter : 'ALL';

  const shown = useMemo(() => {
    const filtered = state.ideas.filter(
      i =>
        (dirFilter === 'ALL' || i.direction === dirFilter) &&
        (activeTickerFilter === 'ALL' || i.ticker === activeTickerFilter)
    );
    return sort === 'TICKER'
      ? [...filtered].sort((a, b) => a.ticker.localeCompare(b.ticker) || b.createdAt.localeCompare(a.createdAt))
      : [...filtered].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [state.ideas, dirFilter, activeTickerFilter, sort]);

  return (
    <>
      {/* Composer, wired to the book for the symbol being typed */}
      <div ref={composerRef}>
        <Panel title="Write a thesis" subtitle="the levels it is called against, while you write it" className="w-full">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
              <Field
                label="Ticker"
                value={ticker}
                onChange={v => setTicker(v.toUpperCase())}
                placeholder="SPY"
                className="w-32"
              />
              <Captioned caption="Direction">
                <SegmentedControl ariaLabel="Direction" options={POST_DIR_OPTIONS} value={direction} onChange={setDirection} />
              </Captioned>
              <Captioned caption="Horizon">
                <SegmentedControl ariaLabel="Horizon" options={HORIZON_OPTIONS} value={horizon} onChange={setHorizon} />
              </Captioned>
            </div>

            {composerBook ? (
              <BookStrip
                levels={composerBook}
                note={`${composerSymbol} key levels from the dealer model, read at ${clockOf(books.checkedAt)}`}
              />
            ) : (
              ticker.trim().length > 0 && (
                <span className="font-mono text-micro text-textMuted">
                  No reference book for {ticker.trim()}. You can still write the thesis; the levels read-out only
                  appears for names the terminal prices.
                </span>
              )
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Field
                label="Entry"
                value={entry}
                onChange={setEntry}
                placeholder="500.20"
                hint={composerBook && draftEntry != null ? zoneOf(draftEntry, composerBook) : undefined}
              />
              <Field
                label="Invalidation"
                value={invalidation}
                onChange={setInvalidation}
                placeholder="below 498"
                hint={composerBook && draftInvalidation != null ? zoneOf(draftInvalidation, composerBook) : undefined}
              />
              <Field
                label="Targets"
                value={targets}
                onChange={setTargets}
                placeholder="505, 508"
                hint={
                  composerBook && draftTarget != null ? fmtPct(pctFromSpot(draftTarget, composerBook.spot)) : undefined
                }
              />
              <Field label="Risk" value={risk} onChange={setRisk} placeholder="1R / 0.5% acct" />
            </div>

            <Captioned caption="Your position">
              <SegmentedControl ariaLabel="Your position" options={POSITION_OPTIONS} value={position} onChange={setPosition} />
            </Captioned>

            <TextArea
              label="Thesis"
              value={thesis}
              onChange={setThesis}
              placeholder="What is the setup? Levels, flow, reasoning, in your own words."
            />

            <div className="flex items-center gap-3 flex-wrap">
              <PrimaryButton icon={Send} onClick={post} disabled={!canPost}>
                Post thesis
              </PrimaryButton>
              <span className="font-mono text-label text-textMuted">
                Ticker and thesis required. Levels optional.
              </span>
            </div>
          </div>
        </Panel>
      </div>

      {/* Your board */}
      <div className="flex items-center gap-3 flex-wrap">
        <SegmentedControl ariaLabel="Direction filter" options={DIR_OPTIONS} value={dirFilter} onChange={setDirFilter} />
        <SegmentedControl ariaLabel="Sort" options={SORT_OPTIONS} value={sort} onChange={setSort} />
        {tickerOptions.length > 1 && (
          <SegmentedControl
            ariaLabel="Ticker filter"
            options={tickerOptions}
            value={activeTickerFilter}
            onChange={setTickerFilter}
          />
        )}
        <span className="ml-auto flex items-center gap-3">
          <span className="font-mono text-label text-textMuted uppercase tracking-widest tnum">
            {shown.length} of yours
          </span>
          {bookTickers.length > 0 && (
            <RowAction icon={RefreshCw} label="Re-read levels" onClick={books.recheck} labelAlways />
          )}
        </span>
      </div>

      <div className="flex flex-col gap-3">
        {shown.map(idea => {
          const { text, meta } = unpackMeta(idea.thesis);
          const fields = META_FIELDS.filter(f => meta[f.key]);
          const levels = books.byTicker[idea.ticker];
          const entryPrice = firstNumber(meta.entry ?? '');
          const invalPrice = firstNumber(meta.invalidation ?? '');
          const targetPrice = firstNumber(meta.targets ?? '');
          const through = levels && invalPrice != null && isThrough(idea.direction, levels.spot, invalPrice);
          const hasPlacement = !!levels && (entryPrice != null || invalPrice != null || targetPrice != null);

          return (
            <div key={idea.id} className="border border-borderSubtle bg-panel rounded-md px-4 py-3 flex flex-col gap-2.5">
              <div className="flex items-center gap-2 flex-wrap">
                <TickerTag symbol={idea.ticker} className="font-mono text-caption font-bold text-textPrimary" />
                <SignalBadge tone={idea.direction === 'BULLISH' ? 'bull' : 'bear'}>{idea.direction}</SignalBadge>
                {meta.horizon && <SignalBadge tone="neutral">{meta.horizon}</SignalBadge>}
                {through && <SignalBadge tone="warn" dot>Spot through invalidation</SignalBadge>}
                <span className="ml-auto flex items-center gap-1">
                  <RowAction icon={LineChart} label="Open on Pulse" onClick={() => openOnPulse(idea)} />
                  <RowAction icon={Copy} label="Copy" onClick={() => void copyIdea(idea)} />
                  <RowAction icon={Trash2} label="Delete" danger onClick={() => removeIdea(idea.id)} />
                </span>
              </div>

              <p className="text-caption text-textSecondary leading-relaxed">{text}</p>

              {(fields.length > 0 || meta.position) && (
                <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-borderSubtle/40 pt-2.5">
                  {fields.map(f => (
                    <div key={f.key} className="flex flex-col gap-0.5">
                      <span className="font-mono text-label uppercase tracking-wider text-textMuted">{f.label}</span>
                      <span className={`font-mono text-caption tnum ${f.tone === 'warn' ? 'text-warn' : 'text-textPrimary'}`}>
                        {meta[f.key]}
                      </span>
                    </div>
                  ))}
                  {meta.position && (
                    <div className="flex flex-col gap-0.5">
                      <span className="font-mono text-label uppercase tracking-wider text-textMuted">Position</span>
                      <span className="inline-flex">
                        <SignalBadge tone={positionTone(meta.position)}>
                          {meta.position === 'FLAT' ? 'No position' : meta.position}
                        </SignalBadge>
                      </span>
                    </div>
                  )}
                </div>
              )}

              {hasPlacement && levels && (
                <div className="rounded-md border border-borderSubtle/70 bg-inset px-3 py-2 flex flex-col gap-2">
                  <div className="flex flex-wrap items-start gap-x-6 gap-y-2">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-mono text-label uppercase tracking-wider text-textMuted">Spot</span>
                      <span className="font-mono text-caption text-textPrimary tnum">{fmtLevel(levels.spot)}</span>
                      <span className="font-mono text-micro text-textMuted leading-tight">{zoneOf(levels.spot, levels)}</span>
                    </div>
                    {entryPrice != null && <Placement label="Entry" price={entryPrice} levels={levels} />}
                    {invalPrice != null && (
                      <Placement label="Invalidation" price={invalPrice} levels={levels} tone={through ? 'warn' : 'neutral'} />
                    )}
                    {targetPrice != null && <Placement label="First target" price={targetPrice} levels={levels} />}
                  </div>
                  <span className="font-mono text-micro text-textMuted">
                    Flip {fmtLevel(levels.flip)} · Call wall {fmtLevel(levels.callWall)} · Put wall{' '}
                    {fmtLevel(levels.putWall)} · read at {clockOf(books.checkedAt)}
                  </span>
                </div>
              )}

              <span className="font-mono text-micro text-textMuted tnum">Written {timeAgo(idea.createdAt)}</span>
            </div>
          );
        })}

        {shown.length === 0 && (
          <Panel>
            <EmptyState
              icon={Lightbulb}
              title={state.ideas.length ? 'Nothing matches this filter' : 'No theses yet'}
              body={
                state.ideas.length
                  ? 'Clear the direction or ticker filter to see the rest.'
                  : 'Write one above, or start from an example below.'
              }
            />
          </Panel>
        )}
      </div>

      {/* Shipped examples. Read-only on purpose: with no accounts behind them a
          handle and a vote tally would be decoration, so neither is rendered. */}
      <Panel
        title="Worked examples"
        subtitle="four theses that ship with the terminal, to copy the shape of"
        flush
        className="w-full"
      >
        {EXAMPLE_IDEAS.map(example => (
          <div
            key={example.id}
            className="px-4 py-3 border-b border-borderSubtle/40 last:border-0 flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-4"
          >
            <span className="flex items-center gap-2 shrink-0">
              <TickerTag symbol={example.ticker} className="font-mono text-caption font-bold text-textPrimary" />
              <SignalBadge tone={example.direction === 'BULLISH' ? 'bull' : 'bear'}>{example.direction}</SignalBadge>
            </span>
            <p className="min-w-0 flex-1 text-caption text-textSecondary leading-relaxed">{example.thesis}</p>
            <span className="shrink-0 sm:ml-auto">
              <RowAction icon={SquarePen} label="Use as template" onClick={() => loadTemplate(example)} labelAlways />
            </span>
          </div>
        ))}
      </Panel>
    </>
  );
};

export default Ideas;
