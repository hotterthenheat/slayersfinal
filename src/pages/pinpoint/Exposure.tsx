import { useMemo, useState } from 'react';
import { buildExposureProfile, STRIKE_WINDOWS, type StrikeWindow } from '../../data/exposure';
import {
  AVAILABLE_METRICS,
  EXPOSURE_METRICS,
  METRIC_BY_KEY,
  PROFILE_METRICS,
  SIDE_WORDS,
  TRUTH_WORDS,
  WITHHELD_METRICS,
  isProfileMetric,
  valueAt,
  type ExposureSide,
  type ProfileMetric,
} from '../../data/exposureLibrary';
import { fmtUsd } from '../../data/gex';
import { heatInk } from '../../components/gex/heatmap';
import { fmtContracts } from '../../data/strikeFlow';
import type { ExposureExpiry, StrikeExposure } from '../../types/gex';
import DataState from '../../components/ui/DataState';
import ProvenanceChip from '../../components/ui/ProvenanceChip';
import { OiAsOf } from '../../components/ui/AsOf';
import { Deck, DeskLoading, Divider, Figure, Legend, Method, Note, Read, Region, Segmented, Select, Surface, TYPE, Tag, Toolbar } from '../../components/pinpoint/Desk';
import ExposureLadder, { type CombRow } from '../../components/pinpoint/ExposureLadder';
import { useScanSnapshot } from '../../components/pinpoint/useScanSnapshot';
import { useMarketData } from '../../context/MarketDataContext';
import { CALL_WALL, FLIP, INK, PUT_WALL, SPOT, fmtStrike } from '../../components/pinpoint/ink';

/*
==================================================
  SLAYER TERMINAL - EXPOSURE (pages/pinpoint/Exposure.tsx)
  The surface. Every other desk here is a question asked of it.
==================================================

  THE QUESTION: where is the book heavy, on every exposure at once, and
  do the five agree. THE ACTION: pick a strike; the readout beside the
  picture follows.

  The picture is the comb — five profiles down one strike axis, each
  scaled to its own peak (components/pinpoint/ExposureLadder.tsx says
  why the strike × expiry matrix went). The metric the reader is here
  for leads at full ink and the other four recede rather than vanish,
  because the comparison is the whole point.

  WHAT MOVED IN THE REDESIGN. The desk used to open on a region that was
  entirely controls and prose, with the picture in the next box down.
  The metric and the side are the desk's toolbar now; the horizon and
  the window sit on the picture they change. The six expiry totals moved
  from a full-width bench to the rail, beside the strike they qualify,
  and the three provenance paragraphs and the two withheld-metric
  explanations are the desk's Method.
*/

const SIDE_OPTIONS = (['net', 'call', 'put', 'abs'] as ExposureSide[]).map(s => ({ value: s, label: SIDE_WORDS[s] }));
const WINDOW_OPTIONS = STRIKE_WINDOWS.map(w => ({ value: String(w), label: `±${w} strikes` }));

/* The six horizons. `ALL` is not a column: it is the sum of the others. */
const EXPIRY_COLUMNS: { key: ExposureExpiry; label: string; note: string }[] = [
  { key: '0DTE', label: '0DTE', note: 'today' },
  { key: '1D', label: '1D', note: 'tomorrow' },
  { key: '2D', label: '2D', note: '2 sessions' },
  { key: '5D', label: '5D', note: 'the week' },
  { key: '7D', label: '7D', note: 'next week' },
  { key: 'OPEX', label: 'OPEX', note: 'monthly' },
];
const SCOPE_OPTIONS: { value: ExposureExpiry; label: string }[] = [{ value: 'ALL', label: 'All' }, ...EXPIRY_COLUMNS.map(c => ({ value: c.key, label: c.label }))];

/* The metric rail: the five this desk can draw, then the two it cannot,
   named, greyed and carrying their reason — a reader looking for theta
   exposure gets an answer rather than an absence. */
const METRIC_OPTIONS = [
  ...AVAILABLE_METRICS.filter(m => isProfileMetric(m.key)).map(m => ({ value: m.key as string, label: m.label, title: `${m.name} — ${m.question}` })),
  ...WITHHELD_METRICS.map(m => ({ value: m.key as string, label: m.label, title: `${m.name} — unavailable. ${m.unavailable}`, disabled: true })),
];

