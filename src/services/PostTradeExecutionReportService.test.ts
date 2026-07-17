import { describe, it, expect } from 'vitest';
import { postTradeExecutionReportService } from './PostTradeExecutionReportService';

describe('PostTradeExecutionReportService', () => {
    it('Scenario: Null input returns null', () => {
        expect(postTradeExecutionReportService.generateReport(null)).toBeNull();
    });

    it('Scenario: Valid trace generates full report', () => {
        const trace = {
            parentTcaSummary: {
                childCount: 2,
                totalRequestedSize: 10,
                totalExecutedSize: 10,
                parentFillRatio: 1.0,
                weightedAverageExecutedPrice: 105,
                weightedAverageRequestedPrice: 100,
                weightedAverageSlippage: 5,
                weightedAverageSlippageBps: 500,
                bestChildSlippageBps: 400,
                worstChildSlippageBps: 600,
                totalNotionalExecuted: 1050
            },
            timingPlanSummary: {
                dispatchMode: 'staggered',
                intervalMs: 500,
                totalSlices: 2,
                totalPlannedDurationMs: 500
            },
            executionQualityStatus: 'warning',
            executionQualityAlerts: [{ code: 'HIGH_SLIPPAGE' }],
            childDispatches: [
                {
                    sliceIndex: 0,
                    totalSlices: 2,
                    childSize: 5,
                    executionStyle: 'AGGRESSIVE',
                    routeHint: 'PRIMARY',
                    dispatchMode: 'staggered',
                    timingPolicy: 'fixed_interval',
                    intervalMs: 500,
                    scheduledAtOffsetMs: 0,
                    analytics: {
                        symbol: 'BTC-PERP',
                        side: 'BUY',
                        strategy: 'TEST',
                        requestedSize: 5,
                        executedSize: 5,
                        requestedPrice: 100,
                        executedPrice: 104,
                        fillRatio: 1,
                        slippage: 4,
                        slippageBps: 400,
                        notionalExecuted: 520
                    }
                },
                {
                    sliceIndex: 1,
                    totalSlices: 2,
                    childSize: 5,
                    executionStyle: 'AGGRESSIVE',
                    routeHint: 'PRIMARY',
                    dispatchMode: 'staggered',
                    timingPolicy: 'fixed_interval',
                    intervalMs: 500,
                    scheduledAtOffsetMs: 500,
                    analytics: {
                        symbol: 'BTC-PERP',
                        side: 'BUY',
                        strategy: 'TEST',
                        requestedSize: 5,
                        executedSize: 5,
                        requestedPrice: 100,
                        executedPrice: 106,
                        fillRatio: 1,
                        slippage: 6,
                        slippageBps: 600,
                        notionalExecuted: 530
                    }
                }
            ]
        };

        const report = postTradeExecutionReportService.generateReport(trace);
        expect(report).toBeDefined();
        expect(report!.reportVersion).toBe('1.0');
        expect(report!.generatedAt).toBeDefined();
        expect(report!.symbol).toBe('BTC-PERP');
        expect(report!.side).toBe('BUY');
        expect(report!.strategyId).toBe('TEST');
        expect(report!.executionStyle).toBe('AGGRESSIVE');
        expect(report!.routeHint).toBe('PRIMARY');
        expect(report!.childCount).toBe(2);
        expect(report!.totalRequestedSize).toBe(10);
        expect(report!.parentFillRatio).toBe(1.0);
        expect(report!.weightedAverageSlippageBps).toBe(500);
        expect(report!.executionQualityStatus).toBe('warning');
        expect(report!.executionQualityAlerts.length).toBe(1);
        expect(report!.children.length).toBe(2);

        const child0 = report!.children[0];
        expect(child0.sliceIndex).toBe(0);
        expect(child0.requestedPrice).toBe(100);
        expect(child0.scheduledAtOffsetMs).toBe(0);

        const child1 = report!.children[1];
        expect(child1.sliceIndex).toBe(1);
        expect(child1.executedPrice).toBe(106);
        expect(child1.scheduledAtOffsetMs).toBe(500);
    });

    it('Scenario: Missing analytics handles gracefully', () => {
         const trace = {
            parentTcaSummary: {},
            childDispatches: [
                { sliceIndex: 0, totalSlices: 1, childSize: 1 }
            ]
        };
        const report = postTradeExecutionReportService.generateReport(trace);
        expect(report).toBeDefined();
        expect(report!.children[0].requestedSize).toBeUndefined();
        expect(report!.executionQualityStatus).toBe('ok');
    });
});
