import { describe, it, expect } from 'vitest';
import { mean, stdDev, calculateZScore } from './mathUtils';

describe('mathUtils', () => {
  it('should calculate mean correctly', () => {
    expect(mean([1, 2, 3, 4, 5])).toBe(3);
    expect(mean([])).toBe(0);
  });

  it('should calculate stdDev correctly', () => {
    expect(stdDev([1, 2, 3, 4, 5])).toBeCloseTo(1.414, 3);
    expect(stdDev([])).toBe(0);
  });

  it('should calculate Z-Score correctly', () => {
    const history = [1, 2, 3, 4, 5];
    const current = 6;
    // mean = 3, stdDev = 1.414, z = (6-3)/1.414 = 2.121
    expect(calculateZScore(current, history)).toBeCloseTo(2.121, 3);
  });
});