/** Signed dollars, on the house formatter, with a zero that reads as zero. */
const money = (v: number) => (Math.abs(v) < 1 ? '—' : fmtUsd(v));

const Exposure = () => {
  const { snapshot } = useScanSnapshot();
  /* The book is scan-tier; the spot line on it is not. */
  const { marketData } = useMarketData();
  const [metric, setMetric] = useState<ProfileMetric>('gex');
  const [side, setSide] = useState<ExposureSide>('net');
  const [half, setHalf] = useState<StrikeWindow>(20);
  const [hover, setHover] = useState<number | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  /* The expiry is a lens over one picture, not an axis — measured, the
     second axis carried one global ratio (see the comb). */
  const [scope, setScope] = useState<ExposureExpiry>('ALL');

  const columns = useMemo(() => (snapshot ? EXPIRY_COLUMNS.map(c => ({ ...c, profile: buildExposureProfile(snapshot, c.key, half) })) : null), [snapshot, half]);
  const meta = METRIC_BY_KEY[metric];
  const scoped = useMemo(() => (snapshot ? buildExposureProfile(snapshot, scope, half) : null), [snapshot, scope, half]);

  /* Five profiles, each normalised to its own heaviest strike — forced,
     not chosen: they are in five units and share no axis. */
  const comb = useMemo(() => {
    if (!scoped) return null;
    const strikes = [...scoped.strikes].sort((a, b) => b.strike - a.strike);
    const metrics = PROFILE_METRICS.map(k => {
      let peak = 0;
      let peakStrike = strikes[0]?.strike ?? 0;
      for (const r of strikes) {
        const v = valueAt(r, k, side);
        if (Math.abs(v) > Math.abs(peak)) {
          peak = v;
          peakStrike = r.strike;
        }
      }
      const m = METRIC_BY_KEY[k];
      return { key: k, label: m.label, unit: m.unit, peak, peakStrike };
    });
    const rows = strikes.map(r => ({ strike: r.strike, values: Object.fromEntries(PROFILE_METRICS.map(k => [k, valueAt(r, k, side)])) }));
    return { metrics, rows };
  }, [scoped, side]);

  const totals = useMemo(() => {
    if (!columns) return null;
    const out = new Map<ExposureExpiry, number>();
    for (const col of columns) {
      let t = 0;
      for (const r of col.profile.strikes) t += valueAt(r, metric, side);
      out.set(col.key, t);
    }
    return out;
  }, [columns, metric, side]);

  /* Levels come off the whole book — a wall is a wall OF the book, and
     re-picking it per lens would walk it every time the lens changed. */
  const book = useMemo(() => (snapshot ? buildExposureProfile(snapshot, 'ALL', half) : null), [snapshot, half]);
  const rowFor = (strike: number): StrikeExposure | null => book?.strikes.find(r => r.strike === strike) ?? null;

  if (!snapshot || !columns || !comb || !totals || !scoped || !book) {
    return (
      <DeskLoading>
        <DataState kind="loading" title="Building the surface" body="The first scan has not landed yet." />
      </DeskLoading>
    );
  }

  const spot = marketData?.spot ?? snapshot.spot;
  const lv = book.levels;
  const combRows: CombRow[] = comb.rows.map(r => {
    const isCall = Math.abs(r.strike - lv.callWall) < 0.01;
    const isPut = Math.abs(r.strike - lv.putWall) < 0.01;
    const isFlip = Math.abs(r.strike - lv.flip) < 0.01;
    return {
      ...r,
      ink: isCall ? CALL_WALL : isPut ? PUT_WALL : isFlip ? FLIP : undefined,
      tag: isCall ? 'CW' : isPut ? 'PW' : isFlip ? 'FLIP' : undefined,
      title: `${fmtStrike(r.strike)} — every exposure at this strike, ${SIDE_WORDS[side].toLowerCase()}`,
    };
  });

  /* Do the greeks agree about where the book is? Usually not — measured
     on SPY, gamma peaks at 500, vanna and charm at 495, delta at 490. */
  const leadPeak = comb.metrics.find(m => m.key === metric)!;
  const agree = comb.metrics.filter(m => m.peakStrike === leadPeak.peakStrike);
  const apart = comb.metrics.filter(m => m.key !== metric).reduce((w, m) => Math.max(w, Math.abs(m.peakStrike - leadPeak.peakStrike)), 0);

  /* The rail always has a strike open: nearest spot until the reader picks. */
  const nearest = book.strikes.reduce<StrikeExposure | null>((best, r) => (!best || Math.abs(r.strike - spot) < Math.abs(best.strike - spot) ? r : best), null);
  const inspected = (picked !== null ? rowFor(picked) : null) ?? nearest;
  const units = new Set(PROFILE_METRICS.map(k => METRIC_BY_KEY[k].unit)).size;

  const hero = (
    <Region
      title="Where the book is heavy"
      note={`${meta.name}, ${SIDE_WORDS[side].toLowerCase()}, in ${meta.unit}${scope === 'ALL' ? '' : ` — the ${scope} horizon only`}`}
      actions={
        <>
          <Segmented ariaLabel="Expiry horizon" value={scope} onChange={setScope} options={SCOPE_OPTIONS} />
          <Select ariaLabel="Strike window" value={String(half)} onChange={v => setHalf(Number(v) as StrikeWindow)} options={WINDOW_OPTIONS} />
        </>
      }
    >
      <ExposureLadder
        rows={combRows}
        metrics={comb.metrics}
        lead={metric}
        spot={spot}
        fmt={money}
        hoverStrike={hover}
        onHover={setHover}
        onSelect={s => setPicked(p => (p === s ? null : s))}
        selectedStrike={inspected?.strike ?? null}
        /* Clipped so the reader can see there is a page under the picture. */
        className="max-h-[min(64vh,720px)]"
      />
      <div className="pt-3 flex flex-col gap-2">
        <Read>
          {agree.length === PROFILE_METRICS.length ? (
            <>
              All five exposures are heaviest at the same strike, <strong className="text-textPrimary">{fmtStrike(leadPeak.peakStrike)}</strong>. That is unusual and worth a second
              look: the book is concentrated rather than layered.
            </>
          ) : (
            <>
              <strong className="text-textPrimary">{meta.label}</strong> is heaviest at <strong className="text-textPrimary">{fmtStrike(leadPeak.peakStrike)}</strong>
              {agree.length > 1 && <> — shared with {agree.filter(m => m.key !== metric).map(m => m.label).join(' and ')}</>}. The other exposures peak up to{' '}
              <strong className="text-textPrimary">{apart.toFixed(apart % 1 === 0 ? 0 : 2)}</strong> points away, so the strike that pins is not the strike the book is leaning on.
            </>
          )}
        </Read>
        <div className="flex items-center gap-x-4 gap-y-1 flex-wrap">
          <Legend
            items={[
              { ink: heatInk.neg, label: 'absorbs · left of the line' },
              { ink: heatInk.pos, label: 'amplifies · right of it' },
              { ink: INK.primary, label: 'tick — that column’s heaviest strike' },
              { ink: SPOT, label: 'the live price' },
            ]}
          />
          <Legend items={[{ ink: CALL_WALL, label: 'CW · call wall' }, { ink: PUT_WALL, label: 'PW · put wall' }, { ink: FLIP, label: 'FLIP · gamma flip' }]} />
          <span className="ml-auto">
            <OiAsOf />
          </span>
        </div>
      </div>
    </Region>
  );

  const rail = (
    <>
      {/* The stack — every exposure at one strike, at once, on the whole
          book. This is what the metric rail exists for, and it is the one
          box on the desk because it changes as a unit when the reader
          picks a row. */}
      <Surface
        title={inspected ? `Strike ${fmtStrike(inspected.strike)}` : 'One strike'}
        note={inspected ? (picked === null ? 'nearest spot — pick a row to change it' : 'every exposure, on the whole book') : undefined}
        actions={inspected ? <Tag>{inspected.strike > spot ? 'Above spot' : inspected.strike < spot ? 'Below spot' : 'At spot'}</Tag> : undefined}
      >
        {!inspected ? (
          <DataState kind="empty" title="No strike open" body="Pick a row on the surface." pad="sm" />
        ) : (
          <table className="w-full">
            <tbody>
              {PROFILE_METRICS.map(k => {
                const m = METRIC_BY_KEY[k];
                const on = k === metric;
                return (
                  <tr key={k} className="border-b border-borderSubtle/60" data-active={on || undefined}>
                    <th scope="row" className={`${TYPE.label} py-1 pr-3 text-left font-normal whitespace-nowrap ${on ? 'text-textPrimary' : 'text-textMuted'}`}>
                      {m.label}
                    </th>
                    <td className={`${TYPE.num} py-1 text-right ${on ? 'text-textPrimary' : 'text-textSecondary'}`}>{money(valueAt(inspected, k, side))}</td>
                  </tr>
                );
              })}
              <tr className="border-b border-borderSubtle/60">
                <th scope="row" className={`${TYPE.label} text-textMuted py-1 pr-3 text-left font-normal`}>OI</th>
                <td className={`${TYPE.num} py-1 text-right text-textSecondary`}>{fmtContracts(inspected.oi)}</td>
              </tr>
              <tr>
                <th scope="row" className={`${TYPE.label} text-textMuted py-1 pr-3 text-left font-normal`}>Volume</th>
                <td className={`${TYPE.num} py-1 text-right text-textSecondary`}>{fmtContracts(inspected.volume)}</td>
              </tr>
            </tbody>
          </table>
        )}
        <p className={`${TYPE.body} text-textMuted pt-2`}>{units} different units — the figures rank within a row, never against each other.</p>
      </Surface>

      {/* How much of the book expires when — a book-level fact, so six
          figures rather than six columns of the picture. */}
      <Region title={`${meta.name} by expiry`}>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          {EXPIRY_COLUMNS.map(c => (
            <Figure key={c.key} label={c.label} sub={c.note} value={money(totals.get(c.key) ?? 0)} size="sm" />
          ))}
        </div>
      </Region>
    </>
  );

  return (
    <>
      <Toolbar data-exposure-controls>
        <Segmented ariaLabel="Exposure" value={metric} onChange={v => isProfileMetric(v) && setMetric(v)} options={METRIC_OPTIONS} />
        <Divider />
        <Segmented ariaLabel="Exposure side" value={side} onChange={setSide} options={SIDE_OPTIONS} />
        <ProvenanceChip sources={['chain', 'exposure']} className="ml-auto" note={`${meta.name}. ${meta.formula}. ${TRUTH_WORDS[meta.truth].note}`} />
      </Toolbar>

      <Deck hero={hero} rail={rail}>
        <Method>
          <Note term={`${TRUTH_WORDS.observed.label} — OI, volume`}>
            Contract counts as the chain reported them. Open interest is the previous settlement, not an intraday figure.
          </Note>
          <Note term={`${TRUTH_WORDS.calculated.label} — the Greeks`}>Gamma, delta, vega, vanna and charm per strike, from the chain through the pricing model. Same inputs, same numbers.</Note>
          <Note term={`${TRUTH_WORDS.inferred.label} — every exposure`}>
            Each one multiplies a Greek by an assumption about which side of the contract a dealer holds. Nobody observes dealer inventory. These are model-estimated
            dealer exposures, and the model is stated: {meta.formula}.
          </Note>
          <Note term="The levels">Read off the whole book, never off the horizon in view, so a wall does not walk when the lens changes.</Note>
          {WITHHELD_METRICS.map(m => (
            <Note key={m.key} term={`${m.label} — not drawn`}>
              {m.name}, {m.unit}. {m.unavailable}
            </Note>
          ))}
          <Note term="The scale">
            Each column is scaled to its own heaviest strike and prints that peak in its header. {EXPOSURE_METRICS.length - WITHHELD_METRICS.length} exposures are drawable on
            this book; {WITHHELD_METRICS.length} are named above rather than dropped from the menu.
          </Note>
        </Method>
      </Deck>

      <span className="sr-only" data-exposure-metric={metric} data-exposure-side={side} data-exposure-scope={scope}>
        {meta.name}, {SIDE_WORDS[side]}, {comb.rows.length} strikes, {comb.metrics.length} exposures drawn, {scope} horizon
      </span>
    </>
  );
};

export default Exposure;
