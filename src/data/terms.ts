/*
==================================================
  SLAYER TERMINAL - TERM DICTIONARY
  One-line plain-English definitions behind the
  dotted-underline Term explainer (Noah, 2026-08-19:
  "what is revision? what is options vs history?
  these things just sound so abstract"). Keys read
  as the label they explain; definitions say what
  the number means to a person, never how the
  engine computes it.
==================================================
*/

export const TERMS = {
  'Expected move': 'The move options are charging for this report — the market’s own guess, as a ± percent.',
  'Typical move': 'How far the stock actually moved after each of its last 8 reports, averaged.',
  'Priced vs typical':
    'Today’s expected move divided by the typical one. Above 1.00×, the market charges more than this name usually delivers; below it, less.',
  'Last 8 reports': 'Each square is one past report — green beat earnings estimates, red missed. The percent is the beat rate.',
  'Up vs down': 'The odds the post-earnings move is up rather than down, read from options flow and analyst revisions.',
  'IV rank':
    'Where this name’s option prices sit against their own past year, 0–100. Toward 100, they’re about as expensive as they ever get.',
  'Straddle cost':
    'What it costs to own the move in both directions at once — the market’s price tag on the event, in dollars per share.',
  Revisions: 'Which way analysts have been nudging their estimates into the report. Drifting up = quiet upgrades.',
  // ---- earnings hub ----
  'Implied vs realized': 'What options charge for this print, drawn against what the stock actually did after past reports.',
  'Beat rate': 'How often the company beat earnings estimates across its last 8 reports.',
  Pricing: 'Our verdict on the price of the move — overpriced, fair, or underpriced against the name’s own history.',
  // ---- tape ----
  'Exp · DTE': 'The contract’s expiry date and the days until it — an orange 0d expires today.',
  OTM: 'How far the strike sits out of the money. The stock must move this far for the contract to have value at expiry.',
  Spread: 'The bid and ask at print time — the dot marks where between them the order filled.',
  Prem: 'The print’s total dollars: size × fill price × 100.',
  Flow: 'Which side the print leaned — BUY paid the offer, SELL hit the bid, MID negotiated in between.',
  'Day ratio': 'Where the day’s fills on this contract sat between bid and ask. Bid-heavy reads as selling, ask-heavy as buying.',
  Sentiment: 'The direction the money implies. Calls bought or puts sold read bullish; calls sold or puts bought read bearish.',
  'ΔOI': 'The overnight change in open interest — positions opened (▲) or closed (▼) since yesterday’s close.',
  'V/OI': 'Today’s volume against open interest. Above 1×, the contract traded more today than every position that existed this morning.',
  IV: 'Implied volatility — the size of move the option’s price is betting on, stated annualized.',
  Tag: 'How the order executed. A SWEEP raced across exchanges at once — the aggressive fingerprint; custom and ratio prints are parts of structures.',
  // ---- strikes & levels ----
  GEX: 'Gamma exposure — the dealer hedging weight at a strike. It decides whether moves get absorbed there or amplified.',
  'Net GEX': 'Call and put gamma netted at a strike. Negative = call-heavy = dealers absorb moves there; positive = put-heavy = dealers amplify.',
  'Net DEX': 'Net delta exposure — the directional share risk dealers carry from the options at that strike.',
  'Net VEX': 'Net vega exposure — how much dealer books swing as implied volatility moves.',
  BPS: 'Distance from the current price in basis points — 100 bps = 1%.',
  NBR: 'Neighbor ratio — this strike’s volume against the strikes beside it. High means the activity is concentrated here, not spread out.',
  Priority:
    'The strike’s structural weight today, and WHY: the bar is split into its reasons, always in this order — net GEX, open interest, volume, neighbor ratio, distance from spot. A longer segment is a bigger reason. The scale behind the bar is internal.',
  'Ranked by': 'The lens the ladder is ordered through — the composite priority, or one of its reasons alone. Rank numbers follow the lens; the bar stays the composite.',
  Class: 'What dealer hedging does at this strike — a cushion under price, resistance above it, or a magnet that pins.',
  'Call wall': 'The heaviest call-gamma strike above price. Dealer hedging supplies stock there, so rallies often stall at it.',
  'Put wall': 'The heaviest put-gamma strike below price. Dealer hedging bids stock there, so dips often hold it.',
  'Gamma flip': 'The price where dealer hedging switches sides — above it moves get absorbed, below it they get amplified.',
  Pin: 'The max-open-interest strike that price tends to gravitate toward into expiry.',
  King: 'The single largest gamma strike on the whole book — the level that matters most today.',
  // ---- contracts driving the setup ----
  'Gamma share': 'This contract’s slice of the whole book’s gamma, as a percent. The bigger the slice, the more dealer hedging this one strike commands.',
  'From spot': 'How far the strike sits from the current price — plus above it, minus below. The nearer, the more its hedging bears on today’s tape.',
  Exposure: 'The dealer gamma this one contract carries, in dollars. Negative = dealers absorb moves at it; positive = they amplify them.',
  'In the path': 'A heavy strike between the current price and the campaign’s final target — hedging the move has to get through on its way.',
  // ---- strike pressure ladder ----
  'Open interest': 'Contracts outstanding at this strike, calls and puts together — the positions that exist, whether or not they traded today.',
  Volume: 'Contracts that traded at this strike today. Volume near open interest means the strike is being actively repositioned.',
  Tail: 'A strike far from the current price carrying far more gamma than its neighbours — protective positioning. Quiet until price gets there, or until it builds fast on a news day.',
  Puts: 'The dealer gamma from the put side at this strike, in gold. In this book the put side amplifies moves — dealers chase price through it.',
  Calls: 'The dealer gamma from the call side at this strike, in steel. In this book the call side absorbs moves — dealers lean against price there.',
  Charm: 'The pull of the clock on dealer hedges — as options decay toward the close, hedges unwind where gamma sits heaviest.',
  Vanna: 'How dealer hedges re-price when implied volatility moves — a vol crush or spike forces mechanical buying or selling with spot unchanged.',
  // ---- greeks ----
  Delta: 'How much the option’s price moves for a $1 move in the stock.',
  Gamma: 'How fast delta itself changes as the stock moves — the curvature.',
  Theta: 'What one day costs — the premium the option loses to time overnight.',
  Vega: 'How much the option’s price moves for a 1-point change in implied volatility.',
  // ---- session levels (T-6) ----
  'Prior day': 'Yesterday’s high, low and close. Price opening away from them and coming back is the most-watched move of the morning.',
  'Opening range': 'The high and low of the session’s first 5, 15 or 30 minutes — the day’s first agreed boundary. Breaking out of it is where most intraday setups start.',
  'Initial balance': 'The high and low of the first hour. A day that stays inside it is a range day; a day that leaves it usually keeps going.',
  // ---- multi-timeframe (T-12) ----
  'Timeframe trend':
    'Where price sits on each interval against its own EMA21 and VWAP. Above both reads up, below both reads down, and between them reads flat — the timeframes disagreeing is itself the signal.',
  // ---- price scale (T-7) ----
  'Price scale':
    'How the vertical axis is spaced. Linear gives equal dollars equal height; logarithmic gives equal percentages equal height, which is what you want comparing moves at different prices.',
} as const;

export type TermKey = keyof typeof TERMS;
