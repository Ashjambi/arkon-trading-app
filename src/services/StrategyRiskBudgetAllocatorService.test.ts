import { describe, it, expect, beforeEach, vi } from 'vitest';
import { strategyRiskBudgetAllocatorService } from './StrategyRiskBudgetAllocatorService';
import { strategyRiskBudgetService } from './StrategyRiskBudgetService';

vi.mock('./StrategyRiskBudgetService', () => ({
    strategyRiskBudgetService: {
        configureBudget: vi.fn(),
        canAllocate: vi.fn(),
        registerAllocation: vi.fn(),
        resetBudgets: vi.fn(),
        getBudgetsSnapshot: vi.fn()
    }
}));

describe('StrategyRiskBudgetAllocatorService', () => {
    beforeEach(() => {
        strategyRiskBudgetAllocatorService.reset();
        vi.clearAllMocks();
    });

    it('1) Equal weights when no performance differences', () => {
        strategyRiskBudgetAllocatorService.configure({
            totalRiskBudget: 10,
            minStrategyBudget: 0.5,
            maxStrategyBudget: 4.0
        });
        strategyRiskBudgetAllocatorService.updatePerformanceSnapshots([
            { strategy: 'A', rollingReturn: 0 },
            { strategy: 'B', rollingReturn: 0 },
            { strategy: 'C', rollingReturn: 0 }
        ]);
        strategyRiskBudgetAllocatorService.computeAndApplyBudgets();
        
        const snap = strategyRiskBudgetAllocatorService.getSnapshot();
        // 10 / 3 = 3.33 each
        expect(snap.lastComputedBudgets['A']).toBeCloseTo(3.333, 2);
        expect(snap.lastComputedBudgets['B']).toBeCloseTo(3.333, 2);
        expect(snap.lastComputedBudgets['C']).toBeCloseTo(3.333, 2);
    });

    it('2) Higher budget for better performers', () => {
        strategyRiskBudgetAllocatorService.configure({
            totalRiskBudget: 10,
            minStrategyBudget: 0.5,
            maxStrategyBudget: 6.0
        });
        strategyRiskBudgetAllocatorService.updatePerformanceSnapshots([
            { strategy: 'A', rollingReturn: 0.10 },
            { strategy: 'B', rollingReturn: 0.05 },
            { strategy: 'C', rollingReturn: 0.00 }
        ]);
        strategyRiskBudgetAllocatorService.computeAndApplyBudgets();
        
        const snap = strategyRiskBudgetAllocatorService.getSnapshot();
        expect(snap.lastComputedBudgets['A']).toBeGreaterThan(snap.lastComputedBudgets['B']);
        expect(snap.lastComputedBudgets['B']).toBeGreaterThan(snap.lastComputedBudgets['C']);
    });

    it('3) Min / max caps', () => {
        strategyRiskBudgetAllocatorService.configure({
            totalRiskBudget: 10,
            minStrategyBudget: 1.0,
            maxStrategyBudget: 5.0
        });
        strategyRiskBudgetAllocatorService.updatePerformanceSnapshots([
            { strategy: 'A', rollingReturn: 0.90 },
            { strategy: 'B', rollingReturn: 0.05 },
            { strategy: 'C', rollingReturn: 0.05 }
        ]);
        strategyRiskBudgetAllocatorService.computeAndApplyBudgets();
        
        const snap = strategyRiskBudgetAllocatorService.getSnapshot();
        expect(snap.lastComputedBudgets['A']).toBeLessThanOrEqual(5.0);
        expect(snap.lastComputedBudgets['B']).toBeGreaterThanOrEqual(1.0);
    });

    it('4) Application to StrategyRiskBudgetService', () => {
        strategyRiskBudgetAllocatorService.configure({
            totalRiskBudget: 10,
            minStrategyBudget: 0.5,
            maxStrategyBudget: 4.0
        });
        strategyRiskBudgetAllocatorService.updatePerformanceSnapshots([
            { strategy: 'A', rollingReturn: 0.10 }
        ]);
        strategyRiskBudgetAllocatorService.computeAndApplyBudgets();
        
        expect(strategyRiskBudgetService.configureBudget).toHaveBeenCalledWith('A', expect.any(Number));
    });
});
