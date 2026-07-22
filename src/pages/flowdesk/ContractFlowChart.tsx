import { useMemo, useState } from 'react';
import {
  ComposedChart,
  ScatterChart,
  Scatter,
  Line,
  Area,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import { buildContractFlow, flowClock, type ContractRef } from '../../data/contractflow';
import { fmtUsd } from '../../data/gex';

/*
  Contract drilldown rendered on recharts — this contract's
  own flow, not a candlestick of the underlying.
    • Contract Flow — prints as bubbles (time × premium), sized by volume and
      coloured by aggressor (ask green / mid grey / bid red), + running avg line.
    • Net Premium — underlying cumulative net call vs put premium (green/red
      areas) with the underlying price line overlaid.
  Values come from the deterministic contract-flow builder.
*/

const ASK = '#30D158';
const BID = '#FF3B30';
const MID = '#8b8f96';
// neutral price/avg reference line — white ("where the market is"); silver is selection-only
const PRICE_LINE = '#ededed';
const AXIS = '#6b6b6b';
const GRID = 'rgba(255,255,255,0.05)';

const axisTick = { fill: AXIS, fontSize: 10, fontFamily: 'JetBrains Mono, monospace' };
const timeTick = (v: number) => (v <= 0 ? 'Open' : flowClock(v));

const Stat = ({ k, v, tone = 'text-textPrimary' }: { k: string; v: string; tone?: string }) => (
  <span className="whitespace-nowrap font-mono text-[11px] tnum text-textMuted">
    {k}: <span className={`font-semibold ${tone}`}>{v}</span>
  </span>
);

const Box = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded border border-borderMuted bg-panel px-2.5 py-1.5 shadow-lg shadow-black/50 font-mono text-[11px]">{children}</div>
);

interface FlowTip {
  active?: boolean;
  payload?: { payload: { min: number; price: number; size: number; side: string } }[];
}
const FlowTooltip = ({ active, payload }: FlowTip) => {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const c = p.side === 'ASK' ? ASK : p.side === 'BID' ? BID : MID;
  return (
    <Box>
      <div className="text-textMuted">{flowClock(p.min)} ET</div>
      <div className="text-textPrimary">
        ${p.price.toFixed(2)} · <span style={{ color: c }}>{p.side}</span> · {p.size.toLocaleString()}x
      </div>
    </Box>
  );
};

interface NetTip {
  active?: boolean;
  payload?: { payload: { min: number; netCall: number; netPut: number; price: number } }[];
}
const NetTooltip = ({ active, payload }: NetTip) => {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <Box>
      <div className="text-textMuted">{flowClock(p.min)} ET · ${p.price.toFixed(2)}</div>
      <div style={{ color: ASK }}>net call {fmtUsd(p.netCall)}</div>
      <div style={{ color: BID }}>net put {fmtUsd(p.netPut)}</div>
    </Box>
  );
};

