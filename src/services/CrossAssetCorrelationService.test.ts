/**
 * ARKON v50.0.0 — CrossAssetCorrelationService Tests
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { CrossAssetCorrelationService, OpenPosition } from './CrossAssetCorrelationService';

describe('CrossAssetCorrelationService', () => {
  let service: CrossAssetCorrelationService;

  beforeEach(() => {
    service = new CrossAssetCorrelationService();
  });

  // ---------------------------------------------------------------
  // 1. recordReturn & getPairCorrelation — Identical returns → corr ~1
  // ---------------------------------------------------------------
  it('1. identical returns produce correlation ≈ 1', () => {
    for (let i = 0; i < 100; i++) {
      const ret = (Math.random() - 0.5) * 0.02;
      service.recordReturn('BTC', Date.now() + i * 1000, ret);
      service.recordReturn('ETH', Date.now() + i * 1000, ret);
    }

    const corr = service.getPairCorrelation('BTC', 'ETH', 60);
    expect(corr).not.toBeNull();
    expect(corr!).toBeCloseTo(1.0, 5);
  });

  // ---------------------------------------------------------------
  // 2. Inverse returns → corr ~ -1
  // ---------------------------------------------------------------
  it('2. inverse returns produce correlation ≈ -1', () => {
    for (let i = 0; i < 100; i++) {
      const ret = (Math.random() - 0.5) * 0.02;
      service.recordReturn('BTC', Date.now() + i * 1000, ret);
      service.recordReturn('ETH', Date.now() + i * 1000, -ret);
    }

    const corr = service.getPairCorrelation('BTC', 'ETH', 60);
    expect(corr).not.toBeNull();
    expect(corr!).toBeCloseTo(-1.0, 5);
  });

  // ---------------------------------------------------------------
  // 3. Random independent returns → corr ~ 0
  // ---------------------------------------------------------------
  it('3. independent random returns produce correlation ≈ 0', () => {
    for (let i = 0; i < 100; i++) {
      service.recordReturn('BTC', Date.now() + i * 1000, (Math.random() - 0.5) * 0.02);
      service.recordReturn('ETH', Date.now() + i * 1000, (Math.random() - 0.5) * 0.02);
    }

    const corr = service.getPairCorrelation('BTC', 'ETH', 60);
    expect(corr).not.toBeNull();
    expect(Math.abs(corr!)).toBeLessThan(0.5);
  });

  // ---------------------------------------------------------------
  // 4. Insufficient data → null
  // ---------------------------------------------------------------
  it('4. insufficient data returns null', () => {
    for (let i = 0; i < 5; i++) {
      service.recordReturn('BTC', Date.now() + i * 1000, 0.01);
    }

    const corr = service.getPairCorrelation('BTC', 'ETH', 60);
    expect(corr).toBeNull();

    expect(service.getSampleCount('BTC')).toBe(5);
    expect(service.getSampleCount('ETH')).toBe(0);
    expect(service.hasMinimumSamples('BTC')).toBe(false);
    expect(service.hasMinimumSamples('ETH')).toBe(false);
  });

  // ---------------------------------------------------------------
  // 5. Partial data — enough samples only after seeding
  // ---------------------------------------------------------------
  it('5. returns correlation when both assets have enough data', () => {
    for (let i = 0; i < 50; i++) {
      const ret = (Math.random() - 0.5) * 0.01;
      service.recordReturn('BTC', Date.now() + i * 1000, ret);
      service.recordReturn('ETH', Date.now() + i * 1000, ret * 0.5 + (Math.random() - 0.5) * 0.005);
    }

    expect(service.hasMinimumSamples('BTC')).toBe(true);
    expect(service.hasMinimumSamples('ETH')).toBe(true);

    const corr = service.getPairCorrelation('BTC', 'ETH', 50);
    expect(corr).not.toBeNull();
    expect(corr!).toBeGreaterThan(0.3);
  });

  // ---------------------------------------------------------------
  // 6. getCorrelationMultiplier — high correlation → low multiplier
  // ---------------------------------------------------------------
  it('6. high correlation reduces multiplier significantly', () => {
    for (let i = 0; i < 100; i++) {
      const ret = (Math.random() - 0.5) * 0.02;
      service.recordReturn('BTC', Date.now() + i * 1000, ret);
      service.recordReturn('ETH', Date.now() + i * 1000, ret);
    }

    const openPositions: OpenPosition[] = [
      { asset: 'BTC', direction: 'LONG', size: 1.0 },
    ];

    const multiplier = service.getCorrelationMultiplier('ETH', 'LONG', openPositions, 60);
    expect(multiplier).toBeLessThan(0.5);
    expect(multiplier).toBeGreaterThanOrEqual(0);

    const multiplierOpposite = service.getCorrelationMultiplier('ETH', 'SHORT', openPositions, 60);
    expect(multiplierOpposite).toBe(1.0);
  });

  // ---------------------------------------------------------------
  // 7. getCorrelationMultiplier — no positions → multiplier = 1
  // ---------------------------------------------------------------
  it('7. no open positions gives multiplier = 1', () => {
    for (let i = 0; i < 100; i++) {
      service.recordReturn('ETH', Date.now() + i * 1000, (Math.random() - 0.5) * 0.02);
    }

    const multiplier = service.getCorrelationMultiplier('ETH', 'LONG', [], 60);
    expect(multiplier).toBe(1.0);
  });

  // ---------------------------------------------------------------
  // 8. getCorrelationMultiplier — low correlation → ~1 multiplier
  // ---------------------------------------------------------------
  it('8. low correlation gives multiplier ≈ 1', () => {
    for (let i = 0; i < 100; i++) {
      service.recordReturn('BTC', Date.now() + i * 1000, (Math.random() - 0.5) * 0.02);
      service.recordReturn('GOLD', Date.now() + i * 1000, (Math.random() - 0.5) * 0.005);
    }

    const openPositions: OpenPosition[] = [
      { asset: 'BTC', direction: 'LONG', size: 1.0 },
    ];

    const multiplier = service.getCorrelationMultiplier('GOLD', 'LONG', openPositions, 60);
    expect(multiplier).toBe(1.0);
  });

  // ---------------------------------------------------------------
  // 9. shouldBlockForCorrelation — extreme correlation → blocked
  // ---------------------------------------------------------------
  it('9. extreme correlation should block the trade', () => {
    for (let i = 0; i < 100; i++) {
      const ret = (Math.random() - 0.5) * 0.02;
      service.recordReturn('BTC', Date.now() + i * 1000, ret);
      service.recordReturn('ETH', Date.now() + i * 1000, ret);
    }

    const openPositions: OpenPosition[] = [
      { asset: 'BTC', direction: 'LONG', size: 1.0 },
    ];

    const result = service.shouldBlockForCorrelation('ETH', 'LONG', openPositions, 60);
    expect(result.blocked).toBe(true);
    expect(result.reason).toContain('correlation');

    const resultOpposite = service.shouldBlockForCorrelation('ETH', 'SHORT', openPositions, 60);
    expect(resultOpposite.blocked).toBe(false);
  });

  // ---------------------------------------------------------------
  // 10. computeCorrelationMatrix — returns all pairs
  // ---------------------------------------------------------------
  it('10. computeCorrelationMatrix returns pairs for assets with sufficient data', () => {
    for (let i = 0; i < 100; i++) {
      const ret = (Math.random() - 0.5) * 0.02;
      service.recordReturn('BTC', Date.now() + i * 1000, ret);
      service.recordReturn('ETH', Date.now() + i * 1000, ret * 0.8);
      service.recordReturn('SOL', Date.now() + i * 1000, ret * 0.5);
    }

    const matrix = service.computeCorrelationMatrix(60);
    expect(matrix.length).toBeGreaterThanOrEqual(6);

    const btcEth = matrix.find(e => e.baseAsset === 'BTC' && e.otherAsset === 'ETH');
    const ethBtc = matrix.find(e => e.baseAsset === 'ETH' && e.otherAsset === 'BTC');
    expect(btcEth).toBeDefined();
    expect(ethBtc).toBeDefined();
    expect(btcEth!.correlation).toBeCloseTo(ethBtc!.correlation, 5);
  });

  // ---------------------------------------------------------------
  // 11. Buffer pruning works (max 200 samples)
  // ---------------------------------------------------------------
  it('11. buffer is pruned to max 200 samples per asset', () => {
    for (let i = 0; i < 250; i++) {
      service.recordReturn('BTC', Date.now() + i * 1000, (Math.random() - 0.5) * 0.01);
    }

    expect(service.getSampleCount('BTC')).toBe(200);
    expect(service.getStats().find(s => s.asset === 'BTC')?.sampleCount).toBe(200);
  });

  // ---------------------------------------------------------------
  // 12. Clear resets all data
  // ---------------------------------------------------------------
  it('12. clear() resets all buffers', () => {
    for (let i = 0; i < 60; i++) {
      service.recordReturn('BTC', Date.now() + i * 1000, 0.01);
      service.recordReturn('ETH', Date.now() + i * 1000, 0.01);
    }
    expect(service.getSampleCount('BTC')).toBe(60);
    expect(service.getSampleCount('ETH')).toBe(60);

    service.clear();
    expect(service.getSampleCount('BTC')).toBe(0);
    expect(service.getSampleCount('ETH')).toBe(0);
    expect(service.getStats().length).toBe(0);
  });

  // ---------------------------------------------------------------
  // 13. Same asset correlation is always 1
  // ---------------------------------------------------------------
  it('13. getPairCorrelation for same asset returns 1', () => {
    const corr = service.getPairCorrelation('BTC', 'BTC');
    expect(corr).toBe(1.0);
  });

  // ---------------------------------------------------------------
  // 14. getMinimumSamples returns the threshold
  // ---------------------------------------------------------------
  it('14. getMinimumSamples returns expected value', () => {
    expect(service.getMinimumSamples()).toBe(40);
  });
});

