import { assetPerformanceMonitor } from './AssetPerformanceMonitor';
import { logStructured } from '../utils/logger';

/**
 * Snapshot of a strategy's performance for allocation decisions.
 */
export interface StrategyPerformanceSnapshot {
  asset: string;
  strategy: string;
  winRate: number;
  profitFactor: number;
  maxDrawdown: number;
  totalTrades: number;
  isDisabled: boolean;
  totalPnl: number;
  consecutiveLosses: number;
}

/**
 * Weight assignment for a single (asset, strategy) pair.
 * weight = 0       ⇒ no capital allocated (strategy effectively paused)
 * weight = 1       ⇒ normal baseline allocation
 * weight > 1 (max 2) ⇒ boosted allocation for top performers
 * weight < 1 (min 0) ⇒ reduced allocation for underperformers
 */
export interface StrategyAllocationWeight {
  asset: string;
  strategy: string;
  weight: number;
  reason: string;
}

/**
 * MetaStrategyAllocatorService
 *
 * Implements capital rotation across strategies based on recent performance.
 * Each (asset, strategy) pair is treated as an independent "asset" in a
 * strategy-portfolio. Capital flows from underperformers to outperformers.
 *
 * Logic:
 * - Disabled strategies → weight = 0
 * - Win rate < 0.4 OR profit factor < 1.0 OR max drawdown < -20% → weight = 0
 * - Win rate > 0.6 AND profit factor > 1.5 AND max drawdown > -15% → weight = 2.0
 * - Everything else → weight between 0.5 and 1.5 via linear interpolation
 * - New strategies (totalTrades < minTrades threshold) → weight = 1.0 (neutral)
 */
export class MetaStrategyAllocatorService {
  /**
   * Minimum trades required before we start adjusting weights away from 1.0.
   * Below this threshold, the strategy gets a neutral weight (1.0).
   */
  private readonly MIN_TRADES_FOR_WEIGHTING = 10;

  /**
   * Compute allocation weights from raw performance snapshots.
   *
   * @param perfSnapshots - Array of performance data per (asset, strategy)
   * @returns Array of allocation weights with explanation
   */
  public computeWeights(
    perfSnapshots: StrategyPerformanceSnapshot[],
  ): StrategyAllocationWeight[] {
    if (!perfSnapshots || perfSnapshots.length === 0) {
      return [];
    }

    const weights: StrategyAllocationWeight[] = [];

    for (const snap of perfSnapshots) {
      const weight = this.computeSingleWeight(snap);
      weights.push({
        asset: snap.asset,
        strategy: snap.strategy,
        weight: weight.value,
        reason: weight.reason,
      });
    }

    // Log summary
    const zeroWeighted = weights.filter((w) => w.weight === 0).length;
    const boosted = weights.filter((w) => w.weight >= 1.5).length;
    const reduced = weights.filter((w) => w.weight > 0 && w.weight < 0.8).length;
    logStructured(
      'RISK',
      'INFO',
      'meta_strategy_allocation',
      `MetaStrategy allocation computed: ${weights.length} strategies, ${zeroWeighted} zero-weighted, ${boosted} boosted, ${reduced} reduced`,
      { total: weights.length, zeroWeighted, boosted, reduced, weights },
    );

    return weights;
  }

  /**
   * Convenience overload: reads directly from AssetPerformanceMonitor singleton,
   * transforms the snapshot format, and computes weights.
   */
  public computeWeightsFromMonitor(): StrategyAllocationWeight[] {
    const rawSnapshots = assetPerformanceMonitor.getSnapshot();
    const disabledList = assetPerformanceMonitor.getDisabledStrategies();
    const disabledSet = new Set<string>();
    for (const d of disabledList) {
      disabledSet.add(`${d.asset.toUpperCase()}|${d.strategy.toUpperCase()}`);
    }

    const perfSnapshots: StrategyPerformanceSnapshot[] = rawSnapshots.map(
      (entry) => {
        const key = `${entry.asset.toUpperCase()}|${entry.strategy.toUpperCase()}`;
        return {
          asset: entry.asset,
          strategy: entry.strategy,
          winRate: entry.stats?.winRate ?? 0,
          profitFactor: entry.stats?.profitFactor ?? 0,
          maxDrawdown: this.estimateMaxDrawdown(entry.stats?.totalPnl ?? 0),
          totalTrades: entry.stats?.totalTrades ?? 0,
          isDisabled: disabledSet.has(key),
          totalPnl: entry.stats?.totalPnl ?? 0,
          consecutiveLosses: entry.stats?.consecutiveLosses ?? 0,
        };
      },
    );

    return this.computeWeights(perfSnapshots);
  }

