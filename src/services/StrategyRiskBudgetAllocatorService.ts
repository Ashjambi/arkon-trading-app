import { strategyRiskBudgetService } from './StrategyRiskBudgetService';

export type StrategyPerformanceSnapshot = {
  strategy: string;
  rollingReturn: number;
  rollingSharpe?: number;
};

export type DynamicRiskBudgetConfig = {
  totalRiskBudget: number;
  minStrategyBudget: number;
  maxStrategyBudget: number;
  rebalanceIntervalLabel?: string;
};

export type StrategyRiskBudgetAllocatorSnapshot = {
  config: DynamicRiskBudgetConfig | null;
  lastPerformanceSnapshots: StrategyPerformanceSnapshot[];
  lastComputedBudgets: Record<string, number>;
  lastRebalanceAt: string | null;
};

class StrategyRiskBudgetAllocatorServiceImpl {
  private config: DynamicRiskBudgetConfig | null = null;
  private lastPerformanceSnapshots: StrategyPerformanceSnapshot[] = [];
  private lastComputedBudgets: Record<string, number> = {};
  private lastRebalanceAt: string | null = null;

  configure(config: DynamicRiskBudgetConfig): void {
    this.config = config;
  }

  reset(): void {
    this.config = null;
    this.lastPerformanceSnapshots = [];
    this.lastComputedBudgets = {};
    this.lastRebalanceAt = null;
  }

  updatePerformanceSnapshots(snapshots: StrategyPerformanceSnapshot[]): void {
    this.lastPerformanceSnapshots = [...snapshots];
  }

  getSnapshot(): StrategyRiskBudgetAllocatorSnapshot {
    return {
      config: this.config ? { ...this.config } : null,
      lastPerformanceSnapshots: [...this.lastPerformanceSnapshots],
      lastComputedBudgets: { ...this.lastComputedBudgets },
      lastRebalanceAt: this.lastRebalanceAt
    };
  }

  computeAndApplyBudgets(): void {
    if (!this.config || this.lastPerformanceSnapshots.length === 0) return;

    const numStrategies = this.lastPerformanceSnapshots.length;
    const baseScores = this.lastPerformanceSnapshots.map(s => {
      const metric = s.rollingSharpe !== undefined ? s.rollingSharpe : s.rollingReturn;
      return { strategy: s.strategy, score: Math.max(metric, 0) };
    });

    const totalScore = baseScores.reduce((sum, s) => sum + s.score, 0);
    
    let budgets: Record<string, number> = {};
    let initialSum = 0;

    for (const s of baseScores) {
      const weight = totalScore > 0 ? s.score / totalScore : 1 / numStrategies;
      const unboundedBudget = weight * this.config.totalRiskBudget;
      let clampedBudget = Math.max(this.config.minStrategyBudget, Math.min(this.config.maxStrategyBudget, unboundedBudget));
      budgets[s.strategy] = clampedBudget;
      initialSum += clampedBudget;
    }

    // Optional renormalisation
    if (initialSum > 0 && Math.abs(initialSum - this.config.totalRiskBudget) > 0.001) {
        for (const s of baseScores) {
            let rescaled = budgets[s.strategy] * (this.config.totalRiskBudget / initialSum);
            rescaled = Math.max(this.config.minStrategyBudget, Math.min(this.config.maxStrategyBudget, rescaled));
            budgets[s.strategy] = rescaled;
        }
    }

    this.lastComputedBudgets = budgets;
    this.lastRebalanceAt = new Date().toISOString();

    for (const [strategy, budget] of Object.entries(budgets)) {
      strategyRiskBudgetService.configureBudget(strategy, budget);
    }
  }
}

export const strategyRiskBudgetAllocatorService = new StrategyRiskBudgetAllocatorServiceImpl();
