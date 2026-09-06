import { useMemo, useState } from 'react';
import { useMarketData } from '../../context/MarketDataContext';
import {
  FLOW_WINDOWS,
  SIDE_WORDS,
  classify,
  confidenceOf,
  impactOf,
  rollUp,
  type FlowSide,
  type FlowWindowKey,
} from '../../data/flowImpact';
import { fmtUsd } from '../../data/gex';
import { fmtContracts } from '../../data/strikeFlow';
import { buildExposureProfile } from '../../data/exposure';
import { TRUTH_WORDS } from '../../data/exposureLibrary';
import type { FlowPrint } from '../../types/trace';
import DataState from '../../components/ui/DataState';
import ProvenanceChip from '../../components/ui/ProvenanceChip';
import SegmentedControl from '../../components/ui/SegmentedControl';
import { Bench, Deck, Figure, Pane, Read, Section, TYPE } from '../../components/pinpoint/Desk';
import { useScanSnapshot } from '../../components/pinpoint/useScanSnapshot';
import { CALL_WALL, FLIP, INK, LONG_GAMMA, PUT_WALL, SHORT_GAMMA, WARN, fmtStrike, signInk } from '../../components/pinpoint/ink';

/*
==================================================
  SLAYER TERMINAL - FLOW (pages/pinpoint/Flow.tsx)
  What is changing the surface right now.
==================================================

  ── WHY THIS IS A PINPOINT DESK AND NOT A SECOND TAPE ─────────────────────

  Trace already has a flow section, and it is a good one: every print, every
  filter, the whole day. This desk is not that and must not become it. Trace
  answers "what traded". This answers a narrower question that only makes
  sense next to a positioning surface:

      WHICH OF TODAY'S PRINTS MOVED THE BOOK, AND BY HOW MUCH.

  So the table is ordered by exposure impact rather than by time, the strike
  roll-up is the headline rather than the feed, and every row is joined to
  the strike it landed on — the same strike, on the same axis, that the
  Exposure surface draws.

  ── THE HONEST PART ───────────────────────────────────────────────────────

  Open interest lands at settlement. Nothing on a tape says whether a print
  OPENED a position or CLOSED one, and the two move the exposure in opposite
  directions. So every impact figure here is stated as "if this opened", once,
  at the top, and the page never quietly drops the condition afterwards.

  Nor does it say a dealer bought anything. It says where in the spread the
  fill landed and how much that execution supports the reading — which is all
  a tape can support.
*/

/*
  THE DIRECTION PAIR, NOT THE WALL PAIR.

  This reached for CALL_WALL and PUT_WALL, which are the inks the section
  spends on LEVEL IDENTITY — the two prices Levels answers for. A buy is not
  a call wall; it is money going one way, and ink.ts already has the pair for
  that. Two facts wearing one colour is how a palette stops meaning anything.
*/
const SIDE_INK: Record<FlowSide, string> = {
  'buy-initiated': LONG_GAMMA,
  'sell-initiated': SHORT_GAMMA,
  mid: INK.secondary,
  unknown: INK.muted,
};

const money = (v: number) => (Math.abs(v) < 1 ? '—' : fmtUsd(v));
const pct = (v: number) => `${Math.round(v * 100)}%`;

