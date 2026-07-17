export type StrategyRiskBudgetSnapshot = {
  budgets: Record<string, {
    maxAllocatedSize: number;
    currentAllocatedSize: number;
    blocked: boolean;
  }>;
  updatedAt: string;
};

class StrategyRiskBudgetServiceImpl {
  private budgets: Record<string, { maxAllocatedSize: number; currentAllocatedSize: number; blocked: boolean }> = {};

  configureBudget(strategy: string, maxAllocatedSize: number): void {
    this.budgets[strategy] = {
      maxAllocatedSize,
      currentAllocatedSize: this.budgets[strategy]?.currentAllocatedSize || 0,
      blocked: false
    };
    this.updateBlockedState(strategy);
  }

  resetBudgets(): void {
    this.budgets = {};
  }

  getSnapshot(): StrategyRiskBudgetSnapshot {
    return {
      budgets: { ...this.budgets },
      updatedAt: new Date().toISOString()
    };
  }

  canAllocate(strategy: string, requestedSize: number): {
    allowed: boolean;
    approvedSize: number;
    reason?: string;
  } {
    if (!strategy) {
      return { allowed: true, approvedSize: requestedSize };
    }

    const budget = this.budgets[strategy];
    if (!budget) {
      // If no budget is configured, allow unchanged
      return { allowed: true, approvedSize: requestedSize };
    }

    if (budget.blocked || budget.currentAllocatedSize >= budget.maxAllocatedSize) {
      return { allowed: false, approvedSize: 0, reason: 'STRATEGY_BUDGET_EXHAUSTED' };
    }

    const remaining = budget.maxAllocatedSize - budget.currentAllocatedSize;
    if (requestedSize <= remaining) {
      return { allowed: true, approvedSize: requestedSize };
    } else if (remaining > 0) {
      return { allowed: true, approvedSize: remaining };
    }

    return { allowed: false, approvedSize: 0, reason: 'STRATEGY_BUDGET_EXHAUSTED' };
  }

  registerAllocation(strategy: string, size: number): void {
    if (!strategy) return;
    const budget = this.budgets[strategy];
    if (budget) {
      budget.currentAllocatedSize += size;
      this.updateBlockedState(strategy);
    }
  }

  private updateBlockedState(strategy: string) {
    const budget = this.budgets[strategy];
    if (budget) {
      budget.blocked = budget.currentAllocatedSize >= budget.maxAllocatedSize;
    }
  }
}

export const strategyRiskBudgetService = new StrategyRiskBudgetServiceImpl();
