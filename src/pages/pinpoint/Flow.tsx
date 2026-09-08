import { useMemo, useState } from 'react';
import { useMarketData } from '../../context/MarketDataContext';
import { FLOW_WINDOWS, SIDE_WORDS, classify, confidenceOf, impactOf, rollUp, type FlowSide, type FlowWindowKey } from '../../data/flowImpact';
import { fmtUsd } from '../../data/gex';
import { fmtContracts } from '../../data/strikeFlow';
import { buildExposureProfile } from '../../data/exposure';
import DataState from '../../components/ui/DataState';
import { Cell, DeskLoading, Figure, Group, Pane, Read, Row, Segmented, Stat, TYPE, Table, Toolbar, Workspace } from '../../components/pinpoint/Desk';
import StrikeProfile, { type ProfileLevel, type ProfileRow } from '../../components/pinpoint/StrikeProfile';
import { useScanSnapshot } from '../../components/pinpoint/useScanSnapshot';
import { CALL_WALL, FLIP, INK, LONG_GAMMA, PUT_WALL, SHORT_GAMMA, SPOT, WARN, fmtStrike, signInk } from '../../components/pinpoint/ink';

/*
  FLOW — which of today's prints moved the book, and by how much. The
  picture is the gamma each strike would gain if the window's prints opened;
  the tape under it is ranked by what it would move, not by the clock.
*/

const SIDE_INK: Record<FlowSide, string> = { 'buy-initiated': LONG_GAMMA, 'sell-initiated': SHORT_GAMMA, mid: INK.secondary, unknown: INK.muted };
/* A strike the window's prints never touched prints NOTHING. An em dash on
   every untouched row drew a column of punctuation down the middle of the
   picture and said only that most strikes did not trade in fifteen
   minutes, which the empty row already says. */
const money = (v: number) => (Math.abs(v) < 1 ? '' : fmtUsd(v));
const pct = (v: number) => `${Math.round(v * 100)}%`;
const WINDOW_OPTIONS = FLOW_WINDOWS.map(w => ({ value: w.key, label: w.label }));

