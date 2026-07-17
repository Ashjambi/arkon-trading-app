import { describe, it, expect } from 'vitest';
import { calculateKelly, statisticalSignificanceTest } from './signalUtils';

describe('signalUtils', () => {
  it('should calculate Kelly correctly', () => {
    // p = 0.55, b = 2.5, q = 0.45
    // Kelly = (0.55 * 2.5 - 0.45) / 2.5 = (1.375 - 0.45) / 2.5 = 0.925 / 2.5 = 0.37
    // Capped at 0.25
    expect(calculateKelly(0.55, 2.5)).toBe(0.25);
    expect(calculateKelly(0.1, 2.5)).toBe(0);
  });

  it('should calculate statisticalSignificanceTest correctly', () => {
    const data = Array.from({ length: 40 }, () => Math.random());
    const result = statisticalSignificanceTest(data);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(1);
  });
});
