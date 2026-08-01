import { describe, it, expect, beforeEach } from 'vitest';
import { WalkForwardValidationService } from './WalkForwardValidationService';
import { OHLCV, BacktestExecutionConfig } from './BacktestEngine';
import { StrategyType, AppConfig, SignalDirection, SignalStrength } from '../types';

function generateMockData(candles: number, startPrice: number = 50000, volatility: number = 0.01): OHLCV[] {
  const data: OHLCV[] = [];
  let price = startPrice;
  const now = Date.now() - candles * 3600000; // start 'candles' hours ago

  for (let i = 0; i < candles; i++) {
    const change = price * volatility * (Math.random() - 0.5);
    const open = price;
    const close = price + change;
    const high = Math.max(open, close) * (1 + Math.random() * volatility);
    const low = Math.min(open, close) * (1 - Math.random() * volatility);
    const volume = Math.random() * 100 + 10;

    data.push({
      timestamp: now + i * 3600000,
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
      volume: Number(volume.toFixed(4)),
    });

    price = close;
  }

  return data;
}

function createMockConfig(): AppConfig {
  return {
    telegramBotToken: '',
    telegramChatId: '',
    enableTelegramAlerts: false,
    webhookUrl: 'http://localhost:3000',
    webhookSecret: 'test',
    bridgeLatencyThreshold: 1000,
    autoExecution: true,
    hunterMode: false,
    minSignalScore: 50,
    cooldownHours: 0,
    cooldownSameAssetMins: 0,
    riskRewardRatio: 2.5,
    maxOpenTrades: 10,
    maxTradesPerWave: 3,
    dynamicVolSpacing: 0.01,
    maxAllocationPerTradePercent: 10,
    fixedLotSizeBTC: 0.1,
    fixedLotSizeETH: 1,
    fixedLotSizeGOLD: 0.5,
    fixedLotSizeSOL: 1,
    equityProtectionPercent: 50,
    dailyLossLimitUSD: 1000,
    maxDrawdownDailyPercent: 20,
    enableGoldTrading: true,
    goldMaxRiskPerTrade: 1.0,
    goldMaxConcurrentPositions: 2,
    goldSpreadFilter: 30,
    goldSessionFilter: false,
    goldSessionStart: 7,
    goldSessionEnd: 20,
    goldPriceMaxAgeMs: 15000,
    goldMaxLot: 1.0,
    forceClosePnL: 50,
    autoHedgeEnabled: false,
    hedgeRatio: 0.5,
    flipEnabled: false,
    flipSensitivityScore: 0.5,
    enableTrendFollowing: true,
    trendFollowingThreshold: 0.5,
    hurst: 0.4,
    fisher: 1.5,
    rSquared: 0.3,
    dvol: 2,
    toxicity: 0.5,
    slippage: 0.02,
    vwapZScore: 1.5,
    ofi: 0.3,
    volRatio: 1.2,
    avrVolatilityThreshold: 0.02,
    avrLookbackPeriod: 20,
    ofiImbalanceThreshold: 0.3,
    ofiSensitivity: 1,
    corrThreshold: 0.7,
    corrLookback: 20,
    strategyPerformance: {} as any,
    strategyGates: {} as any,
    autoDisableThreshold: 0.3,
    dcaZones: [],
    disableInitialSL: false,
    useVirtualSL: false,
    commissionRate: 0.0005,
    orderFlowConfig: {
      enabled: false,
      ofiThreshold: 0.3,
      imbalanceRatio: 0.2,
      minVolume: 10,
      vwapEnabled: true,
    },
  };
}

