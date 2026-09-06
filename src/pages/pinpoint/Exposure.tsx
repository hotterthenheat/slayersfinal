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
import { CALL_WALL, FLIP, INK, PUT_WALL, SPOT, fmtStrike } from '../../components/pinpoint/ink';

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

/*
  THE CELL FORMAT IS SHORTER THAN THE FIGURE FORMAT, and that is the point.

  A cell printed "−$494.7K". Seven glyphs of it — the currency mark, the
  decimal, the sign as a full-width minus — are the same on every one of two
  hundred and forty cells, which means they distinguish nothing and cost
  width that the colour needs. The unit is stated once in the section note;
  the cell carries the magnitude and its sign.
*/
const cell = (v: number) => {
  const a = Math.abs(v);
  if (a < 1000) return '·';
  const sign = v < 0 ? '−' : '';
  if (a >= 1e9) return `${sign}${(a / 1e9).toFixed(a >= 1e10 ? 0 : 1)}B`;
  if (a >= 1e6) return `${sign}${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  return `${sign}${Math.round(a / 1e3)}K`;
};

const Exposure = () => {
  const { snapshot } = useScanSnapshot();
  /* The book is scan-tier; the spot line on it is not. A grid whose own spot
     marker disagrees with the masthead six inches above it is the section
     contradicting itself, so the marker rides the live tick. */
  const { marketData } = useMarketData();
  const [metric, setMetric] = useState<ProfileMetric>('gex');
  const [side, setSide] = useState<ExposureSide>('net');
  /* ±20 rather than ±15. The dense row pays for it: 41 strikes are on the
     grid and 23 in view without scrolling, where the old 29px row put 18 on
     a screen. A heat map whose edges the reader cannot see is a window onto
     a field rather than the field. */
  const [half, setHalf] = useState<StrikeWindow>(20);
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
    /* The row's own total, and a scale of its own. Summing the six columns
       rather than re-reading the ALL profile means the bar is literally the
       row a reader is looking at added up — the two cannot disagree. */
    const rowTotals = new Map<number, number>();
    let maxRow = 1;
    for (const s of strikes) {
      const at = byStrike.get(s)!;
      let t = 0;
      for (const col of columns) t += at.get(col.key) ?? 0;
      rowTotals.set(s, t);
      maxRow = Math.max(maxRow, Math.abs(t));
    }
    return { byStrike, strikes, maxAbs, totals, rowTotals, maxRow };
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

  const gridColumns: HeatColumn[] = [
    ...EXPIRY_COLUMNS.map(c => ({
      key: c.key,
      label: c.label,
      note: c.note,
      /* 0DTE open interest is an estimate until the settlement file lands the
         next morning; the column says so rather than a footnote saying it. */
      estimated: c.key === '0DTE',
    })),
    /*
      THE COLUMN THE EYE SCANS.

      Six filled columns rank a cell against every other cell, which is the
      wrong comparison for the question a reader actually arrives with:
      WHICH STRIKES MATTER. That is a per-row question, so it gets a per-row
      drawing — a bar off the centre, on its own scale, wide enough to carry
      the full figure beside it.
    */
    { key: 'BOOK', label: 'Book', note: 'all six', kind: 'bar' as const, width: 150, maxAbs: surface.maxRow },
  ];

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
      cells: [
        ...EXPIRY_COLUMNS.map(c => ({
          col: c.key,
          value: at.get(c.key) ?? 0,
          estimated: c.key === '0DTE',
          title: `${fmtStrike(strike)} · ${c.label} · ${meta.label} ${SIDE_WORDS[side].toLowerCase()} ${money(at.get(c.key) ?? 0)}`,
        })),
        {
          col: 'BOOK',
          value: surface.rowTotals.get(strike) ?? 0,
          text: money(surface.rowTotals.get(strike) ?? 0),
          title: `${fmtStrike(strike)} · the whole book · ${meta.label} ${SIDE_WORDS[side].toLowerCase()} ${money(surface.rowTotals.get(strike) ?? 0)}`,
        },
      ],
    };
  });

  /*
    THE RAIL ALWAYS HAS A STRIKE OPEN.

    It used to sit empty under a "pick a strike on the surface" instruction
    until the reader clicked. That is a third of the screen spent telling
    someone to do the thing the grid already invites by being clickable —
    and it meant the desk's first impression was a picture beside a blank.
    With nothing picked it opens the strike nearest spot, which is the one
    a reader would have clicked first anyway.
  */
  const nearest = book.strikes.reduce<StrikeExposure | null>(
    (best, r) => (!best || Math.abs(r.strike - spot) < Math.abs(best.strike - spot) ? r : best),
    null
  );
  const inspected = (picked !== null ? rowFor(picked) : null) ?? nearest;

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

      {/*
        THE SURFACE AND THE STRIKE, SIDE BY SIDE.

        These were two stacked sections with the expiry totals between them,
        so reading one strike meant clicking the grid, scrolling past a bench
        of six figures, reading the stack, and scrolling back to click the
        next one. On a desk whose whole subject is comparing strikes, that is
        the interaction happening four times per question.

        `Deck` is the section's own answer and it was already in the file, one
        level too deep — used to lay out the inspector's own internals rather
        than the desk. The grid is the hero, the strike is the rail, and the
        rail never empties.
      */}
      <Deck
        hero={
          <Section title="The surface">
            <HeatGrid
              columns={gridColumns}
              rows={gridRows}
              maxAbs={surface.maxAbs}
              spot={spot}
              fmt={cell}
              hoverStrike={hover}
              onHover={setHover}
              onSelect={s => setPicked(p => (p === s ? null : s))}
              selectedStrike={inspected?.strike ?? null}
              cornerLabel="Strike"
              dense
              strikeWidth={78}
              /* Clipped so the reader can see there is a page under the
                 picture. 640px at a 1000px viewport, which measured out at
                 23 strikes before the scroll starts — more than the old
                 unclipped grid put on a screen. */
              className="max-h-[min(64vh,720px)]"
            />
            <Legend
              className="mt-2"
              items={[
                { ink: CALL_WALL, label: 'CW · call wall' },
                { ink: PUT_WALL, label: 'PW · put wall' },
                { ink: FLIP, label: 'FLIP · gamma flip' },
                { ink: SPOT, label: 'the live price' },
                { ink: INK.muted, label: '0DTE open interest is an estimate until settlement', dashed: true },
              ]}
            />
          </Section>
        }
        rail={
          <>
            {/*
              THE STACK — every exposure at one strike, at once.

              This is the part the metric rail exists for. A reader who has
              found a strike does not want to switch metric five times to
              learn what else is there; they want all of it, on the whole
              book, whatever the picture happens to be drawn in.
            */}
            <Section
              title={inspected ? `Strike ${fmtStrike(inspected.strike)}` : 'One strike'}
              note={
                inspected
                  ? picked === null
                    ? 'nearest spot — click a row to change it'
                    : 'every exposure at it, on the whole book'
                  : undefined
              }
              /* Which side of spot, in words. No ink: CALL_WALL and PUT_WALL
                 mean a wall on this desk, and borrowing them for "above" and
                 "below" would be two facts wearing one colour. */
              actions={inspected ? <Tag>{inspected.strike > spot ? 'Above spot' : inspected.strike < spot ? 'Below spot' : 'At spot'}</Tag> : undefined}
            >
              {!inspected ? (
                <DataState kind="empty" title="No strike open" body="Click a row on the surface." />
              ) : (
                <table className="w-full">
                  <tbody>
                    {PROFILE_METRICS.map(k => {
                      const m = METRIC_BY_KEY[k];
                      const v = valueAt(inspected, k, side);
                      return (
                        <tr
                          key={k}
                          className="border-b border-borderSubtle/60 last:border-0"
                          /* The row for the metric the picture is drawn in is
                             the one the reader is cross-checking, so it is
                             marked — with weight, which is the emphasis this
                             section buys everything with. */
                          data-active={k === metric || undefined}
                        >
                          <td className={`${TYPE.label} py-1 pr-3 whitespace-nowrap ${k === metric ? 'text-textPrimary' : 'text-textMuted'}`}>{m.label}</td>
                          <td className={`${TYPE.num} py-1 text-right tabular-nums ${k === metric ? 'text-textPrimary' : 'text-textSecondary'}`}>{money(v)}</td>
                        </tr>
                      );
                    })}
                    <tr className="border-t border-borderMuted">
                      <td className={`${TYPE.label} text-textMuted py-1 pr-3`}>OI</td>
                      <td className={`${TYPE.num} py-1 text-right tabular-nums text-textSecondary`}>{fmtContracts(inspected.oi)}</td>
                    </tr>
                    <tr>
                      <td className={`${TYPE.label} text-textMuted py-1 pr-3`}>Volume</td>
                      <td className={`${TYPE.num} py-1 text-right tabular-nums text-textSecondary`}>{fmtContracts(inspected.volume)}</td>
                    </tr>
                  </tbody>
                </table>
              )}
              <p className={`${TYPE.body} text-textMuted mt-2`}>
                Every figure above is in the metric's own unit — {PROFILE_METRICS.map(k => METRIC_BY_KEY[k].unit).filter((u, i, a) => a.indexOf(u) === i).length} different
                ones — so they rank within a row and never against each other.
              </p>
            </Section>

            {/*
              PROVENANCE, NOT A FOOTNOTE. Three classes of claim sit in that
              one table and they are not equally strong: the contract counts
              were observed, the Greeks were computed from them, and every
              exposure figure rests on an assumption about which side of each
              contract a dealer is on. A reader is entitled to see the split
              beside the numbers rather than in a help page.
            */}
            <Section title="Where these came from">
              <dl className="flex flex-col gap-2">
                <div>
                  <dt className={`${TYPE.body} text-textSecondary`}>{TRUTH_WORDS.observed.label} — OI, volume</dt>
                  <dd className={`${TYPE.body} text-textMuted mt-0.5`}>
                    Contract counts as the chain reported them. Open interest is the previous settlement, not an
                    intraday figure. <OiAsOf />
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
                  <dt className={`${TYPE.body} text-textSecondary`}>{TRUTH_WORDS.inferred.label} — every exposure figure</dt>
                  <dd className={`${TYPE.body} text-textMuted mt-0.5`}>
                    Each one multiplies a Greek by an assumption about which side of the contract a dealer holds.
                    Nobody observes dealer inventory. These are model-estimated dealer exposures, and the model is
                    stated: {meta.formula}.
                  </dd>
                </div>
              </dl>
            </Section>
          </>
        }
      />

      <Section title="By expiry" note={`${meta.label} ${SIDE_WORDS[side].toLowerCase()}, summed across every strike in the window`}>
        <Bench cols={3}>
          {EXPIRY_COLUMNS.map(c => (
            <Figure key={c.key} label={c.label} sub={c.note} value={money(surface.totals.get(c.key) ?? 0)} />
          ))}
        </Bench>
      </Section>

      <Section title="What the rail cannot draw">
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
