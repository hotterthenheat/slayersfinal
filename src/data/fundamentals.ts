import { hRange, h01, hPick } from '../core/rng';
import { UNIVERSE, type UniverseName } from './universe';

/*
==================================================
  SLAYER TERMINAL - FUNDAMENTALS (data/fundamentals.ts)

  The company behind the ticker — what it does, what
  it earns, and what it owns.
==================================================

  §2's Ticker Overview. Every other desk here reads a name as a PRICE with
  greeks attached; this is the one surface that treats it as a business.

  THE STATEMENTS ARE INTERNALLY CONSISTENT, which is the whole difficulty
  and the reason this is a module rather than four unrelated generators.
  Revenue less cost of revenue is gross profit; less operating expense is
  operating income; less interest and tax is net income. Assets equal
  liabilities plus equity, exactly. Cash from operations less capex is free
  cash flow. A reader who adds up a column and finds it does not foot learns
  the whole page is decorative — so the columns foot.

  RATIOS ARE DERIVED FROM THE STATEMENTS, never generated beside them. A P/E
  that disagrees with the net income above it is worse than no P/E, and the
  only way to guarantee it cannot is to compute it from the same numbers the
  reader can see.

  SCALE FOLLOWS THE NAME. A megacap's revenue is three orders of magnitude
  off a mid-cap's, and a page where every company earns the same twelve
  billion dollars is obviously fake at a glance. Share count and price give
  the market cap, and revenue is drawn against it at a sector-appropriate
  multiple.

  DETERMINISTIC PER TICKER, like every other simulated surface here.
*/

export interface IncomeStatement {
  revenue: number;
  costOfRevenue: number;
  grossProfit: number;
  operatingExpense: number;
  operatingIncome: number;
  interestExpense: number;
  taxExpense: number;
  netIncome: number;
  eps: number;
}

export interface BalanceSheet {
  cash: number;
  receivables: number;
  inventory: number;
  otherCurrentAssets: number;
  totalCurrentAssets: number;
  ppe: number;
  goodwill: number;
  totalAssets: number;
  payables: number;
  shortTermDebt: number;
  totalCurrentLiabilities: number;
  longTermDebt: number;
  totalLiabilities: number;
  equity: number;
}

export interface CashFlow {
  operating: number;
  capex: number;
  freeCashFlow: number;
  investing: number;
  financing: number;
  buybacks: number;
  dividendsPaid: number;
  netChange: number;
}

export interface Ratios {
  peRatio: number | null;
  psRatio: number;
  grossMarginPct: number;
  operatingMarginPct: number;
  netMarginPct: number;
  roePct: number | null;
  currentRatio: number;
  debtToEquity: number;
  fcfMarginPct: number;
  /** Trailing dividend yield, percent. 0 when the name pays nothing. */
  dividendYieldPct: number;
}

export interface CompanyProfile {
  ticker: string;
  name: string;
  sector: string;
  industry: string;
  description: string;
  employees: number;
  founded: number;
  headquarters: string;
  sharesOutstanding: number;
  marketCap: number;
  /** Names in the same sector — the "related" rail. */
  related: string[];
}

export interface Fundamentals {
  profile: CompanyProfile;
  income: IncomeStatement;
  balance: BalanceSheet;
  cashFlow: CashFlow;
  ratios: Ratios;
  /** Four quarters of revenue and EPS, oldest first. */
  quarters: { label: string; revenue: number; eps: number }[];
}

const INDUSTRY: Record<string, string[]> = {
  Technology: ['Semiconductors', 'Software — Infrastructure', 'Consumer Electronics', 'IT Services'],
  Financials: ['Diversified Banks', 'Capital Markets', 'Insurance', 'Asset Management'],
  Energy: ['Integrated Oil & Gas', 'Oil & Gas E&P', 'Refining & Marketing'],
  'Health Care': ['Pharmaceuticals', 'Medical Devices', 'Managed Care', 'Biotechnology'],
  'Consumer Disc.': ['Internet Retail', 'Automobiles', 'Restaurants', 'Apparel'],
  'Consumer Staples': ['Beverages', 'Household Products', 'Food Retail'],
  Industrials: ['Aerospace & Defense', 'Machinery', 'Railroads', 'Conglomerates'],
  Utilities: ['Electric Utilities', 'Multi-Utilities'],
  'Real Estate': ['REIT — Retail', 'REIT — Industrial', 'REIT — Residential'],
  Materials: ['Specialty Chemicals', 'Metals & Mining', 'Packaging'],
  Communications: ['Interactive Media', 'Telecom Services', 'Entertainment'],
};

