import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../components/ui/PageHeader';
import Panel from '../components/ui/Panel';
import Chip from '../components/ui/Chip';
import DataState from '../components/ui/DataState';
import CompanyLogo from '../components/ui/CompanyLogo';
import { insiderFeed, TX_CODES, type TxCode, type PlanState } from '../data/insiderFlow';
import {
  buildCongress,
  congressRead,
  bracketLabel,
  AMOUNT_BRACKETS,
  STOCK_ACT_DEADLINE_DAYS,
  type PtrOwner,
  type Chamber,
} from '../data/congressFlow';
import { fmtUsd } from '../data/gex';

/*
==================================================
  SLAYER TERMINAL - KEYHOLE & DISCLOSURES
==================================================

  Two filing feeds, one per route: what corporate insiders reported to the
  SEC (Keyhole) and what members of Congress reported under the STOCK Act
  (Disclosures). They answer one question from two directions — who with
  privileged sight of a company traded it, and did they tell anyone in time.

  ── FOUR DECISIONS THE REFERENCE PRODUCTS DO NOT MAKE ───────────────────

  1. THE CODE IS THE ROW'S IDENTITY. Most Form 4 filings are not trades.
     A grant, an option conversion and a tax withholding are compensation
     plumbing, and every product in this category renders them in the same
     channel as a chief executive buying with their own money. The feed
     defaults to the open-market pair and everything else is one toggle
     away — present, never mixed in silently.

  2. THE PLAN FLAG HAS THREE STATES. The 10b5-1 checkbox only exists on
     filings from April 2023 onward, so "not a plan" and "we were never
     told" are different facts. Drawn as different facts.

  3. AN AMOUNT IS A BRACKET, DRAWN AS A BRACKET. Congress discloses
     "$15,001 - $50,000". The aggregators invent a midpoint and print it
     like a price. Here the range is a BAR: you see its width, so you see
     the uncertainty, and no number appears that the filing did not carry.

  4. THE LAG IS A COLUMN. Filing late is common — one in seventeen House
     rows misses the 45-day bound — and a feed sorted by disclosure date
     puts a two-year-old trade at the top formatted exactly like this
     morning's. So the gap is drawn on every row, in its own ink.
*/

export type DeskMode = 'insiders' | 'congress';

const WINDOWS = [
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: '180d', days: 180 },
];

/* The two open-market codes lead; the rest are compensation events. */
const MARKET_CODES: TxCode[] = ['P', 'S'];
const COMP_CODES: TxCode[] = ['A', 'M', 'F', 'D', 'G'];

const PLAN_INK: Record<PlanState, string> = {
  plan: 'text-textMuted border-borderSubtle',
  discretionary: 'text-supreme border-supreme/40',
  unknown: 'text-textSecondary border-borderSubtle border-dashed',
};
const PLAN_WORD: Record<PlanState, string> = {
  plan: 'plan',
  discretionary: 'chosen',
  unknown: 'unstated',
};
const PLAN_HINT: Record<PlanState, string> = {
  plan: 'Filed under a Rule 10b5-1 plan — the schedule was adopted months before this printed, so it carries no view on today.',
  discretionary: 'No plan flag on the filing: somebody decided to do this.',
  unknown:
    'The filing carried no 10b5-1 checkbox. It became mandatory only for reports filed from April 2023, so this is genuinely unknown rather than a decision.',
};

const OWNERS: PtrOwner[] = ['Self', 'Spouse', 'Joint', 'Dependent'];
const CHAMBERS: Chamber[] = ['House', 'Senate'];

/* Freshness of a disclosure, in the three tiers a reader actually needs:
   inside a fortnight, inside the statutory bound, past it. */
const lagInk = (lag: number): string =>
  lag > STOCK_ACT_DEADLINE_DAYS ? 'text-bear' : lag > 15 ? 'text-warn' : 'text-textSecondary';

/* THE BRACKET, DRAWN AS A BRACKET.
   Position and width on a log scale of the whole ladder, so a reader sees
   both where the disclosure sits and how wide the band is. The open-ended
   top rung runs to the edge with no right cap — it has no ceiling, and
   drawing one would be the invention this whole model refuses. */
