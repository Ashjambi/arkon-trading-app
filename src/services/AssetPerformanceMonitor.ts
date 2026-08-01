import { logStructured } from '../utils/logger';

export interface StrategyStats {
  wins: number;
  losses: number;
  totalTrades: number;
  winRate: number;
  profitFactor: number;
  totalPnl: number;
  avgHoldingTimeMinutes: number;
  lastTradeTimestamp: number;
  consecutiveLosses: number;
}

export interface TradeRecord {
  asset: string;
  strategy: string;
  outcome: 'WIN' | 'LOSS';
  pnl: number;
  holdingTimeMinutes: number;
  timestamp: number;
}

/**
 * Strategy type classification based on strategy name prefix.
 */
export type StrategyType = 'SCALPER' | 'TREND' | 'MEANREV' | 'DEFAULT';

/**
 * Performance threshold rules for each strategy type.
 */
export interface PerformanceRuleSet {
  minTrades: number;         // Minimum trades before disabling
  disableWinRate: number;    // Win rate threshold for disable
  disableStreak: number;     // Consecutive losses threshold for disable
  reenableWinRate: number;   // Win rate threshold for re-enable
  reenableTrades: number;    // Min trades before re-enable check
  reenableStreak: number;    // Max consecutive losses allowed during re-enable
}

const PERFORMANCE_RULES: Record<StrategyType, PerformanceRuleSet> = {
  DEFAULT: {
    minTrades: 25,
    disableWinRate: 0.30,
    disableStreak: 8,
    reenableWinRate: 0.50,
    reenableTrades: 40,
    reenableStreak: 4,
  },
  SCALPER: {
    minTrades: 40,
    disableWinRate: 0.28,
    disableStreak: 12,
    reenableWinRate: 0.45,
    reenableTrades: 50,
    reenableStreak: 5,
  },
  TREND: {
    minTrades: 18,
    disableWinRate: 0.38,
    disableStreak: 6,
    reenableWinRate: 0.55,
    reenableTrades: 35,
    reenableStreak: 3,
  },
  MEANREV: {
    minTrades: 30,
    disableWinRate: 0.35,
    disableStreak: 8,
    reenableWinRate: 0.50,
    reenableTrades: 45,
    reenableStreak: 4,
  },
};

/**
 * Extract strategy type from strategy name using prefix.
 * e.g., "SCALPER_01" → "SCALPER", "ETH_TREND" → "TREND", "UNKNOWN" → "DEFAULT"
 */
function getStrategyType(strategy: string): StrategyType {
  const upper = strategy.toUpperCase();
  if (upper.startsWith('SCALPER') || upper.startsWith('HFT') || upper.startsWith('MOMENTUM')) return 'SCALPER';
  if (upper.startsWith('TREND') || upper.startsWith('SWING') || upper.startsWith('BREAKOUT')) return 'TREND';
  if (upper.startsWith('MEANREV') || upper.startsWith('REVERSION') || upper.startsWith('REGRESSION')) return 'MEANREV';
  return 'DEFAULT';
}

function getRuleSetForStrategy(strategy: string): PerformanceRuleSet {
  const type = getStrategyType(strategy);
  return PERFORMANCE_RULES[type];
}

export class AssetPerformanceMonitor {
  private stats: Map<string, Map<string, StrategyStats>> = new Map();
  private disabledStrategies: Map<string, Set<string>> = new Map(); // asset -> Set<strategy>

