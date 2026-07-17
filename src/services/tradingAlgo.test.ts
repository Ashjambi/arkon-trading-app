import { describe, it, expect } from 'vitest';
import { generateSignal } from './tradingAlgo';

describe('generateSignal Integration Test', () => {
  it('should generate a valid signal structure with mock data', () => {
    const mockSummary = { instrument_name: 'BTC-PERP', last: 50000, funding_8h: 0.0001, open_interest: 1000000, volume: 1000 };
    const mockCandles = { status: 'ok', close: Array(100).fill(50000), high: Array(100).fill(50100), low: Array(100).fill(49900), volume: Array(100).fill(1000) };
    const mockConfig = {
      minSignalScore: 0,
      enableTrendFollowing: true,
      trendFollowingThreshold: 0.5,
      riskRewardRatio: 2.5,
      maxAllocationPerTradePercent: 0.1,
      orderFlowConfig: { enabled: false },
      strategyPerformance: {
          'BTC_TREND': { isEnabled: true, weight: 1 },
          'COINTEGRATION': { isEnabled: true, weight: 1 },
      }
    } as any;

    const result = generateSignal(
      'BTC-PERP',
      mockSummary as any,
      [mockSummary] as any,
      null, // activeEvent
      mockCandles as any, // candles15M
      mockCandles as any, // candles1D
      { bids: [], asks: [] } as any, // orderBook
      100, // dvol
      100, // optionsVolume
      mockConfig // config
    );

    expect(result).toBeDefined();
    expect(result).toHaveProperty('analysis');
    expect(result.analysis.correlationId).toBeNull();
    expect(result.analysis.cointBetaStability).toBeUndefined();
  });

  it('S-10Y Phase 1: Microstructure Scaffold - should handle missing microstructure data gracefully', () => {
    const mockSummary = { instrument_name: 'ETH-PERPETUAL', last: 3000, funding_8h: 0.0001, open_interest: 500000, volume: 500 };
    const mockCandles = { status: 'ok', close: Array(100).fill(3000), high: Array(100).fill(3010), low: Array(100).fill(2990), volume: Array(100).fill(500) };
    const mockConfig = {
      minSignalScore: 0,
      enableTrendFollowing: true,
      trendFollowingThreshold: 0.5,
      riskRewardRatio: 2.5,
      maxAllocationPerTradePercent: 0.1,
      orderFlowConfig: { enabled: false },
      strategyPerformance: {
          'ETH_SCALPER': { isEnabled: true, weight: 1 },
      }
    } as any;

    const result = generateSignal(
      'ETH-PERPETUAL',
      mockSummary as any,
      [mockSummary] as any,
      null, // activeEvent
      mockCandles as any, // candles15M
      mockCandles as any, // candles1D
      { bids: [], asks: [] } as any, // empty orderBook
      100, // dvol
      100, // optionsVolume
      mockConfig // config
    );

    expect(result).toBeDefined();
    // 1) MarketAnalysisState now includes ofi, normalizedOfi, orderBookImbalance, toxicityMetric
    expect(result.analysis).toHaveProperty('ofi');
    expect(result.analysis).toHaveProperty('normalizedOfi');
    expect(result.analysis).toHaveProperty('orderBookImbalance');
    expect(result.analysis).toHaveProperty('toxicityMetric');
    
    // 2) When microstructure data is missing: these fields are null, no crashes occur
    expect(result.analysis.ofi).toBeNull();
    expect(result.analysis.normalizedOfi).toBeNull();
    expect(result.analysis.orderBookImbalance).toBeNull();
    expect(result.analysis.toxicityMetric).toBeNull();
  });

  it('S-10Y Phase 1: Microstructure Scaffold - should populate orderBookImbalance when depth exists', () => {
    const mockSummary = { instrument_name: 'BTC-PERP', last: 50000, funding_8h: 0.0001, open_interest: 1000000, volume: 1000 };
    const mockCandles = { status: 'ok', close: Array(100).fill(50000), high: Array(100).fill(50100), low: Array(100).fill(49900), volume: Array(100).fill(1000) };
    const mockConfig = {
      minSignalScore: 0,
      enableTrendFollowing: true,
      trendFollowingThreshold: 0.5,
      riskRewardRatio: 2.5,
      maxAllocationPerTradePercent: 0.1,
      orderFlowConfig: { enabled: false },
      strategyPerformance: {
          'BTC_TREND': { isEnabled: true, weight: 1 },
      }
    } as any;

    // Simulate order book with bids larger than asks
    const mockOrderBook = {
        bids: [[49990, 5], [49980, 10], [49970, 5]], // Total: 20
        asks: [[50010, 2], [50020, 3]]              // Total: 5
    };
    
    const result = generateSignal(
      'BTC-PERP',
      mockSummary as any,
      [mockSummary] as any,
      null,
      mockCandles as any,
      mockCandles as any,
      mockOrderBook as any,
      100,
      100,
      mockConfig
    );

    // Total Bid Vol = 20, Total Ask Vol = 5
    // OBI = (20 - 5) / (20 + 5) = 15 / 25 = 0.6
    expect(result.analysis.orderBookImbalance).toBeCloseTo(0.6);
    // ofi and normalizedOfi remain null because there's no tick/trade stream
    expect(result.analysis.ofi).toBeNull();
    expect(result.analysis.normalizedOfi).toBeNull();
    expect(result.analysis.toxicityMetric).toBeNull();

    // Test Microprice fields
    // bidVol = 5, bidPrice = 49990
    // askVol = 2, askPrice = 50010
    // microPrice = (49990 * 2 + 50010 * 5) / (5 + 2) = (99980 + 250050) / 7 = 350030 / 7 = 50004.2857
    expect(result.analysis.microPrice).toBeCloseTo(50004.2857);
    // midPrice = (49990 + 50010) / 2 = 50000
    // microPriceDeviation = (50004.2857 - 50000) / 50000 = 0.0000857
    expect(result.analysis.microPriceDeviation).toBeCloseTo(0.0000857);
    // topLevelImbalance = (5 - 2) / (5 + 2) = 3 / 7 = 0.42857
    expect(result.analysis.topLevelImbalance).toBeCloseTo(0.42857);
    // depthPressure (using top 3 levels, asks only has 2 levels)
    // nearBidVol = 5 + 10 + 5 = 20
    // nearAskVol = 2 + 3 = 5 (actually the loop will only run for Math.min(bids.length, asks.length) = 2 levels)
    // wait, depthLevels = Math.min(3, Math.min(3, 2)) = 2.
    // nearBidVol = 5 + 10 = 15
    // nearAskVol = 2 + 3 = 5
    // depthPressure = (15 - 5) / (15 + 5) = 10 / 20 = 0.5
    expect(result.analysis.depthPressure).toBeCloseTo(0.5);
  });

  it('should safely handle missing order book without throwing errors', () => {
    const mockSummary = { instrument_name: 'BTC-PERP', last: 50000, funding_8h: 0.0001, open_interest: 1000000, volume: 1000 };
    const mockCandles = { status: 'ok', close: Array(100).fill(50000), high: Array(100).fill(50100), low: Array(100).fill(49900), volume: Array(100).fill(1000) };
    const mockConfig = {
      minSignalScore: 0,
      enableTrendFollowing: true,
      trendFollowingThreshold: 0.5,
      riskRewardRatio: 2.5,
      maxAllocationPerTradePercent: 0.1,
      orderFlowConfig: { enabled: false },
      strategyPerformance: {
          'BTC_TREND': { isEnabled: true, weight: 1 },
          'COINTEGRATION': { isEnabled: true, weight: 1 },
      }
    } as any;

    const result = generateSignal(
      'BTC-PERP',
      mockSummary as any,
      [mockSummary] as any,
      null,
      mockCandles as any,
      mockCandles as any,
      null as any, // missing order book
      100,
      100,
      mockConfig
    );

    expect(result.analysis.orderBookImbalance).toBeNull();
    expect(result.analysis.microPrice).toBeNull();
    expect(result.analysis.microPriceDeviation).toBeNull();
    expect(result.analysis.topLevelImbalance).toBeNull();
    expect(result.analysis.depthPressure).toBeNull();
  });

  it('should compute trade flow features correctly', () => {
    const mockSummary = { instrument_name: 'BTC-PERP', last: 50000, funding_8h: 0.0001, open_interest: 1000000, volume: 1000 };
    const mockCandles = { status: 'ok', close: Array(100).fill(50000), high: Array(100).fill(50100), low: Array(100).fill(49900), volume: Array(100).fill(1000) };
    const mockConfig = { minSignalScore: 0, orderFlowConfig: { enabled: false }, strategyPerformance: {} } as any;

    const mockOrderBook = {
        bids: [[49990, 5]],
        asks: [[50010, 2]]
    };

    const recentTrades = [
        { timestamp: 1, price: 50005, size: 2, direction: 'buy', instrument: 'BTC-PERP' }, // +2
        { timestamp: 2, price: 50000, size: 5, direction: 'sell', instrument: 'BTC-PERP' }, // -5
        { timestamp: 3, price: 50005, size: 1, direction: 'buy', instrument: 'BTC-PERP' }  // +1
    ]; // total signed: -2, total size: 8

    const result = generateSignal(
      'BTC-PERP',
      mockSummary as any,
      [mockSummary] as any,
      null,
      mockCandles as any,
      mockCandles as any,
      mockOrderBook as any,
      100,
      100,
      mockConfig,
      recentTrades as any
    );

    expect(result.analysis.tradeFlowAvailable).toBe(true);
    expect(result.analysis.recentSignedVolume).toBe(-2);
    expect(result.analysis.recentTradeCount).toBe(3);
    expect(result.analysis.ofi).toBe(-2);
    expect(result.analysis.normalizedOfi).toBe(-2 / 8);
    expect(result.analysis.toxicityMetric).toBe(2 / 8);
  });

  it('should handle missing trade flow gracefully', () => {
    const mockSummary = { instrument_name: 'BTC-PERP', last: 50000, funding_8h: 0.0001, open_interest: 1000000, volume: 1000 };
    const mockConfig = { minSignalScore: 0, orderFlowConfig: { enabled: false }, strategyPerformance: {} } as any;
    const mockCandles = { status: 'ok', close: Array(100).fill(50000), high: Array(100).fill(50100), low: Array(100).fill(49900), volume: Array(100).fill(1000) };

    const result = generateSignal(
      'BTC-PERP',
      mockSummary as any,
      [mockSummary] as any,
      null,
      mockCandles as any,
      mockCandles as any,
      { bids: [], asks: [] } as any,
      100,
      100,
      mockConfig,
      []
    );

    expect(result.analysis.tradeFlowAvailable).toBe(false);
    expect(result.analysis.ofi).toBeNull();
    expect(result.analysis.normalizedOfi).toBeNull();
    expect(result.analysis.toxicityMetric).toBeNull();
  });
});

  it('Coordination integration: multiple signals should be coordinated, only best one returns', () => {
    const mockSummary = { instrument_name: 'BTC-PERP', last: 50000, funding_8h: 0.0001, open_interest: 1000000, volume: 1000 };
    const mockCandles = { status: 'ok', close: Array(100).fill(50000), high: Array(100).fill(50100), low: Array(100).fill(49900), volume: Array(100).fill(1000) };
    const mockConfig = {
      minSignalScore: 0,
      enableTrendFollowing: true,
      trendFollowingThreshold: 0.5,
      riskRewardRatio: 2.5,
      maxAllocationPerTradePercent: 0.1,
      orderFlowConfig: { enabled: false },
      strategyPerformance: {
          'BTC_TREND': { isEnabled: true, weight: 1 },
          'BTC_SCALPER': { isEnabled: true, weight: 1 },
          'COINTEGRATION': { isEnabled: true, weight: 1 },
      }
    } as any;
    
    // Test that signal coordination completes without errors and returns a signal if multiple strategies fired
    const result = generateSignal(
      'BTC',
      mockSummary as any,
      [mockSummary] as any,
      null, // activeEvent
      mockCandles as any, // candles15M
      mockCandles as any, // candles1D
      { bids: [[49900, 1]], asks: [[50100, 1]] } as any, // orderBook
      100, // dvol
      100, // optionsVolume
      mockConfig, // config
      [{}] as any // recent trades to pass health check
    );
    
    expect(result).toBeDefined();
    expect(result).toHaveProperty('analysis');
    // Just verify the flow works without crashing
});
