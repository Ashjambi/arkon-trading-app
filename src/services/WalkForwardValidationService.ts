import { OHLCV, BacktestExecutionConfig } from './BacktestEngine';
import { StrategyBacktestAdapter, strategyBacktestAdapter } from './StrategyBacktestAdapter';
import { AppConfig, StrategyType } from '../types';

export interface WalkForwardConfig {
  /** Number of data points (candles) in each training window */
  trainWindow: number;
  /** Number of data points (candles) in each test window */
  testWindow: number;
  /** Minimum trades required in a test window for the result to be considered valid */
  minTradesPerWindow: number;
  /** Step size when rolling forward (if 0, equals testWindow for non-overlapping windows) */
  stepSize?: number;
  /** Assets to validate */
  assets: string[];
  /** Strategies to validate (must be registered in StrategyRegistry) */
  strategies: StrategyType[];
  /** AppConfig to use during backtest validation */
  config: AppConfig;
  /** Starting capital for each backtest run */
  initialCapital?: number;
  /** Backtest execution configuration (spread, slippage, commission) */
  execution?: BacktestExecutionConfig;
}

export interface PerWindowStats {
  windowIndex: number;
  trainStartIndex: number;
  trainEndIndex: number;
  testStartIndex: number;
  testEndIndex: number;
  trades: number;
  winRate: number;
  sharpe: number;
  maxDrawdown: number;
  profitFactor: number;
  totalReturn: number;
}

export interface WalkForwardResult {
  asset: string;
  strategy: string;
  totalWindows: number;
  validWindows: number;
  avgWinRate: number;
  avgSharpe: number;
  avgMaxDrawdown: number;
  avgProfitFactor: number;
  avgTradesPerWindow: number;
  totalTrades: number;
  consistencyScore: number; // 0-100: how consistently the strategy performs across windows
  statsPerWindow: PerWindowStats[];
}

/**
 * Walk-Forward Validation Service
 *
 * Performs rolling window walk-forward analysis on historical data for registered strategies.
 * Uses the existing BacktestEngine + StrategyBacktestAdapter to run each window.
 * This ensures the validation uses the same strategy logic as live execution.
 */
export class WalkForwardValidationService {
  private adapter: StrategyBacktestAdapter;

  constructor(adapter?: StrategyBacktestAdapter) {
    this.adapter = adapter ?? strategyBacktestAdapter;
  }

  /**
   * Run walk-forward validation for all asset/strategy pairs in the config.
   *
   * @param config - Walk-forward configuration
   * @param dataByAsset - Map of asset -> OHLCV data array (must be sorted chronologically)
   * @returns Array of WalkForwardResult, one per (asset, strategy) pair
   */
  public async run(
    config: WalkForwardConfig,
    dataByAsset: Record<string, OHLCV[]>
  ): Promise<WalkForwardResult[]> {
    const results: WalkForwardResult[] = [];
    const step = config.stepSize ?? config.testWindow;

    for (const asset of config.assets) {
      const data = dataByAsset[asset];
      if (!data || data.length < config.trainWindow + config.testWindow) {
        continue;
      }

      for (const strategy of config.strategies) {
        const windows = this.generateWindows(data.length, config.trainWindow, config.testWindow, step);
        if (windows.length === 0) continue;

        const perWindowStats: PerWindowStats[] = [];

        for (let wi = 0; wi < windows.length; wi++) {
          const { trainStart, trainEnd, testStart, testEnd } = windows[wi];
          const trainData = data.slice(trainStart, trainEnd);
          const testData = data.slice(testStart, testEnd);

          if (testData.length < 2) continue;

          // Use existing StrategyBacktestAdapter with strategy + data
          // We run on the test window but need training data context for indicators
          // The adapter's buildMarketStateFromCandle uses history (train + prior test candles)
          const fullContext = data.slice(0, testEnd); // all data up to test end
          
          try {
            const result = await this.adapter.runStrategyBacktest(
              strategy,
              asset,
              fullContext,
              config.config,
              config.initialCapital ?? 10000,
              new Date(testData[0].timestamp),
              new Date(testData[testData.length - 1].timestamp),
              config.execution ?? {}
            );

            // Filter to only count trades that actually happened within test window
            const testWindowTrades = result.trades.filter(
              t => t.entryTime >= testData[0].timestamp && t.entryTime <= testData[testData.length - 1].timestamp
            );

            if (testWindowTrades.length >= config.minTradesPerWindow) {
              perWindowStats.push({
                windowIndex: wi,
                trainStartIndex: trainStart,
                trainEndIndex: trainEnd,
                testStartIndex: testStart,
                testEndIndex: testEnd,
                trades: testWindowTrades.length,
                winRate: this.calculateWindowWinRate(testWindowTrades),
                sharpe: this.calculateWindowSharpe(testWindowTrades),
                maxDrawdown: this.calculateWindowMaxDrawdown(testWindowTrades, config.initialCapital ?? 10000),
                profitFactor: this.calculateWindowProfitFactor(testWindowTrades),
                totalReturn: result.totalReturn,
              });
            }
          } catch {
            // Strategy might not support this asset — skip silently
          }
        }

        if (perWindowStats.length > 0) {
          const validWindows = perWindowStats.length;
          const avgWinRate = perWindowStats.reduce((s, w) => s + w.winRate, 0) / validWindows;
          const avgSharpe = perWindowStats.reduce((s, w) => s + w.sharpe, 0) / validWindows;
          const avgMaxDrawdown = perWindowStats.reduce((s, w) => s + w.maxDrawdown, 0) / validWindows;
          const avgProfitFactor = perWindowStats.reduce((s, w) => s + w.profitFactor, 0) / validWindows;
          const avgTradesPerWindow = perWindowStats.reduce((s, w) => s + w.trades, 0) / validWindows;
          const totalTrades = perWindowStats.reduce((s, w) => s + w.trades, 0);

          // Consistency score: 100 - (coefficient of variation of winRate * 100)
          // Higher = more consistent across windows
          const winRates = perWindowStats.map(w => w.winRate);
          const winRateMean = winRates.reduce((s, v) => s + v, 0) / winRates.length;
          const winRateStd = winRates.length > 1
            ? Math.sqrt(winRates.reduce((s, v) => s + Math.pow(v - winRateMean, 2), 0) / (winRates.length - 1))
            : 0;
          const cv = winRateMean > 0 ? winRateStd / winRateMean : 1;
          const consistencyScore = Math.max(0, Math.min(100, 100 - cv * 100));

          results.push({
            asset,
            strategy,
            totalWindows: windows.length,
            validWindows,
            avgWinRate,
            avgSharpe,
            avgMaxDrawdown,
            avgProfitFactor,
            avgTradesPerWindow,
            totalTrades,
            consistencyScore,
            statsPerWindow: perWindowStats,
          });
        }
      }
    }

    return results;
  }

