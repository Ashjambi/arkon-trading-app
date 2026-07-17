import { describe, it, expect } from 'vitest';
import { calculateEMA, calculateRSI, calculateGarmanKlassVolatility } from './indicators';

describe('indicators', () => {
  it('should calculate EMA correctly', () => {
    const data = [10, 11, 12, 13, 14];
    const ema = calculateEMA(data, 3);
    expect(ema.length).toBe(5);
    expect(ema[ema.length - 1]).toBeGreaterThan(10);
  });

  it('should calculate RSI correctly', () => {
    const data = [10, 11, 12, 13, 14, 15, 14, 13, 12, 11, 10, 11, 12, 13, 14];
    const rsi = calculateRSI(data, 14);
    expect(rsi.length).toBe(15);
    expect(rsi[rsi.length - 1]).toBeGreaterThan(0);
    expect(rsi[rsi.length - 1]).toBeLessThan(100);
  });

  it('should calculate Garman-Klass Volatility correctly', () => {
    const opens = [9.5, 10.5, 11.5, 12.5, 13.5];
    const highs = [10, 11, 12, 13, 14];
    const lows = [9, 10, 11, 12, 13];
    const closes = [9.5, 10.5, 11.5, 12.5, 13.5];
    const vol = calculateGarmanKlassVolatility(opens, highs, lows, closes, 3);
    expect(vol).toBeGreaterThan(0);
  });
});
