import { useMemo, useState } from 'react';
import { useMarketData } from '../../context/MarketDataContext';
import Simulator from '../../core/simulator';
import { bandWords, buildBasisBand, buildStrikeBasis } from '../../data/costBasis';
import { buildPainCurve, painWords } from '../../data/painCurve';
import { buildPins } from '../../data/pins';
import { fmtDistance, impliedDaySigma, sessionAtr, type DistanceScales } from '../../data/atr';
import { useDistanceUnit } from '../../data/distanceUnits';
import { fmtUsd } from '../../data/gex';
import DataState from '../../components/ui/DataState';
import ProvenanceChip from '../../components/ui/ProvenanceChip';
import BasisDrift from '../../components/gex/BasisDrift';
import { Cell, Deck, DeskLoading, Figure, Legend, Method, Note, Pane, Read, Region, Row, Surface, TYPE, Table, Tag } from '../../components/pinpoint/Desk';
import Spark from '../../components/pinpoint/Spark';
import { useScanSnapshot } from '../../components/pinpoint/useScanSnapshot';
import { CALL_WALL, INK, LONG_GAMMA, PUT_WALL, SHORT_GAMMA, SPOT, fmtStrike } from '../../components/pinpoint/ink';

/*
==================================================
  SLAYER TERMINAL - HOLDERS (pages/pinpoint/Pain.tsx)
  Where today's buyers got in — and the spot that flips them.
==================================================

  THE QUESTION: where do the people holding these contracts stand. Not
  max pain — the distinction is the first sentence on the desk, and the
  curve is drawn against the market's own price so the reader sees P&L
  NOW, not payout at expiry. THE ACTION: pick a strike in the ladder to
  see who bought there today, what they paid, and where they stand.

  The population is today's aggressive buyers — the people who paid up —
  and their basis is read off the tape strike by strike. Green for
  holders in profit, red for holders underwater: money up and money down
  are the one thing the pair means everywhere on this desk.
*/

const DTE_YEARS = 30 / 365;

