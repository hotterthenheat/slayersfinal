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
import { Bench, Deck, Figure, Legend, Pane, Read, Section, TYPE, Tag } from '../../components/pinpoint/Desk';
import Spark from '../../components/pinpoint/Spark';
import { useScanSnapshot } from '../../components/pinpoint/useScanSnapshot';
import { CALL_WALL, INK, LONG_GAMMA, PUT_WALL, SHORT_GAMMA, SPOT, fmtStrike } from '../../components/pinpoint/ink';

/*
==================================================
  SLAYER TERMINAL - PAIN (pages/pinpoint/Pain.tsx)
  Where today's buyers got in — and the spot that flips them.
  Rebuilt from zero, 2026-09-06.
==================================================

  This is the desk the checklist warns must not be mistaken for max pain,
  so the distinction is the first sentence on it and the curve is drawn
  against the market's own price so the reader sees P&L NOW, not payout at
  expiry. The population is today's aggressive buyers — the people who
  paid up — and their basis is read off the tape strike by strike.

  THE HERO is the curve: their unrealized P&L at every spot the chain
  covers, zero drawn, spot drawn, and the FLIP SPOT marked where the
  curve crosses zero nearest the market. THE RAIL is the two bands — where
  all open calls and all open puts got in and the spot that breaks even
  for each — and the ladder under both is the same read strike by strike,
  green for holders in profit and red for holders underwater, because
  money up and money down are the one thing red and green mean
  everywhere on this desk.
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
      <Section title="Pain">
        <DataState kind="loading" title="Reading the tape" body="The first tick has not arrived yet." />
      </Section>
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
    <Section title="What today’s buyers are worth, at every price" note="their unrealized P&L if spot were here — the curve crosses zero at the spot that flips them" className="h-full" bodyClassName="flex flex-col">
      <Read>
        {painWords(curve, spot)}
      </Read>
      {curve.points.length > 1 ? (
        <>
          <div className="mt-3 flex-1 min-h-[220px]">
            <Spark points={curve.points.map(p => ({ x: p.spot, y: p.pnl }))} ink={nowInk} height={220} width={720} marks={[spotIdx, ...(flipIdx >= 0 ? [flipIdx] : [])].filter(i => i >= 0)} markInk={SPOT} ariaLabel="Today's buyers' P&L across spot" />
          </div>
          <div className="mt-1 flex justify-between font-mono text-[10px] tnum text-textMuted">
            <span>{fmtStrike(curve.points[0].spot)}</span>
            <span style={{ color: SPOT }}>spot {fmtStrike(spot)}</span>
            {curve.flipSpot !== null && <span className="text-textPrimary">break-even {curve.flipSpot.toFixed(2)}</span>}
            <span>{fmtStrike(curve.points[curve.points.length - 1].spot)}</span>
          </div>
          <div className="mt-3 border-t border-borderSubtle pt-2.5 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2">
            <Figure label="At the market" value={fmtUsd(curve.now)} ink={nowInk} sub={curve.now >= 0 ? 'today’s buyers are in profit' : 'today’s buyers are underwater'} />
            {/* Called "flip spot" in blue, this read as the GAMMA flip, which is
                a different number on the same screen and owns that blue. It is
                the price at which today's buyers cross zero — so it is named
                that, and it is not an identity, so it takes no hue. */}
            <Figure label="Buyers break even at" value={curve.flipSpot === null ? <span className="text-textMuted">nowhere on the chain</span> : curve.flipSpot.toFixed(2)} sub={curve.flipSpot === null ? 'no spot on this chain turns them' : `${dist(curve.flipSpot)} from here`} />
            <Figure label="Contracts behind it" value={curve.contracts.toLocaleString('en-US')} sub={`${curve.legs.length} strike populations`} />
            {pins && pins.maxPain !== null && <Figure label="Max pain, for contrast" value={fmtStrike(pins.maxPain)} ink={INK.secondary} sub="the open interest’s payout minimum — a different question" />}
          </div>
        </>
      ) : (
        <DataState kind="empty" title="No aggressive buying on the tape yet" body="The curve needs at least one strike where someone paid up today." pad="sm" className="mt-3" />
      )}
    </Section>
  );

  const rail = (
    <>
      <Section title="Where the calls and the puts got in">
        <div className="flex flex-col gap-3" data-basis-bands>
          {(
            [
              { label: 'Open calls', ink: CALL_WALL, b: bands.call },
              { label: 'Open puts', ink: PUT_WALL, b: bands.put },
            ] as const
          ).map(x => (
            <div key={x.label}>
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="font-mono text-[10px] font-bold uppercase tracking-wider" style={{ color: x.ink }}>
                  {x.label}
                </span>
                <span className="font-mono text-[13px] font-bold tnum text-textPrimary">{x.b.basis === null ? '—' : `$${x.b.basis.toFixed(2)}`}</span>
                <span className="font-mono text-[10px] text-textMuted tnum">{x.b.contracts.toLocaleString('en-US')} contracts</span>
                {x.b.breakevenSpot !== null && (
                  <Tag ink={x.ink} title="the spot at which these holders break even">
                    even at {x.b.breakevenSpot.toFixed(2)}
                  </Tag>
                )}
              </div>
              <p className="text-[11px] text-textSecondary leading-snug">{bandWords(x.b, spot)}</p>
            </div>
          ))}
        </div>
      </Section>
      <Section title={focus ? `Strike ${fmtStrike(focus.strike)}` : 'Point at a strike'} note={focus ? 'who bought here today, what they paid, and where they stand' : 'click a row in the ladder to hold it'}>
        {focus ? (
          <div className="flex flex-col gap-2">
            {(
              [
                { label: 'Calls', ink: CALL_WALL, b: focus.call },
                { label: 'Puts', ink: PUT_WALL, b: focus.put },
              ] as const
            ).map(x => (
              <div key={x.label} className="grid grid-cols-[44px_1fr] gap-2 items-baseline">
                <span className="font-mono text-[10px] font-bold uppercase tracking-wider" style={{ color: x.ink }}>
                  {x.label}
                </span>
                {x.b.basis === null ? (
                  <span className="text-[11px] text-textMuted">no aggressive longs today</span>
                ) : (
                  <span className="font-mono text-[11px] tnum text-textPrimary">
                    {x.b.contracts.toLocaleString('en-US')} at ${x.b.basis.toFixed(2)} · mark {x.b.mark === null ? '—' : `$${x.b.mark.toFixed(2)}`} ·{' '}
                    <span style={{ color: (x.b.unrealized ?? 0) >= 0 ? LONG_GAMMA : SHORT_GAMMA }}>{x.b.unrealized === null ? '—' : fmtUsd(x.b.unrealized)}</span>
                    <span className="text-textMuted"> · {Math.round(x.b.coverage * 100)}% of the strike’s premium</span>
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-textMuted leading-relaxed">Green rows are strikes where today’s buyers are in profit at the current price; red rows are underwater. A tape that is mostly red sells into strength to get out.</p>
        )}
      </Section>
      <Section title="Where the bands sit on the tape">
        {bars.length > 5 ? <BasisDrift bars={bars} callBe={bands.call.breakevenSpot} putBe={bands.put.breakevenSpot} /> : <DataState kind="empty" title="No bars yet" pad="sm" />}
      </Section>
    </>
  );

  return (
    <>
      <div className="flex items-center gap-2.5 flex-wrap" data-pain-controls>
        <Legend items={[{ ink: LONG_GAMMA, label: 'holders in profit' }, { ink: SHORT_GAMMA, label: 'holders underwater' }, { ink: SPOT, label: 'spot and break-even' }]} />
        <ProvenanceChip sources={['prints', 'chain', 'carry']} className="ml-auto" note="Basis comes from the print tape; every mark it is measured against is priced through the desk's rate and yield." />
        <span className="font-mono text-[10px] text-textMuted uppercase tracking-widest tnum">scan {scanAt} · 10s</span>
      </div>
      <Deck hero={hero} rail={rail}>
        <Bench cols={1}>
          <Section title="Strike by strike" actions={<span className={`${TYPE.label} text-textMuted`}>the {ladder.length} nearest spot</span>}>
            <Pane className="max-h-[520px] overflow-y-auto max-w-[1100px]">
              <table className="w-full" data-pain-ladder>
                <thead className="sticky top-0 bg-canvas z-10">
                  <tr className="font-mono text-[10px] uppercase tracking-widest text-textMuted">
                    <th className="text-left font-normal px-3 py-1.5 border-b border-borderSubtle">Strike</th>
                    <th className="text-right font-normal px-2 py-1.5 border-b border-borderSubtle">Call basis</th>
                    <th className="text-right font-normal px-2 py-1.5 border-b border-borderSubtle">Put basis</th>
                    <th className="text-left font-normal px-2 py-1.5 border-b border-borderSubtle w-[34%]">P&L at the market</th>
                    <th className="text-right font-normal px-3 py-1.5 border-b border-borderSubtle">Dollars</th>
                  </tr>
                </thead>
                <tbody>
                  {ladder.map((r, i) => {
                    const spotAfter = r.strike >= spot && (ladder[i + 1]?.strike ?? -Infinity) < spot;
                    const ink = r.pnl === null ? INK.muted : r.pnl >= 0 ? LONG_GAMMA : SHORT_GAMMA;
                    return (
                      <tr key={r.strike} onClick={() => setPicked(p => (p === r.strike ? null : r.strike))} className={`cursor-pointer border-b font-mono text-[11px] tnum transition-colors hover:bg-white/[0.03] ${spotAfter ? 'border-b-2' : 'border-borderSubtle/40'} ${picked === r.strike ? 'bg-select/[0.05]' : ''}`} style={spotAfter ? { borderBottomColor: SPOT } : undefined}>
                        <td className="px-3 py-1.5 font-bold text-textPrimary">{fmtStrike(r.strike)} <span className="ml-1.5 font-normal text-[10px] text-textMuted">{dist(r.strike)}</span></td>
                        <td className="px-2 py-1.5 text-right text-textSecondary">{r.call.basis === null ? <span className="text-textMuted/50">—</span> : `$${r.call.basis.toFixed(2)}`}</td>
                        <td className="px-2 py-1.5 text-right text-textSecondary">{r.put.basis === null ? <span className="text-textMuted/50">—</span> : `$${r.put.basis.toFixed(2)}`}</td>
                        <td className="px-2 py-1.5">
                          {r.pnl !== null && (
                            <div className="relative h-[8px] rounded-sm bg-white/[0.05] overflow-hidden">
                              <span className="absolute inset-y-0 left-1/2 w-px bg-white/30" />
                              <span className="absolute inset-y-0 rounded-sm" style={{ background: ink, left: r.pnl >= 0 ? '50%' : `${50 - (Math.abs(r.pnl) / maxAbsPnl) * 50}%`, width: `${(Math.abs(r.pnl) / maxAbsPnl) * 50}%` }} />
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-right font-semibold" style={{ color: ink }}>{r.pnl === null ? '' : fmtUsd(r.pnl)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Pane>
          </Section>
        </Bench>
      </Deck>
    </>
  );
};

export default Pain;