  /**
   * Generate rolling window indices for walk-forward analysis.
   */
  private generateWindows(
    totalLength: number,
    trainWindow: number,
    testWindow: number,
    stepSize: number
  ): Array<{ trainStart: number; trainEnd: number; testStart: number; testEnd: number }> {
    const windows: Array<{ trainStart: number; trainEnd: number; testStart: number; testEnd: number }> = [];
    let testStart = trainWindow;

    while (testStart + testWindow <= totalLength) {
      windows.push({
        trainStart: 0,
        trainEnd: testStart,
        testStart,
        testEnd: testStart + testWindow,
      });
      testStart += stepSize;
    }

    return windows;
  }

  private calculateWindowWinRate(trades: Array<{ pnl: number }>): number {
    if (trades.length === 0) return 0;
    const wins = trades.filter(t => t.pnl > 0).length;
    return wins / trades.length;
  }

  private calculateWindowSharpe(trades: Array<{ returnPct: number }>): number {
    if (trades.length < 2) return 0;
    const returns = trades.map(t => Number(t.returnPct || 0));
    const avg = returns.reduce((s, v) => s + v, 0) / returns.length;
    const variance = returns.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / (returns.length - 1);
    const stdDev = Math.sqrt(Math.max(variance, 0));
    if (stdDev === 0) return 0;
    return (avg / stdDev) * Math.sqrt(returns.length);
  }

  private calculateWindowMaxDrawdown(
    trades: Array<{ pnl: number }>,
    initialCapital: number
  ): number {
    if (trades.length === 0) return 0;
    let equity = initialCapital;
    let peak = initialCapital;
    let maxDD = 0;

    for (const trade of trades) {
      equity += trade.pnl;
      if (equity > peak) peak = equity;
      const dd = peak > 0 ? (peak - equity) / peak : 0;
      if (dd > maxDD) maxDD = dd;
    }

    return maxDD;
  }

  private calculateWindowProfitFactor(trades: Array<{ pnl: number }>): number {
    const grossProfit = trades.filter(t => t.pnl > 0).reduce((s, t) => s + t.pnl, 0);
    const grossLoss = trades.filter(t => t.pnl < 0).reduce((s, t) => s + Math.abs(t.pnl), 0);
    if (grossLoss === 0) return grossProfit > 0 ? Infinity : 0;
    return grossProfit / grossLoss;
  }
}

export const walkForwardValidationService = new WalkForwardValidationService();
