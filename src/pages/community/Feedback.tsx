import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Copy, Download, Mail, MessageSquare, Send, Trash2 } from 'lucide-react';
import Panel from '../../components/ui/Panel';
import SegmentedControl from '../../components/ui/SegmentedControl';
import EmptyState from '../../components/ui/EmptyState';
import { useToast } from '../../components/ui/Toast';
import { communityMarkdown, ROADMAP, timeAgo } from '../../data/community';
import type { FeedbackCategory, RequestStatus } from '../../types/community';
import { packMeta, shortBrowser, unpackMeta } from './localMeta';
import { useCommunity } from './store';
import { Field, PrimaryButton, RowAction, TextArea } from './controls';
import { copyText, downloadText, mailtoLink, CONTACT } from './share';

const CATEGORY_OPTIONS = [
  { value: 'BUG', label: 'Bug' },
  { value: 'UX', label: 'Usability' },
  { value: 'DATA', label: 'Data' },
  { value: 'OTHER', label: 'Other' },
] as const;

// Real environment values — no fabricated version string. Falls back to the
// build channel (MODE) when no explicit app version is injected at build time.
//
// The label has to follow the fallback. `VITE_APP_VERSION` is not injected in
// this build, so this resolves to `production` and the field was captioned "App
// version" — which reads as a version number and is a build channel. A bug
// report whose version field says "production" tells the reader nothing and
// looks like it told them something.
const RAW_VERSION = (import.meta.env as unknown as Record<string, string | undefined>).VITE_APP_VERSION;
const APP_VERSION = RAW_VERSION ?? import.meta.env.MODE;
const VERSION_LABEL = RAW_VERSION ? 'App version' : 'Build channel';
const USER_AGENT = typeof navigator !== 'undefined' ? navigator.userAgent : '';
const BROWSER = shortBrowser(USER_AGENT);

// Order for the captured-context read-out on saved notes.
const CAPTURE_FIELDS: { key: string; label: string }[] = [
  { key: 'route', label: 'Route' },
  { key: 'version', label: VERSION_LABEL },
  { key: 'browser', label: 'Browser' },
];

const STATUS_GLANCE: RequestStatus[] = ['BUILDING', 'PLANNED', 'UNDER REVIEW', 'SHIPPED'];

const ReadOnlyField = ({ label, value, title }: { label: string; value: string; title?: string }) => (
  <div className="flex flex-col gap-1 min-w-0">
    <span className="font-mono text-label uppercase tracking-wider text-textMuted">{label}</span>
    <div
      title={title}
      className="font-mono text-caption text-textSecondary bg-inputBg border border-borderSubtle rounded-md px-2.5 py-1.5 truncate"
    >
      {value}
    </div>
  </div>
);

const Tally = ({ label, value }: { label: string; value: number }) => (
  <div className="flex items-baseline justify-between gap-3 px-4 py-2 border-b border-borderSubtle/40 last:border-0">
    <span className="font-mono text-label uppercase tracking-wider text-textMuted">{label}</span>
    <span className="font-mono text-data text-textPrimary tnum">{value}</span>
  </div>
);

