import { describe, it, expect, beforeEach } from 'vitest';
import { strategyRiskBudgetService } from './StrategyRiskBudgetService';

describe('StrategyRiskBudgetService', () => {
  beforeEach(() => {
    strategyRiskBudgetService.resetBudgets();
  });

  it('1) No configured budget: allocation allowed unchanged', () => {
    const result = strategyRiskBudgetService.canAllocate('BTC_TREND', 1.5);
    expect(result.allowed).toBe(true);
    expect(result.approvedSize).toBe(1.5);
    expect(result.reason).toBeUndefined();
  });

  it('2) Full allocation within budget', () => {
    strategyRiskBudgetService.configureBudget('BTC_TREND', 2.0);
    const result = strategyRiskBudgetService.canAllocate('BTC_TREND', 1.0);
    expect(result.allowed).toBe(true);
    expect(result.approvedSize).toBe(1.0);
  });

  it('3) Partial allocation due to remaining budget', () => {
    strategyRiskBudgetService.configureBudget('BTC_TREND', 1.0);
    strategyRiskBudgetService.registerAllocation('BTC_TREND', 0.7);
    
    const result = strategyRiskBudgetService.canAllocate('BTC_TREND', 0.5);
    expect(result.allowed).toBe(true);
    expect(result.approvedSize).toBeCloseTo(0.3); // 1.0 - 0.7 = 0.3
  });

  it('4) Exhausted budget', () => {
    strategyRiskBudgetService.configureBudget('BTC_TREND', 1.0);
    strategyRiskBudgetService.registerAllocation('BTC_TREND', 1.0);
    
    const result = strategyRiskBudgetService.canAllocate('BTC_TREND', 0.2);
    expect(result.allowed).toBe(false);
    expect(result.approvedSize).toBe(0);
    expect(result.reason).toBe('STRATEGY_BUDGET_EXHAUSTED');
  });

  it('5) resetBudgets clears state', () => {
    strategyRiskBudgetService.configureBudget('BTC_TREND', 1.0);
    strategyRiskBudgetService.registerAllocation('BTC_TREND', 1.0);
    
    strategyRiskBudgetService.resetBudgets();
    const result = strategyRiskBudgetService.canAllocate('BTC_TREND', 1.0);
    expect(result.allowed).toBe(true);
    expect(result.approvedSize).toBe(1.0);
  });
});
