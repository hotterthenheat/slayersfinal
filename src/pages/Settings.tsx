/*
==================================================
  SLAYER TERMINAL - SETTINGS (pages/Settings.tsx)
  Part 15 · "carry (r/q override), distance units,
  theme, motion, number format, data-source
  preferences."
==================================================

  SIX THINGS WERE ASKED FOR AND FIVE OF THEM ARE SETTINGS. The sixth —
  theme — is not, and the page says so plainly rather than showing a
  disabled toggle beside five working ones.

  WHY NO THEME SWITCH. The desk has exactly one palette, and not by
  omission: there are zero `dark:` variants anywhere in the source and the
  token set has no light values to swap to. Shipping a control that toggles
  between one option is a control that teaches a reader the page is broken.
  A light theme is a real piece of work — every chart ink, every heat
  scale, every tone in tones.ts — and it is not made closer by putting a
  switch here first.

  WHY THE DATA SOURCES ARE A LIST AND NOT A PICKER. "Data-source
  preferences" implies a choice between sources; there is one source per
  data class and some classes have none. What a reader can be given is
  which surfaces are live, which are waiting, and on what — see
  data/feeds.ts.

  EVERY CONTROL HERE IS THE SAME CONTROL THE DESK ALREADY USES. The carry
  editor and the distance picker are mounted, not reimplemented, so this
  page cannot fall out of step with the ones beside the numbers.
*/

import { Check } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Panel from '../components/ui/Panel';
import CarryEditor from '../components/ui/CarryEditor';
import DistanceUnitPicker from '../components/ui/DistanceUnitPicker';
import SignalBadge from '../components/ui/SignalBadge';
import type { Tone } from '../components/ui/tones';
import { GLOBAL_SHORTCUTS } from '../components/layout/ShortcutsSheet';
import {
  MOTION_WORDS,
  NUMBER_FORMAT_WORDS,
  motionAllowed,
  osPrefersReducedMotion,
  setPref,
  usePrefs,
  type MotionPref,
  type NumberFormat,
} from '../data/prefs';
import { FEED_STATE_WORDS, FEED_SEAMS, seamSummary, type FeedState } from '../data/feeds';
import { dismissFirstRun, resetFirstRun, useFirstRunSeen } from '../data/firstRun';
import { Link } from 'react-router-dom';

const STATE_TONE: Record<FeedState, Tone> = {
  live: 'bull',
  'not-on-plan': 'warn',
  'no-endpoint': 'neutral',
};

/** One radio-ish choice row — the house shape for a picked option. */
const Choice = ({
  on,
  label,
  note,
  right,
  onPick,
}: {
  on: boolean;
  label: string;
  note: string;
  right?: string;
  onPick: () => void;
}) => (
  <button
    onClick={onPick}
    aria-pressed={on}
    className={`w-full text-left flex items-start gap-3 rounded-md border px-3 py-2.5 transition-colors ${
      on ? 'border-select/50 bg-select/[0.06]' : 'border-borderSubtle hover:bg-white/[0.03]'
    }`}
  >
    <span
      className={`mt-[3px] w-3.5 h-3.5 rounded-full border shrink-0 flex items-center justify-center ${
        on ? 'border-select text-select' : 'border-borderMuted text-transparent'
      }`}
      aria-hidden
    >
      <Check size={10} strokeWidth={3} />
    </span>
    <span className="min-w-0 flex-1">
      <span className={`block text-[12px] font-semibold ${on ? 'text-textPrimary' : 'text-textSecondary'}`}>
        {label}
      </span>
      <span className="block mt-0.5 text-[11px] text-textMuted leading-snug">{note}</span>
    </span>
    {right && <span className="shrink-0 font-mono text-[12px] tnum text-textSecondary">{right}</span>}
  </button>
);

