import { useMemo, useState } from 'react';
import { buildExposureProfile, STRIKE_WINDOWS, type StrikeWindow } from '../../data/exposure';
import { AVAILABLE_METRICS, METRIC_BY_KEY, PROFILE_METRICS, SIDE_WORDS, WITHHELD_METRICS, isProfileMetric, valueAt, type ExposureSide, type ProfileMetric } from '../../data/exposureLibrary';
import { fmtUsd } from '../../data/gex';
import { fmtContracts } from '../../data/strikeFlow';
import type { ExposureExpiry, StrikeExposure } from '../../types/gex';
import DataState from '../../components/ui/DataState';
import Term from '../../components/ui/Term';
import { Divider, DeskLoading, Figure, Group, Read, Segmented, Select, Stat, TYPE, Tag, Toolbar, Workspace } from '../../components/pinpoint/Desk';
import StrikeProfile, { type ProfileLevel, type ProfileRow, type ProfileSeries } from '../../components/pinpoint/StrikeProfile';
import { useScanSnapshot } from '../../components/pinpoint/useScanSnapshot';
import { useMarketData } from '../../context/MarketDataContext';
import { CALL_WALL, FLIP, PUT_WALL, SPOT, fmtStrike, signInk } from '../../components/pinpoint/ink';

/*
  EXPOSURE — the surface. Five exposures down one strike axis, each scaled
  to its own peak; the one the reader is here for leads. Pick a strike and
  the inspector shows every exposure at it.
*/

const SIDE_OPTIONS = (['net', 'call', 'put', 'abs'] as ExposureSide[]).map(s => ({ value: s, label: SIDE_WORDS[s] }));
const WINDOW_OPTIONS = STRIKE_WINDOWS.map(w => ({ value: String(w), label: `±${w}` }));
const EXPIRIES: { key: ExposureExpiry; note: string }[] = [
  { key: '0DTE', note: 'today' },
  { key: '1D', note: 'tomorrow' },
  { key: '2D', note: '2 sessions' },
  { key: '5D', note: 'the week' },
  { key: '7D', note: 'next week' },
  { key: 'OPEX', note: 'monthly' },
];
const SCOPE_OPTIONS: { value: ExposureExpiry; label: string }[] = [{ value: 'ALL', label: 'All' }, ...EXPIRIES.map(c => ({ value: c.key, label: c.key }))];
const METRIC_OPTIONS = [
  ...AVAILABLE_METRICS.filter(m => isProfileMetric(m.key)).map(m => ({ value: m.key as string, label: m.label, title: `${m.name} — ${m.question}` })),
  ...WITHHELD_METRICS.map(m => ({ value: m.key as string, label: m.label, title: `${m.name} — unavailable. ${m.unavailable}`, disabled: true })),
];
const money = (v: number) => (Math.abs(v) < 1 ? '—' : fmtUsd(v));

