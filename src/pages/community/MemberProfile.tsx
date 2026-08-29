import { useMemo, useSyncExternalStore } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, UserCheck, UserPlus } from 'lucide-react';
import {
  MIN_RANKED_POSTS, allIdeas, commentsFor, getFollowing, leaderboard,
  outcomeOf, subscribeFollow, toggleFollow,
} from '../../data/communitySocial';
import { timeAgo } from '../../data/community';
import Avatar from '../../components/community/Avatar';
import Panel from '../../components/ui/Panel';
import StatCard from '../../components/ui/StatCard';
import MetricGrid from '../../components/ui/MetricGrid';
import DataState from '../../components/ui/DataState';
import SignalBadge from '../../components/ui/SignalBadge';

/*
  §19's profile: who this is, what they have called, and how it went.

  THE OUTCOME BADGE IS ON EVERY IDEA, including the open ones, because a
  profile that only showed resolved calls would be a highlight reel. OPEN is
  drawn as plainly as HIT and MISS — it is the honest majority state of any
  active board.
*/

const MemberProfile = () => {
  const { handle = '' } = useParams();
  const following = useSyncExternalStore(subscribeFollow, getFollowing, getFollowing);
  const ideas = useMemo(() => allIdeas().filter(i => i.author === handle), [handle]);
  const record = useMemo(() => leaderboard(allIdeas()).find(r => r.handle === handle) ?? null, [handle]);
  const on = following.includes(handle);

  if (!record) {
    return (
      <Panel className="w-full">
        <DataState
          kind="empty"
          title="No such member"
          body={`Nobody on this board posts as “${handle}”.`}
        />
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Link
        to="/community/leaderboard"
        className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-textMuted hover:text-textSecondary w-fit focus:outline-none focus-visible:ring-1 focus-visible:ring-select rounded"
      >
        <ArrowLeft size={11} /> Leaderboard
      </Link>

      <Panel className="w-full">
        <div className="flex items-start gap-4">
          <Avatar handle={handle} size="lg" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="font-mono text-[15px] text-textPrimary">{handle}</h2>
              <button
                onClick={() => toggleFollow(handle)}
                aria-pressed={on}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border font-mono text-[9px] uppercase tracking-wider transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-select ${
                  on ? 'border-select/50 text-select' : 'border-borderSubtle text-textMuted hover:text-textSecondary'
                }`}
              >
                {on ? <UserCheck size={10} /> : <UserPlus size={10} />}
                {on ? 'Following' : 'Follow'}
              </button>
            </div>
            <p className="text-[11px] text-textMuted mt-1">
              {record.ranked
                ? `Ranked on ${record.hits + record.misses} resolved ideas.`
                : `Unranked — ${record.hits + record.misses} of ${MIN_RANKED_POSTS} resolved ideas so far.`}
              {' '}Following is a note this browser keeps; there are no accounts on this desk yet.
            </p>
          </div>
        </div>

        <MetricGrid min="140px" className="mt-4">
          <StatCard
            label="Hit rate"
            value={record.hitRate === null ? '—' : `${record.hitRate.toFixed(0)}%`}
            sub={record.hitRate === null ? `needs ${MIN_RANKED_POSTS} resolved` : `of ${record.hits + record.misses} resolved`}
            tone={record.hitRate === null ? 'neutral' : record.hitRate >= 55 ? 'bull' : record.hitRate <= 45 ? 'bear' : 'neutral'}
          />
          <StatCard label="Ideas posted" value={String(record.posts)} sub={`${record.open} still open`} />
          <StatCard label="Hits" value={String(record.hits)} sub="resolved in their favour" tone="bull" />
          <StatCard label="Misses" value={String(record.misses)} sub="resolved against" tone="bear" />
          <StatCard label="Votes received" value={String(record.votes)} sub="across every idea" />
        </MetricGrid>
      </Panel>

      <Panel title="Ideas" subtitle={`${ideas.length} posted`} className="w-full">
        {ideas.length === 0 ? (
          <DataState kind="empty" title="Nothing posted yet" body="This member has not put an idea on the board." />
        ) : (
          <div className="flex flex-col gap-3">
            {ideas.map(idea => {
              const outcome = outcomeOf(idea);
              const comments = commentsFor(idea);
              return (
                <div key={idea.id} className="border border-borderSubtle rounded-md p-3 bg-inset/40">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-[11px] text-textPrimary">{idea.ticker}</span>
                    <SignalBadge tone={idea.direction === 'BULLISH' ? 'bull' : idea.direction === 'BEARISH' ? 'bear' : 'neutral'}>
                      {idea.direction}
                    </SignalBadge>
                    <span className={`font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                      outcome === 'HIT' ? 'border-bull/40 text-bull'
                        : outcome === 'MISS' ? 'border-bear/40 text-bear'
                        : 'border-borderSubtle text-textMuted'
                    }`}>
                      {outcome}
                    </span>
                    <span className="ml-auto font-mono text-[10px] text-textMuted">{timeAgo(idea.createdAt)}</span>
                  </div>
                  <p className="text-[12px] text-textSecondary leading-snug mt-2">{idea.thesis}</p>
                  <p className="font-mono text-[10px] text-textMuted mt-2">
                    {idea.votes} votes · {comments.length} {comments.length === 1 ? 'reply' : 'replies'}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
};

export default MemberProfile;
