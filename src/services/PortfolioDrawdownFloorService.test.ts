import { describe, it, expect, beforeEach } from 'vitest';
import { portfolioDrawdownFloorService } from './PortfolioDrawdownFloorService';

describe('PortfolioDrawdownFloorService', () => {
  beforeEach(() => {
    portfolioDrawdownFloorService.reset();
  });

  it('1) No configuration: updateEquity updates state, mode remains NORMAL', () => {
    portfolioDrawdownFloorService.updateEquity(10000);
    portfolioDrawdownFloorService.updateEquity(9000);
    expect(portfolioDrawdownFloorService.getCurrentMode()).toBe('NORMAL');
    expect(portfolioDrawdownFloorService.computeRiskScale()).toBe(1.0);
    const snap = portfolioDrawdownFloorService.getSnapshot();
    expect(snap.highWatermark).toBe(10000);
    expect(snap.currentDrawdown).toBe(0.10);
  });

  it('2) New highs: mode NORMAL, drawdown stays 0', () => {
    portfolioDrawdownFloorService.configure({
      maxDrawdownLimit: 0.20,
      softDrawdownLimit: 0.10,
      floorLevel: 0.85,
      hardStopEnabled: true
    });
    portfolioDrawdownFloorService.updateEquity(10000);
    portfolioDrawdownFloorService.updateEquity(11000);
    expect(portfolioDrawdownFloorService.getCurrentMode()).toBe('NORMAL');
    expect(portfolioDrawdownFloorService.computeRiskScale()).toBe(1.0);
    const snap = portfolioDrawdownFloorService.getSnapshot();
    expect(snap.highWatermark).toBe(11000);
    expect(snap.currentDrawdown).toBe(0);
  });

  it('3) Soft drawdown: drops 12% -> mode SOFT_DRAWDOWN, scale reduced', () => {
    portfolioDrawdownFloorService.configure({
      maxDrawdownLimit: 0.20,
      softDrawdownLimit: 0.10,
      floorLevel: 0.85,
      hardStopEnabled: true
    });
    portfolioDrawdownFloorService.updateEquity(10000);
    portfolioDrawdownFloorService.updateEquity(8800); // 12% drop
    
    expect(portfolioDrawdownFloorService.getCurrentMode()).toBe('SOFT_DRAWDOWN');
    const scale = portfolioDrawdownFloorService.computeRiskScale();
    expect(scale).toBeLessThan(1.0);
    expect(scale).toBeGreaterThan(0.0);
    expect(scale).toBeCloseTo(0.4); // 1.0 - (0.12 / 0.20) = 0.4
  });

  it('4) Hard drawdown: drops >= 20% -> mode HARD_DRAWDOWN, scale 0.0', () => {
    portfolioDrawdownFloorService.configure({
      maxDrawdownLimit: 0.20,
      softDrawdownLimit: 0.10,
      floorLevel: 0.85,
      hardStopEnabled: true
    });
    portfolioDrawdownFloorService.updateEquity(10000);
    portfolioDrawdownFloorService.updateEquity(7500); // 25% drop
    
    expect(portfolioDrawdownFloorService.getCurrentMode()).toBe('HARD_DRAWDOWN');
    expect(portfolioDrawdownFloorService.computeRiskScale()).toBe(0.0);
  });

  it('5) Floor breach: falls below floorLevel -> mode SOFT_DRAWDOWN', () => {
    // If we drop below floorLevel but not hardLimit, it should trigger soft limit
    portfolioDrawdownFloorService.configure({
      maxDrawdownLimit: 0.50,
      softDrawdownLimit: 0.30,
      floorLevel: 0.90, // very tight floor
      hardStopEnabled: true
    });
    portfolioDrawdownFloorService.updateEquity(10000);
    portfolioDrawdownFloorService.updateEquity(8500); // 15% drop, current=8500, floor=9000
    
    expect(portfolioDrawdownFloorService.getCurrentMode()).toBe('SOFT_DRAWDOWN');
    const scale = portfolioDrawdownFloorService.computeRiskScale();
    expect(scale).toBeCloseTo(0.7); // 1.0 - (0.15 / 0.50)
  });
});
