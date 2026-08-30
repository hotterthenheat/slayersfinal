import { UNIVERSE, lookup } from './universe';
import { h01, dayKey } from '../core/rng';

/*
==================================================
  SLAYER TERMINAL - CONGRESSIONAL DISCLOSURES
  (data/congressFlow.ts)
==================================================

  STOCK Act Periodic Transaction Reports — what members of Congress
  disclosed trading, and how long they took to say so.

  ── THE PEOPLE HERE ARE INVENTED, AND THAT IS DELIBERATE ─────────────────

  Noah, 2026-08-30: "build the insider and congress page please because i
  need to know how my ui is gonna look before i add api keys, you can give
  fake names if you must."

  So every member below is FICTIONAL — invented names, invented districts.
  Not one is a real legislator. A simulated feed that printed invented
  trades under a real member's name would be a fabricated record about a
  real person, and no amount of UI fidelity is worth that. The surface
  renders identically either way, because the SHAPE is what a UI is built
  against, and the shape here is the real one.

  ── THE SHAPE IS THE REAL ONE, AND THIS IS THE PART THAT MATTERS ─────────

  Measured against 8,350 live Senate records and 23,944 live House records
  before this file was written. Every design decision below exists because
  the real feed does something a naive model would not.

  1. AMOUNTS ARE BRACKETS. NEVER A FIGURE. A member discloses
     "$15,001 - $50,000", not "$32,000". Ten statutory rungs, checkbox
     columns A-J on the form. Aggregators fabricate a midpoint to make the
     data sortable — the House feed ships an `amount_mid`, and Quiver's
     `Amount` is the range's LOWER BOUND, which systematically understates.
     Both are inventions. This models the bracket as the primitive, so a
     board can never print a confident number the disclosure did not
     contain. A total is a RANGE with a visible low and high.

  2. THE LADDER HAS AN ELEVENTH RUNG THAT IS NOT A NUMBER. Scanned paper
     filings come through unparsed, and the real feed reports `Unknown` on
     463 of 8,350 Senate rows. A model without it makes an honest UI
     impossible, because a missing amount is a fact about the filing.

  3. THE SPOUSE CAP IS REAL. Under 5 U.S.C. 13104(d)(2) the brackets above
     $1,000,000 apply to a spouse's or dependent child's assets only when
     held jointly with the filer. Everything else tops out at "Over
     $1,000,000", so a spouse row can never show a higher rung.

  4. OWNER IS LOAD-BEARING AND EVERY COMPETING PRODUCT HIDES IT. A PTR
     covers the member, their spouse and dependent children. Showing a
     spouse's managed-account trade under the member's name is the most
     common misrepresentation in this category. `owner` is on every row.

  5. THE DEADLINE IS 30 DAYS AFTER NOTIFICATION, AND IN NO CASE LATER THAN
     45 DAYS AFTER THE TRADE. Late filing carries a $200 fee and is common:
     5.8% of live House rows landed past 45 days, with a median lag of 9
     days and a tail reaching ten years. So the lag is a column and a sort,
     not a pair of dates a reader is left to subtract.

  6. DISCLOSURE CAN PREDATE THE TRADE. 51 live House rows carry a negative
     lag. It is a filing artefact, not a paradox, and a UI that assumes
     non-negative days will render nonsense on real data.

  7. PARTY, CHAMBER AND COMMITTEE ARE NOT IN THE FILING. They are joined
     from a roster. Committee overlap is the actual analytical signal — a
     trade inside a member's own jurisdiction — so it is modelled as a join
     here too, exactly as it will have to be with a real feed.

  When a feed lands, `MEMBERS` is replaced by a roster and `buildCongress`
  by a fetch. Every reading above it keeps working.
*/

/** The ten statutory rungs, in form-checkbox order A-J. */
export interface AmountBracket {
  /** The form's checkbox column, A-J. */
  column: string;
  /** Lower bound in dollars, inclusive. */
  low: number;
  /** Upper bound, or null for the open-ended top rung. */
  high: number | null;
  label: string;
}

