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
import SegmentedControl from '../../components/ui/SegmentedControl';
import { OiAsOf } from '../../components/ui/AsOf';
import { Bench, Deck, Figure, Legend, Read, Section, TYPE, Tag } from '../../components/pinpoint/Desk';
import ExposureLadder, { type CombRow } from '../../components/pinpoint/ExposureLadder';
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
/* The horizon lens. `ALL` leads because the whole book is the default read
   and every level on the desk is picked from it. */
const SCOPE_OPTIONS: { value: ExposureExpiry; label: string }[] = [
  { value: 'ALL', label: 'All' },
  ...EXPIRY_COLUMNS.map(c => ({ value: c.key, label: c.label })),
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
  /* ±20 rather than ±15. The dense row pays for it: 41 strikes are on the
     grid and 23 in view without scrolling, where the old 29px row put 18 on
     a screen. A heat map whose edges the reader cannot see is a window onto
     a field rather than the field. */
  const [half, setHalf] = useState<StrikeWindow>(20);
  const [hover, setHover] = useState<number | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  /*
    THE EXPIRY IS A LENS NOW, NOT AN AXIS — and that is a measurement, not a
    preference.

    The desk drew strike × expiry as a matrix. Across SPY, QQQ and NVDA at
    ±20, the 0DTE share of a strike's exposure is 31.95% at EVERY strike,
    spread 0.00: the engine scales each expiry by one factor across the whole
    chain, so the second axis was f(strike) × g(expiry) and carried no
    per-strike information at all. Two hundred and forty cells for forty-one
    numbers and one ratio.

    A horizon is still a real thing to ask about — "show me the book that
    expires today" — so it stays, as a control over one picture rather than
    six columns of the same shape.
  */
  const [scope, setScope] = useState<ExposureExpiry>('ALL');

  /*
    THE SIX HORIZONS, FOR THEIR TOTALS.

    How much of the book expires today IS a real fact — it is a book-level
    one, which is why it is a bench of six figures rather than six columns
    of a picture. Memoised on the scan and the window; a metric switch does
    not rebuild them.
  */
  const columns = useMemo(() => {
    if (!snapshot) return null;
    return EXPIRY_COLUMNS.map(c => ({ ...c, profile: buildExposureProfile(snapshot, c.key, half) }));
  }, [snapshot, half]);

  const meta = METRIC_BY_KEY[metric];

  /* The picture's own book — the horizon the reader has asked for. */
  const scoped = useMemo(
    () => (snapshot ? buildExposureProfile(snapshot, scope, half) : null),
    [snapshot, scope, half]
  );

  /*
    THE COMB: five profiles down one strike axis.

    Each column is normalised to its OWN heaviest strike, and that is forced
    rather than chosen — these are dollars per 1% move, dollars of
    underlying, dollars per vol point, delta dollars per vol point and delta
    dollars per day. There is no shared axis they could honestly sit on. So
    the SHAPE is comparable across columns and the magnitude is read off the
    peak each column prints in its header.
  */
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
    const rows = strikes.map(r => ({
      strike: r.strike,
      values: Object.fromEntries(PROFILE_METRICS.map(k => [k, valueAt(r, k, side)])),
    }));
    return { metrics, rows };
  }, [scoped, side]);

  /* The six horizons summed, for the bench. */
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

  if (!snapshot || !columns || !comb || !totals || !scoped || !book) {
    return (
      <Section title="Exposure">
        <DataState kind="loading" title="Building the surface" body="The first scan has not landed yet." />
      </Section>
    );
  }

  const spot = marketData?.spot ?? snapshot.spot;
  const lv = book.levels;

  /*
    THE LEVELS ARE READ OFF THE WHOLE BOOK, never off the horizon the reader
    happens to be looking at. A wall is a wall OF the book; re-picking it per
    scope would walk the wall every time the lens changed, which is exactly
    the drift the engine's own comments warn about.
  */
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

  /*
    DO THE GREEKS AGREE ABOUT WHERE THE BOOK IS?

    The read the comb exists for, said in words as well as drawn — because
    the answer is usually NO and it is not obvious that it should be.
    Measured on SPY: gamma peaks at 500, vanna and charm at 495, delta at
    490, and |delta| against |gamma| across strikes correlates at −0.23.
  */
  const leadPeak = comb.metrics.find(m => m.key === metric)!;
  const agree = comb.metrics.filter(m => m.peakStrike === leadPeak.peakStrike);
  const apart = comb.metrics
    .filter(m => m.key !== metric)
    .reduce((w, m) => Math.max(w, Math.abs(m.peakStrike - leadPeak.peakStrike)), 0);

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
              ariaLabel="Expiry horizon"
              value={scope}
              onChange={v => setScope(v as ExposureExpiry)}
              options={SCOPE_OPTIONS}
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
          THE RAIL LEADS RATHER THAN FILTERS.

          It used to choose WHICH greek the picture drew, so comparing two of
          them meant clicking, remembering a shape, clicking back. The comb
          draws all five at once, so the rail's job is to say which one the
          reader is here for: that column takes full ink and the peak read
          below speaks in its terms. The other four stay visible, because the
          comparison is the whole point of the picture.

          The two this desk cannot draw are still here, greyed, carrying
          their reason on hover — a reader looking for theta exposure gets an
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
          {meta.unit}, across the strikes within ±{half} of spot
          {scope === 'ALL' ? ' on the whole book' : `, on the ${scope} horizon only`}. The strike axis is the one every
          desk in this section uses.
        </Read>
      </Section>

      {/*
        THE PICTURE AND THE STRIKE, SIDE BY SIDE.

        These were two stacked sections with the expiry totals between them,
        so reading one strike meant clicking, scrolling past a bench of six
        figures, reading the stack, and scrolling back to click the next one.
        On a desk whose whole subject is comparing strikes, that is the
        interaction happening four times per question.
      */}
      <Deck
        hero={
          <Section title="Where the book is heavy">
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
              /* Clipped so the reader can see there is a page under the
                 picture — a little over thirty strikes at this row height. */
              className="max-h-[min(64vh,720px)]"
            />

            {/*
              THE READ THE COMB EXISTS FOR, in words as well as ticks.

              The answer is usually that they DISAGREE, and that is not
              obvious — a reader who has only ever seen a gamma profile
              assumes the book has one centre of mass. It has five, and they
              are not in the same place.
            */}
            <Read className="mt-2.5">
              {agree.length === PROFILE_METRICS.length ? (
                <>
                  All five exposures are heaviest at the same strike,{' '}
                  <strong className="text-textPrimary">{fmtStrike(leadPeak.peakStrike)}</strong>. That is unusual and
                  worth a second look: the book is concentrated rather than layered.
                </>
              ) : (
                <>
                  <strong className="text-textPrimary">{meta.label}</strong> is heaviest at{' '}
                  <strong className="text-textPrimary">{fmtStrike(leadPeak.peakStrike)}</strong>
                  {agree.length > 1 && <> — shared with {agree.filter(m => m.key !== metric).map(m => m.label).join(' and ')}</>}
                  . The other exposures peak up to{' '}
                  <strong className="text-textPrimary">{apart.toFixed(apart % 1 === 0 ? 0 : 2)}</strong> points away, so
                  the strike that pins is not the strike the book is leaning on. Each column is scaled to its own peak —
                  they are in five different units and share no axis.
                </>
              )}
            </Read>

            <div className="mt-2 flex items-center gap-x-5 gap-y-1.5 flex-wrap">
              <Legend
                items={[
                  { ink: heatInk.neg, label: 'absorbs · left of the line' },
                  { ink: heatInk.pos, label: 'amplifies · right of it' },
                  { ink: INK.primary, label: 'tick — that column’s heaviest strike' },
                  { ink: SPOT, label: 'the live price' },
                ]}
              />
              <Legend
                items={[
                  { ink: CALL_WALL, label: 'CW · call wall' },
                  { ink: PUT_WALL, label: 'PW · put wall' },
                  { ink: FLIP, label: 'FLIP · gamma flip' },
                ]}
              />
            </div>
            <p className={`${TYPE.body} text-textMuted mt-1.5`}>
              The levels are read off the whole book, never off the horizon in view, so a wall does not walk when the
              lens changes. Open interest is the previous settlement. <OiAsOf />
            </p>
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

      {/*
        THE HORIZON IS A BOOK-LEVEL FACT, so it is a bench of six figures.
        It was six columns of a picture until the second axis was measured
        and found to be one global ratio — see the comb's own file. How much
        of the book expires today is worth knowing; it is just not worth
        forty-one rows of it.
      */}
      <Section title="By expiry" note={`${meta.label} ${SIDE_WORDS[side].toLowerCase()}, summed across every strike in the window`}>
        <Bench cols={3}>
          {EXPIRY_COLUMNS.map(c => (
            <Figure key={c.key} label={c.label} sub={c.note} value={money(totals.get(c.key) ?? 0)} />
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

      <span className="sr-only" data-exposure-metric={metric} data-exposure-side={side} data-exposure-scope={scope}>
        {meta.name}, {SIDE_WORDS[side]}, {comb.rows.length} strikes, {comb.metrics.length} exposures drawn, {scope} horizon
      </span>
    </>
  );
};

export default Exposure;
