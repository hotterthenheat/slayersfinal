import { useMemo, useState } from 'react';
import { ChevronUp, MessageSquare, Send } from 'lucide-react';
import { Link } from 'react-router-dom';
import Avatar from '../../components/community/Avatar';
import { commentsFor } from '../../data/communitySocial';
import Panel from '../../components/ui/Panel';
import SegmentedControl from '../../components/ui/SegmentedControl';
import SignalBadge from '../../components/ui/SignalBadge';
import { loadCommunity, saveCommunity, timeAgo, hotScore } from '../../data/community';
import type { CommunityIdea, IdeaDirection } from '../../types/community';

type DirectionFilter = 'ALL' | IdeaDirection;
type SortKey = 'NEW' | 'HOT' | 'TOP';

const DIR_OPTIONS = [
  { value: 'ALL', label: 'All' },
  { value: 'BULLISH', label: 'Bullish' },
  { value: 'BEARISH', label: 'Bearish' },
] as const;

const SORT_OPTIONS = [
  { value: 'NEW', label: 'Newest' },
  /* 12 — HOT sits between the two and is the one worth defaulting to.
     "Top voted" over a list that only grows is a permanent record: an idea
     from a month ago outranks one from this morning forever, because it
     has had a month to collect votes. Both orders stay, because "what has
     the most support ever" is a real question — it is just not the same
     question as "what should I read now". */
  { value: 'HOT', label: 'Hot' },
  { value: 'TOP', label: 'Top voted' },
] as const;

const POST_DIR_OPTIONS = [
  { value: 'BULLISH', label: 'Bullish' },
  { value: 'BEARISH', label: 'Bearish' },
] as const;

const Ideas = () => {
  const [openThread, setOpenThread] = useState<string | null>(null);
  const [state, setState] = useState(loadCommunity);
  const [dirFilter, setDirFilter] = useState<DirectionFilter>('ALL');
  const [sort, setSort] = useState<SortKey>('NEW');

  // Composer
  const [ticker, setTicker] = useState('');
  const [direction, setDirection] = useState<IdeaDirection>('BULLISH');
  const [thesis, setThesis] = useState('');

  const update = (next: typeof state) => {
    setState(next);
    saveCommunity(next);
  };

  const post = () => {
    const t = ticker.trim().toUpperCase();
    const body = thesis.trim();
    if (!t || body.length < 10) return;
    const idea: CommunityIdea = {
      id: `you-${Date.now()}`,
      author: 'you',
      ticker: t,
      direction,
      thesis: body,
      votes: 1,
      createdAt: new Date().toISOString(),
    };
    update({ ...state, ideas: [idea, ...state.ideas], voted: [...state.voted, idea.id] });
    setTicker('');
    setThesis('');
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
    if (sort === 'TOP') return [...filtered].sort((a, b) => b.votes - a.votes);
    if (sort === 'HOT') {
      const now = Date.now();
      return [...filtered].sort((a, b) => hotScore(b.votes, b.createdAt, now) - hotScore(a.votes, a.createdAt, now));
    }
    return [...filtered].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [state.ideas, dirFilter, sort]);

  return (
    <>
      {/* Composer */}
      <Panel title="Share an idea" subtitle="ticker · direction · your thesis" className="w-full">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <input
              value={ticker}
              onChange={e => setTicker(e.target.value)}
              placeholder="Ticker (e.g. SPY)"
              maxLength={6}
              className="w-36 bg-inputBg border border-borderSubtle rounded-md px-2.5 py-1.5 font-mono text-[12px] uppercase text-textPrimary placeholder:text-textMuted placeholder:normal-case focus:border-borderMuted outline-none transition-colors"
            />
            <SegmentedControl ariaLabel="Direction" options={POST_DIR_OPTIONS} value={direction} onChange={setDirection} />
          </div>
          <textarea
            value={thesis}
            onChange={e => setThesis(e.target.value)}
            placeholder="What's the setup? Levels, flow, reasoning — in your own words…"
            rows={2}
            className="w-full bg-inputBg border border-borderSubtle rounded-md px-2.5 py-2 text-[12px] text-textPrimary placeholder:text-textMuted focus:border-borderMuted outline-none transition-colors resize-y"
          />
          <div className="flex items-center gap-3">
            <button
              onClick={post}
              disabled={!ticker.trim() || thesis.trim().length < 10}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-select/40 bg-select/[0.06] hover:bg-select/[0.12] font-mono text-[11px] font-semibold uppercase tracking-wider text-select transition-colors disabled:opacity-40 disabled:pointer-events-none"
            >
              <Send className="w-3.5 h-3.5" /> Share idea
            </button>
            <span className="font-mono text-[10px] text-textMuted">
              Posts live in this browser until accounts launch
            </span>
          </div>
        </div>
      </Panel>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <SegmentedControl ariaLabel="Direction filter" options={DIR_OPTIONS} value={dirFilter} onChange={setDirFilter} />
        <SegmentedControl ariaLabel="Sort" options={SORT_OPTIONS} value={sort} onChange={setSort} />
        <span className="ml-auto font-mono text-[10px] text-textMuted uppercase tracking-widest tnum">
          {shown.length} ideas
        </span>
      </div>

      {/* Feed */}
      <div className="flex flex-col gap-3">
        {shown.map(idea => {
          const voted = state.voted.includes(idea.id);
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
                  <span className="ml-auto flex items-center gap-1.5 font-mono text-[10px] text-textMuted tnum">
                    {idea.author === 'you' ? (
                      <span className="text-select">you</span>
                    ) : (
                      <Link
                        to={`/community/member/${idea.author}`}
                        className="flex items-center gap-1.5 hover:text-textSecondary focus:outline-none focus-visible:ring-1 focus-visible:ring-select rounded"
                      >
                        <Avatar handle={idea.author} size="sm" />
                        {idea.author}
                      </Link>
                    )}
                    <span>· {timeAgo(idea.createdAt)}</span>
                  </span>
                </div>
                <p className="mt-1.5 text-[12px] text-textSecondary leading-relaxed">“{idea.thesis}”</p>

                {/* The thread. Collapsed by default — a feed of open threads
                    is a wall of text, and the reply count is the affordance. */}
                {(() => {
                  const comments = commentsFor(idea);
                  const open = openThread === idea.id;
                  return (
                    <div className="mt-2">
                      <button
                        onClick={() => setOpenThread(open ? null : idea.id)}
                        aria-expanded={open}
                        className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-textMuted hover:text-textSecondary focus:outline-none focus-visible:ring-1 focus-visible:ring-select rounded"
                      >
                        <MessageSquare size={11} />
                        {comments.length === 0
                          ? 'No replies'
                          : `${comments.length} ${comments.length === 1 ? 'reply' : 'replies'}`}
                      </button>
                      {open && comments.length > 0 && (
                        <div className="mt-2 flex flex-col gap-2 border-l border-borderSubtle pl-3">
                          {comments.map(c => (
                            <div key={c.id} className="flex items-start gap-2">
                              <Avatar handle={c.author} size="sm" />
                              <div className="min-w-0">
                                <div className="font-mono text-[10px] text-textMuted">
                                  <Link to={`/community/member/${c.author}`} className="hover:text-textSecondary">{c.author}</Link>
                                  {' · '}{timeAgo(c.createdAt)}{' · '}{c.votes} votes
                                </div>
                                <p className="text-[11px] text-textSecondary leading-snug">{c.body}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {open && comments.length === 0 && (
                        <p className="mt-2 text-[11px] text-textMuted">Nobody has replied to this yet.</p>
                      )}
                    </div>
                  );
                })()}
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