const LADDER_LO = Math.log10(1_001);
const LADDER_HI = Math.log10(50_000_000);
const pos = (v: number) => ((Math.log10(Math.max(1_001, v)) - LADDER_LO) / (LADDER_HI - LADDER_LO)) * 100;

const BracketBar = ({ index }: { index: number | null }) => {
  if (index === null) {
    return (
      <span
        className="font-mono text-[10px] text-textMuted italic"
        title="This filing came through as a scanned document and its amount was never parsed. A missing amount is a fact about the filing, not a gap to fill in."
      >
        not disclosed
      </span>
    );
  }
  const b = AMOUNT_BRACKETS[index];
  const left = pos(b.low);
  const right = b.high === null ? 100 : pos(b.high);
  return (
    <span className="flex items-center gap-2 min-w-0" title={`Disclosed as ${b.label} — column ${b.column} on the form. The filing contains no figure inside this band.`}>
      <span className="relative h-2 w-24 shrink-0 rounded-sm bg-white/[0.05] overflow-hidden">
        <span
          aria-hidden
          className="absolute inset-y-0 rounded-sm bg-supreme/45"
          style={{ left: `${left}%`, width: `${Math.max(3, right - left)}%` }}
        />
      </span>
      <span className="font-mono text-[10px] tnum text-textSecondary truncate">{b.label}</span>
    </span>
  );
};