const Feedback = () => {
  const toast = useToast();
  const { state, addNote, removeNote, clearAll } = useCommunity();
  const [category, setCategory] = useState<FeedbackCategory>('UX');
  const [message, setMessage] = useState('');
  const [route, setRoute] = useState(() => (typeof window !== 'undefined' ? window.location.pathname : ''));
  const [justSaved, setJustSaved] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const record = useMemo(
    () => communityMarkdown(state, raw => unpackMeta(raw).text),
    [state]
  );

  const roadmapCounts = useMemo(() => {
    const all = [...state.requests, ...ROADMAP];
    return STATUS_GLANCE.map(status => ({ status, n: all.filter(r => r.status === status).length }));
  }, [state.requests]);

  const submit = () => {
    const body = message.trim();
    if (body.length < 10) return;
    // Diagnostic context is stored alongside the note in the existing message field.
    addNote({
      id: `fb-${Date.now()}`,
      category,
      message: packMeta(body, { route: route.trim(), version: APP_VERSION, browser: BROWSER }),
      createdAt: new Date().toISOString(),
    });
    setMessage('');
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2500);
  };

  const copyRecord = async () => {
    if (await copyText(record)) toast.success('Record copied as Markdown');
    else toast.error('Clipboard unavailable');
  };

  const saveRecord = () => {
    downloadText(`slayer-desk-record-${new Date().toISOString().slice(0, 10)}.md`, record);
    toast.success('Record saved');
  };

  const clearEverything = () => {
    clearAll();
    setConfirmClear(false);
    toast.info('Local community record cleared');
  };

  const total = state.ideas.length + state.requests.length + state.feedback.length;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
      {/* Note composer + your notes */}
      <div className="xl:col-span-7 flex flex-col gap-4 min-w-0">
        <Panel title="Note what to improve" subtitle="short and honest beats long and polite" className="w-full">
          <div className="flex flex-col gap-3">
            <SegmentedControl ariaLabel="Category" options={CATEGORY_OPTIONS} value={category} onChange={setCategory} />
            <TextArea
              value={message}
              onChange={setMessage}
              srLabel="Your note"
              placeholder="What slowed you down, confused you, or looked wrong?"
              rows={4}
            />

            {/* Auto-captured context saved with the note */}
            <div className="rounded-md border border-borderSubtle/70 bg-white/[0.02] p-3 flex flex-col gap-2.5">
              <span className="font-mono text-label uppercase tracking-wider text-textMuted">
                Captured with this note
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Field label="Route" value={route} onChange={setRoute} placeholder="/community/feedback" />
                <ReadOnlyField label={VERSION_LABEL} value={APP_VERSION} />
                <ReadOnlyField label="Browser" value={BROWSER} title={USER_AGENT} />
              </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <PrimaryButton icon={Send} onClick={submit} disabled={message.trim().length < 10}>
                Save note
              </PrimaryButton>
              {justSaved && (
                <span className="inline-flex items-center gap-1.5 font-mono text-label text-select animate-slide-in">
                  <Check className="w-3.5 h-3.5" aria-hidden="true" /> Saved to this browser
                </span>
              )}
            </div>
          </div>
        </Panel>

        <Panel title="Your notes" subtitle={`${state.feedback.length} saved on this device`} flush className="w-full">
          {state.feedback.length === 0 ? (
            <EmptyState
              icon={MessageSquare}
              title="No notes yet"
              body="Write one above. The route, build and browser are captured with it."
            />
          ) : (
            state.feedback.map(fb => {
              const { text, meta } = unpackMeta(fb.message);
              const captured = CAPTURE_FIELDS.filter(f => meta[f.key]);
              return (
                <div key={fb.id} className="px-4 py-2.5 border-b border-borderSubtle/40 last:border-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-label font-semibold uppercase tracking-widest text-textSecondary">
                      {fb.category}
                    </span>
                    <span className="ml-auto flex items-center gap-2">
                      <span className="font-mono text-micro text-textMuted tnum">{timeAgo(fb.createdAt)}</span>
                      <RowAction icon={Trash2} label="Delete note" danger onClick={() => removeNote(fb.id)} />
                    </span>
                  </div>
                  <p className="mt-1 text-caption text-textSecondary leading-relaxed">{text}</p>
                  {captured.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                      {captured.map(f => (
                        <span key={f.key} className="font-mono text-micro text-textMuted tnum">
                          <span className="uppercase tracking-wider">{f.label}</span> {meta[f.key]}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </Panel>
      </div>

      {/* What actually happens to any of this. The old right rail was a second
          copy of the roadmap; the roadmap has one home now, and this column
          answers the question that column was pretending to answer. */}
      <div className="xl:col-span-5 min-w-0 flex flex-col gap-4">
        <Panel title="Sending it on" subtitle="no outbox here, so take the record with you" className="w-full">
          <div className="flex flex-col gap-3">
            <p className="text-caption text-textSecondary leading-relaxed">
              Notes, theses and requests stay in this browser. Take the whole record with you and paste it
              wherever it should land.
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              {total > 0 && (
                <>
                  <PrimaryButton icon={Copy} onClick={() => void copyRecord()}>
                    Copy record
                  </PrimaryButton>
                  <RowAction icon={Download} label="Save as .md" onClick={saveRecord} labelAlways />
                </>
              )}
              <RowAction
                icon={Mail}
                label={`Email ${CONTACT}`}
                href={mailtoLink('Slayer Terminal feedback', 'Pasting my desk record below.\n\n')}
                labelAlways
              />
            </div>
            {total === 0 && (
              <span className="font-mono text-micro text-textMuted">
                Nothing written yet, so there is nothing to export.
              </span>
            )}
          </div>
        </Panel>

        <Panel title="Your record" subtitle="everything this browser is holding" flush className="w-full">
          <Tally label="Theses" value={state.ideas.length} />
          <Tally label="Requests" value={state.requests.length} />
          <Tally label="Notes" value={state.feedback.length} />
          <Tally label="Roadmap items backed" value={state.voted.length} />
          <div className="px-4 py-2.5 flex items-center gap-3 flex-wrap">
            {confirmClear ? (
              <>
                <RowAction icon={Trash2} label="Confirm, delete it all" danger onClick={clearEverything} labelAlways />
                <RowAction icon={Check} label="Keep it" onClick={() => setConfirmClear(false)} labelAlways />
              </>
            ) : (
              <RowAction
                icon={Trash2}
                label="Clear everything"
                danger
                onClick={() => setConfirmClear(true)}
                labelAlways
              />
            )}
          </div>
        </Panel>

        <Panel title="Roadmap at a glance" subtitle="one board, on the Roadmap tab" flush className="w-full">
          {roadmapCounts.map(r => (
            <Tally key={r.status} label={r.status} value={r.n} />
          ))}
          <div className="px-4 py-2.5">
            <Link
              to="/community/requests"
              className="font-mono text-micro uppercase tracking-wider text-select hover:text-textPrimary transition-colors -my-1 py-1 inline-flex min-h-6 items-center focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-select/60"
            >
              Open the roadmap
            </Link>
          </div>
        </Panel>
      </div>
    </div>
  );
};

export default Feedback;
