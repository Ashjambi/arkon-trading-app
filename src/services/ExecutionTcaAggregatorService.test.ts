import { describe, it, expect } from 'vitest';
import { executionTcaAggregatorService, ChildExecutionTcaInput } from './ExecutionTcaAggregatorService';

describe('ExecutionTcaAggregatorService', () => {
    it('Scenario: Empty input returns zeros and nulls', () => {
        const result = executionTcaAggregatorService.aggregate([]);
        expect(result.totalRequestedSize).toBe(0);
        expect(result.totalExecutedSize).toBe(0);
        expect(result.parentFillRatio).toBe(0);
        expect(result.childCount).toBe(0);
        expect(result.weightedAverageExecutedPrice).toBeNull();
        expect(result.weightedAverageRequestedPrice).toBeNull();
        expect(result.weightedAverageSlippage).toBeNull();
        expect(result.weightedAverageSlippageBps).toBeNull();
        expect(result.bestChildSlippageBps).toBeNull();
        expect(result.worstChildSlippageBps).toBeNull();
        expect(result.totalNotionalExecuted).toBeNull();
    });

    it('Scenario: Valid children aggregated correctly', () => {
        const children: ChildExecutionTcaInput[] = [
            {
                requestedSize: 10,
                executedSize: 5,
                requestedPrice: 100,
                executedPrice: 105,
                fillRatio: 0.5,
                slippage: 5,
                slippageBps: 500,
                notionalExecuted: 525,
                sliceIndex: 0,
                totalSlices: 2
            },
            {
                requestedSize: 10,
                executedSize: 10,
                requestedPrice: 100,
                executedPrice: 102,
                fillRatio: 1,
                slippage: 2,
                slippageBps: 200,
                notionalExecuted: 1020,
                sliceIndex: 1,
                totalSlices: 2
            }
        ];

        const result = executionTcaAggregatorService.aggregate(children);

        expect(result.totalRequestedSize).toBe(20);
        expect(result.totalExecutedSize).toBe(15);
        expect(result.parentFillRatio).toBe(0.75);
        expect(result.childCount).toBe(2);

        // weighted average requested price: (100*10 + 100*10) / 20 = 100
        expect(result.weightedAverageRequestedPrice).toBe(100);

        // weighted average executed price: (105*5 + 102*10) / 15 = 1545 / 15 = 103
        expect(result.weightedAverageExecutedPrice).toBe(103);

        // weighted average slippage: (5*5 + 2*10) / 15 = 45 / 15 = 3
        expect(result.weightedAverageSlippage).toBe(3);

        // weighted average slippage bps: (500*5 + 200*10) / 15 = 4500 / 15 = 300
        expect(result.weightedAverageSlippageBps).toBe(300);

        expect(result.bestChildSlippageBps).toBe(200);
        expect(result.worstChildSlippageBps).toBe(500);

        expect(result.totalNotionalExecuted).toBe(1545);
    });

    it('Scenario: Missing prices handles gracefully', () => {
        const children: ChildExecutionTcaInput[] = [
            {
                requestedSize: 10,
                executedSize: 10,
                fillRatio: 1,
                sliceIndex: 0,
                totalSlices: 1
            }
        ];

        const result = executionTcaAggregatorService.aggregate(children);
        expect(result.totalRequestedSize).toBe(10);
        expect(result.totalExecutedSize).toBe(10);
        expect(result.parentFillRatio).toBe(1);
        expect(result.weightedAverageExecutedPrice).toBeNull();
        expect(result.weightedAverageSlippage).toBeNull();
    });
});
