import { describe, it, expect, beforeEach } from 'vitest';
import { portfolioVolatilityTargetService } from './PortfolioVolatilityTargetService';

describe('PortfolioVolatilityTargetService', () => {
  beforeEach(() => {
    portfolioVolatilityTargetService.reset();
  });

  it('1) No configuration: computeScale() returns 1.0', () => {
    expect(portfolioVolatilityTargetService.computeScale()).toBe(1.0);
  });

  it('2) Config with null lastEstimatedVol: computeScale() returns 1.0', () => {
    portfolioVolatilityTargetService.configure({ targetVol: 0.10, minScale: 0.5, maxScale: 2.0 });
    expect(portfolioVolatilityTargetService.computeScale()).toBe(1.0);
  });

  it('3) Vol below target (scale up within maxScale)', () => {
    portfolioVolatilityTargetService.configure({ targetVol: 0.10, minScale: 0.5, maxScale: 2.0 });
    portfolioVolatilityTargetService.updateVolEstimate(0.05);
    expect(portfolioVolatilityTargetService.computeScale()).toBe(2.0); // 0.10 / 0.05 = 2.0
  });

  it('4) Vol above target (scale down within minScale)', () => {
    portfolioVolatilityTargetService.configure({ targetVol: 0.10, minScale: 0.5, maxScale: 2.0 });
    portfolioVolatilityTargetService.updateVolEstimate(0.25);
    expect(portfolioVolatilityTargetService.computeScale()).toBe(0.5); // 0.10 / 0.25 = 0.4 -> clipped to 0.5
  });

  it('5) Vol very close to target', () => {
    portfolioVolatilityTargetService.configure({ targetVol: 0.10, minScale: 0.5, maxScale: 2.0 });
    portfolioVolatilityTargetService.updateVolEstimate(0.11);
    expect(portfolioVolatilityTargetService.computeScale()).toBeCloseTo(0.909, 3); // 0.10 / 0.11
  });
});
