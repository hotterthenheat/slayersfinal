/*
  The recorded names, imported explicitly.

  This list used to be an `import.meta.glob` in core/feed.ts, which is a Vite
  transform and does not exist under plain Node — so every headless script that
  reached the feed died on "(intermediate value).glob is not a function"
  before its first assertion. Explicit imports work in both, are tree-shakeable,
  and put the recorded set in source where a reviewer can see it.

  Regenerate by listing src/data/recorded/*.json; tape.json and index.json are
  deliberately not here — they are not per-name recordings.
*/

import AAPL from './AAPL.json';
import AMD from './AMD.json';
import AMZN from './AMZN.json';
import AVGO from './AVGO.json';
import BA from './BA.json';
import COIN from './COIN.json';
import CRM from './CRM.json';
import DIS from './DIS.json';
import GOOGL from './GOOGL.json';
import INTC from './INTC.json';
import JPM from './JPM.json';
import META from './META.json';
import MSFT from './MSFT.json';
import MU from './MU.json';
import NFLX from './NFLX.json';
import NVDA from './NVDA.json';
import ORCL from './ORCL.json';
import PLTR from './PLTR.json';
import QQQ from './QQQ.json';
import SPY from './SPY.json';
import TSLA from './TSLA.json';
import UBER from './UBER.json';

/** Ticker -> recording. Shapes are validated by the consumer. */
export const RECORDED: Record<string, unknown> = {
  AAPL,
  AMD,
  AMZN,
  AVGO,
  BA,
  COIN,
  CRM,
  DIS,
  GOOGL,
  INTC,
  JPM,
  META,
  MSFT,
  MU,
  NFLX,
  NVDA,
  ORCL,
  PLTR,
  QQQ,
  SPY,
  TSLA,
  UBER,
};