export const AMOUNT_BRACKETS: AmountBracket[] = [
  { column: 'A', low: 1_001, high: 15_000, label: '$1,001 - $15,000' },
  { column: 'B', low: 15_001, high: 50_000, label: '$15,001 - $50,000' },
  { column: 'C', low: 50_001, high: 100_000, label: '$50,001 - $100,000' },
  { column: 'D', low: 100_001, high: 250_000, label: '$100,001 - $250,000' },
  { column: 'E', low: 250_001, high: 500_000, label: '$250,001 - $500,000' },
  { column: 'F', low: 500_001, high: 1_000_000, label: '$500,001 - $1,000,000' },
  { column: 'G', low: 1_000_001, high: 5_000_000, label: '$1,000,001 - $5,000,000' },
  { column: 'H', low: 5_000_001, high: 25_000_000, label: '$5,000,001 - $25,000,000' },
  { column: 'I', low: 25_000_001, high: 50_000_000, label: '$25,000,001 - $50,000,000' },
  { column: 'J', low: 50_000_001, high: null, label: 'Over $50,000,000' },
];

/** The highest rung a spouse or dependent may report when not held jointly
    with the filer — 5 U.S.C. 13104(d)(2). Index into AMOUNT_BRACKETS. */
export const SPOUSE_CAP_INDEX = 5; // 'F' — $500,001-$1,000,000 is the last bounded rung below the $1M cap

export type Chamber = 'House' | 'Senate';
export type Party = 'D' | 'R' | 'I';
/** Senate keeps the partial/full split; the House feed collapses it. Both
    vocabularies are modelled because a real join sees both. */
export type PtrType = 'Purchase' | 'Sale (Full)' | 'Sale (Partial)' | 'Exchange';
/** Senate says 'Child', the House says 'Dependent Child' — normalised here
    to one vocabulary, which is what a UI needs and neither feed provides. */
export type PtrOwner = 'Self' | 'Spouse' | 'Joint' | 'Dependent';
export type AssetKind = 'Stock' | 'Stock Option' | 'Corporate Bond' | 'Municipal Security' | 'Fund' | 'Crypto' | 'Other';

export interface Member {
  id: string;
  name: string;
  chamber: Chamber;
  party: Party;
  /** State, plus district for House members. */
  state: string;
  district?: string;
  /** Committee seats — the join that carries the signal. */
  committees: string[];
}

/*
  FICTIONAL MEMBERS. Invented names, invented districts. See the header —
  nothing here corresponds to a real legislator, and nothing should be made
  to. The committee seats are real committee NAMES because the whole point
  of the overlap reading is that a reader recognises the jurisdiction.
*/
export const MEMBERS: Member[] = [
  { id: 'm01', name: 'Rep. Dana Whitlock', chamber: 'House', party: 'D', state: 'CA', district: 'CA-14', committees: ['Energy and Commerce', 'Science, Space and Technology'] },
  { id: 'm02', name: 'Rep. Marcus Reyland', chamber: 'House', party: 'R', state: 'TX', district: 'TX-08', committees: ['Armed Services', 'Appropriations'] },
  { id: 'm03', name: 'Sen. Priya Ashford', chamber: 'Senate', party: 'D', state: 'WA', committees: ['Commerce, Science and Transportation', 'Finance'] },
  { id: 'm04', name: 'Sen. Halloran Beck', chamber: 'Senate', party: 'R', state: 'FL', committees: ['Banking, Housing and Urban Affairs'] },
  { id: 'm05', name: 'Rep. Yvette Corliss', chamber: 'House', party: 'D', state: 'NY', district: 'NY-11', committees: ['Financial Services'] },
  { id: 'm06', name: 'Rep. Theo Vandermere', chamber: 'House', party: 'R', state: 'OH', district: 'OH-03', committees: ['Ways and Means', 'Energy and Commerce'] },
  { id: 'm07', name: 'Sen. Ruth Okonjo-Blaine', chamber: 'Senate', party: 'I', state: 'VT', committees: ['Health, Education, Labor and Pensions'] },
  { id: 'm08', name: 'Rep. Callum Doyle-Frost', chamber: 'House', party: 'R', state: 'PA', district: 'PA-07', committees: ['Transportation and Infrastructure'] },
  { id: 'm09', name: 'Sen. Marisol Trevino', chamber: 'Senate', party: 'D', state: 'AZ', committees: ['Armed Services', 'Intelligence'] },
  { id: 'm10', name: 'Rep. Bennett Ashgrove', chamber: 'House', party: 'D', state: 'IL', district: 'IL-05', committees: ['Agriculture'] },
  { id: 'm11', name: 'Sen. Idris Falconer', chamber: 'Senate', party: 'R', state: 'GA', committees: ['Energy and Natural Resources', 'Finance'] },
  { id: 'm12', name: 'Rep. Simone Ashby-Hale', chamber: 'House', party: 'D', state: 'MA', district: 'MA-02', committees: ['Science, Space and Technology'] },
];

