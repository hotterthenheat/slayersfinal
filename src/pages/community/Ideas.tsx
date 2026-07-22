import { useMemo, useState } from 'react';
import { ChevronUp, Send } from 'lucide-react';
import Panel from '../../components/ui/Panel';
import SegmentedControl from '../../components/ui/SegmentedControl';
import SignalBadge from '../../components/ui/SignalBadge';
import type { Tone } from '../../components/ui/tones';
import { loadCommunity, saveCommunity, timeAgo } from '../../data/community';
import type { CommunityIdea, IdeaDirection } from '../../types/community';
import { packMeta, unpackMeta } from './localMeta';

type DirectionFilter = 'ALL' | IdeaDirection;
type SortKey = 'NEW' | 'TOP';
type Horizon = 'INTRADAY' | 'SWING' | 'POSITION';
type PositionSide = 'FLAT' | 'LONG' | 'SHORT';

const DIR_OPTIONS = [
  { value: 'ALL', label: 'All' },
  { value: 'BULLISH', label: 'Bullish' },
  { value: 'BEARISH', label: 'Bearish' },
] as const;

const SORT_OPTIONS = [
  { value: 'NEW', label: 'Newest' },
  { value: 'TOP', label: 'Top voted' },
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

// Order + labels for the structured thesis read-out on each card.
const META_FIELDS: { key: string; label: string; tone?: Tone }[] = [
  { key: 'horizon', label: 'Horizon' },
  { key: 'entry', label: 'Entry' },
  { key: 'invalidation', label: 'Invalidation', tone: 'warn' },
  { key: 'targets', label: 'Targets' },
  { key: 'risk', label: 'Risk' },
];

const positionTone = (v: string): Tone => (v === 'LONG' ? 'bull' : v === 'SHORT' ? 'bear' : 'neutral');

// Small labelled text field for the composer.
const Field = ({
  label,
  value,
  onChange,
  placeholder,
  className = '',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  className?: string;
}) => (
  <label className={`flex flex-col gap-1 ${className}`}>
    <span className="font-mono text-[11px] uppercase tracking-wider text-textMuted">{label}</span>
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-inputBg border border-borderSubtle rounded-md px-2.5 py-1.5 font-mono text-[12px] text-textPrimary placeholder:text-textMuted focus:border-borderMuted outline-none transition-colors"
    />
  </label>
);

const Ideas = () => {
  const [state, setState] = useState(loadCommunity);
  const [dirFilter, setDirFilter] = useState<DirectionFilter>('ALL');
  const [sort, setSort] = useState<SortKey>('NEW');

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

  const canPost = ticker.trim().length > 0 && thesis.trim().length >= 10;

  const update = (next: typeof state) => {
    setState(next);
    saveCommunity(next);
  };

  const post = () => {
    const t = ticker.trim().toUpperCase();
    const body = thesis.trim();
    if (!t || body.length < 10) return;
    // Structured fields ride alongside the narrative in the existing thesis field.
    const packed = packMeta(body, {
      horizon,
      entry,
      invalidation,
      targets,
      risk,
      position,
    });
    const idea: CommunityIdea = {
      id: `you-${Date.now()}`,
      author: 'you',
      ticker: t,
      direction,
      thesis: packed,
      votes: 1,
      createdAt: new Date().toISOString(),
    };
    update({ ...state, ideas: [idea, ...state.ideas], voted: [...state.voted, idea.id] });
    setTicker('');
    setThesis('');
    setEntry('');
    setInvalidation('');
    setTargets('');
    setRisk('');
    setHorizon('SWING');
    setPosition('FLAT');
  };

  const toggleVote = (id: string) => {
    const has = state.voted.includes(id);
    update({
      ...state,
      voted: has ? state.voted.filter(v => v !== id) : [...state.voted, id],
      ideas: state.ideas.map(i => (i.id === id ? { ...i, votes: i.votes + (has ? -1 : 1) } : i)),
    });
  };

  const shown = useMemo(() => {
    const filtered = state.ideas.filter(i => dirFilter === 'ALL' || i.direction === dirFilter);
    return sort === 'TOP'
      ? [...filtered].sort((a, b) => b.votes - a.votes)
      : [...filtered].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [state.ideas, dirFilter, sort]);

  return (
    <>
      {/* Structured thesis composer */}
      <Panel title="Write a thesis" subtitle="structure the trade before you post it" className="w-full">
        <div className="flex flex-col gap-4">
          {/* Instrument + direction + horizon */}
          <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
            <Field label="Ticker" value={ticker} onChange={v => setTicker(v.toUpperCase())} placeholder="SPY" className="w-32" />
            <label className="flex flex-col gap-1">
              <span className="font-mono text-[11px] uppercase tracking-wider text-textMuted">Direction</span>
              <SegmentedControl ariaLabel="Direction" options={POST_DIR_OPTIONS} value={direction} onChange={setDirection} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-mono text-[11px] uppercase tracking-wider text-textMuted">Horizon</span>
              <SegmentedControl ariaLabel="Horizon" options={HORIZON_OPTIONS} value={horizon} onChange={setHorizon} />
            </label>
          </div>

          {/* Levels */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Field label="Entry" value={entry} onChange={setEntry} placeholder="500.20" />
            <Field label="Invalidation" value={invalidation} onChange={setInvalidation} placeholder="below 498" />
            <Field label="Targets" value={targets} onChange={setTargets} placeholder="505, 508" />
            <Field label="Risk" value={risk} onChange={setRisk} placeholder="1R / 0.5% acct" />
          </div>

          {/* Position disclosure */}
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[11px] uppercase tracking-wider text-textMuted">Your position</span>
            <div>
              <SegmentedControl ariaLabel="Your position" options={POSITION_OPTIONS} value={position} onChange={setPosition} />
            </div>
          </label>

          {/* Narrative */}
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[11px] uppercase tracking-wider text-textMuted">Thesis</span>
            <textarea
              value={thesis}
              onChange={e => setThesis(e.target.value)}
              placeholder="What's the setup? Levels, flow, reasoning — in your own words…"
              rows={2}
              className="w-full bg-inputBg border border-borderSubtle rounded-md px-2.5 py-2 text-[12px] text-textPrimary placeholder:text-textMuted focus:border-borderMuted outline-none transition-colors resize-y"
            />
          </label>

          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={post}
              disabled={!canPost}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-select/40 bg-select/[0.06] hover:bg-select/[0.12] font-mono text-[11px] font-semibold uppercase tracking-wider text-select transition-colors disabled:opacity-40 disabled:pointer-events-none"
            >
              <Send className="w-3.5 h-3.5" /> Post thesis
            </button>
            <span className="font-mono text-[11px] text-textMuted">
              Ticker and thesis required · levels optional · saved to this browser
            </span>
          </div>
        </div>
      </Panel>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <SegmentedControl ariaLabel="Direction filter" options={DIR_OPTIONS} value={dirFilter} onChange={setDirFilter} />
        <SegmentedControl ariaLabel="Sort" options={SORT_OPTIONS} value={sort} onChange={setSort} />
        <span className="ml-auto font-mono text-[11px] text-textMuted uppercase tracking-widest tnum">
          {shown.length} ideas
        </span>
      </div>

      {/* Feed */}
      <div className="flex flex-col gap-3">
        {shown.map(idea => {
          const voted = state.voted.includes(idea.id);
          const { text, meta } = unpackMeta(idea.thesis);
          const fields = META_FIELDS.filter(f => meta[f.key]);
          const hasStructure = fields.length > 0 || !!meta.position;
          return (
            <div key={idea.id} className="border border-borderSubtle bg-panel rounded-md px-4 py-3 flex gap-4">
              <button
                onClick={() => toggleVote(idea.id)}
                className={`shrink-0 self-start flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-md border transition-colors ${
                  voted
                    ? 'border-select/50 bg-select/[0.08] text-select'
                    : 'border-borderSubtle text-textSecondary hover:text-textPrimary hover:bg-white/[0.03]'
                }`}
                aria-label="Vote"
              >
                <ChevronUp className="w-4 h-4" />
                <span className="font-mono text-[11px] font-bold tnum">{idea.votes}</span>
              </button>
              <div className="min-w-0 flex-grow">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-[12px] font-bold text-textPrimary">{idea.ticker}</span>
                  <SignalBadge tone={idea.direction === 'BULLISH' ? 'bull' : 'bear'}>{idea.direction}</SignalBadge>
                  <span className="ml-auto font-mono text-[10px] text-textMuted tnum">
                    {idea.author === 'you' ? <span className="text-select">you</span> : idea.author} · {timeAgo(idea.createdAt)}
                  </span>
                </div>
                <p className="mt-1.5 text-[12px] text-textSecondary leading-relaxed">“{text}”</p>

                {hasStructure && (
                  <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-2 border-t border-borderSubtle/40 pt-2.5">
                    {fields.map(f => (
                      <div key={f.key} className="flex flex-col gap-0.5">
                        <span className="font-mono text-[11px] uppercase tracking-wider text-textMuted">{f.label}</span>
                        <span
                          className={`font-mono text-[12px] tnum ${
                            f.tone === 'warn' ? 'text-warn' : 'text-textPrimary'
                          }`}
                        >
                          {meta[f.key]}
                        </span>
                      </div>
                    ))}
                    {meta.position && (
                      <div className="flex flex-col gap-0.5">
                        <span className="font-mono text-[11px] uppercase tracking-wider text-textMuted">Position</span>
                        <span className="inline-flex">
                          <SignalBadge tone={positionTone(meta.position)}>
                            {meta.position === 'FLAT' ? 'No position' : meta.position}
                          </SignalBadge>
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {shown.length === 0 && (
          <Panel className="h-40" bodyClassName="flex items-center justify-center">
            <span className="font-mono text-[11px] text-textMuted uppercase tracking-widest">
              No ideas match this filter
            </span>
          </Panel>
        )}
      </div>
    </>
  );
};

export default Ideas;