  /**
   * Record a trade outcome for a specific asset+strategy pair.
   * Updates running win rate, profit factor, and other metrics.
   */
  public recordTrade(
    asset: string,
    strategy: string,
    outcome: 'WIN' | 'LOSS',
    pnl: number,
    holdingTimeMinutes: number
  ): void {
    const assetKey = asset.toUpperCase();
    const strategyKey = strategy.toUpperCase();

    if (!this.stats.has(assetKey)) {
      this.stats.set(assetKey, new Map());
    }

    const assetMap = this.stats.get(assetKey)!;
    if (!assetMap.has(strategyKey)) {
      assetMap.set(strategyKey, {
        wins: 0,
        losses: 0,
        totalTrades: 0,
        winRate: 0,
        profitFactor: 0,
        totalPnl: 0,
        avgHoldingTimeMinutes: 0,
        lastTradeTimestamp: Date.now(),
        consecutiveLosses: 0,
      });
    }

    const current = assetMap.get(strategyKey)!;

    // Update counts
    if (outcome === 'WIN') {
      current.wins += 1;
      current.consecutiveLosses = 0;
    } else {
      current.losses += 1;
      current.consecutiveLosses += 1;
    }

    current.totalTrades = current.wins + current.losses;
    current.winRate = current.totalTrades > 0
      ? current.wins / current.totalTrades
      : 0;
    current.totalPnl += pnl;
    current.profitFactor = this.calculateProfitFactor(current);
    current.lastTradeTimestamp = Date.now();

    // Rolling average for holding time
    const prevTotalTime = current.avgHoldingTimeMinutes * (current.totalTrades - 1);
    current.avgHoldingTimeMinutes = (prevTotalTime + holdingTimeMinutes) / current.totalTrades;

    logStructured('EXEC', 'INFO', 'performance_recorded', `[${assetKey}/${strategyKey}] Trade recorded: ${outcome}, PnL=${pnl.toFixed(2)}, WR=${(current.winRate * 100).toFixed(1)}%`, {
      asset: assetKey,
      strategy: strategyKey,
      outcome,
      pnl,
      winRate: current.winRate,
      totalTrades: current.totalTrades,
      consecutiveLosses: current.consecutiveLosses,
    });

    // Auto-disable check after recording
    if (this.shouldDisable(assetKey, strategyKey)) {
      this.disableStrategy(assetKey, strategyKey, current);
    } else if (this.shouldReenable(assetKey, strategyKey)) {
      this.reenableStrategy(assetKey, strategyKey, current);
    }
  }

  /**
   * Get current stats for a given asset+strategy.
   */
  public getStats(asset: string, strategy: string): StrategyStats | null {
    const assetMap = this.stats.get(asset.toUpperCase());
    if (!assetMap) return null;
    return assetMap.get(strategy.toUpperCase()) || null;
  }

  /**
   * Check if a strategy should be disabled for a given asset.
   * Uses strategy-type-specific thresholds for more intelligent risk management.
   */
  public shouldDisable(asset: string, strategy: string): boolean {
    const assetKey = asset.toUpperCase();
    const strategyKey = strategy.toUpperCase();

    // If already disabled, return false (don't re-disable)
    if (this.isDisabled(assetKey, strategyKey)) return false;

    const stats = this.getStats(assetKey, strategyKey);
    if (!stats) return false;

    const ruleSet = getRuleSetForStrategy(strategyKey);

    // Need minimum trades to make a reliable decision
    if (stats.totalTrades < ruleSet.minTrades) return false;

    // Rule A: Disable if win rate is below threshold AND profit factor < 1.0 (losing money)
    if (stats.winRate < ruleSet.disableWinRate && stats.profitFactor < 1.0) {
      return true;
    }

    // Rule B: Emergency stop — consecutive losses exceed strategy-specific streak limit
    if (stats.consecutiveLosses >= ruleSet.disableStreak) {
      return true;
    }

    return false;
  }

  /**
   * Check if a disabled strategy should be re-enabled.
   * Requires win rate recovery + minimum trades + acceptable recent streak.
   */
  public shouldReenable(asset: string, strategy: string): boolean {
    const assetKey = asset.toUpperCase();
    const strategyKey = strategy.toUpperCase();

    // Only check if currently disabled
    if (!this.isDisabled(assetKey, strategyKey)) return false;

    const stats = this.getStats(assetKey, strategyKey);
    if (!stats) return false;

    const ruleSet = getRuleSetForStrategy(strategyKey);

    // Need enough trades for a reliable estimate
    if (stats.totalTrades < ruleSet.reenableTrades) return false;

    // Re-enable only if win rate recovered AND recent streak is acceptable
    if (stats.winRate >= ruleSet.reenableWinRate && stats.consecutiveLosses <= ruleSet.reenableStreak) {
      return true;
    }

    return false;
  }

  /**
   * Check if a strategy is currently disabled for an asset.
   */
  public isDisabled(asset: string, strategy: string): boolean {
    const assetSet = this.disabledStrategies.get(asset.toUpperCase());
    if (!assetSet) return false;
    return assetSet.has(strategy.toUpperCase());
  }