const Pain = () => {
  const { flowTape } = useMarketData();
  const { snapshot, scanAt } = useScanSnapshot();
  const unit = useDistanceUnit();
  const [picked, setPicked] = useState<number | null>(null);

  const iv = snapshot ? (Simulator.TICKERS[snapshot.ticker]?.iv ?? 0.2) : 0.2;
  const scales = useMemo<DistanceScales>(() => {
    if (!snapshot) return { atr: null, sigma: null };
    return { atr: sessionAtr(Simulator.getCandles(snapshot.ticker) ?? []), sigma: impliedDaySigma(snapshot.spot, iv) };
  }, [snapshot, iv]);
  const strikes = useMemo(() => (snapshot ? [...new Set(snapshot.chain.map(n => n.strike))].sort((a, b) => b - a) : []), [snapshot]);
  const step = strikes.length > 1 ? Math.abs(strikes[0] - strikes[1]) : 1;
  const curve = useMemo(() => (snapshot ? buildPainCurve(flowTape, strikes, snapshot.spot, DTE_YEARS, iv, 81, step / 2) : null), [snapshot, flowTape, strikes, iv, step]);
  const bands = useMemo(() => (snapshot ? { call: buildBasisBand(flowTape, 'C', snapshot.spot, DTE_YEARS, iv), put: buildBasisBand(flowTape, 'P', snapshot.spot, DTE_YEARS, iv) } : null), [snapshot, flowTape, iv]);
  const ladder = useMemo(() => {
    if (!snapshot) return [];
    const near = [...strikes].sort((a, b) => Math.abs(a - snapshot.spot) - Math.abs(b - snapshot.spot)).slice(0, 21).sort((a, b) => b - a);
    return near.map(strike => {
      const call = buildStrikeBasis(flowTape, strike, 'C', snapshot.spot, DTE_YEARS, iv, step / 2);
      const put = buildStrikeBasis(flowTape, strike, 'P', snapshot.spot, DTE_YEARS, iv, step / 2);
      const has = call.unrealized !== null || put.unrealized !== null;
      return { strike, call, put, pnl: has ? (call.unrealized ?? 0) + (put.unrealized ?? 0) : null };
    });
  }, [snapshot, flowTape, strikes, iv, step]);
  const pins = useMemo(() => (snapshot ? buildPins(snapshot.chain, snapshot.spot) : null), [snapshot]);
  const bars = useMemo(() => (snapshot ? (Simulator.getCandles(snapshot.ticker) ?? []) : []), [snapshot]);

  if (!snapshot || !curve || !bands) {
    return (
      <DeskLoading>
        <DataState kind="loading" title="Reading the tape" body="The first tick has not arrived yet." />
      </DeskLoading>
    );
  }

  const spot = snapshot.spot;
  const dist = (price: number) => fmtDistance(price - spot, spot, unit, scales);
  const maxAbsPnl = Math.max(...ladder.map(r => Math.abs(r.pnl ?? 0)), 1);
  const nowInk = curve.now >= 0 ? LONG_GAMMA : SHORT_GAMMA;
  const spotIdx = curve.points.length ? curve.points.reduce((best, p, i) => (Math.abs(p.spot - spot) < Math.abs(curve.points[best].spot - spot) ? i : best), 0) : -1;
  const flipIdx = curve.flipSpot !== null && curve.points.length ? curve.points.reduce((best, p, i) => (Math.abs(p.spot - (curve.flipSpot as number)) < Math.abs(curve.points[best].spot - (curve.flipSpot as number)) ? i : best), 0) : -1;
  const focus = picked !== null ? ladder.find(r => r.strike === picked) : undefined;

  const hero = (
    <Region
      title="What today’s buyers are worth, at every price"
      note="their unrealized P&L if spot were here — the curve crosses zero at the spot that flips them"
      actions={
        <>
          <ProvenanceChip sources={['prints', 'chain', 'carry']} note="Basis comes from the print tape; every mark it is measured against is priced through the desk's rate and yield." />
          <span className={`${TYPE.label} text-textMuted tnum`}>scan {scanAt} · 10s</span>
        </>
      }
    >
      <Read>{painWords(curve, spot)}</Read>
      {curve.points.length > 1 ? (
        <>
          <div className="pt-3">
            <Spark points={curve.points.map(p => ({ x: p.spot, y: p.pnl }))} ink={nowInk} height={220} width={720} marks={[spotIdx, ...(flipIdx >= 0 ? [flipIdx] : [])].filter(i => i >= 0)} markInk={SPOT} ariaLabel="Today's buyers' P&L across spot" />
          </div>
          <div className={`pt-1 flex justify-between ${TYPE.label} tracking-normal tnum text-textMuted`}>
            <span>{fmtStrike(curve.points[0].spot)}</span>
            <span style={{ color: SPOT }}>spot {fmtStrike(spot)}</span>
            {curve.flipSpot !== null && <span className="text-textPrimary">break-even {curve.flipSpot.toFixed(2)}</span>}
            <span>{fmtStrike(curve.points[curve.points.length - 1].spot)}</span>
          </div>
          <div className="pt-2">
            <Legend items={[{ ink: LONG_GAMMA, label: 'holders in profit' }, { ink: SHORT_GAMMA, label: 'holders underwater' }, { ink: SPOT, label: 'spot and break-even' }]} />
          </div>
          <div className="mt-3 border-t border-borderSubtle pt-3 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2">
            <Figure label="At the market" value={fmtUsd(curve.now)} ink={nowInk} sub={curve.now >= 0 ? 'today’s buyers are in profit' : 'today’s buyers are underwater'} />
            <Figure label="Buyers break even at" value={curve.flipSpot === null ? <span className="text-textMuted">nowhere on the chain</span> : curve.flipSpot.toFixed(2)} sub={curve.flipSpot === null ? 'no spot on this chain turns them' : `${dist(curve.flipSpot)} from here`} />
            <Figure label="Contracts behind it" value={curve.contracts.toLocaleString('en-US')} sub={`${curve.legs.length} strike populations`} />
            {pins && pins.maxPain !== null && <Figure label="Max pain, for contrast" value={fmtStrike(pins.maxPain)} ink={INK.secondary} sub="the open interest’s payout minimum — a different question" />}
          </div>
        </>
      ) : (
        <DataState kind="empty" title="No aggressive buying on the tape yet" body="The curve needs at least one strike where someone paid up today." pad="sm" className="mt-3" />
      )}
    </Region>
  );

  const rail = (
    <>
      <Region title="Where the calls and the puts got in">
        <div className="flex flex-col gap-3" data-basis-bands>
          {(
            [
              { label: 'Open calls', ink: CALL_WALL, b: bands.call },
              { label: 'Open puts', ink: PUT_WALL, b: bands.put },
            ] as const
          ).map(x => (
            <div key={x.label}>
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className={`${TYPE.label} font-bold`} style={{ color: x.ink }}>
                  {x.label}
                </span>
                <span className={`${TYPE.lead} text-textPrimary`}>{x.b.basis === null ? '—' : `$${x.b.basis.toFixed(2)}`}</span>
                <span className={`${TYPE.label} tracking-normal text-textMuted tnum`}>{x.b.contracts.toLocaleString('en-US')} contracts</span>
                {x.b.breakevenSpot !== null && (
                  <Tag ink={x.ink} title="the spot at which these holders break even">
                    even at {x.b.breakevenSpot.toFixed(2)}
                  </Tag>
                )}
              </div>
              <p className={`${TYPE.body} text-textSecondary`}>{bandWords(x.b, spot)}</p>
            </div>
          ))}
        </div>
      </Region>

      {/* The strike the reader picked — the one box on the desk. */}
      <Surface title={focus ? `Strike ${fmtStrike(focus.strike)}` : 'Point at a strike'} note={focus ? 'who bought here today, what they paid, and where they stand' : 'pick a row in the ladder to hold it'}>
        {focus ? (
          <div className="flex flex-col gap-2">
            {(
              [
                { label: 'Calls', ink: CALL_WALL, b: focus.call },
                { label: 'Puts', ink: PUT_WALL, b: focus.put },
              ] as const
            ).map(x => (
              <div key={x.label} className="grid grid-cols-[44px_1fr] gap-2 items-baseline">
                <span className={`${TYPE.label} font-bold`} style={{ color: x.ink }}>
                  {x.label}
                </span>
                {x.b.basis === null ? (
                  <span className={`${TYPE.body} text-textMuted`}>no aggressive longs today</span>
                ) : (
                  <span className={`font-mono ${TYPE.body} tnum text-textPrimary`}>
                    {x.b.contracts.toLocaleString('en-US')} at ${x.b.basis.toFixed(2)} · mark {x.b.mark === null ? '—' : `$${x.b.mark.toFixed(2)}`} ·{' '}
                    <span style={{ color: (x.b.unrealized ?? 0) >= 0 ? LONG_GAMMA : SHORT_GAMMA }}>{x.b.unrealized === null ? '—' : fmtUsd(x.b.unrealized)}</span>
                    <span className="text-textMuted"> · {Math.round(x.b.coverage * 100)}% of the strike’s premium</span>
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className={`${TYPE.body} text-textMuted`}>Green rows are strikes where today’s buyers are in profit at the current price; red rows are underwater.</p>
        )}
      </Surface>

      <Region title="Where the bands sit on the tape">
        {bars.length > 5 ? <BasisDrift bars={bars} callBe={bands.call.breakevenSpot} putBe={bands.put.breakevenSpot} /> : <DataState kind="empty" title="No bars yet" pad="sm" />}
      </Region>
    </>
  );

  return (
    <Deck hero={hero} rail={rail}>
      <Region title="Strike by strike" actions={<span className={`${TYPE.label} text-textMuted`}>the {ladder.length} nearest spot</span>}>
        <Pane className="max-h-[520px] max-w-[1100px]">
          <Table
            sticky
            data-pain-ladder
            cols={[
              { key: 'strike', label: 'Strike' },
              { key: 'call', label: 'Call basis', align: 'right' },
              { key: 'put', label: 'Put basis', align: 'right' },
              { key: 'pnl', label: 'P&L at the market', width: '34%' },
              { key: 'usd', label: 'Dollars', align: 'right' },
            ]}
          >
            {ladder.map((r, i) => {
              const spotAfter = r.strike >= spot && (ladder[i + 1]?.strike ?? -Infinity) < spot;
              const ink = r.pnl === null ? INK.muted : r.pnl >= 0 ? LONG_GAMMA : SHORT_GAMMA;
              return (
                <Row key={r.strike} onSelect={() => setPicked(p => (p === r.strike ? null : r.strike))} selected={picked === r.strike} className={spotAfter ? 'border-b-2' : ''} style={spotAfter ? { borderBottomColor: SPOT } : undefined}>
                  <Cell className={`${TYPE.lead} text-textPrimary`}>
                    {fmtStrike(r.strike)} <span className={`ml-2 ${TYPE.label} tracking-normal font-normal text-textMuted`}>{dist(r.strike)}</span>
                  </Cell>
                  <Cell num className="text-textSecondary font-normal">
                    {r.call.basis === null ? <span className="text-textMuted/50">—</span> : `$${r.call.basis.toFixed(2)}`}
                  </Cell>
                  <Cell num className="text-textSecondary font-normal">
                    {r.put.basis === null ? <span className="text-textMuted/50">—</span> : `$${r.put.basis.toFixed(2)}`}
                  </Cell>
                  <Cell>
                    {r.pnl !== null && (
                      <div className="relative h-[8px] bg-white/[0.05] overflow-hidden">
                        <span className="absolute inset-y-0 left-1/2 w-px bg-white/30" />
                        <span className="absolute inset-y-0" style={{ background: ink, left: r.pnl >= 0 ? '50%' : `${50 - (Math.abs(r.pnl) / maxAbsPnl) * 50}%`, width: `${(Math.abs(r.pnl) / maxAbsPnl) * 50}%` }} />
                      </div>
                    )}
                  </Cell>
                  <Cell num style={{ color: ink }}>
                    {r.pnl === null ? '' : fmtUsd(r.pnl)}
                  </Cell>
                </Row>
              );
            })}
          </Table>
        </Pane>
      </Region>

      <Method>
        <Note term="Not max pain">Max pain is the expiry price that minimises the open interest’s payout. This desk asks a different question: what today’s buyers are worth at the market’s own price, now.</Note>
        <Note term="The population">Today’s aggressive buyers — prints filled at or near the offer. Their basis is the volume-weighted price they paid, strike by strike, read off the tape.</Note>
        <Note term="The mark">Each basis is measured against a mark priced at 30 days to expiry through the desk’s rate and yield. Coverage is the share of the strike’s premium those buyers account for.</Note>
        <Note term="Break-even">The spot at which a population’s unrealized P&L crosses zero, nearest the market. A tape that is mostly red sells into strength to get out.</Note>
      </Method>
    </Deck>
  );
};

export default Pain;