const HQ = ['Cupertino, CA', 'Redmond, WA', 'Santa Clara, CA', 'New York, NY', 'Austin, TX',
  'Chicago, IL', 'Boston, MA', 'Atlanta, GA', 'San Francisco, CA', 'Houston, TX'];

/** Sector-typical revenue as a multiple of market cap — a crude but honest
    way to keep a software name's revenue below a retailer's at equal cap. */
const REV_TO_CAP: Record<string, number> = {
  Technology: 0.22, Financials: 0.35, Energy: 0.9, 'Health Care': 0.42,
  'Consumer Disc.': 0.75, 'Consumer Staples': 0.85, Industrials: 0.6,
  Utilities: 0.45, 'Real Estate': 0.16, Materials: 0.7, Communications: 0.3,
};

const findName = (ticker: string): UniverseName | null =>
  UNIVERSE.find(u => u.ticker === ticker.toUpperCase()) ?? null;

/** Everything the overview page needs, for one name. */
export function buildFundamentals(ticker: string, price?: number): Fundamentals | null {
  const u = findName(ticker);
  if (!u) return null;
  const t = u.ticker;
  const px = price && price > 0 ? price : u.px;

  const shares = Math.round(hRange(`${t}|shares`, 3.2e8, 1.6e10) * (u.px > 250 ? 0.35 : 1));
  /* Market cap is LIVE — it is price times shares, by definition. */
  const marketCap = shares * px;
  const industry = hPick(`${t}|ind`, INDUSTRY[u.sector] ?? ['Diversified']);

  /*
    THE STATEMENTS ARE A FILING, AND A FILING DOES NOT MOVE WITH THE TAPE.

    The first cut scaled revenue off the LIVE market cap, which meant a stock
    ticking up gave the company more revenue — the proof caught it by holding
    net income constant across two prices. Revenue now scales off the
    REFERENCE price, so the business is fixed and only the price-derived
    figures (cap, P/E, P/S, yield) move. That is the real division: what was
    reported last quarter versus what the market is paying for it today.
  */
  const referenceCap = shares * u.px;
  const revenue = referenceCap * (REV_TO_CAP[u.sector] ?? 0.5) * hRange(`${t}|rev`, 0.72, 1.34);
  const grossMargin = hRange(`${t}|gm`, 0.21, 0.74);
  const grossProfit = revenue * grossMargin;
  const costOfRevenue = revenue - grossProfit;
  const operatingExpense = grossProfit * hRange(`${t}|opex`, 0.32, 0.78);
  const operatingIncome = grossProfit - operatingExpense;
  const interestExpense = revenue * hRange(`${t}|int`, 0.002, 0.021);
  const pretax = operatingIncome - interestExpense;
  const taxExpense = pretax > 0 ? pretax * hRange(`${t}|tax`, 0.13, 0.25) : 0;
  const netIncome = pretax - taxExpense;
  const eps = netIncome / shares;

  const income: IncomeStatement = {
    revenue, costOfRevenue, grossProfit, operatingExpense, operatingIncome,
    interestExpense, taxExpense, netIncome, eps,
  };

  // ── balance sheet: assets = liabilities + equity, exactly ──
  const cash = revenue * hRange(`${t}|cash`, 0.08, 0.42);
  const receivables = revenue * hRange(`${t}|ar`, 0.06, 0.19);
  const inventory = costOfRevenue * hRange(`${t}|inv`, 0.02, 0.24);
  const otherCurrentAssets = revenue * hRange(`${t}|oca`, 0.01, 0.07);
  const totalCurrentAssets = cash + receivables + inventory + otherCurrentAssets;
  const ppe = revenue * hRange(`${t}|ppe`, 0.1, 0.85);
  const goodwill = revenue * hRange(`${t}|gw`, 0.02, 0.55);
  const totalAssets = totalCurrentAssets + ppe + goodwill;

  const payables = costOfRevenue * hRange(`${t}|ap`, 0.05, 0.22);
  const shortTermDebt = totalAssets * hRange(`${t}|std`, 0.01, 0.09);
  const totalCurrentLiabilities = payables + shortTermDebt;
  const longTermDebt = totalAssets * hRange(`${t}|ltd`, 0.04, 0.34);
  const totalLiabilities = totalCurrentLiabilities + longTermDebt;
  /* Equity is the PLUG, which is what makes the sheet balance by
     construction rather than by luck. */
  const equity = totalAssets - totalLiabilities;

  const balance: BalanceSheet = {
    cash, receivables, inventory, otherCurrentAssets, totalCurrentAssets,
    ppe, goodwill, totalAssets, payables, shortTermDebt,
    totalCurrentLiabilities, longTermDebt, totalLiabilities, equity,
  };

  // ── cash flow ──
  const operating = netIncome * hRange(`${t}|cfo`, 0.85, 1.65);
  const capex = -revenue * hRange(`${t}|capex`, 0.014, 0.13);
  const freeCashFlow = operating + capex;
  const investing = capex - revenue * hRange(`${t}|inv2`, 0, 0.05);
  const paysDividend = h01(`${t}|div`) > 0.42;
  const dividendsPaid = paysDividend ? -Math.abs(netIncome) * hRange(`${t}|dp`, 0.08, 0.42) : 0;
  const buybacks = -Math.abs(freeCashFlow) * hRange(`${t}|bb`, 0, 0.55);
  const financing = dividendsPaid + buybacks - totalAssets * hRange(`${t}|fin`, 0, 0.03);
  const cashFlow: CashFlow = {
    operating, capex, freeCashFlow, investing, financing, buybacks, dividendsPaid,
    netChange: operating + investing + financing,
  };

  // ── ratios, every one derived from the above ──
  const ratios: Ratios = {
    peRatio: eps > 0 ? px / eps : null,
    psRatio: marketCap / revenue,
    grossMarginPct: (grossProfit / revenue) * 100,
    operatingMarginPct: (operatingIncome / revenue) * 100,
    netMarginPct: (netIncome / revenue) * 100,
    roePct: equity > 0 ? (netIncome / equity) * 100 : null,
    currentRatio: totalCurrentAssets / totalCurrentLiabilities,
    debtToEquity: equity > 0 ? (shortTermDebt + longTermDebt) / equity : 0,
    fcfMarginPct: (freeCashFlow / revenue) * 100,
    dividendYieldPct: paysDividend ? (Math.abs(dividendsPaid) / shares / px) * 100 : 0,
  };

  const quarters = ['Q1', 'Q2', 'Q3', 'Q4'].map((q, i) => ({
    label: q,
    revenue: (revenue / 4) * hRange(`${t}|q${i}r`, 0.86, 1.18),
    eps: (eps / 4) * hRange(`${t}|q${i}e`, 0.7, 1.32),
  }));

  const related = UNIVERSE.filter(x => x.sector === u.sector && x.ticker !== t).slice(0, 6).map(x => x.ticker);

  const profile: CompanyProfile = {
    ticker: t,
    name: u.name,
    sector: u.sector,
    industry,
    description:
      `${u.name} operates in ${industry.toLowerCase()} within the ${u.sector.toLowerCase()} sector. ` +
      `The business carries a beta of ${u.beta.toFixed(2)} against the tape, which is what makes its options ` +
      `${u.beta > 1.25 ? 'move more than the index on the same news' : u.beta < 0.9 ? 'move less than the index on the same news' : 'track the index closely'}.`,
    employees: Math.round(hRange(`${t}|emp`, 1_800, 240_000)),
    founded: Math.round(hRange(`${t}|founded`, 1892, 2011)),
    headquarters: hPick(`${t}|hq`, HQ),
    sharesOutstanding: shares,
    marketCap,
    related,
  };

  return { profile, income, balance, cashFlow, ratios, quarters };
}

/** Every name the overview can be opened on. */
export const coveredTickers = (): string[] => UNIVERSE.map(u => u.ticker);
