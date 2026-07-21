import { useMemo, useState } from 'react';
import { ChevronUp, Send } from 'lucide-react';
import Panel from '../../components/ui/Panel';
import SegmentedControl from '../../components/ui/SegmentedControl';
import SignalBadge from '../../components/ui/SignalBadge';
import { toneDot, type Tone } from '../../components/ui/tones';
import { loadCommunity, saveCommunity, timeAgo } from '../../data/community';
import type { FeatureRequest, RequestKind, RequestStatus } from '../../types/community';

const KIND_OPTIONS = [
  { value: 'FEATURE', label: 'New feature' },
  { value: 'PRODUCT', label: 'New product' },
  { value: 'IMPROVEMENT', label: 'Improvement' },
] as const;

const STATUS_TONE: Record<RequestStatus, Tone> = {
  'UNDER REVIEW': 'neutral',
  PLANNED: 'select',
  BUILDING: 'warn',
  SHIPPED: 'bull',
};

// Left-edge rail per status — the fastest read of where an item sits.
const STATUS_RAIL: Record<RequestStatus, string> = {
  'UNDER REVIEW': 'border-l-textMuted/50',
  PLANNED: 'border-l-select/60',
  BUILDING: 'border-l-warn/70',
  SHIPPED: 'border-l-[#30D158]/70',
};

// Plain-language line under each section header.
const STATUS_BLURB: Record<RequestStatus, string> = {
  BUILDING: 'In progress right now',
  PLANNED: 'On the roadmap, not started',
  'UNDER REVIEW': 'Being weighed — votes help it rise',
  SHIPPED: 'Live in the terminal',
};

const STATUS_ORDER: RequestStatus[] = ['BUILDING', 'PLANNED', 'UNDER REVIEW', 'SHIPPED'];

type StatusFilter = 'ALL' | RequestStatus;

