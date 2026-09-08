import { useMemo, useState } from 'react';
import Simulator from '../../core/simulator';
import { RTH_MINUTES } from '../../core/calendar';
import { buildVannaCharm } from '../../data/vannacharm';
import { buildCharmClock, charmClockWords } from '../../data/charmClock';
import { readSessionClock } from '../../data/moc';
import { buildExposureProfile } from '../../data/exposure';
import { buildNetGexSeries } from '../../data/gexSeries';
import { GREEK_LENSES, LENS_META, buildGreekSurface, surfaceWords, type GreekLens } from '../../data/greekSurfaces';
import { fmtDistance, impliedDaySigma, sessionAtr, type DistanceScales } from '../../data/atr';
import { useDistanceUnit } from '../../data/distanceUnits';
import { fmtUsd } from '../../data/gex';
import { readFlip } from '../../core/walls';
import type { IvShift, KeyLevelKind, ShiftMode } from '../../types/gex';
import DataState from '../../components/ui/DataState';
import { DeskLoading, Divider, Figure, Group, Read, Segmented, Stat, TYPE, Toolbar, Workspace } from '../../components/pinpoint/Desk';
import StrikeProfile, { type ProfileLevel, type ProfileRow, type ProfileSeries } from '../../components/pinpoint/StrikeProfile';
import Series from '../../components/pinpoint/Series';
import { useScanSnapshot } from '../../components/pinpoint/useScanSnapshot';
import { CALL_WALL, FLIP, INK, LONG_GAMMA, PUT_WALL, SHORT_GAMMA, SPOT, fmtStrike } from '../../components/pinpoint/ink';

/*
  DRIFT — where the levels go as vol moves and time passes. The picture is
  the book now (bright) over the book under the scenario (dim), with the
  levels drawn twice: solid now, dashed then. Vanna, charm and the second-
  order greeks are lenses on the same bars.
*/

