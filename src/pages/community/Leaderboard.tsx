import { useMemo, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { UserPlus, UserCheck } from 'lucide-react';
import {
  MIN_RANKED_POSTS, allIdeas, getFollowing, isFollowing, leaderboard,
  subscribeFollow, toggleFollow, type AuthorRecord,
} from '../../data/communitySocial';
import Avatar from '../../components/community/Avatar';
import Panel from '../../components/ui/Panel';
import DataTable, { type Column } from '../../components/ui/DataTable';
import DataState from '../../components/ui/DataState';
import ProvenanceChip from '../../components/ui/ProvenanceChip';

/*
  §19's leaderboard.

  A RECORD IS A CLAIM AND HAS TO BE CHECKABLE. Hit rate is the one number on
  this page that could quietly become marketing, so it is built from the
  author's own posted ideas, resolved by a stated rule, with the sample size
  next to it — and nobody is ranked at all under five resolved posts. A 100%
  hit rate on one idea is not a record, it is one idea, and the table says
  UNRANKED rather than sorting them to the top.
*/

const Leaderboard = () => {
  const following = useSyncExternalStore(subscribeFollow, getFollowing, getFollowing);
  const rows = useMemo(() => leaderboard(allIdeas()), []);

  const cols: Column<AuthorRecord>[] = [
    {
      key: 'who', header: 'Member', width: '220px', sortValue: r => r.handle,
      render: r => (
        <Link to={`/community/member/${r.handle}`} className="flex items-center gap-2 hover:text-textPrimary focus:outline-none focus-visible:ring-1 focus-visible:ring-select rounded">
          <Avatar handle={r.handle} size="sm" />
          <span className="font-mono text-[11px] text-textSecondary">{r.handle}</span>
        </Link>
      ),
    },
    {
      key: 'rate', header: 'Hit rate', align: 'right', width: '150px',
      sortValue: r => r.hitRate ?? -1,
      render: r =>
        r.hitRate === null ? (
          <span className="font-mono text-[10px] uppercase tracking-wider text-textMuted">
            unranked · {r.hits + r.misses}/{MIN_RANKED_POSTS}
          </span>
        ) : (
          <span className={`font-mono text-[11px] ${r.hitRate >= 55 ? 'text-bull' : r.hitRate <= 45 ? 'text-bear' : 'text-textSecondary'}`}>
            {r.hitRate.toFixed(0)}%
            <span className="text-textMuted ml-1">of {r.hits + r.misses}</span>
          </span>
        ),
    },
    { key: 'posts', header: 'Ideas', align: 'right', width: '80px', sortValue: r => r.posts,
      render: r => <span className="font-mono text-[11px] text-textSecondary">{r.posts}</span> },
    { key: 'open', header: 'Open', align: 'right', width: '80px', sortValue: r => r.open,
      render: r => <span className="font-mono text-[11px] text-textMuted">{r.open}</span> },
    { key: 'votes', header: 'Votes', align: 'right', width: '90px', sortValue: r => r.votes,
      render: r => <span className="font-mono text-[11px] text-textSecondary">{r.votes}</span> },
    {
      key: 'follow', header: '', align: 'right', width: '110px',
      render: r => {
        const on = following.includes(r.handle);
        return (
          <button
            onClick={e => { e.stopPropagation(); toggleFollow(r.handle); }}
            aria-pressed={on}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border font-mono text-[9px] uppercase tracking-wider transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-select ${
              on ? 'border-select/50 text-select' : 'border-borderSubtle text-textMuted hover:text-textSecondary'
            }`}
          >
            {on ? <UserCheck size={10} /> : <UserPlus size={10} />}
            {on ? 'Following' : 'Follow'}
          </button>
        );
      },
    },
  ];

  return (
    <Panel
      title="Leaderboard"
      subtitle={`${rows.length} members · ranked on resolved ideas only`}
      className="w-full"
      flush
      actions={<ProvenanceChip sources={['tape']} kind="model" note="Outcomes are resolved by this desk's own rule, not by a vendor." />}
    >
      {rows.length === 0 ? (
        <DataState kind="empty" title="No members yet" body="Post an idea on the board and the record starts here." />
      ) : (
        <>
          <DataTable
            columns={cols}
            rows={rows}
            rowKey={r => r.handle}
            initialSort={{ key: 'rate', dir: 'desc' }}
            maxHeight="520px"
            emptyText="No members yet."
          />
          <p className="px-3 py-2 text-[11px] text-textMuted leading-snug border-t border-borderSubtle">
            An idea is judged once a full session has passed; until then it counts as open and toward nothing.
            Under {MIN_RANKED_POSTS} resolved ideas a member is unranked — a hit rate on one idea is one idea, not a record.
          </p>
        </>
      )}
    </Panel>
  );
};

export default Leaderboard;
