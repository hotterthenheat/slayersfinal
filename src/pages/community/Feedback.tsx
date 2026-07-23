import { useState } from 'react';
import { Check, Send } from 'lucide-react';
import Panel from '../../components/ui/Panel';
import SegmentedControl from '../../components/ui/SegmentedControl';
import { SHIPPED_FROM_FEEDBACK, loadCommunity, saveCommunity, timeAgo } from '../../data/community';
import type { FeedbackCategory, FeedbackEntry } from '../../types/community';
import { packMeta, shortBrowser, unpackMeta } from './localMeta';

const CATEGORY_OPTIONS = [
  { value: 'BUG', label: 'Bug' },
  { value: 'UX', label: 'Usability' },
  { value: 'DATA', label: 'Data' },
  { value: 'OTHER', label: 'Other' },
] as const;

// Real environment values — no fabricated version string. Falls back to the
// build channel (MODE) when no explicit app version is injected at build time.
const APP_VERSION =
  (import.meta.env as unknown as Record<string, string | undefined>).VITE_APP_VERSION ?? import.meta.env.MODE;
const USER_AGENT = typeof navigator !== 'undefined' ? navigator.userAgent : '';
const BROWSER = shortBrowser(USER_AGENT);

// Order for the captured-context read-out on saved notes.
const CAPTURE_FIELDS: { key: string; label: string }[] = [
  { key: 'route', label: 'Route' },
  { key: 'version', label: 'Version' },
  { key: 'browser', label: 'Browser' },
];

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

const Feedback = () => {
  const [state, setState] = useState(loadCommunity);
  const [category, setCategory] = useState<FeedbackCategory>('UX');
  const [message, setMessage] = useState('');
  const [route, setRoute] = useState(() =>
    typeof window !== 'undefined' ? window.location.pathname : ''
  );
  const [justSaved, setJustSaved] = useState(false);

  const submit = () => {
    const body = message.trim();
    if (body.length < 10) return;
    // Diagnostic context is stored alongside the note in the existing message field.
    const packed = packMeta(body, {
      route: route.trim(),
      version: APP_VERSION,
      browser: BROWSER,
    });
    const entry: FeedbackEntry = {
      id: `fb-${Date.now()}`,
      category,
      message: packed,
      createdAt: new Date().toISOString(),
    };
    const next = { ...state, feedback: [entry, ...state.feedback] };
    setState(next);
    saveCommunity(next);
    setMessage('');
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2500);
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
      {/* Form + your notes */}
      <div className="xl:col-span-7 flex flex-col gap-4 min-w-0">
        <Panel title="Note what to improve" subtitle="short and honest beats long and polite" className="w-full">
          <div className="flex flex-col gap-3">
            <SegmentedControl ariaLabel="Category" options={CATEGORY_OPTIONS} value={category} onChange={setCategory} />
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="What slowed you down, confused you, or looked wrong?"
              rows={4}
              className="w-full bg-inputBg border border-borderSubtle rounded-md px-2.5 py-2 text-caption text-textPrimary placeholder:text-textMuted focus:border-borderMuted outline-none transition-colors resize-y"
            />

            {/* Auto-captured context saved with the note */}
            <div className="rounded-md border border-borderSubtle/70 bg-white/[0.02] p-3 flex flex-col gap-2.5">
              <span className="font-mono text-label uppercase tracking-wider text-textMuted">
                Captured with this note
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="flex flex-col gap-1 min-w-0">
                  <span className="font-mono text-label uppercase tracking-wider text-textMuted">Route</span>
                  <input
                    value={route}
                    onChange={e => setRoute(e.target.value)}
                    placeholder="/community/feedback"
                    className="w-full bg-inputBg border border-borderSubtle rounded-md px-2.5 py-1.5 font-mono text-caption text-textPrimary placeholder:text-textMuted focus:border-borderMuted outline-none transition-colors"
                  />
                </label>
                <ReadOnlyField label="App version" value={APP_VERSION} />
                <ReadOnlyField label="Browser" value={BROWSER} title={USER_AGENT} />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={submit}
                disabled={message.trim().length < 10}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-select/40 bg-select/[0.06] hover:bg-select/[0.12] font-mono text-label font-semibold uppercase tracking-wider text-select transition-colors disabled:opacity-40 disabled:pointer-events-none"
              >
                <Send className="w-3.5 h-3.5" /> Save note
              </button>
              {justSaved && (
                <span className="inline-flex items-center gap-1.5 font-mono text-label text-bull animate-slide-in">
                  <Check className="w-3.5 h-3.5" /> Saved to this browser
                </span>
              )}
            </div>
          </div>
        </Panel>

        {state.feedback.length > 0 && (
          <Panel title="Your notes" subtitle="stored in this browser until accounts launch" flush className="w-full">
            {state.feedback.map(fb => {
              const { text, meta } = unpackMeta(fb.message);
              const captured = CAPTURE_FIELDS.filter(f => meta[f.key]);
              return (
                <div key={fb.id} className="px-4 py-2.5 border-b border-borderSubtle/40 last:border-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-label font-semibold uppercase tracking-widest text-textSecondary">
                      {fb.category}
                    </span>
                    <span className="ml-auto font-mono text-micro text-textMuted tnum">{timeAgo(fb.createdAt)}</span>
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
            })}
          </Panel>
        )}
      </div>

      {/* The loop, closed */}
      <div className="xl:col-span-5 min-w-0">
        <Panel title="Shipped from feedback" subtitle="changes already live on the desk" flush className="w-full">
          {SHIPPED_FROM_FEEDBACK.map(item => (
            <div key={item.title} className="flex items-start gap-2.5 px-4 py-3 border-b border-borderSubtle/40 last:border-0">
              <Check className="w-3.5 h-3.5 text-bull shrink-0 mt-0.5" />
              <div className="min-w-0">
                <span className="block text-caption font-semibold text-textPrimary">{item.title}</span>
                <span className="block text-label text-textSecondary leading-snug">{item.note}</span>
              </div>
            </div>
          ))}
        </Panel>
      </div>
    </div>
  );
};

export default Feedback;
