import type { StockSleeves } from './stocks';

/**
 * Factor guide — plain-language definition of each scoring sleeve, drawn from
 * the engine's own thesis vocabulary. Shared by the stock drawer and the
 * board-level "Factors" popover so the definitions never drift between the two.
 * Kept out of the drawer component file so that file only exports a component.
 */
export const FACTOR_GUIDE: {
  key: keyof StockSleeves;
  short: string;
  name: string;
  desc: string;
}[] = [
  {
    key: 'momentum',
    short: 'Mom',
    name: 'Momentum',
    desc: 'Trend & RSI posture — is price working with the trade or against it.',
  },
  {
    key: 'quality',
    short: 'Qual',
    name: 'Quality',
    desc: 'Fundamental screen — margins, growth and balance-sheet health.',
  },
  {
    key: 'flow',
    short: 'Flow',
    name: 'Flow',
    desc: 'Positioning — options flow and dark-pool lean, accumulation vs distribution.',
  },
  {
    key: 'news',
    short: 'News',
    name: 'News',
    desc: 'News-tape sentiment — headline tailwind against live headline risk.',
  },
];