const Flow = () => {
  const { flowTape, activeTicker } = useMarketData();
  const { snapshot } = useScanSnapshot();
  const [win, setWin] = useState<FlowWindowKey>('15m');
  const [picked, setPicked] = useState<number | null>(null);

  /* This name's prints only — the tape carries the whole roster, and a
     positioning desk that mixed two books would be answering nothing. */
  const mine = useMemo(
    () => flowTape.filter(p => p.ticker === activeTicker),
    [flowTape, activeTicker]
  );

  /*
    THE WINDOW.

    `FlowPrint.time` is a clock string rather than a stamp, so the window is
    taken off the tape's own order — newest first — at the rate the desk
    prints. That is honest about what it is: the last N prints, labelled by
    the span they cover, not a wall-clock cut this data cannot support.
  */
  const windowed = useMemo(() => {
    const w = FLOW_WINDOWS.find(x => x.key === win)!;
    if (!Number.isFinite(w.ms)) return mine;
    const perMinute = 6;
    return mine.slice(0, Math.max(12, Math.round((w.ms / 60_000) * perMinute)));
  }, [mine, win]);

  const chain = snapshot?.chain ?? [];
  const spot = snapshot?.spot ?? 0;

  const strikes = useMemo(
    () => (snapshot ? rollUp(windowed, chain, spot) : []),
    [windowed, chain, spot, snapshot]
  );

  /* The levels this flow is landing near, off the same book the surface
     draws — so "which level did this touch" is answerable. */
  const book = useMemo(() => (snapshot ? buildExposureProfile(snapshot, 'ALL', 15) : null), [snapshot]);

  const rows = useMemo(() => {
    if (!snapshot) return [];
    return windowed
      .map(p => {
        const side = classify(p);
        return { print: p, side, conf: confidenceOf(p, side), impact: impactOf(p, chain, spot) };
      })
      .filter(r => r.impact.node)
      .sort((a, b) => Math.abs(b.impact.gex) - Math.abs(a.impact.gex));
  }, [windowed, chain, spot, snapshot]);

  if (!snapshot || !book) {
    return (
      <Section title="Flow">
        <DataState kind="loading" title="Reading the tape" body="The first scan has not landed yet." />
      </Section>
    );
  }

  if (rows.length === 0) {
    return (
      <Section title="Flow">
        {/*
          §65 — the empty state names its cause and says what IS available,
          rather than drawing zeros that look like a quiet tape.
        */}
        <DataState
          kind="empty"
          title="No prints for this name in the window"
          body={`The tape carries ${flowTape.length} prints this session, none of them ${activeTicker} inside ${FLOW_WINDOWS.find(w => w.key === win)?.label}. The surface and its levels are unaffected — they are built from open interest, which settles overnight and does not need today's tape. Widen the window, or read the book on Exposure.`}
        />
      </Section>
    );
  }

  const totals = strikes.reduce(
    (a, s) => ({ gex: a.gex + s.gex, contracts: a.contracts + s.contracts, prints: a.prints + s.prints }),
    { gex: 0, contracts: 0, prints: 0 }
  );
  const buyContracts = strikes.reduce((a, s) => a + s.buyShare * s.contracts, 0);
  const lv = book.levels;
  const levelAt = (strike: number) =>
    Math.abs(strike - lv.callWall) < 0.01
      ? { label: 'call wall', ink: CALL_WALL }
      : Math.abs(strike - lv.putWall) < 0.01
        ? { label: 'put wall', ink: PUT_WALL }
        : Math.abs(strike - lv.flip) < 0.01
          ? { label: 'the flip', ink: FLIP }
          : null;

  return (
    <>
      <Section
        title="Flow"
        note="what is changing the surface right now"
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <ProvenanceChip
              sources={['prints', 'chain', 'exposure']}
              note="Prints as the tape reported them. The exposure each one would add is this desk's calculation, from the same strike node the surface is drawn from."
            />
            <SegmentedControl
              ariaLabel="Flow window"
              value={win}
              onChange={v => setWin(v as FlowWindowKey)}
              options={FLOW_WINDOWS.map(w => ({ value: w.key, label: w.label }))}
            />
          </div>
        }
      >
        {/* §81 — the interface shows the information first. One sentence,
            and it is the condition every number below depends on; the rest
            of the reasoning lives at the foot of the page where a reader
            goes looking for it rather than past it. */}
        <Read>
          <strong className="text-textPrimary">Every impact figure assumes the print opened a position</strong> — open
          interest settles overnight, so a tape cannot say whether a trade opened or closed, and the two move the book
          opposite ways.
        </Read>
        <Bench cols={4}>
          <Figure label="Prints" value={String(totals.prints)} sub={`${fmtContracts(totals.contracts)} contracts`} />
          <Figure
            label="Gamma it would add"
            value={money(totals.gex)}
            ink={signInk(totals.gex)}
            sub="if every one of them opened"
          />
          <Figure
            label="Buy initiated"
            value={pct(totals.contracts > 0 ? buyContracts / totals.contracts : 0)}
            sub="of contracts, by where the fill landed"
          />
          <Figure label="Strikes touched" value={String(strikes.length)} sub={`of ${book.strikes.length} on the book`} />
        </Bench>
      </Section>

      <Section title="Where it landed" note="strikes the window moved, heaviest first">
        <Pane className="max-h-[320px]">
          <table className="w-full">
            <thead className="sticky top-0 bg-canvas">
              <tr className={`${TYPE.label} text-textMuted text-left`}>
                <th className="py-1.5 pr-3 font-normal">Strike</th>
                <th className="py-1.5 pr-3 font-normal text-right">Gamma added</th>
                <th className="py-1.5 pr-3 font-normal text-right">Delta added</th>
                <th className="py-1.5 pr-3 font-normal text-right">Contracts</th>
                <th className="py-1.5 pr-3 font-normal text-right">Prints</th>
                <th className="py-1.5 font-normal text-right">Buy initiated</th>
              </tr>
            </thead>
            <tbody>
              {strikes.map(s => {
                const at = levelAt(s.strike);
                return (
                  <tr
                    key={s.strike}
                    onClick={() => setPicked(p => (p === s.strike ? null : s.strike))}
                    className={`border-t border-borderSubtle/60 cursor-pointer transition-colors ${
                      picked === s.strike ? 'bg-white/[0.04]' : 'hover:bg-white/[0.02]'
                    }`}
                  >
                    <td className={`${TYPE.num} py-1.5 pr-3`}>
                      <span style={at ? { color: at.ink } : undefined}>{fmtStrike(s.strike)}</span>
                      {at && <span className={`${TYPE.body} ml-2`} style={{ color: at.ink }}>{at.label}</span>}
                    </td>
                    <td className={`${TYPE.num} py-1.5 pr-3 text-right`} style={{ color: signInk(s.gex) }}>{money(s.gex)}</td>
                    <td className={`${TYPE.num} py-1.5 pr-3 text-right`} style={{ color: signInk(s.dex) }}>{money(s.dex)}</td>
                    <td className={`${TYPE.num} py-1.5 pr-3 text-right`}>{fmtContracts(s.contracts)}</td>
                    <td className={`${TYPE.num} py-1.5 pr-3 text-right`}>{s.prints}</td>
                    <td className={`${TYPE.num} py-1.5 text-right`}>{pct(s.buyShare)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Pane>
      </Section>

      <Section
        title="The prints"
        note={picked !== null ? `at ${fmtStrike(picked)}` : 'ranked by what they would move, not by the clock'}
      >
        <Pane className="max-h-[420px]">
          <table className="w-full">
            <thead className="sticky top-0 bg-canvas">
              <tr className={`${TYPE.label} text-textMuted text-left`}>
                <th className="py-1.5 pr-3 font-normal">Time</th>
                <th className="py-1.5 pr-3 font-normal">Contract</th>
                <th className="py-1.5 pr-3 font-normal text-right">Size</th>
                <th className="py-1.5 pr-3 font-normal text-right">Premium</th>
                <th className="py-1.5 pr-3 font-normal text-right">Bid · Fill · Ask</th>
                <th className="py-1.5 pr-3 font-normal">Side</th>
                <th className="py-1.5 pr-3 font-normal text-right">Confidence</th>
                <th className="py-1.5 pr-3 font-normal text-right">Gamma</th>
                <th className="py-1.5 font-normal text-right">Delta</th>
              </tr>
            </thead>
            <tbody>
              {rows
                .filter(r => picked === null || r.print.strike === picked)
                .slice(0, 80)
                .map(r => (
                  <PrintRow key={r.print.id} print={r.print} side={r.side} conf={r.conf.score} gex={r.impact.gex} dex={r.impact.dex} />
                ))}
            </tbody>
          </table>
        </Pane>
      </Section>

      <Section title="What a side reading rests on">
        <Deck
          hero={
            <div className="flex flex-col gap-2">
              {(['buy-initiated', 'sell-initiated', 'mid', 'unknown'] as FlowSide[]).map(s => (
                <div key={s} className="border-b border-borderSubtle/60 last:border-0 pb-2 last:pb-0">
                  <span className={`${TYPE.label}`} style={{ color: SIDE_INK[s] }}>{SIDE_WORDS[s].label}</span>
                  <p className={`${TYPE.body} text-textMuted mt-0.5`}>{SIDE_WORDS[s].note}</p>
                </div>
              ))}
            </div>
          }
          rail={
            <div>
              <span className={`${TYPE.label} text-textMuted`}>What this desk cannot see</span>
              <dl className="mt-2 flex flex-col gap-2">
                <div>
                  <dt className={`${TYPE.body} text-textSecondary`}>Whether a print opened or closed</dt>
                  <dd className={`${TYPE.body} text-textMuted mt-0.5`}>
                    Open interest arrives at settlement, not on the tape. Every impact above is signed as if the print
                    opened; a closing print moves the book the other way by the same amount.
                  </dd>
                </div>
                <div>
                  <dt className={`${TYPE.body} text-textSecondary`}>Who was on the other side</dt>
                  <dd className={`${TYPE.body} text-textMuted mt-0.5`}>
                    A fill at the offer is evidence a buyer crossed the spread. It is not proof, and it says nothing
                    about dealer inventory. {TRUTH_WORDS.inferred.note}
                  </dd>
                </div>
              </dl>
            </div>
          }
        />
      </Section>
    </>
  );
};

/** One print, and what it would move. */
const PrintRow = ({
  print,
  side,
  conf,
  gex,
  dex,
}: {
  print: FlowPrint;
  side: FlowSide;
  conf: number;
  gex: number;
  dex: number;
}) => (
  <tr className="border-t border-borderSubtle/60 hover:bg-white/[0.02] transition-colors">
    <td className={`${TYPE.num} py-1.5 pr-3 font-normal text-textMuted`}>{print.time}</td>
    <td className={`${TYPE.num} py-1.5 pr-3`}>
      {fmtStrike(print.strike)}
      {/* The letter is the fact. Colouring C and P in the wall pair spent two
          hues on something one glyph already says without ambiguity. */}
      <span className="ml-1 text-textSecondary">{print.right}</span>
      <span className={`${TYPE.body} text-textMuted ml-2`}>{print.dte}d</span>
      {print.sweep && <span className={`${TYPE.body} ml-2`} style={{ color: WARN }}>sweep</span>}
    </td>
    <td className={`${TYPE.num} py-1.5 pr-3 text-right`}>{fmtContracts(print.size)}</td>
    <td className={`${TYPE.num} py-1.5 pr-3 text-right`}>{fmtUsd(print.premium)}</td>
    <td className={`${TYPE.num} py-1.5 pr-3 text-right font-normal text-textMuted`}>
      {print.bid.toFixed(2)} · <span className="text-textPrimary font-semibold">{print.fill.toFixed(2)}</span> ·{' '}
      {print.ask.toFixed(2)}
    </td>
    <td className={`${TYPE.label} py-1.5 pr-3`} style={{ color: SIDE_INK[side] }} title={SIDE_WORDS[side].note}>
      {SIDE_WORDS[side].label}
    </td>
    <td className={`${TYPE.num} py-1.5 pr-3 text-right font-normal`}>
      <span className={conf >= 60 ? 'text-textPrimary' : 'text-textMuted'}>{conf}</span>
    </td>
    <td className={`${TYPE.num} py-1.5 pr-3 text-right`} style={{ color: signInk(gex) }}>{money(gex)}</td>
    <td className={`${TYPE.num} py-1.5 text-right`} style={{ color: signInk(dex) }}>{money(dex)}</td>
  </tr>
);

export default Flow;