/*
  WHICH COMMITTEE OVERSEES WHICH SECTOR. The overlap reading needs this
  mapping and a real deployment needs it too — it is not a simulation
  convenience. Kept deliberately conservative: a committee is listed only
  where the jurisdiction is uncontroversial, because a false overlap flag
  is an accusation.
*/
const COMMITTEE_SECTORS: Record<string, string[]> = {
  'Energy and Commerce': ['Energy', 'Health Care', 'Utilities', 'Communication'],
  'Science, Space and Technology': ['Technology'],
  'Armed Services': ['Industrials'],
  'Financial Services': ['Financials'],
  'Banking, Housing and Urban Affairs': ['Financials'],
  'Commerce, Science and Transportation': ['Technology', 'Communication', 'Industrials'],
  'Energy and Natural Resources': ['Energy', 'Materials', 'Utilities'],
  'Health, Education, Labor and Pensions': ['Health Care'],
  'Ways and Means': ['Financials', 'Health Care'],
  'Transportation and Infrastructure': ['Industrials'],
  Agriculture: ['Consumer Staples', 'Materials'],
  Finance: ['Financials'],
  Appropriations: [],
  Intelligence: ['Technology'],
};

export interface CongressTrade {
  id: string;
  member: Member;
  ticker: string;
  /** What the filing actually wrote in the asset field. */
  assetDescription: string;
  assetKind: AssetKind;
  type: PtrType;
  owner: PtrOwner;
  /** Index into AMOUNT_BRACKETS, or null when the filing was unparsed. */
  bracket: number | null;
  /** Days between the trade and the filing. CAN BE NEGATIVE — real feeds
      carry rows disclosed before the transaction date. */
  lagDays: number;
  /** Days ago the trade happened. */
  tradedDaysAgo: number;
  /** Days ago it was disclosed. */
  disclosedDaysAgo: number;
  /** Past the STOCK Act's 45-day outer bound. */
  late: boolean;
  /** The member sits on a committee with jurisdiction over this sector. */
  committeeOverlap: string | null;
}

export interface CongressFeed {
  trades: CongressTrade[];
  /** Aggregate disclosed value as a RANGE, never a point — the sum of the
      bracket floors and the sum of the ceilings. */
  totalLow: number;
  totalHigh: number | null;
  /** How many rows carried no parseable amount. */
  unknownAmounts: number;
  purchases: number;
  sales: number;
  lateFilings: number;
  overlaps: number;
  /** Median lag in days across the feed. */
  medianLag: number;
}

const EMPTY: CongressFeed = {
  trades: [],
  totalLow: 0,
  totalHigh: 0,
  unknownAmounts: 0,
  purchases: 0,
  sales: 0,
  lateFilings: 0,
  overlaps: 0,
  medianLag: 0,
};

/** The STOCK Act's outer bound: no later than 45 days after the trade. */
export const STOCK_ACT_DEADLINE_DAYS = 45;

const TYPES: PtrType[] = ['Purchase', 'Sale (Full)', 'Sale (Partial)', 'Exchange'];
const OWNERS: PtrOwner[] = ['Self', 'Spouse', 'Joint', 'Dependent'];

