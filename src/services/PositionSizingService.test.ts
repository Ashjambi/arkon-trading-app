import { describe, it, expect } from 'vitest';
import { allocateWeightedSizes } from './PositionSizingService';
import { TradingSignal } from '../types';

describe('PositionSizingService', () => {
  it('Equal-quality split', () => {
    const signals = [
      { id: '1', qualityScore: 80 } as TradingSignal,
      { id: '2', qualityScore: 80 } as TradingSignal
    ];
    const result = allocateWeightedSizes(signals, 1.0);
    expect(result.length).toBe(2);
    expect(result[0].recommendedSize).toBeCloseTo(0.5);
    expect(result[1].recommendedSize).toBeCloseTo(0.5);
  });

  it('Weighted split', () => {
    const signals = [
      { id: '1', qualityScore: 90 } as TradingSignal,
      { id: '2', qualityScore: 60 } as TradingSignal
    ];
    const result = allocateWeightedSizes(signals, 1.0);
    expect(result.length).toBe(2);
    expect(result[0].recommendedSize).toBeCloseTo(0.6); // 90/150 = 0.6
    expect(result[1].recommendedSize).toBeCloseTo(0.4); // 60/150 = 0.4
  });

  it('Three-way weighted split', () => {
    const signals = [
      { id: '1', qualityScore: 100 } as TradingSignal,
      { id: '2', qualityScore: 50 } as TradingSignal,
      { id: '3', qualityScore: 50 } as TradingSignal
    ];
    const result = allocateWeightedSizes(signals, 2.0);
    expect(result.length).toBe(3);
    expect(result[0].recommendedSize).toBeCloseTo(1.0); // 100/200 * 2 = 1.0
    expect(result[1].recommendedSize).toBeCloseTo(0.5); // 50/200 * 2 = 0.5
    expect(result[2].recommendedSize).toBeCloseTo(0.5); // 50/200 * 2 = 0.5
    
    const sum = result.reduce((acc, r) => acc + (r.recommendedSize || 0), 0);
    expect(sum).toBeCloseTo(2.0);
  });

  it('Missing/invalid scores fallback to equal split', () => {
    const signals = [
      { id: '1' } as TradingSignal, // undefined
      { id: '2', qualityScore: -5 } as TradingSignal,
      { id: '3', qualityScore: 0 } as TradingSignal
    ];
    const result = allocateWeightedSizes(signals, 3.0);
    expect(result.length).toBe(3);
    expect(result[0].recommendedSize).toBeCloseTo(1.0);
    expect(result[1].recommendedSize).toBeCloseTo(1.0);
    expect(result[2].recommendedSize).toBeCloseTo(1.0);
  });

  it('Single signal', () => {
    const signals = [{ id: '1', qualityScore: 80 } as TradingSignal];
    const result = allocateWeightedSizes(signals, 1.25);
    expect(result.length).toBe(1);
    expect(result[0].recommendedSize).toBeCloseTo(1.25);
  });

  it('Empty signals', () => {
    const result = allocateWeightedSizes([], 1.0);
    expect(result.length).toBe(0);
  });
  
  it('Should preserve total sum', () => {
    const signals = [
      { id: '1', qualityScore: 13 } as TradingSignal,
      { id: '2', qualityScore: 47 } as TradingSignal,
      { id: '3', qualityScore: 99 } as TradingSignal
    ];
    const result = allocateWeightedSizes(signals, 1.0);
    const sum = result.reduce((acc, r) => acc + (r.recommendedSize || 0), 0);
    expect(sum).toBeCloseTo(1.0);
  });
});