const Requests = () => {
  const [state, setState] = useState(loadCommunity);
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [kind, setKind] = useState<RequestKind>('FEATURE');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');

  const update = (next: typeof state) => {
    setState(next);
    saveCommunity(next);
  };

  const submit = () => {
    const t = title.trim();
    if (t.length < 4) return;
    const req: FeatureRequest = {
      id: `you-${Date.now()}`,
      author: 'you',
      title: t,
      detail: detail.trim(),
      kind,
      status: 'UNDER REVIEW',
      votes: 1,
      createdAt: new Date().toISOString(),
    };
    update({ ...state, requests: [req, ...state.requests], voted: [...state.voted, req.id] });
    setTitle('');
    setDetail('');
  };

  const toggleVote = (id: string) => {
    const has = state.voted.includes(id);
    update({
      ...state,
      voted: has ? state.voted.filter(v => v !== id) : [...state.voted, id],
      requests: state.requests.map(r => (r.id === id ? { ...r, votes: r.votes + (has ? -1 : 1) } : r)),
    });
  };

  // Count per status for the legend / filter chips.
  const counts = useMemo(() => {
    const c: Record<RequestStatus, number> = { BUILDING: 0, PLANNED: 0, 'UNDER REVIEW': 0, SHIPPED: 0 };
    for (const r of state.requests) c[r.status] += 1;
    return c;
  }, [state.requests]);

  // Group by status (order fixed), votes break ties inside a group.
  const groups = useMemo(() => {
    return STATUS_ORDER.filter(s => statusFilter === 'ALL' || s === statusFilter).map(status => ({
      status,
      items: state.requests
        .filter(r => r.status === status)
        .sort((a, b) => b.votes - a.votes),
    }));
  }, [state.requests, statusFilter]);

  const filterOptions = useMemo(
    () => [
      { value: 'ALL' as StatusFilter, label: `All ${state.requests.length}` },
      ...STATUS_ORDER.map(s => ({ value: s as StatusFilter, label: `${s} ${counts[s]}` })),
    ],
    [counts, state.requests.length]
  );

  return (
    <>
      {/* Composer */}
      <Panel title="Request something" subtitle="what should we build next?" className="w-full">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="One-line summary (e.g. Alerts when a wall breaks)"
              className="flex-grow min-w-[240px] bg-inputBg border border-borderSubtle rounded-md px-2.5 py-1.5 text-[12px] text-textPrimary placeholder:text-textMuted focus:border-borderMuted outline-none transition-colors"
            />
            <SegmentedControl ariaLabel="Request type" options={KIND_OPTIONS} value={kind} onChange={setKind} />
          </div>
          <textarea
            value={detail}
            onChange={e => setDetail(e.target.value)}
            placeholder="Optional detail — what problem does it solve for you?"
            rows={2}
            className="w-full bg-inputBg border border-borderSubtle rounded-md px-2.5 py-2 text-[12px] text-textPrimary placeholder:text-textMuted focus:border-borderMuted outline-none transition-colors resize-y"
          />
          <div className="flex items-center gap-3">
            <button
              onClick={submit}
              disabled={title.trim().length < 4}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-select/40 bg-select/[0.06] hover:bg-select/[0.12] font-mono text-[11px] font-semibold uppercase tracking-wider text-select transition-colors disabled:opacity-40 disabled:pointer-events-none"
            >
              <Send className="w-3.5 h-3.5" /> Add request
            </button>
            <span className="font-mono text-[11px] text-textMuted">
              Saved to this browser · votes sort the board so the most-wanted rise
            </span>
          </div>
        </div>
      </Panel>

      {/* Status filter / legend */}
      <div className="flex items-center gap-3 flex-wrap">
        <SegmentedControl
          ariaLabel="Filter by status"
          options={filterOptions}
          value={statusFilter}
          onChange={setStatusFilter}
        />
      </div>

      {/* Board — grouped by status */}
      <div className="flex flex-col gap-6">
        {groups.map(group => {
          if (group.items.length === 0) return null;
          const tone = STATUS_TONE[group.status];
          return (
            <section key={group.status} className="flex flex-col gap-2.5">
              {/* Status header */}
              <div className="flex items-center gap-2.5">
                <span className={`w-2 h-2 rounded-full ${toneDot[tone]}`} />
                <h3 className="font-mono text-[13px] font-semibold uppercase tracking-wider text-textPrimary">
                  {group.status}
                </h3>
                <span className="font-mono text-[11px] tnum text-textMuted">{group.items.length}</span>
                <span className="font-mono text-[11px] text-textSecondary normal-case tracking-normal hidden sm:inline">
                  · {STATUS_BLURB[group.status]}
                </span>
              </div>

              {/* Cards */}
              {group.items.map(req => {
                const voted = state.voted.includes(req.id);
                return (
                  <div
                    key={req.id}
                    className={`border border-borderSubtle border-l-2 ${STATUS_RAIL[group.status]} bg-panel rounded-md px-4 py-3 flex gap-4`}
                  >
                    <button
                      onClick={() => toggleVote(req.id)}
                      className={`shrink-0 self-start flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-md border transition-colors ${
                        voted
                          ? 'border-select/50 bg-select/[0.08] text-select'
                          : 'border-borderSubtle text-textSecondary hover:text-textPrimary hover:bg-white/[0.03]'
                      }`}
                      aria-label="Vote"
                    >
                      <ChevronUp className="w-4 h-4" />
                      <span className="font-mono text-[11px] font-bold tnum">{req.votes}</span>
                    </button>
                    <div className="min-w-0 flex-grow">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[13px] font-semibold text-textPrimary">{req.title}</span>
                        <SignalBadge tone={STATUS_TONE[req.status]} dot>
                          {req.status}
                        </SignalBadge>
                        <SignalBadge tone="neutral">{req.kind}</SignalBadge>
                        <span className="ml-auto font-mono text-[10px] text-textMuted tnum">
                          {req.author === 'you' ? <span className="text-select">you</span> : req.author} · {timeAgo(req.createdAt)}
                        </span>
                      </div>
                      {req.detail && <p className="mt-1.5 text-[12px] text-textSecondary leading-relaxed">{req.detail}</p>}
                    </div>
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>
    </>
  );
};

export default Requests;
