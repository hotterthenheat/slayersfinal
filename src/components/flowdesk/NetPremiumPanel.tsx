import { useMemo, useState } from 'react';
import { ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts';
import { buildNetPremium } from '../../data/netpremium';
import { fmtUsd } from '../../data/gex';
import { ChartTip, TipHead, TipSeries, TipRow, TipNote } from '../charts/ChartTip';
import { GRID, CURSOR, chartMargin, valueAxisLeft, categoryAxis, axisUsd, REF_LINE } from '../charts/chartTheme';
import { BULL, BEAR, SHORT_GAMMA } from '../gex/palette';

/*
  Net Premium tide — cumulative net call premium (green) vs net put premium
  (red) through the session, with price (gold) on its own scale. The
  "who is paying up" read next to the tape. On recharts, house chart theme.

  The premium axis is symmetric and zero-anchored on purpose: "above the line"
  and "below the line" are the whole point of the panel, and an auto-scaled axis
  would put $0 wherever the data happened to land.
*/

interface NetPremiumPanelProps {
  ticker: string;
  revision: number;
}

interface Row {
  i: number;
  time: number;
  clock: string;
  call: number;
  put: number;
  net: number;
  price: number;
}

const NetPremiumPanel = ({ ticker, revision }: NetPremiumPanelProps) => {
  const view = useMemo(
    () => buildNetPremium(ticker),
    // session tide advances on the scan revision
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ticker, revision]
  );
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const rows: Row[] = useMemo(() => {
    if (!view) return [];
    return view.points.map((p, i) => {
      const d = new Date(p.time * 1000);
      return {
        i,
        time: p.time,
        clock: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
        call: p.call,
        put: p.put,
        net: p.call + p.put,
        price: p.price,
      };
    });
  }, [view]);

  if (!view || rows.length < 2) {
    return (
      <div className="h-full flex items-center justify-center font-mono text-label text-textMuted uppercase tracking-widest">
        Awaiting session flow…
      </div>
    );
  }

  const { maxAbs } = view;
  const n = rows.length;
  // The header row reads the hovered point, falling back to the latest — so the
  // panel always shows a live value even before the pointer arrives.
  const at = rows[hoverIdx != null ? Math.max(0, Math.min(n - 1, hoverIdx)) : n - 1];
  const prices = rows.map(r => r.price);
  const pLo = Math.min(...prices);
  const pHi = Math.max(...prices);
  const xTicks = n > 1 ? [0, Math.round((n - 1) / 3), Math.round(((n - 1) * 2) / 3), n - 1] : [0];

  return (
    <div className="h-full min-h-0 p-2 flex flex-col gap-1.5">
      {/* Legend + live/hover readout */}
      <div className="flex items-center gap-3 px-1 flex-wrap font-mono text-micro select-none">
        <span className="flex items-center gap-1.5 text-textSecondary">
          <span className="inline-block w-2.5 h-0.5 rounded-full bg-bull" /> Net call prem
          <span className={`tnum font-semibold ${at.call >= 0 ? 'text-bull' : 'text-bear'}`}>{fmtUsd(at.call)}</span>
        </span>
        {/* Deliberately not ChartLegend: every key here carries a live value,
            so this is a cursor read-out row that happens to be colour-keyed. */}
        <span className="flex items-center gap-1.5 text-textSecondary">
          <span className="inline-block w-2.5 h-0.5 rounded-full bg-bear" /> Net put prem
          <span className={`tnum font-semibold ${at.put >= 0 ? 'text-bear' : 'text-bull'}`}>{fmtUsd(at.put)}</span>
        </span>
        <span className="flex items-center gap-1.5 text-textSecondary">
          <span className="inline-block w-2.5 h-0.5 rounded-full" style={{ background: SHORT_GAMMA }} /> Price
          <span className="tnum font-semibold text-textPrimary">{at.price.toFixed(2)}</span>
        </span>
        {/* the "who is paying up" number — calls minus the put drag */}
        <span className="flex items-center gap-1.5 text-textSecondary">
          Net
          <span className={`tnum font-semibold ${at.net >= 0 ? 'text-bull' : 'text-bear'}`}>{fmtUsd(at.net)}</span>
        </span>
        <span className="ml-auto text-textMuted tnum">{at.clock}</span>
      </div>

      <div
        className="flex-grow min-h-0 border border-borderSubtle bg-inset rounded-md overflow-hidden"
        role="img"
        aria-label={`${ticker} net call versus net put premium through the session, closing at ${fmtUsd(at.call)} calls against ${fmtUsd(at.put)} puts, with the underlying at ${at.price.toFixed(2)}.`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={rows}
            margin={chartMargin}
            onMouseMove={s => {
              // recharts 3 widens activeTooltipIndex to number | TooltipIndex |
              // null, so coerce rather than assume the numeric branch.
              const raw = s?.activeTooltipIndex;
              const idx = typeof raw === 'number' ? raw : raw != null ? Number(raw) : NaN;
              setHoverIdx(Number.isFinite(idx) ? idx : null);
            }}
            onMouseLeave={() => setHoverIdx(null)}
          >
            <CartesianGrid stroke={GRID} />
            <XAxis
              {...categoryAxis}
              type="number"
              dataKey="i"
              domain={[0, n - 1]}
              ticks={xTicks}
              tickFormatter={(x: number) => rows[Math.round(x)]?.clock ?? ''}
            />
            <YAxis
              {...valueAxisLeft}
              yAxisId="prem"
              domain={[-maxAbs, maxAbs]}
              ticks={[-maxAbs, -maxAbs / 2, 0, maxAbs / 2, maxAbs]}
              tickFormatter={(v: number) => (Math.abs(v) < maxAbs * 0.01 ? '$0' : axisUsd(v))}
              width={54}
            />
            <YAxis
              yAxisId="px"
              orientation="right"
              domain={[pLo, pHi]}
              tickFormatter={(v: number) => v.toFixed(0)}
              tick={{ fill: SHORT_GAMMA, fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}
              tickLine={false}
              axisLine={false}
              width={42}
            />
            <ReferenceLine yAxisId="prem" y={0} stroke={REF_LINE} strokeDasharray="3 4" />
            <Tooltip
              cursor={CURSOR}
              content={
                <ChartTip<Row>
                  render={r => (
                    <>
                      <TipHead sub={r.clock}>{ticker} premium tide</TipHead>
                      <TipSeries color={BULL} label="Net call" value={fmtUsd(r.call)} />
                      <TipSeries color={BEAR} label="Net put" value={fmtUsd(r.put)} />
                      <TipRow label="Net" value={fmtUsd(r.net)} tone={r.net >= 0 ? 'text-bull' : 'text-bear'} />
                      <TipSeries color={SHORT_GAMMA} label="Underlying" value={r.price.toFixed(2)} />
                      <TipNote>
                        {Math.abs(r.net) < maxAbs * 0.02
                          ? 'Call and put premium are balanced here — nobody is paying up on either side.'
                          : `By this point ${r.net > 0 ? 'call' : 'put'} buyers had paid up by ${fmtUsd(Math.abs(r.net))} net. Premium is what somebody actually spent, so it leans harder than a contract count.`}
                      </TipNote>
                    </>
                  )}
                />
              }
            />
            {/* Price sits under the premium lines — it is context, not the subject. */}
            <Line yAxisId="px" type="monotone" dataKey="price" stroke={SHORT_GAMMA} strokeOpacity={0.75} strokeWidth={1.2} dot={false} isAnimationActive={false} />
            <Line yAxisId="prem" type="monotone" dataKey="call" stroke={BULL} strokeWidth={1.6} dot={false} activeDot={{ r: 3, fill: BULL, stroke: 'none' }} isAnimationActive={false} />
            <Line yAxisId="prem" type="monotone" dataKey="put" stroke={BEAR} strokeWidth={1.6} dot={false} activeDot={{ r: 3, fill: BEAR, stroke: 'none' }} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default NetPremiumPanel;
