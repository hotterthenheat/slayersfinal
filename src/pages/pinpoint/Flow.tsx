import { useMemo, useState } from 'react';
import { useMarketData } from '../../context/MarketDataContext';
import { FLOW_WINDOWS, SIDE_WORDS, classify, confidenceOf, impactOf, rollUp, type FlowSide, type FlowWindowKey } from '../../data/flowImpact';
import { fmtUsd } from '../../data/gex';
import { fmtContracts } from '../../data/strikeFlow';
import { buildExposureProfile } from '../../data/exposure';
import { TRUTH_WORDS } from '../../data/exposureLibrary';
import type { FlowPrint } from '../../types/trace';
import DataState from '../../components/ui/DataState';
import ProvenanceChip from '../../components/ui/ProvenanceChip';
import { Cell, Deck, DeskLoading, Figure, Method, Note, Pane, Read, Region, Row, Segmented, TYPE, Table, Toolbar } from '../../components/pinpoint/Desk';
import { useScanSnapshot } from '../../components/pinpoint/useScanSnapshot';
import { CALL_WALL, FLIP, INK, LONG_GAMMA, PUT_WALL, SHORT_GAMMA, WARN, fmtStrike, signInk } from '../../components/pinpoint/ink';

/*
==================================================
  SLAYER TERMINAL - FLOW (pages/pinpoint/Flow.tsx)
  What is changing the surface right now.
==================================================

  THE QUESTION: which of today's prints moved the book, and by how much.
  Trace answers "what traded"; this answers the narrower question that
  only makes sense beside a positioning surface, so the table is ordered
  by exposure impact rather than by the clock and every row is joined to
  the strike it landed on. THE ACTION: pick a strike; the prints filter
  to it.

  THE HONEST PART. Open interest lands at settlement. Nothing on a tape
  says whether a print opened or closed a position, and the two move the
  exposure opposite ways. So every impact figure is stated as "if this
  opened", once, where the reader cannot miss it.
*/

/* The direction pair, not the wall pair: a buy is money going one way. */
const SIDE_INK: Record<FlowSide, string> = {
  'buy-initiated': LONG_GAMMA,
  'sell-initiated': SHORT_GAMMA,
  mid: INK.secondary,
  unknown: INK.muted,
};

const money = (v: number) => (Math.abs(v) < 1 ? '—' : fmtUsd(v));
const pct = (v: number) => `${Math.round(v * 100)}%`;
const WINDOW_OPTIONS = FLOW_WINDOWS.map(w => ({ value: w.key, label: w.label }));