const MODE_OPTIONS = [{ value: 'CHARM', label: 'Charm · into the close' }, { value: 'VANNA', label: 'Vanna · vol shift' }] as const;
const IV_OPTIONS = [{ value: '-2', label: '−2' }, { value: '-1', label: '−1' }, { value: '1', label: '+1' }, { value: '2', label: '+2' }] as const;
type Picture = 'migration' | 'vanna' | 'charm' | 'second';
const PICTURE_OPTIONS = [{ value: 'migration', label: 'Now → then' }, { value: 'vanna', label: 'Vanna' }, { value: 'charm', label: 'Charm' }, { value: 'second', label: 'Second order' }] as const;
const LENS_OPTIONS = GREEK_LENSES.map(l => ({ value: l, label: LENS_META[l].label, title: `${LENS_META[l].label} — ${LENS_META[l].unit}` }));
const KIND_INK: Record<KeyLevelKind, string> = { 'call-wall': CALL_WALL, 'put-wall': PUT_WALL, flip: FLIP, supreme: INK.primary, pin: INK.secondary, spot: SPOT };
const hhmm = (t: number) => {
  const d = new Date(t * 1000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const plain = (v: number) => `${v < 0 ? '−' : ''}${Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

const Drift = () => {
  const { snapshot, scanAt } = useScanSnapshot();
  const unit = useDistanceUnit();
  const [mode, setMode] = useState<ShiftMode>('CHARM');
  const [ivKey, setIvKey] = useState<'-2' | '-1' | '1' | '2'>('-1');
  const [picture, setPicture] = useState<Picture>('migration');
  const [lens, setLens] = useState<GreekLens>('color');
  const [hover, setHover] = useState<number | null>(null);
  const [picked, setPicked] = useState<number | null>(null);

  const hoursToClose = useMemo(() => readSessionClock().secondsToClose / 3600, [scanAt]);
  const view = useMemo(() => (snapshot ? buildVannaCharm(snapshot, mode, Number(ivKey) as IvShift, 10, hoursToClose) : null), [snapshot, mode, ivKey, hoursToClose]);
  const clock = useMemo(() => buildCharmClock(RTH_MINUTES - hoursToClose * 60), [hoursToClose]);
  const profile = useMemo(() => (snapshot ? buildExposureProfile(snapshot, 'ALL', 15) : null), [snapshot]);
  const series = useMemo(() => (snapshot ? buildNetGexSeries(snapshot.ticker) : null), [snapshot]);
  const iv = snapshot ? (Simulator.TICKERS[snapshot.ticker]?.iv ?? 0.2) : 0.2;
  const surface = useMemo(() => (snapshot ? buildGreekSurface(snapshot.chain, snapshot.spot, iv, lens) : null), [snapshot, iv, lens]);
  const scales = useMemo<DistanceScales>(() => (snapshot ? { atr: sessionAtr(Simulator.getCandles(snapshot.ticker) ?? []), sigma: impliedDaySigma(snapshot.spot, iv) } : { atr: null, sigma: null }), [snapshot, iv]);

  if (!snapshot || !view || !profile) {
    return (
      <DeskLoading>
        <DataState kind="loading" title="Reading the book" body="The first tick has not arrived yet." />
      </DeskLoading>
    );
  }

  const spot = snapshot.spot;
  const dist = (price: number) => fmtDistance(price - spot, spot, unit, scales);
  const flipMove = view.flipProjected - view.flipCurrent;
  const scenarioWords = mode === 'CHARM' ? (hoursToClose > 0 ? `${hoursToClose.toFixed(1)} hours of delta decay to the bell` : 'the session is over — no charm left to come') : `implied vol ${Number(ivKey) > 0 ? 'up' : 'down'} ${Math.abs(Number(ivKey))} point${Math.abs(Number(ivKey)) === 1 ? '' : 's'}`;
  const flipNow = readFlip(profile.strikes, spot, s => s.gex.net);
  const shiftOf = (kind: KeyLevelKind) => view.shifts.find(s => s.kind === kind);
  const baseLevels: ProfileLevel[] = [
    { kind: 'spot', price: spot, tag: `SPOT ${fmtStrike(spot)}`, ink: SPOT },
    ...(flipNow.strike !== null ? [{ kind: 'flip' as const, price: flipNow.strike, tag: `FLIP ${fmtStrike(flipNow.strike)}`, ink: FLIP, dashed: flipNow.kind !== 'sole' }] : []),
    { kind: 'call-wall', price: profile.levels.callWall, tag: `CW ${fmtStrike(profile.levels.callWall)}`, ink: CALL_WALL },
    { kind: 'put-wall', price: profile.levels.putWall, tag: `PW ${fmtStrike(profile.levels.putWall)}`, ink: PUT_WALL },
  ];
  const migrationLevels: ProfileLevel[] = [
    { kind: 'spot', price: spot, tag: `SPOT ${fmtStrike(spot)}`, ink: SPOT },
    { kind: 'flip', price: view.flipCurrent, tag: `FLIP ${fmtStrike(view.flipCurrent)}`, ink: FLIP },
    ...(view.flipProjected !== view.flipCurrent ? [{ kind: 'custom' as const, price: view.flipProjected, tag: `→ ${fmtStrike(view.flipProjected)}`, ink: FLIP, dashed: true }] : []),
    ...(['call-wall', 'put-wall'] as const).flatMap(k => {
      const s = shiftOf(k);
      if (!s) return [];
      const tag = k === 'call-wall' ? 'CW' : 'PW';
      return [{ kind: k, price: s.current, tag: `${tag} ${fmtStrike(s.current)}`, ink: KIND_INK[k] }, ...(s.projected !== s.current ? [{ kind: 'custom' as const, price: s.projected, tag: `→ ${fmtStrike(s.projected)}`, ink: KIND_INK[k], dashed: true }] : [])];
    }),
  ];
  const toggle = (s: number) => setPicked(p => (p === s ? null : s));
  const common = { hoverStrike: hover, onHover: setHover, selectedStrike: picked, onSelect: toggle, figures: true } as const;

  let pic: { rows: ProfileRow[]; series: ProfileSeries[]; maxAbs: number; levels: ProfileLevel[]; fmt: (v: number) => string; aria: string };
  if (picture === 'migration') {
    pic = {
      rows: view.rows.map(r => ({ strike: r.strike, values: { now: r.current, then: r.projected }, tag: r.pin ? 'PIN' : undefined })),
      series: [{ key: 'now', label: 'now', ink: 'heat' }, { key: 'then', label: 'then', ink: 'heat', weight: 'thin' }],
      maxAbs: view.maxAbs,
      levels: migrationLevels,
      fmt: fmtUsd,
      aria: `Net gamma by strike now (bright) and under ${scenarioWords} (dim). Flip ${fmtStrike(view.flipCurrent)} → ${fmtStrike(view.flipProjected)}.`,
    };
  } else if (picture === 'second' && surface) {
    const f = readFlip(surface.rows, spot, r => r.net);
    pic = {
      rows: surface.rows.map(r => ({ strike: r.strike, values: { v: r.net } })),
      series: [{ key: 'v', label: LENS_META[lens].label, ink: 'heat' }],
      maxAbs: surface.maxAbs,
      levels: [{ kind: 'spot', price: spot, tag: `SPOT ${fmtStrike(spot)}`, ink: SPOT }, ...(f.strike !== null ? [{ kind: 'flip' as const, price: f.strike, tag: `≈0 ${fmtStrike(f.strike)}`, ink: FLIP, dashed: true }] : [])],
      fmt: plain,
      aria: `${LENS_META[lens].label} by strike, ${LENS_META[lens].unit}.`,
    };
  } else {
    const g = picture === 'vanna' ? 'vanna' : 'charm';
    pic = {
      rows: profile.strikes.map(s => ({ strike: s.strike, values: { v: s[g].net } })),
      series: [{ key: 'v', label: g, ink: 'heat' }],
      maxAbs: profile.maxAbs[g],
      levels: baseLevels,
      fmt: fmtUsd,
      aria: `${g === 'vanna' ? 'Vanna, dollars per vol point' : 'Charm, dollars per calendar day'} by strike.`,
    };
  }
  const last = series?.points[series.points.length - 1];

  return (
    <Workspace
      toolbar={
        <Toolbar data-drift-controls>
          <Segmented ariaLabel="Scenario" options={MODE_OPTIONS} value={mode} onChange={setMode} />
          {mode === 'VANNA' && <Segmented ariaLabel="IV shift" options={IV_OPTIONS} value={ivKey} onChange={setIvKey} />}
          <Divider />
          <Segmented ariaLabel="Picture" options={PICTURE_OPTIONS} value={picture} onChange={setPicture} />
          {picture === 'second' && <Segmented ariaLabel="Greek lens" options={LENS_OPTIONS} value={lens} onChange={setLens} />}
          <span className={`${TYPE.label} text-textMuted tnum ml-auto`}>scan {scanAt}</span>
        </Toolbar>
      }
      picture={<StrikeProfile rows={pic.rows} series={pic.series} maxAbs={pic.maxAbs} levels={pic.levels} fmt={pic.fmt} {...common} ariaLabel={pic.aria} />}
      inspector={
        <>
          <Group title="Levels, now → then" data-group="shifts">
            <ul className="flex flex-col" data-level-shifts>
              {view.shifts.map(s => {
                const d = s.projected - s.current;
                return (
                  <li key={s.label}>
                    <Stat label={<span style={{ color: KIND_INK[s.kind] }}>{s.label}</span>} value={`${fmtStrike(s.current)} → ${fmtStrike(s.projected)}`} sub={d === 0 ? 'holds' : `${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(2)}`} ink={d === 0 ? undefined : KIND_INK[s.kind]} />
                  </li>
                );
              })}
            </ul>
          </Group>
          <Group title="Charm clock" data-group="charm-clock">
            <Stat label="Charm paid" value={`${Math.round(clock.realizedShare * 100)}%`} sub="of today’s delta decay" />
            <Stat label="Clock run" value={`${Math.round(clock.clockShare * 100)}%`} sub={`${Math.round(clock.remaining)} min to the bell`} />
            <div className="relative h-[5px] my-1 bg-white/[0.06] overflow-hidden" aria-hidden>
              <span className="absolute inset-y-0 left-0" style={{ width: `${clock.realizedShare * 100}%`, background: INK.secondary }} />
              <span className="absolute inset-y-0 w-px bg-white/70" style={{ left: `${clock.clockShare * 100}%` }} />
            </div>
            <p className={`${TYPE.label} tracking-normal normal-case text-textMuted`}>{charmClockWords(clock)}</p>
          </Group>
          <Group title="Read" data-group="read">
            <Stat label="Flip" value={fmtStrike(view.read.flip.price)} ink={FLIP} sub={`${view.read.flip.distPct > 0 ? '+' : ''}${view.read.flip.distPct.toFixed(2)}% from spot`} />
            <Stat label="Charm concentrates at" value={fmtStrike(view.read.charm.price)} sub={`${view.read.charm.distPct > 0 ? '+' : ''}${view.read.charm.distPct.toFixed(2)}%`} />
            <Stat label="Call wall" value={fmtStrike(view.read.callWall.price)} ink={CALL_WALL} sub={`${view.read.callWall.distPct > 0 ? '+' : ''}${view.read.callWall.distPct.toFixed(2)}%`} />
            <Stat label="Put wall" value={fmtStrike(view.read.putWall.price)} ink={PUT_WALL} sub={`${view.read.putWall.distPct > 0 ? '+' : ''}${view.read.putWall.distPct.toFixed(2)}%`} />
          </Group>
          <Group title="Vanna · charm" data-group="greeks">
            <Stat label="Net vanna" value={fmtUsd(profile.netVanna)} sub="per vol point — a vol rise hands dealers delta to sell when positive" />
            <Stat label="Net charm" value={fmtUsd(profile.netCharm)} sub="per calendar day — hedging flow with no trade at all" />
            {surface && <Stat label={`Net ${LENS_META[lens].label.toLowerCase()}`} value={plain(surface.net)} sub={`${LENS_META[lens].unit} · ${surfaceWords(surface)}`} data-surface-lens={lens} />}
          </Group>
          {view.drift.length > 1 && (
            <Group title="Walls today" data-group="walls-today">
              <div className="py-1">
                <Series
                  lines={[
                    { key: 'cw', points: view.drift.map(p => ({ x: p.time, y: p.callWall })), ink: CALL_WALL },
                    { key: 'pw', points: view.drift.map(p => ({ x: p.time, y: p.putWall })), ink: PUT_WALL },
                    { key: 'flip', points: view.drift.map(p => ({ x: p.time, y: p.flip })), ink: FLIP, dashed: true },
                    { key: 'spot', points: view.drift.map(p => ({ x: p.time, y: p.spot })), ink: SPOT, width: 1 },
                  ]}
                  fmtX={hhmm}
                  fmtY={v => fmtStrike(Math.round(v))}
                  height={96}
                  ariaLabel="Call wall, put wall, flip and spot through the session"
                />
              </div>
            </Group>
          )}
          {series && series.points.length > 1 && last && (
            <Group title="Net gamma today" data-group="session">
              <div className="py-1">
                <Series lines={[{ key: 'net', points: series.points.map(p => ({ x: p.time, y: p.netGex })), ink: last.netGex > 0 ? SHORT_GAMMA : LONG_GAMMA, area: true }]} zero marks={series.zeroCrossings.map(i => ({ x: series.points[i].time, ink: FLIP }))} fmtX={hhmm} fmtY={v => fmtUsd(v)} height={72} ariaLabel="Net gamma through the session" />
              </div>
              <Stat label="Now" value={fmtUsd(last.netGex)} ink={last.netGex > 0 ? SHORT_GAMMA : LONG_GAMMA} />
              <Stat label="Crossed zero" value={`${series.zeroCrossings.length}×`} ink={FLIP} />
            </Group>
          )}
        </>
      }
      strip={
        <>
          <Figure label="Flip now" value={fmtStrike(view.flipCurrent)} ink={FLIP} sub={dist(view.flipCurrent)} size="lead" />
          <Figure label="Flip then" value={fmtStrike(view.flipProjected)} ink={FLIP} sub={dist(view.flipProjected)} />
          <Figure label="It moves" value={flipMove === 0 ? 'not at all' : `${flipMove > 0 ? '+' : '−'}${Math.abs(flipMove).toFixed(2)}`} ink={flipMove === 0 ? INK.secondary : flipMove > 0 ? LONG_GAMMA : SHORT_GAMMA} sub={flipMove === 0 ? 'the border holds' : flipMove > 0 ? 'the border rises' : 'the border falls'} />
          <Figure label="Biggest change" value={view.read.delta ? fmtStrike(view.read.delta.strike) : '—'} sub={view.read.delta ? `${fmtUsd(view.read.delta.changeUsd)} vs last scan` : 'no history yet'} />
          <Figure label="Scenario" value={mode === 'CHARM' ? 'into the close' : `vol ${Number(ivKey) > 0 ? '+' : ''}${ivKey}`} sub={scenarioWords} size="sm" />
          <Read>{view.read.line}</Read>
        </>
      }
    />
  );
};

export default Drift;
