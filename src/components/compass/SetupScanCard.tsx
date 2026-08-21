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
  // Direction is the ink, not a pill. A tinted rounded background on the
  // contract was the last small box on the row; green and red type says the
  // same thing and says it in the same place every other terminal does.
  const pillTone = isCall ? 'text-bull' : 'text-bear';
  const exp = expiryRead(setup.expiry);
  // How deep the terminal actually goes on this NAME, as opposed to how the
  // contract graded. The field mixes names the simulator models with names it
  // only prices, and clicking a shallow one leaves every other desk with nothing
  // to say; the card is where that is worth knowing, before the click.
  const coverage = scanCoverage(setup.ticker);

  return (
    /*
      Three elements, because one could not carry all three jobs.

      The card is a `listitem`: it is one entry in a list of contracts, and a
      listitem's children stay exposed, which is what lets the Analysis button
      inside keep its own name and its own focus stop.

      The preview target inside it is a `button`. It was the listitem itself for
      one commit, and that announced a focusable card as an ordinary list entry
      — Enter and Space did something the screen reader never said was there,
      and `aria-current` reported the state after selection without ever
      offering the action. It cannot be an `option` in a `listbox`: measured
      against axe, a listbox may own options and groups and nothing else, and an
      option's children are presentational, so the Analysis button would lose
      its name either way.

      The click handler sits on the wrapper so the footer line is live to a
      mouse too; it reaches the same handler by bubbling, and Analysis stops
      propagation.
    */
    <div
      role="listitem"
      onClick={onSelect}
      /* Selection is one signal, not three. This used to carry a 2px near-white
         inset rail on top of the border and the wash, and it fired on mount, so
         a card nobody had clicked wore the brightest marker on the screen. */
      /* A ruled row, not a card — see LottoBoard for the same change. Selection
         is the left rail plus a wash rather than a brighter frame. */
      className={`flex flex-col gap-2.5 px-3 py-2.5 transition-colors ${
        selected ? 'inst-selected' : 'hover:bg-rowHover'
      }`}
    >
      <div
        {...interactiveRowProps(onSelect, selected, 'button')}
        aria-label={`Preview ${setup.contract}, rank ${rank}, ${COVERAGE_META[coverage].label.toLowerCase()} coverage`}
        className={`${ROW_INTERACTIVE} flex flex-col gap-2.5 rounded-sm`}
      >
      {/* Identity */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-mono text-micro text-textMuted tnum">#{rank}</span>
        <span className={`font-mono text-data font-semibold tnum ${pillTone}`}>{setup.contract}</span>
        <span title={exp.sentence} className="font-mono text-micro uppercase tracking-wider text-textMuted tnum">
          {exp.chip}
        </span>
        <span title={COVERAGE_META[coverage].note}>
          <SignalBadge tone={COVERAGE_TONE[coverage]}>{COVERAGE_META[coverage].label}</SignalBadge>
        </span>
      </div>

      {/*
        The standing gets its own row rather than riding the end of the identity
        line. It used to sit there under `ml-auto`, so whether it wrapped
        depended on how many characters the contract happened to have: BLK 859P
        + ARMED fitted on one line, BKNG 3929C + TRIGGERED did not. Two cards
        side by side in the same grid row then started their metrics a line
        apart, and Score / Health / Move / Mid stopped lining up across the
        board — on the one screen whose whole job is comparing setups.

        A fixed row is also the right read: ARMED and TRIGGERED are the card's
        verdict, not another identity chip.
      */}
      <div className="flex items-center gap-2">
        {rank === 1 && <SignalBadge tone="magenta">Top pick</SignalBadge>}
        <span className="ml-auto">
          <StateBadge state={setupState(setup)} />
        </span>
      </div>

      {/* Three, not four. Confidence was never among them — the engine derives
          it linearly from the score, so a Conf column is the Score column
          wearing a percent sign — and Score itself is gone now for the reason
          the Weigher's grade went: a 0-100 figure with nothing measured behind
          its weights. The verdict already leads the card.

          Health stays. Unlike the score it is not a blend: `healthFor` is a
          function of moneyness alone, and the panel states what it means — 50 is
          at the money, higher is deeper in. One measured relationship with a
          stated meaning is a different object from a weighted guess. */}
      <div className="grid grid-cols-3 gap-2">
        {[
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
          and the direction is already in the contract's own ink above it.

          Middot-separated, because the pill borders that used to bound these
          are gone and four uppercase labels in a row read as one string
          without them. */}
      {setup.whyChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          {setup.whyChips.map((chip, i) => (
            <span key={chip} className="inline-flex items-center gap-1.5">
              {/* Full-strength muted, not /50: at half opacity this separator
                  measured 2.03:1, under the 3:1 floor. */}
              {i > 0 && (
                <span aria-hidden className="text-textMuted">
                  ·
                </span>
              )}
              <SignalBadge tone="neutral">{chip}</SignalBadge>
            </span>
          ))}
        </div>
      )}
      </div>

      {/* Outside the preview button, because it holds one of its own. */}
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