/** Which committee of this member's, if any, oversees this ticker's sector. */
export function overlapFor(member: Member, ticker: string): string | null {
  const u = lookup(ticker);
  if (!u) return null;
  for (const c of member.committees) {
    if ((COMMITTEE_SECTORS[c] ?? []).includes(u.sector)) return c;
  }
  return null;
}

/** A bracket's label, with the unparsed case named rather than blanked. */
export const bracketLabel = (i: number | null): string =>
  i === null ? 'Not disclosed' : AMOUNT_BRACKETS[i].label;

/**
 * The disclosure feed.
 *
 * @param windowDays how far back to look
 * @param day        session key, injectable so this is provable
 */
export function buildCongress(windowDays = 90, day = dayKey(), count = 46): CongressFeed {
  if (!(windowDays > 0) || count <= 0) return EMPTY;
  const trades: CongressTrade[] = [];

  for (let i = 0; i < count; i++) {
    const s = `${day}|cong|${i}`;
    const member = MEMBERS[Math.floor(h01(`${s}|m`) * MEMBERS.length)];
    const u = UNIVERSE[Math.floor(h01(`${s}|t`) * UNIVERSE.length)];
    const owner = OWNERS[Math.floor(h01(`${s}|o`) * OWNERS.length)];

    /* Purchases are the minority of disclosed volume, as in the real feed —
       Senate live counts run roughly 4,100 purchases to 3,700 sales, and
       the sales split across full and partial. */
    const tr = h01(`${s}|ty`);
    const type: PtrType = tr < 0.46 ? 'Purchase' : tr < 0.72 ? 'Sale (Full)' : tr < 0.97 ? 'Sale (Partial)' : 'Exchange';

    /* THE AMOUNT LADDER, with the real feed's shape: the small rungs carry
       most of the rows and the top rungs are rare. A uniform draw would
       make a $25m disclosure as common as a $5k one. */
    const ar = h01(`${s}|a`);
    let bracket: number | null;
    if (ar < 0.055) bracket = null; // unparsed scanned filing
    else if (ar < 0.62) bracket = 0;
    else if (ar < 0.79) bracket = 1;
    else if (ar < 0.865) bracket = 2;
    else if (ar < 0.915) bracket = 3;
    else if (ar < 0.947) bracket = 4;
    else if (ar < 0.972) bracket = 5;
    else if (ar < 0.988) bracket = 6;
    else if (ar < 0.994) bracket = 7;
    else if (ar < 0.998) bracket = 8;
    /* THE OPEN-ENDED TOP RUNG MUST BE REACHABLE. It was not: the ladder
       stopped at 'I' and nothing ever drew 'Over $50,000,000', which left
       the one branch that makes a total's ceiling UNKNOWABLE permanently
       untested. The live Senate feed carries one such row in 8,350, so it
       is rare — and rare is exactly what makes an unreachable branch easy
       to ship broken. */
    else bracket = 9;

    /* THE SPOUSE CAP. A spouse's or dependent's non-joint holding cannot
       report above $1,000,000, so the rung is pulled down rather than the
       row being dropped — which is what the statute actually does. */
    if (bracket !== null && (owner === 'Spouse' || owner === 'Dependent') && bracket > SPOUSE_CAP_INDEX) {
      bracket = SPOUSE_CAP_INDEX;
    }

    /* Lag: median around 9 days with a long tail past the 45-day bound,
       and a thin slice of negative lags, which real feeds carry. */
    const lr = h01(`${s}|l`);
    let lagDays: number;
    if (lr < 0.02) lagDays = -Math.floor(h01(`${s}|ln`) * 20) - 1;
    else if (lr < 0.72) lagDays = Math.floor(h01(`${s}|l1`) * 18) + 1;
    else if (lr < 0.94) lagDays = Math.floor(h01(`${s}|l2`) * 27) + 18;
    else lagDays = Math.floor(h01(`${s}|l3`) * 300) + 46;

    /* THE DISCLOSURE IS THE EVENT THIS FEED CARRIES, so it is drawn first
       and the trade is placed behind it by the lag.

       Doing it the other way round — draw the trade, subtract the lag —
       put disclosures in the FUTURE whenever the lag exceeded the trade's
       age, and the long tail of late filings guarantees that: a trade 78
       days back with a 313-day lag was "disclosed" 235 days from now. The
       filing is the thing that just happened; the trade is however far
       behind it the member took to say so. */
    /* A negative lag is a filing artefact, not a time machine. Real feeds
       carry rows whose disclosure date precedes the transaction date — 51
       of 23,944 live House rows do — but BOTH dates are still in the past.
       So a negative-lag row is pushed far enough back that the trade it
       describes has already happened; without the floor a row disclosed 9
       days ago with a -15 day lag claimed a trade six days from now. */
    const floor = lagDays < 0 ? -lagDays : 0;
    const disclosedDaysAgo = floor + Math.floor(h01(`${s}|d`) * Math.max(1, windowDays - floor));
    const tradedDaysAgo = disclosedDaysAgo + lagDays;

    /* THE ASSET KIND MUST AGREE WITH THE ASSET.

       Drawn independently it produced rows reading "AMZN — Crypto" and
       "JNJ — Municipal Security": a common-stock ticker wearing an
       instrument class it cannot be. Real filings do carry bonds, munis
       and crypto, but those rows describe different instruments and mostly
       carry no equity ticker at all — so with an equity universe the only
       honest kinds are the equity ones. When a feed lands carrying real
       asset descriptions, the other members of AssetKind become reachable
       again without anything above this changing. */
    const assetKind: AssetKind = h01(`${s}|k`) < 0.93 ? 'Stock' : 'Stock Option';

    trades.push({
      id: s,
      member,
      ticker: u.ticker,
      assetDescription: `${u.name} (${u.ticker})`,
      assetKind,
      type,
      owner,
      bracket,
      lagDays,
      tradedDaysAgo,
      disclosedDaysAgo,
      /* Late is measured against the trade date, which is the statute's own
         outer bound. A negative lag is never late. */
      late: lagDays > STOCK_ACT_DEADLINE_DAYS,
      committeeOverlap: overlapFor(member, u.ticker),
    });
  }

  /* Newest DISCLOSURE first, the way a filings feed reads. */
  trades.sort((a, b) => a.disclosedDaysAgo - b.disclosedDaysAgo);

  let totalLow = 0;
  let totalHigh: number | null = 0;
  let unknownAmounts = 0;
  let purchases = 0;
  let sales = 0;
  let lateFilings = 0;
  let overlaps = 0;
  for (const t of trades) {
    if (t.bracket === null) unknownAmounts += 1;
    else {
      const b = AMOUNT_BRACKETS[t.bracket];
      totalLow += b.low;
      /* An open-ended top rung makes the CEILING unknowable. Null, not a
         guess — the whole point of a bracket model is refusing to invent
         the number the filing withheld. */
      if (totalHigh !== null) totalHigh = b.high === null ? null : totalHigh + b.high;
    }
    if (t.type === 'Purchase') purchases += 1;
    else if (t.type !== 'Exchange') sales += 1;
    if (t.late) lateFilings += 1;
    if (t.committeeOverlap) overlaps += 1;
  }

  const lags = trades.map(t => t.lagDays).sort((a, b) => a - b);
  const medianLag = lags.length === 0 ? 0 : lags[Math.floor(lags.length / 2)];

  return { trades, totalLow, totalHigh, unknownAmounts, purchases, sales, lateFilings, overlaps, medianLag };
}

/** The feed's headline. */
export function congressRead(f: CongressFeed): string {
  if (f.trades.length === 0) return 'No disclosures filed in this window.';
  const range =
    f.totalHigh === null
      ? `at least $${f.totalLow.toLocaleString()}`
      : `between $${f.totalLow.toLocaleString()} and $${f.totalHigh.toLocaleString()}`;
  const parts = [`${f.trades.length} disclosures covering ${range} — the brackets summed, not a point estimate.`];
  if (f.overlaps > 0) {
    parts.push(
      `${f.overlaps} sit inside the filer's own committee jurisdiction, which is the reading this data is actually for.`
    );
  }
  if (f.lateFilings > 0) {
    parts.push(`${f.lateFilings} missed the 45-day deadline.`);
  }
  return parts.join(' ');
}