const DisclosuresPage = ({ mode = 'insiders' }: { mode?: DeskMode }) => {
  const navigate = useNavigate();
  const tab = mode;
  const [days, setDays] = useState(90);

  /* Compensation events OFF by default — see decision 1 in the header. */
  const [showComp, setShowComp] = useState(false);
  const codes = useMemo(() => (showComp ? [...MARKET_CODES, ...COMP_CODES] : MARKET_CODES), [showComp]);
  const feed = useMemo(() => insiderFeed(days, codes), [days, codes]);

  const [chamber, setChamber] = useState<Chamber | 'all'>('all');
  const [owner, setOwner] = useState<PtrOwner | 'all'>('all');
  const [lateOnly, setLateOnly] = useState(false);
  const [overlapOnly, setOverlapOnly] = useState(false);
  const congress = useMemo(() => buildCongress(days), [days]);
  const rows = useMemo(
    () =>
      congress.trades.filter(
        t =>
          (chamber === 'all' || t.member.chamber === chamber) &&
          (owner === 'all' || t.owner === owner) &&
          (!lateOnly || t.late) &&
          (!overlapOnly || !!t.committeeOverlap)
      ),
    [congress, chamber, owner, lateOnly, overlapOnly]
  );

  const windowChips = (
    <span className="flex items-center gap-1">
      {WINDOWS.map(w => (
        <Chip key={w.label} active={days === w.days} onClick={() => setDays(w.days)} title={`Filings over the last ${w.label}`}>
          {w.label}
        </Chip>
      ))}
    </span>
  );

  return (
    <>
      <PageHeader
        breadcrumb={['Terminal', mode === 'insiders' ? 'Keyhole' : 'Disclosures']}
        title={mode === 'insiders' ? 'Keyhole' : 'Disclosures'}
        subtitle={
          mode === 'insiders'
            ? 'what the people who run these companies did with their own shares'
            : 'what members of Congress reported trading — and how long they took to say so'
        }
      />

      {tab === 'insiders' ? (
        <Panel
          title="Insider filings"
          subtitle="SEC Form 4 — filed within two business days of the trade"
          actions={
            <span className="flex items-center gap-2">
              {windowChips}
              <span className="w-1" />
              <Chip
                active={showComp}
                onClick={() => setShowComp(v => !v)}
                title="Grants, option conversions, tax withholdings and dispositions to the issuer. Off by default: they are compensation plumbing, not decisions, and mixing them into the feed buries the rows that are."
              >
                + comp events
              </Chip>
            </span>
          }
        >
          {feed.length === 0 ? (
            <DataState kind="empty" title="Nothing filed" body="No filing in this window matches the codes you have on." />
          ) : (
            <>
              <p className="px-1 pb-3 text-[12px] text-textSecondary leading-snug">
                {showComp ? (
                  <>
                    Showing trades <span className="text-textPrimary">and</span> compensation events. A grant, a conversion
                    and a tax withholding all carry a share count and a price and none of them is a decision — the code
                    column says which is which.
                  </>
                ) : (
                  <>
                    Open-market trades only. Most Form 4 rows are grants, option conversions and tax withholdings; they are
                    one toggle away rather than mixed in, because a withholding at vesting reads as a sale and is not one.
                  </>
                )}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] border-collapse">
                  <thead>
                    <tr className="border-b border-borderSubtle">
                      {['When', 'Name', 'Who', 'Code', 'Shares', 'Price', 'Value', 'Of stake', 'Flag', ''].map((h, i) => (
                        <th
                          key={h || `sp${i}`}
                          className={`py-1.5 px-2 font-mono text-[9px] font-semibold uppercase tracking-widest text-textMuted ${
                            i >= 4 && i <= 7 ? 'text-right' : 'text-left'
                          }`}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {feed.map(t => {
                      const meta = TX_CODES[t.code];
                      /* A discretionary open-market BUY is the loud row.
                         Sells are muted on purpose: insiders sell for tax,
                         diversification and divorce, and buy for one
                         reason. Mirroring them red/green spends half the
                         page on the uninformative half of the data. */
                      const loud = t.code === 'P' && t.plan !== 'plan';
                      return (
                        <tr
                          key={t.id}
                          onClick={() => navigate(`/stocks/${t.ticker}`)}
                          title={`${meta.label} — ${meta.note}`}
                          className={`border-b border-borderSubtle/60 cursor-pointer transition-colors ${
                            loud ? 'bg-bull/[0.06] hover:bg-bull/[0.11]' : 'hover:bg-white/[0.03]'
                          } ${meta.openMarket ? '' : 'opacity-70'}`}
                        >
                          <td className="py-1.5 px-2 font-mono text-[10px] tnum text-textMuted">{t.daysAgo}d</td>
                          <td className="py-1.5 px-2">
                            <span className="inline-flex items-center gap-1.5">
                              <CompanyLogo ticker={t.ticker} size={15} beside />
                              <span className="font-mono text-[11px] font-bold text-textPrimary">{t.ticker}</span>
                            </span>
                          </td>
                          <td className="py-1.5 px-2 min-w-0">
                            <div className="font-mono text-[11px] text-textPrimary truncate">{t.person}</div>
                            <div className="font-mono text-[9px] text-textMuted">{t.role}</div>
                          </td>
                          <td className="py-1.5 px-2">
                            <span
                              className={`inline-flex items-center justify-center w-5 h-5 rounded font-mono text-[10px] font-bold border ${
                                meta.openMarket
                                  ? meta.acquires
                                    ? 'text-bull border-bull/40'
                                    : 'text-bear border-bear/40'
                                  : 'text-textMuted border-borderSubtle'
                              }`}
                            >
                              {t.code}
                            </span>
                            <span className="ml-1.5 font-mono text-[9px] text-textMuted">{meta.label}</span>
                          </td>
                          <td className="py-1.5 px-2 text-right font-mono text-[11px] tnum text-textPrimary">
                            {t.shares.toLocaleString()}
                          </td>
                          <td className="py-1.5 px-2 text-right font-mono text-[11px] tnum text-textSecondary">
                            ${t.price.toFixed(2)}
                          </td>
                          <td className="py-1.5 px-2 text-right font-mono text-[11px] tnum text-textPrimary font-semibold">
                            {fmtUsd(t.value)}
                          </td>
                          {/* Size against the INSIDER's own holding, not
                              against the market — a $40k buy that lifts a
                              stake 60% says more than a routine $4m sale. */}
                          <td
                            className="py-1.5 px-2 text-right font-mono text-[10px] tnum text-textMuted"
                            title={`${t.heldAfter.toLocaleString()} shares still held afterwards`}
                          >
                            {t.stakePct}%
                          </td>
                          <td className="py-1.5 px-2">
                            <span
                              className={`rounded px-1 font-mono text-[8px] font-bold uppercase tracking-widest border ${PLAN_INK[t.plan]}`}
                              title={PLAN_HINT[t.plan]}
                            >
                              {PLAN_WORD[t.plan]}
                            </span>
                          </td>
                          <td className="py-1.5 px-2">
                            {/* Clusters roughly double the abnormal return
                                of a lone purchase, and every competing
                                product hides the count on another page. */}
                            {t.clusterCount > 1 && (
                              <span
                                className="rounded px-1 font-mono text-[8px] font-bold uppercase tracking-widest text-supreme border border-supreme/40"
                                title={`${t.clusterCount} different filers acted the same way in ${t.ticker} within 30 days.`}
                              >
                                ×{t.clusterCount}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Panel>
      ) : (
        <Panel
          title="Congressional disclosures"
          subtitle={`STOCK Act periodic transaction reports — due within ${STOCK_ACT_DEADLINE_DAYS} days of the trade`}
          actions={
            <span className="flex items-center gap-2 flex-wrap">
              {windowChips}
              <span className="w-1" />
              <Chip active={chamber === 'all'} onClick={() => setChamber('all')} title="Both chambers">
                Both
              </Chip>
              {CHAMBERS.map(c => (
                <Chip key={c} active={chamber === c} onClick={() => setChamber(c)} title={`${c} filings only`}>
                  {c}
                </Chip>
              ))}
              <span className="w-1" />
              <Chip
                active={overlapOnly}
                onClick={() => setOverlapOnly(v => !v)}
                title="Only trades in a sector the filer's own committee oversees — the reading this data exists for."
              >
                On committee
              </Chip>
              <Chip
                active={lateOnly}
                onClick={() => setLateOnly(v => !v)}
                title={`Only filings that missed the ${STOCK_ACT_DEADLINE_DAYS}-day deadline.`}
              >
                Late only
              </Chip>
            </span>
          }
        >
          <p className="px-1 pb-2 text-[12px] text-textSecondary leading-snug">{congressRead(congress)}</p>
          <div className="px-1 pb-3 flex items-center gap-4 flex-wrap font-mono text-[10px] text-textMuted">
            <span>
              median lag <span className="text-textSecondary tnum">{congress.medianLag}d</span>
            </span>
            <span>
              <span className="text-bear tnum">{congress.lateFilings}</span> past the deadline
            </span>
            <span>
              <span className="text-supreme tnum">{congress.overlaps}</span> on committee
            </span>
            {congress.unknownAmounts > 0 && (
              <span title="Scanned paper filings that came through unparsed. A missing amount is a fact about the filing.">
                <span className="text-textSecondary tnum">{congress.unknownAmounts}</span> with no amount
              </span>
            )}
            <span className="flex items-center gap-1">
              owner
              <Chip active={owner === 'all'} onClick={() => setOwner('all')} title="Any owner">
                any
              </Chip>
              {OWNERS.map(o => (
                <Chip
                  key={o}
                  active={owner === o}
                  onClick={() => setOwner(o)}
                  title={
                    o === 'Self'
                      ? 'The member themselves — the only self-directed view, and no competing product offers it.'
                      : `Held by the member's ${o.toLowerCase()}. A PTR covers the member, their spouse and dependent children; presenting a spouse's managed account under the member's name is the commonest misreading in this category.`
                  }
                >
                  {o.toLowerCase()}
                </Chip>
              ))}
            </span>
          </div>

          {rows.length === 0 ? (
            <DataState
              kind="empty"
              title="Nothing matches"
              body="No disclosure in this window fits those filters. Widen the window, or drop a filter."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse">
                <thead>
                  <tr className="border-b border-borderSubtle">
                    {['Filed', 'Member', 'Asset', 'Type', 'Owner', 'Amount disclosed', 'Traded', 'Lag'].map((h, i) => (
                      <th
                        key={h}
                        className={`py-1.5 px-2 font-mono text-[9px] font-semibold uppercase tracking-widest text-textMuted ${
                          i >= 6 ? 'text-right' : 'text-left'
                        }`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(t => {
                    const buy = t.type === 'Purchase';
                    return (
                      <tr
                        key={t.id}
                        onClick={() => navigate(`/stocks/${t.ticker}`)}
                        className={`border-b border-borderSubtle/60 cursor-pointer transition-colors ${
                          buy ? 'bg-bull/[0.05] hover:bg-bull/[0.10]' : 'hover:bg-white/[0.03]'
                        }`}
                      >
                        <td className="py-1.5 px-2 font-mono text-[10px] tnum text-textMuted">{t.disclosedDaysAgo}d ago</td>
                        <td className="py-1.5 px-2 min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-mono text-[11px] text-textPrimary truncate">{t.member.name}</span>
                            <span className="font-mono text-[9px] text-textMuted shrink-0">
                              {t.member.party}-{t.member.district ?? t.member.state}
                            </span>
                          </div>
                          {/* The overlap is the signal. Named, not scored —
                              a reader must be able to see WHICH committee
                              before treating it as anything. */}
                          {t.committeeOverlap && (
                            <div
                              className="font-mono text-[9px] text-supreme truncate"
                              title={`${t.member.name} sits on ${t.committeeOverlap}, which has jurisdiction over this company's sector. Committee overlap is the reading this dataset exists for — it is a question, not a verdict.`}
                            >
                              {t.committeeOverlap}
                            </div>
                          )}
                        </td>
                        <td className="py-1.5 px-2">
                          <span className="inline-flex items-center gap-1.5">
                            <CompanyLogo ticker={t.ticker} size={15} beside />
                            <span className="font-mono text-[11px] font-bold text-textPrimary">{t.ticker}</span>
                          </span>
                          <span className="ml-1.5 font-mono text-[9px] text-textMuted">{t.assetKind}</span>
                        </td>
                        <td className={`py-1.5 px-2 font-mono text-[10px] font-semibold ${buy ? 'text-bull' : 'text-bear'}`}>
                          {t.type}
                        </td>
                        <td className="py-1.5 px-2">
                          <span
                            className={`rounded px-1 font-mono text-[9px] uppercase tracking-wider border ${
                              t.owner === 'Self'
                                ? 'text-textPrimary border-borderSubtle'
                                : 'text-textMuted border-borderSubtle'
                            }`}
                            title={
                              t.owner === 'Self'
                                ? 'The member themselves.'
                                : `Held by the member's ${t.owner.toLowerCase()} — not the member. A PTR covers the whole household.`
                            }
                          >
                            {t.owner}
                          </span>
                        </td>
                        <td className="py-1.5 px-2">
                          <BracketBar index={t.bracket} />
                        </td>
                        <td className="py-1.5 px-2 text-right font-mono text-[10px] tnum text-textMuted">
                          {t.tradedDaysAgo}d ago
                        </td>
                        <td
                          className={`py-1.5 px-2 text-right font-mono text-[11px] tnum font-semibold ${lagInk(t.lagDays)}`}
                          /* A negative lag is a real artefact of real feeds
                             — 51 of 23,944 live House rows carry one — and
                             it looks like a data error until it is named.
                             Both dates are still in the past. */
                          title={
                            t.lagDays < 0
                              ? `The filing is dated ${-t.lagDays} days BEFORE the trade it reports. That is a filing artefact, not a time machine — live House data carries about one row in 470 like this — and both dates are in the past.`
                              : `${t.lagDays} days between the trade and the disclosure. The STOCK Act allows ${STOCK_ACT_DEADLINE_DAYS}.`
                          }
                        >
                          {t.lagDays}d
                          {t.late && (
                            <span
                              className="ml-1.5 rounded px-1 font-mono text-[8px] font-bold uppercase tracking-widest text-bear border border-bear/40"
                              title={`Past the STOCK Act's ${STOCK_ACT_DEADLINE_DAYS}-day outer bound. The penalty is a $200 fee.`}
                            >
                              late
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <p className="px-1 pt-3 font-mono text-[9px] text-textMuted leading-relaxed">
            Amounts are the ten statutory brackets a filing actually contains — the bar shows the whole band, because the
            figure inside it was never disclosed. Committee overlap is a question about jurisdiction, not a finding about
            anybody. {bracketLabel(0)} is the smallest reportable band; trades under $1,000 need no report at all.
          </p>
        </Panel>
      )}
    </>
  );
};

export default DisclosuresPage;
