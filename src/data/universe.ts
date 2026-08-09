/*
==================================================
  SLAYER TERMINAL - EQUITY UNIVERSE (universe.ts)
  The shared large-cap universe every research module
  reads from — Stocks, Compass and
  Trace all key off the same names so cross-module
  stories line up (a headline moves the same ticker
  the sector board ranks).

  This is the CURATED tier: hand-priced, sectored names
  the research desks render as rows. The scanner reaches
  wider than this (see src/core/scanUniverse.ts, which
  layers the bundled NASDAQ listing on top) — but only
  names carried here have a sector and a reference price
  a human chose.
==================================================
*/

export type Sector =
  | 'Technology'
  | 'Communication'
  | 'Consumer Discretionary'
  | 'Financials'
  | 'Energy'
  | 'Health Care'
  | 'Industrials'
  | 'Consumer Staples'
  | 'Utilities'
  | 'Materials';

export interface UniverseName {
  ticker: string;
  name: string;
  sector: Sector;
  /** Reference price the deterministic feeds oscillate around */
  px: number;
  beta: number;
}

export const UNIVERSE: UniverseName[] = [
  // ---- Technology ----------------------------------------------------------
  { ticker: 'AAPL', name: 'Apple', sector: 'Technology', px: 232.4, beta: 1.1 },
  { ticker: 'MSFT', name: 'Microsoft', sector: 'Technology', px: 448.1, beta: 0.95 },
  { ticker: 'NVDA', name: 'NVIDIA', sector: 'Technology', px: 138.6, beta: 1.7 },
  { ticker: 'AMD', name: 'Advanced Micro Devices', sector: 'Technology', px: 164.2, beta: 1.6 },
  { ticker: 'AVGO', name: 'Broadcom', sector: 'Technology', px: 172.8, beta: 1.2 },
  { ticker: 'CRM', name: 'Salesforce', sector: 'Technology', px: 268.3, beta: 1.25 },
  { ticker: 'ORCL', name: 'Oracle', sector: 'Technology', px: 141.3, beta: 1.05 },
  { ticker: 'ADBE', name: 'Adobe', sector: 'Technology', px: 552.8, beta: 1.3 },
  { ticker: 'INTC', name: 'Intel', sector: 'Technology', px: 31.2, beta: 1.15 },
  { ticker: 'QCOM', name: 'Qualcomm', sector: 'Technology', px: 168.4, beta: 1.35 },
  { ticker: 'TXN', name: 'Texas Instruments', sector: 'Technology', px: 196.7, beta: 1.0 },
  { ticker: 'MU', name: 'Micron Technology', sector: 'Technology', px: 106.9, beta: 1.55 },
  { ticker: 'AMAT', name: 'Applied Materials', sector: 'Technology', px: 216.5, beta: 1.5 },
  { ticker: 'LRCX', name: 'Lam Research', sector: 'Technology', px: 852.3, beta: 1.5 },
  { ticker: 'KLAC', name: 'KLA Corporation', sector: 'Technology', px: 742.6, beta: 1.4 },
  { ticker: 'ADI', name: 'Analog Devices', sector: 'Technology', px: 228.4, beta: 1.15 },
  { ticker: 'NOW', name: 'ServiceNow', sector: 'Technology', px: 812.5, beta: 1.1 },
  { ticker: 'INTU', name: 'Intuit', sector: 'Technology', px: 632.8, beta: 1.15 },
  { ticker: 'PANW', name: 'Palo Alto Networks', sector: 'Technology', px: 342.1, beta: 1.1 },
  { ticker: 'SNPS', name: 'Synopsys', sector: 'Technology', px: 542.3, beta: 1.05 },
  { ticker: 'CDNS', name: 'Cadence Design Systems', sector: 'Technology', px: 272.6, beta: 1.0 },
  { ticker: 'IBM', name: 'IBM', sector: 'Technology', px: 191.4, beta: 0.75 },
  { ticker: 'ACN', name: 'Accenture', sector: 'Technology', px: 322.7, beta: 1.05 },
  { ticker: 'CSCO', name: 'Cisco Systems', sector: 'Technology', px: 48.6, beta: 0.85 },
  { ticker: 'DELL', name: 'Dell Technologies', sector: 'Technology', px: 122.4, beta: 1.4 },
  { ticker: 'HPQ', name: 'HP Inc.', sector: 'Technology', px: 35.8, beta: 1.05 },
  { ticker: 'ANET', name: 'Arista Networks', sector: 'Technology', px: 342.9, beta: 1.35 },
  { ticker: 'MRVL', name: 'Marvell Technology', sector: 'Technology', px: 72.4, beta: 1.6 },
  { ticker: 'NXPI', name: 'NXP Semiconductors', sector: 'Technology', px: 248.3, beta: 1.45 },
  { ticker: 'SMCI', name: 'Super Micro Computer', sector: 'Technology', px: 42.6, beta: 1.9 },
  { ticker: 'WDAY', name: 'Workday', sector: 'Technology', px: 232.5, beta: 1.2 },
  { ticker: 'DDOG', name: 'Datadog', sector: 'Technology', px: 118.6, beta: 1.3 },
  { ticker: 'SNOW', name: 'Snowflake', sector: 'Technology', px: 128.4, beta: 1.45 },
  { ticker: 'CRWD', name: 'CrowdStrike', sector: 'Technology', px: 268.2, beta: 1.25 },
  { ticker: 'MDB', name: 'MongoDB', sector: 'Technology', px: 242.8, beta: 1.4 },
  { ticker: 'PLTR', name: 'Palantir', sector: 'Technology', px: 36.8, beta: 1.8 },
  { ticker: 'NET', name: 'Cloudflare', sector: 'Technology', px: 82.6, beta: 1.5 },

  // ---- Communication -------------------------------------------------------
  { ticker: 'GOOGL', name: 'Alphabet', sector: 'Communication', px: 186.9, beta: 1.05 },
  { ticker: 'META', name: 'Meta Platforms', sector: 'Communication', px: 542.7, beta: 1.3 },
  { ticker: 'NFLX', name: 'Netflix', sector: 'Communication', px: 689.5, beta: 1.35 },
  { ticker: 'DIS', name: 'Walt Disney', sector: 'Communication', px: 94.2, beta: 1.2 },
  { ticker: 'CMCSA', name: 'Comcast', sector: 'Communication', px: 39.8, beta: 0.9 },
  { ticker: 'T', name: 'AT&T', sector: 'Communication', px: 21.6, beta: 0.6 },
  { ticker: 'VZ', name: 'Verizon', sector: 'Communication', px: 42.4, beta: 0.5 },
  { ticker: 'TMUS', name: 'T-Mobile US', sector: 'Communication', px: 208.6, beta: 0.7 },
  { ticker: 'EA', name: 'Electronic Arts', sector: 'Communication', px: 146.2, beta: 0.85 },
  { ticker: 'TTWO', name: 'Take-Two Interactive', sector: 'Communication', px: 152.4, beta: 1.0 },
  { ticker: 'RBLX', name: 'Roblox', sector: 'Communication', px: 42.6, beta: 1.55 },
  { ticker: 'SPOT', name: 'Spotify', sector: 'Communication', px: 348.7, beta: 1.4 },
  { ticker: 'PINS', name: 'Pinterest', sector: 'Communication', px: 32.4, beta: 1.3 },
  { ticker: 'SNAP', name: 'Snap Inc.', sector: 'Communication', px: 10.8, beta: 1.7 },
  { ticker: 'WBD', name: 'Warner Bros. Discovery', sector: 'Communication', px: 7.8, beta: 1.45 },

  // ---- Consumer Discretionary ---------------------------------------------
  { ticker: 'AMZN', name: 'Amazon', sector: 'Consumer Discretionary', px: 198.2, beta: 1.2 },
  { ticker: 'TSLA', name: 'Tesla', sector: 'Consumer Discretionary', px: 254.8, beta: 2.0 },
  { ticker: 'HD', name: 'Home Depot', sector: 'Consumer Discretionary', px: 362.1, beta: 0.95 },
  { ticker: 'MCD', name: "McDonald's", sector: 'Consumer Discretionary', px: 292.4, beta: 0.7 },
  { ticker: 'NKE', name: 'Nike', sector: 'Consumer Discretionary', px: 78.6, beta: 1.05 },
  { ticker: 'SBUX', name: 'Starbucks', sector: 'Consumer Discretionary', px: 96.4, beta: 0.95 },
  { ticker: 'LOW', name: "Lowe's", sector: 'Consumer Discretionary', px: 246.8, beta: 1.0 },
  { ticker: 'TJX', name: 'TJX Companies', sector: 'Consumer Discretionary', px: 112.4, beta: 0.85 },
  { ticker: 'BKNG', name: 'Booking Holdings', sector: 'Consumer Discretionary', px: 3862.0, beta: 1.15 },
  { ticker: 'ABNB', name: 'Airbnb', sector: 'Consumer Discretionary', px: 122.6, beta: 1.2 },
  { ticker: 'MAR', name: 'Marriott International', sector: 'Consumer Discretionary', px: 232.4, beta: 1.25 },
  { ticker: 'CMG', name: 'Chipotle Mexican Grill', sector: 'Consumer Discretionary', px: 56.4, beta: 1.1 },
  { ticker: 'F', name: 'Ford Motor', sector: 'Consumer Discretionary', px: 10.6, beta: 1.4 },
  { ticker: 'GM', name: 'General Motors', sector: 'Consumer Discretionary', px: 46.2, beta: 1.35 },
  { ticker: 'RIVN', name: 'Rivian Automotive', sector: 'Consumer Discretionary', px: 11.4, beta: 2.1 },
  { ticker: 'LULU', name: 'Lululemon Athletica', sector: 'Consumer Discretionary', px: 268.4, beta: 1.2 },
  { ticker: 'ROST', name: 'Ross Stores', sector: 'Consumer Discretionary', px: 148.6, beta: 0.9 },
  { ticker: 'DHI', name: 'D.R. Horton', sector: 'Consumer Discretionary', px: 172.4, beta: 1.4 },
  { ticker: 'YUM', name: 'Yum! Brands', sector: 'Consumer Discretionary', px: 132.6, beta: 0.8 },
  { ticker: 'DKNG', name: 'DraftKings', sector: 'Consumer Discretionary', px: 36.8, beta: 1.75 },

  // ---- Financials ----------------------------------------------------------
  { ticker: 'JPM', name: 'JPMorgan Chase', sector: 'Financials', px: 214.6, beta: 1.05 },
  { ticker: 'GS', name: 'Goldman Sachs', sector: 'Financials', px: 486.3, beta: 1.25 },
  { ticker: 'BAC', name: 'Bank of America', sector: 'Financials', px: 41.7, beta: 1.15 },
  { ticker: 'WFC', name: 'Wells Fargo', sector: 'Financials', px: 58.4, beta: 1.1 },
  { ticker: 'C', name: 'Citigroup', sector: 'Financials', px: 62.8, beta: 1.3 },
  { ticker: 'MS', name: 'Morgan Stanley', sector: 'Financials', px: 102.6, beta: 1.2 },
  { ticker: 'BLK', name: 'BlackRock', sector: 'Financials', px: 872.4, beta: 1.15 },
  { ticker: 'SCHW', name: 'Charles Schwab', sector: 'Financials', px: 64.2, beta: 1.05 },
  { ticker: 'AXP', name: 'American Express', sector: 'Financials', px: 246.8, beta: 1.2 },
  { ticker: 'V', name: 'Visa', sector: 'Financials', px: 274.6, beta: 0.95 },
  { ticker: 'MA', name: 'Mastercard', sector: 'Financials', px: 468.2, beta: 1.0 },
  { ticker: 'PYPL', name: 'PayPal', sector: 'Financials', px: 68.4, beta: 1.45 },
  { ticker: 'COIN', name: 'Coinbase Global', sector: 'Financials', px: 178.6, beta: 2.2 },
  { ticker: 'SPGI', name: 'S&P Global', sector: 'Financials', px: 486.2, beta: 1.1 },
  { ticker: 'CME', name: 'CME Group', sector: 'Financials', px: 198.4, beta: 0.5 },
  { ticker: 'BX', name: 'Blackstone', sector: 'Financials', px: 138.6, beta: 1.5 },
  { ticker: 'KKR', name: 'KKR & Co.', sector: 'Financials', px: 118.2, beta: 1.55 },
  { ticker: 'PGR', name: 'Progressive', sector: 'Financials', px: 226.4, beta: 0.5 },
  { ticker: 'USB', name: 'U.S. Bancorp', sector: 'Financials', px: 44.2, beta: 1.05 },
  { ticker: 'PNC', name: 'PNC Financial Services', sector: 'Financials', px: 178.4, beta: 1.1 },
  { ticker: 'HOOD', name: 'Robinhood Markets', sector: 'Financials', px: 22.4, beta: 1.9 },

  // ---- Energy --------------------------------------------------------------
  { ticker: 'XOM', name: 'Exxon Mobil', sector: 'Energy', px: 116.4, beta: 0.85 },
  { ticker: 'CVX', name: 'Chevron', sector: 'Energy', px: 154.2, beta: 0.9 },
  { ticker: 'COP', name: 'ConocoPhillips', sector: 'Energy', px: 108.6, beta: 1.1 },
  { ticker: 'SLB', name: 'SLB', sector: 'Energy', px: 44.2, beta: 1.3 },
  { ticker: 'EOG', name: 'EOG Resources', sector: 'Energy', px: 124.8, beta: 1.05 },
  { ticker: 'PSX', name: 'Phillips 66', sector: 'Energy', px: 132.4, beta: 1.15 },
  { ticker: 'MPC', name: 'Marathon Petroleum', sector: 'Energy', px: 168.2, beta: 1.2 },
  { ticker: 'OXY', name: 'Occidental Petroleum', sector: 'Energy', px: 56.4, beta: 1.35 },
  { ticker: 'VLO', name: 'Valero Energy', sector: 'Energy', px: 148.6, beta: 1.2 },
  { ticker: 'WMB', name: 'Williams Companies', sector: 'Energy', px: 42.8, beta: 0.85 },
  { ticker: 'KMI', name: 'Kinder Morgan', sector: 'Energy', px: 20.4, beta: 0.8 },
  { ticker: 'HAL', name: 'Halliburton', sector: 'Energy', px: 30.2, beta: 1.45 },
  { ticker: 'DVN', name: 'Devon Energy', sector: 'Energy', px: 42.6, beta: 1.4 },
  { ticker: 'FANG', name: 'Diamondback Energy', sector: 'Energy', px: 186.4, beta: 1.35 },

  // ---- Health Care ---------------------------------------------------------
  { ticker: 'UNH', name: 'UnitedHealth', sector: 'Health Care', px: 512.3, beta: 0.7 },
  { ticker: 'LLY', name: 'Eli Lilly', sector: 'Health Care', px: 824.6, beta: 0.8 },
  { ticker: 'JNJ', name: 'Johnson & Johnson', sector: 'Health Care', px: 152.9, beta: 0.55 },
  { ticker: 'ABBV', name: 'AbbVie', sector: 'Health Care', px: 182.4, beta: 0.65 },
  { ticker: 'MRK', name: 'Merck & Co.', sector: 'Health Care', px: 112.6, beta: 0.5 },
  { ticker: 'PFE', name: 'Pfizer', sector: 'Health Care', px: 28.4, beta: 0.6 },
  { ticker: 'TMO', name: 'Thermo Fisher Scientific', sector: 'Health Care', px: 582.4, beta: 0.85 },
  { ticker: 'ABT', name: 'Abbott Laboratories', sector: 'Health Care', px: 108.2, beta: 0.75 },
  { ticker: 'DHR', name: 'Danaher', sector: 'Health Care', px: 248.6, beta: 0.9 },
  { ticker: 'BMY', name: 'Bristol-Myers Squibb', sector: 'Health Care', px: 48.2, beta: 0.55 },
  { ticker: 'AMGN', name: 'Amgen', sector: 'Health Care', px: 322.4, beta: 0.6 },
  { ticker: 'GILD', name: 'Gilead Sciences', sector: 'Health Care', px: 78.6, beta: 0.5 },
  { ticker: 'CVS', name: 'CVS Health', sector: 'Health Care', px: 62.4, beta: 0.7 },
  { ticker: 'CI', name: 'Cigna Group', sector: 'Health Care', px: 342.6, beta: 0.65 },
  { ticker: 'ELV', name: 'Elevance Health', sector: 'Health Care', px: 512.4, beta: 0.7 },
  { ticker: 'MDT', name: 'Medtronic', sector: 'Health Care', px: 84.2, beta: 0.75 },
  { ticker: 'ISRG', name: 'Intuitive Surgical', sector: 'Health Care', px: 462.8, beta: 1.05 },
  { ticker: 'VRTX', name: 'Vertex Pharmaceuticals', sector: 'Health Care', px: 462.4, beta: 0.6 },
  { ticker: 'REGN', name: 'Regeneron Pharmaceuticals', sector: 'Health Care', px: 1042.6, beta: 0.7 },
  { ticker: 'MRNA', name: 'Moderna', sector: 'Health Care', px: 68.4, beta: 1.6 },
  { ticker: 'SYK', name: 'Stryker', sector: 'Health Care', px: 342.8, beta: 0.9 },
  { ticker: 'BSX', name: 'Boston Scientific', sector: 'Health Care', px: 78.4, beta: 0.85 },
  { ticker: 'ZTS', name: 'Zoetis', sector: 'Health Care', px: 178.6, beta: 0.85 },
  { ticker: 'HCA', name: 'HCA Healthcare', sector: 'Health Care', px: 342.4, beta: 1.15 },

  // ---- Industrials ---------------------------------------------------------
  { ticker: 'CAT', name: 'Caterpillar', sector: 'Industrials', px: 348.5, beta: 1.1 },
  { ticker: 'BA', name: 'Boeing', sector: 'Industrials', px: 182.4, beta: 1.4 },
  { ticker: 'GE', name: 'GE Aerospace', sector: 'Industrials', px: 168.7, beta: 1.15 },
  { ticker: 'HON', name: 'Honeywell', sector: 'Industrials', px: 208.4, beta: 1.0 },
  { ticker: 'UPS', name: 'United Parcel Service', sector: 'Industrials', px: 132.6, beta: 1.0 },
  { ticker: 'RTX', name: 'RTX Corporation', sector: 'Industrials', px: 118.4, beta: 0.85 },
  { ticker: 'LMT', name: 'Lockheed Martin', sector: 'Industrials', px: 542.8, beta: 0.5 },
  { ticker: 'UNP', name: 'Union Pacific', sector: 'Industrials', px: 242.6, beta: 1.05 },
  { ticker: 'DE', name: 'Deere & Company', sector: 'Industrials', px: 402.4, beta: 1.0 },
  { ticker: 'MMM', name: '3M', sector: 'Industrials', px: 132.8, beta: 1.0 },
  { ticker: 'GD', name: 'General Dynamics', sector: 'Industrials', px: 292.4, beta: 0.7 },
  { ticker: 'NOC', name: 'Northrop Grumman', sector: 'Industrials', px: 482.6, beta: 0.55 },
  { ticker: 'ETN', name: 'Eaton', sector: 'Industrials', px: 312.4, beta: 1.2 },
  { ticker: 'EMR', name: 'Emerson Electric', sector: 'Industrials', px: 108.6, beta: 1.25 },
  { ticker: 'CSX', name: 'CSX Corporation', sector: 'Industrials', px: 34.2, beta: 1.15 },
  { ticker: 'NSC', name: 'Norfolk Southern', sector: 'Industrials', px: 246.8, beta: 1.2 },
  { ticker: 'FDX', name: 'FedEx', sector: 'Industrials', px: 298.4, beta: 1.2 },
  { ticker: 'WM', name: 'Waste Management', sector: 'Industrials', px: 208.6, beta: 0.7 },
  { ticker: 'PCAR', name: 'PACCAR', sector: 'Industrials', px: 98.4, beta: 1.15 },
  { ticker: 'DAL', name: 'Delta Air Lines', sector: 'Industrials', px: 46.2, beta: 1.3 },
  { ticker: 'UAL', name: 'United Airlines', sector: 'Industrials', px: 58.4, beta: 1.5 },
  { ticker: 'UBER', name: 'Uber Technologies', sector: 'Industrials', px: 72.4, beta: 1.35 },

  // ---- Consumer Staples ----------------------------------------------------
  { ticker: 'WMT', name: 'Walmart', sector: 'Consumer Staples', px: 78.6, beta: 0.55 },
  { ticker: 'COST', name: 'Costco', sector: 'Consumer Staples', px: 872.4, beta: 0.8 },
  { ticker: 'PG', name: 'Procter & Gamble', sector: 'Consumer Staples', px: 168.2, beta: 0.45 },
  { ticker: 'KO', name: 'Coca-Cola', sector: 'Consumer Staples', px: 68.4, beta: 0.55 },
  { ticker: 'PEP', name: 'PepsiCo', sector: 'Consumer Staples', px: 168.2, beta: 0.5 },
  { ticker: 'PM', name: 'Philip Morris International', sector: 'Consumer Staples', px: 118.6, beta: 0.65 },
  { ticker: 'MO', name: 'Altria Group', sector: 'Consumer Staples', px: 52.4, beta: 0.6 },
  { ticker: 'MDLZ', name: 'Mondelez International', sector: 'Consumer Staples', px: 68.8, beta: 0.55 },
  { ticker: 'CL', name: 'Colgate-Palmolive', sector: 'Consumer Staples', px: 96.4, beta: 0.45 },
  { ticker: 'KMB', name: 'Kimberly-Clark', sector: 'Consumer Staples', px: 138.2, beta: 0.5 },
  { ticker: 'GIS', name: 'General Mills', sector: 'Consumer Staples', px: 72.6, beta: 0.35 },
  { ticker: 'KR', name: 'Kroger', sector: 'Consumer Staples', px: 56.8, beta: 0.5 },
  { ticker: 'TGT', name: 'Target', sector: 'Consumer Staples', px: 148.6, beta: 0.95 },
  { ticker: 'DG', name: 'Dollar General', sector: 'Consumer Staples', px: 82.4, beta: 0.6 },
  { ticker: 'STZ', name: 'Constellation Brands', sector: 'Consumer Staples', px: 242.8, beta: 0.85 },
  { ticker: 'HSY', name: 'Hershey', sector: 'Consumer Staples', px: 188.4, beta: 0.4 },
  { ticker: 'EL', name: 'Estée Lauder', sector: 'Consumer Staples', px: 96.2, beta: 1.0 },

  // ---- Utilities -----------------------------------------------------------
  { ticker: 'NEE', name: 'NextEra Energy', sector: 'Utilities', px: 74.8, beta: 0.6 },
  { ticker: 'DUK', name: 'Duke Energy', sector: 'Utilities', px: 112.4, beta: 0.45 },
  { ticker: 'SO', name: 'Southern Company', sector: 'Utilities', px: 88.6, beta: 0.45 },
  { ticker: 'D', name: 'Dominion Energy', sector: 'Utilities', px: 56.2, beta: 0.55 },
  { ticker: 'AEP', name: 'American Electric Power', sector: 'Utilities', px: 98.4, beta: 0.5 },
  { ticker: 'EXC', name: 'Exelon', sector: 'Utilities', px: 38.6, beta: 0.55 },
  { ticker: 'SRE', name: 'Sempra', sector: 'Utilities', px: 82.4, beta: 0.6 },
  { ticker: 'XEL', name: 'Xcel Energy', sector: 'Utilities', px: 66.8, beta: 0.45 },
  { ticker: 'ED', name: 'Consolidated Edison', sector: 'Utilities', px: 98.2, beta: 0.35 },
  { ticker: 'PEG', name: 'Public Service Enterprise Group', sector: 'Utilities', px: 84.6, beta: 0.6 },

  // ---- Materials -----------------------------------------------------------
  { ticker: 'LIN', name: 'Linde', sector: 'Materials', px: 452.6, beta: 0.85 },
  { ticker: 'SHW', name: 'Sherwin-Williams', sector: 'Materials', px: 362.4, beta: 1.1 },
  { ticker: 'APD', name: 'Air Products and Chemicals', sector: 'Materials', px: 292.6, beta: 0.85 },
  { ticker: 'ECL', name: 'Ecolab', sector: 'Materials', px: 246.8, beta: 0.9 },
  { ticker: 'NEM', name: 'Newmont', sector: 'Materials', px: 48.2, beta: 0.8 },
  { ticker: 'FCX', name: 'Freeport-McMoRan', sector: 'Materials', px: 46.4, beta: 1.5 },
  { ticker: 'DOW', name: 'Dow Inc.', sector: 'Materials', px: 52.6, beta: 1.25 },
  { ticker: 'DD', name: 'DuPont de Nemours', sector: 'Materials', px: 84.2, beta: 1.2 },
  { ticker: 'NUE', name: 'Nucor', sector: 'Materials', px: 158.4, beta: 1.4 },
  { ticker: 'PPG', name: 'PPG Industries', sector: 'Materials', px: 128.6, beta: 1.1 },
  { ticker: 'VMC', name: 'Vulcan Materials', sector: 'Materials', px: 262.4, beta: 1.05 },
  { ticker: 'ALB', name: 'Albemarle', sector: 'Materials', px: 88.4, beta: 1.6 },
];

export const SECTORS: Sector[] = [
  'Technology',
  'Communication',
  'Consumer Discretionary',
  'Financials',
  'Energy',
  'Health Care',
  'Industrials',
  'Consumer Staples',
  'Utilities',
  'Materials',
];

const BY_TICKER = new Map(UNIVERSE.map(u => [u.ticker, u]));

export function bySector(sector: Sector): UniverseName[] {
  return UNIVERSE.filter(u => u.sector === sector);
}

export function lookup(ticker: string): UniverseName | undefined {
  return BY_TICKER.get(ticker);
}
