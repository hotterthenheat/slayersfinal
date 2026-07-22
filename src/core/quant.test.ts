import { describe, it, expect } from 'vitest';
import { histogram } from './quant';

describe('histogram', () => {
  // sorted terminal sample (runMonteCarlo feeds a sorted terminal array)
  const terminal = [90, 95, 98, 100, 102, 105, 110];

  it('produces exactly the requested number of bins', () => {
    expect(histogram(terminal, 100, 10)).toHaveLength(10);
  });

  it('assigns every value to exactly one bin (counts sum to the sample size)', () => {
    const bins = histogram(terminal, 100, 10);
    expect(bins.reduce((sum, b) => sum + b.count, 0)).toBe(terminal.length);
  });

  it('flags the lowest bin below spot and the highest above it', () => {
    const bins = histogram(terminal, 100, 10); // range 90..110, spot 100
    expect(bins[0].aboveSpot).toBe(false);
    expect(bins[bins.length - 1].aboveSpot).toBe(true);
  });

  it('is resilient to a degenerate (flat) terminal range', () => {
    const flat = [100, 100, 100];
    const bins = histogram(flat, 100, 8);
    expect(bins).toHaveLength(8);
    expect(bins.reduce((sum, b) => sum + b.count, 0)).toBe(flat.length);
  });
});