const Exposure = () => {
  const { snapshot, scanAt } = useScanSnapshot();
  const { marketData } = useMarketData();
  const [metric, setMetric] = useState<ProfileMetric>('gex');
  const [side, setSide] = useState<ExposureSide>('net');
  const [half, setHalf] = useState<StrikeWindow>(20);
  const [scope, setScope] = useState<ExposureExpiry>('ALL');
  const [hover, setHover] = useState<number | null>(null);
  const [picked, setPicked] = useState<number | null>(null);

  const scoped = useMemo(() => (snapshot ? buildExposureProfile(snapshot, scope, half) : null), [snapshot, scope, half]);
  const book = useMemo(() => (snapshot ? buildExposureProfile(snapshot, 'ALL', half) : null), [snapshot, half]);
  const byExpiry = useMemo(() => {
    if (!snapshot) return null;
    return EXPIRIES.map(c => {
      const p = buildExposureProfile(snapshot, c.key, half);
      let t = 0;
      for (const r of p.strikes) t += valueAt(r, metric, side);
      return { ...c, total: t };
    });
  }, [snapshot, half, metric, side]);
  const comb = useMemo(() => {
    if (!scoped) return null;
    const strikes = [...scoped.strikes].sort((a, b) => b.strike - a.strike);
    const series: ProfileSeries[] = PROFILE_METRICS.map(k => {
      let peak = 0;
      let peakStrike = strikes[0]?.strike ?? 0;
      for (const r of strikes) {
        const v = valueAt(r, k, side);
        if (Math.abs(v) > Math.abs(peak)) {
          peak = v;
          peakStrike = r.strike;
        }
      }
      return { key: k, label: METRIC_BY_KEY[k].label, unit: METRIC_BY_KEY[k].unit, peak, peakStrike };
    });
    const rows: ProfileRow[] = strikes.map(r => ({ strike: r.strike, values: Object.fromEntries(PROFILE_METRICS.map(k => [k, valueAt(r, k, side)])) }));
    return { series, rows };
  }, [scoped, side]);

  if (!snapshot || !scoped || !book || !comb || !byExpiry) {
    return (
      <DeskLoading>
        <DataState kind="loading" title="Building the surface" body="The first scan has not landed yet." />
      </DeskLoading>
    );
  }

  const spot = marketData?.spot ?? snapshot.spot;
  const meta = METRIC_BY_KEY[metric];
  const lv = book.levels;
  const levels: ProfileLevel[] = [
    { kind: 'spot', price: spot, tag: `SPOT ${fmtStrike(spot)}`, ink: SPOT },
    { kind: 'flip', price: lv.flip, tag: `FLIP ${fmtStrike(lv.flip)}`, ink: FLIP, dashed: true },
    { kind: 'call-wall', price: lv.callWall, tag: `CW ${fmtStrike(lv.callWall)}`, ink: CALL_WALL },
    { kind: 'put-wall', price: lv.putWall, tag: `PW ${fmtStrike(lv.putWall)}`, ink: PUT_WALL },
  ];
  const nearest = book.strikes.reduce<StrikeExposure | null>((b, r) => (!b || Math.abs(r.strike - spot) < Math.abs(b.strike - spot) ? r : b), null);
  const focusStrike = hover ?? picked ?? nearest?.strike ?? null;
  const focus = focusStrike !== null ? (book.strikes.find(r => r.strike === focusStrike) ?? null) : null;
  const lead = comb.series.find(s => s.key === metric)!;
  const agree = comb.series.filter(s => s.peakStrike === lead.peakStrike);
  const apart = comb.series.filter(s => s.key !== metric).reduce((w, s) => Math.max(w, Math.abs((s.peakStrike ?? 0) - (lead.peakStrike ?? 0))), 0);
  const bookNet = scoped.strikes.reduce((a, r) => a + valueAt(r, metric, side), 0);

  return (
    <>
      <Workspace
        toolbar={
          <Toolbar data-exposure-controls>
            <Segmented ariaLabel="Exposure" value={metric} onChange={v => isProfileMetric(v) && setMetric(v)} options={METRIC_OPTIONS} />
            <Segmented ariaLabel="Exposure side" value={side} onChange={setSide} options={SIDE_OPTIONS} />
            <Divider />
            <Segmented ariaLabel="Expiry horizon" value={scope} onChange={setScope} options={SCOPE_OPTIONS} />
            <Select ariaLabel="Strike window" value={String(half)} onChange={v => setHalf(Number(v) as StrikeWindow)} options={WINDOW_OPTIONS} />
            <span className={`${TYPE.label} text-textMuted tnum ml-auto`}>scan {scanAt}</span>
          </Toolbar>
        }
        picture={
          <StrikeProfile
            mode="columns"
            rows={comb.rows}
            series={comb.series}
            levels={levels}
            fmt={money}
            figures
            lead={metric}
            hoverStrike={hover}
            onHover={setHover}
            selectedStrike={picked}
            onSelect={s => setPicked(p => (p === s ? null : s))}
            ariaLabel={`${meta.name}, ${SIDE_WORDS[side]}, five exposures across ${comb.rows.length} strikes. Spot ${fmtStrike(spot)}, call wall ${fmtStrike(lv.callWall)}, put wall ${fmtStrike(lv.putWall)}, flip ${fmtStrike(lv.flip)}.`}
          />
        }
        inspector={
          <>
            <Group title={focus ? `Strike ${fmtStrike(focus.strike)}` : 'Strike'} actions={focus ? <Tag>{focus.strike > spot ? 'above' : focus.strike < spot ? 'below' : 'at spot'}</Tag> : undefined} data-group="strike">
              {focus ? (
                <>
                  {PROFILE_METRICS.map(k => (
                    <Stat key={k} label={METRIC_BY_KEY[k].label} value={money(valueAt(focus, k, side))} ink={k === metric ? undefined : undefined} className={k === metric ? 'text-textPrimary' : ''} data-metric={k} />
                  ))}
                  <Stat label="OI" value={fmtContracts(focus.oi)} />
                  <Stat label="Volume" value={fmtContracts(focus.volume)} />
                </>
              ) : (
                <Stat label="—" value="pick a row" />
              )}
            </Group>
            <Group title="Peaks" data-group="peaks">
              {comb.series.map(s => (
                <Stat key={s.key} label={s.label} value={fmtStrike(s.peakStrike ?? 0)} sub={`${money(s.peak ?? 0)} · ${s.unit}`} ink={s.key === metric ? undefined : undefined} className={s.key === metric ? 'font-semibold' : ''} data-peak-of={s.key} />
              ))}
            </Group>
            <Group title={`${meta.name} by expiry`} data-group="by-expiry">
              {byExpiry.map(c => (
                <Stat key={c.key} label={c.key} value={money(c.total)} sub={c.note} ink={signInk(c.total)} />
              ))}
            </Group>
          </>
        }
        strip={
          <>
            <Figure label={<Term k={meta.label === 'GEX' ? 'Net GEX' : meta.label === 'DEX' ? 'Net DEX' : meta.label === 'VEX' ? 'Net VEX' : 'Net GEX'}>{`${meta.label} heaviest at`}</Term>} value={fmtStrike(lead.peakStrike ?? 0)} sub={money(lead.peak ?? 0)} size="lead" />
            <Figure label="Agree" value={`${agree.length} of 5`} sub={agree.length === 5 ? 'one centre of mass' : `others up to ${apart.toFixed(apart % 1 ? 2 : 0)} pts away`} />
            <Figure label={`Book · ${SIDE_WORDS[side].toLowerCase()}`} value={money(bookNet)} ink={signInk(bookNet)} sub={meta.unit} />
            <Figure label="Window" value={`±${half}`} sub={scope === 'ALL' ? 'whole book' : `${scope} only`} />
            <Read>
              {agree.length === 5 ? 'All five exposures peak on one strike — a concentrated book.' : `The strike that pins is not the strike the book leans on: ${meta.label} peaks at ${fmtStrike(lead.peakStrike ?? 0)}, the others up to ${apart.toFixed(apart % 1 ? 2 : 0)} points away.`}
            </Read>
          </>
        }
      />
      <span className="sr-only" data-exposure-metric={metric} data-exposure-side={side} data-exposure-scope={scope}>
        {meta.name}, {SIDE_WORDS[side]}, {comb.rows.length} strikes, {scope} horizon
      </span>
    </>
  );
};

export default Exposure;
