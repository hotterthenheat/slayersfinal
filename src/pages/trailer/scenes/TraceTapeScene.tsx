/*
  Scene 2 — Trace, live tape.

  Prints arrive on the rhythm the story gives them, not on a metronome: one large
  print, several smaller ones, and unrelated flow in between. Every row carries
  the fill position inside the quote and the age of the quote it was classified
  against, because a directional read is only worth what its quote was.
*/

import React from 'react';
import { useTrailer, at, clamp01, ease } from '../useTrailerState';
import { ArrivalList, Beat, Caveat, HeadRow, SceneHead, SceneStatement, Verdict } from '../parts';
import { prob, usd } from '../format';
import type { OptionPrint } from '../trailerTypes';

const GRID = '48px 1fr 62px 54px 56px 62px 60px';
const GRID_SM = '44px 1fr 56px 58px';

/** Where in the bid/ask the trade printed — the single most-read cell here. */
const FillMark: React.FC<{ fill: number }> = ({ fill }) => (
  <span className="relative inline-block w-full h-[10px] align-middle" title={`Filled at ${Math.round(fill * 100)}% of the quote`}>
    <span className="absolute inset-x-0 top-1/2 h-px bg-white/20" />
    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-px h-[8px] bg-white/30" />
    <span className="absolute right-0 top-1/2 -translate-y-1/2 w-px h-[8px] bg-white/30" />
    <span
      className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-[5px] h-[5px] rounded-full ${
        fill > 0.7 ? 'bg-bull' : fill < 0.3 ? 'bg-bear' : 'bg-textMuted'
      }`}
      style={{ left: `${clamp01(fill) * 100}%` }}
    />
  </span>
);

const Row: React.FC<{ print: OptionPrint; compact: boolean }> = ({ print, compact }) => {
  const hero = print.size > 900;
  return (
    <div
      className={`grid gap-2 items-center py-1 border-b border-borderSubtle/50 font-mono text-micro sm:text-label tnum ${
        print.child ? 'text-textPrimary' : 'text-textSecondary'
      } ${hero ? 'inst-selected pl-1.5 -ml-1.5' : ''}`}
      style={{ gridTemplateColumns: compact ? GRID_SM : GRID }}
    >
      <span className="text-textMuted">{print.at.toFixed(1)}s</span>
      <span className="truncate">
        {print.strike}
        {print.right} {print.expiry}
        <span className="ml-1.5 text-textMuted">{print.dte}D</span>
      </span>
      <span className={print.lean === 'CALL-SIDE' ? 'text-bull' : 'text-bear'}>{print.size.toLocaleString()}</span>
      {!compact && <FillMark fill={print.fill} />}
      <span>{usd(print.premium)}</span>
      {!compact && <span className="text-textMuted">{print.oi.toLocaleString()}</span>}
      {!compact && (
        <span className={print.quoteAgeMs > 800 ? 'text-warn' : 'text-textMuted'}>{print.quoteAgeMs}ms</span>
      )}
    </div>
  );
};

const TraceTapeScene: React.FC = () => {
  const { story, progress: p, reduced, compact } = useTrailer();

  // Arrival thresholds from the story's own print times, mapped into the scene.
  const span = story.prints[story.prints.length - 1].at || 1;
  const arrivals = story.prints.map(pr => 0.08 + (pr.at / span) * 0.62);
  const shown = story.prints.filter((_, i) => p >= arrivals[i]);
  const childCount = shown.filter(s => s.child).length;
  const evidence = ease(at(p, 0.1, 0.86)) * clamp01(childCount / 4);

  return (
    <div className="h-full flex flex-col gap-3 min-h-0">
      <SceneHead
        product="Trace · Live Tape"
        line="Not what traded. What the sequence may mean."
        p={p}
        reduced={reduced}
      />

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_240px] gap-3">
        <div className="inst-surface rounded-md p-3 flex flex-col min-h-0 overflow-hidden">
          <HeadRow
            cols={compact ? ['T', 'CONTRACT', 'SIZE', 'PREM'] : ['T', 'CONTRACT', 'SIZE', 'FILL', 'PREM', 'OI', 'QUOTE']}
            grid={compact ? GRID_SM : GRID}
          />
          <ArrivalList p={p} arrivals={arrivals} reduced={reduced} className="mt-1 min-h-0">
            {story.prints.map(pr => (
              <Row key={pr.id} print={pr} compact={compact} />
            ))}
          </ArrivalList>
        </div>

        <div className="flex flex-col gap-2">
          <Beat p={p} from={0.3} reduced={reduced}>
            <div className="inst-surface rounded-md p-2.5">
              <div className="font-mono text-micro uppercase tracking-widest text-textMuted mb-1.5">Building evidence</div>
              <div className="space-y-1.5 font-mono text-micro">
                <div className="flex items-baseline justify-between">
                  <span className="text-textSecondary">Same strike, same expiry</span>
                  <span className="tnum text-textPrimary">{childCount}</span>
                </div>
                <div className="h-[3px] rounded-full bg-white/[0.06] overflow-hidden">
                  <div className="h-full bg-select" style={{ width: `${evidence * 100}%` }} />
                </div>
                <div className="pt-1 space-y-1">
                  <div className="text-textSecondary">Aggressive call-side sequence detected</div>
                  <div className="text-textSecondary">
                    Parent-order likelihood <span className="tnum text-textPrimary">rising</span>
                  </div>
                  <div className="text-textSecondary">
                    Opening classification <span className="text-warn">unresolved</span>
                  </div>
                </div>
              </div>
            </div>
          </Beat>

          <Beat p={p} from={0.46} reduced={reduced}>
            <div className="inst-surface rounded-md p-2.5">
              <div className="font-mono text-micro uppercase tracking-widest text-textMuted mb-1.5">
                Directional read
              </div>
              <div className="flex items-center gap-2">
                <Verdict>UNCONFIRMED</Verdict>
                <span className="font-mono text-label text-textPrimary">CALL-SIDE</span>
                <span className="font-mono text-micro tnum text-textMuted ml-auto">
                  {prob(story.prints.filter(x => x.child)[0].leanConf)} conf
                </span>
              </div>
              <p className="mt-1.5 font-mono text-micro text-textMuted leading-relaxed">
                Fill position and urgency lean call-side. Whether it opens or closes a position is not visible on the
                tape.
              </p>
            </div>
          </Beat>
        </div>
      </div>

      <div className="space-y-1">
        <SceneStatement p={p} from={0.6} reduced={reduced}>
          An aggressive block, then more at the same strike among unrelated flow — the tape is accumulating evidence, not
          confirming a buyer.
        </SceneStatement>
        <Caveat>
          Modelled prints · fill position is measured against the quote at print time · no counterparty identity is
          claimed
        </Caveat>
      </div>
    </div>
  );
};

export default TraceTapeScene;
