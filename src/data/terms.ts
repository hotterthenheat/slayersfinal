/*
==================================================
  SLAYER TERMINAL - TERM DICTIONARY (terms.ts)
  One-line explainers for the abbreviations the
  terminal uses in column headers, badges and
  labels. Surfaced in place by <Term>; the long-
  form versions live in Guide → Concepts.
==================================================
*/

export const TERMS = {
  GEX: 'Gamma exposure — net dealer gamma at a strike. Positive: dealers dampen moves; negative: they amplify them.',
  DEX: 'Delta exposure — delta notional by strike. Calls count positive, puts negative.',
  VEX: 'Vanna exposure — how dealer delta shifts per 1% change in implied vol.',
  OI: 'Open interest — option contracts outstanding at the strike.',
  DTE: 'Days to expiry.',
  '0DTE': 'Expires today — gamma at its most explosive.',
  'OTM%': 'Out of the money — how far the strike sits beyond spot, as % of spot.',
  IV: 'Implied volatility — the movement the option market is pricing in.',
  '1σ': 'Expected move — the ±1 standard deviation range implied by option prices.',
  POC: 'Point of control — the price where the most volume traded this session.',
  VWAP: 'Volume-weighted average price for the session.',
  Charm: 'Delta decay from time passing — hedge flow that accrues into the close.',
  Vanna: 'Delta shift from an IV change — a vol move forces hedging even at flat price.',
  Sweep: 'One order taking multiple exchanges at once — a signature of urgency.',
  Block: 'A large trade crossed in one negotiated clip.',
  Type: 'Sweep — one order taking multiple exchanges at once (urgency). Block — a large trade crossed in one clip.',
  Pin: 'The max-open-interest strike price gravitates toward into expiry.',
  Flip: 'The price where net dealer gamma changes sign — dampening above, amplifying below.',
  King: 'The strike carrying the largest absolute exposure on the board.',
  Sig: 'Signal score — size, aggression, OTM distance, sweep and urgency composited to 0–1.',
  X: 'Execution side — Ask: buyer lifted the offer (aggressive). Bid: seller hit the bid. Mid: negotiated between.',
  'P/C': 'Put or call.',
  ATS: 'Alternative trading system — an off-exchange (dark-pool) venue.',
  DP: 'Dark pool — off-exchange prints that hit the tape after crossing.',
  Delta: 'How much the option price moves per $1 of spot — also the hedge ratio.',
  Gamma: 'How fast delta itself changes as spot moves — the convexity dealers must hedge.',
  Theta: 'Time decay — premium the position loses per day, all else equal.',
  Vega: 'Sensitivity to implied vol — P&L per 1 point of IV change.',
  NBR: 'Neighbor ratio — strike volume vs the average of adjacent strikes. High = an isolated magnet.',
  MFE: 'Max favorable excursion — the best the trade got before exit.',
  MAE: 'Max adverse excursion — the worst drawdown the trade endured.',
  R: 'Result in risk units — profit divided by the amount risked.',
  IVR: 'IV rank — where current implied vol sits in its own 1-year range (0–100).',
  'Vol/OI': 'Volume vs open interest — above 1 means more traded today than existed, i.e. new positioning.',
  ΔOI: 'Change in open interest vs the prior session — positions opened (+) or closed (−).',
  β: 'Beta — how hard the stock moves per 1% of index move.',
  Cmp: 'Compare — pin this row for side-by-side comparison.',
  '30d RS': 'Relative strength vs sector over 30 days — above the line is outperforming.',
  'Est ΔOI/d': 'Estimated open-interest change per day if the current flow pace holds.',
  Dist: 'Distance from spot, signed %.',
  Class: 'Hedging class — how dealer hedging at the strike shapes price: cushion, resistance, or magnet.',
  NBBO: 'National best bid and offer — the best quote across every options exchange at that instant.',
  'E/Q': 'Effective over quoted spread. Effective spread is 2 x |fill − mid|; dividing by the quoted spread says what fraction of the available spread the print gave up. 0 = crossed at the midpoint, 1 = took the quote, above 1 = filled outside the NBBO.',
  EFFECTIVE_SPREAD:
    'Effective spread — 2 x the distance from the fill to the NBBO midpoint. The measured cost of crossing, as opposed to the quoted spread, which is only what was on offer.',
  'Paid to cross':
    'Dollars this print gave up to the spread: |fill − mid| x contracts x 100. Half the effective spread, on every contract.',
} as const;

export type TermKey = keyof typeof TERMS;
