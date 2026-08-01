import { describe, expect, it } from 'vitest';
import { AppConfig, MarketAnalysisState } from '../../types';
import { MeanReversionAlphaStrategy } from './MeanReversionAlphaStrategy';
import { BreakoutCaptureStrategy } from './BreakoutCaptureStrategy';
import { ArbitrageScannerStrategy } from './ArbitrageScannerStrategy';
import { GridTradingStrategy } from './GridTradingStrategy';

const baseConfig = {
  minSignalScore: 10,
  hunterMode: false,
  dvol: 30,
  toxicity: 0.8,
} as AppConfig;

const baseState: MarketAnalysisState = {
  asset: 'BTC-PERPETUAL',
  price: 50000,
  fisher: 1.2,
  vwapDeviation: 0.01,
  vwapZScore: 2.1,
  vwapMain: 49850,
  vwapUpper: 50150,
  vwapLower: 49650,
  volatility: 1.4,
  bullishSweep: false,
  bearishSweep: false,
  swingLow: 49500,
  swingHigh: 49900,
  rSquared: 0.62,
  dvol: 35,
  hurst: 0.38,
  volRatio: 1.4,
  yearlyHigh: 52000,
  yearlyLow: 47000,
  pricePositionRank: 60,
  regime: 'MOMENTUM_TREND',
  qualityScore: 90,
  primaryBlocker: '',
  isCooldownActive: false,
  cooldownRemaining: 0,
  isCorrelatedBlocked: false,
  liquidityGap: 0.35,
  toxicityScore: 0.35,
  estimatedSlippage: 0.0007,
  dataLatencyMs: 80,
  scoreBreakdown: [],
  dominantFactor: 'TEST',
  reversalProbability: 20,
  trendDirection: 'UP',
  fundingRate: 0.0002,
  openInterest: 100000,
  isNewsPaused: false,
  isDailyLossPaused: false,
  mtfStatus: {
    dailyTrend: 'UP',
    h4Regime: 'TREND',
    m15Trigger: true,
  },
};

describe('New Strategy Suite', () => {
  it('MeanReversionAlphaStrategy emits signal in mean-reversion setup', () => {
    const strategy = new MeanReversionAlphaStrategy();
    const state = {
      ...baseState,
      regime: 'MEAN_REVERSION' as const,
      vwapDeviation: -0.012,
      fisher: -1.1,
      hurst: 0.31,
    };

    const signal = strategy.execute(state, baseConfig);
    expect(signal).not.toBeNull();
    expect(signal?.strategy).toBe('MEAN_REVERSION_ALPHA');
  });

  it('BreakoutCaptureStrategy emits signal on structural breakout', () => {
    const strategy = new BreakoutCaptureStrategy();
    const state = {
      ...baseState,
      price: 50550,
      swingHigh: 50000,
      regime: 'MOMENTUM_TREND' as const,
      volRatio: 1.6,
    };

    const signal = strategy.execute(state, baseConfig);
    expect(signal).not.toBeNull();
    expect(signal?.strategy).toBe('BREAKOUT_CAPTURE');
  });

  it('ArbitrageScannerStrategy emits signal with spread proxy and healthy microstructure', () => {
    const strategy = new ArbitrageScannerStrategy();
    const state = {
      ...baseState,
      regime: 'MEAN_REVERSION' as const,
      vwapDeviation: 0.011,
      rSquared: 0.72,
      toxicityScore: 0.2,
    };

    const signal = strategy.execute(state, baseConfig);
    expect(signal).not.toBeNull();
    expect(signal?.strategy).toBe('ARBITRAGE_SCANNER');
  });

  it('GridTradingStrategy emits signal in sideways market', () => {
    const strategy = new GridTradingStrategy();
    const state = {
      ...baseState,
      regime: 'CHOPPY/NOISE' as const,
      dvol: 24,
      vwapDeviation: 0.004,
      volRatio: 0.9,
    };

    const signal = strategy.execute(state, baseConfig);
    expect(signal).not.toBeNull();
    expect(signal?.strategy).toBe('GRID_TRADING');
  });
});
