import { useMemo, useState } from 'react';
import { useMarketData } from '../../context/MarketDataContext';
import Simulator from '../../core/simulator';
import { buildBasisBand, buildStrikeBasis, type StrikeBasis } from '../../data/costBasis';
import { buildPainCurve, painWords } from '../../data/painCurve';
import { buildPins } from '../../data/pins';
import { fmtDistance, impliedDaySigma, sessionAtr, type DistanceScales } from '../../data/atr';
import { useDistanceUnit } from '../../data/distanceUnits';
import { fmtUsd } from '../../data/gex';
import { fmtContracts } from '../../data/strikeFlow';
import DataState from '../../components/ui/DataState';
import { DeskLoading, Figure, Group, Legend, Read, Stat, TYPE, Tag, Toolbar, Workspace } from '../../components/pinpoint/Desk';
import Series from '../../components/pinpoint/Series';
import StrikeProfile, { fitSlice, type ProfileLevel, type ProfileRow } from '../../components/pinpoint/StrikeProfile';
import { useScanSnapshot } from '../../components/pinpoint/useScanSnapshot';
import { CALL_WALL, INK, LONG_GAMMA, PUT_WALL, SHORT_GAMMA, SPOT, fmtStrike, signInk } from '../../components/pinpoint/ink';

/*
  HOLDERS — what today's buyers are worth at every price, and the spot that
  flips them. Not max pain: the curve is P&L NOW against the market's own
  price. The curve leads; the ladder under it says which strikes.
*/