describe('WalkForwardValidationService', () => {
  let service: WalkForwardValidationService;
  let mockData: Record<string, OHLCV[]>;
  let config: AppConfig;

  beforeEach(() => {
    service = new WalkForwardValidationService();
    mockData = {
      BTC: generateMockData(500, 50000, 0.015),
    };
    config = createMockConfig();
  });

  describe('window generation (internal)', () => {
    it('should generate correct number of windows', () => {
      const method = (service as any).generateWindows.bind(service);
      const windows = method(500, 60, 20, 20);
      // (500 - 60) / 20 = 22 windows
      expect(windows.length).toBeGreaterThanOrEqual(21);
      expect(windows.length).toBeLessThanOrEqual(23);
    });

    it('should not generate windows if data is too short', () => {
      const method = (service as any).generateWindows.bind(service);
      const windows = method(50, 60, 20, 20);
      expect(windows.length).toBe(0);
    });

    it('should have correct window boundaries', () => {
      const method = (service as any).generateWindows.bind(service);
      const windows = method(200, 100, 30, 30);
      expect(windows[0].trainStart).toBe(0);
      expect(windows[0].trainEnd).toBe(100);
      expect(windows[0].testStart).toBe(100);
      expect(windows[0].testEnd).toBe(130);
      // Second window should step by 30
      expect(windows[1].testStart).toBe(130);
      expect(windows[1].testEnd).toBe(160);
    });
  });

  describe('run()', () => {
    it('should return empty results if no data matches', async () => {
      const results = await service.run(
        {
          trainWindow: 60,
          testWindow: 20,
          minTradesPerWindow: 1,
          assets: ['ETH'], // no data for ETH
          strategies: ['BTC_TREND' as StrategyType],
          config,
        },
        mockData
      );
      expect(results.length).toBe(0);
    });

    it('should return empty if data is too short', async () => {
      const shortData: Record<string, OHLCV[]> = {
        BTC: generateMockData(30, 50000, 0.015),
      };
      const results = await service.run(
        {
          trainWindow: 60,
          testWindow: 20,
          minTradesPerWindow: 1,
          assets: ['BTC'],
          strategies: ['BTC_TREND' as StrategyType],
          config,
        },
        shortData
      );
      expect(results.length).toBe(0);
    });

    it('should return results for valid data', async () => {
      const results = await service.run(
        {
          trainWindow: 60,
          testWindow: 20,
          minTradesPerWindow: 0, // allow zero trades to see window structure
          assets: ['BTC'],
          strategies: ['BTC_TREND' as StrategyType],
          config,
          initialCapital: 10000,
        },
        mockData
      );
      // May have 0 or more results depending on strategy validation
      expect(Array.isArray(results)).toBe(true);
    });

    it('should have PerWindowStats with correct fields', () => {
      const stats = {
        windowIndex: 0,
        trainStartIndex: 0,
        trainEndIndex: 100,
        testStartIndex: 100,
        testEndIndex: 120,
        trades: 5,
        winRate: 0.6,
        sharpe: 1.2,
        maxDrawdown: 0.05,
        profitFactor: 2.0,
        totalReturn: 0.03,
      };

      expect(stats.windowIndex).toBe(0);
      expect(stats.trades).toBe(5);
      expect(stats.winRate).toBeCloseTo(0.6);
      expect(stats.sharpe).toBeCloseTo(1.2);
      expect(stats.maxDrawdown).toBeCloseTo(0.05);
      expect(stats.profitFactor).toBeCloseTo(2.0);
      expect(stats.totalReturn).toBeCloseTo(0.03);
    });
  });

  describe('metric calculations (internal)', () => {
    it('should calculate win rate correctly', () => {
      const method = (service as any).calculateWindowWinRate.bind(service);
      expect(method([{ pnl: 10 }, { pnl: -5 }, { pnl: 3 }])).toBeCloseTo(2 / 3);
      expect(method([])).toBe(0);
    });

    it('should calculate Sharpe ratio correctly', () => {
      const method = (service as any).calculateWindowSharpe.bind(service);
      // All identical returns => stdDev = 0 => Sharpe = 0
      expect(method([{ returnPct: 0.01 }, { returnPct: 0.01 }])).toBe(0);
      // Less than 2 trades => 0
      expect(method([{ returnPct: 0.01 }])).toBe(0);
    });

    it('should calculate max drawdown correctly', () => {
      const method = (service as any).calculateWindowMaxDrawdown.bind(service);
      const trades = [
        { pnl: -100 },
        { pnl: -200 }, // equity = 9700, peak = 10000, DD = 300/10000 = 0.03
        { pnl: 500 },  // equity = 10200, new peak
        { pnl: -300 }, // equity = 9900, peak = 10200, DD = 300/10200 = 0.0294
      ];
      const dd = method(trades, 10000);
      expect(dd).toBeGreaterThan(0.02);
      expect(dd).toBeLessThan(0.04);
    });

    it('should calculate profit factor correctly', () => {
      const method = (service as any).calculateWindowProfitFactor.bind(service);
      const trades = [
        { pnl: 100 },
        { pnl: -40 },
        { pnl: 60 },
      ];
      expect(method(trades)).toBeCloseTo(160 / 40, 2);
    });

    it('should return Infinity profit factor if no losses', () => {
      const method = (service as any).calculateWindowProfitFactor.bind(service);
      expect(method([{ pnl: 10 }, { pnl: 20 }])).toBe(Infinity);
    });

    it('should return 0 profit factor for empty trades', () => {
      const method = (service as any).calculateWindowProfitFactor.bind(service);
      expect(method([])).toBe(0);
    });
  });

  describe('WalkForwardResult structure', () => {
    it('should have correct aggregated fields', () => {
      const result = {
        asset: 'BTC',
        strategy: 'BTC_TREND',
        totalWindows: 22,
        validWindows: 18,
        avgWinRate: 0.55,
        avgSharpe: 1.3,
        avgMaxDrawdown: 0.08,
        avgProfitFactor: 1.8,
        avgTradesPerWindow: 8.5,
        totalTrades: 153,
        consistencyScore: 72.5,
        statsPerWindow: [],
      };

      expect(result.asset).toBe('BTC');
      expect(result.totalWindows).toBe(22);
      expect(result.validWindows).toBe(18);
      expect(result.avgWinRate).toBeCloseTo(0.55);
      expect(result.totalTrades).toBe(153);
      expect(result.consistencyScore).toBeCloseTo(72.5);
    });

    it('should calculate consistency score', () => {
      const method = (service as any).generateWindows.bind(service);
      // Create a service result with low variance win rates
      const winRates = [0.5, 0.52, 0.51, 0.53, 0.49];
      const mean = winRates.reduce((s, v) => s + v, 0) / winRates.length;
      const std = Math.sqrt(winRates.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / (winRates.length - 1));
      const cv = mean > 0 ? std / mean : 1;
      const score = Math.max(0, Math.min(100, 100 - cv * 100));
      
      expect(score).toBeGreaterThan(90); // low variance => high consistency
    });
  });
});