const Settings = () => {
  const prefs = usePrefs();
  const osReduced = osPrefersReducedMotion();
  const firstRunDone = useFirstRunSeen();

  return (
    <>
      <PageHeader
        breadcrumb={['Desk', 'Settings']}
        title="Settings"
        subtitle="What the numbers are priced against, how they are printed, and what this account can see"
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {/* ---- carry ---------------------------------------------------- */}
        <Panel
          title="Carry"
          subtitle="the rate and yield every greek is priced against"
          className="w-full"
        >
          <CarryEditor />
        </Panel>

        {/* ---- distances ------------------------------------------------ */}
        <Panel title="Distances" subtitle="one unit, desk-wide" className="w-full">
          <div className="flex flex-col gap-3">
            <DistanceUnitPicker dense />
            <p className="text-[11px] text-textMuted leading-relaxed">
              Every surface that prints a distance — the flip strip, the measure box, the ladder — reads this one
              choice, so the desk cannot show a wall 0.4 ATR away on one line and $14 away on the next.
            </p>
          </div>
        </Panel>

        {/* ---- numbers -------------------------------------------------- */}
        <Panel title="Number format" subtitle="how money is printed" className="w-full">
          <div className="flex flex-col gap-2">
            {(Object.keys(NUMBER_FORMAT_WORDS) as NumberFormat[]).map(k => (
              <Choice
                key={k}
                on={prefs.numbers === k}
                label={NUMBER_FORMAT_WORDS[k].label}
                note={NUMBER_FORMAT_WORDS[k].note}
                right={NUMBER_FORMAT_WORDS[k].sample}
                onPick={() => setPref('numbers', k)}
              />
            ))}
            <p className="mt-1 text-[11px] text-textMuted leading-relaxed">
              This reaches every dollar figure on the desk, because they all go through one formatter. Decimal marks
              and digit grouping are deliberately not offered — that would have to reach every number on every page to
              be true, and a setting that changes some columns and not others is worse than none.
            </p>
          </div>
        </Panel>

        {/* ---- motion --------------------------------------------------- */}
        <Panel title="Motion" subtitle="transitions, number rolls, the code rain" className="w-full">
          <div className="flex flex-col gap-2">
            {(Object.keys(MOTION_WORDS) as MotionPref[]).map(k => (
              <Choice
                key={k}
                on={prefs.motion === k}
                label={MOTION_WORDS[k].label}
                note={MOTION_WORDS[k].note}
                onPick={() => setPref('motion', k)}
              />
            ))}
            {/* The asymmetry, said out loud where it can be acted on. */}
            <p className="mt-1 text-[11px] text-textMuted leading-relaxed">
              {osReduced ? (
                <>
                  Your system has asked for reduced motion, so animation is off and{' '}
                  <span className="text-textSecondary">this page cannot turn it back on</span>. Someone who sets that
                  at the system level may have done so because animation makes them ill; a site that lets a stray
                  click override it is doing harm.
                </>
              ) : (
                <>
                  Your system has not asked for reduced motion. This setting can only ever ask for less than the
                  system does, never more — motion is currently{' '}
                  <span className="text-textSecondary">{motionAllowed(prefs.motion, osReduced) ? 'on' : 'off'}</span>.
                </>
              )}
            </p>
          </div>
        </Panel>

        {/* ---- theme, which is not a setting ---------------------------- */}
        <Panel title="Theme" subtitle="one palette, on purpose" className="w-full">
          <p className="text-[12px] text-textSecondary leading-relaxed">
            There is no theme switch, and it is missing rather than disabled because a control with one option teaches
            a reader the page is broken. The desk has a single palette: no light values in the token set and no{' '}
            <code className="font-mono text-[11px] text-textMuted">dark:</code> variants anywhere in the source. A
            light theme means re-picking every chart ink, every heat scale and every tone — real work, and no closer
            to being done for having a switch here first.
          </p>
        </Panel>

        {/* ---- the welcome panel, brought back ---------------------------- */}
        <Panel title="Getting started" subtitle="the panel on the Pulse desk" className="w-full">
          <div className="flex flex-col gap-3">
            <p className="text-[12px] text-textSecondary leading-relaxed">
              {firstRunDone
                ? 'You have dismissed the welcome panel. It stays gone until you ask for it back — a panel that returns on its own is a bug, not a reminder.'
                : 'The welcome panel is showing on Pulse. Closing it there hides it for good, and this is where it comes back from.'}
            </p>
            <div>
              <button
                onClick={firstRunDone ? resetFirstRun : dismissFirstRun}
                className="px-3 py-1.5 rounded-md border border-borderSubtle hover:bg-white/[0.03] font-mono text-[11px] uppercase tracking-wider text-textSecondary transition-colors"
              >
                {firstRunDone ? 'Show it again' : 'Hide it now'}
              </button>
            </div>
          </div>
        </Panel>

        {/* ---- shortcuts pointer ---------------------------------------- */}
        <Panel title="Keyboard" subtitle={`${GLOBAL_SHORTCUTS.length} global bindings`} className="w-full">
          <div className="flex flex-col gap-2">
            {GLOBAL_SHORTCUTS.map(s => (
              <div key={s.keys.join('+')} className="flex items-center gap-3">
                <span className="flex items-center gap-1 shrink-0">
                  {s.keys.map(k => (
                    <kbd
                      key={k}
                      className="font-mono text-[10px] border border-borderSubtle rounded px-1.5 py-0.5 text-textSecondary bg-inset"
                    >
                      {k}
                    </kbd>
                  ))}
                </span>
                <span className="text-[12px] text-textSecondary leading-snug">{s.what}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* ---- the data seams ---------------------------------------------- */}
      <Panel
        title="Data sources"
        subtitle={seamSummary()}
        className="w-full"
        actions={
          <span className="font-mono text-[10px] uppercase tracking-widest text-textMuted">
            what is on, what is waiting
          </span>
        }
      >
        <div className="flex flex-col gap-2">
          <p className="text-[12px] text-textSecondary leading-relaxed max-w-[80ch]">
            There is no source to pick between — a data class is either on this account or it is not. What follows is
            which surfaces are live, which are waiting, and on what. Each entry names the seam it will plug into, so
            &ldquo;nothing else changes when the feed lands&rdquo; is a claim you can go and check.
          </p>
          <div className="mt-2 flex flex-col gap-2">
            {FEED_SEAMS.map(s => (
              <div key={s.surface} className="border border-borderSubtle rounded-md px-3 py-2.5">
                <div className="flex items-start gap-2 flex-wrap">
                  <span className="text-[12px] font-semibold text-textPrimary">
                    {s.path ? (
                      <Link to={s.path} className="hover:text-select transition-colors">
                        {s.surface}
                      </Link>
                    ) : (
                      s.surface
                    )}
                  </span>
                  <SignalBadge tone={STATE_TONE[s.state]}>{FEED_STATE_WORDS[s.state].label}</SignalBadge>
                  <span className="ml-auto font-mono text-[10px] text-textMuted">{s.needs}</span>
                </div>
                <p className="mt-1 text-[11px] text-textSecondary leading-snug">{s.shows}</p>
                <p className="mt-1 font-mono text-[10px] text-textMuted leading-snug break-words">{s.seam}</p>
              </div>
            ))}
          </div>
        </div>
      </Panel>
    </>
  );
};

export default Settings;