const DTE_YEARS = 30 / 365;
const hhmm = (t: number) => {
  const d = new Date(t * 1000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const usd2 = (v: number | null) => (v === null ? '—' : `$${v.toFixed(2)}`);

const Pain = () => {
  const { flowTape } = useMarketData();
  const { snapshot, scanAt } = useScanSnapshot();
  const unit = useDistanceUnit();
  const [hover, setHover] = useState<number | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [fitN, setFitN] = useState<number | null>(null);
  const [curveAt, setCurveAt] = useState<{ spot: number; pnl: number } | null>(null);

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
    /* Sixty-one nearest — more than any box holds; the profile draws the
       slice its box has room for (FIT), centred on spot. */
    const near = [...strikes].sort((a, b) => Math.abs(a - snapshot.spot) - Math.abs(b - snapshot.spot)).slice(0, 61).sort((a, b) => b - a);
    return near.map(strike => {
      const call = buildStrikeBasis(flowTape, strike, 'C', snapshot.spot, DTE_YEARS, iv, step / 2);
      const put = buildStrikeBasis(flowTape, strike, 'P', snapshot.spot, DTE_YEARS, iv, step / 2);
      const has = call.unrealized !== null || put.unrealized !== null;
      return { strike, call, put, pnl: has ? (call.unrealized ?? 0) + (put.unrealized ?? 0) : null, contracts: call.contracts + put.contracts };
    });
  }, [snapshot, flowTape, strikes, iv, step]);
  const pins = useMemo(() => (snapshot ? buildPins(snapshot.chain, snapshot.spot) : null), [snapshot]);
  const bars = useMemo(() => (snapshot ? (Simulator.getCandles(snapshot.ticker) ?? []).slice(-240) : []), [snapshot]);

  if (!snapshot || !curve || !bands) {
    return (
      <DeskLoading>
        <DataState kind="loading" title="Reading the tape" body="The first tick has not arrived yet." />
      </DeskLoading>
    );
  }

  const spot = snapshot.spot;
  const dist = (price: number) => fmtDistance(price - spot, spot, unit, scales);
  const nowInk = curve.now >= 0 ? LONG_GAMMA : SHORT_GAMMA;
  /* The scale is the DRAWN rows' — a strike outside the box must not
     shrink the bars inside it. */
  const drawn = fitN === null ? ladder : fitSlice(ladder, fitN, spot);
  const maxAbs = Math.max(1, ...drawn.map(r => Math.abs(r.pnl ?? 0)));
  const rows: ProfileRow[] = ladder.map(r => ({ strike: r.strike, values: { pnl: r.pnl ?? 0 }, tag: r.contracts > 0 ? fmtContracts(r.contracts) : undefined }));
  const levels: ProfileLevel[] = [
    { kind: 'spot', price: spot, tag: `SPOT ${fmtStrike(spot)}`, ink: SPOT },
    ...(curve.flipSpot !== null ? [{ kind: 'custom' as const, price: curve.flipSpot, tag: 'EVEN', ink: INK.primary, dashed: true }] : []),
    ...(bands.call.breakevenSpot !== null ? [{ kind: 'call-wall' as const, price: bands.call.breakevenSpot, tag: 'C·BE', ink: CALL_WALL, dashed: true }] : []),
    ...(bands.put.breakevenSpot !== null ? [{ kind: 'put-wall' as const, price: bands.put.breakevenSpot, tag: 'P·BE', ink: PUT_WALL, dashed: true }] : []),
    ...(pins && pins.maxPain !== null ? [{ kind: 'max-pain' as const, price: pins.maxPain, tag: 'PAIN', ink: INK.muted }] : []),
  ];
  const focusStrike = hover ?? picked;
  const focus = focusStrike !== null ? (ladder.find(r => r.strike === focusStrike) ?? null) : null;
  const bes = [bands.call.breakevenSpot, bands.put.breakevenSpot].filter((v): v is number => v !== null);
  const band = bes.length === 2 ? { lo: Math.min(...bes), hi: Math.max(...bes) } : undefined;

  const leg = (label: string, ink: string, b: StrikeBasis) =>
    b.basis === null ? (
      <Stat key={label} label={<span style={{ color: ink }}>{label}</span>} value={<span className="text-textMuted font-normal">none today</span>} />
    ) : (
      <Stat key={label} label={<span style={{ color: ink }}>{label}</span>} value={fmtUsd(b.unrealized ?? 0)} ink={signInk(b.unrealized ?? 0)} sub={`${fmtContracts(b.contracts)} at ${usd2(b.basis)} · mark ${usd2(b.mark)} · ${Math.round(b.coverage * 100)}% of the strike`} />
    );

  return (
    <Workspace
      toolbar={
        <Toolbar data-pain-controls>
          <Tag ink={nowInk}>{curve.now >= 0 ? 'buyers in profit' : 'buyers underwater'}</Tag>
          <Tag title="This is today's buyers' P&L at the market's price, not the open interest's payout at expiry.">not max pain</Tag>
          <span className={`${TYPE.label} text-textMuted tnum ml-auto`}>scan {scanAt}</span>
        </Toolbar>
      }
      picture={
        curve.points.length > 1 ? (
          <>
            <div className="h-[180px] shrink-0 flex flex-col" data-pain-curve>
              <Series
                lines={[{ key: 'pnl', points: curve.points.map(p => ({ x: p.spot, y: p.pnl })), ink: nowInk, area: true, width: 1.5 }]}
                zero
                rule={{ x: spot, ink: SPOT, label: `SPOT ${fmtStrike(spot)}` }}
                marks={curve.flipSpot !== null ? [{ x: curve.flipSpot, ink: INK.primary, label: `EVEN ${curve.flipSpot.toFixed(2)}` }] : []}
                fmtX={fmtStrike}
                fmtY={fmtUsd}
                onHover={(x, v) => setCurveAt(x === null || v.pnl === null || v.pnl === undefined ? null : { spot: x, pnl: v.pnl })}
                ariaLabel={`Today's buyers' P&L if spot were anywhere from ${fmtStrike(curve.points[0].spot)} to ${fmtStrike(curve.points[curve.points.length - 1].spot)}. At ${fmtStrike(spot)} they are ${fmtUsd(curve.now)}.`}
              />
            </div>
            <Legend className="py-1" items={[{ ink: LONG_GAMMA, label: 'in profit' }, { ink: SHORT_GAMMA, label: 'underwater' }, { ink: SPOT, label: 'spot' }, { ink: INK.primary, label: 'break-even', dashed: true }, { ink: CALL_WALL, label: 'call buyers even', dashed: true }, { ink: PUT_WALL, label: 'put buyers even', dashed: true }]} />
            <StrikeProfile
              fitAround={spot}
              onFit={setFitN}
              rows={rows}
              series={[{ key: 'pnl', label: 'P&L at the market', ink: 'sign' }]}
              maxAbs={maxAbs}
              levels={levels}
              fmt={v => (Math.abs(v) < 1 ? '' : fmtUsd(v))}
              figures
              hoverStrike={hover}
              onHover={setHover}
              selectedStrike={picked}
              onSelect={s => setPicked(p => (p === s ? null : s))}
              ariaLabel={`Today's buyers' P&L strike by strike, the ${drawn.length} strikes nearest spot — as many as the box holds. Contracts behind each strike in the right gutter.`}
            />
          </>
        ) : (
          <DataState kind="empty" title="No aggressive buying on the tape yet" body="The curve needs at least one strike where someone paid up today." pad="lg" />
        )
      }
      inspector={
        <>
          <Group title="At the market" data-group="market">
            <Stat label="Buyers' P&L" value={fmtUsd(curve.now)} ink={nowInk} sub={`at ${fmtStrike(spot)}, now`} />
            <Stat label="Break even" value={curve.flipSpot === null ? '—' : curve.flipSpot.toFixed(2)} sub={curve.flipSpot === null ? 'nowhere on the chain' : `${dist(curve.flipSpot)} from here`} data-break-even />
            <Stat label="Contracts" value={fmtContracts(curve.contracts)} sub={`${curve.legs.length} strike populations`} />
            {pins && pins.maxPain !== null && <Stat label="Max pain" value={fmtStrike(pins.maxPain)} sub="the open interest's payout minimum — a different question" />}
            {curveAt && <Stat label={`If spot were ${fmtStrike(curveAt.spot)}`} value={fmtUsd(curveAt.pnl)} ink={signInk(curveAt.pnl)} data-curve-at />}
          </Group>
          <Group title="Where they got in" data-basis-bands>
            {(
              [
                { label: 'Open calls', ink: CALL_WALL, b: bands.call },
                { label: 'Open puts', ink: PUT_WALL, b: bands.put },
              ] as const
            ).map(x => (
              <Stat key={x.label} label={<span style={{ color: x.ink }}>{x.label}</span>} value={usd2(x.b.basis)} sub={`${fmtContracts(x.b.contracts)} contracts${x.b.breakevenSpot !== null ? ` · even at ${x.b.breakevenSpot.toFixed(2)}` : x.b.contracts ? ' · no spot in range flips them' : ''}`} />
            ))}
          </Group>
          <Group title={focus ? `Strike ${fmtStrike(focus.strike)}` : 'Strike'} actions={focus ? <Tag>{dist(focus.strike)}</Tag> : undefined} data-group="strike">
            {focus ? [leg('Calls', CALL_WALL, focus.call), leg('Puts', PUT_WALL, focus.put)] : <Stat label="—" value="point at a row" />}
          </Group>
          <Group title="Tape · last 4 hours" data-group="tape">
            {bars.length > 5 ? (
              <div className="pt-2 flex flex-col">
                <Series lines={[{ key: 'close', points: bars.map(b => ({ x: b.time, y: b.close })), ink: INK.secondary, width: 1 }]} band={band} fmtX={hhmm} fmtY={fmtStrike} height={96} ariaLabel="Price through the last four hours, with the wash between the call and put buyers' break-evens" />
                <span className={`${TYPE.label} tracking-normal normal-case text-textMuted pt-1`}>{band ? `wash: ${band.lo.toFixed(2)} to ${band.hi.toFixed(2)}, between the two break-evens` : 'no wash — one side has no break-even in range'}</span>
              </div>
            ) : (
              <Stat label="—" value="no bars yet" />
            )}
          </Group>
        </>
      }
      strip={
        <>
          <Figure label="Buyers now" value={fmtUsd(curve.now)} ink={nowInk} sub={`at ${fmtStrike(spot)}`} size="lead" />
          <Figure label="Break even" value={curve.flipSpot === null ? '—' : curve.flipSpot.toFixed(2)} sub={curve.flipSpot === null ? 'nowhere on the chain' : dist(curve.flipSpot)} />
          <Figure label="Contracts" value={fmtContracts(curve.contracts)} />
          {pins && pins.maxPain !== null && <Figure label="Max pain" value={fmtStrike(pins.maxPain)} />}
          <Read>{painWords(curve, spot)}</Read>
        </>
      }
    />
  );
};

export default Pain;