const Flow = () => {
  const { flowTape, activeTicker } = useMarketData();
  const { snapshot, scanAt } = useScanSnapshot();
  const [win, setWin] = useState<FlowWindowKey>('15m');
  const [hover, setHover] = useState<number | null>(null);
  const [picked, setPicked] = useState<number | null>(null);

  const mine = useMemo(() => flowTape.filter(p => p.ticker === activeTicker), [flowTape, activeTicker]);
  const windowed = useMemo(() => {
    const w = FLOW_WINDOWS.find(x => x.key === win)!;
    if (!Number.isFinite(w.ms)) return mine;
    return mine.slice(0, Math.max(12, Math.round((w.ms / 60_000) * 6)));
  }, [mine, win]);
  const chain = snapshot?.chain ?? [];
  const spot = snapshot?.spot ?? 0;
  const strikes = useMemo(() => (snapshot ? rollUp(windowed, chain, spot) : []), [windowed, chain, spot, snapshot]);
  const book = useMemo(() => (snapshot ? buildExposureProfile(snapshot, 'ALL', 15) : null), [snapshot]);
  const prints = useMemo(
    () =>
      windowed
        .map(p => {
          const side = classify(p);
          return { print: p, side, conf: confidenceOf(p, side).score, impact: impactOf(p, chain, spot) };
        })
        .filter(r => r.impact.node)
        .sort((a, b) => Math.abs(b.impact.gex) - Math.abs(a.impact.gex)),
    [windowed, chain, spot]
  );

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
      <span className={`${TYPE.label} text-textMuted tnum ml-auto`}>scan {scanAt}</span>
    </Toolbar>
  );

  if (prints.length === 0) {
    return (
      <Workspace
        toolbar={toolbar}
        picture={<DataState kind="empty" title="No prints for this name in the window" body={`${flowTape.length} prints on the tape this session, none ${activeTicker} inside ${windowLabel}. The surface is built from open interest and does not need today's tape — widen the window, or read the book on Exposure.`} pad="lg" />}
        inspector={<Group title="Window">{<Stat label={windowLabel} value="0 prints" />}</Group>}
      />
    );
  }

  const lv = book.levels;
  const byStrike = new Map(strikes.map(s => [s.strike, s]));
  const rows: ProfileRow[] = [...book.strikes].sort((a, b) => b.strike - a.strike).map(s => {
    const hit = byStrike.get(s.strike);
    return { strike: s.strike, values: { gex: hit?.gex ?? 0, dex: hit?.dex ?? 0 }, tag: hit ? `${hit.prints}` : undefined };
  });
  const maxAbs = Math.max(1, ...strikes.map(s => Math.max(Math.abs(s.gex), Math.abs(s.dex))));
  const levels: ProfileLevel[] = [
    { kind: 'spot', price: spot, tag: `SPOT ${fmtStrike(spot)}`, ink: SPOT },
    { kind: 'flip', price: lv.flip, tag: `FLIP ${fmtStrike(lv.flip)}`, ink: FLIP, dashed: true },
    { kind: 'call-wall', price: lv.callWall, tag: `CW ${fmtStrike(lv.callWall)}`, ink: CALL_WALL },
    { kind: 'put-wall', price: lv.putWall, tag: `PW ${fmtStrike(lv.putWall)}`, ink: PUT_WALL },
  ];
  const totals = strikes.reduce((a, s) => ({ gex: a.gex + s.gex, dex: a.dex + s.dex, contracts: a.contracts + s.contracts, prints: a.prints + s.prints, buys: a.buys + s.buyShare * s.contracts }), { gex: 0, dex: 0, contracts: 0, prints: 0, buys: 0 });
  const focusStrike = hover ?? picked;
  const focus = focusStrike !== null ? (byStrike.get(focusStrike) ?? null) : null;
  const sides = (['buy-initiated', 'sell-initiated', 'mid', 'unknown'] as FlowSide[]).map(s => ({ s, n: prints.filter(p => p.side === s).length }));
  const shown = prints.filter(p => picked === null || p.print.strike === picked).slice(0, 80);

  return (
    <Workspace
      toolbar={toolbar}
      picture={
        <StrikeProfile
          rows={rows}
          series={[{ key: 'gex', label: 'gamma added', ink: 'heat' }, { key: 'dex', label: 'delta added', ink: 'heat', weight: 'thin' }]}
          maxAbs={maxAbs}
          levels={levels}
          fmt={money}
          figures
          hoverStrike={hover}
          onHover={setHover}
          selectedStrike={picked}
          onSelect={s => setPicked(p => (p === s ? null : s))}
          ariaLabel={`Gamma each strike would gain if the last ${windowLabel} of prints opened. ${strikes.length} strikes touched. Spot ${fmtStrike(spot)}.`}
        />
      }
      drawer={
        <Pane className="max-h-[220px]" data-prints>
          <Table
            sticky
            cols={[
              { key: 'time', label: 'Time' },
              { key: 'contract', label: 'Contract' },
              { key: 'size', label: 'Size', align: 'right' },
              { key: 'premium', label: 'Premium', align: 'right' },
              { key: 'quote', label: 'Bid · Fill · Ask', align: 'right' },
              { key: 'side', label: 'Side' },
              { key: 'conf', label: 'Conf', align: 'right' },
              { key: 'gex', label: 'Gamma', align: 'right' },
              { key: 'dex', label: 'Delta', align: 'right' },
            ]}
          >
            {shown.map(r => (
              <Row key={r.print.id}>
                <Cell className="text-textMuted">{r.print.time}</Cell>
                <Cell className={TYPE.num}>
                  {fmtStrike(r.print.strike)}
                  <span className="ml-1" style={{ color: r.print.right === 'C' ? CALL_WALL : PUT_WALL }}>
                    {r.print.right}
                  </span>
                  <span className="ml-2 text-textMuted font-normal">{r.print.dte}d</span>
                  {r.print.sweep && (
                    <span className="ml-2 font-normal" style={{ color: WARN }}>
                      sweep
                    </span>
                  )}
                </Cell>
                <Cell num>{fmtContracts(r.print.size)}</Cell>
                <Cell num>{fmtUsd(r.print.premium)}</Cell>
                <Cell num className="font-normal text-textMuted">
                  {r.print.bid.toFixed(2)} · <span className="text-textPrimary font-semibold">{r.print.fill.toFixed(2)}</span> · {r.print.ask.toFixed(2)}
                </Cell>
                <Cell className={TYPE.label} style={{ color: SIDE_INK[r.side] }} title={SIDE_WORDS[r.side].note}>
                  {SIDE_WORDS[r.side].label}
                </Cell>
                <Cell num className={r.conf >= 60 ? 'text-textPrimary' : 'text-textMuted'}>
                  {r.conf}
                </Cell>
                <Cell num style={{ color: signInk(r.impact.gex) }}>
                  {fmtUsd(r.impact.gex)}
                </Cell>
                <Cell num style={{ color: signInk(r.impact.dex) }}>
                  {fmtUsd(r.impact.dex)}
                </Cell>
              </Row>
            ))}
          </Table>
        </Pane>
      }
      inspector={
        <>
          <Group title={`Last ${windowLabel}`} data-group="window">
            <Stat label="Prints" value={String(totals.prints)} sub={`${fmtContracts(totals.contracts)} contracts`} />
            <Stat label="Gamma it would add" value={fmtUsd(totals.gex)} ink={signInk(totals.gex)} sub="if every one opened" />
            <Stat label="Delta it would add" value={fmtUsd(totals.dex)} ink={signInk(totals.dex)} />
            <Stat label="Buy initiated" value={pct(totals.contracts ? totals.buys / totals.contracts : 0)} sub="of contracts, by where the fill landed" />
            <Stat label="Strikes touched" value={`${strikes.length} of ${book.strikes.length}`} />
          </Group>
          <Group title={focus ? `Strike ${fmtStrike(focus.strike)}` : 'Strike'} data-group="strike">
            {focus ? (
              <>
                <Stat label="Gamma added" value={fmtUsd(focus.gex)} ink={signInk(focus.gex)} />
                <Stat label="Delta added" value={fmtUsd(focus.dex)} ink={signInk(focus.dex)} />
                <Stat label="Contracts" value={fmtContracts(focus.contracts)} sub={`${focus.prints} print${focus.prints === 1 ? '' : 's'}`} />
                <Stat label="Buy initiated" value={pct(focus.buyShare)} />
              </>
            ) : (
              <Stat label="—" value="point at a bar" />
            )}
          </Group>
          <Group title="Side" data-group="side">
            {sides.map(x => (
              <Stat key={x.s} label={<span style={{ color: SIDE_INK[x.s] }}>{SIDE_WORDS[x.s].label}</span>} value={String(x.n)} sub={SIDE_WORDS[x.s].note} />
            ))}
          </Group>
        </>
      }
      strip={
        <>
          <Figure label="Would add" value={fmtUsd(totals.gex)} ink={signInk(totals.gex)} sub="gamma, if every print opened" size="lead" />
          <Figure label="Prints" value={String(totals.prints)} sub={`${fmtContracts(totals.contracts)} contracts`} />
          <Figure label="Buy initiated" value={pct(totals.contracts ? totals.buys / totals.contracts : 0)} />
          <Read>Every impact figure assumes the print opened — open interest settles overnight, and a closing print moves the book the other way by the same amount.</Read>
        </>
      }
    />
  );
};

export default Flow;
