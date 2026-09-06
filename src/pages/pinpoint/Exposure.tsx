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
import { fmtContracts } from '../../data/strikeFlow';
import type { ExposureExpiry, StrikeExposure } from '../../types/gex';
import DataState from '../../components/ui/DataState';
import ProvenanceChip from '../../components/ui/ProvenanceChip';
import SegmentedControl from '../../components/ui/SegmentedControl';
import { OiAsOf } from '../../components/ui/AsOf';
import { Bench, Deck, Figure, Legend, Read, Section, TYPE, Tag } from '../../components/pinpoint/Desk';
import HeatGrid, { type HeatColumn, type HeatRow } from '../../components/pinpoint/HeatGrid';
import { useScanSnapshot } from '../../components/pinpoint/useScanSnapshot';
import { useMarketData } from '../../context/MarketDataContext';
import { CALL_WALL, FLIP, INK, PUT_WALL, SELECT, fmtStrike } from '../../components/pinpoint/ink';

/*
==================================================
  SLAYER TERMINAL - EXPOSURE (pages/pinpoint/Exposure.tsx)
  The surface. Every other desk here is a question asked of it.
==================================================

  ── WHY THIS PAGE EXISTS ──────────────────────────────────────────────────

  Pinpoint had a page per Greek and a page per view of the same Greek.
  Gamma structure was on Levels, the strike × expiry grid was on Heat,
  vanna and charm were on Drift, vega turned up wherever a panel needed it,
  and the higher-order lenses lived inside a panel on Drift. Five desks
  drawing one book.

  That is backwards. The exposure surface is not one of the questions — it
  is the thing every question is asked about. So the surface is the first
  page, the Greek is a VALUE on it rather than a destination, and Levels,
  Targets, Drift and the rest consume the same profile this page draws.

  ── WHAT IS ON IT ─────────────────────────────────────────────────────────

  One matrix: strikes down, expiries across, the selected exposure in the
  cells. The strike axis is the same axis every other desk in this section
  uses, in the same order, so a reader carries one mental picture between
  pages instead of re-orienting on each.

  Beside the metric rail sits the part that matters more than the picture:
  a reader can pick a strike and see EVERY exposure at it at once, with
  where each number came from and what class of claim it is. A terminal
  that shows a number without saying whether it was observed, computed or
  estimated is asking to be trusted on the author's word.

  ── THE WITHHELD METRICS ──────────────────────────────────────────────────

  TEX and RHO appear in the rail, greyed, with the reason. They are named
  rather than absent because a reader who has used another terminal will
  look for theta exposure, and "not here" is a worse answer than "not here,
  and this is why". Neither is fabricated to fill the slot.
*/

const SIDE_OPTIONS: { value: ExposureSide; label: string }[] = (
  ['net', 'call', 'put', 'abs'] as ExposureSide[]
).map(s => ({ value: s, label: SIDE_WORDS[s] }));

const WINDOW_OPTIONS = STRIKE_WINDOWS.map(w => ({ value: String(w), label: `±${w}` }));

/* The columns of the surface. `ALL` is deliberately not a column: it is the
   sum of the others, and a total drawn beside its own parts on one colour
   scale makes every part look small. It is the aggregate row instead. */
const EXPIRY_COLUMNS: { key: ExposureExpiry; label: string; note: string }[] = [
  { key: '0DTE', label: '0DTE', note: 'today' },
  { key: '1D', label: '1D', note: 'tomorrow' },
  { key: '2D', label: '2D', note: '2 sessions' },
  { key: '5D', label: '5D', note: 'the week' },
  { key: '7D', label: '7D', note: 'next week' },
  { key: 'OPEX', label: 'OPEX', note: 'monthly' },
];

/** Signed dollars, on the house formatter, with a zero that reads as zero. */
const money = (v: number) => (Math.abs(v) < 1 ? '—' : fmtUsd(v));