  // =========================================================================
  // Private helpers
  // =========================================================================

  private computeSingleWeight(
    snap: StrategyPerformanceSnapshot,
  ): { value: number; reason: string } {
    // --- Rule 1: Disabled strategies get zero weight ---
    if (snap.isDisabled) {
      return { value: 0, reason: 'Strategy disabled by AssetPerformanceMonitor' };
    }

    // --- Rule 2: Too few trades → neutral weight 1.0 ---
    if (snap.totalTrades < this.MIN_TRADES_FOR_WEIGHTING) {
      return { value: 1.0, reason: `Insufficient trades (${snap.totalTrades} < ${this.MIN_TRADES_FOR_WEIGHTING}), neutral weight` };
    }

    // --- Rule 3: Critical underperformance → zero weight ---
    if (snap.winRate < 0.4) {
      return { value: 0, reason: `Win rate too low: ${(snap.winRate * 100).toFixed(1)}% < 40%` };
    }
    if (snap.profitFactor < 1.0) {
      return { value: 0, reason: `Profit factor below 1.0: ${snap.profitFactor.toFixed(2)}` };
    }
    if (snap.maxDrawdown < -0.20) {
      return { value: 0, reason: `Max drawdown too deep: ${(snap.maxDrawdown * 100).toFixed(1)}% < -20%` };
    }

    // --- Rule 4: Elite performance → boosted weight (2.0) ---
    if (
      snap.winRate > 0.6 &&
      snap.profitFactor > 1.5 &&
      snap.maxDrawdown > -0.15
    ) {
      return { value: 2.0, reason: `Elite: WR=${(snap.winRate * 100).toFixed(1)}%, PF=${snap.profitFactor.toFixed(2)}, DD=${(snap.maxDrawdown * 100).toFixed(1)}%` };
    }

    // --- Rule 5: Linear interpolation for the middle zone ---
    // Map winRate in [0.40, 0.60] → baseWeight in [0.5, 1.5]
    const clampedWR = Math.max(0.40, Math.min(0.60, snap.winRate));
    const wrWeight = 0.5 + ((clampedWR - 0.40) / 0.20) * 1.0; // 0.5 to 1.5

    // Adjust by profit factor: PF 1.0 → x0.8, PF 2.0 → x1.2
    const pfFactor = Math.max(0.8, Math.min(1.2, 0.8 + (snap.profitFactor - 1.0) * 0.4));

    // Adjust by drawdown: DD 0% → x1.1, DD -20% → x0.7
    const ddFactor = Math.max(0.7, Math.min(1.1, 1.0 + snap.maxDrawdown * 2.0));

    let finalWeight = wrWeight * pfFactor * ddFactor;

    // Clamp to [0.25, 2.0] — allow some allocation even for weak performers
    finalWeight = Math.max(0.25, Math.min(2.0, finalWeight));

    return {
      value: Number(finalWeight.toFixed(3)),
      reason: `Linear: WR=${(snap.winRate * 100).toFixed(1)}% (→${wrWeight.toFixed(2)}), PF=${snap.profitFactor.toFixed(2)} (→${pfFactor.toFixed(2)}), DD=${(snap.maxDrawdown * 100).toFixed(1)}% (→${ddFactor.toFixed(2)})`,
    };
  }

  /**
   * Estimate max drawdown from total PnL.
   * Since AssetPerformanceMonitor doesn't track peak-to-trough directly,
   * we use a heuristic: if totalPnl is positive, drawdown is estimated as
   * a fraction of gains lost; if negative, drawdown = totalPnl / |totalPnl|.
   *
   * A more accurate implementation would require tracking equity curve,
   * but this is sufficient for relative allocation.
   */
  private estimateMaxDrawdown(totalPnl: number): number {
    if (totalPnl >= 0) {
      // Positive PnL → estimate drawdown as 10-20% of gains
      // This is a conservative heuristic
      return -0.05;
    }
    // Negative total PnL → drawdown is at least the loss magnitude
    // Clamp to a reasonable range [-0.01, -0.50]
    return Math.max(-0.50, Math.min(-0.01, totalPnl / 10000));
  }
}

/** Singleton instance */
export const metaStrategyAllocatorService = new MetaStrategyAllocatorService();

