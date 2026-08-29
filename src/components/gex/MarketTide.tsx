import { useMemo, useState } from 'react';
import { ETFS, buildTide, etfTides, sectorTides, tideRead, type Tide } from '../../data/marketTide';
import { RTH_MINUTES } from '../../core/calendar';
import Panel from '../ui/Panel';
import StatCard from '../ui/StatCard';
import SegmentedControl from '../ui/SegmentedControl';
import ProvenanceChip from '../ui/ProvenanceChip';
import { BULL, PUT_WALL } from './palette';

/*
  §10's Market Tide.

  CUMULATIVE, NOT INSTANTANEOUS — a minute's net premium is noise, the day's
  running total is a tide, and a tide that TURNS is the event. The zero line
  is drawn because the crossing is the whole read, and the sentence above the
  chart names the turn rather than leaving a reader to eyeball it.
*/

type Lens = 'market' | 'etf' | 'sector';

const money = (n: number) => `$${(Math.abs(n) / 1e6).toFixed(0)}M`;

const TideChart = ({ tide }: { tide: Tide }) => {
  const pts = tide.points;
  if (pts.length < 2) return null;
  const nets = pts.map(p => p.net);
  const lo = Math.min(0, ...nets), hi = Math.max(0, ...nets);
  const span = hi - lo || 1;
  const y = (v: number) => 100 - ((v - lo) / span) * 100;
  const last = nets[nets.length - 1];
  return (
    <div className="h-32 border border-borderSubtle rounded bg-inset/40">
      <svg viewBox="0 0 390 100" preserveAspectRatio="none" className="w-full h-full" role="img" aria-label={`${tide.label} net premium through the session`}>
        {/* The zero line — the crossing is the read */}
        <line x1="0" x2="390" y1={y(0)} y2={y(0)} stroke="#7d7d7d" strokeWidth="0.4" strokeDasharray="3 3" />
        <polyline
          fill="none"
          stroke={last >= 0 ? BULL : PUT_WALL}
          strokeWidth="1"
          strokeLinejoin="round"
          points={pts.map(p => `${p.min},${y(p.net)}`).join(' ')}
        />
      </svg>
    </div>
  );
};

const MarketTide = () => {
  const [lens, setLens] = useState<Lens>('market');
  const dateIso = new Date().toISOString().slice(0, 10);
  /* Minutes into the cash session, in ET. Before the open the tide has
     nothing to draw, so it shows the first half hour rather than an empty
     frame — the simulator's day is always underway. */
  const elapsed = useMemo(() => {
    const et = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false })
      .formatToParts(new Date());
    const get = (t: string) => Number(et.find(p => p.type === t)?.value ?? 0);
    const mins = get('hour') * 60 + get('minute') - (9 * 60 + 30);
    return Math.min(RTH_MINUTES, Math.max(30, mins));
  }, []);

  const market = useMemo(() => buildTide('MARKET', 'Whole market', dateIso, elapsed), [dateIso, elapsed]);
  const etfs = useMemo(() => etfTides(dateIso, elapsed), [dateIso, elapsed]);
  const sectors = useMemo(() => sectorTides(dateIso, elapsed), [dateIso, elapsed]);

  return (
    <Panel
      title="Market Tide"
      subtitle="Call premium against put premium, cumulative through the session"
      className="w-full"
      actions={
        <div className="flex items-center gap-2">
          <ProvenanceChip sources={['prints']} note="Market-wide premium is modelled on the session's own shape." />
          <SegmentedControl
            ariaLabel="Tide lens"
            value={lens}
            onChange={v => setLens(v as Lens)}
            options={[{ value: 'market', label: 'Market' }, { value: 'etf', label: 'ETFs' }, { value: 'sector', label: 'Sectors' }]}
          />
        </div>
      }
    >
      {lens === 'market' && (
        <div className="flex flex-col gap-3">
          <StatCard
            label="The tide"
            value={market.side === 'FLAT' ? 'LEVEL' : market.side}
            sub={tideRead(market)}
            tone={market.side === 'CALLS' ? 'bull' : market.side === 'PUTS' ? 'bear' : 'neutral'}
          />
          <TideChart tide={market} />
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Call premium" value={money(market.callPrem)} sub={`${market.callSharePct.toFixed(0)}% of the day`} tone="bull" />
            <StatCard label="Put premium" value={money(market.putPrem)} sub={`${(100 - market.callSharePct).toFixed(0)}% of the day`} tone="bear" />
            <StatCard label="Net" value={money(market.net)} sub={market.net >= 0 ? 'into calls' : 'into puts'} tone={market.net >= 0 ? 'bull' : 'bear'} />
          </div>
        </div>
      )}

      {lens !== 'market' && (
        <div className="flex flex-col gap-2">
          {(lens === 'etf' ? etfs : sectors).map(t => (
            <div key={t.key} className="flex items-center gap-3">
              <span className="w-28 shrink-0 font-mono text-[11px] text-textSecondary truncate">{t.label}</span>
              {/* A single bar, centred on parity — length is the lean */}
              <div className="relative flex-1 h-4 bg-white/[0.03] rounded-sm overflow-hidden">
                <div className="absolute inset-y-0 left-1/2 w-px bg-borderSubtle" />
                <div
                  className={`absolute inset-y-0.5 rounded-[1px] ${t.callSharePct >= 50 ? 'bg-bull/70' : 'bg-bear/70'}`}
                  style={
                    t.callSharePct >= 50
                      ? { left: '50%', width: `${Math.min(50, t.callSharePct - 50)}%` }
                      : { right: '50%', width: `${Math.min(50, 50 - t.callSharePct)}%` }
                  }
                />
              </div>
              <span className={`w-20 shrink-0 text-right font-mono text-[11px] ${t.callSharePct >= 50 ? 'text-bull' : 'text-bear'}`}>
                {t.callSharePct.toFixed(0)}% C
              </span>
              <span className="w-16 shrink-0 text-right font-mono text-[10px] text-textMuted">{money(t.net)}</span>
            </div>
          ))}
          <p className="text-[10px] text-textMuted mt-1">
            Bar length is the lean away from an even split; the number is the call share of the day's premium.
          </p>
        </div>
      )}
    </Panel>
  );
};

export default MarketTide;