const Exposure = () => {
  const { snapshot } = useScanSnapshot();
  /* The book is scan-tier; the spot line on it is not. A grid whose own spot
     marker disagrees with the masthead six inches above it is the section
     contradicting itself, so the marker rides the live tick. */
  const { marketData } = useMarketData();
  const [metric, setMetric] = useState<ProfileMetric>('gex');
  const [side, setSide] = useState<ExposureSide>('net');
  const [half, setHalf] = useState<StrikeWindow>(15);
  const [hover, setHover] = useState<number | null>(null);
  const [picked, setPicked] = useState<number | null>(null);

  /*
    ONE PROFILE PER EXPIRY COLUMN, off the one engine.

    `buildExposureProfile` answers for a single expiry scope, so the surface
    is six calls rather than a second code path that would drift from it.
    Memoised on the scan and the window — a metric switch does not rebuild
    the book, which is what makes the rail feel instant.
  */
  const columns = useMemo(() => {
    if (!snapshot) return null;
    return EXPIRY_COLUMNS.map(c => ({ ...c, profile: buildExposureProfile(snapshot, c.key, half) }));
  }, [snapshot, half]);

  const meta = METRIC_BY_KEY[metric];

  /* The matrix, and the scale it is drawn on. The scale is per METRIC and
     per SIDE, so switching from net to calls re-normalises rather than
     leaving every cell pale against a net maximum that no leg reaches. */
  const surface = useMemo(() => {
    if (!columns || !snapshot) return null;
    const byStrike = new Map<number, Map<ExposureExpiry, number>>();
    let maxAbs = 1;
    for (const col of columns) {
      for (const row of col.profile.strikes) {
        const v = valueAt(row, metric, side);
        if (!byStrike.has(row.strike)) byStrike.set(row.strike, new Map());
        byStrike.get(row.strike)!.set(col.key, v);
        maxAbs = Math.max(maxAbs, Math.abs(v));
      }
    }
    const strikes = [...byStrike.keys()].sort((a, b) => b - a);
    const totals = new Map<ExposureExpiry, number>();
    for (const col of columns) {
      let t = 0;
      for (const s of strikes) t += byStrike.get(s)?.get(col.key) ?? 0;
      totals.set(col.key, t);
    }
    return { byStrike, strikes, maxAbs, totals };
  }, [columns, snapshot, metric, side]);

  /* Levels come off the ALL-expiry profile, which is the book a wall is a
     wall OF. Reading them from a single column would move the wall every
     time the reader changed expiry scope, which is exactly the drift the
     engine's own comments warn about. */
  const book = useMemo(
    () => (snapshot ? buildExposureProfile(snapshot, 'ALL', half) : null),
    [snapshot, half]
  );

  const rowFor = (strike: number): StrikeExposure | null =>
    book?.strikes.find(r => r.strike === strike) ?? null;

  if (!snapshot || !columns || !surface || !book) {
    return (
      <Section title="Exposure">
        <DataState kind="loading" title="Building the surface" body="The first scan has not landed yet." />
      </Section>
    );
  }

  const spot = marketData?.spot ?? snapshot.spot;
  const lv = book.levels;

  const gridColumns: HeatColumn[] = EXPIRY_COLUMNS.map(c => ({
    key: c.key,
    label: c.label,
    note: c.note,
    /* 0DTE open interest is an estimate until the settlement file lands the
       next morning; the column says so rather than a footnote saying it. */
    estimated: c.key === '0DTE',
  }));

  const gridRows: HeatRow[] = surface.strikes.map(strike => {
    const at = surface.byStrike.get(strike)!;
    const isCall = Math.abs(strike - lv.callWall) < 0.01;
    const isPut = Math.abs(strike - lv.putWall) < 0.01;
    const isFlip = Math.abs(strike - lv.flip) < 0.01;
    return {
      strike,
      ink: isCall ? CALL_WALL : isPut ? PUT_WALL : isFlip ? FLIP : undefined,
      tag: isCall ? 'CW' : isPut ? 'PW' : isFlip ? 'FLIP' : undefined,
      title: `${fmtStrike(strike)} — ${meta.label} ${SIDE_WORDS[side].toLowerCase()} by expiry`,
      cells: EXPIRY_COLUMNS.map(c => ({
        col: c.key,
        value: at.get(c.key) ?? 0,
        estimated: c.key === '0DTE',
        title: `${fmtStrike(strike)} · ${c.label} · ${meta.label} ${SIDE_WORDS[side].toLowerCase()} ${money(at.get(c.key) ?? 0)}`,
      })),
    };
  });

  const inspected = picked !== null ? rowFor(picked) : null;

  return (
    <>
      <Section
        title="Exposure"
        note={`${meta.name} · ${meta.unit}`}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <ProvenanceChip
              sources={['chain', 'exposure']}
              note={`${meta.name}. ${meta.formula}. ${TRUTH_WORDS[meta.truth].note}`}
            />
            <SegmentedControl
              ariaLabel="Strike window"
              value={String(half)}
              onChange={v => setHalf(Number(v) as StrikeWindow)}
              options={WINDOW_OPTIONS}
            />
          </div>
        }
      >
        {/*
          THE RAIL IS THE PAGE'S ONE CONTROL. Every Greek this desk can draw
          is here, and the two it cannot are here too, greyed, carrying their
          reason on hover — a reader looking for theta exposure gets an
          answer rather than an absence.
        */}
        <div className="flex items-center gap-1 flex-wrap border-b border-borderSubtle pb-2.5">
          {AVAILABLE_METRICS.filter(m => isProfileMetric(m.key)).map(m => (
            <button
              key={m.key}
              onClick={() => setMetric(m.key as ProfileMetric)}
              title={`${m.name} — ${m.question}`}
              /* The active metric wears a hairline under it, drawn as a
                 border rather than an inset shadow — same pixel, and the
                 section's own guard is right that a shadow on a desk is how
                 the effects creep back in. Both states carry the border so
                 the rail does not shift height when the choice moves. */
              className={`px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] border-b-2 transition-colors ${
                metric === m.key
                  ? 'text-textPrimary border-textPrimary'
                  : 'text-textMuted border-transparent hover:text-textSecondary'
              }`}
            >
              {m.label}
            </button>
          ))}
          <span className="w-px h-3.5 bg-borderSubtle mx-1.5" />
          {WITHHELD_METRICS.map(m => (
            <button
              key={m.key}
              disabled
              title={`${m.name} — unavailable. ${m.unavailable}`}
              className="px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] border-b-2 border-transparent text-textMuted/40 cursor-not-allowed line-through"
            >
              {m.label}
            </button>
          ))}
          <span className="ml-auto">
            <SegmentedControl
              ariaLabel="Exposure side"
              value={side}
              onChange={v => setSide(v as ExposureSide)}
              options={SIDE_OPTIONS}
            />
          </span>
        </div>

        <Read>
          {meta.question} Drawn as <strong className="text-textPrimary">{SIDE_WORDS[side].toLowerCase()}</strong>, in{' '}
          {meta.unit}, across the strikes within ±{half} of spot and the six expiry scopes the book trades. The strike
          axis is the one every desk in this section uses.
        </Read>
      </Section>

      <Section title="The surface" note="strikes down · expiry across · click a strike to open it">
        <HeatGrid
          columns={gridColumns}
          rows={gridRows}
          maxAbs={surface.maxAbs}
          spot={spot}
          fmt={money}
          hoverStrike={hover}
          onHover={setHover}
          onSelect={s => setPicked(p => (p === s ? null : s))}
          selectedStrike={picked}
          cornerLabel="Strike"
        />
        <Legend
          items={[
            { ink: CALL_WALL, label: 'CW · call wall' },
            { ink: PUT_WALL, label: 'PW · put wall' },
            { ink: FLIP, label: 'FLIP · gamma flip' },
            { ink: INK.muted, label: '0DTE open interest is an estimate until settlement', dashed: true },
          ]}
        />
      </Section>

      <Section title="By expiry" note={`${meta.label} ${SIDE_WORDS[side].toLowerCase()}, summed across the window`}>
        <Bench>
          {EXPIRY_COLUMNS.map(c => (
            <Figure key={c.key} label={c.label} sub={c.note} value={money(surface.totals.get(c.key) ?? 0)} />
          ))}
        </Bench>
      </Section>

      {/*
        THE INSPECTOR — every exposure at one strike, at once.

        This is the part the metric rail exists for. A reader who has found a
        strike on the surface does not want to switch metric five times to
        learn what else is there; they want the stack. The rail chooses what
        the PICTURE is drawn in; the stack is always all of it.
      */}
      <Section
        title={inspected ? `Strike ${fmtStrike(inspected.strike)}` : 'One strike'}
        note={inspected ? 'every exposure at it, and where each came from' : 'pick a strike on the surface'}
      >
        {!inspected ? (
          <DataState
            kind="empty"
            title="No strike open"
            body="Click a row on the surface above. The stack shows every exposure at that strike on the whole book, not just the one the surface is drawn in."
          />
        ) : (
          <Deck
            hero={
              <table className="w-full">
                <tbody>
                  {PROFILE_METRICS.map(k => {
                    const m = METRIC_BY_KEY[k];
                    const v = valueAt(inspected, k, side);
                    return (
                      <tr key={k} className="border-b border-borderSubtle/60 last:border-0">
                        <td className={`${TYPE.label} text-textMuted py-1.5 pr-3 whitespace-nowrap`}>{m.label}</td>
                        <td className={`${TYPE.num} py-1.5 text-right tabular-nums`}>{money(v)}</td>
                        <td className="pl-3 py-1.5">
                          <span className={`${TYPE.body} text-textMuted`}>{m.unit}</span>
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="border-t border-borderMuted">
                    <td className={`${TYPE.label} text-textMuted py-1.5 pr-3`}>OI</td>
                    <td className={`${TYPE.num} py-1.5 text-right tabular-nums`}>{fmtContracts(inspected.oi)}</td>
                    <td className="pl-3 py-1.5">
                      <span className={`${TYPE.body} text-textMuted`}>contracts, previous settlement</span>
                    </td>
                  </tr>
                  <tr>
                    <td className={`${TYPE.label} text-textMuted py-1.5 pr-3`}>Volume</td>
                    <td className={`${TYPE.num} py-1.5 text-right tabular-nums`}>{fmtContracts(inspected.volume)}</td>
                    <td className="pl-3 py-1.5">
                      <span className={`${TYPE.body} text-textMuted`}>contracts, this session</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            }
            rail={
              <div>
            {/*
              PROVENANCE, NOT A FOOTNOTE. Three classes of claim sit in this
              one table and they are not equally strong: the contract counts
              were observed, the Greeks were computed from them, and every
              exposure figure rests on an assumption about which side of each
              contract a dealer is on. A reader is entitled to see that split
              beside the numbers rather than in a help page.
            */}
            <span className={`${TYPE.label} text-textMuted`}>Where these came from</span>
              <dl className="mt-2 flex flex-col gap-2">
                <div>
                  <dt className={`${TYPE.body} text-textSecondary`}>{TRUTH_WORDS.observed.label} — OI, volume</dt>
                  <dd className={`${TYPE.body} text-textMuted mt-0.5`}>
                    Contract counts as the chain reported them. Open interest is the previous settlement, not an
                    intraday figure.{' '}
                    <OiAsOf />
                  </dd>
                </div>
                <div>
                  <dt className={`${TYPE.body} text-textSecondary`}>{TRUTH_WORDS.calculated.label} — the Greeks</dt>
                  <dd className={`${TYPE.body} text-textMuted mt-0.5`}>
                    Gamma, delta, vega, vanna and charm per strike, from the chain through the pricing model. Same
                    inputs, same numbers.
                  </dd>
                </div>
                <div>
                  <dt className={`${TYPE.body} text-textSecondary`}>
                    {TRUTH_WORDS.inferred.label} — every exposure figure above
                  </dt>
                  <dd className={`${TYPE.body} text-textMuted mt-0.5`}>
                    Each one multiplies a Greek by an assumption about which side of the contract a dealer holds.
                    Nobody observes dealer inventory. These are model-estimated dealer exposures, and the model is
                    stated: {meta.formula}.
                  </dd>
                </div>
              </dl>
              </div>
            }
          />
        )}
      </Section>

      <Section title="What the rail cannot draw" note="named rather than absent">
        <div className="flex flex-col gap-2">
          {WITHHELD_METRICS.map(m => (
            <div key={m.key} className="border-b border-borderSubtle/60 last:border-0 pb-2 last:pb-0">
              <span className="flex items-baseline gap-2">
                <span className={`${TYPE.label} text-textSecondary`}>{m.label}</span>
                <span className={`${TYPE.body} text-textMuted`}>{m.name} · {m.unit}</span>
              </span>
              <p className={`${TYPE.body} text-textMuted mt-1`}>{m.unavailable}</p>
            </div>
          ))}
          <p className={`${TYPE.body} text-textMuted`}>
            {EXPOSURE_METRICS.length - WITHHELD_METRICS.length} exposures are drawable on this book;{' '}
            {WITHHELD_METRICS.length} are not, and are listed here rather than dropped from the menu.
          </p>
        </div>
      </Section>

      <span className="sr-only" data-exposure-metric={metric} data-exposure-side={side}>
        {meta.name}, {SIDE_WORDS[side]}, {surface.strikes.length} strikes across {EXPIRY_COLUMNS.length} expiries
      </span>
    </>
  );
};

export default Exposure;
