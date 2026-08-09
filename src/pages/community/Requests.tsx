import { useMemo, useState } from 'react';
import { Check, Hammer, Plus, Send, Trash2 } from 'lucide-react';
import Panel from '../../components/ui/Panel';
import SegmentedControl from '../../components/ui/SegmentedControl';
import SignalBadge from '../../components/ui/SignalBadge';
import EmptyState from '../../components/ui/EmptyState';
import { toneDot } from '../../components/ui/tones';
import { isShippedId, ROADMAP, timeAgo } from '../../data/community';
import type { FeatureRequest, RequestKind, RequestStatus } from '../../types/community';
import { useCommunity } from './store';
import { STATUS_BLURB, STATUS_ORDER, STATUS_RAIL, STATUS_TONE } from './status';
import { PrimaryButton, RowAction, TextArea, TextInput } from './controls';

const KIND_OPTIONS = [
  { value: 'FEATURE', label: 'New feature' },
  { value: 'PRODUCT', label: 'New product' },
  { value: 'IMPROVEMENT', label: 'Improvement' },
] as const;


type StatusFilter = 'ALL' | RequestStatus;

const Requests = () => {
  const { state, addRequest, removeRequest, toggleBacked } = useCommunity();
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [kind, setKind] = useState<RequestKind>('FEATURE');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');

  const submit = () => {
    const t = title.trim();
    if (t.length < 4) return;
    addRequest({
      id: `you-${Date.now()}`,
      author: 'you',
      title: t,
      detail: detail.trim(),
      kind,
      status: 'UNDER REVIEW',
      // No tally exists without accounts, so the field the API contract needs
      // starts at zero rather than at a flattering number.
      votes: 0,
      createdAt: new Date().toISOString(),
    });
    setTitle('');
    setDetail('');
  };

  // Yours first inside a status, then the published order.
  const board = useMemo<FeatureRequest[]>(() => [...state.requests, ...ROADMAP], [state.requests]);

  const counts = useMemo(() => {
    const c: Record<RequestStatus, number> = { BUILDING: 0, PLANNED: 0, 'UNDER REVIEW': 0, SHIPPED: 0 };
    for (const r of board) c[r.status] += 1;
    return c;
  }, [board]);

  const groups = useMemo(
    () =>
      STATUS_ORDER.filter(s => statusFilter === 'ALL' || s === statusFilter).map(status => ({
        status,
        items: board.filter(r => r.status === status),
      })),
    [board, statusFilter]
  );

  const filterOptions = useMemo(
    () => [
      { value: 'ALL' as StatusFilter, label: `All ${board.length}` },
      ...STATUS_ORDER.map(s => ({ value: s as StatusFilter, label: `${s} ${counts[s]}` })),
    ],
    [counts, board.length]
  );

  const backedCount = state.voted.length;

  return (
    <>
      {/* Composer */}
      <Panel title="Request something" subtitle="what should the desk build next?" className="w-full">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <TextInput
              value={title}
              onChange={setTitle}
              srLabel="Request title"
              placeholder="One-line summary, e.g. Alerts when a wall breaks"
              className="flex-grow min-w-[240px]"
            />
            <SegmentedControl ariaLabel="Request type" options={KIND_OPTIONS} value={kind} onChange={setKind} />
          </div>
          <TextArea
            value={detail}
            onChange={setDetail}
            srLabel="Request detail"
            placeholder="Optional detail. What problem does it solve for you?"
          />
          <div className="flex items-center gap-3 flex-wrap">
            <PrimaryButton icon={Send} onClick={submit} disabled={title.trim().length < 4}>
              Add request
            </PrimaryButton>
            <span className="font-mono text-label text-textMuted">
              Yours land under Being weighed, next to the published board.
            </span>
          </div>
        </div>
      </Panel>

      <div className="flex items-center gap-3 flex-wrap">
        <SegmentedControl
          ariaLabel="Filter by status"
          options={filterOptions}
          value={statusFilter}
          onChange={setStatusFilter}
        />
        <span className="ml-auto font-mono text-label text-textMuted uppercase tracking-widest tnum">
          {backedCount} backed
        </span>
      </div>

      {/* Board — grouped by status */}
      <div className="flex flex-col gap-6">
        {groups.map(group => {
          if (group.items.length === 0) return null;
          const tone = STATUS_TONE[group.status];
          return (
            <section key={group.status} className="flex flex-col gap-2.5">
              <div className="flex items-center gap-2.5">
                <span className={`w-2 h-2 rounded-full ${toneDot[tone]}`} />
                <h3 className="font-mono text-data font-semibold uppercase tracking-wider text-textPrimary">
                  {group.status}
                </h3>
                <span className="font-mono text-label tnum text-textMuted">{group.items.length}</span>
                <span className="font-mono text-label text-textSecondary normal-case tracking-normal hidden sm:inline">
                  · {STATUS_BLURB[group.status]}
                </span>
              </div>

              {/*
                One request per full-width row put 2065px between a request's
                badges and its "Back this" control at 2560 — `ml-auto` has
                nothing to push against but the whole monitor. Fluid columns cap
                the row near 34rem so the action stays beside what it acts on,
                and the group gets denser instead of wider.

                The card frame is gone with it; the status rail on the left is
                the part that carried meaning, so that is what is kept.
              */}
              <div
                className="grid gap-x-8 gap-y-2.5 items-start"
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 34rem), 1fr))' }}
              >
              {group.items.map(req => {
                const shipped = isShippedId(req.id);
                const backed = state.voted.includes(req.id);
                return (
                  <div
                    key={req.id}
                    className={`border-l-2 ${STATUS_RAIL[group.status]} pl-3 py-1 flex flex-col gap-1.5`}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-data font-semibold text-textPrimary">{req.title}</span>
                      <SignalBadge tone={STATUS_TONE[req.status]} dot>
                        {req.status}
                      </SignalBadge>
                      <SignalBadge tone="neutral">{req.kind}</SignalBadge>
                      {!shipped && <SignalBadge tone="select">Yours</SignalBadge>}
                      <span className="ml-auto flex items-center gap-1">
                        {shipped ? (
                          <RowAction
                            icon={backed ? Check : Plus}
                            label={backed ? 'Backed' : 'Back this'}
                            onClick={() => toggleBacked(req.id)}
                            labelAlways
                          />
                        ) : (
                          <>
                            <span className="font-mono text-micro text-textMuted tnum">{timeAgo(req.createdAt)}</span>
                            <RowAction icon={Trash2} label="Delete" danger onClick={() => removeRequest(req.id)} />
                          </>
                        )}
                      </span>
                    </div>
                    {req.detail && <p className="text-caption text-textSecondary leading-relaxed">{req.detail}</p>}
                  </div>
                );
              })}
              </div>
            </section>
          );
        })}

        {groups.every(g => g.items.length === 0) && (
          <Panel>
            <EmptyState icon={Hammer} title="Nothing in this view" body="Clear the status filter to see the whole board." />
          </Panel>
        )}
      </div>

      <p className="font-mono text-micro text-textMuted leading-relaxed">
        Backing an item marks it in this browser and in the record the Feedback tab exports. It is not a public
        tally, and the desk does not pretend it is one.
      </p>
    </>
  );
};

export default Requests;
