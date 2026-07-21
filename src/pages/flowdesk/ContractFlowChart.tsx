import { useMemo, useState } from 'react';
import { buildContractFlow, flowClock } from '../../data/contractflow';
import { fmtUsd } from '../../data/gex';
import type { FlowPrint } from '../../types/flowdesk';

/*
  Contract drilldown — the Flowseeker-style flow of a single contract, not a
  candlestick of the underlying. Two stacked panels:
    • Contract Flow — this contract's intraday prints (time × premium), each a
      bar sized by volume and coloured by aggressor (ask=green / mid=grey /
      bid=red), with the running average line + a bid/mid/ask ratio bar.
    • Net Premium — the underlying's cumulative net call vs put premium as
      green/red areas, with the underlying price line overlaid.
  All values come from the deterministic contract-flow builder.
*/

const ASK = '#30D158';
const BID = '#FF3B30';
const MID = '#8b8f96';
const PRICE_LINE = '#c7d3e8';

const SESSION = 390;
const fmtVol = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`);

const Stat = ({ k, v, tone = 'text-textPrimary' }: { k: string; v: string; tone?: string }) => (
  <span className="whitespace-nowrap font-mono text-[11px] tnum text-textMuted">
    {k}: <span className={`font-semibold ${tone}`}>{v}</span>
  </span>
);

const ContractFlowChart = ({ print }: { print: FlowPrint }) => {
  const cf = useMemo(() => buildContractFlow(print), [print]);
  const [showAvg, setShowAvg] = useState(true);
  const [showPrice, setShowPrice] = useState(true);

  // ── geometry ──
  const W = 460;
  const H = 150;
  const ML = 6;
  const MR = 44;
  const MT = 8;
  const MB = 18;
  const PW = W - ML - MR;
  const PH = H - MT - MB;
  const xOf = (min: number) => ML + (min / SESSION) * PW;

  // Contract-flow scales (right axis = premium)
  const pY = (p: number) => MT + PH - ((p - cf.priceMin) / (cf.priceMax - cf.priceMin || 1)) * PH;
  const barMaxH = PH * 0.72;
  const avgPath = cf.avg.map((a, i) => `${i === 0 ? 'M' : 'L'}${xOf(a.min).toFixed(1)},${pY(a.price).toFixed(1)}`).join(' ');
  const priceTicks = [cf.priceMax, (cf.priceMax + cf.priceMin) / 2, cf.priceMin];

  // Net-premium scales (left = premium ±, right = underlying price)
  const nY = (v: number) => MT + PH / 2 - (v / (cf.net.premAbs || 1)) * (PH / 2);
  const uY = (u: number) => MT + PH - ((u - cf.net.uMin) / (cf.net.uMax - cf.net.uMin || 1)) * PH;
  const s = cf.net.series;
  const callArea =
    `M${xOf(s[0].min).toFixed(1)},${nY(0).toFixed(1)} ` +
    s.map(n => `L${xOf(n.min).toFixed(1)},${nY(n.netCall).toFixed(1)}`).join(' ') +
    ` L${xOf(s[s.length - 1].min).toFixed(1)},${nY(0).toFixed(1)} Z`;
  const putArea =
    `M${xOf(s[0].min).toFixed(1)},${nY(0).toFixed(1)} ` +
    s.map(n => `L${xOf(n.min).toFixed(1)},${nY(n.netPut).toFixed(1)}`).join(' ') +
    ` L${xOf(s[s.length - 1].min).toFixed(1)},${nY(0).toFixed(1)} Z`;
  const priceLine = s.map((n, i) => `${i === 0 ? 'M' : 'L'}${xOf(n.min).toFixed(1)},${uY(n.price).toFixed(1)}`).join(' ');
  const xTicks = [0, 130, 260, 390];

  const avgPrice = cf.avg[cf.avg.length - 1]?.price ?? print.fill;
  const bullPct = cf.net.bullishPct;

  return (
    <div className="flex flex-col gap-4">
      {/* ── Contract Flow ── */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[11px] font-semibold uppercase tracking-widest text-textPrimary">Contract Flow</span>
          <span className="font-mono text-[10px] uppercase tracking-wider text-textMuted">1D · 5min</span>
        </div>
        <div className="flex items-center gap-x-3 gap-y-1 flex-wrap">
          <Stat k="Vol" v={print.volume.toLocaleString()} />
          <Stat k="OI" v={print.oi.toLocaleString()} />
          <Stat k="Avg" v={`$${avgPrice.toFixed(2)}`} />
          <Stat k="Prem" v={fmtUsd(print.premium)} />
          <Stat k="OTM" v={`${print.otmPct.toFixed(0)}%`} />
          <Stat k="Vol/OI" v={`${print.volOverOI.toFixed(2)}`} />
          <Stat k="Multi" v={print.legs > 1 ? `×${print.legs}` : '1'} />
        </div>

        {/* Contract ratio */}
        <div className="mt-0.5">
          <div className="flex justify-between font-mono text-[10px] tnum text-textMuted mb-1">
            <span>Bid {Math.round(cf.ratio.bid * 100)}%</span>
            <span className="uppercase tracking-widest text-[9px]">Contract Ratio</span>
            <span>Ask {Math.round(cf.ratio.ask * 100)}%</span>
          </div>
          <div className="flex h-[4px] rounded-full overflow-hidden bg-white/[0.06]">
            <span style={{ width: `${cf.ratio.bid * 100}%`, background: BID }} />
            <span style={{ width: `${cf.ratio.mid * 100}%`, background: MID }} />
            <span style={{ width: `${cf.ratio.ask * 100}%`, background: ASK }} />
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 flex-wrap font-mono text-[10px] text-textMuted">
          <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: BID }} /> Bid {cf.count.bid}</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: MID }} /> Mid {cf.count.mid}</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: ASK }} /> Ask {cf.count.ask}</span>
          <button
            onClick={() => setShowAvg(v => !v)}
            className={`ml-auto inline-flex items-center gap-1.5 transition-colors ${showAvg ? 'text-textPrimary' : 'text-textMuted hover:text-textSecondary'}`}
          >
            <span className="w-3 h-[2px] rounded-full" style={{ background: showAvg ? PRICE_LINE : '#555' }} /> Avg
          </button>
        </div>

        {/* Flow chart */}
        <div className="inst-surface rounded-md p-1.5">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 150 }} preserveAspectRatio="none">
            {priceTicks.map((p, i) => (
              <g key={i}>
                <line x1={ML} x2={W - MR} y1={pY(p)} y2={pY(p)} stroke="#fff" strokeOpacity={0.06} />
                <text x={W - MR + 3} y={pY(p) + 3} fontSize={8} fill="#8b8f96" fontFamily="monospace">${p.toFixed(2)}</text>
              </g>
            ))}
            {cf.points.map((pt, i) => {
              const h = Math.max(2.5, (pt.size / cf.volMax) * barMaxH);
              const y = pY(pt.price);
              const c = pt.side === 'ASK' ? ASK : pt.side === 'BID' ? BID : MID;
              return <rect key={i} x={xOf(pt.min) - 1.4} y={y - h / 2} width={2.8} height={h} rx={1} fill={c} opacity={0.9} />;
            })}
            {showAvg && <path d={avgPath} fill="none" stroke={PRICE_LINE} strokeWidth={1.4} strokeOpacity={0.85} />}
            {xTicks.map(t => (
              <text key={t} x={xOf(t)} y={H - 5} fontSize={8} fill="#6b6b6b" fontFamily="monospace" textAnchor={t === 0 ? 'start' : 'middle'}>
                {t === 0 ? 'Open' : flowClock(t)}
              </text>
            ))}
          </svg>
        </div>
      </div>

      {/* ── Net Premium ── */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[11px] font-semibold uppercase tracking-widest text-textPrimary">Net Premium</span>
          <span className="font-mono text-[10px] uppercase tracking-wider text-textMuted">{print.ticker} · 1D</span>
        </div>
        <div className="flex items-center gap-x-3 gap-y-1 flex-wrap">
          <Stat k="Prem" v={fmtUsd(cf.net.callBought + cf.net.callSold + cf.net.putBought + cf.net.putSold)} />
          <Stat k="Net" v={fmtUsd(cf.net.netPrem)} tone={cf.net.netPrem >= 0 ? 'text-bull' : 'text-bear'} />
          <Stat k="NCP" v={fmtUsd(cf.net.ncp)} tone="text-bull" />
          <Stat k="NPP" v={fmtUsd(cf.net.npp)} tone="text-bear" />
        </div>

        {/* Net sentiment */}
        <div className="mt-0.5">
          <div className="flex justify-between font-mono text-[10px] tnum text-textMuted mb-1">
            <span>Bearish {100 - bullPct}%</span>
            <span className="uppercase tracking-widest text-[9px]">Net Sentiment</span>
            <span>Bullish {bullPct}%</span>
          </div>
          <div className="flex h-[4px] rounded-full overflow-hidden bg-white/[0.06]">
            <span style={{ width: `${100 - bullPct}%`, background: BID }} />
            <span style={{ width: `${bullPct}%`, background: ASK }} />
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 flex-wrap font-mono text-[10px] text-textMuted">
          <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: ASK }} /> Call {fmtUsd(cf.net.callBought)}</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: BID }} /> Put {fmtUsd(cf.net.putBought)}</span>
          <button
            onClick={() => setShowPrice(v => !v)}
            className={`ml-auto inline-flex items-center gap-1.5 transition-colors ${showPrice ? 'text-textPrimary' : 'text-textMuted hover:text-textSecondary'}`}
          >
            <span className="w-3 h-[2px] rounded-full" style={{ background: showPrice ? PRICE_LINE : '#555' }} /> Price
          </button>
        </div>

        {/* Net premium chart */}
        <div className="inst-surface rounded-md p-1.5">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 150 }} preserveAspectRatio="none">
            <path d={callArea} fill={ASK} fillOpacity={0.16} />
            <path d={putArea} fill={BID} fillOpacity={0.16} />
            <line x1={ML} x2={W - MR} y1={nY(0)} y2={nY(0)} stroke="#fff" strokeOpacity={0.18} strokeDasharray="3 3" />
            <path d={s.map((n, i) => `${i === 0 ? 'M' : 'L'}${xOf(n.min).toFixed(1)},${nY(n.netCall).toFixed(1)}`).join(' ')} fill="none" stroke={ASK} strokeWidth={1.3} />
            <path d={s.map((n, i) => `${i === 0 ? 'M' : 'L'}${xOf(n.min).toFixed(1)},${nY(n.netPut).toFixed(1)}`).join(' ')} fill="none" stroke={BID} strokeWidth={1.3} />
            {showPrice && <path d={priceLine} fill="none" stroke={PRICE_LINE} strokeWidth={1.6} />}
            {/* left premium axis */}
            <text x={ML} y={nY(cf.net.premAbs) + 7} fontSize={8} fill="#8b8f96" fontFamily="monospace">+{fmtUsd(cf.net.premAbs)}</text>
            <text x={ML} y={nY(-cf.net.premAbs) - 2} fontSize={8} fill="#8b8f96" fontFamily="monospace">−{fmtUsd(cf.net.premAbs)}</text>
            {/* right price axis */}
            <text x={W - MR + 3} y={uY(cf.net.uMax) + 7} fontSize={8} fill="#8b8f96" fontFamily="monospace">${cf.net.uMax.toFixed(0)}</text>
            <text x={W - MR + 3} y={uY(cf.net.uMin) - 1} fontSize={8} fill="#8b8f96" fontFamily="monospace">${cf.net.uMin.toFixed(0)}</text>
            {xTicks.map(t => (
              <text key={t} x={xOf(t)} y={H - 5} fontSize={8} fill="#6b6b6b" fontFamily="monospace" textAnchor={t === 0 ? 'start' : 'middle'}>
                {t === 0 ? 'Open' : flowClock(t)}
              </text>
            ))}
          </svg>
        </div>
      </div>
    </div>
  );
};

export default ContractFlowChart;