const Flow = () => {
  const { flowTape, activeTicker } = useMarketData();
  const { snapshot } = useScanSnapshot();
  const [win, setWin] = useState<FlowWindowKey>('15m');
  const [picked, setPicked] = useState<number | null>(null);

  /* This name's prints only — a positioning desk that mixed two books
     would be answering nothing. */
  const mine = useMemo(() => flowTape.filter(p => p.ticker === activeTicker), [flowTape, activeTicker]);

  /* The window is the last N prints at the rate the desk prints, labelled
     by the span they cover — honest about what a clock-string tape can
     support. */
  const windowed = useMemo(() => {
    const w = FLOW_WINDOWS.find(x => x.key === win)!;
    if (!Number.isFinite(w.ms)) return mine;
    const perMinute = 6;
    return mine.slice(0, Math.max(12, Math.round((w.ms / 60_000) * perMinute)));
  }, [mine, win]);

  const chain = snapshot?.chain ?? [];
  const spot = snapshot?.spot ?? 0;
  const strikes = useMemo(() => (snapshot ? rollUp(windowed, chain, spot) : []), [windowed, chain, spot, snapshot]);
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
      <DeskLoading>
        <DataState kind="loading" title="Reading the tape" body="The first scan has not landed yet." />
      </DeskLoading>
    );
  }

  const windowLabel = FLOW_WINDOWS.find(w => w.key === win)?.label ?? win;
  const toolbar = (
    <Toolbar data-flow-controls>
      <Segmented ariaLabel="Flow window" value={win} onChange={setWin} options={WINDOW_OPTIONS} />
      <ProvenanceChip sources={['prints', 'chain', 'exposure']} className="ml-auto" note="Prints as the tape reported them. The exposure each one would add is this desk's calculation, from the same strike node the surface is drawn from." />
    </Toolbar>
  );

  if (rows.length === 0) {
    return (
      <>
        {toolbar}
        <Region title="Where it landed">
          {/* The empty state names its cause and says what IS available. */}
          <DataState
            kind="empty"
            title="No prints for this name in the window"
            body={`The tape carries ${flowTape.length} prints this session, none of them ${activeTicker} inside ${windowLabel}. The surface and its levels are unaffected — they are built from open interest, which settles overnight and does not need today's tape. Widen the window, or read the book on Exposure.`}
          />
        </Region>
      </>
    );
  }

  const totals = strikes.reduce((a, s) => ({ gex: a.gex + s.gex, contracts: a.contracts + s.contracts, prints: a.prints + s.prints }), { gex: 0, contracts: 0, prints: 0 });
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

  const hero = (
    <Region title="Where it landed" note="strikes the window moved, heaviest first — pick one to see its prints">
      <Pane className="max-h-[320px]">
        <Table
          sticky
          cols={[
            { key: 'strike', label: 'Strike' },
            { key: 'gex', label: 'Gamma added', align: 'right' },
            { key: 'dex', label: 'Delta added', align: 'right' },
            { key: 'contracts', label: 'Contracts', align: 'right' },
            { key: 'prints', label: 'Prints', align: 'right' },
            { key: 'buy', label: 'Buy initiated', align: 'right' },
          ]}
        >
          {strikes.map(s => {
            const at = levelAt(s.strike);
            return (
              <Row key={s.strike} onSelect={() => setPicked(p => (p === s.strike ? null : s.strike))} selected={picked === s.strike}>
                <Cell className={TYPE.num}>
                  <span style={at ? { color: at.ink } : undefined}>{fmtStrike(s.strike)}</span>
                  {at && (
                    <span className={`${TYPE.body} ml-2`} style={{ color: at.ink }}>
                      {at.label}
                    </span>
                  )}
                </Cell>
                <Cell num style={{ color: signInk(s.gex) }}>
                  {money(s.gex)}
                </Cell>
                <Cell num style={{ color: signInk(s.dex) }}>
                  {money(s.dex)}
                </Cell>
                <Cell num>{fmtContracts(s.contracts)}</Cell>
                <Cell num>{s.prints}</Cell>
                <Cell num>{pct(s.buyShare)}</Cell>
              </Row>
            );
          })}
        </Table>
      </Pane>
    </Region>
  );

  const rail = (
    <Region title={`In the last ${windowLabel}`}>
      <div className="flex flex-col gap-4">
        <Figure label="Prints" value={String(totals.prints)} sub={`${fmtContracts(totals.contracts)} contracts`} />
        <Figure label="Gamma it would add" value={money(totals.gex)} ink={signInk(totals.gex)} sub="if every one of them opened" />
        <Figure label="Buy initiated" value={pct(totals.contracts > 0 ? buyContracts / totals.contracts : 0)} sub="of contracts, by where the fill landed" />
        <Figure label="Strikes touched" value={String(strikes.length)} sub={`of ${book.strikes.length} on the book`} />
      </div>
      <Read className="pt-4">
        <strong className="text-textPrimary">Every impact figure assumes the print opened a position</strong> — open interest settles overnight, so a tape cannot say whether a trade
        opened or closed, and the two move the book opposite ways.
      </Read>
    </Region>
  );

  return (
    <>
      {toolbar}
      <Deck hero={hero} rail={rail}>
        <Region title="The prints" note={picked !== null ? `at ${fmtStrike(picked)}` : 'ranked by what they would move, not by the clock'}>
          <Pane className="max-h-[420px]">
            <Table
              sticky
              cols={[
                { key: 'time', label: 'Time' },
                { key: 'contract', label: 'Contract' },
                { key: 'size', label: 'Size', align: 'right' },
                { key: 'premium', label: 'Premium', align: 'right' },
                { key: 'quote', label: 'Bid · Fill · Ask', align: 'right' },
                { key: 'side', label: 'Side' },
                { key: 'conf', label: 'Confidence', align: 'right' },
                { key: 'gex', label: 'Gamma', align: 'right' },
                { key: 'dex', label: 'Delta', align: 'right' },
              ]}
            >
              {rows
                .filter(r => picked === null || r.print.strike === picked)
                .slice(0, 80)
                .map(r => (
                  <PrintRow key={r.print.id} print={r.print} side={r.side} conf={r.conf.score} gex={r.impact.gex} dex={r.impact.dex} />
                ))}
            </Table>
          </Pane>
        </Region>

        <Method title="What a side reading rests on">
          {(['buy-initiated', 'sell-initiated', 'mid', 'unknown'] as FlowSide[]).map(s => (
            <Note key={s} term={<span style={{ color: SIDE_INK[s] }}>{SIDE_WORDS[s].label}</span>}>
              {SIDE_WORDS[s].note}
            </Note>
          ))}
          <Note term="Opened or closed">
            Open interest arrives at settlement, not on the tape. Every impact above is signed as if the print opened; a closing print moves the book the other way by the same
            amount. This desk cannot see which.
          </Note>
          <Note term="The other side">A fill at the offer is evidence a buyer crossed the spread. It is not proof, and it says nothing about dealer inventory. {TRUTH_WORDS.inferred.note}</Note>
        </Method>
      </Deck>
    </>
  );
};

/** One print, and what it would move. */
const PrintRow = ({ print, side, conf, gex, dex }: { print: FlowPrint; side: FlowSide; conf: number; gex: number; dex: number }) => (
  <Row>
    <Cell className={`${TYPE.num} font-normal text-textMuted`}>{print.time}</Cell>
    <Cell className={TYPE.num}>
      {fmtStrike(print.strike)}
      <span className="ml-1 text-textSecondary">{print.right}</span>
      <span className={`${TYPE.body} text-textMuted ml-2`}>{print.dte}d</span>
      {print.sweep && (
        <span className={`${TYPE.body} ml-2`} style={{ color: WARN }}>
          sweep
        </span>
      )}
    </Cell>
    <Cell num>{fmtContracts(print.size)}</Cell>
    <Cell num>{fmtUsd(print.premium)}</Cell>
    <Cell num className="font-normal text-textMuted">
      {print.bid.toFixed(2)} · <span className="text-textPrimary font-semibold">{print.fill.toFixed(2)}</span> · {print.ask.toFixed(2)}
    </Cell>
    <Cell className={TYPE.label} style={{ color: SIDE_INK[side] }} title={SIDE_WORDS[side].note}>
      {SIDE_WORDS[side].label}
    </Cell>
    <Cell num className="font-normal">
      <span className={conf >= 60 ? 'text-textPrimary' : 'text-textMuted'}>{conf}</span>
    </Cell>
    <Cell num style={{ color: signInk(gex) }}>
      {money(gex)}
    </Cell>
    <Cell num style={{ color: signInk(dex) }}>
      {money(dex)}
    </Cell>
  </Row>
);

export default Flow;