  /**
   * Get list of all disabled strategies.
   */
  public getDisabledStrategies(): Array<{ asset: string; strategy: string; stats: StrategyStats | null }> {
    const result: Array<{ asset: string; strategy: string; stats: StrategyStats | null }> = [];
    for (const [asset, strategies] of this.disabledStrategies) {
      for (const strategy of strategies) {
        result.push({
          asset,
          strategy,
          stats: this.getStats(asset, strategy),
        });
      }
    }
    return result;
  }

  /**
   * Get full snapshot of all tracked stats.
   */
  public getSnapshot(): Array<{ asset: string; strategy: string; stats: StrategyStats | null }> {
    const result: Array<{ asset: string; strategy: string; stats: StrategyStats | null }> = [];
    for (const [asset, assetMap] of this.stats) {
      for (const [strategy, stats] of assetMap) {
        result.push({ asset, strategy, stats });
      }
    }
    return result;
  }

  /**
   * Reset all stats and disabled flags (for testing or manual override).
   */
  public reset(): void {
    this.stats.clear();
    this.disabledStrategies.clear();
    logStructured('SYSTEM', 'INFO', 'performance_monitor_reset', 'AssetPerformanceMonitor stats and disabled flags reset');
  }

  // ===== PRIVATE HELPERS =====

  private calculateProfitFactor(stats: StrategyStats): number {
    if (stats.totalPnl <= 0) return 0;
    // Estimate gross loss from win rate and total PnL
    const avgWin = stats.wins > 0 ? (stats.totalPnl * 0.6) / stats.wins : 0;
    const avgLoss = stats.losses > 0 ? (Math.abs(stats.totalPnl) * 0.4) / stats.losses : 1;
    const grossProfit = avgWin * stats.wins;
    const grossLoss = avgLoss * stats.losses;
    return grossLoss > 0 ? grossProfit / grossLoss : stats.winRate;
  }

  private disableStrategy(asset: string, strategy: string, stats: StrategyStats): void {
    if (!this.disabledStrategies.has(asset)) {
      this.disabledStrategies.set(asset, new Set());
    }
    this.disabledStrategies.get(asset)!.add(strategy);

    const ruleSet = getRuleSetForStrategy(strategy);
    const type = getStrategyType(strategy);

    logStructured('RISK', 'WARN', 'strategy_auto_disabled', `⛔ [${asset}/${strategy}] AUTOMATICALLY DISABLED — Win rate ${(stats.winRate * 100).toFixed(1)}% (threshold ${(ruleSet.disableWinRate * 100)}%) | Streak ${stats.consecutiveLosses}/${ruleSet.disableStreak} after ${stats.totalTrades} trades [${type}]`, {
      asset,
      strategy,
      strategyType: type,
      winRate: stats.winRate,
      disableWinRate: ruleSet.disableWinRate,
      totalTrades: stats.totalTrades,
      profitFactor: stats.profitFactor,
      consecutiveLosses: stats.consecutiveLosses,
      disableStreak: ruleSet.disableStreak,
      reason: 'performance_threshold',
    });
  }

  private reenableStrategy(asset: string, strategy: string, stats: StrategyStats): void {
    const assetSet = this.disabledStrategies.get(asset);
    if (assetSet) {
      assetSet.delete(strategy);
      if (assetSet.size === 0) {
        this.disabledStrategies.delete(asset);
      }
    }

    const ruleSet = getRuleSetForStrategy(strategy);
    const type = getStrategyType(strategy);

    logStructured('RISK', 'INFO', 'strategy_auto_reenabled', `✅ [${asset}/${strategy}] AUTOMATICALLY RE-ENABLED — Win rate ${(stats.winRate * 100).toFixed(1)}% >= ${(ruleSet.reenableWinRate * 100)}% | Streak ${stats.consecutiveLosses}/${ruleSet.reenableStreak} [${type}]`, {
      asset,
      strategy,
      strategyType: type,
      winRate: stats.winRate,
      reenableWinRate: ruleSet.reenableWinRate,
      totalTrades: stats.totalTrades,
      profitFactor: stats.profitFactor,
      consecutiveLosses: stats.consecutiveLosses,
      reason: 'performance_recovered',
    });
  }
}

export const assetPerformanceMonitor = new AssetPerformanceMonitor();