const ContractFlowChart = ({ contract }: { contract: ContractRef }) => {
  const cf = useMemo(() => buildContractFlow(contract), [contract]);
  const [showAvg, setShowAvg] = useState(true);
  const [showPrice, setShowPrice] = useState(true);

  const askPts = useMemo(() => cf.points.filter(p => p.side === 'ASK'), [cf]);
  const midPts = useMemo(() => cf.points.filter(p => p.side === 'MID'), [cf]);
  const bidPts = useMemo(() => cf.points.filter(p => p.side === 'BID'), [cf]);

  const avgPrice = cf.avg[cf.avg.length - 1]?.price ?? contract.fill;
  const bullPct = cf.net.bullishPct;
  const premAbs = cf.net.premAbs;
  // symmetric, zero-anchored premium ticks so the axis reads cleanly ($0 at the
  // centre) instead of recharts' auto near-zero tick landing on an odd value
  const premTicks = [-premAbs, -premAbs / 2, 0, premAbs / 2, premAbs];

  return (
    <div className="flex flex-col gap-4">
      {/* ── Contract Flow ── */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[11px] font-semibold uppercase tracking-widest text-textPrimary">Contract Flow</span>
          <span className="font-mono text-[10px] uppercase tracking-wider text-textMuted">1D · 5min</span>
        </div>
        <div className="flex items-center gap-x-3 gap-y-1 flex-wrap">
          <Stat k="Vol" v={contract.volume.toLocaleString()} />
          <Stat k="OI" v={contract.oi.toLocaleString()} />
          <Stat k="Avg" v={`$${avgPrice.toFixed(2)}`} />
          <Stat k="Prem" v={fmtUsd(contract.premium)} />
          <Stat k="OTM" v={`${contract.otmPct.toFixed(1)}%`} />
          <Stat k="Vol/OI" v={contract.volOverOI.toFixed(2)} />
          <Stat k="Multi" v={contract.legs > 1 ? `×${contract.legs}` : '1'} />
        </div>
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
        <div className="inst-surface rounded-md p-1.5">
          <ResponsiveContainer width="100%" height={168}>
            <ScatterChart margin={{ top: 6, right: 6, bottom: 2, left: 0 }}>
              <CartesianGrid stroke={GRID} />
              <XAxis
                type="number"
                dataKey="min"
                domain={[0, 390]}
                ticks={[0, 130, 260, 390]}
                tickFormatter={timeTick}
                tick={axisTick}
                tickLine={false}
                axisLine={{ stroke: GRID }}
              />
              <YAxis
                type="number"
                dataKey="price"
                domain={[cf.priceMin, cf.priceMax]}
                orientation="right"
                width={46}
                tickFormatter={(v: number) => `$${v.toFixed(2)}`}
                tick={axisTick}
                tickLine={false}
                axisLine={false}
              />
              <ZAxis type="number" dataKey="size" range={[24, 440]} />
              <Tooltip content={<FlowTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.15)' }} />
              {showAvg && (
                <Scatter data={cf.avg} line={{ stroke: PRICE_LINE, strokeWidth: 1.5 }} lineType="joint" shape={() => <g />} legendType="none" />
              )}
              <Scatter data={bidPts} fill={BID} fillOpacity={0.85} />
              <Scatter data={midPts} fill={MID} fillOpacity={0.8} />
              <Scatter data={askPts} fill={ASK} fillOpacity={0.85} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Net Premium ── */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[11px] font-semibold uppercase tracking-widest text-textPrimary">Net Premium</span>
          <span className="font-mono text-[10px] uppercase tracking-wider text-textMuted">{contract.ticker} · 1D</span>
        </div>
        <div className="flex items-center gap-x-3 gap-y-1 flex-wrap">
          <Stat k="Prem" v={fmtUsd(cf.net.callBought + cf.net.callSold + cf.net.putBought + cf.net.putSold)} />
          <Stat k="Net" v={fmtUsd(cf.net.netPrem)} tone={cf.net.netPrem >= 0 ? 'text-bull' : 'text-bear'} />
          <Stat k="NCP" v={fmtUsd(cf.net.ncp)} tone="text-bull" />
          <Stat k="NPP" v={fmtUsd(cf.net.npp)} tone="text-bear" />
        </div>
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
        <div className="inst-surface rounded-md p-1.5">
          <ResponsiveContainer width="100%" height={168}>
            <ComposedChart data={cf.net.series} margin={{ top: 6, right: 4, bottom: 2, left: 0 }}>
              <CartesianGrid stroke={GRID} />
              <XAxis
                type="number"
                dataKey="min"
                domain={[0, 390]}
                ticks={[0, 130, 260, 390]}
                tickFormatter={timeTick}
                tick={axisTick}
                tickLine={false}
                axisLine={{ stroke: GRID }}
              />
              <YAxis
                yAxisId="prem"
                domain={[-premAbs, premAbs]}
                ticks={premTicks}
                width={46}
                tickFormatter={(v: number) => (Math.abs(v) < premAbs * 0.01 ? '$0' : fmtUsd(v))}
                tick={axisTick}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                yAxisId="px"
                orientation="right"
                domain={[cf.net.uMin, cf.net.uMax]}
                width={40}
                tickFormatter={(v: number) => `$${v.toFixed(0)}`}
                tick={axisTick}
                tickLine={false}
                axisLine={false}
              />
              <ReferenceLine yAxisId="prem" y={0} stroke="rgba(255,255,255,0.18)" strokeDasharray="3 3" />
              <Tooltip content={<NetTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.15)' }} />
              <Area yAxisId="prem" type="monotone" dataKey="netCall" stroke={ASK} strokeWidth={1.3} fill={ASK} fillOpacity={0.16} isAnimationActive={false} />
              <Area yAxisId="prem" type="monotone" dataKey="netPut" stroke={BID} strokeWidth={1.3} fill={BID} fillOpacity={0.16} isAnimationActive={false} />
              {showPrice && (
                <Line yAxisId="px" type="monotone" dataKey="price" stroke={PRICE_LINE} strokeWidth={1.8} dot={false} isAnimationActive={false} />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default ContractFlowChart;
