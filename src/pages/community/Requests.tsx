import { useMemo, useState } from 'react';
import { ChevronUp, Send } from 'lucide-react';
import Panel from '../../components/ui/Panel';
import DataState from '../../components/ui/DataState';
import SegmentedControl from '../../components/ui/SegmentedControl';
import SignalBadge from '../../components/ui/SignalBadge';
import type { Tone } from '../../components/ui/tones';
import ReportControl, { HiddenShelf } from '../../components/community/ReportControl';
import { loadCommunity, saveCommunity, timeAgo } from '../../data/community';
import {
  REPORT_REASONS,
  fileReport,
  hiddenIds,
  isLocallyAuthored,
  withdrawReport,
  type ReportReason,
} from '../../data/moderation';
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

const STATUS_ORDER: RequestStatus[] = ['BUILDING', 'PLANNED', 'UNDER REVIEW', 'SHIPPED'];

const Requests = () => {
  const [state, setState] = useState(loadCommunity);
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [kind, setKind] = useState<RequestKind>('FEATURE');

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

  const hidden = useMemo(() => hiddenIds(state.reports, 'request'), [state.reports]);

  const report = (req: FeatureRequest) => (reason: ReportReason, detail: string, excerpt: string) =>
    update({
      ...state,
      reports: fileReport(state.reports, {
        targetId: req.id,
        targetKind: 'request',
        reason,
        detail,
        excerpt,
      }),
    });

  const unhide = (id: string) => update({ ...state, reports: withdrawReport(state.reports, id, 'request') });

  const remove = (id: string) =>
    update({
      ...state,
      requests: state.requests.filter(r => r.id !== id),
      voted: state.voted.filter(v => v !== id),
    });

  // Building first, then planned, then under review — shipped last; votes break ties
  const shown = useMemo(
    () =>
      state.requests
        .filter(r => !hidden.has(r.id))
        .sort((a, b) => {
          const s = STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
          return s !== 0 ? s : b.votes - a.votes;
        }),
    [state.requests, hidden]
  );

  const hiddenRows = useMemo(
    () =>
      state.reports
        .filter(r => r.targetKind === 'request')
        .map(r => ({ report: r, req: state.requests.find(q => q.id === r.targetId) }))
        .filter((x): x is { report: typeof x.report; req: FeatureRequest } => x.req !== undefined),
    [state.reports, state.requests]
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
              <Send className="w-3.5 h-3.5" /> Submit request
            </button>
            <span className="font-mono text-[10px] text-textMuted">
              Vote for anything below — the most-wanted items get built first
            </span>
          </div>
        </div>
      </Panel>

      {/* Board */}
      <div className="flex flex-col gap-3">
        {/* 12 — AN EMPTY BOARD SAYS WHICH KIND OF EMPTY IT IS.

            This board has no filter, so there are exactly two ways to reach
            zero rows and they are opposite facts. Nothing has been asked
            for — which invites the reader to be first, the whole point of a
            request board on its opening day. Or everything on it is behind
            their own reports, which is the one blank page that looks like a
            bug and is not; that one points at the shelf below rather than
            at the composer above. */}
        {shown.length === 0 && (
          <DataState
            kind="empty"
            title={state.requests.length === 0 ? 'Nothing requested yet' : 'You hid everything here'}
            body={
              state.requests.length === 0
                ? 'No one has asked for anything yet. The form above is how the roadmap starts.'
                : 'Every request on the board is behind your own reports. Open “Hidden by you” to put one back.'
            }
          />
        )}
        {shown.map(req => {
          const voted = state.voted.includes(req.id);
          return (
            <div key={req.id} className="border border-borderSubtle bg-panel rounded-md px-4 py-3 flex gap-4">
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
                  <SignalBadge tone={STATUS_TONE[req.status]}>{req.status}</SignalBadge>
                  <SignalBadge tone="neutral">{req.kind}</SignalBadge>
                  <span className="ml-auto flex items-center gap-1.5 font-mono text-[10px] text-textMuted tnum">
                    {req.author === 'you' ? <span className="text-select">you</span> : req.author} · {timeAgo(req.createdAt)}
                    <ReportControl
                      targetKind="request"
                      targetId={req.id}
                      body={req.detail || req.title}
                      mine={isLocallyAuthored(req.id)}
                      onFile={report(req)}
                      onDelete={() => remove(req.id)}
                    />
                  </span>
                </div>
                {req.detail && <p className="mt-1.5 text-[12px] text-textSecondary leading-relaxed">{req.detail}</p>}
              </div>
            </div>
          );
        })}

        <HiddenShelf count={hiddenRows.length}>
          {hiddenRows.map(({ report: r, req }) => (
            <div key={r.id} className="flex items-start gap-3 border-l border-borderSubtle pl-3">
              <div className="min-w-0 flex-grow">
                <div className="font-mono text-[10px] text-textMuted">
                  {req.author} · reported as{' '}
                  <span className="text-textSecondary">{REPORT_REASONS[r.reason].label.toLowerCase()}</span>
                </div>
                <p className="text-[11px] text-textMuted leading-snug truncate">{r.excerpt}</p>
              </div>
              <button
                onClick={() => unhide(req.id)}
                className="shrink-0 px-2 py-1 rounded border border-borderSubtle hover:bg-white/[0.03] font-mono text-[10px] uppercase tracking-wider text-textSecondary transition-colors"
              >
                Put back
              </button>
            </div>
          ))}
        </HiddenShelf>
      </div>
    </>
  );
};

export default Requests;
