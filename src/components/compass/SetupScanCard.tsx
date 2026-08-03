import { AlertTriangle, ArrowUpRight } from 'lucide-react';
import SignalBadge from '../ui/SignalBadge';
import { preserveGreek } from '../ui/greek';
import { interactiveRowProps, ROW_INTERACTIVE } from '../ui/interactiveRow';
import { StateBadge } from './StateBadge';
import { setupState } from './setupState';
import { expiryRead } from './setupHorizon';
import { COVERAGE_META, scanCoverage, type ScanCoverage } from '../../core/scanUniverse';
import type { Tone } from '../ui/tones';
import type { Setup } from '../../types/compass';

/**
 * Tone for a coverage tier. The rule and the copy live in core/scanUniverse
 * (COVERAGE_META); the tone belongs here, because src/core never imports
 * src/components. Same split as STATE_META and StateBadge.
 *
 * Silver, grey, amber — the chrome ladder. Depth of coverage is a fact about
 * what the terminal can SHOW, never about which way the market went, so it may
 * not borrow bull/bear green and red. And the deepest tier is MODELED rather
 * than anything resembling "live": the field is a simulator and nothing on this
 * card is allowed to suggest otherwise.
 */
const COVERAGE_TONE: Record<ScanCoverage, Tone> = {
  modeled: 'select',
  covered: 'neutral',
  listing: 'warn',
};

interface SetupScanCardProps {
  setup: Setup;
  /** Global rank across the whole scan, not a rank within one ticker. */
  rank: number;
  selected: boolean;
  onSelect: () => void;
  onStudy: () => void;
}

/**
 * One contract in the scan layer.
 *
 * Scanning, comparing and studying are three jobs and this card only does the
 * first: who the contract is, when it dies, where it ranks, and the one price
 * that kills the thesis. Everything it used to unfold — targets, greeks, the
 * why-prose, bid/ask — belongs to the compare pane beside it or to full
 * analysis, so the row is no longer a worse copy of the card next to it.
 */
const SetupScanCard = ({ setup, rank, selected, onSelect, onStudy }: SetupScanCardProps) => {
  const isCall = setup.right === 'C';
  // Direction is the market's own language, so it stays green/red. It rides the
  // contract pill only; nothing else on the card borrows it.
  const pillTone = isCall ? 'border-bull/50 bg-bull/20' : 'border-bear/50 bg-bear/20';
  const exp = expiryRead(setup.expiry);
  // How deep the terminal actually goes on this NAME, as opposed to how the
  // contract graded. The field mixes names the simulator models with names it
  // only prices, and clicking a shallow one leaves every other desk with nothing
  // to say; the card is where that is worth knowing, before the click.
  const coverage = scanCoverage(setup.ticker);

  return (
    <div
      {...interactiveRowProps(onSelect, selected, 'listitem')}
      onClick={onSelect}
      /* listitem, not button. The card carries its own Analysis button, and a
         button's children are presentational — nesting one inside another
         swallows its name and its focus stop, which is what axe reports as
         `nested-interactive`. A listitem keeps both, and the card genuinely is
         one entry in a list of contracts. */
      aria-label={`Preview ${setup.contract}, rank ${rank}, ${COVERAGE_META[coverage].label.toLowerCase()} coverage`}
      /* Selection is one signal, not three. This used to carry a 2px near-white
         inset rail on top of the border and the wash, and it fired on mount, so
         a card nobody had clicked wore the brightest marker on the screen. */
      className={`${ROW_INTERACTIVE} flex flex-col gap-2.5 rounded-md border px-3 py-2.5 transition-colors ${
        selected
          ? 'border-select/40 bg-select/[0.04]'
          : 'border-borderSubtle bg-panel hover:border-borderMuted hover:bg-rowHover'
      }`}
    >
      {/* Identity */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-mono text-micro text-textMuted tnum">#{rank}</span>
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-label font-semibold ${pillTone}`}>
          <span className="text-textPrimary">{setup.contract}</span>
        </span>
        <span
          title={exp.sentence}
          className="inline-flex items-center rounded border border-borderSubtle bg-inset px-1.5 py-0.5 font-mono text-micro uppercase tracking-wider text-textSecondary tnum"
        >
          {exp.chip}
        </span>
        <span title={COVERAGE_META[coverage].note}>
          <SignalBadge tone={COVERAGE_TONE[coverage]}>{COVERAGE_META[coverage].label}</SignalBadge>
        </span>
        {rank === 1 && <SignalBadge tone="magenta">Top pick</SignalBadge>}
        <span className="ml-auto">
          <StateBadge state={setupState(setup)} />
        </span>
      </div>

      {/* The four a scan is read on. Confidence is not among them: the engine
          derives it linearly from the score, so a Conf column is the Score
          column wearing a percent sign. Health is the independent read. */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { k: 'Score', v: String(setup.score) },
          { k: 'Health', v: `${setup.health}/100` },
          { k: preserveGreek('1σ Move'), v: `±${setup.expectedMovePct}%` },
          { k: 'Mid', v: `$${setup.mid.toFixed(2)}` },
        ].map((m, i) => (
          <div key={i} className="min-w-0">
            <div className="font-mono text-micro uppercase tracking-widest text-textMuted truncate">{m.k}</div>
            <div className="font-mono text-caption font-semibold text-textPrimary tnum leading-4">{m.v}</div>
          </div>
        ))}
      </div>

      {/* Evidence. Neutral, not directional: a chip says what the engine saw,
          and the direction is already on the pill above it. */}
      {setup.whyChips.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {setup.whyChips.map(chip => (
            <SignalBadge key={chip} tone="neutral">
              {chip}
            </SignalBadge>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 border-t border-borderSubtle pt-2">
        <span
          title={setup.invalidationReason}
          className="inline-flex items-center gap-1.5 font-mono text-label text-warn tnum min-w-0 truncate"
        >
          <AlertTriangle className="w-3 h-3 shrink-0" />
          Breaks {isCall ? 'below' : 'above'} ${setup.invalidationPrice.toFixed(2)}
        </span>
        <button
          onClick={e => {
            e.stopPropagation();
            onStudy();
          }}
          aria-label={`Open full analysis for ${setup.contract}`}
          className="ml-auto inline-flex items-center gap-1 rounded-md border border-borderSubtle px-2.5 py-1.5 font-mono text-label font-semibold uppercase tracking-wider text-textSecondary hover:text-textPrimary hover:border-borderMuted transition-colors"
        >
          Analysis <ArrowUpRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
};

export default SetupScanCard;
